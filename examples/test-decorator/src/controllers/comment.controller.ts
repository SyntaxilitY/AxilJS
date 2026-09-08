/**
 * CommentController — demonstrates Concurrency (dedupe) and Messaging.
 */

import {
  tHttp, tParam, tBody, tAuth, tRateLimit,
  tSanitize, tDedupe, tEmit, tAudit
} from '@axiljs/decorator'
import type { DB } from '../db/connection.js'
import { nextId } from '../db/connection.js'

export class CommentController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/posts/:postId/comments' })
  @tParam('postId')
  async findAllForPost(postId: string) {
    const items = Array.from(this.db.comments.values()).filter(c => c.postId === Number(postId))
    return { items, postId }
  }

  @tHttp({ method: 'POST', path: '/api/posts/:postId/comments' })
  @tAuth({ required: true })
  @tRateLimit({ limit: 10, window: '1m' })
  @tSanitize({ stripHtml: true, trim: true })
  @tDedupe({ key: (req: any) => `comment:${req.params?.postId}:${req.locals?.user?.id}`, window: 3000 } as any)
  @tEmit('comment.created')
  @tAudit({ action: 'comment.created' })
  @tParam('postId')
  @tBody()
  async create(postId: string, body: Record<string, unknown>) {
    const id = nextId(this.db, 'comments')
    const comment = { id, postId: Number(postId), body: body.body, authorId: 1 }
    this.db.comments.set(id, comment)
    return comment
  }

  @tHttp({ method: 'DELETE', path: '/api/comments/:id' })
  @tAuth({ required: true })
  @tAudit({ action: 'comment.deleted' })
  @tParam('id')
  async remove(id: string) {
    this.db.comments.delete(Number(id))
    return { id, deleted: true }
  }
}