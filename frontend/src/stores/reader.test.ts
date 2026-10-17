import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './app'
import { useReaderStore } from './reader'
import { getBookContent } from '../api/bookshelf'
import { getBrowserCachedChapter } from '../utils/browserCache'

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
  })
})
