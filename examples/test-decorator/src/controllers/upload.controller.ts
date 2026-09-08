/**
 * UploadController — demonstrates File semantics + Resource control.
 */

import {
  tHttp, tParam, tFile, tAuth, tQuota,
  tConcurrency, tResource, tAudit
} from '@axiljs/decorator'
import type { DB } from '../db/connection.js'
import { nextId } from '../db/connection.js'

export class UploadController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/uploads' })
  @tAuth({ required: true })
  async findAll() {
    return { items: Array.from(this.db.uploads.values()), total: this.db.uploads.size }
  }

  @tHttp({ method: 'POST', path: '/api/uploads' })
  @tAuth({ required: true })
  @tConcurrency({ limit: 5, strategy: 'queue' })
  @tResource({ cpu: '250m', memory: '128Mi' })
  @tQuota({ resource: 'storage_bytes', amount: 102_400 })
  @tAudit({ action: 'file.uploaded' })
  @tFile({ maxSize: 5_000_000, mimeTypes: ['image/*', 'application/pdf'] })
  async upload(file: unknown) {
    void file
    const id = nextId(this.db, 'uploads')
    const upload = { id, filename: 'upload.jpg', size: 102_400 }
    this.db.uploads.set(id, upload)
    return upload
  }

  @tHttp({ method: 'DELETE', path: '/api/uploads/:id' })
  @tAuth({ required: true })
  @tAudit({ action: 'file.deleted' })
  @tParam('id')
  async remove(id: string) {
    this.db.uploads.delete(Number(id))
    return { id, deleted: true }
  }
}