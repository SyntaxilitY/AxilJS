/**
 * AuthController — Handles authentication.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 * No View layer needed — res object handles formatting.
 */

import type { axilRequest as Request, axilResponse as Response } from '@axil/core'
import { JWT, hashPassword, verifyPassword } from '@axil/auth'
import { v, validate } from '@axil/validation'
import { UserModel }   from '../models/User'
import { route }       from '../utils/route'

const registerSchema = v.object({
  name:     v.string().min(2).max(100),
  email:    v.string().email(),
  password: v.string().min(8),
  role:     v.enum(['admin', 'author', 'reader']).optional(),
  bio:      v.string().max(500).optional()
})

const loginSchema = v.object({
  email:    v.string().email(),
  password: v.string().min(1)
})

export class AuthController {
  constructor(private jwt: JWT) {}

  // POST /auth/register
  register = route(
    validate({ body: registerSchema }),
    async (req: Request, res: Response) => {
      const body = req.body as {
        name: string; email: string; password: string
        role?: 'admin' | 'author' | 'reader'; bio?: string
      }

      if (UserModel.findByEmail(body.email)) {
        return res.conflict('Email already registered')
      }

      const hashed = await hashPassword(body.password)

      const user = UserModel.create({
        name:     body.name,
        email:    body.email,
        password: hashed,
        role:     body.role || 'reader',
        bio:      body.bio  || ''
      })

      const token = this.jwt.sign(
        { sub: String(user.id), role: user.role, email: user.email },
        { expiresIn: '7d' }
      )

      res.created({
        user:  UserModel.safe(user),
        token
      }, 'Registration successful')
    }
  )

  // POST /auth/login
  login = route(
    validate({ body: loginSchema }),
    async (req: Request, res: Response) => {
      const body = req.body as { email: string; password: string }

      const user = UserModel.findByEmail(body.email)
      if (!user) return res.unauthorized('Invalid email or password')

      const valid = await verifyPassword(body.password, user.password)
      if (!valid) return res.unauthorized('Invalid email or password')

      const token = this.jwt.sign(
        { sub: String(user.id), role: user.role, email: user.email },
        { expiresIn: '7d' }
      )

      res.success({
        user:  UserModel.safe(user),
        token
      }, 'Login successful')
    }
  )

  // GET /auth/me
  me = (req: Request, res: Response) => {
    const authUser = req.locals.user as any
    const user     = UserModel.findById(Number(authUser.sub))

    if (!user) return res.notFound('User not found')

    res.success(UserModel.safe(user), 'Current user')
  }

  // PUT /auth/profile
  updateProfile = route(
    validate({
      body: v.object({
        name: v.string().min(2).max(100).optional(),
        bio:  v.string().max(500).optional()
      })
    }),
    (req: Request, res: Response) => {
      const userId = req.locals.userId as number
      const body   = req.body as { name?: string; bio?: string }

      const user = UserModel.update(userId, body)
      if (!user) return res.notFound('User not found')

      res.success(UserModel.safe(user), 'Profile updated')
    }
  )
}