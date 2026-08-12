/**
 * Migration Runner.
 * Manages database schema changes in a versioned, repeatable way.
 *
 * How it works:
 *   1. Migrations are TypeScript files in src/migrations/
 *   2. Each file exports an up() and down() function
 *   3. The runner tracks which migrations have run (in _migrations table)
 *   4. Running migrations applies pending ones in order
 *   5. Rolling back reverses the last batch
 *
 * Migration file naming: 001_create_users.ts, 002_add_email_index.ts
 */

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { BaseDriver, TransactionContext } from '../connection/base-driver';

// ─── Migration Interface ───────────────────────────────────────────────────────

export interface Migration {
  // Apply the migration (create tables, add columns, etc.)
  up(db: TransactionContext): Promise<void>;

  // Reverse the migration (drop tables, remove columns, etc.)
  down(db: TransactionContext): Promise<void>;
}

// ─── Migration Record ──────────────────────────────────────────────────────────

interface MigrationRecord {
  id: number;
  name: string;         // Migration filename without extension
  batch: number;        // Group number for rollback
  executed_at: string;  // When it was run
}

// ─── Migration Runner ─────────────────────────────────────────────────────────

export class MigrationRunner {
  private driver: BaseDriver;
  private migrationsDir: string;

  constructor(driver: BaseDriver, migrationsDir?: string) {
    this.driver = driver;
    this.migrationsDir = migrationsDir || join(process.cwd(), 'src', 'migrations');
  }

  /**
   * Ensure the _migrations tracking table exists.
   * Called automatically before any migration operation.
   */
  private async ensureMigrationsTable(): Promise<void> {
    await this.driver.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        VARCHAR(255) NOT NULL UNIQUE,
        batch       INTEGER NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Get all migration files from the migrations directory.
   * Sorted by filename for deterministic order.
   */
  private getMigrationFiles(): string[] {
    if (!existsSync(this.migrationsDir)) {
      return [];
    }

    return readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .sort(); // Alphabetical sort = chronological order by naming convention
  }

  /**
   * Get migrations that have already been run from the database.
   */
  private async getExecutedMigrations(): Promise<MigrationRecord[]> {
    const result = await this.driver.query<MigrationRecord>(
      'SELECT * FROM _migrations ORDER BY id ASC'
    );
    return result.rows;
  }

  /**
   * Run all pending migrations.
   */
  async up(): Promise<void> {
    await this.ensureMigrationsTable();

    const files = this.getMigrationFiles();
    const executed = await this.getExecutedMigrations();
    const executedNames = new Set(executed.map(m => m.name));

    // Find pending migrations
    const pending = files.filter(f => {
      const name = f.replace(/\.(ts|js)$/, '');
      return !executedNames.has(name);
    });

    if (pending.length === 0) {
      console.log('\x1b[32m[REstJS ORM]\x1b[0m All migrations up to date.');
      return;
    }

    // Determine next batch number
    const lastBatch = executed.length > 0
      ? Math.max(...executed.map(m => m.batch))
      : 0;
    const batch = lastBatch + 1;

    console.log(
      `\n\x1b[36m[REstJS ORM]\x1b[0m Running ${pending.length} migrations (batch ${batch})...\n`
    );

    // Run each pending migration in a transaction
    for (const file of pending) {
      const name = file.replace(/\.(ts|js)$/, '');
      const filePath = join(this.migrationsDir, file);

      process.stdout.write(`  Migrating: ${name}... `);

      try {
        await this.driver.transaction(async (trx) => {
          // Load and run the migration
          const migration: Migration = require(filePath);
          await migration.up(trx);

          // Record it in the migrations table
          await trx.query(
            `INSERT INTO _migrations (name, batch) VALUES (?, ?)`,
            [name, batch]
          );
        });

        console.log('\x1b[32mdone\x1b[0m');
      } catch (error) {
        console.log('\x1b[31mFAILED\x1b[0m');
        throw new Error(
          `Migration failed: ${name}\n${(error as Error).message}`
        );
      }
    }

    console.log(
      `\n\x1b[32m✓\x1b[0m ${pending.length} migrations completed.\n`
    );
  }

  /**
   * Roll back the last batch of migrations.
   */
  async down(): Promise<void> {
    await this.ensureMigrationsTable();

    const executed = await this.getExecutedMigrations();

    if (executed.length === 0) {
      console.log('\x1b[33m[REstJS ORM]\x1b[0m Nothing to roll back.');
      return;
    }

    // Find last batch
    const lastBatch = Math.max(...executed.map(m => m.batch));
    const toRollback = executed
      .filter(m => m.batch === lastBatch)
      .reverse(); // Roll back in reverse order

    console.log(
      `\n\x1b[33m[REstJS ORM]\x1b[0m Rolling back batch ${lastBatch}...\n`
    );

    for (const migration of toRollback) {
      const filePath = join(this.migrationsDir, `${migration.name}.ts`);
      const jsPath = join(this.migrationsDir, `${migration.name}.js`);
      const path = existsSync(filePath) ? filePath : jsPath;

      process.stdout.write(`  Rolling back: ${migration.name}... `);

      try {
        await this.driver.transaction(async (trx) => {
          const mig: Migration = require(path);
          await mig.down(trx);

          await trx.query(
            `DELETE FROM _migrations WHERE name = ?`,
            [migration.name]
          );
        });

        console.log('\x1b[32mdone\x1b[0m');
      } catch (error) {
        console.log('\x1b[31mFAILED\x1b[0m');
        throw error;
      }
    }

    console.log('\n\x1b[32m✓\x1b[0m Rollback complete.\n');
  }

  /**
   * Show migration status.
   */
  async status(): Promise<void> {
    await this.ensureMigrationsTable();

    const files = this.getMigrationFiles();
    const executed = await this.getExecutedMigrations();
    const executedMap = new Map(executed.map(m => [m.name, m]));

    console.log('\n\x1b[36m[REstJS ORM]\x1b[0m Migration Status:\n');

    for (const file of files) {
      const name = file.replace(/\.(ts|js)$/, '');
      const record = executedMap.get(name);

      const status = record
        ? `\x1b[32m✓ Ran\x1b[0m (batch ${record.batch})`
        : '\x1b[33m○ Pending\x1b[0m';

      console.log(`  ${status}  ${name}`);
    }

    console.log('');
  }
}