import { tHttp, tBody, tAuth, tCache, tCacheInvalidate } from '@axiljs/decorator'
import type { DB } from '../db/connection.js'
import { nextId } from '../db/connection.js'

export class TagController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/tags' })
  @tCache({ key: 'tags:list', ttl: 120_000, tags: ['tags'] })
  async findAll() {
    return { items: Array.from(this.db.tags.values()) }
  }

  @tHttp({ method: 'POST', path: '/api/tags' })
  @tAuth({ required: true })
  @tCacheInvalidate('tags')
  @tBody()
  async create(body: Record<string, unknown>) {
    const id = nextId(this.db, 'tags')
    const tag = { id, name: body.name }
    this.db.tags.set(id, tag)
    return tag
  }
}