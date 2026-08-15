"use strict";
/**
 * Database connection using @axiljs/orm
 * Configured for NeonDB (PostgreSQL with SSL)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = connectDB;
exports.getDB = getDB;
const orm_1 = require("@axiljs/orm");
const config_1 = require("./config");
let db;
async function connectDB() {
    db = await (0, orm_1.createConnection)({
        driver: 'postgres',
        url: config_1.config.DATABASE_URL,
        logging: config_1.config.NODE_ENV === 'development',
        ssl: { rejectUnauthorized: false },
        pool: { min: 1, max: 5 }
    });
    return db;
}
function getDB() {
    if (!db)
        throw new Error('Database not connected. Call connectDB() first.');
    return db;
}
