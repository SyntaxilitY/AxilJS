"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@restjs/common");
// ─── Time Parser ─────────────────────────────────────────────────────────────
/**
 * Parse a time string or number into seconds.
 * '1h' → 3600, '7d' → 604800, '30m' → 1800, 60 → 60
 */
function parseTime(time) {
    if (typeof time === 'number')
        return time;
    const match = time.match(/^(\d+)(s|m|h|d|w)$/);
    if (!match)
        throw new Error(`Invalid time format: '${time}'. Use '1h', '7d', '30m', etc.`);
    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers = {
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
function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}
function base64UrlDecode(str) {
    // Add padding if needed
    const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
    return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}
// ─── JWT ──────────────────────────────────────────────────────────────────────
const JWT_HEADER = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
class JWT {
    secret;
    constructor(secret) {
        if (!secret || secret.length < 32) {
            throw new Error('JWT secret must be at least 32 characters long.\n' +
                'Generate one: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
        }
        this.secret = secret;
    }
    /**
     * Sign a payload and return a JWT token string.
     *
     * Usage:
     *   const token = jwt.sign({ sub: user.id, role: 'admin' }, { expiresIn: '1h' })
     */
    sign(payload, options = {}) {
        const now = Math.floor(Date.now() / 1000);
        const fullPayload = {
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
        if (options.audience)
            fullPayload.aud = options.audience;
        if (options.issuer)
            fullPayload.iss = options.issuer;
        const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
        const signingInput = `${JWT_HEADER}.${encodedPayload}`;
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
    verify(token, options = {}) {
        if (!token) {
            throw new common_1.UnauthorizedError('No token provided');
        }
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new common_1.UnauthorizedError('Invalid token format');
        }
        const [header, payload, signature] = parts;
        // Verify signature (constant-time comparison to prevent timing attacks)
        const expectedSignature = this.sign256(`${header}.${payload}`);
        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);
        if (sigBuffer.length !== expectedBuffer.length ||
            !(0, crypto_1.timingSafeEqual)(sigBuffer, expectedBuffer)) {
            throw new common_1.UnauthorizedError('Invalid token signature');
        }
        // Decode payload
        let decoded;
        try {
            decoded = JSON.parse(base64UrlDecode(payload));
        }
        catch {
            throw new common_1.UnauthorizedError('Invalid token payload');
        }
        const now = Math.floor(Date.now() / 1000);
        // Check expiry
        if (decoded.exp !== undefined && now > decoded.exp) {
            throw new common_1.UnauthorizedError('Token has expired');
        }
        // Check not-before
        if (decoded.nbf !== undefined && now < decoded.nbf) {
            throw new common_1.UnauthorizedError('Token not yet valid');
        }
        // Check audience
        if (options.audience && decoded.aud !== options.audience) {
            throw new common_1.UnauthorizedError('Invalid token audience');
        }
        // Check issuer
        if (options.issuer && decoded.iss !== options.issuer) {
            throw new common_1.UnauthorizedError('Invalid token issuer');
        }
        return decoded;
    }
    /**
     * Decode a token WITHOUT verifying the signature.
     * Use only when you need the payload but don't trust it.
     */
    decode(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3)
                return null;
            return JSON.parse(base64UrlDecode(parts[1]));
        }
        catch {
            return null;
        }
    }
    /**
     * Compute HMAC-SHA256 signature.
     */
    sign256(input) {
        return (0, crypto_1.createHmac)('sha256', this.secret)
            .update(input)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}
exports.JWT = JWT;
//# sourceMappingURL=jwt.js.map