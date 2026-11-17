/**
 * Migration safety analysis.
 *
 * Reads the SQL a migration is about to run and flags statements that take
 * heavy locks, rewrite whole tables or break application code that is still
 * deployed, together with the zero-downtime way to do the same change.
 * Purely static: nothing here touches a database.
 */

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite'
export type MigrationSeverity = 'error' | 'warning' | 'info'

export interface MigrationFinding {
  /** Stable rule id, e.g. `create-index-non-concurrent` */
  rule: string
  severity: MigrationSeverity
  /** The offending statement (comments removed, whitespace collapsed) */
  statement: string
  /** Position of the statement in the analyzed SQL (0-based) */
  statementIndex?: number
  table?: string
  /** Lock the statement takes, e.g. `ACCESS EXCLUSIVE` */
  lock?: string
  message: string
  fix: string
}

export interface AnalyzeMigrationOptions {
  dialect: SqlDialect
  /** Approximate row counts by table (`users` or `public.users`); escalates lock-duration findings */
  tableSizes?: Record<string, number>
  /** Row count above which lock-duration findings escalate one level. Default 1,000,000 */
  largeTableThreshold?: number
  /** The statements run inside a transaction (MigrationRunner wraps migrations in one by default) */
  inTransaction?: boolean
  /** Current column types (`table.column` → `varchar(50)`), used to recognise safe type widenings */
  columnTypes?: Record<string, string>
  /** Rule ids to skip entirely */
  ignore?: string[]
}

export interface SqlStatement {
  /** Statement text without comments, whitespace collapsed */
  sql: string
  /** Same, with string literals and dollar-quoted bodies blanked out (safe to keyword-match) */
  masked: string
  /** Comments that belong to the statement (leading ones, and a trailing `--` on the same line) */
  comments: string[]
}

export const DEFAULT_LARGE_TABLE_THRESHOLD = 1_000_000

// ── Statement splitting ───────────────────────────────────────────────────

/**
 * Split SQL into statements on top-level `;`, respecting single-quoted
 * strings (incl. E'' and MySQL backslash escapes), quoted identifiers,
 * PostgreSQL dollar-quoting and `--` / `#` (MySQL) / nested block comments.
 */
export function splitStatements(sql: string, dialect: SqlDialect = 'postgres'): SqlStatement[] {
  const out: SqlStatement[] = []
  const n = sql.length
  let clean = ''
  let masked = ''
  let comments: string[] = []
  let sameLineAsTerminator = false
  let i = 0

  const space = () => {
    if (clean && !clean.endsWith(' ')) clean += ' '
    if (masked && !masked.endsWith(' ')) masked += ' '
  }
  const push = () => {
    if (masked.trim()) out.push({ sql: clean.trim(), masked: masked.trim(), comments })
    clean = ''
    masked = ''
    comments = []
  }
  const isIdent = (ch: string | undefined) => !!ch && /[\w$]/.test(ch)

  while (i < n) {
    const c = sql[i]
    const next = sql[i + 1]

    // Line comment
    if ((c === '-' && next === '-') || (c === '#' && dialect === 'mysql')) {
      let j = sql.indexOf('\n', i)
      if (j < 0) j = n
      const text = sql.slice(i, j)
      if (sameLineAsTerminator && out.length) out[out.length - 1].comments.push(text)
      else comments.push(text)
      space()
      i = j
      continue
    }

    // Block comment (nested in PostgreSQL)
    if (c === '/' && next === '*') {
      let depth = 1
      let j = i + 2
      while (j < n && depth > 0) {
        if (dialect === 'postgres' && sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2 }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2 }
        else j++
      }
      comments.push(sql.slice(i, j))
      space()
      i = j
      continue
    }

    if (c === '\n') sameLineAsTerminator = false

    // String literal
    if (c === "'") {
      const prev = sql[i - 1]
      const backslash = dialect === 'mysql' || ((prev === 'E' || prev === 'e') && !isIdent(sql[i - 2]))
      let j = i + 1
      while (j < n) {
        if (backslash && sql[j] === '\\') { j += 2; continue }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue }
          break
        }
        j++
      }
      j = Math.min(j + 1, n)
      clean += sql.slice(i, j)
      masked += "''"
      i = j
      continue
    }

    // Quoted identifier
    if (c === '"' || (c === '`' && dialect !== 'postgres')) {
      let j = i + 1
      while (j < n) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue }
          break
        }
        j++
      }
      j = Math.min(j + 1, n)
      const text = sql.slice(i, j)
      clean += text
      masked += text
      i = j
      continue
    }

    // Dollar-quoted body: $$...$$ or $tag$...$tag$
    if (c === '$' && dialect === 'postgres' && !isIdent(sql[i - 1])) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 66))
      if (m) {
        const tag = m[0]
        const end = sql.indexOf(tag, i + tag.length)
        const j = end < 0 ? n : end + tag.length
        clean += sql.slice(i, j)
        masked += '$$ $$'
        i = j
        continue
      }
    }

    if (c === ';') {
      push()
      sameLineAsTerminator = true
      i++
      continue
    }

    if (/\s/.test(c)) { space(); i++; continue }

    clean += c
    masked += c
    i++
  }
  push()
  return out
}

// ── Helpers ───────────────────────────────────────────────────────────────

const ID = '(?:"(?:[^"]|"")+"|`[^`]+`|\\[[^\\]]+\\]|[A-Za-z_][\\w$]*)'
const QN = `${ID}(?:\\s*\\.\\s*${ID}){0,2}`

function unquote(part: string): string {
  const p = part.trim()
  if (p.startsWith('"')) return p.slice(1, -1).replace(/""/g, '"')
  if (p.startsWith('`') || p.startsWith('[')) return p.slice(1, -1)
  return p.toLowerCase()
}

/** `"Public".Users` → `Public.users` */
function normName(raw: string): string {
  return (raw.match(new RegExp(ID, 'g')) ?? [raw]).map(unquote).join('.')
}

function lastPart(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? name : name.slice(i + 1)
}

/** Text with every parenthesized group removed */
function topLevel(s: string): string {
  let depth = 0
  let out = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0) out += ch
  }
  return out
}

/** Split on commas that are not inside parentheses */
function splitTopLevel(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function allowedRules(comments: string[]): Set<string> {
  const allowed = new Set<string>()
  for (const c of comments) {
    const m = /axil:allow\s+([\w\s,-]+)/i.exec(c)
    if (m) for (const r of m[1].split(/[\s,]+/)) if (r) allowed.add(r.toLowerCase())
  }
  return allowed
}

interface ParsedType { base: string; a?: number; b?: number; array: boolean }

function parseType(raw: string): ParsedType | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/^character varying\b/, 'varchar')
    .replace(/^decimal\b/, 'numeric')
  const m = /^([a-z_][a-z0-9_ ]*?)\s*(?:\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?\s*(\[\])?$/.exec(s)
  if (!m) return null
  return {
    base:  m[1].trim(),
    a:     m[2] !== undefined ? Number(m[2]) : undefined,
    b:     m[3] !== undefined ? Number(m[3]) : undefined,
    array: !!m[4]
  }
}

/**
 * PostgreSQL type changes that need neither a rewrite nor a scan:
 * varchar(n) → varchar(m ≥ n) / varchar / text, varchar ↔ text,
 * numeric(p,s) → numeric(q ≥ p, s) / numeric, and no-op changes.
 */
export function isSafeTypeChange(from: string, to: string): boolean {
  const o = parseType(from)
  const t = parseType(to)
  if (!o || !t || o.array !== t.array) return false
  if (o.base === t.base && o.a === t.a && o.b === t.b) return true
  if (o.base === 'varchar') {
    if (t.base === 'text') return true
    if (t.base === 'varchar') return t.a === undefined || (o.a !== undefined && t.a >= o.a)
  }
  if (o.base === 'text' && t.base === 'varchar' && t.a === undefined) return true
  if (o.base === 'numeric' && t.base === 'numeric') {
    if (t.a === undefined && t.b === undefined) return true
    if (o.a !== undefined && t.a !== undefined && t.a >= o.a && (o.b ?? 0) === (t.b ?? 0)) return true
  }
  return false
}

const VOLATILE_FN = /\b(random|gen_random_uuid|uuid_generate_v1|uuid_generate_v1mc|uuid_generate_v4|uuidv4|uuidv7|clock_timestamp|timeofday|nextval|txid_current|gen_random_bytes)\s*\(/i
const SERIAL_TYPE = /\b(?:small|big)?serial[248]?\b/i

// ── Analyzer ──────────────────────────────────────────────────────────────

interface Draft {
  rule: string
  severity: MigrationSeverity
  table?: string
  lock?: string
  message: string
  fix: string
  /** Escalate one level when the table is larger than the threshold */
  sizeSensitive?: boolean
}

/**
 * Analyze the SQL of one migration and return the statements that are risky
 * to run against a live database, with the safe alternative for each.
 */
export function analyzeMigration(sql: string | string[], options: AnalyzeMigrationOptions): MigrationFinding[] {
  const dialect   = options.dialect
  const pg        = dialect === 'postgres'
  const my        = dialect === 'mysql'
  const lite      = dialect === 'sqlite'
  const threshold = options.largeTableThreshold ?? DEFAULT_LARGE_TABLE_THRESHOLD
  const baseTx    = options.inTransaction ?? false
  const ignore    = new Set((options.ignore ?? []).map(r => r.toLowerCase()))

  const sizes = new Map<string, number>()
  for (const [k, v] of Object.entries(options.tableSizes ?? {})) sizes.set(normName(k).toLowerCase(), v)
  const colTypes = new Map<string, string>()
  for (const [k, v] of Object.entries(options.columnTypes ?? {})) colTypes.set(normName(k).toLowerCase(), v)

  const statements = (Array.isArray(sql) ? sql : [sql]).flatMap(s => splitStatements(s, dialect))

  const findings: MigrationFinding[] = []
  const newTables      = new Set<string>()
  const newIndexes     = new Set<string>()
  const notValid       = new Set<string>()
  const pendingChecks  = new Map<string, string>()   // NOT VALID constraint name → table.col it proves NOT NULL
  const notNullProven  = new Set<string>()           // table.col
  const validated      = new Set<string>()           // tables with a VALIDATE CONSTRAINT earlier in this migration
  let inTx             = baseTx
  let lockTimeout      = false
  let lockTimeoutNoted = false
  let fkChecksOff      = false

  const rowsOf = (t?: string): number | undefined => {
    if (!t) return undefined
    const k = t.toLowerCase()
    return sizes.get(k) ?? sizes.get(lastPart(k))
  }
  const isNew = (t: string): boolean => {
    const k = t.toLowerCase()
    return newTables.has(k) || newTables.has(lastPart(k))
  }
  const markNew = (t: string) => {
    newTables.add(t.toLowerCase())
    newTables.add(lastPart(t.toLowerCase()))
  }
  const colKey = (t: string, col: string) => `${t}.${col}`.toLowerCase()

  statements.forEach((st, index) => {
    const m = st.masked
    const allowed = allowedRules(st.comments)
    let r: RegExpExecArray | null

    const emit = (d: Draft) => {
      if (ignore.has(d.rule) || allowed.has(d.rule) || allowed.has('all')) return
      let severity = d.severity
      let message = d.message
      const rows = rowsOf(d.table)
      if (d.sizeSensitive && rows !== undefined) {
        if (rows > threshold) severity = severity === 'info' ? 'warning' : 'error'
        message += ` ${d.table} has about ${rows.toLocaleString('en-US')} rows.`
      }
      findings.push({
        rule: d.rule,
        severity,
        statement: st.sql,
        statementIndex: index,
        ...(d.table !== undefined ? { table: d.table } : {}),
        ...(d.lock !== undefined ? { lock: d.lock } : {}),
        message,
        fix: d.fix
      })
    }

    /** Risky DDL on an existing PostgreSQL table: suggest lock_timeout once */
    const needsLockTimeout = (table?: string) => {
      if (!pg || lockTimeout || lockTimeoutNoted) return
      lockTimeoutNoted = true
      emit({
        rule: 'missing-lock-timeout',
        severity: 'info',
        sizeSensitive: true,
        table,
        message:
          `No lock_timeout is set before this DDL. If ${table ?? 'the table'} is busy, the statement waits for its lock ` +
          'behind running transactions, and every query that arrives after it queues behind it, which can stall the ' +
          'application even when the DDL itself is instant.',
        fix: `Start the migration with SET ${inTx ? 'LOCAL ' : ''}lock_timeout = '5s' so a blocked migration fails fast ` +
          'instead of piling up queries, and retry it later.'
      })
    }

    const concurrentlyInTx = (what: string) => emit({
      rule: 'concurrently-in-transaction',
      severity: 'error',
      message: `${what} CONCURRENTLY cannot run inside a transaction block; PostgreSQL rejects it.`,
      fix: 'Export `transaction = false` from this migration (MigrationRunner wraps migrations in a transaction by ' +
        'default) and keep the concurrent statement in a migration of its own.'
    })

    // ── Session / transaction state ──
    if (pg && /^SET\s+(?:SESSION\s+|LOCAL\s+)?lock_timeout\b/i.test(m)) {
      lockTimeout = !/(?:=|\bTO)\s*0\s*$/i.test(m)
      return
    }
    if (my && /^SET\s+(?:SESSION\s+|@@SESSION\.|@@)?foreign_key_checks\s*=\s*(?:0|OFF)\b/i.test(m)) {
      fkChecksOff = true
      return
    }
    if (/^(?:BEGIN|START\s+TRANSACTION)\b/i.test(m)) { inTx = true; return }
    if (/^(?:COMMIT|END|ROLLBACK)\b/i.test(m) && !/^ROLLBACK\s+TO\b/i.test(m)) { inTx = baseTx; return }

    // ── CREATE TABLE ──
    if ((r = new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:GLOBAL|LOCAL)\\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED)\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QN})`, 'i').exec(m))) {
      markNew(normName(r[1]))
      return
    }

    // ── CREATE INDEX ──
    if ((r = new RegExp(`^CREATE\\s+(UNIQUE\\s+|FULLTEXT\\s+|SPATIAL\\s+)?INDEX\\s+(CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:(?!ON\\s)(${QN})\\s+)?ON\\s+(?:ONLY\\s+)?(${QN})`, 'i').exec(m))) {
      if (r[3]) newIndexes.add(normName(r[3]).toLowerCase())
      const t = normName(r[4])
      if (!pg) return
      if (r[2]) { if (inTx) concurrentlyInTx('CREATE INDEX'); return }
      if (isNew(t)) return
      const unique = r[1] ? 'UNIQUE ' : ''
      emit({
        rule: 'create-index-non-concurrent',
        severity: 'warning',
        sizeSensitive: true,
        table: t,
        lock: 'SHARE',
        message: `CREATE ${unique}INDEX on existing table ${t} takes a SHARE lock: INSERT, UPDATE and DELETE are blocked until the index is built.`,
        fix: `Use CREATE ${unique}INDEX CONCURRENTLY. It cannot run inside a transaction block, so export \`transaction = false\` ` +
          'from the migration. If it fails it leaves an INVALID index behind: drop it and retry.'
      })
      needsLockTimeout(t)
      return
    }

    // ── DROP INDEX ──
    if (pg && (r = /^DROP\s+INDEX\s+(CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?([\s\S]+?)(?:\s+(?:CASCADE|RESTRICT))?$/i.exec(m))) {
      if (r[1]) { if (inTx) concurrentlyInTx('DROP INDEX'); return }
      const names = splitTopLevel(r[2]).map(x => normName(x).toLowerCase())
      if (names.every(x => newIndexes.has(x))) return
      emit({
        rule: 'drop-index-non-concurrent',
        severity: 'warning',
        lock: 'ACCESS EXCLUSIVE',
        message: 'DROP INDEX takes an ACCESS EXCLUSIVE lock on the index\'s table: reads and writes wait while it queues for and holds the lock.',
        fix: 'Use DROP INDEX CONCURRENTLY, in a migration that exports `transaction = false`.'
      })
      needsLockTimeout()
      return
    }

    // ── REINDEX ──
    if (pg && (r = new RegExp(`^REINDEX\\b(?:\\s*\\(([^)]*)\\))?\\s+(INDEX|TABLE|SCHEMA|DATABASE|SYSTEM)\\s+(CONCURRENTLY\\s+)?(${QN})?`, 'i').exec(m))) {
      const concurrent = !!r[3] || /\bCONCURRENTLY\b(?!\s+(?:FALSE|OFF|0)\b)/i.test(r[1] ?? '')
      if (concurrent) { if (inTx) concurrentlyInTx('REINDEX'); return }
      const t = r[2].toUpperCase() === 'TABLE' && r[4] ? normName(r[4]) : undefined
      emit({
        rule: 'reindex-non-concurrent',
        severity: 'warning',
        sizeSensitive: true,
        table: t,
        lock: 'SHARE on the table, ACCESS EXCLUSIVE on each index',
        message: 'REINDEX without CONCURRENTLY blocks writes to the table, and queries that would use the index, for the whole rebuild.',
        fix: 'Use REINDEX ... CONCURRENTLY (PostgreSQL 12+) in a migration that exports `transaction = false`.'
      })
      needsLockTimeout(t)
      return
    }

    // ── VACUUM FULL ──
    if (pg && /^VACUUM\b/i.test(m)) {
      const full = /^VACUUM\s+(?:(?:FREEZE|VERBOSE|ANALYZE)\s+)*FULL\b/i.test(m) ||
        /^VACUUM\s*\([^)]*\bFULL\b(?!\s+(?:FALSE|OFF|0)\b)[^)]*\)/i.test(m)
      if (!full) return
      r = new RegExp(`^VACUUM\\s*(?:\\([^)]*\\)\\s*)?(?:(?:FULL|FREEZE|VERBOSE|ANALYZE)\\b\\s*)*(${QN})?`, 'i').exec(m)
      const t = r?.[1] ? normName(r[1]) : undefined
      emit({
        rule: 'vacuum-full',
        severity: 'error',
        sizeSensitive: true,
        table: t,
        lock: 'ACCESS EXCLUSIVE',
        message: `VACUUM FULL rewrites ${t ?? 'every table'} under an ACCESS EXCLUSIVE lock: no reads or writes until it finishes. It also cannot run inside a transaction block.`,
        fix: 'Use pg_repack or pg_squeeze to reclaim space online, or a plain VACUUM, which does not block reads or writes. Run maintenance outside migrations.'
      })
      needsLockTimeout(t)
      return
    }

    // ── CLUSTER ──
    if (pg && (r = new RegExp(`^CLUSTER\\b(?:\\s*\\([^)]*\\))?(?:\\s+VERBOSE)?(?:\\s+(${QN}))?`, 'i').exec(m))) {
      const t = r[1] ? normName(r[1]) : undefined
      emit({
        rule: 'cluster',
        severity: 'error',
        sizeSensitive: true,
        table: t,
        lock: 'ACCESS EXCLUSIVE',
        message: `CLUSTER rewrites ${t ?? 'the table'} under an ACCESS EXCLUSIVE lock: no reads or writes until it finishes.`,
        fix: 'Use pg_repack --order-by to reorder a table online, outside the migration.'
      })
      needsLockTimeout(t)
      return
    }

    // ── LOCK TABLE ──
    if ((pg || my) && (r = new RegExp(`^LOCK\\s+(?:TABLES?\\s+)?(?:ONLY\\s+)?(${QN})(?:[\\s\\S]*?\\bIN\\s+([A-Z ]+?)\\s+MODE\\b)?`, 'i').exec(m))) {
      const t = normName(r[1])
      const mode = my ? (/\bWRITE\b/i.test(m) ? 'WRITE' : 'READ') : (r[2]?.toUpperCase() ?? 'ACCESS EXCLUSIVE')
      emit({
        rule: 'lock-table',
        severity: 'warning',
        table: t,
        lock: mode,
        message: `LOCK TABLE ${t} holds a ${mode} lock until the transaction ends; with ACCESS EXCLUSIVE (the PostgreSQL default) or WRITE (MySQL) every query on the table waits.`,
        fix: 'Avoid explicit table locks in migrations. If one is unavoidable, use the weakest mode that works, keep the transaction short and set lock_timeout first.'
      })
      needsLockTimeout(t)
      return
    }

    // ── TRUNCATE ──
    if ((r = new RegExp(`^TRUNCATE\\s+(?:TABLE\\s+)?(?:ONLY\\s+)?(${QN})`, 'i').exec(m))) {
      const t = normName(r[1])
      if (isNew(t)) return
      emit({
        rule: 'truncate',
        severity: 'warning',
        table: t,
        lock: pg ? 'ACCESS EXCLUSIVE' : my ? 'metadata lock (drop and recreate)' : undefined,
        message: `TRUNCATE ${t} deletes every row${pg ? ' and takes an ACCESS EXCLUSIVE lock' : ''}. It cannot be undone by a down migration.`,
        fix: 'Make sure this is intended. To purge rows from a live table, DELETE in batches (WHERE id BETWEEN ...) from a background job instead.'
      })
      needsLockTimeout(t)
      return
    }

    // ── DELETE / UPDATE without WHERE ──
    if ((r = new RegExp(`^DELETE\\s+FROM\\s+(?:ONLY\\s+)?(${QN})`, 'i').exec(m))) {
      const t = normName(r[1])
      if (isNew(t) || /\bWHERE\b/i.test(topLevel(m))) return
      emit({
        rule: 'delete-without-where',
        severity: 'warning',
        sizeSensitive: true,
        table: t,
        lock: 'ROW EXCLUSIVE, plus a row lock on every row',
        message: `DELETE without WHERE removes every row of ${t} in one transaction, locking all of them until it commits.`,
        fix: 'Add a WHERE clause if only some rows should go. To empty a large live table, delete in batches from a background job.'
      })
      return
    }
    if ((r = new RegExp(`^UPDATE\\s+(?:ONLY\\s+)?(${QN})\\s`, 'i').exec(m))) {
      const t = normName(r[1])
      if (isNew(t) || /\bWHERE\b/i.test(topLevel(m))) return
      emit({
        rule: 'update-without-where',
        severity: 'warning',
        sizeSensitive: true,
        table: t,
        lock: 'ROW EXCLUSIVE, plus a row lock on every row',
        message: `UPDATE without WHERE rewrites every row of ${t} in one transaction: all rows stay locked until it commits, and it produces a burst of WAL/binlog and table bloat.`,
        fix: 'Backfill in batches (for example 1,000 to 10,000 rows per statement, each in its own transaction) from a background job instead of the migration.'
      })
      return
    }

    // ── DROP TABLE ──
    if ((r = /^DROP\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?([\s\S]+?)(?:\s+(?:CASCADE|RESTRICT))?$/i.exec(m))) {
      let first: string | undefined
      for (const raw of splitTopLevel(r[1])) {
        const t = normName(raw)
        if (isNew(t)) continue
        first ??= t
        emit({
          rule: 'drop-table',
          severity: 'warning',
          table: t,
          lock: pg ? 'ACCESS EXCLUSIVE' : undefined,
          message: `Dropping ${t} breaks every deployed instance that still reads or writes it, and the data cannot be restored by a down migration.`,
          fix: 'Expand/contract: remove every use of the table from the code and deploy that first, take a backup, then drop it in a later migration. ' +
            'Mark the statement with "-- axil:allow drop-table" once that is done.'
        })
      }
      if (first) needsLockTimeout(first)
      return
    }

    // ── RENAME TABLE (MySQL) ──
    if ((r = new RegExp(`^RENAME\\s+TABLE\\s+(${QN})\\s+TO\\s+(${QN})`, 'i').exec(m))) {
      const t = normName(r[1])
      if (isNew(t)) return
      emit(renameTable(t, normName(r[2])))
      return
    }

    // ── ALTER TABLE ──
    if ((r = new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${QN})\\s+([\\s\\S]*)$`, 'i').exec(m))) {
      const t = normName(r[1])
      const fresh = isNew(t)
      const body = r[2]
      const actions = splitTopLevel(body)
      const copyReasons: string[] = []
      const algorithmSet = /\bALGORITHM\s*=?\s*(?:INSTANT|INPLACE)\b/i.test(body)
      let c: RegExpExecArray | null

      for (const a of actions) {
        // ADD COLUMN
        if ((c = new RegExp(`^ADD\\s+(?:COLUMN\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(?!(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|INDEX|KEY|FULLTEXT|SPATIAL|EXCLUDE|PARTITION)\\b)(${ID})\\s+([\\s\\S]+)$`, 'i').exec(a))) {
          const col = normName(c[1])
          const def = c[2]
          const notNull = /\bNOT\s+NULL\b/i.test(def) || /\bPRIMARY\s+KEY\b/i.test(def)
          const defaultAt = def.search(/\bDEFAULT\b/i)
          const hasDefault = defaultAt >= 0
          const autoFill = SERIAL_TYPE.test(def) || /\bGENERATED\b/i.test(def) || /\bAUTO_?INCREMENT\b/i.test(def) || /\bIDENTITY\b/i.test(def)

          if (lite) {
            if (notNull && !hasDefault) {
              emit({
                rule: 'add-column-not-null-without-default',
                severity: 'error',
                table: t,
                message: `SQLite cannot add NOT NULL column ${col} without a non-NULL DEFAULT ("Cannot add a NOT NULL column with default value NULL").`,
                fix: 'Give the column a constant DEFAULT, or add it as nullable and backfill.'
              })
            }
            const unsupported = /\b(?:PRIMARY\s+KEY|UNIQUE)\b/i.test(def)
              ? 'a PRIMARY KEY or UNIQUE column'
              : hasDefault && /^DEFAULT\s*(?:\(|CURRENT_(?:TIME|DATE|TIMESTAMP)\b)/i.test(def.slice(defaultAt))
                ? 'a column with a non-constant DEFAULT (CURRENT_TIMESTAMP or an expression)'
                : undefined
            if (unsupported) {
              emit({
                rule: 'sqlite-add-column-unsupported',
                severity: 'error',
                table: t,
                message: `SQLite's ALTER TABLE ADD COLUMN cannot add ${unsupported}; the migration will fail.`,
                fix: 'Add a plain column (constant or no default) and enforce the rest with CREATE UNIQUE INDEX, or rebuild the table ' +
                  '(CREATE new table, INSERT ... SELECT, DROP old, RENAME) inside one transaction.'
              })
            }
            continue
          }
          if (fresh) continue

          if (notNull && !hasDefault && !autoFill) {
            if (pg) {
              emit({
                rule: 'add-column-not-null-without-default',
                severity: 'error',
                table: t,
                lock: 'ACCESS EXCLUSIVE',
                message: `Adding NOT NULL column ${col} without a DEFAULT fails as soon as ${t} has rows ("column contains null values").`,
                fix: 'Add the column as nullable (or with a constant DEFAULT, which is metadata-only on PostgreSQL 11+), backfill in batches, ' +
                  `then enforce NOT NULL with CHECK (${col} IS NOT NULL) NOT VALID, VALIDATE CONSTRAINT and SET NOT NULL in later migrations.`
              })
            } else if (my) {
              emit({
                rule: 'add-column-not-null-without-default',
                severity: 'warning',
                table: t,
                message: `MySQL fills NOT NULL column ${col} with the type's implicit default (0, '', zero date) on existing rows of ${t}, which is rarely the intended value.`,
                fix: 'Give the column an explicit DEFAULT, or add it as nullable, backfill, then MODIFY it to NOT NULL.'
              })
            }
          }

          if (pg) {
            const fn = hasDefault ? VOLATILE_FN.exec(def.slice(defaultAt)) : null
            const why = fn ? `volatile default ${fn[1]}()`
              : SERIAL_TYPE.test(def) ? 'a serial type (nextval() default)'
              : /\bGENERATED\b[\s\S]*\bIDENTITY\b/i.test(def) ? 'an identity column'
              : /\bGENERATED\b[\s\S]*\bSTORED\b/i.test(def) ? 'a stored generated column'
              : undefined
            if (why) {
              emit({
                rule: 'add-column-volatile-default',
                severity: 'warning',
                sizeSensitive: true,
                table: t,
                lock: 'ACCESS EXCLUSIVE',
                message: `Column ${col} uses ${why}, so PostgreSQL rewrites all of ${t} under an ACCESS EXCLUSIVE lock. ` +
                  'Non-volatile defaults (a constant, now(), CURRENT_TIMESTAMP) are metadata-only on PostgreSQL 11+.',
                fix: `Add the column with no default (or a constant one), backfill existing rows in batches, then ALTER COLUMN ${col} SET DEFAULT ... ` +
                  'so only new rows use the volatile expression.'
              })
            }
          }
          if (my && (/\bAUTO_INCREMENT\b/i.test(def) || /\bPRIMARY\s+KEY\b/i.test(def))) {
            copyReasons.push(`adding AUTO_INCREMENT / PRIMARY KEY column ${col}`)
          }
          continue
        }

        // ALTER COLUMN ... TYPE (PostgreSQL)
        if ((c = new RegExp(`^ALTER\\s+(?:COLUMN\\s+)?(${ID})\\s+(?:SET\\s+DATA\\s+)?TYPE\\s+([\\s\\S]+)$`, 'i').exec(a))) {
          if (!pg || fresh) continue
          const col = normName(c[1])
          const using = /\bUSING\b/i.test(c[2])
          const newType = c[2].split(/\s+(?:USING|COLLATE)\b/i)[0].trim()
          const oldType = colTypes.get(colKey(t, col)) ?? colTypes.get(colKey(lastPart(t), col))
          if (!using && oldType && isSafeTypeChange(oldType, newType)) continue
          const maybeSafe = !using && !oldType && (() => {
            const p = parseType(newType)
            return !!p && !p.array && ['text', 'varchar', 'numeric'].includes(p.base)
          })()
          emit({
            rule: 'alter-column-type',
            severity: maybeSafe ? 'info' : 'error',
            sizeSensitive: true,
            table: t,
            lock: 'ACCESS EXCLUSIVE',
            message: maybeSafe
              ? `Changing ${t}.${col} to ${newType} is metadata-only when it widens varchar/numeric (varchar(n) → varchar(m > n) or text), ` +
                'otherwise it rewrites the table under an ACCESS EXCLUSIVE lock. The current type is unknown; pass columnTypes to decide.'
              : `Changing the type of ${t}.${col} to ${newType} rewrites ${t} and its indexes under an ACCESS EXCLUSIVE lock: no reads or writes until it finishes.`,
            fix: 'Expand/contract: add a new column with the new type, write to both (or use a trigger), backfill in batches, ' +
              'switch reads, deploy, then drop the old column. Only varchar/numeric widenings and varchar → text are safe in place.'
          })
          continue
        }

        // ALTER COLUMN ... SET NOT NULL (PostgreSQL)
        if ((c = new RegExp(`^ALTER\\s+(?:COLUMN\\s+)?(${ID})\\s+SET\\s+NOT\\s+NULL\\b`, 'i').exec(a))) {
          if (!pg || fresh) continue
          const col = normName(c[1])
          // A validated CHECK (col IS NOT NULL) lets PostgreSQL 12+ skip the scan. Constraints validated
          // here but added in an earlier migration are assumed to be that check.
          if (notNullProven.has(colKey(t, col)) || validated.has(t.toLowerCase())) continue
          const cname = `${lastPart(t)}_${col}_not_null`
          emit({
            rule: 'set-not-null',
            severity: 'warning',
            sizeSensitive: true,
            table: t,
            lock: 'ACCESS EXCLUSIVE',
            message: `SET NOT NULL scans all of ${t} to verify ${col} while holding an ACCESS EXCLUSIVE lock (reads and writes wait).`,
            fix: `Migration 1: ALTER TABLE ${t} ADD CONSTRAINT ${cname} CHECK (${col} IS NOT NULL) NOT VALID. ` +
              `Migration 2: ALTER TABLE ${t} VALIDATE CONSTRAINT ${cname}; ALTER TABLE ${t} ALTER COLUMN ${col} SET NOT NULL ` +
              `(PostgreSQL 12+ skips the scan because the validated constraint proves it); ALTER TABLE ${t} DROP CONSTRAINT ${cname}.`
          })
          continue
        }

        // ADD CONSTRAINT
        if ((c = new RegExp(`^ADD\\s+(?:CONSTRAINT\\s+(${ID})\\s+)?(FOREIGN\\s+KEY|CHECK|UNIQUE|PRIMARY\\s+KEY)\\b([\\s\\S]*)$`, 'i').exec(a))) {
          const name = c[1] ? normName(c[1]) : undefined
          const kind = c[2].toUpperCase().replace(/\s+/g, ' ')
          const rest = c[3]

          if (my) {
            if (kind === 'FOREIGN KEY' && !fkChecksOff && !fresh) copyReasons.push('ADD FOREIGN KEY while foreign_key_checks is enabled')
            continue
          }
          if (!pg) continue

          if (kind === 'FOREIGN KEY' || kind === 'CHECK') {
            const isNotValid = /\bNOT\s+VALID\b/i.test(rest)
            const nn = kind === 'CHECK' ? new RegExp(`^\\s*\\(\\s*(${ID})\\s+IS\\s+NOT\\s+NULL\\s*\\)`, 'i').exec(rest) : null
            if (isNotValid) {
              if (name) {
                notValid.add(name.toLowerCase())
                if (nn) pendingChecks.set(name.toLowerCase(), colKey(t, normName(nn[1])))
              }
              continue
            }
            if (nn) notNullProven.add(colKey(t, normName(nn[1])))
            if (fresh) continue
            emit({
              rule: 'add-constraint-without-not-valid',
              severity: 'warning',
              sizeSensitive: true,
              table: t,
              lock: kind === 'FOREIGN KEY' ? 'SHARE ROW EXCLUSIVE on this table and the referenced table' : 'ACCESS EXCLUSIVE',
              message: `Adding a ${kind} constraint validates every existing row of ${t} while holding the lock ` +
                `(${kind === 'FOREIGN KEY' ? 'writes to both tables are blocked' : 'reads and writes are blocked'}).`,
              fix: `Add it with NOT VALID (new and updated rows are checked immediately), then run ALTER TABLE ${t} VALIDATE CONSTRAINT ` +
                `${name ?? '<name>'} in a later migration; validation only takes a SHARE UPDATE EXCLUSIVE lock.`
            })
            continue
          }

          // UNIQUE / PRIMARY KEY
          if (/\bUSING\s+INDEX\b/i.test(rest) || fresh) continue
          emit({
            rule: 'add-unique-constraint',
            severity: 'warning',
            sizeSensitive: true,
            table: t,
            lock: 'ACCESS EXCLUSIVE',
            message: `Adding a ${kind} constraint builds its index while holding an ACCESS EXCLUSIVE lock on ${t}` +
              (kind === 'PRIMARY KEY' ? ', and also sets NOT NULL on its columns (a full scan).' : '.'),
            fix: `CREATE UNIQUE INDEX CONCURRENTLY ${name ?? '<name>'} ON ${t} (...) in a migration with \`transaction = false\`, ` +
              `then ALTER TABLE ${t} ADD CONSTRAINT ${name ?? '<name>'} ${kind} USING INDEX ${name ?? '<name>'}.`
          })
          continue
        }

        // VALIDATE CONSTRAINT
        if ((c = new RegExp(`^VALIDATE\\s+CONSTRAINT\\s+(${ID})`, 'i').exec(a))) {
          const name = normName(c[1]).toLowerCase()
          const proves = pendingChecks.get(name)
          if (proves) notNullProven.add(proves)
          validated.add(t.toLowerCase())
          if (pg && inTx && notValid.has(name)) {
            emit({
              rule: 'validate-in-same-transaction',
              severity: 'warning',
              sizeSensitive: true,
              table: t,
              lock: 'ACCESS EXCLUSIVE (still held from ADD CONSTRAINT)',
              message: `Constraint ${name} is added NOT VALID and validated in the same transaction, so the ADD CONSTRAINT lock is still held while every row is checked; NOT VALID gains nothing.`,
              fix: 'Move VALIDATE CONSTRAINT to a separate, later migration.'
            })
          }
          continue
        }

        // DROP COLUMN
        if ((c = new RegExp(`^DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?(?!(?:CONSTRAINT|INDEX|KEY|PRIMARY|FOREIGN|CHECK|DEFAULT|PARTITION)\\b)(${ID})`, 'i').exec(a))) {
          if (my && /^DROP\s+PRIMARY\s+KEY\b/i.test(a)) continue
          if (fresh) continue
          const col = normName(c[1])
          emit({
            rule: 'drop-column',
            severity: 'warning',
            table: t,
            lock: pg ? 'ACCESS EXCLUSIVE (brief, metadata only)' : undefined,
            message: `Dropping ${t}.${col} breaks deployed code that still selects, inserts or updates it (including ORMs that list every column).`,
            fix: `Expand/contract: remove every use of ${col} from the code and deploy that first, then drop the column in a later migration. ` +
              'Mark the statement with "-- axil:allow drop-column" once that is done.'
          })
          continue
        }

        // RENAME COLUMN
        if ((c = new RegExp(`^RENAME\\s+(?:COLUMN\\s+)?(?!(?:TO|AS|CONSTRAINT|INDEX|KEY)\\b)(${ID})\\s+TO\\s+(${ID})`, 'i').exec(a))) {
          if (fresh) continue
          emit(renameColumn(t, normName(c[1]), normName(c[2])))
          continue
        }

        // RENAME TO (table)
        if ((c = new RegExp(`^RENAME\\s+(?:(?:TO|AS)\\s+)?(${QN})$`, 'i').exec(a))) {
          if (fresh) continue
          emit(renameTable(t, normName(c[1])))
          continue
        }

        // MySQL MODIFY / CHANGE
        if (my && (c = new RegExp(`^CHANGE\\s+(?:COLUMN\\s+)?(${ID})\\s+(${ID})\\s+`, 'i').exec(a))) {
          if (fresh) continue
          const from = normName(c[1])
          const to = normName(c[2])
          if (from.toLowerCase() !== to.toLowerCase()) emit(renameColumn(t, from, to))
          else copyReasons.push(`changing the definition of ${from}`)
          continue
        }
        if (my && (c = new RegExp(`^MODIFY\\s+(?:COLUMN\\s+)?(${ID})\\s+`, 'i').exec(a))) {
          copyReasons.push(`changing the definition of ${normName(c[1])}`)
          continue
        }
        if (my && /^CONVERT\s+TO\s+CHARACTER\s+SET\b/i.test(a)) {
          copyReasons.push('converting the character set')
          continue
        }
      }

      if (my && /\bDROP\s+PRIMARY\s+KEY\b/i.test(body) && !/\bADD\s+(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\b/i.test(body)) {
        copyReasons.push('dropping the primary key without adding a new one')
      }
      if (my && copyReasons.length && !algorithmSet && !fresh) {
        emit({
          rule: 'mysql-copy-algorithm',
          severity: 'warning',
          sizeSensitive: true,
          table: t,
          lock: 'table copy (ALGORITHM=COPY): concurrent writes blocked',
          message: `MySQL may run this ALTER on ${t} with ALGORITHM=COPY (${copyReasons.join('; ')}), rebuilding the table while writes are blocked. ` +
            'Only some changes are in place, e.g. a VARCHAR length that stays within the same length-byte range (up to 255 bytes, or above).',
          fix: 'Append ", ALGORITHM=INPLACE, LOCK=NONE" (or ALGORITHM=INSTANT) so MySQL refuses instead of silently copying; ' +
            'if it refuses, run the change with an online schema change tool (gh-ost, pt-online-schema-change).'
        })
      }
      if (!fresh) needsLockTimeout(t)
      return
    }
  })

  return findings
}

function renameColumn(t: string, from: string, to: string): Draft {
  return {
    rule: 'rename-column',
    severity: 'error',
    table: t,
    message: `Renaming ${t}.${from} to ${to} breaks every running instance that still uses the old name until the new code is deployed; ` +
      'there is no moment where old and new code both work.',
    fix: `Expand/contract: add ${to}, write to both columns (or sync them with a trigger) and backfill, switch reads to ${to} and deploy, ` +
      `then drop ${from} in a later migration.`
  }
}

function renameTable(t: string, to: string): Draft {
  return {
    rule: 'rename-table',
    severity: 'error',
    table: t,
    message: `Renaming ${t} to ${to} breaks every running instance that still queries ${t} until the new code is deployed.`,
    fix: `Rename the table and, in the same migration, CREATE VIEW ${t} AS SELECT * FROM ${to} so old code keeps working ` +
      '(simple views are updatable); drop the view once no deployed code uses the old name.'
  }
}
