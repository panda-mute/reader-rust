use crate::model::ai_model::AiModelKind;
use serde::Deserialize;
use serde_json::Value;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::Duration;
use url::{Host, Url};

const AI_PROXY_TIMEOUT_SECS: u64 = 300;
pub const ALLOWED_PROXY_PATHS: [&str; 3] = [
    "/v1/chat/completions",
    "/v1/images/generations",
    "/v1/audio/speech",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProxyRequest {
    #[serde(default)]
    pub base_url: String,
    pub api_key: Option<String>,
    pub path: String,
    #[serde(default)]
    pub full_url: bool,
    #[serde(default)]
    pub use_server_config: bool,
    pub kind: Option<AiModelKind>,
    pub body: Value,
}

#[derive(Debug, Deserialize)]
pub struct AiProxyImageRequest {
    pub url: String,
}

pub fn build_ai_proxy_url(base_url: &str, path: &str, full_url: bool) -> Result<Url, String> {
    if full_url {
        return parse_http_url(base_url);
    }

    if !ALLOWED_PROXY_PATHS.contains(&path) {
        return Err(format!("unsupported proxy path: {}", path));
    }

    let mut base = parse_http_url(base_url)?;
    let joined_path = format!("{}{}", base.path().trim_end_matches('/'), path,);
    base.set_path(&joined_path);
    base.set_query(None);
    base.set_fragment(None);
    Ok(base)
}

pub fn validate_ai_proxy_image_url(url: &str) -> Result<Url, String> {
    parse_http_url(url)
}

pub fn allow_private_proxy_hosts_from_env() -> bool {
    std::env::var("AI_PROXY_ALLOW_PRIVATE_HOSTS")
        .ok()
        .map(|v| matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

pub fn is_restricted_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_restricted_ipv4(v4),
        IpAddr::V6(v6) => is_restricted_ipv6(v6),
    }
}

fn is_restricted_ipv4(v4: Ipv4Addr) -> bool {
    let octets = v4.octets();
    v4.is_loopback()
        || v4.is_private()
        || v4.is_link_local()
        || v4.is_broadcast()
        || v4.is_documentation()
        || v4.is_unspecified()
        || v4.is_multicast()
        // Shared Address Space (CGNAT) 100.64.0.0/10
        || (octets[0] == 100 && (octets[1] & 0b1100_0000) == 64)
}

fn is_restricted_ipv6(v6: Ipv6Addr) -> bool {
    if let Some(mapped) = v6.to_ipv4_mapped() {
        return is_restricted_ipv4(mapped);
    }
    let seg0 = v6.segments()[0];
    v6.is_loopback()
        || v6.is_unspecified()
        || v6.is_multicast()
        // Unique local addresses fc00::/7
        || (seg0 & 0xfe00) == 0xfc00
        // Link-local fe80::/10
        || (seg0 & 0xffc0) == 0xfe80
}

pub fn validate_proxy_url_host(url: &Url, allow_private: bool) -> Result<(), String> {
    if allow_private {
        return Ok(());
    }
    let Some(host) = url.host() else {
        return Err("代理目标缺少有效主机名".to_string());
    };
    match host {
        Host::Ipv4(ip) => {
            if is_restricted_ipv4(ip) {
                return Err("不允许通过代理访问内网或本机地址".to_string());
            }
        }
        Host::Ipv6(ip) => {
            if is_restricted_ipv6(ip) {
                return Err("不允许通过代理访问内网或本机地址".to_string());
            }
        }
        Host::Domain(domain) => {
            let lower = domain.trim().trim_end_matches('.').to_ascii_lowercase();
            if lower == "localhost"
                || lower.ends_with(".localhost")
                || lower.ends_with(".local")
                || lower.ends_with(".internal")
                || lower == "metadata.google.internal"
            {
                return Err("不允许通过代理访问内网或本机地址".to_string());
            }
        }
    }
    Ok(())
}

pub fn ai_proxy_timeout() -> Duration {
    Duration::from_secs(AI_PROXY_TIMEOUT_SECS)
}

pub fn format_ai_proxy_upstream_error(status: u16, body: &str) -> String {
    let reason = http::StatusCode::from_u16(status)
        .ok()
        .and_then(|status| status.canonical_reason())
        .unwrap_or("Upstream Error");
    let detail = extract_error_detail(body);
    if detail.is_empty() {
        return format!("模型服务返回 {} {}", status, reason);
    }
    format!("模型服务返回 {} {}：{}", status, reason, detail)
}

fn parse_http_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|e| e.to_string())?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err("only http/https proxy targets are supported".to_string()),
    }
}

fn extract_error_detail(body: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        if let Some(message) = value
            .pointer("/error/message")
            .or_else(|| value.get("errorMsg"))
            .or_else(|| value.get("message"))
            .and_then(Value::as_str)
        {
            return truncate_error_detail(message);
        }
    }

    truncate_error_detail(&strip_html_tags(body))
}

fn strip_html_tags(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_error_detail(value: &str) -> String {
    let cleaned = value.trim();
    if cleaned.chars().count() <= 240 {
        return cleaned.to_string();
    }
    let mut result = cleaned.chars().take(240).collect::<String>();
    result.push('…');
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_loopback_private_and_metadata_targets_by_default() {
        for blocked in [
            "http://127.0.0.1:8080/v1/chat/completions",
            "http://localhost:8825/v1/audio/speech",
            "http://169.254.169.254/latest/meta-data/",
            "http://10.0.0.1/api",
            "http://192.168.1.5:11434/v1/chat/completions",
            "http://[::1]:8080/test",
            "http://host.docker.internal:8880/v1/audio/speech",
        ] {
            let url = Url::parse(blocked).unwrap();
            assert!(
                validate_proxy_url_host(&url, false).is_err(),
                "expected {blocked} to be blocked"
            );
            assert!(
                validate_proxy_url_host(&url, true).is_ok(),
                "expected {blocked} to be allowed when allow_private=true"
            );
        }

        let public_url = Url::parse("https://api.openai.com/v1/chat/completions").unwrap();
        assert!(validate_proxy_url_host(&public_url, false).is_ok());
    }
}
