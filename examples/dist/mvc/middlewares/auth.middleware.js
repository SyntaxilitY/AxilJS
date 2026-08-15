"use strict";
/**
 * Auth Middleware — Verifies JWT and attaches user to request
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthMiddleware = createAuthMiddleware;
exports.createOptionalAuthMiddleware = createOptionalAuthMiddleware;
exports.requireAdmin = requireAdmin;
exports.requireAuthorOrAdmin = requireAuthorOrAdmin;
const User_1 = require("../models/User");
function createAuthMiddleware(jwt) {
    return (req, res, next) => {
        const header = req.headers['authorization'];
        if (!header || !header.startsWith('Bearer ')) {
            return res.unauthorized('No token provided', { code: 'UNAUTHORIZED' });
        }
        const token = header.slice(7);
        try {
            const payload = jwt.verify(token);
            const user = User_1.UserModel.findById(Number(payload.sub));
            if (!user)
                return res.unauthorized('User not found', { code: 'UNAUTHORIZED' });
            req.locals.user = payload;
            req.locals.userId = Number(payload.sub);
            req.locals.role = payload.role;
            next();
        }
        catch (err) {
            return res.unauthorized('Invalid token', { code: 'UNAUTHORIZED' });
        }
    };
}
// Optional auth — does not fail if no token
function createOptionalAuthMiddleware(jwt) {
    return (req, res, next) => {
        const header = req.headers['authorization'];
        if (header && header.startsWith('Bearer ')) {
            try {
                const payload = jwt.verify(header.slice(7));
                req.locals.user = payload;
                req.locals.userId = Number(payload.sub);
                req.locals.role = payload.role;
            }
            catch {
                // Invalid token — treat as unauthenticated
            }
        }
        next();
    };
}
// Admin-only middleware
function requireAdmin() {
    return (req, res, next) => {
        if (req.locals.role !== 'admin') {
            return res.forbidden('Admin access required');
        }
        next();
    };
}
// Author or admin middleware
function requireAuthorOrAdmin() {
    return (req, res, next) => {
        const role = req.locals.role;
        if (role !== 'admin' && role !== 'author') {
            return res.forbidden('Author or admin access required');
        }
        next();
    };
}
//# sourceMappingURL=auth.middleware.js.map