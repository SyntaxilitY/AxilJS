import { defineConfig } from 'vitest/config'

// src/ still contains stale committed build output (*.js next to *.ts);
// resolve the TypeScript sources first so tests exercise the real code.
export default defineConfig({
  resolve: {
    extensions: ['.ts', '.mts', '.mjs', '.js', '.json']
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000
  }
})
