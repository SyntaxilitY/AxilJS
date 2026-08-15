/**
 * Auth Middleware — Verifies JWT and attaches user to request
 */

import { MiddlewareFn } from '@axiljs/common'
import { JWT }          from '@axiljs/auth'
import { UserModel }    from '../models/User'

export function createAuthMiddleware(jwt: JWT): MiddlewareFn {
  return (req, res, next) => {
    const header = req.headers['authorization'] as string

    if (!header || !header.startsWith('Bearer ')) {
      return res.unauthorized('No token provided', { code: 'UNAUTHORIZED' })
    }

    const token = header.slice(7)

    try {
      const payload        = jwt.verify(token)
      const user           = UserModel.findById(Number(payload.sub))

      if (!user) return res.unauthorized('User not found', { code: 'UNAUTHORIZED' })

      req.locals.user    = payload
      req.locals.userId  = Number(payload.sub)
      req.locals.role    = payload.role

      next()
    } catch (err) {
      return res.unauthorized('Invalid token', { code: 'UNAUTHORIZED' })
    }
  }
}

// Optional auth — does not fail if no token
export function createOptionalAuthMiddleware(jwt: JWT): MiddlewareFn {
  return (req, res, next) => {
    const header = req.headers['authorization'] as string

    if (header && header.startsWith('Bearer ')) {
      try {
        const payload     = jwt.verify(header.slice(7))
        req.locals.user   = payload
        req.locals.userId = Number(payload.sub)
        req.locals.role   = payload.role
      } catch {
        // Invalid token — treat as unauthenticated
      }
    }

    next()
  }
}

// Admin-only middleware
export function requireAdmin(): MiddlewareFn {
  return (req, res, next) => {
    if (req.locals.role !== 'admin') {
      return res.forbidden('Admin access required')
    }
    next()
  }
}

// Author or admin middleware
export function requireAuthorOrAdmin(): MiddlewareFn {
  return (req, res, next) => {
    const role = req.locals.role as string
    if (role !== 'admin' && role !== 'author') {
      return res.forbidden('Author or admin access required')
    }
    next()
  }
}