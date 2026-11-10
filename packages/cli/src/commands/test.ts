/**
 * axil test [pattern]
 * Discovers and runs test files.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import { pathToFileURL } from 'url'

import * as ui                   from '../ui'
import { printCaptured, runCaptured } from '../utils/exec'

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

  // TypeScript projects: compile with the project's tsc (as `axil run` does)
  // and load the compiled tests. Source files can't be loaded directly: ESM
  // projects import siblings as './x.js', which only exists after compiling.
  const ts = readTsConfigDirs(cwd)
  const compiles = ts !== undefined && filtered.some(f => f.endsWith('.ts') && isInside(ts.rootDir, f))
  if (compiles) {
    const spin = ui.spinner('Compiling TypeScript')
    const result = await runCaptured('npx tsc -p tsconfig.json', cwd)
    if (result.code !== 0) {
      spin.fail('Compilation failed')
      printCaptured(result.output, l => console.error(l))
      ui.failed('Tests not run', 'fix the type errors above')
      process.exit(1)
    }
    spin.succeed('Compiled', ui.path(relative(cwd, ts!.outDir) || '.'))
  } else {
    try { require(resolveFromProject('ts-node/register', cwd)) } catch {}
  }
  ui.outro()

  let loadFailed = false

  for (const file of filtered) {
    const target = compiles && file.endsWith('.ts') && isInside(ts!.rootDir, file)
      ? join(ts!.outDir, relative(ts!.rootDir, file)).replace(/\.ts$/, '.js')
      : resolve(file)
    try {
      await import(pathToFileURL(target).href)
    } catch (error) {
      loadFailed = true
      ui.error(`Error loading ${ui.path(relative(cwd, file))}`, (error as Error).message)
    }
  }

  // Must be the same @axiljs/testing instance the test files imported (the
  // project's copy), otherwise the suite registry is empty and 0 tests "pass".
  const { runTests: run } = require(resolveFromProject('@axiljs/testing', cwd))
  const passed = await run()

  process.exit(passed && !loadFailed ? 0 : 1)
}

/** rootDir/outDir from tsconfig.json (JSON with comments allowed); undefined without an outDir. */
function readTsConfigDirs(cwd: string): { rootDir: string; outDir: string } | undefined {
  const file = join(cwd, 'tsconfig.json')
  if (!existsSync(file)) return undefined
  try {
    const raw = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1')
    const options = JSON.parse(raw).compilerOptions ?? {}
    if (!options.outDir) return undefined
    return { rootDir: resolve(cwd, options.rootDir ?? '.'), outDir: resolve(cwd, options.outDir) }
  } catch {
    return undefined
  }
}

function isInside(dir: string, file: string): boolean {
  const rel = relative(dir, file)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
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