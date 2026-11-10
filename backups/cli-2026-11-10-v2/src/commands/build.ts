/**
 * axil build
 * Compiles TypeScript and reports output.
 */

import { existsSync, statSync, readdirSync }    from 'fs'
import { join }                                  from 'path'

import * as ui                                   from '../ui'
import { printCaptured, runCaptured }            from '../utils/exec'

export async function buildProject(): Promise<void> {
  const cwd = process.cwd()

  ui.title('build', 'Build for production')

  if (!existsSync(join(cwd, 'tsconfig.json'))) {
    ui.error('No tsconfig.json found.', 'Run axil build from the project root.')
    process.exit(1)
  }

  const start = Date.now()

  await runStep('Type checking', 'Type check passed', 'Type check failed', 'npx tsc --noEmit', cwd)
  await runStep('Compiling TypeScript', 'Compilation complete', 'Compilation failed', 'npx tsc', cwd)

  const distDir = join(cwd, 'dist')
  if (existsSync(distDir)) {
    const size = getDirSize(distDir)

    ui.done('Build complete', start)
    ui.keyValue([['Output', `${ui.path('dist/')}  ${ui.muted(formatBytes(size))}`]])
    ui.box('Start production server', [ui.cmd('node dist/main.js')])
  }
}

async function runStep(text: string, ok: string, fail: string, command: string, cwd: string): Promise<void> {
  const started = Date.now()
  const spin = ui.spinner(text)
  let result
  try {
    result = await runCaptured(command, cwd)
  } catch (error: any) {
    result = { code: 1, output: error?.message ?? String(error) }
  }
  const elapsed = ui.formatDuration(Date.now() - started)
  if (result.code === 0) {
    spin.succeed(ok, elapsed)
    return
  }
  spin.fail(fail, elapsed)
  console.error('')
  printCaptured(result.output, l => console.error(l))
  console.error('')
  process.exit(1)
}

function getDirSize(dirPath: string): number {
  let total = 0
  const items = readdirSync(dirPath, { withFileTypes: true })
  for (const item of items) {
    const itemPath = join(dirPath, item.name)
    if (item.isDirectory()) total += getDirSize(itemPath)
    else total += statSync(itemPath).size
  }
  return total
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
