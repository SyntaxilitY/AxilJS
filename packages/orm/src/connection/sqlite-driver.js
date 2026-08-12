"use strict";
/**
 * SQLite driver - uses better-sqlite3 (synchronous API wrapped async).
 * SQLite is ideal for development, testing, and small deployments.
 * No server setup required - just a file.
 *
 * Install: npm install better-sqlite3
 *          npm install -D @types/better-sqlite3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteDriver = void 0;
const base_driver_1 = require("./base-driver");
class SQLiteDriver extends base_driver_1.BaseDriver {
    // The better-sqlite3 database instance
    // Typed as any to avoid requiring @types/better-sqlite3
    db = null;
    constructor(config) {
        super(config);
    }
    async connect() {
        try {
            // Dynamically import better-sqlite3 (peer dependency)
            const Database = require('better-sqlite3');
            const filename = this.config.filename || this.config.database || ':memory:';
            this.db = new Database(filename, {
                // verbose logging if configured
                verbose: this.config.logging
                    ? (sql) => console.log(`\x1b[90m[SQLite]\x1b[0m ${sql}`)
                    : undefined
            });
            // Enable WAL mode for better concurrent read performance
            this.db.pragma('journal_mode = WAL');
            // Enable foreign key enforcement
            this.db.pragma('foreign_keys = ON');
            this.connected = true;
            console.log(`\x1b[32m[REstJS ORM]\x1b[0m SQLite connected: ${filename}`);
        }
        catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('better-sqlite3 is required for SQLite support.\n' +
                    'Run: npm install better-sqlite3');
            }
            throw error;
        }
    }
    async disconnect() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.connected = false;
        }
    }
    async query(sql, params = []) {
        if (!this.db)
            throw new Error('SQLite not connected. Call connect() first.');
        this.log(sql, params);
        const trimmed = sql.trim().toUpperCase();
        try {
            if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
                // Read query - returns rows
                const rows = this.db.prepare(sql).all(...params);
                return { rows, affectedRows: 0 };
            }
            else {
                // Write query - returns run info
                const result = this.db.prepare(sql).run(...params);
                return {
                    rows: [],
                    affectedRows: result.changes,
                    insertId: result.lastInsertRowid
                };
            }
        }
        catch (error) {
            throw new Error(`SQLite query error: ${error.message}\nSQL: ${sql}`);
        }
    }
    async transaction(work) {
        if (!this.db)
            throw new Error('SQLite not connected.');
        // better-sqlite3 transactions are synchronous
        // We wrap in a promise for API consistency
        return new Promise((resolve, reject) => {
            const trxContext = {
                query: async (sql, params = []) => {
                    return this.query(sql, params);
                }
            };
            const trx = this.db.transaction(async () => {
                return await work(trxContext);
            });
            try {
                const result = trx();
                // Handle if result is a promise
                if (result && typeof result.then === 'function') {
                    result.then(resolve).catch(reject);
                }
                else {
                    resolve(result);
                }
            }
            catch (error) {
                reject(error);
            }
        });
    }
    async ping() {
        try {
            await this.query('SELECT 1');
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.SQLiteDriver = SQLiteDriver;
//# sourceMappingURL=sqlite-driver.js.map