import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// src/ still contains stale committed build output (*.js next to *.ts) and the
// sources import './x.js' — Vite would load the stale .js. Prefer the .ts.
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
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
