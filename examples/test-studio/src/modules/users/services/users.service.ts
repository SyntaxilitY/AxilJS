/**
 * Users Service.
 * Database-backed implementation.
 */

import { NotFoundError } from '@axiljs/core'
import { getDB } from '../../../db/connection.js'

export interface User {
  id: string; name: string; email: string; createdAt: string
}

function toUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id), name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    createdAt: String(row.createdAt ?? row.created_at ?? '')
  }
}

export class UsersService {
  private get driver() { return getDB().getDriver() }

  async findAll(): Promise<User[]> {
    const r = await this.driver.query('SELECT * FROM users ORDER BY id DESC')
    return r.rows.map(toUser)
  }

  async findById(id: string): Promise<User> {
    const r = await this.driver.query('SELECT * FROM users WHERE id = ?', [id])
    if (r.rows.length === 0) throw new NotFoundError(`User ${id} not found.`)
    return toUser(r.rows[0])
  }

  async create(data: Partial<User>): Promise<User> {
    const r = await this.driver.query(
      'INSERT INTO users (name, email) VALUES (?, ?) RETURNING *',
      [data.name || '', data.email || '']
    )
    return toUser(r.rows[0])
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const r = await this.driver.query(
      'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ? RETURNING *',
      [data.name, data.email, id]
    )
    if (r.rows.length === 0) throw new NotFoundError(`User ${id} not found.`)
    return toUser(r.rows[0])
  }

  async delete(id: string): Promise<void> {
    const r = await this.driver.query('DELETE FROM users WHERE id = ? RETURNING id', [id])
    if (r.rows.length === 0) throw new NotFoundError(`User ${id} not found.`)
  }
}
