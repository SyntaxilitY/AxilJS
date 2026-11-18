/**
 * @axiljs/auth - Public API
 */
export { JWT } from './jwt/jwt';
export type { JWTPayload, JWTSignOptions, JWTVerifyOptions, JWTOptions, JWTAlgorithm } from './jwt/jwt';
export { authenticate, getUser } from './middleware/auth-middleware';
export type { AuthOptions, AuthUser } from './middleware/auth-middleware';
export { requireRole, requirePermission, requireOwnership } from './middleware/rbac';
export { hashPassword, verifyPassword, isHashed } from './password/password';
export { AUTH_MIDDLEWARE, markAuth } from './middleware/marker';
//# sourceMappingURL=index.d.ts.map