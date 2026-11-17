/**
 * Migration Runner.
 * Manages database schema changes.
 * Supports PostgreSQL, MySQL, and SQLite parameter styles.
 */
import { BaseDriver, TransactionContext } from '../connection/base-driver';
import { MigrationFinding } from './safety';
export interface Migration {
    up(db: TransactionContext): Promise<void>;
    down(db: TransactionContext): Promise<void>;
    /**
     * Set to `false` to run this migration outside a transaction. Needed for
     * statements PostgreSQL refuses inside a transaction block, such as
     * CREATE INDEX CONCURRENTLY. Export it as `export const transaction = false`.
     */
    transaction?: boolean;
}
/** `off`: no check (default). `warn`: print findings. `block`: also refuse to run when any finding is an error. */
export type MigrationSafetyMode = 'off' | 'warn' | 'block';
export interface MigrationRunnerOptions {
    /** Run the migration safety check before `up()`. Default `off` */
    safety?: MigrationSafetyMode;
    /** Approximate row counts by table; lock-duration findings escalate for large tables */
    tableSizes?: Record<string, number>;
    /** Row count above which findings escalate. Default 1,000,000 */
    largeTableThreshold?: number;
    /** Current column types (`table.column` → type), used to recognise safe type widenings */
    columnTypes?: Record<string, string>;
    /** Rule ids to skip */
    ignore?: string[];
}
export interface MigrationCheckResult {
    /** Migration name (file name without extension) */
    name: string;
    /** Absolute path of the migration file */
    file: string;
    /** SQL captured from `up()` */
    statements: string[];
    findings: MigrationFinding[];
}
export interface MigrationCheckOptions {
    /** Check every migration file, not only pending ones */
    all?: boolean;
}
/** Thrown by `MigrationRunner#up()` in `block` mode when a pending migration has error findings. */
export declare class MigrationSafetyError extends Error {
    readonly results: MigrationCheckResult[];
    constructor(results: MigrationCheckResult[]);
}
/** Standalone form of `runner.check()` */
export declare function checkMigrations(runner: MigrationRunner, options?: MigrationCheckOptions): Promise<MigrationCheckResult[]>;
export declare class MigrationRunner {
    private driver;
    private migrationsDir;
    private driverType;
    private options;
    constructor(driver: BaseDriver, migrationsDir?: string, options?: MigrationRunnerOptions);
    private loadMigration;
    /**
     * Run each migration's `up()` against a recording driver (nothing is
     * executed, every query returns no rows) and analyze the captured SQL for
     * statements that lock or rewrite tables or break deployed code.
     * Checks pending migrations unless `all` is set.
     */
    check(options?: MigrationCheckOptions): Promise<MigrationCheckResult[]>;
    private checkFiles;
    private printFindings;
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