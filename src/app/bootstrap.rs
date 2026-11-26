use axum::Router;
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

use crate::api::{self, AppState};
use crate::app::config;
use crate::crawler::http_client::HttpClient;
use crate::parser::rule_engine::RuleEngine;
use crate::service::{
    ai_book_service::AiBookService, ai_model_service::AiModelService,
    book_group_service::BookGroupService, book_service::BookService,
    book_source_service::BookSourceService, json_document_service::JsonDocumentService,
    local_epub_book::LocalEpubBookService, local_txt_book::LocalTxtBookService,
    update_service::UpdateService, user_service::UserService,
};
use crate::storage::{cache::file_cache::FileCache, db, fs::storage_fs::StorageFs};

pub async fn run() -> anyhow::Result<()> {
    let cfg = config::load()?;

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new(cfg.log_level.clone()))
        .init();

    tracing::info!(
        "config loaded: addr={}:{}",
        cfg.server_host,
        cfg.server_port
    );

    let storage_fs = StorageFs::new(&cfg.storage_dir, &cfg.assets_dir);
    storage_fs.ensure().await?;

    let pool = db::init_pool(&cfg.database_url).await?;
    let repo = db::repo::BookSourceRepo::new(pool.clone());

    let http = HttpClient::new(cfg.request_timeout_secs, None)?;
    let parser = RuleEngine::new()?;
    let cache = FileCache::new(format!("{}/cache", cfg.storage_dir));

    let book_service = Arc::new(BookService::new(http, parser, cache, &cfg.storage_dir));
    let book_source_service = Arc::new(BookSourceService::new(repo, &cfg.storage_dir));
    let local_txt_book_service = Arc::new(LocalTxtBookService::new(&cfg.storage_dir));
    let local_epub_book_service = Arc::new(LocalEpubBookService::new(&cfg.storage_dir));
    let json_document_service = Arc::new(JsonDocumentService::new(pool.clone(), &cfg.storage_dir));
    let user_service = Arc::new(UserService::new(cfg.clone(), pool.clone()));
    user_service.migrate_legacy_users_from_json().await?;
    let book_group_service = Arc::new(BookGroupService::new(json_document_service.clone()));
    let ai_book_service = Arc::new(AiBookService::new(pool.clone(), &cfg.storage_dir));
    let ai_model_service = Arc::new(AiModelService::new(
        json_document_service.clone(),
        &cfg.storage_dir,
    ));
    let update_service = Arc::new(UpdateService::new(
        json_document_service.clone(),
        cfg.request_timeout_secs,
        format!("v{}", env!("CARGO_PKG_VERSION")),
    )?);

    let ai_proxy_timeout = crate::model::ai_proxy::ai_proxy_timeout();
    let ai_proxy_client = reqwest::Client::builder()
        .timeout(ai_proxy_timeout)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.error("too many redirects");
            }
            if let Err(err) =
                crate::model::ai_proxy::validate_proxy_url_host(attempt.url(), false)
            {
                return attempt.error(err);
            }
            attempt.follow()
        }))
        .build()?;
    let ai_proxy_client_allow_private = reqwest::Client::builder()
        .timeout(ai_proxy_timeout)
        .build()?;

    let state = AppState {
        config: cfg.clone(),
        book_service,
        book_source_service,
        user_service,
        book_group_service,
        local_txt_book_service,
        local_epub_book_service,
        json_document_service,
        ai_book_service,
        ai_model_service,
        update_service,
        ai_proxy_client,
        ai_proxy_client_allow_private,
    };

    let app: Router = api::router::build_router(state);

    let addr = SocketAddr::new(cfg.server_host.parse()?, cfg.server_port);
    tracing::info!("listening on {}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await?, app).await?;
    Ok(())
}
