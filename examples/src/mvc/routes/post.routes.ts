/**
 * Post Routes
 */

import { Router } from '@axiljs/core'
import type { MiddlewareFn, RouteHandler } from '@axiljs/core'
import { JWT } from '@axiljs/auth'
import { PostController } from '../controllers/PostController'
import {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  requireAuthorOrAdmin
} from '../middlewares/auth.middleware'

export function postRoutes(jwt: JWT): Router {
  const router  = new Router('/api/posts')
  const ctrl    = new PostController()
  const auth    = createAuthMiddleware(jwt)
  const optAuth = createOptionalAuthMiddleware(jwt)
  const author  = requireAuthorOrAdmin()

  // Public routes
  router.get('/',           optAuth, ctrl.list       as RouteHandler)
  router.get('/slug/:slug',          ctrl.showBySlug as RouteHandler)
  router.get('/:id',        optAuth, ctrl.show       as RouteHandler)

  // Protected — build tuples explicitly
  const createHandlers = [auth, author, ...ctrl.create] as [...MiddlewareFn[], RouteHandler]
  const updateHandlers = [auth, ...ctrl.update]         as [...MiddlewareFn[], RouteHandler]

  router.post('/',              ...createHandlers)
  router.put('/:id',            ...updateHandlers)
  router.delete('/:id',          auth, ctrl.destroy  as RouteHandler)
  router.patch('/:id/publish',   auth, author, ctrl.publish as RouteHandler)

  return router
}