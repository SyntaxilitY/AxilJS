/**
 * CategoryController — simple CRUD demonstrating admin-only writes.
 */

import { tHttp, tParam, tBody, tAuth, tRole, tCache, tCacheInvalidate } from '@axiljs/decorator'
import type { DB } from '../db/connection.js'
import { nextId } from '../db/connection.js'

export class CategoryController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/categories' })
  @tCache({ key: 'categories:list', ttl: 60_000, tags: ['categories'] })
  async findAll() {
    const items = Array.from(this.db.categories.values())
    return { items, total: items.length }
  }

  @tHttp({ method: 'POST', path: '/api/categories' })
  @tAuth({ required: true })
  @tRole('admin')
  @tCacheInvalidate('categories')
  @tBody()
  async create(body: Record<string, unknown>) {
    const id = nextId(this.db, 'categories')
    const category = { id, name: body.name }
    this.db.categories.set(id, category)
    return category
  }

  @tHttp({ method: 'PUT', path: '/api/categories/:id' })
  @tAuth({ required: true })
  @tRole('admin')
  @tCacheInvalidate('categories')
  @tParam('id')
  @tBody()
  async update(id: string, body: Record<string, unknown>) {
    const category = this.db.categories.get(Number(id))
    if (!category) return { error: 'Not found' }
    Object.assign(category, body)
    return { id, updated: true }
  }

  @tHttp({ method: 'DELETE', path: '/api/categories/:id' })
  @tAuth({ required: true })
  @tRole('admin')
  @tCacheInvalidate('categories')
  @tParam('id')
  async remove(id: string) {
    this.db.categories.delete(Number(id))
    return { id, deleted: true }
  }
}