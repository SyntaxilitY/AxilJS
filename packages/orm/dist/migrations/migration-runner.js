"use strict";
/**
 * Migration Runner.
 * Manages database schema changes.
 * Supports PostgreSQL, MySQL, and SQLite parameter styles.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationRunner = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
class MigrationRunner {
    driver;
    migrationsDir;
    driverType;
    constructor(driver, migrationsDir) {
        this.driver = driver;
        this.migrationsDir = migrationsDir || (0, path_1.join)(process.cwd(), 'src', 'migrations');
        this.driverType = driver.config?.driver || 'sqlite';
    }
    /** Parameter placeholder: $1 for postgres, ? for others */
    p(index) {
        return this.driverType === 'postgres' ? `$${index}` : '?';
    }
    async ensureMigrationsTable() {
        if (this.driverType === 'postgres') {
            await this.driver.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id          SERIAL PRIMARY KEY,
          name        VARCHAR(255) NOT NULL UNIQUE,
          batch       INTEGER NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
        }
        else if (this.driverType === 'mysql') {
            await this.driver.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id          INTEGER AUTO_INCREMENT PRIMARY KEY,
          name        VARCHAR(255) NOT NULL UNIQUE,
          batch       INTEGER NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
        }
        else {
            await this.driver.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        VARCHAR(255) NOT NULL UNIQUE,
          batch       INTEGER NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
        }
    }
    getMigrationFiles() {
        if (!(0, fs_1.existsSync)(this.migrationsDir))
            return [];
        return (0, fs_1.readdirSync)(this.migrationsDir)
            .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
            .sort();
    }
    async getExecutedMigrations() {
        const result = await this.driver.query('SELECT * FROM _migrations ORDER BY id ASC');
        return result.rows;
    }
    async up() {
        await this.ensureMigrationsTable();
        const files = this.getMigrationFiles();
        const executed = await this.getExecutedMigrations();
        const executedNames = new Set(executed.map(m => m.name));
        const pending = files.filter(f => {
            const name = f.replace(/\.(ts|js)$/, '');
            return !executedNames.has(name);
        });
        if (pending.length === 0) {
            console.log('\x1b[32m[AxilJS ORM]\x1b[0m All migrations up to date.');
            return;
        }
        const lastBatch = executed.length > 0
            ? Math.max(...executed.map(m => m.batch))
            : 0;
        const batch = lastBatch + 1;
        console.log(`\n\x1b[36m[AxilJS ORM]\x1b[0m Running ${pending.length} migrations (batch ${batch})...\n`);
        for (const file of pending) {
            const name = file.replace(/\.(ts|js)$/, '');
            const filePath = (0, path_1.join)(this.migrationsDir, file);
            process.stdout.write(`  Migrating: ${name}... `);
            try {
                await this.driver.transaction(async (trx) => {
                    const migration = require(filePath);
                    await migration.up(trx);
                    await trx.query(`INSERT INTO _migrations (name, batch) VALUES (${this.p(1)}, ${this.p(2)})`, [name, batch]);
                });
                console.log('\x1b[32mdone\x1b[0m');
            }
            catch (error) {
                console.log('\x1b[31mFAILED\x1b[0m');
                throw new Error(`Migration failed: ${name}\n${error.message}`);
            }
        }
        console.log(`\n\x1b[32m✓\x1b[0m ${pending.length} migrations completed.\n`);
    }
    async down() {
        await this.ensureMigrationsTable();
        const executed = await this.getExecutedMigrations();
        if (executed.length === 0) {
            console.log('\x1b[33m[AxilJS ORM]\x1b[0m Nothing to roll back.');
            return;
        }
        const lastBatch = Math.max(...executed.map(m => m.batch));
        const toRollback = executed
            .filter(m => m.batch === lastBatch)
            .reverse();
        console.log(`\n\x1b[33m[AxilJS ORM]\x1b[0m Rolling back batch ${lastBatch}...\n`);
        for (const migration of toRollback) {
            const filePath = (0, path_1.join)(this.migrationsDir, `${migration.name}.ts`);
            const jsPath = (0, path_1.join)(this.migrationsDir, `${migration.name}.js`);
            const path = (0, fs_1.existsSync)(filePath) ? filePath : jsPath;
            process.stdout.write(`  Rolling back: ${migration.name}... `);
            try {
                await this.driver.transaction(async (trx) => {
                    const mig = require(path);
                    await mig.down(trx);
                    await trx.query(`DELETE FROM _migrations WHERE name = ${this.p(1)}`, [migration.name]);
                });
                console.log('\x1b[32mdone\x1b[0m');
            }
            catch (error) {
                console.log('\x1b[31mFAILED\x1b[0m');
                throw error;
            }
        }
        console.log('\n\x1b[32m✓\x1b[0m Rollback complete.\n');
    }
    async status() {
        await this.ensureMigrationsTable();
        const files = this.getMigrationFiles();
        const executed = await this.getExecutedMigrations();
        const executedMap = new Map(executed.map(m => [m.name, m]));
        console.log('\n\x1b[36m[AxilJS ORM]\x1b[0m Migration Status:\n');
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
exports.MigrationRunner = MigrationRunner;
//# sourceMappingURL=migration-runner.js.map