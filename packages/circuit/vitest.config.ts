import { defineConfig } from 'vitest/config';

// src/ still contains stale compiled .js files; resolve the .ts sources first.
export default defineConfig({
  resolve: {
    extensions: ['.ts', '.mts', '.mjs', '.js', '.json']
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
