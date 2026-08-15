"use strict";
/**
 * MySQL driver - uses the 'mysql2' package (Promise API).
 * Compatible with MySQL 5.7+, MySQL 8, and MariaDB.
 *
 * Install: npm install mysql2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MySQLDriver = void 0;
const base_driver_1 = require("./base-driver");
class MySQLDriver extends base_driver_1.BaseDriver {
    // mysql2 pool instance
    pool = null;
    constructor(config) {
        super(config);
    }
    async connect() {
        try {
            const mysql = require('mysql2/promise');
            this.pool = mysql.createPool({
                host: this.config.host || 'localhost',
                port: this.config.port || 3306,
                database: this.config.database,
                user: this.config.username,
                password: this.config.password,
                connectionLimit: this.config.pool?.max || 10,
                ssl: this.config.ssl
            });
            // Test connection
            const conn = await this.pool.getConnection();
            conn.release();
            this.connected = true;
            console.log(`\x1b[32m[@axilJS ORM]\x1b[0m MySQL connected: ` +
                `${this.config.host}:${this.config.port}/${this.config.database}`);
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
            const [rows, fields] = await this.pool.execute(sql, params);
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
                    const [rows] = await conn.execute(sql, params);
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
            await conn.rollback();
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