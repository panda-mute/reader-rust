import { summarizeHttpErrorBody } from './httpError'

export const DEFAULT_MIMO_BASE_URL = 'https://api.xiaomimimo.com'
export const DEFAULT_MIMO_MODEL = 'mimo-v2.5-tts'
export const DEFAULT_MIMO_VOICE = 'mimo_default'
export const DEFAULT_MIMO_FORMAT = 'wav'

export const MIMO_MODELS = [
  'mimo-v2.5-tts',
  'mimo-v2.5-tts-voicedesign',
  'mimo-v2.5-tts-voiceclone',
] as const

export const MIMO_PRESET_VOICES = [
  { value: 'mimo_default', label: '默认音色 (mimo_default)' },
  { value: '冰糖', label: '冰糖 (温柔女声)' },
  { value: '茉莉', label: '茉莉 (知性女声)' },
  { value: '苏打', label: '苏打 (阳光男声)' },
  { value: '白桦', label: '白桦 (沉稳男声)' },
  { value: 'Mia', label: 'Mia (自然英文女声)' },
  { value: 'Chloe', label: 'Chloe (亲切英文女声)' },
  { value: 'Milo', label: 'Milo (活力英文男声)' },
  { value: 'Dean', label: 'Dean (沉稳英文男声)' },
] as const

export interface MimoSpeechRequest {
  source?: 'browser' | 'server'
  baseUrl: string
  apiKey?: string
  input: string
  model?: string
  voice?: string
  format?: 'wav' | 'mp3'
  prompt?: string
  speed?: number
  signal?: AbortSignal
}

export function normalizeMimoBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '')
}

export function buildMimoChatUrl(baseUrl: string) {
  const normalized = normalizeMimoBaseUrl(baseUrl)
  if (normalized.endsWith('/v1/chat/completions')) {
    return normalized
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized}/chat/completions`
  }
  return `${normalized}/v1/chat/completions`
}

export function describeSpeechRate(rate: number): string {
  if (rate <= 0.6) return '语速极慢'
  if (rate <= 0.8) return '语速较慢'
  if (rate <= 0.95) return '语速稍慢'
  if (rate <= 1.05) return ''
  if (rate <= 1.15) return '语速稍快'
  if (rate <= 1.35) return '语速较快'
  return '语速极快'
}

export function buildMimoPrompt(basePrompt?: string, speechRate?: number): string {
  const parts: string[] = []
  const trimmed = basePrompt?.trim()
  if (trimmed) {
    parts.push(trimmed)
  }
  if (speechRate && Math.abs(speechRate - 1.0) >= 0.05) {
    const rateDesc = describeSpeechRate(speechRate)
    const alreadyHasSpeed = trimmed && (
      trimmed.includes('慢') || trimmed.includes('快') || trimmed.includes('语速')
    )
    if (!alreadyHasSpeed && rateDesc) {
      parts.push(rateDesc)
    }
  }
  return parts.join('，')
}

export function buildMimoRequestBody({
  input,
  model = DEFAULT_MIMO_MODEL,
  voice = DEFAULT_MIMO_VOICE,
  format = 'wav',
  prompt,
  speed,
}: {
  input: string
  model?: string
  voice?: string
  format?: 'wav' | 'mp3'
  prompt?: string
  speed?: number
}) {
  const resolvedModel = model.trim() || DEFAULT_MIMO_MODEL
  const isVoiceDesign = resolvedModel.includes('voicedesign')
  const combinedPrompt = buildMimoPrompt(prompt, speed)

  const messages: Array<{ role: string; content: string }> = []
  if (combinedPrompt || isVoiceDesign) {
    messages.push({
      role: 'user',
      content: combinedPrompt || '自然生动的声音',
    })
  }
  messages.push({
    role: 'assistant',
    content: input,
  })

  const audio: { format: string; voice?: string } = {
    format: format || 'wav',
  }
  if (!isVoiceDesign && voice?.trim()) {
    audio.voice = voice.trim()
  }

  return {
    model: resolvedModel,
    messages,
    audio,
  }
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const cleaned = base64.replace(/\s+/g, '')
  const binaryString = atob(cleaned)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

function buildAuthHeaders(apiKey?: string) {
  const headers: Record<string, string> = {}
  if (!apiKey?.trim()) return headers
  headers.Authorization = `Bearer ${apiKey.trim()}`
  return headers
}

function buildReaderAuthHeaders() {
  const headers: Record<string, string> = {}
  try {
    const token = localStorage.getItem('accessToken') || ''
    if (token) headers.Authorization = token
  } catch {
    // ignore storage access failures
  }
  return headers
}

async function readMimoError(response: Response) {
  const fallback = `小米 MiMo 语音请求失败 (${response.status})`
  const contentType = response.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const data = await response.json() as {
        error?: {
          message?: string
        }
        errorMsg?: string
        message?: string
      }
      return data.error?.message || data.errorMsg || data.message || fallback
    }

    const text = (await response.text()).trim()
    return summarizeHttpErrorBody(text, { fallback, status: response.status })
  } catch {
    return fallback
  }
}

export async function requestMimoSpeechAudio({
  source = 'browser',
  baseUrl,
  apiKey,
  input,
  model,
  voice,
  format = 'wav',
  prompt,
  speed,
  signal,
}: MimoSpeechRequest): Promise<Blob> {
  const body = buildMimoRequestBody({
    input,
    model,
    voice,
    format,
    prompt,
    speed,
  })

  let response: Response

  if (source === 'server') {
    response = await fetch('/reader3/aiProxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildReaderAuthHeaders(),
      },
      body: JSON.stringify({
        useServerConfig: true,
        kind: 'speech',
        path: '/v1/chat/completions',
        body,
      }),
      signal,
    })
  } else {
    const chatUrl = buildMimoChatUrl(baseUrl || DEFAULT_MIMO_BASE_URL)
    const directHeaders = {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(apiKey),
    }

    try {
      response = await fetch(chatUrl, {
        method: 'POST',
        headers: directHeaders,
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw error
      try {
        response = await fetch('/reader3/aiProxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildReaderAuthHeaders(),
          },
          body: JSON.stringify({
            baseUrl: normalizeMimoBaseUrl(baseUrl || DEFAULT_MIMO_BASE_URL),
            apiKey: apiKey?.trim() || undefined,
            path: '/v1/chat/completions',
            body,
          }),
          signal,
        })
      } catch {
        throw error
      }
    }
  }

  if (!response.ok) {
    throw new Error(await readMimoError(response))
  }

  const json = await response.json() as {
    choices?: Array<{
      message?: {
        audio?: {
          data?: string
        }
      }
    }>
    message?: {
      audio?: {
        data?: string
      }
    }
    audio?: {
      data?: string
    }
    error?: {
      message?: string
    }
  }

  const base64Data = json?.choices?.[0]?.message?.audio?.data
    || json?.message?.audio?.data
    || json?.audio?.data

  if (!base64Data) {
    const errorMsg = json?.error?.message || '未能从小米 MiMo 返回中获取音频数据'
    throw new Error(errorMsg)
  }

  const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
  return base64ToBlob(base64Data, mimeType)
}
