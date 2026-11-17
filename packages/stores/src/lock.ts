/**
 * Distributed locks for tLock (@axiljs/runtime `LockProvider`).
 *
 * - `SqlLockProvider`: portable lease table on postgres, mysql and sqlite.
 * - `PgAdvisoryLockProvider`: postgres transaction-level advisory locks held
 *   on a dedicated pooled connection for the lifetime of the lock.
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  SqlExecutor,
  StoreOptions,
  checkIdentifier,
  keyType,
  lazySchema,
  runDdl,
  runSql,
  runTx,
  startCleanup,
  storageKey
} from './executor';

export interface LockAcquireOptions {
  /** Lease length; the lock lapses after this even if never released. */
  ttlMs: number;
  /** How long to keep trying before rejecting. */
  waitMs: number;
}

export type LockRelease = () => Promise<void>;

const FIRST_DELAY_MS = 10;
const MAX_DELAY_MS = 250;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Poll `attempt` with jittered exponential backoff until it yields or `waitMs` elapses. */
async function poll<T>(key: string, waitMs: number, attempt: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + Math.max(0, waitMs);
  let delay = FIRST_DELAY_MS;
  for (;;) {
    const got = await attempt();
    if (got !== undefined) return got;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`lock '${key}' unavailable after ${waitMs}ms`);
    await sleep(Math.min(remaining, delay * (0.5 + Math.random() * 0.5)));
    delay = Math.min(MAX_DELAY_MS, delay * 2);
  }
}

// ─── Lease table ──────────────────────────────────────────────────────────────

export interface SqlLockProviderOptions extends StoreOptions {}

export class SqlLockProvider {
  readonly table: string;
  private readonly now: () => number;
  private readonly stopCleanup: () => void;
  readonly ensureSchema: () => Promise<void>;

  constructor(private readonly executor: SqlExecutor, options: SqlLockProviderOptions = {}) {
    this.table = checkIdentifier(options.table ?? 'axil_locks');
    this.now = options.now ?? Date.now;
    this.ensureSchema = lazySchema(() => this.createSchema());
    this.stopCleanup = startCleanup(options.cleanupIntervalMs, () => this.cleanup());
  }

  /** Resolve with a release function once the lock is held, or reject after `waitMs`. */
  async acquire(key: string, { ttlMs, waitMs }: LockAcquireOptions): Promise<LockRelease> {
    await this.ensureSchema();
    const id = storageKey(key);
    const owner = randomBytes(16).toString('hex');
    await poll(key, waitMs, async () => (await this.tryAcquire(id, owner, ttlMs)) ? true : undefined);

    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await runSql(this.executor, `DELETE FROM ${this.table} WHERE id = ? AND owner = ?`, [id, owner]);
    };
  }

  /** Delete lapsed leases (they are also taken over on demand). */
  async cleanup(): Promise<number | undefined> {
    await this.ensureSchema();
    const { affectedRows } = await runSql(this.executor, `DELETE FROM ${this.table} WHERE expires_at <= ?`, [this.now()]);
    return affectedRows;
  }

  /** Stop the cleanup timer. Idempotent. Held leases are not released. */
  close(): void {
    this.stopCleanup();
  }

  private async tryAcquire(id: string, owner: string, ttlMs: number): Promise<boolean> {
    const now = this.now();
    const expires = now + ttlMs;
    const t = this.table;

    if (this.executor.dialect === 'mysql') {
      const inserted = await runSql(this.executor, `INSERT IGNORE INTO ${t} (id, owner, expires_at) VALUES (?, ?, ?)`, [id, owner, expires]);
      if ((inserted.affectedRows ?? 0) > 0) return true;
      const taken = await runSql(
        this.executor,
        `UPDATE ${t} SET owner = ?, expires_at = ? WHERE id = ? AND expires_at <= ?`,
        [owner, expires, id, now]
      );
      return (taken.affectedRows ?? 0) > 0;
    }

    const inserted = await runSql(
      this.executor,
      `INSERT INTO ${t} (id, owner, expires_at) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, owner, expires]
    );
    if (inserted.rows.length > 0) return true;
    // Take over only a lapsed lease; concurrent takers re-check the predicate
    const taken = await runSql(
      this.executor,
      `UPDATE ${t} SET owner = ?, expires_at = ? WHERE id = ? AND expires_at <= ? RETURNING id`,
      [owner, expires, id, now]
    );
    return taken.rows.length > 0;
  }

  private createSchema(): Promise<void> {
    const d = this.executor.dialect;
    const t = this.table;
    if (d === 'mysql') {
      return runDdl(this.executor, [
        `CREATE TABLE IF NOT EXISTS ${t} (id ${keyType(d)} NOT NULL PRIMARY KEY, owner VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL)`
      ]);
    }
    return runDdl(this.executor, [
      `CREATE TABLE IF NOT EXISTS ${t} (id ${keyType(d)} NOT NULL PRIMARY KEY, owner VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL)`
    ]);
  }
}

// ─── Postgres advisory locks ──────────────────────────────────────────────────

export interface PgAdvisoryLockProviderOptions {
  /** Mixed into the lock id hash so separate apps on one database don't collide. */
  namespace?: string;
}

/**
 * Lock ids are the first 8 bytes of SHA-256(namespace + key) as a signed
 * BIGINT. Each attempt opens a transaction (pinning one pooled connection)
 * and calls `pg_try_advisory_xact_lock`; on success the transaction stays
 * open until release or ttl, and COMMIT frees the lock. If the process dies
 * the connection closes and postgres frees the lock automatically.
 */
export class PgAdvisoryLockProvider {
  private readonly namespace: string;

  constructor(private readonly executor: SqlExecutor, options: PgAdvisoryLockProviderOptions = {}) {
    if (executor.dialect !== 'postgres') {
      throw new Error('@axiljs/stores: PgAdvisoryLockProvider requires a postgres executor');
    }
    if (typeof executor.transaction !== 'function') {
      throw new Error('@axiljs/stores: PgAdvisoryLockProvider requires an executor with transaction() (use fromConnection)');
    }
    this.namespace = options.namespace ?? 'axiljs';
  }

  /** The BIGINT advisory lock id used for `key` (as a decimal string). */
  lockId(key: string): string {
    return createHash('sha256').update(`${this.namespace}\0${key}`).digest().readBigInt64BE(0).toString();
  }

  async acquire(key: string, { ttlMs, waitMs }: LockAcquireOptions): Promise<LockRelease> {
    const lockId = this.lockId(key);
    return poll(key, waitMs, () => this.tryAcquire(lockId, ttlMs));
  }

  private async tryAcquire(lockId: string, ttlMs: number): Promise<LockRelease | undefined> {
    let settle!: (ok: boolean) => void;
    let fail!: (err: unknown) => void;
    const acquired = new Promise<boolean>((resolve, reject) => { settle = resolve; fail = reject; });
    let unhold!: () => void;
    const hold = new Promise<void>(r => { unhold = r; });

    const done = runTx(this.executor, async q => {
      const { rows } = await runSql<{ ok: unknown }>(q, 'SELECT pg_try_advisory_xact_lock(?::bigint) AS ok', [lockId]);
      const ok = rows[0]?.ok === true || rows[0]?.ok === 't';
      settle(ok);
      if (ok) await hold;
    });
    done.catch(fail);

    if (!(await acquired)) {
      await done;
      return undefined;
    }

    // Lapse after ttl like the other providers, so a hung holder can't block forever
    const timer = setTimeout(unhold, ttlMs);
    timer.unref?.();
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      unhold();
      await done.catch(() => {});
    };
  }
}
