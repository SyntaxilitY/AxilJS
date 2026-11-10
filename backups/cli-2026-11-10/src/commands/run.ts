/**
 * axil run
 * Development server with hot reload and automatic Studio launcher.
 */

import { spawn, ChildProcess, execSync } from 'child_process'
import { watch, existsSync, mkdirSync, readFileSync } from 'fs'
import { join, relative, resolve } from 'path'
import { pathToFileURL } from 'url'
import { readEnvFile } from '../utils/env'

// ── State ─────────────────────────────────────────────────────────────────────

let serverProcess: ChildProcess | null = null
let restartTimer:  ReturnType<typeof setTimeout> | null = null
let isCompiling:   boolean = false
let startCount:    number  = 0
let studioInstance: any    = null
let studioAttempted: boolean = false

const changedFiles: Set<string> = new Set()

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m'
}

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false })
  console.log(`${C.gray}${time}${C.reset} ${C.cyan}[axil run]${C.reset} ${msg}`)
}

function logError(msg: string): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false })
  console.log(`${C.gray}${time}${C.reset} ${C.red}[axil run]${C.reset} ${msg}`)
}

function logSuccess(msg: string): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false })
  console.log(`${C.gray}${time}${C.reset} ${C.green}[axil run]${C.reset} ${msg}`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Values are unquoted (PORT="4000" → 4000) and inline comments stripped.
export function readEnvValue(cwd: string, key: string): string | undefined {
  const value = readEnvFile(cwd)[key]
  return value === undefined || value === '' ? undefined : value
}

export function readAppPort(cwd: string): number {
  const raw = readEnvValue(cwd, 'PORT')
  const n   = raw ? parseInt(raw, 10) : NaN
  return Number.isNaN(n) ? 3000 : n
}

// ── Dynamic Studio Loader ─────────────────────────────────────────────────────

async function loadStudioClass(cwd: string): Promise<any | null> {
  const dynamicImport = new Function('specifier', 'return import(specifier)')

  // 1. Try standard package name
  try {
    const mod = typeof require !== 'undefined'
      ? require('@axiljs/studio')
      : await dynamicImport('@axiljs/studio')
    if (mod.StudioServer) return mod.StudioServer
    if (mod.default?.StudioServer) return mod.default.StudioServer
  } catch {}

  // 2. Try project-local node_modules
  try {
    const localPath = join(cwd, 'node_modules', '@axiljs', 'studio', 'dist', 'index.js')
    if (existsSync(localPath)) {
      const mod = typeof require !== 'undefined'
        ? require(localPath)
        : await dynamicImport(pathToFileURL(localPath).href)
      if (mod.StudioServer) return mod.StudioServer
      if (mod.default?.StudioServer) return mod.default.StudioServer
    }
  } catch {}

  // 3. Try monorepo sibling directory (packages/studio/dist/index.js)
  try {
    const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd()
    const monorepoPath = resolve(currentDir, '..', '..', '..', 'studio', 'dist', 'index.js')
    if (existsSync(monorepoPath)) {
      const mod = typeof require !== 'undefined'
        ? require(monorepoPath)
        : await dynamicImport(pathToFileURL(monorepoPath).href)
      if (mod.StudioServer) return mod.StudioServer
      if (mod.default?.StudioServer) return mod.default.StudioServer
    }
  } catch {}

  return null
}

async function startStudio(cwd: string, appPort: number): Promise<any> {
  try {
    const StudioServer = await loadStudioClass(cwd)

    if (!StudioServer) {
      log(`${C.yellow}[Studio]${C.reset} @axiljs/studio not detected. Studio skipped.`)
      return null
    }

    const pkgPath = join(cwd, 'package.json')
    const appName = existsSync(pkgPath)
      ? (JSON.parse(readFileSync(pkgPath, 'utf-8')).name as string) ?? 'axiljs-app'
      : 'axiljs-app'

    let dbDriver: string | undefined
    let dbFile:   string | undefined
    let dbUrl:    string | undefined

    const rawUrl  = readEnvValue(cwd, 'DATABASE_URL')
    const rawFile = readEnvValue(cwd, 'DATABASE_FILENAME')

    if (rawUrl) {
      dbUrl = rawUrl
      if (dbUrl.startsWith('postgres') || dbUrl.startsWith('postgresql')) {
        dbDriver = 'postgres'
      } else if (dbUrl.startsWith('mysql')) {
        dbDriver = 'mysql'
      }
    }

    if (rawFile) {
      dbDriver = 'sqlite'
      dbFile   = rawFile
    }

    const studioPort = appPort + 1

    const studio = new StudioServer({
      port:     studioPort,
      host:     '127.0.0.1',
      appPort,
      appName,
      dbDriver,
      dbFile,
      dbUrl,
      enableQR: true
    })

    await studio.start()
    return studio
  } catch (err: any) {
    log(`${C.yellow}[Studio error]${C.reset} ${err.message}`)
    return null
  }
}

// ── Compiler ──────────────────────────────────────────────────────────────────

function compile(cwd: string): boolean {
  const start = Date.now()

  try {
    execSync('npx tsc --incremental --noEmitOnError', {
      cwd,
      stdio: 'pipe'
    })

    const duration = Date.now() - start
    logSuccess(
      `Compiled ${C.bold}${
        changedFiles.size > 0 ? changedFiles.size + ' file(s)' : 'project'
      }${C.reset}${C.green} in ${C.bold}${duration}ms${C.reset}`
    )

    changedFiles.clear()
    return true
  } catch (error: any) {
    const duration    = Date.now() - start
    const output      = error.stdout?.toString() ?? ''
    const stderr      = error.stderr?.toString() ?? ''
    const errorOutput = output || stderr

    logError(`Compilation failed in ${duration}ms`)

    if (errorOutput) {
      errorOutput.split('\n').forEach((line: string) => {
        if (line.includes('error TS')) {
          console.log(`  ${C.red}${line}${C.reset}`)
        } else if (line.trim()) {
          console.log(`  ${C.gray}${line}${C.reset}`)
        }
      })
    }

    logError('Server NOT restarted — fix the errors above')
    changedFiles.clear()
    return false
  }
}

// ── Entry Point Finder ────────────────────────────────────────────────────────

function findEntryPoint(cwd: string): string | null {
  const candidates = [
    join(cwd, 'dist', 'main.js'),
    join(cwd, 'dist', 'server.js'),
    join(cwd, 'dist', 'index.js'),
    join(cwd, 'dist', 'src', 'main.js'),
    join(cwd, 'dist', 'src', 'server.js'),
    join(cwd, 'dist', 'src', 'index.js')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}

// ── App Server Process ────────────────────────────────────────────────────────

// A crashed child never emits 'exit' again, so waiting on it would always
// hit the kill timeout (and the 'exit' listener would never fire).
function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

async function startServer(cwd: string): Promise<void> {
  if (serverProcess && !hasExited(serverProcess)) {
    serverProcess.kill('SIGTERM')

    await new Promise<void>(done => {
      const timer = setTimeout(() => {
        if (serverProcess) serverProcess.kill('SIGKILL')
        done()
      }, 2000)

      serverProcess!.once('exit', () => {
        clearTimeout(timer)
        done()
      })
    })

  }
  serverProcess = null

  const entry = findEntryPoint(cwd)

  if (!entry) {
    logError('Could not find entry point (dist/main.js).')
    return
  }

  startCount++
  const relEntry = relative(cwd, entry)

  if (startCount === 1) {
    log(`Starting ${C.bold}${relEntry}${C.reset}`)
  } else {
    log(
      `Restarting ${C.bold}${relEntry}${C.reset} ` +
      `${C.gray}(restart #${startCount - 1})${C.reset}`
    )
  }

  serverProcess = spawn('node', [entry], {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV:         process.env.NODE_ENV ?? 'development',
      FORCE_COLOR:      '1',
      NODE_NO_WARNINGS: '1'
    }
  })

  serverProcess.on('error', (err) => {
    logError(`Failed to start server: ${err.message}`)
  })

  serverProcess.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL') return
    if (code !== 0 && code !== null) {
      logError(`Server exited with code ${code}`)
    }
  })
}

// ── Watcher ───────────────────────────────────────────────────────────────────

function watchFiles(cwd: string): void {
  const srcDir = join(cwd, 'src')

  if (!existsSync(srcDir)) {
    logError(`src/ directory not found at ${srcDir}`)
    return
  }

  log(`Watching ${C.bold}src/${C.reset} for changes...`)

  watch(srcDir, { recursive: true }, (event, filename) => {
    if (!filename) return
    if (!filename.endsWith('.ts') && !filename.endsWith('.tsx')) return

    changedFiles.add(filename)
    scheduleRebuild(cwd)
  })
}

function scheduleRebuild(cwd: string): void {
    if (restartTimer) clearTimeout(restartTimer)

    restartTimer = setTimeout(async () => {
      // A rebuild/restart is still in progress — retry later instead of
      // dropping this change (otherwise the save is silently ignored).
      if (isCompiling) { scheduleRebuild(cwd); return }
      isCompiling = true

      const files = Array.from(changedFiles)
      if (files.length === 1) {
        log(`Changed: ${C.yellow}${files[0]}${C.reset}`)
      } else {
        log(`Changed: ${C.yellow}${files.length} files${C.reset}`)
        files.forEach(f => console.log(`  ${C.gray}→ ${f}${C.reset}`))
      }

      try {
        const ok = compile(cwd)
        if (ok) {
          await startServer(cwd)
          // The first compile failed, so Studio was never started — start it
          // now that the project builds (exactly once).
          if (!studioInstance && !studioAttempted) {
            studioAttempted = true
            studioInstance = await startStudio(cwd, readAppPort(cwd))
          }
        }
      } finally {
        isCompiling = false
      }
    }, 150)
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateProject(cwd: string): boolean {
  if (!existsSync(join(cwd, 'package.json'))) {
    logError('No package.json found.')
    return false
  }
  if (!existsSync(join(cwd, 'tsconfig.json'))) {
    logError('No tsconfig.json found.')
    return false
  }
  if (!existsSync(join(cwd, 'src'))) {
    logError('No src/ directory found.')
    return false
  }
  return true
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

function setupShutdown(studio: any): void {
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')

  async function shutdown(signal: string): Promise<void> {
    console.log('')
    log(`${signal} received — shutting down...`)

    // Studio may have been started after setup (first compile failed)
    const activeStudio = studio ?? studioInstance
    if (activeStudio) {
      try {
        await activeStudio.stop()
      } catch {}
    }

    if (serverProcess && !hasExited(serverProcess)) {
      serverProcess.kill('SIGTERM')

      await new Promise<void>(done => {
        const timer = setTimeout(() => {
          serverProcess?.kill('SIGKILL')
          done()
        }, 3000)

        serverProcess!.once('exit', () => {
          clearTimeout(timer)
          done()
        })
      })
    }

    console.log('')
    process.exit(0)
  }

  process.on('SIGINT',  () => { void shutdown('SIGINT')  })
  process.on('SIGTERM', () => { void shutdown('SIGTERM') })
}

// ── Main Entry ────────────────────────────────────────────────────────────────

export async function runDev(): Promise<void> {
  const cwd = process.cwd()

  console.log('')
  console.log(`${C.cyan}${C.bold} AxilJS${C.reset} ${C.gray}development server${C.reset}`)
  console.log(`${C.gray} ─────────────────────────────────────${C.reset}`)
  console.log('')

  if (!validateProject(cwd)) process.exit(1)

  const distDir = join(cwd, 'dist')
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })

  log('Initial compilation...')
  const success = compile(cwd)

  if (!success) {
    logError('Fix compilation errors then save a file to retry.')
    watchFiles(cwd)
    setupShutdown(null)
    return
  }

  const appPort = readAppPort(cwd)

  // 1. Start App Server
  await startServer(cwd)

  // 2. Start Studio
  studioAttempted = true
  studioInstance = await startStudio(cwd, appPort)

  // 3. Watch for changes
  watchFiles(cwd)

  // 4. Register graceful shutdown
  setupShutdown(studioInstance)
}