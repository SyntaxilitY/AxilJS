import { tHttp, tQuery, tRateLimit, tDedupe, tSample } from '@axiljs/decorator'

export class SearchController {
  @tHttp({ method: 'GET', path: '/api/search' })
  @tRateLimit({ limit: 30, window: '1m' })
  @tDedupe({ key: (req: any) => `search:${req.query?.q ?? ''}` } as any)
  @tSample({ rate: 0.1 })
  @tQuery('q')
  async search(q: string | undefined) {
    return { results: [], query: q ?? '', total: 0 }
  }
}