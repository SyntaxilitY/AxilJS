/**
 * Password hashing utilities.
 * Uses Node's built-in crypto module with scrypt algorithm.
 * scrypt is memory-hard, making brute-force attacks expensive.
 *
 * No external dependencies (no bcrypt needed).
 */
/**
 * Hash a password securely using scryptSync.
 * Returns a string in format: saltHex:hashHex
 *
 * Usage:
 *   const hashed = await hashPassword('userPassword123')
 *   // Store hashed in database - never store plaintext
 */
export declare function hashPassword(password: string): Promise<string>;
/**
 * Verify a password against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * Usage:
 *   const isValid = await verifyPassword('userInput', storedHash)
 *   if (!isValid) throw new UnauthorizedError('Invalid password')
 */
export declare function verifyPassword(password: string, storedHash: string): Promise<boolean>;
/**
 * Check if a string looks like a hashed password.
 * Useful for validation before storing.
 */
export declare function isHashed(value: string): boolean;
//# sourceMappingURL=password.d.ts.map