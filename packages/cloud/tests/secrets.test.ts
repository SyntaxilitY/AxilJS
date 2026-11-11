import { describe, it, expect, vi } from 'vitest';
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
describe('ephemeral key warning', () => {
  it('is not printed on construction or import, only once on first set()', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const mgr = new SecretsManager();
      expect(warn).not.toHaveBeenCalled();
      await mgr.set('a', '1');
      await mgr.set('b', '2');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('no encryption key');

      warn.mockClear();
      const keyed = new SecretsManager({ encryptionKey: SecretsManager.generateKey() });
      await keyed.set('a', '1');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
