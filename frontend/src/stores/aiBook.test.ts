import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiBookStore } from './aiBook'
import { getAiModelConfig } from '../api/aiModel'
import type { AiServerModelConfigResponse } from '../types'

vi.mock('../api/aiModel', () => ({
  getAiModelConfig: vi.fn(),
}))

const getAiModelConfigMock = vi.mocked(getAiModelConfig)

describe('aiBook store server model config', () => {
  beforeEach(() => {
    installLocalStorage()
    setActivePinia(createPinia())
    getAiModelConfigMock.mockReset()
  })

  it('reuses the loaded server model config for repeated checks', async () => {
    const response = createServerModelConfigResponse()
    getAiModelConfigMock.mockResolvedValue(response)
    const store = useAiBookStore()

    await expect(store.loadServerModelConfig()).resolves.toEqual(response)
    await expect(store.loadServerModelConfig()).resolves.toEqual(response)

    expect(getAiModelConfigMock).toHaveBeenCalledTimes(1)
  })

  it('defaults to the backend models when the user has backend access and nothing saved', async () => {
    getAiModelConfigMock.mockResolvedValue(createServerModelConfigResponse())
    const store = useAiBookStore()
    expect(store.config.modelSource).toBe('browser')

    await store.loadServerModelConfig()
    expect(store.config.modelSource).toBe('server')
    expect(store.refreshConfig().modelSource).toBe('server')
  })

  it('keeps an explicitly saved personal config', async () => {
    getAiModelConfigMock.mockResolvedValue(createServerModelConfigResponse())
    const store = useAiBookStore()
    store.persistConfig({ ...store.config, modelSource: 'browser', textBaseUrl: 'https://my.example.com' })

    await store.loadServerModelConfig()
    expect(store.config.modelSource).toBe('browser')
  })

  it('stays on the personal config without backend access', async () => {
    getAiModelConfigMock.mockResolvedValue({ ...createServerModelConfigResponse(), canUseServerModel: false })
    const store = useAiBookStore()

    await store.loadServerModelConfig()
    expect(store.config.modelSource).toBe('browser')
  })
})

function createServerModelConfigResponse(): AiServerModelConfigResponse {
  return {
    canUseServerModel: true,
    isAdmin: false,
    config: {
      text: {
        enabled: true,
        baseUrl: 'https://api.example.com',
        apiKey: '',
        model: 'gpt-4o-mini',
        useFullUrl: false,
      },
      image: {
        enabled: true,
        baseUrl: 'https://api.example.com',
        apiKey: '',
        model: 'gpt-image-1',
        imageSize: '1024x1024',
        useFullUrl: false,
      },
      speech: {
        enabled: true,
        baseUrl: 'https://api.example.com',
        apiKey: '',
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        responseFormat: 'mp3',
        useFullUrl: false,
      },
    },
  }
}

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
