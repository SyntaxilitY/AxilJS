"use strict";
/**
 * MySQL driver - uses the 'mysql2' package (Promise API).
 * Compatible with MySQL 5.7+, MySQL 8, and MariaDB.
 *
 * Install: npm install mysql2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MySQLDriver = void 0;
exports.buildMySQLPoolOptions = buildMySQLPoolOptions;
const base_driver_1 = require("./base-driver");
/**
 * mysql2 pool options for a ConnectionConfig. `config.url`
 * (mysql://user:pass@host:3306/db) takes priority over the individual fields,
 * which still override pool size / ssl.
 */
function buildMySQLPoolOptions(config) {
    const common = {
        connectionLimit: config.pool?.max || 10,
        ...(config.ssl !== undefined ? { ssl: config.ssl } : {})
    };
    if (config.url) {
        return { uri: config.url, ...common };
    }
    return {
        host: config.host || 'localhost',
        port: config.port || 3306,
        database: config.database,
        user: config.username,
        password: config.password,
        ...common
    };
}
class MySQLDriver extends base_driver_1.BaseDriver {
    // mysql2 pool instance
    pool = null;
    constructor(config) {
        super(config);
    }
    async connect() {
        try {
            const mysql = require('mysql2/promise');
            this.pool = mysql.createPool(buildMySQLPoolOptions(this.config));
            // Test connection
            let conn;
            try {
                conn = await this.pool.getConnection();
            }
            catch (error) {
                // Don't leak the pool when the first connection fails
                await this.pool.end().catch(() => { });
                this.pool = null;
                throw error;
            }
            conn.release();
            this.connected = true;
            const target = this.config.url
                ? this.config.url.replace(/:[^:@/]+@/, ':***@') // Hide password in log
                : `${this.config.host}:${this.config.port}/${this.config.database}`;
            // logging: false silences connection messages too
            if (this.config.logging !== false) {
                console.log(`\x1b[32m[AxilJS ORM]\x1b[0m MySQL connected: ${target}`);
            }
        }
        catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('mysql2 is required for MySQL support.\n' +
                    'Run: npm install mysql2');
            }
            throw error;
        }
    }
    async disconnect() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.connected = false;
        }
    }
    async query(sql, params = []) {
        if (!this.pool) {
            throw new Error('MySQL not connected. Call connect() first.');
        }
        this.log(sql, params);
        try {
            // mysql2 rejects undefined bind values — send NULL instead
            const [rows, fields] = await this.pool.execute(sql, params.map(v => v === undefined ? null : v));
            // mysql2 returns different shapes for SELECT vs writes
            if (Array.isArray(rows)) {
                return { rows: rows, affectedRows: 0 };
            }
            return {
                rows: [],
                affectedRows: rows.affectedRows || 0,
                insertId: rows.insertId
            };
        }
        catch (error) {
            throw new Error(`MySQL query error: ${error.message}\nSQL: ${sql}`);
        }
    }
    async transaction(work) {
        if (!this.pool)
            throw new Error('MySQL not connected.');
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const trxContext = {
                query: async (sql, params = []) => {
                    this.log(sql, params);
                    const [rows] = await conn.execute(sql, params.map(v => v === undefined ? null : v));
                    if (Array.isArray(rows)) {
                        return { rows: rows, affectedRows: 0 };
                    }
                    return {
                        rows: [],
                        affectedRows: rows.affectedRows || 0,
                        insertId: rows.insertId
                    };
                }
            };
            const result = await work(trxContext);
            await conn.commit();
            return result;
        }
        catch (error) {
            try {
                await conn.rollback();
            }
            catch {
                // Preserve the original error
            }
            throw error;
        }
        finally {
            conn.release();
        }
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
exports.MySQLDriver = MySQLDriver;
//# sourceMappingURL=mysql-driver.js.map