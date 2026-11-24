import type { BookSource, SearchBook } from '../types'

function normalizeText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function normalizeTitle(value: string) {
  return normalizeText(value).replace(/^《(.+)》$/, '$1')
}

function getLinkRank(bookUrl: string) {
  try {
    const [address] = bookUrl.split(/,\s*\{/)
    if (/[{}]/.test(address)) return 0
    const url = new URL(address)
    if (!['http:', 'https:'].includes(url.protocol)) return 0

    for (const [name, value] of url.searchParams) {
      if (/^(?:book_?id|resource_?id|bid)$/i.test(name) && !value.trim()) return 0
    }

    const path = url.pathname.toLowerCase()
    if (/(?:^|\/)(?:so|sou|soushu|search|searchbook)(?:[./_-]|$)/.test(path)) return 0
    if (/(?:^|\/)(?:book|novel|books|detail|intro-info)\/.+/.test(path)) return 2
    return 1
  } catch {
    return 0
  }
}

function getSourceRank(book: SearchBook, source?: BookSource) {
  const group = book.originGroup || source?.bookSourceGroup || ''
  const name = book.originName || source?.bookSourceName || ''
  if ((source?.bookSourceType ?? 0) !== 0 || /词典|字典|音乐|问答|图片搜索|百度知道|短剧/.test(`${group} ${name}`)) return 0
  if (/小说|文学/.test(`${group} ${name}`)) return 2
  return 1
}

export function rankSearchResults(
  books: SearchBook[],
  keyword: string,
  sources: ReadonlyMap<string, BookSource>,
) {
  const query = normalizeTitle(keyword)
  return books.map((book) => {
    const source = sources.get(book.origin)
    const title = normalizeTitle(book.name)
    const author = normalizeText(book.author).replace(/^作者[:：]?/, '')
    const sourceRank = getSourceRank(book, source)
    const linkRank = getLinkRank(book.bookUrl)
    const matchRank = !query ? 0 : title === query ? 3 : title.includes(query) ? 2 : author === query ? 1 : 0

    return {
      book: {
        ...book,
        originName: book.originName || source?.bookSourceName || book.origin,
        originGroup: book.originGroup || source?.bookSourceGroup,
      },
      ranks: [Number(sourceRank > 0 && linkRank > 0), matchRank, sourceRank, linkRank],
    }
  }).sort((left, right) => {
    for (const [index, rank] of left.ranks.entries()) {
      const diff = right.ranks[index] - rank
      if (diff !== 0) return diff
    }
    return 0
  }).map(({ book }) => book)
}
