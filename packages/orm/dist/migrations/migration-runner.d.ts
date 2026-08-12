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
import { BaseDriver, TransactionContext } from '../connection/base-driver';
export interface Migration {
    up(db: TransactionContext): Promise<void>;
    down(db: TransactionContext): Promise<void>;
}
export declare class MigrationRunner {
    private driver;
    private migrationsDir;
    constructor(driver: BaseDriver, migrationsDir?: string);
    /**
     * Ensure the _migrations tracking table exists.
     * Called automatically before any migration operation.
     */
    private ensureMigrationsTable;
    /**
     * Get all migration files from the migrations directory.
     * Sorted by filename for deterministic order.
     */
    private getMigrationFiles;
    /**
     * Get migrations that have already been run from the database.
     */
    private getExecutedMigrations;
    /**
     * Run all pending migrations.
     */
    up(): Promise<void>;
    /**
     * Roll back the last batch of migrations.
     */
    down(): Promise<void>;
    /**
     * Show migration status.
     */
    status(): Promise<void>;
}
//# sourceMappingURL=migration-runner.d.ts.map