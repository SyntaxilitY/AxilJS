import { describe, it, expect } from 'vitest';
import { SecretsManager } from '../src/secrets';

describe('Secrets Manager', () => {
  it('encrypts and decrypts a secret correctly', async () => {
    const sm = new SecretsManager({
      encryptionKey: SecretsManager.generateKey(),
    });

    await sm.set('DB_PASSWORD', 'super-secret-123');
    const result = await sm.get('DB_PASSWORD');

    expect(result).toBe('super-secret-123');
  });

  it('returns null for non-existent secrets', async () => {
    const sm = new SecretsManager({
      encryptionKey: SecretsManager.generateKey(),
    });

    const result = await sm.get('NON_EXISTENT');
    expect(result).toBeNull();
  });

  it('lists secret names without exposing values', async () => {
    const sm = new SecretsManager({
      encryptionKey: SecretsManager.generateKey(),
    });

    await sm.set('API_KEY', 'key-123');
    await sm.set('DB_URL', 'postgres://...');

    const list = sm.list();
    expect(list).toHaveLength(2);
    expect(list.map(s => s.name)).toContain('API_KEY');
    expect(list.map(s => s.name)).toContain('DB_URL');
  });

  it('generates valid 64-character hex keys', () => {
    const key = SecretsManager.generateKey();
    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });
});