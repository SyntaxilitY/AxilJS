import { Router, MiddlewareFn, RouteHandler } from '@axiljs/core' // Import types
import { AuthController } from '../controllers/AuthController'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { JWT } from '@axiljs/auth'

export function authRoutes(jwt: JWT): Router {
  const router = new Router('/api/auth')
  const ctrl   = new AuthController(jwt)
  const auth   = createAuthMiddleware(jwt)

  // Use a type cast to satisfy the spread signature
  router.post('/register',       ...(ctrl.register as [MiddlewareFn, RouteHandler]))
  router.post('/login',          ...(ctrl.login as [MiddlewareFn, RouteHandler]))
  
  router.get('/me',              auth, ctrl.me)
  
  router.put('/profile',         auth, ...(ctrl.updateProfile as [MiddlewareFn, RouteHandler]))

  return router
}