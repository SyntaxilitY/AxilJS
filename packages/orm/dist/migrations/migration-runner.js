"use strict";
/**
 * Migration Runner.
 * Manages database schema changes.
 * Supports PostgreSQL, MySQL, and SQLite parameter styles.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationRunner = exports.MigrationSafetyError = void 0;
exports.checkMigrations = checkMigrations;
const fs_1 = require("fs");
const path_1 = require("path");
const safety_1 = require("./safety");
/** Thrown by `MigrationRunner#up()` in `block` mode when a pending migration has error findings. */
class MigrationSafetyError extends Error {
    results;
    constructor(results) {
        const lines = results.flatMap(r => r.findings
            .filter(f => f.severity === 'error')
            .map(f => `  ${r.name}: [${f.rule}] ${f.message}`));
        super(`Migration safety check blocked ${results.length} migration(s); nothing was run.\n${lines.join('\n')}\n` +
            'Fix the statements, or mark an intended one with "-- axil:allow <rule>".');
        this.name = 'MigrationSafetyError';
        this.results = results;
    }
}
exports.MigrationSafetyError = MigrationSafetyError;
const emptyResult = () => ({ rows: [], affectedRows: 0 });
/**
 * A stand-in for the database that records SQL, executes nothing and
 * answers every query with no rows.
 */
function recordingContext(captured, driver) {
    const target = {
        config: { driver },
        async query(sql) {
            if (typeof sql === 'string')
                captured.push(sql);
            return emptyResult();
        }
    };
    const proxy = new Proxy(target, {
        get(t, prop) {
            if (typeof prop === 'symbol' || prop === 'then')
                return undefined;
            if (prop in t)
                return t[prop];
            return async () => emptyResult();
        }
    });
    target.transaction = async (work) => work(proxy);
    return proxy;
}
function toDialect(driver) {
    return driver === 'postgres' || driver === 'mysql' || driver === 'sqlite' ? driver : undefined;
}
/** Standalone form of `runner.check()` */
function checkMigrations(runner, options) {
    return runner.check(options);
}
class MigrationRunner {
    driver;
    migrationsDir;
    driverType;
    options;
    constructor(driver, migrationsDir, options = {}) {
        this.driver = driver;
        this.migrationsDir = migrationsDir || (0, path_1.join)(process.cwd(), 'src', 'migrations');
        this.driverType = driver.config?.driver || 'sqlite';
        this.options = options;
    }
    loadMigration(filePath, fn = 'up') {
        const mod = require(filePath);
        // Support both `export function up` and `export default { up, down }`
        return mod && typeof mod[fn] !== 'function' && mod.default ? mod.default : mod;
    }
    /**
     * Run each migration's `up()` against a recording driver (nothing is
     * executed, every query returns no rows) and analyze the captured SQL for
     * statements that lock or rewrite tables or break deployed code.
     * Checks pending migrations unless `all` is set.
     */
    async check(options = {}) {
        const files = this.getMigrationFiles();
        let executed = new Set();
        if (!options.all) {
            try {
                executed = new Set((await this.getExecutedMigrations()).map(m => m.name));
            }
            catch {
                // No _migrations table yet: every migration is pending
            }
        }
        return this.checkFiles(files.filter(f => !executed.has(f.replace(/\.(ts|js)$/, ''))));
    }
    async checkFiles(files) {
        const dialect = toDialect(this.driverType);
        const results = [];
        for (const file of files) {
            const name = file.replace(/\.(ts|js)$/, '');
            const filePath = (0, path_1.join)(this.migrationsDir, file);
            const statements = [];
            const failures = [];
            let inTransaction = true;
            try {
                const migration = this.loadMigration(filePath);
                inTransaction = migration.transaction !== false;
                if (typeof migration.up !== 'function')
                    throw new Error('it does not export an up() function');
                await migration.up(recordingContext(statements, this.driverType));
            }
            catch (error) {
                failures.push({
                    rule: 'dynamic-analysis-failed',
                    severity: 'info',
                    statement: '',
                    message: `Could not analyze ${name} dynamically: ${error?.message ?? String(error)}. ` +
                        `Only the ${statements.length} statement(s) captured before the error were checked.`,
                    fix: 'The check runs up() against a recording driver that returns no rows. Guard code that reads query ' +
                        'results (rows[0]?.id), or review this migration by hand.'
                });
            }
            const findings = dialect
                ? (0, safety_1.analyzeMigration)(statements, {
                    dialect,
                    inTransaction,
                    tableSizes: this.options.tableSizes,
                    largeTableThreshold: this.options.largeTableThreshold,
                    columnTypes: this.options.columnTypes,
                    ignore: this.options.ignore
                })
                : [];
            results.push({ name, file: filePath, statements, findings: [...findings, ...failures] });
        }
        return results;
    }
    printFindings(results) {
        const all = results.flatMap(r => r.findings.map(f => ({ name: r.name, f })));
        if (all.length === 0) {
            console.log('\x1b[32m[AxilJS ORM]\x1b[0m Migration safety: no findings.');
            return;
        }
        console.log(`\n\x1b[33m[AxilJS ORM]\x1b[0m Migration safety: ${all.length} finding(s)\n`);
        for (const { name, f } of all) {
            const color = f.severity === 'error' ? '\x1b[31m' : f.severity === 'warning' ? '\x1b[33m' : '\x1b[36m';
            console.log(`  ${color}${f.severity.toUpperCase()}\x1b[0m ${name} [${f.rule}]${f.lock ? ` lock: ${f.lock}` : ''}`);
            if (f.statement) {
                console.log(`    ${f.statement.length > 160 ? f.statement.slice(0, 157) + '...' : f.statement}`);
            }
            console.log(`    ${f.message}`);
            console.log(`    Fix: ${f.fix}\n`);
        }
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
        // Skip declaration files and keep one file per migration name
        // (x.ts + x.js side by side would otherwise run twice in one batch)
        const seen = new Set();
        return (0, fs_1.readdirSync)(this.migrationsDir)
            .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))
            .sort()
            .filter(f => {
            const name = f.replace(/\.(ts|js)$/, '');
            if (seen.has(name))
                return false;
            seen.add(name);
            return true;
        });
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
        const safety = this.options.safety ?? 'off';
        if (safety !== 'off') {
            const results = await this.checkFiles(pending);
            this.printFindings(results);
            if (safety === 'block') {
                const blocked = results.filter(r => r.findings.some(f => f.severity === 'error'));
                if (blocked.length > 0)
                    throw new MigrationSafetyError(blocked);
            }
        }
        console.log(`\n\x1b[36m[AxilJS ORM]\x1b[0m Running ${pending.length} migrations (batch ${batch})...\n`);
        for (const file of pending) {
            const name = file.replace(/\.(ts|js)$/, '');
            const filePath = (0, path_1.join)(this.migrationsDir, file);
            process.stdout.write(`  Migrating: ${name}... `);
            try {
                const migration = this.loadMigration(filePath);
                const run = async (db) => {
                    await migration.up(db);
                    await db.query(`INSERT INTO _migrations (name, batch) VALUES (${this.p(1)}, ${this.p(2)})`, [name, batch]);
                };
                if (migration.transaction === false)
                    await run(this.driver);
                else
                    await this.driver.transaction(run);
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
                const mig = this.loadMigration(path, 'down');
                const run = async (db) => {
                    await mig.down(db);
                    await db.query(`DELETE FROM _migrations WHERE name = ${this.p(1)}`, [migration.name]);
                };
                if (mig.transaction === false)
                    await run(this.driver);
                else
                    await this.driver.transaction(run);
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