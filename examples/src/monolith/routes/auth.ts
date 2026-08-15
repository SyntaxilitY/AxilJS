/**
 * Auth Routes
 */

import type { axilRequest as Req, axilResponse as Res, RouteHandler } from '@axil/core'
import { Application } from '@axil/core'
import { JWT, authenticate } from '@axil/auth'
import { v, validate } from '@axil/validation'
import { AuthService } from '../services/AuthService'

export function registerAuthRoutes(app: Application, jwt: JWT) {
  const auth    = new AuthService(jwt)
  const authMw  = authenticate(jwt) as any

  // POST /api/auth/register
  app.post('/api/auth/register',
    validate({
      body: v.object({
        name:     v.string().min(2).max(100),
        email:    v.string().email(),
        password: v.string().min(8),
        role:     v.enum(['customer', 'admin']).optional()
      })
    }) as any,
    async (req: Req, res: Res) => {
      const body   = req.body as any
      const result = await auth.register(body)

      if ('error' in result) return res.conflict(result.error)

      res.created(result, 'Registration successful')
    }
  )

  // POST /api/auth/login
  app.post('/api/auth/login',
    validate({
      body: v.object({
        email:    v.string().email(),
        password: v.string().min(1)
      })
    }) as any,
    async (req: Req, res: Res) => {
      const body   = req.body as any
      const result = await auth.login(body.email, body.password)

      if ('error' in result) return res.unauthorized(result.error)

      res.success(result, 'Login successful')
    }
  )

  // GET /api/auth/me
  app.get('/api/auth/me', authMw, async (req: Req, res: Res) => {
    const userId = Number((req.locals.user as any).sub)
    const user   = await auth.getProfile(userId)

    if (!user) return res.notFound('User not found')

    res.success(user, 'Profile fetched')
  })
}