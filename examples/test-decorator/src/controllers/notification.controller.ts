/**
 * NotificationController — demonstrates both HTTP endpoints AND
 * an @tOnEvent handler on the same class. The http-bridge only
 * registers the HTTP ones; the event-bus consumer only registers
 * the event ones. Same class, two independent consumers.
 */

import { tHttp, tParam, tAuth, tOnEvent, tLog } from '@axiljs/decorator'
import type { DB } from '../db/connection.js'
import { nextId } from '../db/connection.js'

export class NotificationController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/notifications' })
  @tAuth({ required: true })
  async findAll() {
    const items = Array.from(this.db.notifications.values())
    return { items, unread: items.filter(n => !n.isRead).length }
  }

  @tHttp({ method: 'PATCH', path: '/api/notifications/:id/read' })
  @tAuth({ required: true })
  @tParam('id')
  async markRead(id: string) {
    const n = this.db.notifications.get(Number(id))
    if (n) n.isRead = true
    return { id, is_read: true }
  }

  @tHttp({ method: 'POST', path: '/api/notifications/read-all' })
  @tAuth({ required: true })
  async markAllRead() {
    let updated = 0
    for (const n of this.db.notifications.values()) {
      if (!n.isRead) { n.isRead = true; updated++ }
    }
    return { success: true, updated }
  }

  // ── Not an HTTP endpoint — consumed by the event bus, not the bridge ──
  @tOnEvent('post.published')
  @tLog('info', { includeArgs: true })
  async onPostPublished(payload: { id: number; title: unknown }) {
    const id = nextId(this.db, 'notifications')
    this.db.notifications.set(id, {
      id,
      message: `New post published: ${payload.title}`,
      isRead: false
    })
    console.log(`[notifications] created notification for post ${payload.id}`)
  }

  @tOnEvent('comment.created')
  async onCommentCreated(payload: { postId: number }) {
    console.log(`[notifications] would notify post ${payload.postId} author of new comment`)
  }
}