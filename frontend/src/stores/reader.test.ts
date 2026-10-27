import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './app'
import { useAiBookStore } from './aiBook'
import { useReaderStore } from './reader'
import { getBookContent } from '../api/bookshelf'
import { getBrowserCachedChapter } from '../utils/browserCache'
import { requestMimoSpeechAudio } from '../utils/mimoSpeech'

vi.mock('../api/bookshelf', () => ({
  getChapterList: vi.fn(),
  getBookContent: vi.fn(),
  saveBookProgress: vi.fn(),
  setBookSource: vi.fn(),
}))

vi.mock('../api/bookmark', () => ({
  getBookmarks: vi.fn(),
  saveBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  deleteBookmarks: vi.fn(),
}))

vi.mock('../api/replaceRule', () => ({
  getReplaceRules: vi.fn(),
}))

vi.mock('../utils/browserCache', () => ({
  getBrowserCachedChapter: vi.fn(),
  setBrowserCachedChapter: vi.fn(),
}))

vi.mock('../utils/recentBooks', () => ({
  saveRecentReadBook: vi.fn(),
}))

vi.mock('../utils/openaiSpeech', () => ({
  DEFAULT_OPENAI_BASE_URL: 'https://api.openai.com/v1',
  requestOpenAISpeechAudio: vi.fn(),
}))

vi.mock('../utils/mimoSpeech', () => ({
  DEFAULT_MIMO_BASE_URL: 'https://api.xiaomimimo.com',
  DEFAULT_MIMO_MODEL: 'mimo-v2.5-tts',
  DEFAULT_MIMO_VOICE: 'mimo_default',
  DEFAULT_MIMO_FORMAT: 'wav',
  requestMimoSpeechAudio: vi.fn(),
}))

describe('reader local txt chapters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    })
    vi.mocked(getBookContent).mockReset()
    vi.mocked(getBrowserCachedChapter).mockReset()
  })

  it('fetches uploaded local txt content from backend even when browser reports offline', async () => {
    vi.mocked(getBookContent).mockResolvedValue('本地正文')
    vi.mocked(getBrowserCachedChapter).mockResolvedValue(null)
    const appStore = useAppStore()
    const readerStore = useReaderStore()
    appStore.setOnlineStatus(false)
    readerStore.book = {
      name: '本地书',
      author: '本地导入',
      origin: 'local-txt',
      bookUrl: 'local-txt:abc123',
    }
    readerStore.chapters = [
      { title: '第一章', url: 'local-txt:abc123#0', index: 0 },
    ]

    await expect(readerStore.fetchChapterContent(0)).resolves.toBe('本地正文')

    expect(getBrowserCachedChapter).not.toHaveBeenCalled()
    expect(getBookContent).toHaveBeenCalledWith({
      chapterUrl: 'local-txt:abc123#0',
      bookSourceUrl: 'local-txt',
      refresh: 0,
    })
  })

  it('prefetches the next chapter for speech once, even with preload disabled', async () => {
    let resolveContent!: (value: string) => void
    vi.mocked(getBookContent).mockReturnValue(new Promise((resolve) => { resolveContent = resolve }))
    vi.mocked(getBrowserCachedChapter).mockResolvedValue(null)
    const readerStore = useReaderStore()
    expect(readerStore.config.enablePreload).toBe(false)
    readerStore.book = {
      name: '本地书',
      author: '本地导入',
      origin: 'local-txt',
      bookUrl: 'local-txt:abc123',
    }
    readerStore.chapters = [
      { title: '第一章', url: 'local-txt:abc123#0', index: 0 },
      { title: '第二章', url: 'local-txt:abc123#1', index: 1 },
    ]

    const first = readerStore.preloadChapterForSpeech(1)
    const second = readerStore.preloadChapterForSpeech(1)
    resolveContent('第二章正文')
    await Promise.all([first, second])

    expect(getBookContent).toHaveBeenCalledTimes(1)
    await expect(readerStore.fetchChapterContent(1)).resolves.toBe('第二章正文')
    expect(getBookContent).toHaveBeenCalledTimes(1)
  })

  it('supports xiaomi mimo speech provider configuration', () => {
    const readerStore = useReaderStore()
    expect(readerStore.speechConfig.mimoModel).toBe('mimo-v2.5-tts')
    expect(readerStore.speechConfig.mimoVoice).toBe('mimo_default')
    expect(readerStore.speechConfig.mimoFormat).toBe('wav')
    expect(readerStore.mimoSpeechConfigured).toBe(true)

    readerStore.setSpeechProvider('mimo')
    expect(readerStore.speechConfig.provider).toBe('mimo')
    expect(readerStore.speechProviderLabel).toBe('小米 MiMo')

    readerStore.setMimoSpeechPrompt('温柔坚定、稍慢、带点疲惫')
    expect(readerStore.speechConfig.mimoPrompt).toBe('温柔坚定、稍慢、带点疲惫')

    readerStore.setMimoSpeechVoice('冰糖')
    expect(readerStore.speechConfig.mimoVoice).toBe('冰糖')
    for (const format of ['mp3', 'wav'] as const) {
      readerStore.setMimoSpeechFormat(format)
      expect(JSON.parse(localStorage.getItem('reader-speechConfig')!).mimoFormat).toBe(format)
      setActivePinia(createPinia())
      expect(useReaderStore().speechConfig.mimoFormat).toBe(format)
    }
  })

  it('uses server MiMo settings instead of browser voice defaults', async () => {
    const aiStore = useAiBookStore()
    aiStore.serverModelConfig = {
      config: {
        text: { enabled: false, baseUrl: '', apiKey: '', model: '', useFullUrl: false },
        image: { enabled: false, baseUrl: '', apiKey: '', model: '', useFullUrl: false, imageSize: '' },
        speech: {
          enabled: true,
          provider: 'mimo',
          baseUrl: 'https://api.xiaomimimo.com',
          apiKey: '',
          model: 'mimo-v2.5-tts',
          useFullUrl: false,
          voice: '冰糖',
          responseFormat: 'wav',
          prompt: '温柔',
        },
      },
      canUseServerModel: true,
      isAdmin: false,
    }
    const readerStore = useReaderStore()
    readerStore.setSpeechProvider('mimo')
    readerStore.setMimoSpeechSource('server')

    expect(readerStore.speechProviderLabel).toBe('小米 MiMo')
    expect(readerStore.isCurrentSpeechMimo).toBe(true)
    vi.mocked(requestMimoSpeechAudio).mockResolvedValue(new Blob(['audio']))
    await readerStore.preloadOpenAITTS('测试正文')
    expect(requestMimoSpeechAudio).toHaveBeenCalledWith(expect.objectContaining({
      source: 'server', model: 'mimo-v2.5-tts', voice: '冰糖', prompt: '温柔',
    }))
  })
})
