/**
 * axil test [pattern]
 * Discovers and runs test files.
 */

import { readdirSync, statSync } from 'fs'
import { join, resolve }         from 'path'

import * as ui                   from '../ui'

export async function runTests(pattern?: string): Promise<void> {
  ui.title('test', 'Run tests')

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
    ui.warn('No test files found.', 'looked for *.test.ts / *.spec.ts in src/ and tests/')
    ui.line()
    return
  }

  const filtered = pattern
    ? testFiles.filter(f => f.includes(pattern) || f.replace(/\\/g, '/').includes(pattern))
    : testFiles

  if (filtered.length === 0) {
    ui.warn(`No tests match: ${pattern}`, `${testFiles.length} test file(s) found`)
    ui.line()
    return
  }

  ui.info(`Found ${filtered.length} test file(s)`, pattern ? `matching "${pattern}"` : undefined)
  ui.line()

  try { require(resolveFromProject('ts-node/register', cwd)) } catch {}

  let loadFailed = false

  for (const file of filtered) {
    try { require(resolve(file)) } catch (error) {
      loadFailed = true
      ui.error(`Error loading ${ui.path(file)}`, (error as Error).message)
    }
  }

  // Must be the same @axiljs/testing instance the test files imported (the
  // project's copy), otherwise the suite registry is empty and 0 tests "pass".
  const { runTests: run } = require(resolveFromProject('@axiljs/testing', cwd))
  const passed = await run()

  process.exit(passed && !loadFailed ? 0 : 1)
}

function resolveFromProject(id: string, cwd: string): string {
  try { return require.resolve(id, { paths: [cwd] }) } catch { return id }
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