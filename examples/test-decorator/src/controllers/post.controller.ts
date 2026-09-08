/**
 * PostController — demonstrates Distributed messaging (tEmit/tOutbox),
 * Cache stampede protection, and Contract semantics.
 */

import {
  tHttp, tParam, tBody, tAuth, tPolicy,
  tTransaction, tCache, tCacheEvict, tCacheStampede,
  tPaginated, tEmit, tOutbox, tAudit, tStatus, tDeprecated
} from '@axiljs/decorator'
import type { DB } from '../db/connection.js'
import { nextId } from '../db/connection.js'

export class PostController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/posts' })
  @tPaginated({ strategy: 'offset', defaultLimit: 25 })
  @tCache({ key: 'posts:list', ttl: 15_000, tags: ['posts'] })
  async findAll() {
    const items = Array.from(this.db.posts.values())
    return { items, total: items.length, page: 1, limit: 25 }
  }

  @tHttp({ method: 'POST', path: '/api/posts' })
  @tAuth({ required: true })
  @tStatus(201)
  @tTransaction()
  @tOutbox()
  @tEmit('post.created')
  @tCacheEvict({ tags: ['posts'] })
  @tAudit({ action: 'post.created' })
  @tBody()
  async create(body: Record<string, unknown>) {
    const id = nextId(this.db, 'posts')
    const post = { id, title: body.title, body: body.body, status: 'draft', authorId: 1 }
    this.db.posts.set(id, post)
    return post
  }

  @tHttp({ method: 'GET', path: '/api/posts/:id' })
  @tCache({ key: (req: any) => `post:${req.params?.id ?? req}`, ttl: 30_000, tags: ['posts'] })
  @tCacheStampede({ strategy: 'single-flight' })
  @tParam('id')
  async findOne(id: string) {
    return this.db.posts.get(Number(id)) ?? { error: 'Not found' }
  }

  @tHttp({ method: 'PUT', path: '/api/posts/:id' })
  @tAuth({ required: true })
  @tPolicy('PostOwnership')
  @tTransaction()
  @tCacheEvict({ key: (req: any) => `post:${req.params?.id ?? req}`, tags: ['posts'] })
  @tParam('id')
  @tBody()
  async update(id: string, body: Record<string, unknown>) {
    const post = this.db.posts.get(Number(id))
    if (!post) return { error: 'Not found' }
    Object.assign(post, body)
    return { id, updated: true }
  }

  @tHttp({ method: 'PATCH', path: '/api/posts/:id/publish' })
  @tAuth({ required: true })
  @tPolicy('PostOwnership')
  @tTransaction()
  @tEmit('post.published')
  @tCacheEvict({ tags: ['posts'] })
  @tAudit({ action: 'post.published' })
  @tParam('id')
  async publish(id: string) {
    const post = this.db.posts.get(Number(id))
    if (!post) return { error: 'Not found' }
    post.status = 'published'
    return { id, status: 'published' }
  }

  @tHttp({ method: 'DELETE', path: '/api/posts/:id' })
  @tAuth({ required: true })
  @tPolicy('PostOwnership')
  @tCacheEvict({ tags: ['posts'] })
  @tAudit({ action: 'post.deleted' })
  @tParam('id')
  async remove(id: string) {
    this.db.posts.delete(Number(id))
    return { id, deleted: true }
  }

  @tHttp({ method: 'GET', path: '/api/posts/:id/legacy-view' })
  @tDeprecated({ since: '0.1', removeAfter: '1.0', replacement: '/api/posts/:id' })
  @tParam('id')
  async legacyView(id: string) {
    return this.db.posts.get(Number(id)) ?? { error: 'Not found' }
  }
}