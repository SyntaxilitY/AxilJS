"use strict";
/**
 * Password hashing utilities.
 * Uses Node's built-in crypto module with scrypt algorithm.
 * scrypt is memory-hard, making brute-force attacks expensive.
 *
 * No external dependencies (no bcrypt needed).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.isHashed = isHashed;
const crypto_1 = require("crypto");
// ─── Config ───────────────────────────────────────────────────────────────────
const SALT_LENGTH = 32; // 32 random bytes for the salt
const KEY_LENGTH = 64; // 64 byte output key
// scrypt parameters - balance security vs performance
// Using scryptSync options parameter (Node.js built-in, no promisify needed)
const SCRYPT_OPTIONS = {
    N: 16384, // CPU/memory cost factor (power of 2)
    r: 8, // Block size
    p: 1 // Parallelization
};
// ─── Password Utilities ───────────────────────────────────────────────────────
/**
 * Hash a password securely using scryptSync.
 * Returns a string in format: saltHex:hashHex
 *
 * Usage:
 *   const hashed = await hashPassword('userPassword123')
 *   // Store hashed in database - never store plaintext
 */
async function hashPassword(password) {
    if (!password) {
        throw new Error('Password cannot be empty');
    }
    // Generate cryptographically random salt
    const salt = (0, crypto_1.randomBytes)(SALT_LENGTH);
    // Hash the password with scryptSync
    // Node.js scryptSync signature: (password, salt, keylen, options?)
    const hash = (0, crypto_1.scryptSync)(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
    // Return salt:hash format (both hex encoded)
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
/**
 * Verify a password against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * Usage:
 *   const isValid = await verifyPassword('userInput', storedHash)
 *   if (!isValid) throw new UnauthorizedError('Invalid password')
 */
async function verifyPassword(password, storedHash) {
    try {
        const [saltHex, hashHex] = storedHash.split(':');
        if (!saltHex || !hashHex) {
            return false;
        }
        const salt = Buffer.from(saltHex, 'hex');
        const storedHashBuffer = Buffer.from(hashHex, 'hex');
        // Hash the provided password with the same salt and options
        const inputHash = (0, crypto_1.scryptSync)(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
        // Constant-time comparison to prevent timing attacks
        if (inputHash.length !== storedHashBuffer.length)
            return false;
        return (0, crypto_1.timingSafeEqual)(inputHash, storedHashBuffer);
    }
    catch {
        return false;
    }
}
/**
 * Check if a string looks like a hashed password.
 * Useful for validation before storing.
 */
function isHashed(value) {
    const parts = value.split(':');
    return (parts.length === 2 &&
        parts[0].length === SALT_LENGTH * 2 &&
        parts[1].length === KEY_LENGTH * 2);
}
//# sourceMappingURL=password.js.map