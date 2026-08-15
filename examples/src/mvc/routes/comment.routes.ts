/**
 * Comment Routes — nested under posts
 */

import { Router } from '@axil/core'
import type { MiddlewareFn, RouteHandler } from '@axil/core'
import { JWT } from '@axil/auth'
import { CommentController } from '../controllers/CommentController'
import { createAuthMiddleware } from '../middlewares/auth.middleware'

export function commentRoutes(jwt: JWT): Router {
  const router = new Router("/api")
  const ctrl   = new CommentController()
  const auth   = createAuthMiddleware(jwt)

  // GET /posts/:postId/comments
  router.get('/posts/:postId/comments', ctrl.list as RouteHandler)

  // Build tuple explicitly: middleware + middleware/handler tuple
  const createCommentHandlers = [
    auth,
    ...ctrl.create
  ] as [...MiddlewareFn[], RouteHandler]

  // POST /posts/:postId/comments
  router.post('/posts/:postId/comments', ...createCommentHandlers)

  // DELETE /comments/:id
  router.delete('/comments/:id', auth, ctrl.destroy as RouteHandler)

  return router
}