import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeModelRequestUrl, testSpeechModel, testTextModel } from './aiModelTest'

const endpoint = { baseUrl: 'https://api.example.com/', apiKey: ' sk-test ', model: 'gpt-4o-mini', fullUrl: false }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('AI model connection tests', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('localStorage', { getItem: () => 'reader-token' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('describes the URL a request will hit', () => {
    expect(describeModelRequestUrl('https://api.example.com/', false, '/v1/chat/completions'))
      .toBe('https://api.example.com/v1/chat/completions')
    expect(describeModelRequestUrl('https://x.com/custom/chat', true, '/v1/chat/completions'))
      .toBe('https://x.com/custom/chat')
    expect(describeModelRequestUrl('  ', false, '/v1/chat/completions')).toBe('')
  })

  it('calls the model directly and reports its reply', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'OK' } }] }))

    const result = await testTextModel('direct', endpoint)

    expect(result.message).toBe('连接正常，模型回复「OK」')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    expect(JSON.parse(init.body).model).toBe('gpt-4o-mini')
  })

  it('sends draft settings through the reader proxy', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'OK' } }] }))

    await testTextModel('proxy', { ...endpoint, fullUrl: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/reader3/aiProxy')
    expect(init.headers.Authorization).toBe('reader-token')
    expect(JSON.parse(init.body)).toMatchObject({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      path: '/v1/chat/completions',
      fullUrl: true,
    })
  })

  it('uses the saved backend config without sending any endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'OK' } }] }))

    await testTextModel('server', { baseUrl: '', apiKey: '', model: '', fullUrl: false })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ useServerConfig: true, kind: 'text' })
  })

  it('shows the upstream error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Incorrect API key provided' } }, 401))

    await expect(testTextModel('direct', endpoint)).rejects.toThrow('Incorrect API key provided')
  })

  it('surfaces backend proxy errors returned as isSuccess=false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ isSuccess: false, errorMsg: '模型服务返回 404 Not Found' }))

    await expect(testTextModel('proxy', endpoint)).rejects.toThrow('模型服务返回 404 Not Found')
  })

  it('suggests the proxy when the browser cannot reach the model', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(testTextModel('direct', endpoint)).rejects.toThrow('使用后端代理调用模型')
  })

  it('validates the form before sending anything', async () => {
    await expect(testTextModel('direct', { ...endpoint, baseUrl: '' })).rejects.toThrow('请先填写 Base URL')
    await expect(testTextModel('direct', { ...endpoint, baseUrl: 'api.example.com' })).rejects.toThrow('http://')
    await expect(testTextModel('direct', { ...endpoint, model: ' ' })).rejects.toThrow('请先填写模型名称')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns playable audio for a speech test through the proxy', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['mp3-bytes']), { status: 200 }))

    const result = await testSpeechModel('proxy', {
      ...endpoint,
      engine: 'openai',
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      format: 'mp3',
    })

    expect(result.audio?.size).toBeGreaterThan(0)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      path: '/v1/audio/speech',
      body: { model: 'gpt-4o-mini-tts', voice: 'alloy', response_format: 'mp3' },
    })
  })
})
