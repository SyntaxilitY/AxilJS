/**
 * StatsController — demonstrates Observability semantics.
 */

import { tHttp, tCache, tTrace, tMetric, tSlo, tSample } from '@axiljs/decorator'
import type { DB } from '../db/connection.js'

export class StatsController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/stats/overview' })
  @tCache({ key: 'stats:overview', ttl: 30_000 })
  @tTrace('stats.overview')
  @tMetric('stats.overview.requests', 'counter')
  @tSlo({ latency: 200, percentile: 95 })
  async overview() {
    return {
      users: this.db.users.size,
      posts: this.db.posts.size,
      comments: this.db.comments.size,
      views: 45_230
    }
  }

  @tHttp({ method: 'GET', path: '/api/stats/posts' })
  @tCache({ key: 'stats:posts', ttl: 30_000 })
  @tSample({ rate: 0.2 })
  async posts() {
    const all = Array.from(this.db.posts.values())
    return {
      published: all.filter(p => p.status === 'published').length,
      draft: all.filter(p => p.status === 'draft').length,
      archived: all.filter(p => p.status === 'archived').length
    }
  }
}