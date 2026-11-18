import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// src/ still contains stale committed build output (*.js next to *.ts).
// Vite would resolve `./x` (and `./x.js`) to the stale .js — prefer the .ts.
function preferTsSources() {
  return {
    name: 'axil-prefer-ts-sources',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (!importer || !source.startsWith('.')) return null;
      const base = resolve(dirname(importer), source).replace(/\.js$/, '');
      for (const candidate of [`${base}.ts`, resolve(base, 'index.ts')]) {
        if (existsSync(candidate)) return candidate;
      }
      return null;
    }
  };
}

export default defineConfig({
  plugins: [preferTsSources()],
  esbuild: {
    // Legacy decorators — without this esbuild emits TC39 decorators and the
    // entity metadata registry stays empty
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true
      }
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
