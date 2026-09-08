/**
 * UserController — demonstrates Data, Concurrency, and Caching semantics.
 */

import {
  tHttp, tParam, tBody, tAuth, tRole, tPolicy,
  tDatabase, tTransaction, tConsistent, tCache,
  tCacheEvict, tCacheStampede, tPaginated, tAudit, tIdempotent
} from '@axiljs/decorator'
import type { DB } from '../db/connection.js'

export class UserController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/users' })
  @tAuth({ required: true })
  @tRole('admin')
  @tPaginated({ strategy: 'offset', defaultLimit: 25 })
  @tDatabase({ operation: 'read' })
  @tConsistent('eventual')
  @tCache({ key: 'users:list', ttl: 30_000, tags: ['users'] })
  @tCacheStampede({ strategy: 'single-flight' })
  async findAll() {
    const items = Array.from(this.db.users.values())
    return { items, total: items.length, page: 1, limit: 25 }
  }

  @tHttp({ method: 'GET', path: '/api/users/:id' })
  @tAuth({ required: true })
  @tDatabase({ operation: 'read', consistency: 'strong' } as any)
  @tConsistent('strong')
  @tCache({ key: (req: any) => `user:${req.params?.id ?? req}`, ttl: 60_000, tags: ['users'] })
  @tParam('id')
  async findOne(id: string) {
    const user = this.db.users.get(Number(id))
    if (!user) return { error: 'Not found' }
    return user
  }

  @tHttp({ method: 'PUT', path: '/api/users/:id' })
  @tAuth({ required: true })
  @tPolicy('SelfOrAdmin')
  @tTransaction({ isolation: 'read-committed' })
  @tDatabase({ operation: 'write' })
  @tCacheEvict({ key: (req: any) => `user:${req.params?.id ?? req}` })
  @tIdempotent({ key: 'x-request-id' })
  @tAudit({ action: 'user.updated' })
  @tParam('id')
  @tBody()
  async update(id: string, body: Record<string, unknown>) {
    const user = this.db.users.get(Number(id))
    if (!user) return { error: 'Not found' }
    Object.assign(user, body)
    return { id, updated: true }
  }

  @tHttp({ method: 'DELETE', path: '/api/users/:id' })
  @tAuth({ required: true })
  @tRole('admin')
  @tTransaction()
  @tCacheEvict({ tags: ['users'] })
  @tAudit({ action: 'user.deleted', sensitivity: 'high' })
  @tParam('id')
  async remove(id: string) {
    this.db.users.delete(Number(id))
    return { id, deleted: true }
  }
}