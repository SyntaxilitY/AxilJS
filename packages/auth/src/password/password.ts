/**
 * Password hashing utilities.
 * Uses Node's built-in crypto module with scrypt algorithm.
 * scrypt is memory-hard, making brute-force attacks expensive.
 *
 * No external dependencies (no bcrypt needed).
 */

import { randomBytes, scrypt, timingSafeEqual, ScryptOptions } from 'crypto';

// Async scrypt (runs on the libuv threadpool instead of blocking the
// event loop like scryptSync did). Same inputs -> same output.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SALT_LENGTH = 32;   // 32 random bytes for the salt
const KEY_LENGTH  = 64;   // 64 byte output key

// scrypt parameters - balance security vs performance
// Using scryptSync options parameter (Node.js built-in, no promisify needed)
const SCRYPT_OPTIONS = {
  N: 16384,  // CPU/memory cost factor (power of 2)
  r: 8,      // Block size
  p: 1       // Parallelization
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
export async function hashPassword(password: string): Promise<string> {
  if (!password) {
    throw new Error('Password cannot be empty');
  }

  // Generate cryptographically random salt
  const salt = randomBytes(SALT_LENGTH);

  // Hash the password with scryptSync
  // Node.js scryptSync signature: (password, salt, keylen, options?)
  const hash = await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS
  );

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
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');

    if (!saltHex || !hashHex) {
      return false;
    }

    const salt             = Buffer.from(saltHex, 'hex');
    const storedHashBuffer = Buffer.from(hashHex, 'hex');

    // Hash the provided password with the same salt and options
    const inputHash = await scryptAsync(
      password,
      salt,
      KEY_LENGTH,
      SCRYPT_OPTIONS
    );

    // Constant-time comparison to prevent timing attacks
    if (inputHash.length !== storedHashBuffer.length) return false;

    return timingSafeEqual(inputHash, storedHashBuffer);
  } catch {
    return false;
  }
}

/**
 * Check if a string looks like a hashed password.
 * Useful for validation before storing.
 */
export function isHashed(value: string): boolean {
  const parts = value.split(':');
  return (
    parts.length === 2 &&
    parts[0].length === SALT_LENGTH * 2 &&
    parts[1].length === KEY_LENGTH * 2
  );
}