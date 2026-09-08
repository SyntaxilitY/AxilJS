/**
 * A minimal audit sink consumer.
 * Reads `tAudit`, `tSensitive`, `tRedact` metadata.
 */

import type { TAuditOptions } from '@axiljs/decorator'
import type { DB } from '../db/connection.js'

export function recordAudit(
  db: DB,
  options: TAuditOptions,
  context: { actorId?: number | string; ip?: string; method: string; path: string }
): void {
  const entry = {
    id: db.auditLog.length + 1,
    action: options.action,
    compliance: options.compliance ?? [],
    sensitivity: options.sensitivity ?? 'low',
    actorId: context.actorId ?? 'anonymous',
    ip: context.ip ?? 'unknown',
    method: context.method,
    path: context.path,
    at: new Date().toISOString()
  }

  db.auditLog.push(entry)

  // In production this would forward to `@axiljs/cloud` audit sinks.
  console.log(`[audit] ${entry.action}`, { actor: entry.actorId, path: entry.path })
}