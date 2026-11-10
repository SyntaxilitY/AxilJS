import { describe, it, expect } from 'vitest';
import { ValidationError } from '@axiljs/common';
import { defineConfig } from '../src/index';

describe('defineConfig', () => {
  it('parses typed values from the source', () => {
    const config = defineConfig(
      {
        PORT: { type: 'number', default: 3000 },
        DEBUG: { type: 'boolean', default: false },
        NAME: { type: 'string', required: true },
        FLAGS: { type: 'json' }
      },
      { PORT: '8080', DEBUG: 'yes', NAME: 'axil', FLAGS: '{"a":true}' }
    );
    expect(config).toEqual({ PORT: 8080, DEBUG: true, NAME: 'axil', FLAGS: { a: true } });
  });

  it('applies defaults for missing or empty values', () => {
    const config = defineConfig(
      { PORT: { type: 'number', default: 3000 }, MODE: { type: 'string', default: 'dev' } },
      { MODE: '' }
    );
    expect(config).toEqual({ PORT: 3000, MODE: 'dev' });
  });

  it('collects every error into one ValidationError', () => {
    try {
      defineConfig(
        {
          DB: { type: 'string', required: true, description: 'database URL' },
          PORT: { type: 'number', min: 1, max: 65535 },
          DEBUG: { type: 'boolean' },
          ENV: { type: 'string', enum: ['dev', 'prod'] },
          JSON: { type: 'json' },
          N: { type: 'number' }
        },
        { PORT: '70000', DEBUG: 'maybe', ENV: 'staging', JSON: '{bad', N: 'abc' }
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      const details = (e as ValidationError).details as string[];
      expect(details).toHaveLength(6);
      expect(details[0]).toContain('Missing required environment variable: DB (database URL)');
      expect(details.join('\n')).toMatch(/PORT must be <= 65535/);
      expect(details.join('\n')).toMatch(/not a valid boolean/);
      expect(details.join('\n')).toMatch(/Allowed values: dev, prod/);
      expect(details.join('\n')).toMatch(/not valid JSON/);
      expect(details.join('\n')).toMatch(/not a valid number/);
    }
  });

  it('enforces min for numbers', () => {
    expect(() => defineConfig({ W: { type: 'number', min: 1 } }, { W: '0' })).toThrow(/W must be >= 1/);
  });
});
