import { summarizeHttpErrorBody } from './httpError'
import { requestMimoSpeechAudio } from './mimoSpeech'
import { requestOpenAISpeechAudio } from './openaiSpeech'

/**
 * How a test request reaches the model:
 * - direct: the browser calls the model service itself
 * - proxy:  the reader backend forwards to the given URL/key (key is not stored)
 * - server: the reader backend uses the saved admin configuration
 */
export type ModelRoute = 'direct' | 'proxy' | 'server'

export interface ModelEndpoint {
  baseUrl: string
  apiKey: string
  model: string
  fullUrl: boolean
}

export interface ModelTestResult {
  message: string
  elapsedMs: number
  audio?: Blob
  imageUrl?: string
}

export interface SpeechTestParams extends ModelEndpoint {
  engine: 'openai' | 'mimo'
  voice: string
  format: string
  prompt?: string
}

const TEXT_TIMEOUT_MS = 30_000
const IMAGE_TIMEOUT_MS = 180_000
const SPEECH_TIMEOUT_MS = 60_000
const SPEECH_TEST_TEXT = '你好，这是一段测试语音。'

type ModelPath = '/v1/chat/completions' | '/v1/images/generations'

export function normalizeModelBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '')
}

/** The URL a request will actually hit, shown under the Base URL field. */
export function describeModelRequestUrl(baseUrl: string, fullUrl: boolean, path: string) {
  const base = normalizeModelBaseUrl(baseUrl)
  if (!base) return ''
  return fullUrl ? base : `${base}${path}`
}

export async function testTextModel(route: ModelRoute, endpoint: ModelEndpoint): Promise<ModelTestResult> {
  ensureEndpoint(route, endpoint)
  const json = await runModelRequest(route, endpoint, 'text', '/v1/chat/completions', {
    model: endpoint.model.trim(),
    messages: [{ role: 'user', content: '这是一次连接测试，请只回复 OK。' }],
    max_tokens: 16,
    temperature: 0,
  }, TEXT_TIMEOUT_MS)
  const reply = readChatReply(json.data)
  return {
    elapsedMs: json.elapsedMs,
    message: reply ? `连接正常，模型回复「${reply}」` : '连接正常',
  }
}

export async function testImageModel(
  route: ModelRoute,
  endpoint: ModelEndpoint & { size: string },
): Promise<ModelTestResult> {
  ensureEndpoint(route, endpoint)
  const json = await runModelRequest(route, endpoint, 'image', '/v1/images/generations', {
    model: endpoint.model.trim(),
    prompt: 'A minimal flat icon of an open book on a plain white background.',
    size: endpoint.size || '1024x1024',
    n: 1,
  }, IMAGE_TIMEOUT_MS)
  const image = readImage(json.data)
  if (!image) {
    throw new Error('请求成功，但返回里没有图片数据，请检查模型是否支持图片生成')
  }
  return { elapsedMs: json.elapsedMs, message: '连接正常，已生成测试图片', imageUrl: image }
}

export async function testSpeechModel(route: ModelRoute, params: SpeechTestParams): Promise<ModelTestResult> {
  ensureEndpoint(route, params)
  const started = now()
  const { signal, done } = createTimeout(SPEECH_TIMEOUT_MS)
  const source = route === 'server' ? 'server' : route === 'proxy' ? 'proxy' : 'browser'
  try {
    const audio = params.engine === 'mimo'
      ? await requestMimoSpeechAudio({
        source,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        fullUrl: params.fullUrl,
        input: SPEECH_TEST_TEXT,
        model: params.model,
        voice: params.voice,
        format: params.format === 'mp3' ? 'mp3' : 'wav',
        prompt: params.prompt,
        signal,
      })
      : await requestOpenAISpeechAudio({
        source,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        fullUrl: params.fullUrl,
        input: SPEECH_TEST_TEXT,
        model: params.model,
        voice: params.voice,
        format: params.format,
        signal,
      })
    if (!audio.size) throw new Error('请求成功，但返回的音频为空')
    return { elapsedMs: now() - started, message: '连接正常，正在播放测试语音', audio }
  } catch (error) {
    throw new Error(describeFailure(error, route, SPEECH_TIMEOUT_MS))
  } finally {
    done()
  }
}

function ensureEndpoint(route: ModelRoute, endpoint: ModelEndpoint) {
  if (route === 'server') return
  if (!normalizeModelBaseUrl(endpoint.baseUrl)) throw new Error('请先填写 Base URL')
  if (!/^https?:\/\//i.test(endpoint.baseUrl.trim())) throw new Error('Base URL 需要以 http:// 或 https:// 开头')
  if (!endpoint.model.trim()) throw new Error('请先填写模型名称')
}

async function runModelRequest(
  route: ModelRoute,
  endpoint: ModelEndpoint,
  kind: 'text' | 'image',
  path: ModelPath,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const started = now()
  const { signal, done } = createTimeout(timeoutMs)
  try {
    const response = await postModel(route, endpoint, kind, path, body, signal)
    if (!response.ok) {
      throw new Error(await readModelError(response))
    }
    const data = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!data) throw new Error('模型服务返回的不是 JSON，请检查 Base URL 和完整链接设置')
    if (data.isSuccess === false) {
      throw new Error(String(data.errorMsg || '请求失败'))
    }
    return { data, elapsedMs: now() - started }
  } catch (error) {
    throw new Error(describeFailure(error, route, timeoutMs))
  } finally {
    done()
  }
}

function postModel(
  route: ModelRoute,
  endpoint: ModelEndpoint,
  kind: 'text' | 'image',
  path: ModelPath,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  if (route === 'server') {
    return fetch('/reader3/aiProxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...readerAuthHeaders() },
      body: JSON.stringify({ useServerConfig: true, kind, path, body }),
      signal,
    })
  }
  if (route === 'proxy') {
    return fetch('/reader3/aiProxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...readerAuthHeaders() },
      body: JSON.stringify({
        baseUrl: normalizeModelBaseUrl(endpoint.baseUrl),
        apiKey: endpoint.apiKey.trim() || undefined,
        path,
        fullUrl: endpoint.fullUrl,
        body,
      }),
      signal,
    })
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (endpoint.apiKey.trim()) headers.Authorization = `Bearer ${endpoint.apiKey.trim()}`
  return fetch(describeModelRequestUrl(endpoint.baseUrl, endpoint.fullUrl, path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
}

async function readModelError(response: Response) {
  const fallback = `请求失败 (${response.status})`
  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await response.json() as { error?: { message?: string } | string; errorMsg?: string; message?: string }
      const error = typeof data.error === 'string' ? data.error : data.error?.message
      return error || data.errorMsg || data.message || fallback
    }
    return summarizeHttpErrorBody(await response.text(), { fallback, status: response.status })
  } catch {
    return fallback
  }
}

function describeFailure(error: unknown, route: ModelRoute, timeoutMs: number) {
  const err = error as Error
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
    return `请求超时（${Math.round(timeoutMs / 1000)} 秒没有响应）`
  }
  // fetch() rejects with a TypeError when the request never got a response (DNS, CORS, offline).
  if (err instanceof TypeError && route === 'direct') {
    return '无法连接到模型服务：地址错误、网络不通，或被浏览器跨域限制。可以开启「使用后端代理调用模型」再试。'
  }
  if (err instanceof TypeError) {
    return '无法连接到阅读服务器，请检查网络'
  }
  return err?.message || '请求失败'
}

function readChatReply(data: Record<string, unknown>) {
  const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined
  const content = choices?.[0]?.message?.content
  if (typeof content !== 'string') return ''
  const text = content.replace(/\s+/g, ' ').trim()
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

function readImage(data: Record<string, unknown>) {
  const items = data.data as Array<{ b64_json?: string; url?: string }> | undefined
  const first = items?.[0]
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`
  return first?.url || ''
}

function createTimeout(ms: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

function readerAuthHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('accessToken') || ''
    return token ? { Authorization: token } : {}
  } catch {
    return {}
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
