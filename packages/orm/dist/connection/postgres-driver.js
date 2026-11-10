"use strict";
/**
 * PostgreSQL driver - uses the 'pg' package.
 * Production-ready with connection pooling.
 *
 * Install: npm install pg
 *          npm install -D @types/pg
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDriver = void 0;
const base_driver_1 = require("./base-driver");
class PostgresDriver extends base_driver_1.BaseDriver {
    // pg.Pool instance - typed as any to avoid requiring @types/pg
    pool = null;
    constructor(config) {
        super(config);
    }
    async connect() {
        try {
            const { Pool } = require('pg');
            // Build connection config for pg
            const pgConfig = this.config.url
                ? {
                    connectionString: this.config.url,
                    ssl: this.config.ssl,
                    max: this.config.pool?.max || 10,
                    min: this.config.pool?.min || 2,
                    idleTimeoutMillis: this.config.pool?.idleTimeoutMs || 30000
                }
                : {
                    host: this.config.host || 'localhost',
                    port: this.config.port || 5432,
                    database: this.config.database,
                    user: this.config.username,
                    password: this.config.password,
                    ssl: this.config.ssl,
                    max: this.config.pool?.max || 10,
                    min: this.config.pool?.min || 2,
                    idleTimeoutMillis: this.config.pool?.idleTimeoutMs || 30000
                };
            this.pool = new Pool(pgConfig);
            // Test connection
            let client;
            try {
                client = await this.pool.connect();
            }
            catch (error) {
                // Don't leak the pool when the first connection fails
                await this.pool.end().catch(() => { });
                this.pool = null;
                throw error;
            }
            client.release();
            this.connected = true;
            const host = this.config.url
                ? this.config.url.replace(/:[^@]+@/, ':***@') // Hide password in log
                : `${this.config.host}:${this.config.port}/${this.config.database}`;
            console.log(`\x1b[32m[AxilJS ORM]\x1b[0m PostgreSQL connected: ${host}`);
        }
        catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('pg is required for PostgreSQL support.\n' +
                    'Run: npm install pg');
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
            throw new Error('PostgreSQL not connected. Call connect() first.');
        }
        this.log(sql, params);
        try {
            const result = await this.pool.query(sql, params);
            return {
                rows: result.rows,
                affectedRows: result.rowCount || 0,
                insertId: result.rows[0]?.id
            };
        }
        catch (error) {
            throw new Error(`PostgreSQL query error: ${error.message}\nSQL: ${sql}`);
        }
    }
    async transaction(work) {
        if (!this.pool)
            throw new Error('PostgreSQL not connected.');
        const client = await this.pool.connect();
        let broken = undefined;
        try {
            await client.query('BEGIN');
            const trxContext = {
                query: async (sql, params = []) => {
                    this.log(sql, params);
                    const result = await client.query(sql, params);
                    return {
                        rows: result.rows,
                        affectedRows: result.rowCount || 0,
                        insertId: result.rows[0]?.id
                    };
                }
            };
            const result = await work(trxContext);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            try {
                await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                // Connection is unusable — destroy it instead of returning it to the pool
                broken = rollbackError;
            }
            throw error;
        }
        finally {
            client.release(broken);
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
exports.PostgresDriver = PostgresDriver;
//# sourceMappingURL=postgres-driver.js.map