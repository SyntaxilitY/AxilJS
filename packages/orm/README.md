# @axiljs/orm

ORM for PostgreSQL, MySQL, and SQLite with migrations, query builder, and repositories.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/orm pg              # PostgreSQL
npm install @axiljs/orm mysql2          # MySQL
npm install @axiljs/orm better-sqlite3  # SQLite
```

## Usage

```typescript
import { createConnection, MigrationRunner } from '@axiljs/orm'
import path from 'path'

const db = await createConnection({
  driver: 'postgres',
  url:    process.env.DATABASE_URL,
  ssl:    { rejectUnauthorized: false }  // NeonDB / managed PostgreSQL
})

const runner = new MigrationRunner(
  db.getDriver(),
  path.join(__dirname, 'migrations')
)

await runner.up()     // Run pending migrations
await runner.down()   // Rollback last batch
await runner.status() // Show migration status
```

MySQL accepts `url` too: `createConnection({ driver: 'mysql', url: 'mysql://user:pass@host:3306/db' })`.

## Migration safety

Some schema changes are instant on an empty development database and take an application down in production:
they hold a lock that blocks reads or writes while the table is scanned or rewritten, or they remove a name that
the currently deployed code still uses. The migration safety check reports these statements before they run and
explains the zero-downtime alternative.

### Checking pending migrations

`runner.check()` loads each pending migration and runs its `up()` against a recording driver: every query is
captured, nothing is executed, and every query returns no rows. The captured SQL is then analyzed.

```typescript
import { MigrationRunner } from '@axiljs/orm'

const runner = new MigrationRunner(db.getDriver(), path.join(__dirname, 'migrations'), {
  tableSizes: { users: 4_200_000, orders: 18_000_000 }   // optional, escalates findings on large tables
})

for (const { name, findings } of await runner.check()) {
  for (const f of findings) console.log(`${f.severity} ${name} [${f.rule}] ${f.message}\n  fix: ${f.fix}`)
}
```

`check({ all: true })` analyzes every migration file, not only pending ones; `checkMigrations(runner)` is the
standalone form. A migration whose `up()` throws against the empty results (for example `rows[0].id`) is reported as
an `info` finding, `dynamic-analysis-failed`, and the statements captured before the error are still analyzed.

### Checking before `up()`

```typescript
const runner = new MigrationRunner(driver, dir, { safety: 'block' })
await runner.up()   // throws MigrationSafetyError before running anything if a pending migration has an error finding
```

| `safety` | Behaviour |
|---|---|
| `'off'` (default) | No check; `up()` behaves exactly as before. |
| `'warn'` | Prints all findings, then runs the migrations. |
| `'block'` | Prints all findings and throws `MigrationSafetyError` (with `results`) if any finding is an `error`. No migration in the batch runs. |

Other runner options: `tableSizes`, `largeTableThreshold` (default 1,000,000 rows), `columnTypes`
(`{ 'users.name': 'varchar(50)' }`, used to recognise safe type widenings) and `ignore` (rule ids).

### Analyzing SQL directly

```typescript
import { analyzeMigration } from '@axiljs/orm'

const findings = analyzeMigration(sql, { dialect: 'postgres', tableSizes: { users: 2_000_000 } })
// [{ rule, severity, statement, table, lock, message, fix }, ...]
```

`sql` may be a string or an array of strings. Statements are split on top-level semicolons; string literals,
quoted identifiers, dollar-quoted function bodies and comments are respected, so SQL inside a function body or a
string is never reported.

### Rules

| Rule | Dialect | Severity | Problem | Safe alternative |
|---|---|---|---|---|
| `create-index-non-concurrent` | PostgreSQL | warning | `CREATE INDEX` takes a SHARE lock: writes blocked for the whole build | `CREATE INDEX CONCURRENTLY` in a migration with `transaction = false` |
| `drop-index-non-concurrent` | PostgreSQL | warning | ACCESS EXCLUSIVE lock on the table | `DROP INDEX CONCURRENTLY` |
| `concurrently-in-transaction` | PostgreSQL | error | `CONCURRENTLY` fails inside a transaction block | `export const transaction = false` |
| `add-column-not-null-without-default` | all | error (MySQL: warning) | Fails as soon as the table has rows (SQLite: always); MySQL silently fills implicit defaults | Add nullable or with a constant default, backfill, then enforce NOT NULL |
| `add-column-volatile-default` | PostgreSQL | warning | `random()`, `gen_random_uuid()`, serial, identity or stored generated columns rewrite the table | Add without default, backfill in batches, then `SET DEFAULT` |
| `sqlite-add-column-unsupported` | SQLite | error | `ADD COLUMN` with `PRIMARY KEY`, `UNIQUE`, `CURRENT_TIMESTAMP` or an expression default fails | Plain column plus a unique index, or rebuild the table |
| `alter-column-type` | PostgreSQL | error | Table and index rewrite under ACCESS EXCLUSIVE | New column, dual write, backfill, switch reads, drop old. `varchar(n)` to `varchar(m > n)` or `text`, and `numeric(p,s)` to `numeric(q > p,s)`, are exempt |
| `set-not-null` | PostgreSQL | warning | Full scan under ACCESS EXCLUSIVE | `CHECK (col IS NOT NULL) NOT VALID`, then `VALIDATE CONSTRAINT`, then `SET NOT NULL` (PostgreSQL 12+) |
| `add-constraint-without-not-valid` | PostgreSQL | warning | Foreign key or CHECK validates every row while locked | Add `NOT VALID`, `VALIDATE CONSTRAINT` in a later migration |
| `validate-in-same-transaction` | PostgreSQL | warning | `NOT VALID` and `VALIDATE` in one transaction gain nothing | Validate in a separate migration |
| `add-unique-constraint` | PostgreSQL | warning | `UNIQUE` / `PRIMARY KEY` builds the index under ACCESS EXCLUSIVE | `CREATE UNIQUE INDEX CONCURRENTLY`, then `ADD CONSTRAINT ... USING INDEX` |
| `drop-column`, `drop-table` | all | warning | Breaks deployed code that still uses it; data is lost | Expand/contract: stop using it, deploy, then drop |
| `rename-column`, `rename-table` | all | error | Breaks every running instance until the new code is deployed | Expand/contract (new column plus backfill), or a view under the old table name |
| `truncate` | all | warning | Deletes every row; ACCESS EXCLUSIVE in PostgreSQL | Confirm intent; delete in batches from a job |
| `delete-without-where`, `update-without-where` | all | warning | Locks every row in one long transaction | Batch the change from a background job |
| `vacuum-full`, `cluster` | PostgreSQL | error | Rewrite under ACCESS EXCLUSIVE | `pg_repack` / `pg_squeeze`, outside migrations |
| `reindex-non-concurrent` | PostgreSQL | warning | Blocks writes for the rebuild | `REINDEX ... CONCURRENTLY` |
| `lock-table` | PostgreSQL, MySQL | warning | Explicit table lock held until commit | Avoid, or use the weakest mode with `lock_timeout` |
| `missing-lock-timeout` | PostgreSQL | info | DDL waiting for its lock queues every later query behind it | `SET lock_timeout = '5s'` (`SET LOCAL` inside a transaction) first |
| `mysql-copy-algorithm` | MySQL | warning | `MODIFY` / `CHANGE` type changes, charset conversion, `ADD FOREIGN KEY`, dropping the primary key may use `ALGORITHM=COPY` | Append `ALGORITHM=INPLACE, LOCK=NONE` so MySQL refuses instead of copying; otherwise gh-ost or pt-online-schema-change |

Statements on a table created earlier in the same migration are not reported (the table is empty and unused).
Rules marked "warning" whose cost grows with the table (index builds, scans, rewrites, unbatched updates) become
`error` when `tableSizes` puts the table above `largeTableThreshold`; `info` findings become `warning`.
Breaking-change rules do not depend on size.

### Acknowledging a finding

Once a change is intended (for example the contract phase of a column removal, after the code that used it has been
deployed), mark the statement with a comment so the check, including `block` mode, accepts it:

```sql
-- axil:allow drop-column
ALTER TABLE users DROP COLUMN legacy_id;
```

`-- axil:allow rule-a, rule-b` lists several rules; `-- axil:allow all` silences every rule for that statement.
A comment on the same line after the semicolon also applies to that statement. To skip a rule everywhere, pass
`ignore: ['rule-id']`.

### Non-transactional migrations

`MigrationRunner` wraps each migration in a transaction. PostgreSQL refuses `CREATE INDEX CONCURRENTLY`,
`DROP INDEX CONCURRENTLY` and `REINDEX CONCURRENTLY` inside one, so a migration can opt out:

```typescript
export const transaction = false

export async function up(db) {
  await db.query('CREATE INDEX CONCURRENTLY idx_users_email ON users (email)')
}
```

Keep such a migration to the concurrent statement alone: if it fails partway there is no rollback, and a failed
concurrent build leaves an `INVALID` index that must be dropped before retrying. Without a transaction, queries
may run on different pooled connections, so a session `SET lock_timeout` is not guaranteed to apply to the next
statement; set it per role (`ALTER ROLE migrator SET lock_timeout = '5s'`) when that matters.

### Limitations

- The analysis is static and pattern based. It recognises the statements listed above, not every possible form,
  and does not know the live schema beyond `tableSizes` and `columnTypes`.
- The dynamic check runs `up()` with empty results. Migrations that branch on query results analyze only the path
  taken with no rows.
- Statements built by other means than `db.query()` on the migration's connection are not seen.
- SQL-standard function bodies (`BEGIN ATOMIC ... END`) and MySQL `DELIMITER` blocks contain unquoted
  semicolons and are not split correctly; use dollar quoting in PostgreSQL.

## Where clauses

Both query builders (`Model.query()` / `ModelQueryBuilder` and the repository `QueryBuilder`) support:

```typescript
User.query()
  .where('active', '=', 1)
  .where(q => q.where('role', '=', 'admin').orWhere('role', '=', 'owner'))  // (... OR ...)
  .whereIn('id', [1, 2]).whereNotIn('id', [3])
  .whereBetween('age', 18, 65).whereNotBetween('score', 0, 10)
  .whereLike('name', 'A%')
  .whereNull('deleted_at').whereNotNull('email')
  .get()
// SELECT * FROM users WHERE active = ? AND (role = ? OR role = ?) AND id IN (?, ?) ...
```

Groups nest and Postgres placeholders (`$1, $2, …`) are numbered across them.
`count()` drops `ORDER BY`; `count/sum/avg/min/max/pluck` leave the builder's selected columns untouched.

## Identifier safety

Column names cannot be bound as parameters, so `where*()` columns, `orderBy()` columns and
`orderBy()` directions are validated. Allowed: `name`, `table.name`, `*`, `table.*`, or a quoted
`"Name"` / `` `name` `` — anything else (spaces, operators, `;`, comments, parentheses) throws
`UnsafeIdentifierError`. Directions must be `ASC`/`DESC` (any case); operators must be a known
comparison operator. Identifiers are **not** quoted for you.

`select()`, `groupBy()`, `having()`, `join()` and `whereRaw()` are not validated — use them for SQL
expressions (`select('count(*) as c')`) and never pass user input to them. Validate your own
identifiers with the exported helpers:

```typescript
import { assertSafeIdentifier, isSafeIdentifier } from '@axiljs/orm'

const sort = assertSafeIdentifier(req.query.sort, 'sort column')  // throws on 'name; DROP TABLE x'
```

## Relations (eager loading)

```typescript
@Entity('users')
class User extends BaseModel {
  @PrimaryKey() id!: number
  @HasMany(() => Post)  posts?: Post[]         // posts.user_id
  @HasOne(() => Profile) profile?: Profile     // profiles.user_id
}

@Entity('posts')
class Post extends BaseModel {
  @PrimaryKey() id!: number
  @Column() user_id!: number
  @BelongsTo(() => User) user?: User                                // posts.user_id → users.id
  @ManyToMany(() => Tag, { pivotTable: 'post_tags' }) tags?: Tag[]   // post_tags.post_id / tag_id
}

await User.all({ with: ['posts', 'posts.tags'] })   // model instances, nested via dot paths
await User.find(1, { with: ['profile'] })
await user.load('posts')
await User.with('posts').where('id', '>', 10).get() // raw rows with `posts` attached
await userRepo.find({ active: 1 }, { with: ['posts'] })
await userRepo.findWithRelations(undefined, ['posts'])
```

Each relation is loaded with one batched `WHERE key IN (...)` query (no N+1). Key defaults:
`hasOne`/`hasMany` → `<parent_class_snake>_id` on the related table; `belongsTo` →
`<related_class_snake>_id` on this table; `manyToMany` → pivot table `pivotTable` (default: both
class names in snake_case, sorted, joined with `_`) with `foreignKey` (`<parent>_id`) and
`relatedKey` (`<related>_id`). Override with `{ foreignKey, pivotTable, relatedKey }`. Related keys
always point at the related entity's primary key. The `eager: true` option is recorded only —
relations are loaded when you ask for them.

## Soft deletes

Entities with `@DeletedAt()` (column `deleted_at`) are soft-deleted; entities without it behave as before.

```typescript
await post.delete()                    // UPDATE posts SET deleted_at = now
await Post.find(id)                    // null — trashed rows are excluded by default
await Post.withTrashed().get()         // include trashed (raw rows)
await Post.onlyTrashed().get()
await Post.all({ withTrashed: true })  // / find(id, { onlyTrashed: true })
await post.restore()
await post.forceDelete()               // real DELETE
post.trashed()

await Post.query().where('user_id', '=', 1).delete()  // soft; .restore() / .forceDelete() too

await repo.delete(id)                  // soft for @DeletedAt entities
await repo.find(where, { withTrashed: true })
await repo.restore(id)
await repo.forceDelete(id)
```

Eager loading also skips trashed related rows. Use `table.softDeletes()` in a migration to add the column.

## Views

```typescript
await ViewManager.create('admins', 'SELECT * FROM users WHERE role = \'admin\'', db.getDriver())
await ViewManager.create('admins', sql, trx, true, 'sqlite')  // pass the dialect inside transactions
```

The dialect is read from the driver (or the 5th argument): Postgres/MySQL use
`CREATE OR REPLACE VIEW` (`replace = false` creates only if missing); SQLite uses
`DROP VIEW IF EXISTS` + `CREATE VIEW` (`replace = false` → `CREATE VIEW IF NOT EXISTS`).

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
