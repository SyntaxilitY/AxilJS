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
import { MiddlewareFn } from '@axil/common';
/**
 * Require the authenticated user to have one of the specified roles.
 * Must be used AFTER authenticate() middleware.
 *
 * The user object (req.locals.user) must have a 'role' or 'roles' field.
 */
export declare function requireRole(roles: string | string[]): MiddlewareFn;
/**
 * Require the authenticated user to have a specific permission.
 * The user object must have a 'permissions' array field.
 *
 * Permissions are strings like 'users:read', 'posts:create', 'admin:*'
 */
export declare function requirePermission(permission: string): MiddlewareFn;
/**
 * Ensure the authenticated user can only access their own resources.
 * Compares user.id to a route param.
 *
 * Usage:
 *   app.get('/users/:id/profile', authenticate(jwt), requireOwnership('id'), getProfile)
 */
export declare function requireOwnership(paramName?: string): MiddlewareFn;
//# sourceMappingURL=rbac.d.ts.map