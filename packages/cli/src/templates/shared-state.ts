/**
 * Files shared by the templates meant for multi-instance deployment
 * (saas-api, high-scale-api):
 *
 * - src/shared-state.ts: one database connection (DATABASE_URL) holding the
 *   @axiljs/stores tables, installed into @axiljs/runtime with useStores()
 * - src/shared-state.test.ts: driver selection + the tables on SQLite :memory:
 * - src/dev/studio-intent.ts: Studio's intent endpoint, loaded only outside
 *   production with a dynamic require (Studio is a devDependency)
 */

import type { TemplateContext } from './types'

/** Runtime dependencies the files below import. */
export function sharedStateDependencies(ctx: TemplateContext): Record<string, string> {
  return {
    '@axiljs/orm':     ctx.axilRange,
    '@axiljs/runtime': ctx.axilRange,
    '@axiljs/stores':  ctx.axilRange,
    'better-sqlite3':  '^13.0.3'
  }
}

/** Default DATABASE_URL: a SQLite file next to package.json. */
export const SHARED_STATE_DEFAULT_URL = 'sqlite:./shared-state.db'

export function sharedStateFiles(): Record<string, string> {
  return {
    'src/shared-state.ts': `/**
 * Shared state for running several instances (worker processes or servers).
 *
 * @axiljs/runtime keeps the state behind tRateLimit / tThrottle, tIdempotent,
 * tCache / tCachePut / tCacheEvict and tLock in process memory by default, so
 * every instance would have its own copy. openSharedState() moves it into SQL
 * tables (axil_rate_limits, axil_idempotency, axil_cache, axil_locks, ...)
 * created on startup; every instance pointed at the same DATABASE_URL shares
 * one view of it.
 *
 * DATABASE_URL:
 *   sqlite:./shared-state.db             one machine (processes share the file)
 *   postgres://user:pass@host:5432/db    several servers (npm install pg)
 *   mysql://user:pass@host:3306/db       MySQL 8 (npm install mysql2)
 */

import { createConnection } from '@axiljs/orm'
import type { ConnectionManager } from '@axiljs/orm'
import { useStores } from '@axiljs/runtime'
import { createSqlStores, fromConnection } from '@axiljs/stores'

export type SqlStores = ReturnType<typeof createSqlStores>

export interface SharedState {
  db:     ConnectionManager
  stores: SqlStores
  /** Stop the stores' timers, then close the connection. */
  close(): Promise<void>
}

export type SharedStateConnection =
  | { driver: 'postgres' | 'mysql'; url: string }
  | { driver: 'sqlite'; filename: string }

/** DATABASE_URL -> connection config. Anything not postgres:// or mysql:// is a SQLite file. */
export function connectionConfig(url: string): SharedStateConnection {
  if (/^postgres(ql)?:\\/\\//i.test(url)) return { driver: 'postgres', url }
  if (/^mysql:\\/\\//i.test(url))         return { driver: 'mysql', url }
  return { driver: 'sqlite', filename: url.replace(/^sqlite:(\\/\\/)?/i, '') || ':memory:' }
}

export interface SharedStateOptions {
  /** Install the stores into @axiljs/runtime (default true; tests pass false). */
  install?: boolean
}

export async function openSharedState(url: string, options: SharedStateOptions = {}): Promise<SharedState> {
  const db     = await createConnection(connectionConfig(url))
  const stores = createSqlStores(fromConnection(db))
  await stores.ensureSchema()
  if (options.install !== false) useStores(stores)

  return {
    db,
    stores,
    async close() {
      stores.close()          // timers only; never closes the connection
      await db.disconnect()
    }
  }
}
`,

    'src/shared-state.test.ts': `import { describe, it, expect } from '@axiljs/testing'
import { connectionConfig, openSharedState } from './shared-state.js'

describe('shared state', () => {
  it('picks the driver from DATABASE_URL', () => {
    expect(connectionConfig('${SHARED_STATE_DEFAULT_URL}')).toEqual({ driver: 'sqlite', filename: './shared-state.db' })
    expect(connectionConfig('sqlite::memory:')).toEqual({ driver: 'sqlite', filename: ':memory:' })
    expect(connectionConfig('postgres://app@db.internal:5432/app').driver).toBe('postgres')
    expect(connectionConfig('mysql://app@db.internal:3306/app').driver).toBe('mysql')
  })

  it('creates the store tables and counts through them', async () => {
    // install: false keeps the runtime's in-memory stores for the other tests
    const state = await openSharedState('sqlite::memory:', { install: false })
    try {
      const { rows } = await state.db.getDriver().query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
      const names = rows.map(r => r.name)
      for (const table of state.stores.tables) expect(names).toContain(table)

      await state.stores.rateLimit.increment('test:key', 60_000)
      const second = await state.stores.rateLimit.increment('test:key', 60_000)
      expect(second.count).toBe(2)
    } finally {
      await state.close()
    }
  })
})
`,

    'src/dev/studio-intent.ts': `/**
 * Development only: serves @axiljs/runtime's intent report (contract
 * violations, SLOs, circuit states) to Studio's Intent view. \`axil run\`
 * starts Studio on PORT + 1 and reads it from GET /__axil/studio/intent.
 *
 * @axiljs/studio is a devDependency, so it is never imported statically:
 * it is required at runtime, only when NODE_ENV is not production, and only
 * its dependency-free intent module. A production install without dev
 * dependencies (npm ci --omit=dev) never touches it.
 */

import { createRequire } from 'node:module'
import type { MiddlewareFn } from '@axiljs/core'

export function studioIntentEndpoint(): MiddlewareFn | undefined {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const require = createRequire(import.meta.url)
      const studio  = require('@axiljs/studio/dist/intent') as { intentEndpoint(): MiddlewareFn }
      return studio.intentEndpoint()
    } catch {
      // Studio is not installed (dev dependencies omitted): nothing to serve
    }
  }
  return undefined
}
`
  }
}
