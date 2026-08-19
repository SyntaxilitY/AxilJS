/**
 * Collects database schema and row counts.
 * Works with SQLite, PostgreSQL, and MySQL.
 */
import type { TableInfo } from '../types.js';
export declare class DbCollector {
    private readonly driver;
    private readonly driverType;
    constructor(driver: any, driverType: string);
    collectTables(): Promise<TableInfo[]>;
    getTableRows(tableName: string, limit?: number, offset?: number): Promise<{
        rows: Record<string, unknown>[];
        total: number;
    }>;
    private collectSQLite;
    private getSQLiteColumns;
    private collectPostgres;
    private getPostgresColumns;
    private collectMySQL;
    private getMySQLColumns;
}
//# sourceMappingURL=db-collector.d.ts.map