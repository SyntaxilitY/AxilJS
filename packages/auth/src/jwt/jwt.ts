/**
 * JWT (JSON Web Token) implementation.
 * Pure Node.js - no external dependencies.
 * Uses Node's built-in crypto module for HMAC-SHA256 signing.
 *
 * JWT Structure: header.payload.signature
 *   header:    { alg: 'HS256', typ: 'JWT' }
 *   payload:   { sub: '123', iat: 1234567890, exp: 1234567890, ...custom }
 *   signature: HMAC-SHA256(base64(header) + '.' + base64(payload), secret)
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { UnauthorizedError } from '@axiljs/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  // Subject - who the token is about (usually user ID)
  sub?: string | number;

  // Issued at (Unix timestamp)
  iat?: number;

  // Expiration (Unix timestamp)
  exp?: number;

  // Not before (Unix timestamp)
  nbf?: number;

  // JWT ID (unique identifier for this token)
  jti?: string;

  // Custom claims
  [key: string]: unknown;
}

// Supported HMAC algorithms
export type JWTAlgorithm = 'HS256' | 'HS384' | 'HS512';

export interface JWTOptions {
  // Signing algorithm (default: 'HS256'). verify() only accepts tokens
  // whose header uses this exact algorithm.
  algorithm?: JWTAlgorithm;
}

const HMAC_DIGESTS: Record<JWTAlgorithm, string> = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512'
};

export interface JWTSignOptions {
  // Token expiry. e.g. '1h', '7d', '30m', or seconds as number
  expiresIn?: string | number;

  // Not valid before this time
  notBefore?: string | number;

  // Audience (a string or, per RFC 7519 §4.1.3, an array of strings)
  audience?: string | string[];

  // Issuer
  issuer?: string;
}

export interface JWTVerifyOptions {
  // Expected audience - the token's aud (string or array) must contain it,
  // or one of them when an array is given
  audience?: string | string[];

  // Expected issuer
  issuer?: string;
}

// ─── Time Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a time string or number into seconds.
 * '1h' → 3600, '7d' → 604800, '30m' → 1800, 60 → 60
 */
function parseTime(time: string | number): number {
  if (typeof time === 'number') return time;

  const match = time.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) throw new Error(`Invalid time format: '${time}'. Use '1h', '7d', '30m', etc.`);

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800
  };

  return value * multipliers[unit];
}

// ─── Base64URL ────────────────────────────────────────────────────────────────

// JWT uses URL-safe base64 (no +, /, = characters)
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(str: string): string {
  // Add padding if needed
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(
    padded.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf-8');
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export class JWT {
  private secret: string;
  private algorithm: JWTAlgorithm;
  private encodedHeader: string;

  constructor(secret: string, options: JWTOptions = {}) {
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT secret must be at least 32 characters long.\n' +
          'Generate one: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
      );
    }
    this.secret = secret;

    const algorithm = options.algorithm ?? 'HS256';
    if (!Object.prototype.hasOwnProperty.call(HMAC_DIGESTS, algorithm)) {
      throw new Error(
        `Unsupported JWT algorithm '${algorithm}'. Use HS256, HS384 or HS512.`
      );
    }
    this.algorithm = algorithm;
    this.encodedHeader = base64UrlEncode(
      JSON.stringify({ alg: algorithm, typ: 'JWT' })
    );
  }

  /**
   * Sign a payload and return a JWT token string.
   *
   * Usage:
   *   const token = jwt.sign({ sub: user.id, role: 'admin' }, { expiresIn: '1h' })
   */
  sign(payload: JWTPayload, options: JWTSignOptions = {}): string {
    const now = Math.floor(Date.now() / 1000);

    const fullPayload: JWTPayload = {
      ...payload,
      iat: now
    };

    // Set expiry
    if (options.expiresIn !== undefined) {
      fullPayload.exp = now + parseTime(options.expiresIn);
    }

    // Set not-before
    if (options.notBefore !== undefined) {
      fullPayload.nbf = now + parseTime(options.notBefore);
    }

    if (
      options.audience !== undefined &&
      (Array.isArray(options.audience) ? options.audience.length > 0 : options.audience)
    ) {
      fullPayload.aud = options.audience;
    }
    if (options.issuer)   fullPayload.iss = options.issuer;

    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
    const signingInput = `${this.encodedHeader}.${encodedPayload}`;
    const signature = this.sign256(signingInput);

    return `${signingInput}.${signature}`;
  }

  /**
   * Verify a JWT token and return the decoded payload.
   * Throws UnauthorizedError if the token is invalid or expired.
   *
   * Usage:
   *   const payload = jwt.verify(token)
   *   console.log(payload.sub) // user ID
   */
  verify(token: string, options: JWTVerifyOptions = {}): JWTPayload {
    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new UnauthorizedError('Invalid token format');
    }

    const [header, payload, signature] = parts;

    // Verify signature (constant-time comparison to prevent timing attacks)
    const expectedSignature = this.sign256(`${header}.${payload}`);
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedError('Invalid token signature');
    }

    // Verify header: only the configured algorithm is accepted
    let decodedHeader: { alg?: unknown } | null;
    try {
      decodedHeader = JSON.parse(base64UrlDecode(header));
    } catch {
      throw new UnauthorizedError('Invalid token header');
    }
    if (!decodedHeader || typeof decodedHeader !== 'object' || decodedHeader.alg !== this.algorithm) {
      throw new UnauthorizedError('Invalid token algorithm');
    }

    // Decode payload
    let decoded: JWTPayload;
    try {
      decoded = JSON.parse(base64UrlDecode(payload));
    } catch {
      throw new UnauthorizedError('Invalid token payload');
    }

    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new UnauthorizedError('Invalid token payload');
    }

    const now = Math.floor(Date.now() / 1000);

    // Check expiry (token is invalid on or after exp - RFC 7519 §4.1.4)
    if (
      decoded.exp !== undefined &&
      (typeof decoded.exp !== 'number' || now >= decoded.exp)
    ) {
      throw new UnauthorizedError('Token has expired');
    }

    // Check not-before
    if (
      decoded.nbf !== undefined &&
      (typeof decoded.nbf !== 'number' || now < decoded.nbf)
    ) {
      throw new UnauthorizedError('Token not yet valid');
    }

    // Check audience (the token's aud may be a string or an array)
    if (options.audience) {
      const expected = (
        Array.isArray(options.audience) ? options.audience : [options.audience]
      ).filter(Boolean);
      const actual = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
      if (
        expected.length > 0 &&
        !actual.some(aud => typeof aud === 'string' && expected.includes(aud))
      ) {
        throw new UnauthorizedError('Invalid token audience');
      }
    }

    // Check issuer
    if (options.issuer && decoded.iss !== options.issuer) {
      throw new UnauthorizedError('Invalid token issuer');
    }

    return decoded;
  }

  /**
   * Decode a token WITHOUT verifying the signature.
   * Use only when you need the payload but don't trust it.
   */
  decode(token: string): JWTPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(base64UrlDecode(parts[1]));
    } catch {
      return null;
    }
  }

  /**
   * Compute the HMAC signature with the configured algorithm
   * (name kept from when only HS256 was supported).
   */
  private sign256(input: string): string {
    return createHmac(HMAC_DIGESTS[this.algorithm], this.secret)
      .update(input)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}