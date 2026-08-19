/**
 * Migration Runner.
 * Manages database schema changes.
 * Supports PostgreSQL, MySQL, and SQLite parameter styles.
 */
import { BaseDriver, TransactionContext } from '../connection/base-driver';
export interface Migration {
    up(db: TransactionContext): Promise<void>;
    down(db: TransactionContext): Promise<void>;
}
export declare class MigrationRunner {
    private driver;
    private migrationsDir;
    private driverType;
    constructor(driver: BaseDriver, migrationsDir?: string);
    /** Parameter placeholder: $1 for postgres, ? for others */
    private p;
    private ensureMigrationsTable;
    private getMigrationFiles;
    private getExecutedMigrations;
    up(): Promise<void>;
    down(): Promise<void>;
    status(): Promise<void>;
}
//# sourceMappingURL=migration-runner.d.ts.map