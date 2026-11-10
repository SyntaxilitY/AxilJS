import { defineConfig } from 'vitest/config';

// src/ still contains stale committed build output (*.js next to *.ts).
// Prefer .ts so tests always run against the TypeScript sources.
export default defineConfig({
  resolve: {
    extensions: ['.ts', '.mts', '.tsx', '.mjs', '.js', '.jsx', '.json']
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000
  }
});
