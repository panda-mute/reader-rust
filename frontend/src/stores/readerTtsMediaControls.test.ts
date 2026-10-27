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

  constructor(src = '') {
    this.src = src
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('media notification pause/resume', () => {
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

  it('pauses and resumes a chunk that is playing', async () => {
    const store = setupStore()
    vi.mocked(requestOpenAISpeechAudio).mockResolvedValue(new Blob(['one']))
    store.startTTS('第一段')
    await flush()
    const audio = FakeAudio.instances[0]

    store.pauseSpeech()
    store.pauseSpeech()
    expect(audio.paused).toBe(true)
    expect(store.isPaused).toBe(true)

    expect(store.resumeSpeech()).toBe(true)
    expect(audio.paused).toBe(false)
    expect(store.isPaused).toBe(false)
    expect(store.resumeSpeech()).toBe(true)
  })

  it('holds a chunk that finishes loading while paused', async () => {
    const store = setupStore()
    const pending = deferred<Blob>()
    vi.mocked(requestOpenAISpeechAudio).mockReturnValueOnce(pending.promise)
    store.startTTS('第一段')
    await flush()

    store.pauseSpeech()
    pending.resolve(new Blob(['one']))
    await flush()
    const audio = FakeAudio.instances[0]
    expect(audio.paused).toBe(true)

    expect(store.resumeSpeech()).toBe(true)
    expect(audio.paused).toBe(false)
    expect(store.isSpeaking).toBe(true)
  })

  it('does not replay a finished chunk when resumed between chunks', async () => {
    const store = setupStore()
    vi.mocked(requestOpenAISpeechAudio).mockResolvedValue(new Blob(['one']))
    store.startTTS('第一段')
    await flush()
    const audio = FakeAudio.instances[0]
    audio.finish()

    store.pauseSpeech()
    expect(store.resumeSpeech()).toBe(false)
    expect(audio.paused).toBe(true)
    expect(store.isPaused).toBe(false)
  })

  it('releases a preloaded chunk once it has been played', async () => {
    const store = setupStore()
    vi.mocked(requestOpenAISpeechAudio).mockResolvedValue(new Blob(['a']))

    await store.preloadOpenAITTS('第一段')
    await flush()
    expect(requestOpenAISpeechAudio).toHaveBeenCalledTimes(1)

    store.startTTS('第一段')
    await flush()
    expect(requestOpenAISpeechAudio).toHaveBeenCalledTimes(1)

    store.startTTS('第一段')
    await flush()
    expect(requestOpenAISpeechAudio).toHaveBeenCalledTimes(2)
  })

  it('caps the number of preloaded chunks kept in memory', async () => {
    const store = setupStore()
    vi.mocked(requestOpenAISpeechAudio).mockResolvedValue(new Blob(['a']))
    const texts = Array.from({ length: 12 }, (_, i) => `段落${i}`)

    await store.preloadOpenAITTS(texts.slice(0, 8))
    await flush()
    await store.preloadOpenAITTS(texts.slice(8))
    await flush()
    expect(requestOpenAISpeechAudio).toHaveBeenCalledTimes(12)

    store.startTTS(texts[11])
    await flush()
    expect(requestOpenAISpeechAudio).toHaveBeenCalledTimes(12)

    store.startTTS(texts[0])
    await flush()
    expect(requestOpenAISpeechAudio).toHaveBeenCalledTimes(13)
  })
})
