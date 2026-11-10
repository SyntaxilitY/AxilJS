import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnv, parseEnvFile } from '../src/index';

describe('parseEnvFile', () => {
  it('parses plain, quoted and commented values', () => {
    const env = parseEnvFile(
      [
        '# comment',
        '',
        'PLAIN=hello',
        '  SPACED  =  padded value  ',
        'WITH_EQ=a=b=c',
        'INLINE=value # trailing comment',
        'HASH=abc#def',
        'DQ="double quoted"',
        "SQ='single quoted'",
        'DQ_COMMENT="keep # this" # drop this',
        'EMPTY=',
        'NOEQUALS',
        '=novalue'
      ].join('\n')
    );
    expect(env).toEqual({
      PLAIN: 'hello',
      SPACED: 'padded value',
      WITH_EQ: 'a=b=c',
      INLINE: 'value',
      HASH: 'abc#def',
      DQ: 'double quoted',
      SQ: 'single quoted',
      DQ_COMMENT: 'keep # this',
      EMPTY: ''
    });
  });

  it('expands \\n in double quotes only', () => {
    const env = parseEnvFile(['DQ="a\\nb"', "SQ='a\\nb'", 'RAW=a\\nb'].join('\n'));
    expect(env.DQ).toBe('a\nb');
    expect(env.SQ).toBe('a\\nb');
    expect(env.RAW).toBe('a\\nb');
  });

  it('supports multiline double-quoted values', () => {
    const env = parseEnvFile(
      [
        'BEFORE=1',
        'KEY="-----BEGIN KEY-----',
        '  indented line',
        'last line-----END KEY-----" # comment',
        'AFTER=2'
      ].join('\n')
    );
    expect(env.KEY).toBe('-----BEGIN KEY-----\n  indented line\nlast line-----END KEY-----');
    expect(env.BEFORE).toBe('1');
    expect(env.AFTER).toBe('2');
  });

  it('supports multiline single-quoted values without escape processing', () => {
    const env = parseEnvFile(["MSG='line one\\n", "line two'", 'NEXT=x'].join('\n'));
    expect(env.MSG).toBe('line one\\n\nline two');
    expect(env.NEXT).toBe('x');
  });

  it('handles CRLF files, including multiline values', () => {
    const env = parseEnvFile('A=1\r\nB="x\r\ny"\r\nC=3\r\n');
    expect(env).toEqual({ A: '1', B: 'x\ny', C: '3' });
  });

  it('respects escaped quotes inside double-quoted values', () => {
    const env = parseEnvFile(['Q="say \\"hi\\" to', 'there"', 'R=1'].join('\n'));
    expect(env.Q).toBe('say \\"hi\\" to\nthere');
    expect(env.R).toBe('1');

    // As before: a line that ends with a quote is a complete value
    expect(parseEnvFile('E="ends with \\"').E).toBe('ends with \\');
  });

  it('does not swallow the rest of the file when a quote never closes', () => {
    const env = parseEnvFile(['BROKEN="no end', 'NEXT=1'].join('\n'));
    expect(env.BROKEN).toBe('"no end');
    expect(env.NEXT).toBe('1');
  });
});

describe('loadEnv', () => {
  let dir: string;
  const touched = ['AXIL_T_A', 'AXIL_T_B', 'AXIL_T_C', 'AXIL_T_MULTI'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'axil-env-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const k of touched) delete process.env[k];
    vi.restoreAllMocks();
  });

  it('loads a file into process.env without overriding existing vars by default', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'AXIL_T_A=fromfile\nAXIL_T_B=new\nAXIL_T_MULTI="1\n2"\n');
    process.env.AXIL_T_B = 'existing';
    loadEnv({ path: file });
    expect(process.env.AXIL_T_A).toBe('fromfile');
    expect(process.env.AXIL_T_B).toBe('existing');
    expect(process.env.AXIL_T_MULTI).toBe('1\n2');
  });

  it('override: true replaces existing values', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'AXIL_T_B=new\n');
    process.env.AXIL_T_B = 'existing';
    loadEnv({ path: file, override: true });
    expect(process.env.AXIL_T_B).toBe('new');
  });

  it('loads several files in order and skips missing ones', () => {
    writeFileSync(join(dir, '.env'), 'AXIL_T_A=base\nAXIL_T_C=base\n');
    writeFileSync(join(dir, '.env.local'), 'AXIL_T_C=local\n');
    loadEnv({ files: [join(dir, '.env'), join(dir, '.env.missing'), join(dir, '.env.local')], override: true });
    expect(process.env.AXIL_T_A).toBe('base');
    expect(process.env.AXIL_T_C).toBe('local');
  });

  it('silently ignores a missing default file', () => {
    expect(() => loadEnv({ path: join(dir, 'nope.env') })).not.toThrow();
  });
});
