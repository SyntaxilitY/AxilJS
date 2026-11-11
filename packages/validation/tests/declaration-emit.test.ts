import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as Index from '../src/index';

const pkgDir = resolve(__dirname, '..');

describe('declaration emit (bug fix: concrete validator classes were not exported)', () => {
  it('exports every concrete validator class from the package index', () => {
    const s = Index.v.object({ n: Index.v.number() });
    expect(s).toBeInstanceOf(Index.ObjectValidator);
    expect(s).toBeInstanceOf(Index.BaseValidator);
    expect(Index.v.string()).toBeInstanceOf(Index.StringValidator);
    expect(Index.v.number()).toBeInstanceOf(Index.NumberValidator);
    expect(Index.v.boolean()).toBeInstanceOf(Index.BooleanValidator);
    expect(Index.v.array(Index.v.string())).toBeInstanceOf(Index.ArrayValidator);
    expect(Index.v.enum(['a'])).toBeInstanceOf(Index.EnumValidator);
    expect(Index.v.literal(1)).toBeInstanceOf(Index.LiteralValidator);
    expect(Index.v.union([Index.v.string()])).toBeInstanceOf(Index.UnionValidator);
    expect(Index.v.record(Index.v.string())).toBeInstanceOf(Index.RecordValidator);
  });

  it('compiles exported schemas with declaration: true (no TS4094)', () => {
    // Declarations go to a throwaway temp dir - never into dist/
    const outDir = mkdtempSync(join(tmpdir(), 'axil-validation-dts-'));
    try {
      const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
      const result = spawnSync(process.execPath, [
        tsc,
        '--ignoreConfig',
        '--declaration', '--emitDeclarationOnly',
        '--outDir', outDir,
        '--rootDir', pkgDir,
        '--target', 'es2022',
        '--module', 'node16',
        '--moduleResolution', 'node16',
        '--strict',
        '--skipLibCheck',
        '--types', 'node',
        '--ignoreDeprecations', '6.0',
        join(pkgDir, 'tests', 'fixtures', 'exported-schemas.ts')
      ], { cwd: pkgDir, encoding: 'utf8' });

      expect(result.stdout + result.stderr).not.toMatch(/error TS/);
      expect(result.status).toBe(0);

      const dts = readFileSync(join(outDir, 'tests', 'fixtures', 'exported-schemas.d.ts'), 'utf8');
      expect(dts).toContain('ObjectValidator');
      expect(dts).toContain('userSchema');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60000);
});
