import { defineConfig } from 'vitest/config';

// src/ still contains stale compiled .js files next to the .ts sources;
// resolve .ts first so the tests always run against the real sources.
export default defineConfig({
  resolve: {
    extensions: ['.ts', '.mts', '.mjs', '.js', '.json']
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
