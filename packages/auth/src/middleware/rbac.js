"use strict";
/**
 * Role-Based Access Control (RBAC) middleware.
 * Control which roles can access which routes.
 *
 * Usage:
 *   // Only admins
 *   app.delete('/users/:id', authenticate(jwt), requireRole('admin'), deleteUser)
 *
 *   // Multiple roles allowed
 *   app.get('/reports', authenticate(jwt), requireRole(['admin', 'manager']), getReports)
 *
 *   // Permission-based
 *   app.post('/posts', authenticate(jwt), requirePermission('posts:create'), createPost)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
exports.requirePermission = requirePermission;
exports.requireOwnership = requireOwnership;
const common_1 = require("@axil/common");
/**
 * Require the authenticated user to have one of the specified roles.
 * Must be used AFTER authenticate() middleware.
 *
 * The user object (req.locals.user) must have a 'role' or 'roles' field.
 */
function requireRole(roles) {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    return (req, res, next) => {
        const user = req.locals?.user;
        if (!user) {
            return next(new common_1.UnauthorizedError('Authentication required'));
        }
        // Support both single role and array of roles on the user object
        const userRoles = Array.isArray(user.roles)
            ? user.roles
            : user.role
                ? [user.role]
                : [];
        const hasRole = allowedRoles.some(role => userRoles.includes(role));
        if (!hasRole) {
            return next(new common_1.ForbiddenError(`Access denied. Required role(s): ${allowedRoles.join(', ')}. ` +
                `Your role(s): ${userRoles.join(', ') || 'none'}`));
        }
        next();
    };
}
/**
 * Require the authenticated user to have a specific permission.
 * The user object must have a 'permissions' array field.
 *
 * Permissions are strings like 'users:read', 'posts:create', 'admin:*'
 */
function requirePermission(permission) {
    return (req, res, next) => {
        const user = req.locals?.user;
        if (!user) {
            return next(new common_1.UnauthorizedError('Authentication required'));
        }
        const permissions = user.permissions || [];
        // Check for exact permission or wildcard match
        const hasPermission = permissions.some(p => {
            if (p === permission)
                return true;
            // Wildcard: 'admin:*' matches 'admin:read', 'admin:write', etc.
            if (p.endsWith(':*')) {
                const prefix = p.slice(0, -1); // 'admin:'
                return permission.startsWith(prefix);
            }
            // Super wildcard: '*' matches everything
            if (p === '*')
                return true;
            return false;
        });
        if (!hasPermission) {
            return next(new common_1.ForbiddenError(`Access denied. Required permission: ${permission}`));
        }
        next();
    };
}
/**
 * Ensure the authenticated user can only access their own resources.
 * Compares user.id to a route param.
 *
 * Usage:
 *   app.get('/users/:id/profile', authenticate(jwt), requireOwnership('id'), getProfile)
 */
function requireOwnership(paramName = 'id') {
    return (req, res, next) => {
        const user = req.locals?.user;
        if (!user) {
            return next(new common_1.UnauthorizedError('Authentication required'));
        }
        const resourceId = req.params[paramName];
        const userId = String(user.id || user.sub);
        // Admins can access any resource
        const isAdmin = user.role === 'admin' ||
            (Array.isArray(user.roles) && user.roles.includes('admin'));
        if (!isAdmin && resourceId !== userId) {
            return next(new common_1.ForbiddenError('You do not have permission to access this resource'));
        }
        next();
    };
}
//# sourceMappingURL=rbac.js.map