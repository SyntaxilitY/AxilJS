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
