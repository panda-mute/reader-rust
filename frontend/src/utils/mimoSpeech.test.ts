import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildMimoChatUrl,
  buildMimoPrompt,
  buildMimoRequestBody,
  describeSpeechRate,
  requestMimoSpeechAudio,
} from './mimoSpeech'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mimoSpeech', () => {
  it('normalizes chat endpoint url correctly', () => {
    expect(buildMimoChatUrl('https://api.xiaomimimo.com')).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    expect(buildMimoChatUrl('https://api.xiaomimimo.com/')).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    expect(buildMimoChatUrl('https://api.xiaomimimo.com/v1')).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    expect(buildMimoChatUrl('https://api.xiaomimimo.com/v1/chat/completions')).toBe('https://api.xiaomimimo.com/v1/chat/completions')
  })

  it('maps speech rate to natural language descriptions', () => {
    expect(describeSpeechRate(0.5)).toBe('语速极慢')
    expect(describeSpeechRate(0.8)).toBe('语速较慢')
    expect(describeSpeechRate(0.9)).toBe('语速稍慢')
    expect(describeSpeechRate(1.0)).toBe('')
    expect(describeSpeechRate(1.1)).toBe('语速稍快')
    expect(describeSpeechRate(1.2)).toBe('语速较快')
    expect(describeSpeechRate(1.5)).toBe('语速极快')
  })

  it('builds combined prompt without duplicating existing speed keywords', () => {
    expect(buildMimoPrompt('温柔坚定', 1.0)).toBe('温柔坚定')
    expect(buildMimoPrompt('温柔坚定', 0.8)).toBe('温柔坚定，语速较慢')
    expect(buildMimoPrompt('温柔坚定、稍慢、带点疲惫', 0.8)).toBe('温柔坚定、稍慢、带点疲惫')
    expect(buildMimoPrompt('', 1.2)).toBe('语速较快')
  })

  it('builds request body with assistant message containing text and user message containing prompt', () => {
    const body = buildMimoRequestBody({
      input: '第一章内容',
      model: 'mimo-v2.5-tts',
      voice: '冰糖',
      format: 'wav',
      prompt: '温柔坚定',
      speed: 1.0,
    })

    expect(body.model).toBe('mimo-v2.5-tts')
    expect(body.messages).toEqual([
      { role: 'user', content: '温柔坚定' },
      { role: 'assistant', content: '第一章内容' },
    ])
    expect(body.audio).toEqual({
      voice: '冰糖',
      format: 'wav',
    })
  })

  it('omits voice in audio object for voicedesign models', () => {
    const body = buildMimoRequestBody({
      input: '设计音色朗读',
      model: 'mimo-v2.5-tts-voicedesign',
      voice: 'mimo_default',
      format: 'mp3',
      prompt: '沧桑的老人声音',
    })

    expect(body.model).toBe('mimo-v2.5-tts-voicedesign')
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: '沧桑的老人声音',
    })
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: '设计音色朗读',
    })
    expect(body.audio).toEqual({
      format: 'mp3',
    })
    expect(body.audio).not.toHaveProperty('voice')
  })

  it('routes server configured mimo speech through aiProxy and extracts base64 audio', async () => {
    installLocalStorage()
    localStorage.setItem('accessToken', 'test-token')

    // Sample base64 audio representation
    const sampleBase64 = btoa('RIFF....WAVEfmt ')
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              audio: {
                data: sampleBase64,
              },
            },
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const blob = await requestMimoSpeechAudio({
      source: 'server',
      baseUrl: 'https://api.xiaomimimo.com',
      input: '测试朗读文本',
      model: 'mimo-v2.5-tts',
      voice: 'mimo_default',
      format: 'wav',
      prompt: '稍快',
    })

    expect(blob.type).toBe('audio/wav')
    expect(fetchMock).toHaveBeenCalledWith(
      '/reader3/aiProxy',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'test-token',
          'Content-Type': 'application/json',
        }),
      }),
    )
    const init = fetchMock.mock.calls[0]?.[1] as unknown as RequestInit
    const parsed = JSON.parse(String(init.body))
    expect(parsed).toMatchObject({
      useServerConfig: true,
      kind: 'speech',
      path: '/v1/chat/completions',
      body: {
        model: 'mimo-v2.5-tts',
        audio: {
          voice: 'mimo_default',
          format: 'wav',
        },
      },
    })
    expect(parsed.body.messages[1].content).toBe('测试朗读文本')
  })

  it('falls back to backend proxy when browser direct fetch encounters network/CORS error', async () => {
    installLocalStorage()
    const sampleBase64 = btoa('mock-audio-data')
    let callCount = 0

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      callCount += 1
      if (callCount === 1) {
        // First call is direct fetch which fails due to CORS (TypeError)
        throw new TypeError('Failed to fetch')
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          choices: [{ message: { audio: { data: sampleBase64 } } }],
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const blob = await requestMimoSpeechAudio({
      source: 'browser',
      baseUrl: 'https://api.xiaomimimo.com',
      apiKey: 'my-mimo-key',
      input: '测试回退代理',
      format: 'mp3',
    })

    expect(blob.type).toBe('audio/mpeg')
    expect(callCount).toBe(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/reader3/aiProxy')
    const proxyInit = fetchMock.mock.calls[1]?.[1] as unknown as RequestInit
    const parsed = JSON.parse(String(proxyInit.body))
    expect(parsed.baseUrl).toBe('https://api.xiaomimimo.com')
    expect(parsed.apiKey).toBe('my-mimo-key')
    expect(parsed.path).toBe('/v1/chat/completions')
  })
})

function installLocalStorage() {
  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
      clear: () => memory.clear(),
    },
    configurable: true,
  })
}
