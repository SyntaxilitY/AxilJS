/**
 * SQL-backed counters for @axiljs/ai's `withBudget()` (`BudgetStore`).
 *
 * One row per (scope, window name, window start) holds the running token,
 * cost and request totals. `add` is a single atomic upsert on PostgreSQL and
 * SQLite, so any number of servers sharing the table enforce one budget.
 * Amounts may be negative: withBudget reserves an estimate up front and
 * later adds the (possibly negative) difference to the actual usage, or the
 * negated estimate to release it.
 *
 * Costs are stored as an exact DECIMAL(30,12) (PostgreSQL NUMERIC, MySQL
 * DECIMAL; SQLite keeps them as REAL), i.e. to the pico-dollar, and come back
 * as JS numbers. Tokens and requests are BIGINT.
 */

import {
  SqlExecutor,
  StoreOptions,
  checkIdentifier,
  keyType,
  lazySchema,
  num,
  runDdl,
  runSql,
  runTx,
  startCleanup,
  storageKey
} from './executor';

/** Same shape as @axiljs/ai's `BudgetAmounts`. */
export interface SqlBudgetAmounts {
  tokens: number;
  costUsd: number;
  requests: number;
}

/** Same shape as @axiljs/ai's `BudgetWindowRef` (`name` is 'minute' | 'hour' | 'day' | 'month'). */
export interface SqlBudgetWindow {
  name: string;
  /** Epoch ms, inclusive. */
  start: number;
  /** Epoch ms, exclusive; rows are removed by `cleanup()` once this has passed. */
  end: number;
}

export interface SqlBudgetStoreOptions extends StoreOptions {
  /**
   * Keep rows this long after their window ends before `cleanup()` removes
   * them, e.g. for usage reports (default 0).
   */
  retainMs?: number;
}

const COST_SCALE = 12;
const WINDOW_NAME = /^[A-Za-z0-9_-]{1,32}$/;

/** Round to an integer symmetrically, so +x and -x cancel exactly. */
function integer(value: number, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`@axiljs/stores: budget ${what} must be a finite number (got ${String(value)})`);
  }
  return Math.sign(value) * Math.round(Math.abs(value));
}

function cost(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`@axiljs/stores: budget costUsd must be a finite number (got ${String(value)})`);
  }
  return value;
}

/** Read a DECIMAL / REAL cost column; trims binary float noise from SQLite sums. */
function readCost(value: unknown): number {
  const n = num(value ?? 0);
  return Number(n.toFixed(COST_SCALE)) || 0;
}

function readInt(value: unknown): number {
  return num(value ?? 0) || 0;
}

interface Row { tokens: unknown; cost_usd: unknown; requests: unknown }

function totals(row: Row | undefined): SqlBudgetAmounts {
  return row
    ? { tokens: readInt(row.tokens), costUsd: readCost(row.cost_usd), requests: readInt(row.requests) }
    : { tokens: 0, costUsd: 0, requests: 0 };
}

export class SqlBudgetStore {
  readonly table: string;
  private readonly now: () => number;
  private readonly retainMs: number;
  private readonly stopCleanup: () => void;
  readonly ensureSchema: () => Promise<void>;

  constructor(private readonly executor: SqlExecutor, options: SqlBudgetStoreOptions = {}) {
    this.table = checkIdentifier(options.table ?? 'axil_ai_budget');
    this.now = options.now ?? Date.now;
    this.retainMs = Math.max(0, options.retainMs ?? 0);
    this.ensureSchema = lazySchema(() => this.createSchema());
    this.stopCleanup = startCleanup(options.cleanupIntervalMs, () => this.cleanup());
  }

  /** Atomically add `amounts` (which may be negative) and return the window's new totals. */
  async add(scope: string, window: SqlBudgetWindow, amounts: SqlBudgetAmounts): Promise<SqlBudgetAmounts> {
    const key = this.key(scope, window);
    const tokens = integer(amounts.tokens ?? 0, 'tokens');
    const usd = cost(amounts.costUsd ?? 0);
    const requests = integer(amounts.requests ?? 0, 'requests');
    await this.ensureSchema();
    const t = this.table;
    const params = [...key, tokens, usd, requests, integer(window.end, 'window end')];

    if (this.executor.dialect === 'mysql') {
      // No RETURNING on MySQL: the upsert holds the row lock until commit, so
      // the SELECT in the same transaction reads exactly this increment.
      return runTx(this.executor, async q => {
        await runSql(
          q,
          `INSERT INTO ${t} (scope, window_name, window_start, tokens, cost_usd, requests, window_end) ` +
            `VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ` +
            `tokens = tokens + VALUES(tokens), cost_usd = cost_usd + VALUES(cost_usd), requests = requests + VALUES(requests)`,
          params
        );
        const { rows } = await runSql<Row>(
          q,
          `SELECT tokens, cost_usd, requests FROM ${t} WHERE scope = ? AND window_name = ? AND window_start = ?`,
          key
        );
        return totals(rows[0]);
      });
    }

    const { rows } = await runSql<Row>(
      this.executor,
      `INSERT INTO ${t} (scope, window_name, window_start, tokens, cost_usd, requests, window_end) ` +
        `VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (scope, window_name, window_start) DO UPDATE SET ` +
        `tokens = ${t}.tokens + excluded.tokens, cost_usd = ${t}.cost_usd + excluded.cost_usd, ` +
        `requests = ${t}.requests + excluded.requests ` +
        `RETURNING tokens, cost_usd, requests`,
      params
    );
    return totals(rows[0]);
  }

  /** Current totals for the window (zeros when nothing was recorded). */
  async get(scope: string, window: SqlBudgetWindow): Promise<SqlBudgetAmounts> {
    const key = this.key(scope, window);
    await this.ensureSchema();
    const { rows } = await runSql<Row>(
      this.executor,
      `SELECT tokens, cost_usd, requests FROM ${this.table} WHERE scope = ? AND window_name = ? AND window_start = ?`,
      key
    );
    return totals(rows[0]);
  }

  /** Delete rows whose window ended (more than `retainMs` ago). */
  async cleanup(): Promise<number | undefined> {
    await this.ensureSchema();
    const { affectedRows } = await runSql(
      this.executor,
      `DELETE FROM ${this.table} WHERE window_end <= ?`,
      [this.now() - this.retainMs]
    );
    return affectedRows;
  }

  /** Stop the cleanup timer. Idempotent; does not close the database connection. */
  close(): void {
    this.stopCleanup();
  }

  private key(scope: string, window: SqlBudgetWindow): [string, string, number] {
    const name = String(window?.name);
    if (!WINDOW_NAME.test(name)) {
      throw new Error(`@axiljs/stores: invalid budget window name '${name}'`);
    }
    return [storageKey(scope), name, integer(window.start, 'window start')];
  }

  private createSchema(): Promise<void> {
    const d = this.executor.dialect;
    const t = this.table;
    const costType = d === 'postgres' ? `NUMERIC(30, ${COST_SCALE})` : `DECIMAL(30, ${COST_SCALE})`;
    const columns =
      `scope ${keyType(d)} NOT NULL, window_name VARCHAR(32) NOT NULL, window_start BIGINT NOT NULL, ` +
      `tokens BIGINT NOT NULL, cost_usd ${costType} NOT NULL, requests BIGINT NOT NULL, window_end BIGINT NOT NULL, ` +
      `PRIMARY KEY (scope, window_name, window_start)`;
    if (d === 'mysql') {
      return runDdl(this.executor, [
        `CREATE TABLE IF NOT EXISTS ${t} (${columns}, INDEX idx_window_end (window_end))`
      ]);
    }
    return runDdl(this.executor, [
      `CREATE TABLE IF NOT EXISTS ${t} (${columns})`,
      `CREATE INDEX IF NOT EXISTS ${t}_window_end_idx ON ${t} (window_end)`
    ]);
  }
}
