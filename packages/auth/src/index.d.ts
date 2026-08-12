/**
 * @restjs/auth - Public API
 */
export { JWT } from './jwt/jwt';
export type { JWTPayload, JWTSignOptions, JWTVerifyOptions } from './jwt/jwt';
export { authenticate, getUser } from './middleware/auth-middleware';
export type { AuthOptions, AuthUser } from './middleware/auth-middleware';
export { requireRole, requirePermission, requireOwnership } from './middleware/rbac';
export { hashPassword, verifyPassword, isHashed } from './password/password';
//# sourceMappingURL=index.d.ts.map