"use strict";
/**
 * Auth Service — register, login, profile
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const auth_1 = require("@axil/auth");
const db_1 = require("../db");
class AuthService {
    jwt;
    constructor(jwt) {
        this.jwt = jwt;
    }
    get driver() { return (0, db_1.getDB)().getDriver(); }
    async register(data) {
        // Check duplicate
        const existing = await this.driver.query('SELECT id FROM users WHERE email = $1', [data.email]);
        if (existing.rows.length > 0)
            return { error: 'Email already registered' };
        const hashed = await (0, auth_1.hashPassword)(data.password);
        const result = await this.driver.query('INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at', [data.name, data.email, hashed, data.role || 'customer']);
        const user = result.rows[0];
        const token = this.jwt.sign({ sub: String(user.id), role: user.role, email: user.email }, { expiresIn: '7d' });
        return { user, token };
    }
    async login(email, password) {
        const result = await this.driver.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0)
            return { error: 'Invalid credentials' };
        const user = result.rows[0];
        const valid = await (0, auth_1.verifyPassword)(password, user.password);
        if (!valid)
            return { error: 'Invalid credentials' };
        const token = this.jwt.sign({ sub: String(user.id), role: user.role, email: user.email }, { expiresIn: '7d' });
        const { password: _, ...safe } = user;
        return { user: safe, token };
    }
    async getProfile(userId) {
        const result = await this.driver.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [userId]);
        return result.rows[0] || null;
    }
}
exports.AuthService = AuthService;
