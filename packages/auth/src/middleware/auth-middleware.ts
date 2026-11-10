/**
 * Authentication middleware.
 * Extracts and verifies JWT tokens from requests.
 * Attaches the decoded user to req.locals.user.
 *
 * Usage:
 *   // Protect all routes
 *   app.use(authenticate(jwt))
 *
 *   // Protect specific routes
 *   app.get('/profile', authenticate(jwt), getProfile)
 *
 *   // Optional auth (don't fail if no token)
 *   app.get('/feed', authenticate(jwt, { required: false }), getFeed)
 */

import { MiddlewareFn, UnauthorizedError } from '@axiljs/common';
import { JWT, JWTPayload } from '../jwt/jwt';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface AuthOptions {
  // If false, don't throw if no token (guest access allowed)
  // req.locals.user will be undefined for unauthenticated requests
  required?: boolean;

  // Where to look for the token
  // 'header' = Authorization: Bearer <token>
  // 'cookie' = cookie named 'token'
  // 'query'  = ?token=...
  source?: 'header' | 'cookie' | 'query' | ('header' | 'cookie' | 'query')[];

  // Cookie name for source 'cookie' (default: 'token')
  cookieName?: string;

  // Query parameter for source 'query' (default: 'token')
  queryParam?: string;

  // Expected audience / issuer, passed to jwt.verify()
  audience?: string | string[];
  issuer?: string;
}

// ─── Extended Request ─────────────────────────────────────────────────────────

// The authenticated user attached to req.locals
export interface AuthUser {
  id: string | number;
  [key: string]: unknown;
}

/**
 * Extract token from request based on configured sources.
 */
function extractToken(
  req: any,
  sources: string[],
  cookieName: string = 'token',
  queryParam: string = 'token'
): string | null {
  for (const source of sources) {
    switch (source) {
      case 'header': {
        const authHeader = req.headers['authorization'] as string;
        // Auth scheme is case-insensitive (RFC 7235 §2.1)
        if (typeof authHeader === 'string' && /^bearer /i.test(authHeader)) {
          return authHeader.slice(7).trim();
        }
        break;
      }

      case 'cookie': {
        const cookieHeader = req.headers['cookie'] as string || '';
        const cookies: Record<string, string> = {};
        cookieHeader.split(';').forEach((c: string) => {
          const [k, v] = c.trim().split('=');
          if (k) cookies[k.trim()] = v?.trim() || '';
        });
        if (Object.prototype.hasOwnProperty.call(cookies, cookieName) && cookies[cookieName]) {
          return cookies[cookieName];
        }
        break;
      }

      case 'query': {
        // ?token=a&token=b yields an array - only accept a single string
        const value = req.query && Object.prototype.hasOwnProperty.call(req.query, queryParam)
          ? req.query[queryParam]
          : undefined;
        if (typeof value === 'string' && value) {
          return value;
        }
        break;
      }
    }
  }
  return null;
}

/**
 * Create authentication middleware.
 *
 * @param jwt      JWT instance with the secret
 * @param options  Authentication options
 */
export function authenticate(
  jwt: JWT,
  options: AuthOptions = {}
): MiddlewareFn {
  const {
    required = true,
    source = 'header',
    cookieName,
    queryParam,
    audience,
    issuer
  } = options;

  const sources = Array.isArray(source) ? source : [source];

  return (req, res, next) => {
    const token = extractToken(req, sources, cookieName, queryParam);

    if (!token) {
      if (required) {
        return next(new UnauthorizedError('Authentication required. Provide a Bearer token.'));
      }
      // Optional auth - continue without user
      return next();
    }

    try {
      const payload = jwt.verify(token, { audience, issuer });

      // Attach user to request locals for use in handlers
      req.locals.user = {
        id: payload.sub,
        ...payload
      } as AuthUser;

      next();
    } catch (error) {
      next(error instanceof Error ? error : new UnauthorizedError());
    }
  };
}

/**
 * Get the authenticated user from request.
 * Throws if not authenticated.
 */
export function getUser(req: any): AuthUser {
  const user = req.locals?.user as AuthUser | undefined;

  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  return user;
}