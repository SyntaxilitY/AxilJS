import { tHttp, tAuth, tRole, tPaginated } from '@axiljs/decorator'
import type { DB } from '../db/connection.js'

export class AuditController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/audit' })
  @tAuth({ required: true })
  @tRole('admin')
  @tPaginated({ strategy: 'offset', defaultLimit: 50 })
  async findAll() {
    return { items: this.db.auditLog, total: this.db.auditLog.length, page: 1, limit: 50 }
  }
}