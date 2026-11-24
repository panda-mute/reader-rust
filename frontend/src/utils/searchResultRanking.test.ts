import { describe, expect, it } from 'vitest'
import type { BookSource, SearchBook } from '../types'
import { rankSearchResults } from './searchResultRanking'

function source(url: string, name: string, group?: string, type = 0): BookSource {
  return { bookSourceUrl: url, bookSourceName: name, bookSourceGroup: group, bookSourceType: type }
}

function result(source: BookSource, bookUrl: string, name = '廓晋', author = ''): SearchBook {
  return { name, author, origin: source.bookSourceUrl, bookUrl }
}

describe('rankSearchResults', () => {
  it('prioritizes exact novel details over same-title dictionary, audio and broken links', () => {
    const dictionary = source('https://dict.example', '海词词典', '特殊 书源')
    const audio = source('https://audio.example', '有声小说', '小说', 1)
    const catalog = source('https://catalog.example', '正版小说', '正版小说 书源')
    const novel = source('https://novel.example', '笔趣小说', '小说 书源')
    const sources = new Map([dictionary, audio, catalog, novel].map((item) => [item.bookSourceUrl, item]))

    const entries = [
      result(dictionary, 'https://dict.example/廓晋'),
      result(audio, 'https://audio.example/book/2'),
      result(catalog, 'https://catalog.example/so/廓晋.html?page=1', '廓晋', '榴弹怕水'),
      result(catalog, 'https://catalog.example/intro-info?bookid=&channel=1', '廓晋', '榴弹怕水'),
      result(catalog, 'https://catalog.example/1157881001', '廓晋', '榴弹怕水'),
      result(novel, 'https://novel.example/book/2', '晋末长剑'),
      result(novel, 'https://novel.example/book/1701/', ' 《廓 晋》 '),
    ]

    const ranked = rankSearchResults(entries, '廓晋', sources)
    expect(ranked.map((book) => book.bookUrl)).toEqual([6, 4, 5, 2, 3, 1, 0].map((index) => entries[index].bookUrl))
    expect(ranked[0].originName).toBe('笔趣小说')
    expect(entries[0].originName).toBeUndefined()
  })

  it('keeps author searches useful and preserves arrival order for tied results', () => {
    const novel = source('https://novel.example', '小说', '小说')
    const sources = new Map([[novel.bookSourceUrl, novel]])
    const entries = [
      result(novel, 'https://novel.example/book/1', '晋末长剑', '孤独麦客'),
      result(novel, 'https://novel.example/book/2', '廓晋', '作者：榴弹怕水'),
      result(novel, 'https://novel.example/book/3', '绍宋', '榴弹怕水'),
    ]

    expect(rankSearchResults(entries, '榴弹怕水', sources).map((book) => book.name)).toEqual(['廓晋', '绍宋', '晋末长剑'])
  })
})
