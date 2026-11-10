/**
 * @axiljs/auth - Public API
 */

// JWT
export { JWT } from './jwt/jwt';
export type {
  JWTPayload,
  JWTSignOptions,
  JWTVerifyOptions,
  JWTOptions,
  JWTAlgorithm
} from './jwt/jwt';

// Auth middleware
export { authenticate, getUser } from './middleware/auth-middleware';
export type { AuthOptions, AuthUser } from './middleware/auth-middleware';

// RBAC
export { requireRole, requirePermission, requireOwnership } from './middleware/rbac';

// Password
export { hashPassword, verifyPassword, isHashed } from './password/password';