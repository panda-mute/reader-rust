import { summarizeHttpErrorBody } from './httpError'
import { buildReaderAuthHeaders } from './secureAccess'

export const DEFAULT_OPENAI_BASE_URL = ''

export function normalizeOpenAIBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '')
}

export function buildOpenAISpeechUrl(baseUrl: string, fullUrl = false) {
  const normalized = normalizeOpenAIBaseUrl(baseUrl)
  if (!normalized) return ''
  return fullUrl ? normalized : `${normalized}/v1/audio/speech`
}

export interface OpenAISpeechRequest {
  // browser: call the endpoint directly; server: saved backend config;
  // proxy: backend forwards to the given baseUrl/apiKey (used to test unsaved configs).
  source?: 'browser' | 'server' | 'proxy'
  baseUrl: string
  fullUrl?: boolean
  apiKey?: string
  input: string
  model: string
  voice: string
  format?: string
  speed?: number
  signal?: AbortSignal
}

function buildAuthHeaders(apiKey?: string) {
  const headers: Record<string, string> = {}
  if (!apiKey?.trim()) return headers
  headers.Authorization = `Bearer ${apiKey.trim()}`
  return headers
}

async function readSpeechError(response: Response) {
  const fallback = `语音请求失败 (${response.status})`
  const contentType = response.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const data = await response.json() as {
        error?: {
          message?: string
        }
      }
      return data.error?.message || fallback
    }

    const text = (await response.text()).trim()
    return summarizeHttpErrorBody(text, { fallback, status: response.status })
  } catch {
    return fallback
  }
}

export async function requestOpenAISpeechAudio({
  source = 'browser',
  baseUrl,
  apiKey,
  input,
  model,
  voice,
  format,
  speed,
  fullUrl = false,
  signal,
}: OpenAISpeechRequest) {
  const body = {
    model,
    input,
    voice,
    response_format: format || 'mp3',
    speed,
  }
  const response = source === 'server'
    ? await fetch('/reader3/aiProxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildReaderAuthHeaders(),
      },
      body: JSON.stringify({
        useServerConfig: true,
        kind: 'speech',
        path: '/v1/audio/speech',
        body,
      }),
      signal,
    })
    : source === 'proxy'
    ? await fetch('/reader3/aiProxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildReaderAuthHeaders(),
      },
      body: JSON.stringify({
        baseUrl: normalizeOpenAIBaseUrl(baseUrl),
        apiKey: apiKey?.trim() || undefined,
        path: '/v1/audio/speech',
        fullUrl,
        body,
      }),
      signal,
    })
    : await fetch(buildOpenAISpeechUrl(baseUrl, fullUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(apiKey),
      },
      body: JSON.stringify(body),
      signal,
    })

  if (!response.ok) {
    throw new Error(await readSpeechError(response))
  }

  return response.blob()
}
