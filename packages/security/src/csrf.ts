/**
 * CSRF (Cross-Site Request Forgery) protection middleware.
 * Uses the Double Submit Cookie pattern.
 *
 * How it works:
 *   1. Server generates a random token and sets it as a cookie
 *   2. Client reads the token from cookie and sends it as a header
 *   3. Server compares cookie token vs header token
 *   4. If they match → request is legitimate
 *   5. If they don't match → 403 Forbidden
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed.
 */

import { randomBytes, timingSafeEqual } from 'crypto';
import { MiddlewareFn, ForbiddenError } from '@axil/common';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface CsrfOptions {
  // Name of the CSRF cookie (default: '_csrf')
  cookieName?: string;

  // Name of the header the client must send (default: 'x-csrf-token')
  headerName?: string;

  // Cookie options
  cookie?: {
    secure?: boolean;   // HTTPS only (default: true in production)
    sameSite?: 'strict' | 'lax' | 'none';
    path?: string;
  };
}

// ─── Token Generation ─────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure random token.
 */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Compare two tokens in constant time to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Parse cookies from the Cookie header string.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...axil] = cookie.trim().split('=');
    if (name) cookies[name.trim()] = axil.join('=').trim();
  });

  return cookies;
}

// ─── CSRF Middleware ──────────────────────────────────────────────────────────

// Safe HTTP methods - do not need CSRF protection
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Create CSRF protection middleware.
 *
 * Usage:
 *   app.use(csrf())
 *
 * Client must:
 *   1. Read token from '_csrf' cookie
 *   2. Send it as 'x-csrf-token' header on state-changing requests
 */
export function csrf(options: CsrfOptions = {}): MiddlewareFn {
  const {
    cookieName = '_csrf',
    headerName = 'x-csrf-token',
    cookie: cookieOptions = {}
  } = options;

  const isProduction = process.env.NODE_ENV === 'production';
  const secure = cookieOptions.secure ?? isProduction;
  const sameSite = cookieOptions.sameSite ?? 'strict';
  const path = cookieOptions.path ?? '/';

  return (req, res, next) => {
    // Parse cookies from request
    const cookieHeader = req.headers['cookie'] as string || '';
    const cookies = parseCookies(cookieHeader);

    // Get existing token from cookie or generate new one
    let token = cookies[cookieName];

    if (!token) {
      // Generate new token and set cookie
      token = generateToken();

      const cookieValue =
        `${cookieName}=${token}; Path=${path}; SameSite=${sameSite}` +
        (secure ? '; Secure' : '') +
        '; HttpOnly=false'; // Must NOT be HttpOnly so JS can read it

      res.header('Set-Cookie', cookieValue);
    }

    // Make token available on request for templates/APIs
    (req.locals as any).csrfToken = token;

    // Safe methods don't need verification
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    // Get token from request header
    const requestToken = req.headers[headerName] as string;

    if (!requestToken) {
      return next(
        new ForbiddenError('CSRF token missing. Include x-csrf-token header.')
      );
    }

    // Verify tokens match (constant-time comparison)
    if (!safeCompare(token, requestToken)) {
      return next(new ForbiddenError('Invalid CSRF token.'));
    }

    next();
  };
}