/**
 * AxilORM — Identifier safety
 *
 * Column names passed to `where()` / `orderBy()` are interpolated into SQL
 * (they cannot be bound as parameters). Sort keys and filter keys often come
 * straight from the request (`?sort=name`, `repo.find(req.query)`), so they
 * are validated before they reach the SQL string.
 *
 * Accepted:  name · table.name · * · table.* · "Quoted Name" · `quoted`
 * Rejected:  anything else (spaces, operators, parentheses, comments, ...)
 *
 * Identifiers are NOT quoted — the accepted shapes are passed through as-is.
 * Use `whereRaw()` / `select()` / `groupBy()` for SQL expressions.
 */

// One segment: a plain identifier, or a double-quoted / backtick-quoted
// identifier that contains no quote character of its own kind.
const SEGMENT = '(?:[A-Za-z_][A-Za-z0-9_$]*|"[^"]+"|`[^`]+`)'
const SAFE_IDENTIFIER = new RegExp(`^(?:${SEGMENT}\\.)?(?:${SEGMENT}|\\*)$`)

const OPERATORS = new Set([
  '=', '!=', '<>', '<', '<=', '>', '>=',
  'LIKE', 'NOT LIKE', 'ILIKE', 'NOT ILIKE',
  'IN', 'NOT IN',
  'IS NULL', 'IS NOT NULL',
  'BETWEEN', 'NOT BETWEEN'
])

export class UnsafeIdentifierError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeIdentifierError'
  }
}

/** True when `name` is `name`, `table.name`, `*` or `table.*` (optionally quoted). */
export function isSafeIdentifier(name: unknown): boolean {
  return typeof name === 'string' && SAFE_IDENTIFIER.test(name)
}

/**
 * Throw `UnsafeIdentifierError` unless `name` is a plain identifier.
 * Returns the name unchanged so it can be used inline.
 */
export function assertSafeIdentifier(name: unknown, context = 'identifier'): string {
  if (!isSafeIdentifier(name)) {
    throw new UnsafeIdentifierError(
      `[AxilORM] Unsafe SQL ${context}: ${JSON.stringify(name)}. ` +
      `Only "name", "table.name" or "*" are allowed — use whereRaw()/select() for expressions.`
    )
  }
  return name as string
}

/** Normalise a sort direction to ASC / DESC, rejecting anything else. */
export function assertSortDirection(direction: unknown): 'ASC' | 'DESC' {
  const dir = typeof direction === 'string' ? direction.trim().toUpperCase() : ''
  if (dir !== 'ASC' && dir !== 'DESC') {
    throw new UnsafeIdentifierError(
      `[AxilORM] Invalid sort direction: ${JSON.stringify(direction)}. Use 'ASC' or 'DESC'.`
    )
  }
  return dir
}

/** Normalise a WHERE operator (case-insensitive), rejecting unknown ones. */
export function assertWhereOperator(operator: unknown): string {
  const op = typeof operator === 'string' ? operator.trim().toUpperCase().replace(/\s+/g, ' ') : ''
  if (!OPERATORS.has(op)) {
    throw new UnsafeIdentifierError(
      `[AxilORM] Unsupported WHERE operator: ${JSON.stringify(operator)}.`
    )
  }
  return op
}
