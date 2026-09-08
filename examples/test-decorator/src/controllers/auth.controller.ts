/**
 * AuthController — demonstrates HTTP, Security, Reliability, and Compliance semantics.
 */

import {
  tHttp, tBody, tRateLimit, tSanitize, tAudit,
  tAuth, tRetry, tIdempotent
} from '@axiljs/decorator'
import { validateDto } from '../runtime/validation-consumer.js'
import { RegisterDto } from '../dto/register.dto.js'
import { LoginDto } from '../dto/login.dto.js'
import type { DB } from '../db/connection.js'
import { nextId } from '../db/connection.js'
import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core'

export class AuthController {
  constructor(private db: DB) {}

  @tHttp({ method: 'POST', path: '/api/auth/register' })
  @tRateLimit({ limit: 5, window: '1m' })
  @tSanitize({ trim: true })
  @tAudit({ action: 'user.registered' })
  // @tBody()
  async register(req: Request, res: Response) {
    const body = req.body as Record<string, unknown>

    const result = validateDto(RegisterDto, body)
    if (!result.valid) return { errors: result.errors, success: false }

    const id = nextId(this.db, 'users')
    this.db.users.set(id, {
      id,
      name: body.name,
      email: body.email,
      password: '$hashed$',
      role: 'user'
    })

    return res.HTTP_200_OK({ id }, 'User registered')
  }

  @tHttp({ method: 'POST', path: '/api/auth/login' })
  @tRateLimit({ limit: 5, window: '15m' })
  @tAudit({ action: 'user.login.attempt', sensitivity: 'medium' })
  @tRetry({ attempts: 2, backoff: 'fixed', delay: 100 })
  // @tBody()
  async login(req: Request, res: Response) {
    const body = req.body as Record<string, unknown>

    // ... work with user
    const user = this.db.users.get(1);
    console.log(`[auth:login:user] ${JSON.stringify(user, null, 4)}`)

    const result = validateDto(LoginDto, body)

    if (!result.valid) return res.HTTP_400_BAD_REQUEST("Invalid credentials")

    const data = { token: '$token$' }

    return res.HTTP_200_OK(data, "Login successful")
  }

  @tHttp({ method: 'POST', path: '/api/auth/logout' })
  @tAuth({ required: true })
  @tIdempotent({ key: 'x-request-id', ttl: 60_000 })
  async logout() {
    return { success: true }
  }

  @tHttp({ method: 'GET', path: '/api/auth/me' })
  @tAuth({ required: true })
  // Deliberately no @tCache — personalized responses must not be cached.
  async me() {
    return { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin' }
  }
}