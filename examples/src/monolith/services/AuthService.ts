/**
 * Auth Service — register, login, profile
 */

import { JWT, hashPassword, verifyPassword } from '@axiljs/auth'
import { getDB } from '../db'
import { QueryBuilder } from '@axiljs/orm'

export class AuthService {
  constructor(private jwt: JWT) {}

  private get driver() { return getDB().getDriver() }

  async register(data: { name: string; email: string; password: string; role?: string }) {
    // Check duplicate
    const existing = await this.driver.query(
      'SELECT id FROM users WHERE email = $1', [data.email]
    )
    if (existing.rows.length > 0) return { error: 'Email already registered' }

    const hashed = await hashPassword(data.password)

    const result = await this.driver.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [data.name, data.email, hashed, data.role || 'customer']
    )

    const user  = result.rows[0]
    const token = this.jwt.sign(
      { sub: String(user.id), role: user.role, email: user.email },
      { expiresIn: '7d' }
    )

    return { user, token }
  }

  async login(email: string, password: string) {
    const result = await this.driver.query(
      'SELECT * FROM users WHERE email = $1', [email]
    )

    if (result.rows.length === 0) return { error: 'Invalid credentials' }

    const user  = result.rows[0]
    const valid = await verifyPassword(password, user.password as string)
    if (!valid) return { error: 'Invalid credentials' }

    const token = this.jwt.sign(
      { sub: String(user.id), role: user.role, email: user.email },
      { expiresIn: '7d' }
    )

    const { password: _, ...safe } = user
    return { user: safe, token }
  }

  async getProfile(userId: number) {
    const result = await this.driver.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1', [userId]
    )
    return result.rows[0] || null
  }
}