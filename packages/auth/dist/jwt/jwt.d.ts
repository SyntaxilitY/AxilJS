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
export interface JWTPayload {
    sub?: string | number;
    iat?: number;
    exp?: number;
    nbf?: number;
    jti?: string;
    [key: string]: unknown;
}
export type JWTAlgorithm = 'HS256' | 'HS384' | 'HS512';
export interface JWTOptions {
    algorithm?: JWTAlgorithm;
}
export interface JWTSignOptions {
    expiresIn?: string | number;
    notBefore?: string | number;
    audience?: string | string[];
    issuer?: string;
}
export interface JWTVerifyOptions {
    audience?: string | string[];
    issuer?: string;
}
export declare class JWT {
    private secret;
    private algorithm;
    private encodedHeader;
    constructor(secret: string, options?: JWTOptions);
    /**
     * Sign a payload and return a JWT token string.
     *
     * Usage:
     *   const token = jwt.sign({ sub: user.id, role: 'admin' }, { expiresIn: '1h' })
     */
    sign(payload: JWTPayload, options?: JWTSignOptions): string;
    /**
     * Verify a JWT token and return the decoded payload.
     * Throws UnauthorizedError if the token is invalid or expired.
     *
     * Usage:
     *   const payload = jwt.verify(token)
     *   console.log(payload.sub) // user ID
     */
    verify(token: string, options?: JWTVerifyOptions): JWTPayload;
    /**
     * Decode a token WITHOUT verifying the signature.
     * Use only when you need the payload but don't trust it.
     */
    decode(token: string): JWTPayload | null;
    /**
     * Compute the HMAC signature with the configured algorithm
     * (name kept from when only HS256 was supported).
     */
    private sign256;
}
//# sourceMappingURL=jwt.d.ts.map