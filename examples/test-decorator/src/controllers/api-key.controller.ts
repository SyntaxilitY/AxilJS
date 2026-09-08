/**
 * ApiKeyController — demonstrates Compliance semantics (tSensitive/tRedact/tAudit).
 */

import { tHttp, tParam, tAuth, tRole, tAudit, tRedact } from '@axiljs/decorator'
import type { DB } from '../db/connection.js'
import { nextId } from '../db/connection.js'

export class ApiKeyController {
  constructor(private db: DB) {}

  @tHttp({ method: 'GET', path: '/api/keys' })
  @tAuth({ required: true })
  async findAll() {
    return { items: Array.from(this.db.apiKeys.values()).map(k => ({ id: k.id, prefix: k.prefix })) }
  }

  @tHttp({ method: 'POST', path: '/api/keys' })
  @tAuth({ required: true })
  @tRole('admin')
  @tAudit({ action: 'apikey.created', compliance: ['SOC2'], sensitivity: 'high' })
  async create() {
    const id = nextId(this.db, 'apiKeys')
    const key = `axil_live_${Math.random().toString(36).slice(2)}`
    this.db.apiKeys.set(id, { id, prefix: 'axil_live', key })
    return { id, prefix: 'axil_live', key }
  }

  @tHttp({ method: 'DELETE', path: '/api/keys/:id' })
  @tAuth({ required: true })
  @tRole('admin')
  @tAudit({ action: 'apikey.revoked', compliance: ['SOC2'] })
  @tParam('id')
  async revoke(id: string) {
    this.db.apiKeys.delete(Number(id))
    return { id, revoked: true }
  }
}

// Field-level redaction reference, applied on the persisted shape:
class ApiKeyRecordShape {
  @tRedact({ strategy: 'mask', visibleChars: 4 })
  key!: string
}
void ApiKeyRecordShape