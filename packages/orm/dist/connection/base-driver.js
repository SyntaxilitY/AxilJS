"use strict";
/**
 * Abstract base class for all database drivers.
 * Each driver (postgres, mysql, sqlite, mongodb) extends this.
 * The query builder and repository talk to this interface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseDriver = void 0;
exports.classifyStatement = classifyStatement;
class BaseDriver {
    config;
    connected = false;
    constructor(config) {
        this.config = config;
    }
    /**
     * Get the connected state.
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Log a query if logging is enabled. Every driver calls this before it
     * executes a statement, so it also reports the statement to
     * @axiljs/runtime's intent checks (tReadOnly / tPure) when that package is
     * loaded. In enforce mode the report throws and the statement never runs.
     */
    log(sql, params) {
        reportQuery(sql);
        if (this.config.logging) {
            console.log(`\x1b[90m[AxilJS ORM]\x1b[0m ${sql}`, params?.length ? params : '');
        }
    }
}
exports.BaseDriver = BaseDriver;
// Transaction control and session settings change no data; count them as reads
const READ_STATEMENT = /^\s*(?:\(\s*)?(?:select|show|explain|describe|desc|pragma|values|begin|start\s+transaction|commit|rollback|savepoint|release|set)\b/i;
const WRITE_KEYWORD = /\b(?:insert|update|delete|merge|upsert|replace|create|alter|drop|truncate|grant|revoke)\b/i;
/** Replace line (--) and block comments with spaces in one linear pass (no regex backtracking). */
function stripComments(sql) {
    let out = '';
    let i = 0;
    while (i < sql.length) {
        if (sql[i] === '-' && sql[i + 1] === '-') {
            const end = sql.indexOf('\n', i + 2);
            out += ' ';
            i = end === -1 ? sql.length : end;
        }
        else if (sql[i] === '/' && sql[i + 1] === '*') {
            const end = sql.indexOf('*/', i + 2);
            out += ' ';
            i = end === -1 ? sql.length : end + 2;
        }
        else {
            out += sql[i++];
        }
    }
    return out;
}
/** Classify a statement as 'db.read' or 'db.write'. */
function classifyStatement(sql) {
    const text = stripComments(sql);
    if (READ_STATEMENT.test(text))
        return /\bfor\s+update\b/i.test(text) ? 'db.write' : 'db.read';
    // WITH ... SELECT is a read unless a CTE writes (WITH x AS (DELETE ... RETURNING *))
    if (/^\s*with\b/i.test(text))
        return WRITE_KEYWORD.test(text) ? 'db.write' : 'db.read';
    return 'db.write';
}
/** Report a statement to @axiljs/runtime without depending on it. */
function reportQuery(sql) {
    const report = globalThis[Symbol.for('axiljs.intent.report')];
    if (typeof report === 'function')
        report(classifyStatement(sql), sql.trim().slice(0, 120));
}
//# sourceMappingURL=base-driver.js.map