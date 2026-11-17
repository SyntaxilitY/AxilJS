/**
 * QueueBackend on a SQL table (PostgreSQL, MySQL 8, SQLite).
 *
 * Several Queue instances (in one process or on different servers) that use
 * the same table and queue name share the work: `claim()` moves due jobs to
 * 'active' in one atomic step, so every job is handed to exactly one worker.
 *
 *   postgres  UPDATE ... WHERE id = ANY(ARRAY(SELECT ... FOR UPDATE SKIP LOCKED)) RETURNING *
 *   mysql 8   transaction: SELECT ... FOR UPDATE SKIP LOCKED, then UPDATE
 *             (without executor.transaction: per-row compare-and-set UPDATEs)
 *   sqlite    UPDATE ... WHERE id IN (SELECT ... LIMIT n) RETURNING *
 *             (SQLite has a single writer, so the statement is atomic)
 *
 * The package has no database dependency: you pass an executor that runs
 * parameterised SQL (placeholders are written as `?`; for postgres they are
 * rewritten to $1, $2, ...). An @axiljs/orm connection fits directly, see
 * the README.
 *
 * Times are stored as BIGINT epoch milliseconds. Job `data` and `result` are
 * stored as JSON text.
 */

import { Job, JobStatus } from './job';
import { QueueBackend, JobFilter, JobCounts, emptyCounts, STALLED_MESSAGE } from './backend';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

export interface SqlQueryResult {
  rows: Record<string, unknown>[];
  // Rows changed by INSERT/UPDATE/DELETE. Needed for mysql (no RETURNING).
  affectedRows?: number;
}

export interface SqlQueryable {
  query(sql: string, params?: unknown[]): Promise<SqlQueryResult>;
}

export interface SqlExecutor extends SqlQueryable {
  dialect: SqlDialect;

  // Run `fn` in one transaction on one connection (COMMIT on success,
  // ROLLBACK on error). Used by mysql to claim with FOR UPDATE SKIP LOCKED.
  // Not used by postgres or sqlite.
  transaction?<T>(fn: (trx: SqlQueryable) => Promise<T>): Promise<T>;
}

export interface SqlQueueBackendOptions {
  executor: SqlExecutor;

  // Table name (default: 'axil_jobs'). Letters, digits and underscores,
  // optionally schema-qualified ('jobs.axil_jobs').
  table?: string;

  // Create the table and indexes on first use (default: true)
  autoCreate?: boolean;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,47}(\.[A-Za-z_][A-Za-z0-9_]{0,47})?$/;

const CLAIMABLE = `status IN ('pending', 'delayed')`;
const FINISHED  = `status IN ('completed', 'failed', 'cancelled')`;
const ORDER     = 'ORDER BY priority DESC, seq';

/** Run a query outside @axiljs/runtime's intent checks (queue bookkeeping). */
function unreported<T>(fn: () => Promise<T>): Promise<T> {
  const wrap = (globalThis as any)[Symbol.for('axiljs.intent.unreported')];
  return typeof wrap === 'function' ? wrap(fn) : fn();
}

export class SqlQueueBackend implements QueueBackend {
  readonly table: string;
  readonly dialect: SqlDialect;
  private readonly executor: SqlExecutor;
  private readonly autoCreate: boolean;
  private ready?: Promise<void>;

  constructor(options: SqlQueueBackendOptions) {
    if (!options || !options.executor || typeof options.executor.query !== 'function') {
      throw new Error('SqlQueueBackend: options.executor with a query(sql, params) function is required');
    }
    const dialect = options.executor.dialect;
    if (dialect !== 'postgres' && dialect !== 'mysql' && dialect !== 'sqlite') {
      throw new Error(`SqlQueueBackend: unsupported dialect '${String(dialect)}' (use postgres, mysql or sqlite)`);
    }
    const table = options.table ?? 'axil_jobs';
    if (typeof table !== 'string' || !IDENTIFIER.test(table)) {
      throw new Error(`SqlQueueBackend: invalid table name '${String(table)}'`);
    }
    this.executor = options.executor;
    this.dialect = dialect;
    this.table = table;
    this.autoCreate = options.autoCreate ?? true;
  }

  // ─── Schema ─────────────────────────────────────────────────────────────────

  /**
   * Create the table and indexes if they don't exist. Called lazily before
   * the first query; call it yourself to fail fast at startup.
   */
  init(): Promise<void> {
    if (!this.ready) {
      this.ready = this.createSchema().catch(err => {
        this.ready = undefined; // allow a later retry
        throw err;
      });
    }
    return this.ready;
  }

  /** The CREATE statements `init()` runs, e.g. for a migration file. */
  schemaStatements(): string[] {
    const t = this.table;
    const idx = t.replace('.', '_');
    const text = this.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT';
    const real = this.dialect === 'postgres' ? 'DOUBLE PRECISION' : this.dialect === 'mysql' ? 'DOUBLE' : 'REAL';
    const seq = this.dialect === 'postgres' ? 'seq BIGSERIAL PRIMARY KEY'
      : this.dialect === 'mysql' ? 'seq BIGINT AUTO_INCREMENT PRIMARY KEY'
      : 'seq INTEGER PRIMARY KEY AUTOINCREMENT';

    const columns = [
      seq,
      'id VARCHAR(64) NOT NULL UNIQUE',
      'queue VARCHAR(191) NOT NULL',
      'name VARCHAR(191) NOT NULL',
      `data ${text}`,
      'status VARCHAR(16) NOT NULL',
      'attempts INTEGER NOT NULL DEFAULT 0',
      'max_attempts INTEGER NOT NULL',
      'delay_ms BIGINT NOT NULL DEFAULT 0',
      `priority ${real} NOT NULL DEFAULT 0`,
      'created_at BIGINT NOT NULL',
      'started_at BIGINT',
      'finished_at BIGINT',
      'run_at BIGINT NOT NULL',
      'timeout_ms BIGINT',
      `error ${text}`,
      `stack ${text}`,
      `result ${text}`,
      'locked_by VARCHAR(191)',
      'locked_at BIGINT'
    ];

    if (this.dialect === 'mysql') {
      // MySQL has no CREATE INDEX IF NOT EXISTS; declare indexes inline
      return [
        `CREATE TABLE IF NOT EXISTS ${t} (\n  ${columns.join(',\n  ')},\n` +
        `  INDEX ${idx}_claim (queue, status, priority DESC, run_at),\n` +
        `  INDEX ${idx}_lock (status, locked_at)\n)`
      ];
    }

    return [
      `CREATE TABLE IF NOT EXISTS ${t} (\n  ${columns.join(',\n  ')}\n)`,
      `CREATE INDEX IF NOT EXISTS ${idx}_claim ON ${t} (queue, status, priority DESC, run_at)`,
      `CREATE INDEX IF NOT EXISTS ${idx}_lock ON ${t} (status, locked_at)`
    ];
  }

  private async createSchema(): Promise<void> {
    if (!this.autoCreate) return;
    for (const sql of this.schemaStatements()) {
      try {
        await this.raw(this.executor, sql);
      } catch (err) {
        // Two servers creating the same table concurrently can make one of
        // them fail (postgres: duplicate pg_type). Fine if the table is there.
        try {
          await this.raw(this.executor, `SELECT 1 FROM ${this.table} WHERE 1 = 0`);
        } catch {
          throw err;
        }
      }
    }
  }

  // ─── QueueBackend ───────────────────────────────────────────────────────────

  async enqueue(job: Job): Promise<void> {
    await this.q(
      `INSERT INTO ${this.table} (id, queue, name, data, status, attempts, max_attempts, delay_ms, priority, ` +
      `created_at, started_at, finished_at, run_at, timeout_ms, error, stack, result) ` +
      `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id, job.queue, job.name, toJson(job.data), job.status, job.attempts, job.maxAttempts,
        job.delay ?? 0, job.priority, ms(job.createdAt), ms(job.startedAt), ms(job.finishedAt),
        ms(job.runAt), job.timeoutMs ?? null, job.error ?? null, job.stack ?? null, toJson(job.result)
      ]
    );
  }

  async claim(queue: string, workerId: string, limit: number, now: Date): Promise<Job[]> {
    const n = Math.floor(limit);
    if (!(n > 0)) return [];
    await this.init();
    const at = now.getTime();
    const t = this.table;
    const set = `status = 'active', locked_by = ?, locked_at = ?, started_at = ?, attempts = attempts + 1`;
    const pick = `SELECT id FROM ${t} WHERE queue = ? AND ${CLAIMABLE} AND run_at <= ? ${ORDER} LIMIT ${n}`;

    if (this.dialect === 'postgres') {
      // ARRAY(...) runs the locking subquery exactly once (an IN (...) subquery
      // with LIMIT may be re-evaluated by the planner)
      const { rows } = await this.raw(this.executor,
        `UPDATE ${t} SET ${set} WHERE id = ANY(ARRAY(${pick} FOR UPDATE SKIP LOCKED)) RETURNING *`,
        [workerId, at, at, queue, at]
      );
      return sortClaimed(rows).map(rowToJob);
    }

    if (this.dialect === 'sqlite') {
      const { rows } = await this.raw(this.executor,
        `UPDATE ${t} SET ${set} WHERE id IN (${pick}) RETURNING *`,
        [workerId, at, at, queue, at]
      );
      return sortClaimed(rows).map(rowToJob);
    }

    // mysql
    if (this.executor.transaction) {
      const rows = await unreported(() => this.executor.transaction!(async trx => {
        const picked = await this.raw(trx, `${pick} FOR UPDATE SKIP LOCKED`, [queue, at]);
        const ids = picked.rows.map(r => String(r.id));
        if (ids.length === 0) return [];
        const marks = ids.map(() => '?').join(', ');
        await this.raw(trx, `UPDATE ${t} SET ${set} WHERE id IN (${marks})`, [workerId, at, at, ...ids]);
        return (await this.raw(trx, `SELECT * FROM ${t} WHERE id IN (${marks}) ${ORDER}`, ids)).rows;
      }));
      return rows.map(rowToJob);
    }

    // No transaction support: compare-and-set each candidate. A row another
    // worker took first no longer matches the WHERE clause (0 rows changed).
    const picked = await this.q(pick, [queue, at]);
    const won: string[] = [];
    for (const row of picked.rows) {
      const id = String(row.id);
      const res = await this.q(
        `UPDATE ${t} SET ${set} WHERE id = ? AND ${CLAIMABLE} AND run_at <= ?`,
        [workerId, at, at, id, at]
      );
      if ((res.affectedRows ?? 0) > 0) won.push(id);
    }
    if (won.length === 0) return [];
    const marks = won.map(() => '?').join(', ');
    return (await this.q(`SELECT * FROM ${t} WHERE id IN (${marks}) ${ORDER}`, won)).rows.map(rowToJob);
  }

  complete(job: Job, workerId: string): Promise<boolean> {
    return this.finish(job, workerId);
  }

  fail(job: Job, workerId: string): Promise<boolean> {
    return this.finish(job, workerId);
  }

  retry(job: Job, workerId: string): Promise<boolean> {
    return this.finish(job, workerId);
  }

  async update(job: Job): Promise<void> {
    const lockClear = job.status === 'active' ? '' : ', locked_by = NULL, locked_at = NULL';
    await this.q(
      `UPDATE ${this.table} SET ${MUTABLE}${lockClear} WHERE id = ?`,
      [...mutableValues(job), job.id]
    );
  }

  async cancel(id: string, now: Date): Promise<Job | undefined> {
    const sql =
      `UPDATE ${this.table} SET status = 'cancelled', finished_at = ?, locked_by = NULL, locked_at = NULL ` +
      `WHERE id = ? AND status IN ('pending', 'delayed', 'active')`;
    if (this.dialect !== 'mysql') {
      const { rows } = await this.q(`${sql} RETURNING *`, [now.getTime(), id]);
      return rows.length ? rowToJob(rows[0]) : undefined;
    }
    const res = await this.q(sql, [now.getTime(), id]);
    if (res.affectedRows === 0) return undefined;
    const job = await this.get(id);
    return job && job.status === 'cancelled' ? job : undefined;
  }

  async heartbeat(workerId: string, ids: string[], now: Date): Promise<string[]> {
    if (ids.length === 0) return [];
    const marks = ids.map(() => '?').join(', ');
    const where = `WHERE locked_by = ? AND status = 'active' AND id IN (${marks})`;
    const sql = `UPDATE ${this.table} SET locked_at = ? ${where}`;
    const params = [now.getTime(), workerId, ...ids];
    if (this.dialect !== 'mysql') {
      return (await this.q(`${sql} RETURNING id`, params)).rows.map(r => String(r.id));
    }
    await this.q(sql, params);
    return (await this.q(`SELECT id FROM ${this.table} ${where}`, [workerId, ...ids])).rows.map(r => String(r.id));
  }

  async recoverStale(olderThanMs: number, now: Date = new Date(), queue?: string): Promise<number> {
    const cutoff = now.getTime() - Math.max(0, olderThanMs);
    const scope = queue === undefined ? '' : 'queue = ? AND ';
    const scopeParams = queue === undefined ? [] : [queue];
    const stale = `${scope}status = 'active' AND (locked_at IS NULL OR locked_at < ?)`;

    // Out of attempts: fail instead of running an extra attempt
    const failed = await this.changed(
      `UPDATE ${this.table} SET status = 'failed', finished_at = ?, error = ?, locked_by = NULL, locked_at = NULL ` +
      `WHERE ${stale} AND attempts >= max_attempts`,
      [now.getTime(), STALLED_MESSAGE, ...scopeParams, cutoff]
    );
    const requeued = await this.changed(
      `UPDATE ${this.table} SET status = 'pending', locked_by = NULL, locked_at = NULL ` +
      `WHERE ${stale} AND attempts < max_attempts`,
      [...scopeParams, cutoff]
    );
    return failed + requeued;
  }

  async get(id: string): Promise<Job | undefined> {
    const { rows } = await this.q(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);
    return rows.length ? rowToJob(rows[0]) : undefined;
  }

  async list(filter: JobFilter = {}): Promise<Job[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.queue !== undefined) {
      where.push('queue = ?');
      params.push(filter.queue);
    }
    if (filter.status !== undefined) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (statuses.length === 0) return [];
      where.push(`status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
    if (filter.ids !== undefined) {
      if (filter.ids.length === 0) return [];
      where.push(`id IN (${filter.ids.map(() => '?').join(', ')})`);
      params.push(...filter.ids);
    }
    let sql = `SELECT * FROM ${this.table}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ${ORDER}`;
    const limit = filter.limit === undefined ? undefined : Math.max(0, Math.floor(filter.limit));
    const offset = Math.max(0, Math.floor(filter.offset ?? 0));
    if (limit !== undefined) sql += ` LIMIT ${limit}`;
    if (offset > 0) {
      // OFFSET without LIMIT: mysql/sqlite need a LIMIT clause
      if (limit === undefined) sql += this.dialect === 'postgres' ? '' : ' LIMIT 9223372036854775807';
      sql += ` OFFSET ${offset}`;
    }
    return (await this.q(sql, params)).rows.map(rowToJob);
  }

  async counts(queue: string): Promise<JobCounts> {
    const { rows } = await this.q(
      `SELECT status, COUNT(*) AS n FROM ${this.table} WHERE queue = ? GROUP BY status`,
      [queue]
    );
    const counts = emptyCounts();
    for (const row of rows) {
      const status = String(row.status) as JobStatus;
      if (status in counts) counts[status] = Number(row.n);
    }
    return counts;
  }

  async remove(id: string): Promise<void> {
    await this.q(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
  }

  async purge(queue: string, keepIds: string[] = []): Promise<number> {
    const keep = keepIds.length ? ` AND id NOT IN (${keepIds.map(() => '?').join(', ')})` : '';
    return this.changed(
      `DELETE FROM ${this.table} WHERE queue = ? AND ${FINISHED}${keep}`,
      [queue, ...keepIds]
    );
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  // Fenced write of an attempt's final state
  private async finish(job: Job, workerId: string): Promise<boolean> {
    const sql =
      `UPDATE ${this.table} SET ${MUTABLE}, locked_by = NULL, locked_at = NULL ` +
      `WHERE id = ? AND status = 'active' AND locked_by = ?`;
    const params = [...mutableValues(job), job.id, workerId];
    if (this.dialect !== 'mysql') {
      return (await this.q(`${sql} RETURNING id`, params)).rows.length > 0;
    }
    const res = await this.q(sql, params);
    // An executor that doesn't report affectedRows can't fence; assume owned
    return res.affectedRows === undefined ? true : res.affectedRows > 0;
  }

  // Rows changed by a write (RETURNING on postgres/sqlite, affectedRows on mysql)
  private async changed(sql: string, params: unknown[]): Promise<number> {
    if (this.dialect !== 'mysql') {
      return (await this.q(`${sql} RETURNING id`, params)).rows.length;
    }
    return (await this.q(sql, params)).affectedRows ?? 0;
  }

  private async q(sql: string, params: unknown[] = []): Promise<SqlQueryResult> {
    await this.init();
    return this.raw(this.executor, sql, params);
  }

  private raw(target: SqlQueryable, sql: string, params: unknown[] = []): Promise<SqlQueryResult> {
    const text = this.dialect === 'postgres' ? toPositional(sql) : sql;
    return unreported(() => target.query(text, params));
  }
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

const MUTABLE =
  'status = ?, attempts = ?, run_at = ?, started_at = ?, finished_at = ?, error = ?, stack = ?, result = ?';

function mutableValues(job: Job): unknown[] {
  return [
    job.status, job.attempts, ms(job.runAt), ms(job.startedAt), ms(job.finishedAt),
    job.error ?? null, job.stack ?? null, toJson(job.result)
  ];
}

// `?` → `$1, $2, ...` (the SQL built here never has `?` inside literals)
function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function ms(date: Date | undefined): number | null {
  return date ? date.getTime() : null;
}

function toJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : text;
  } catch {
    return null; // not serializable (circular, BigInt): not persisted
  }
}

function fromJson(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value; // driver already decoded JSON
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function optDate(value: unknown): Date | undefined {
  return value === null || value === undefined ? undefined : new Date(num(value));
}

function sortClaimed(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => num(b.priority) - num(a.priority) || num(a.seq) - num(b.seq));
}

function rowToJob(row: Record<string, unknown>): Job {
  const job: Job = {
    id: String(row.id),
    queue: String(row.queue),
    name: String(row.name),
    data: fromJson(row.data),
    status: String(row.status) as JobStatus,
    attempts: num(row.attempts),
    maxAttempts: num(row.max_attempts),
    delay: num(row.delay_ms ?? 0),
    priority: num(row.priority),
    createdAt: new Date(num(row.created_at)),
    runAt: new Date(num(row.run_at))
  };
  const startedAt = optDate(row.started_at);
  if (startedAt) job.startedAt = startedAt;
  const finishedAt = optDate(row.finished_at);
  if (finishedAt) job.finishedAt = finishedAt;
  if (row.error !== null && row.error !== undefined) job.error = String(row.error);
  if (row.stack !== null && row.stack !== undefined) job.stack = String(row.stack);
  const result = fromJson(row.result);
  if (result !== undefined) job.result = result;
  if (row.timeout_ms !== null && row.timeout_ms !== undefined) job.timeoutMs = num(row.timeout_ms);
  return job;
}
