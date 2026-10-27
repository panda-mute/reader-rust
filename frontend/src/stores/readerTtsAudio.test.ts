import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useReaderStore } from './reader'
import { requestOpenAISpeechAudio } from '../utils/openaiSpeech'

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

class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  loop = false
  paused = true
  ended = false
  preload = ''
  onplay: (() => void) | null = null
  onpause: (() => void) | null = null
  onended: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    FakeAudio.instances.push(this)
  }

  play() {
    this.paused = false
    this.ended = false
    this.onplay?.()
    return Promise.resolve()
  }

  pause() {
    this.paused = true
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }

  load() {}

  finish() {
    this.paused = true
    this.ended = true
    this.onended?.()
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('network TTS audio element', () => {
  beforeEach(() => {
    FakeAudio.instances = []
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    })
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      dispatchEvent: vi.fn(),
    })
    vi.stubGlobal('Audio', FakeAudio)
    let urlId = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${++urlId}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.mocked(requestOpenAISpeechAudio).mockReset()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function setupStore() {
    const store = useReaderStore()
    store.setSpeechProvider('openai')
    store.setOpenAISpeechSource('browser')
    store.setOpenAISpeechBaseUrl('https://tts.example.com/v1')
    return store
  }

  it('reuses one audio element across consecutive chunks', async () => {
    const store = setupStore()
    vi.mocked(requestOpenAISpeechAudio).mockResolvedValue(new Blob(['one']))

    store.startTTS('第一段', {
      onEnd: () => store.startTTS('第二段', {}, false),
    })
    await flush()
    FakeAudio.instances[0].finish()
    await flush()

    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0].paused).toBe(false)
  })

  it('keeps the element when the user stops speech', async () => {
    const store = setupStore()
    vi.mocked(requestOpenAISpeechAudio).mockResolvedValue(new Blob(['one']))

    store.startTTS('第一段')
    await flush()
    store.stopTTS()
    store.startTTS('再来一段')
    await flush()

    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0].paused).toBe(false)
  })
})
