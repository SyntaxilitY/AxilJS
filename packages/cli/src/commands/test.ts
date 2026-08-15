/**
 * axil test [pattern]
 * Discovers and runs test files.
 */

import { readdirSync, statSync } from 'fs'
import { join, resolve }         from 'path'

export async function runTests(pattern?: string): Promise<void> {
  const cwd     = process.cwd()
  const srcDir  = join(cwd, 'src')
  const testDir = join(cwd, 'tests')

  const testFiles: string[] = []

  if (statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
    scanDir(srcDir, testFiles)
  }

  if (statSync(testDir, { throwIfNoEntry: false })?.isDirectory()) {
    scanDir(testDir, testFiles)
  }

  if (testFiles.length === 0) {
    console.log('\x1b[33m[AxilJS Test]\x1b[0m No test files found.')
    return
  }

  const filtered = pattern
    ? testFiles.filter(f => f.includes(pattern))
    : testFiles

  if (filtered.length === 0) {
    console.log(`\x1b[33m[AxilJS Test]\x1b[0m No tests match: ${pattern}`)
    return
  }

  console.log(`\n\x1b[36m[AxilJS Test]\x1b[0m Found ${filtered.length} test file(s)\n`)

  try { require('ts-node/register') } catch {}

  for (const file of filtered) {
    try { require(resolve(file)) } catch (error) {
      console.error(`\x1b[31m[AxilJS Test]\x1b[0m Error loading ${file}:`, (error as Error).message)
    }
  }

  const { runTests: run } = require('@axil/testing')
  const passed = await run()

  process.exit(passed ? 0 : 1)
}

function scanDir(dir: string, results: string[]): void {
  const items = readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = join(dir, item.name)
    if (item.isDirectory() && item.name !== 'node_modules') {
      scanDir(fullPath, results)
    } else if (
      item.isFile() &&
      (item.name.endsWith('.test.ts') || item.name.endsWith('.spec.ts') ||
       item.name.endsWith('.test.js') || item.name.endsWith('.spec.js'))
    ) {
      results.push(fullPath)
    }
  }
}