/**
 * Secrets Manager.
 *
 * Encrypts and decrypts secrets using AES-256-GCM (authenticated
 * encryption).  Secrets are stored in memory by default; swap the
 * backing store to a KMS, Vault, or database for production.
 *
 * Integrates with @axiljs/config for typed environment secrets.
 *
 * Usage:
 *   const secrets = new SecretsManager({ encryptionKey: '...' })
 *   await secrets.set('DATABASE_URL', 'postgres://...')
 *   const dbUrl = await secrets.get('DATABASE_URL')
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import type { SecretsManagerOptions, StoredSecret } from './types';

export type { SecretsManagerOptions, StoredSecret };

export class SecretsManager {
  private key: Buffer;
  private store = new Map<string, StoredSecret>();

  constructor(options: SecretsManagerOptions = {}) {
    if (options.encryptionKey) {
      this.key = Buffer.from(options.encryptionKey, 'hex');
      if (this.key.length !== 32) {
        throw new Error('encryptionKey must be a 64-character hex string (32 bytes).');
      }
    } else {
      // Auto-generate a random key for development. Warn on first use, not
      // here: the module-level `secrets` singleton is built on import, and
      // apps that never touch secrets shouldn't see the warning.
      this.key = randomBytes(32);
      this.ephemeralKey = true;
    }
  }

  private ephemeralKey = false;
  private warned = false;

  /** Warn once that secrets are encrypted with a throwaway key. */
  private warnEphemeralKey(): void {
    if (!this.ephemeralKey || this.warned) return;
    this.warned = true;
    console.warn(
      '\x1b[33m[@axiljs/cloud]\x1b[0m SecretsManager: no encryption key provided. ' +
      'A random key was generated. Secrets will not survive restarts. ' +
      'Set encryptionKey for production.'
    );
  }

  /**
   * Generate a new 32-byte encryption key (hex-encoded).
   * Store this in your KMS or environment variable.
   */
  static generateKey(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Encrypt and store a secret.
   */
  async set(name: string, plaintext: string): Promise<void> {
    this.warnEphemeralKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const now = new Date().toISOString();
    const existing = this.store.get(name);

    this.store.set(name, {
      name,
      encryptedValue: encrypted,
      iv: iv.toString('hex'),
      authTag,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  /**
   * Decrypt and return a secret.
   * Returns `null` if the secret does not exist.
   */
  async get(name: string): Promise<string | null> {
    const entry = this.store.get(name);
    if (!entry) return null;

    const iv = Buffer.from(entry.iv, 'hex');
    const authTag = Buffer.from(entry.authTag, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(entry.encryptedValue, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Check if a secret exists (without decrypting).
   */
  has(name: string): boolean {
    return this.store.has(name);
  }

  /**
   * Delete a secret.
   */
  delete(name: string): boolean {
    return this.store.delete(name);
  }

  /**
   * List all secret names (values are never exposed).
   */
  list(): Array<{ name: string; createdAt: string; updatedAt: string }> {
    return Array.from(this.store.values()).map(({ name, createdAt, updatedAt }) => ({
      name,
      createdAt,
      updatedAt,
    }));
  }
}

/** Global singleton for convenience. */
export const secrets = new SecretsManager();