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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
