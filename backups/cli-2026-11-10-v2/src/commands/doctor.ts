/**
 * axil doctor
 * Diagnoses project for common issues.
 */

import { existsSync, readFileSync } from 'fs'
import { join }                     from 'path'
import { execSync }                 from 'child_process'

import * as ui                      from '../ui'

interface Check {
  name: string
  pass: boolean
  message: string
}

export async function runDoctor(): Promise<void> {
  ui.title('doctor', 'Diagnose the project')
  const started = Date.now()
  const spin = ui.spinner('Running diagnostics')

  const checks: Check[] = []
  const cwd = process.cwd()

  // Node.js version
  const nodeVersion = process.version
  const nodeMajor   = parseInt(nodeVersion.slice(1))
  checks.push({
    name:    'Node.js version',
    pass:    nodeMajor >= 18,
    message: `${nodeVersion} ${nodeMajor >= 18 ? '(OK)' : '(need >= 18)'}`
  })

  // TypeScript
  let tsVersion = 'not found'
  let hasTs     = false
  try {
    tsVersion = execSync('npx tsc --version', { stdio: 'pipe' }).toString().trim()
    hasTs = true
  } catch {}
  checks.push({ name: 'TypeScript', pass: hasTs, message: tsVersion })

  // Project files
  const requiredFiles = [
    { file: 'package.json',  name: 'package.json' },
    { file: 'tsconfig.json', name: 'tsconfig.json' },
    { file: 'src/main.ts',   name: 'src/main.ts (entry point)' }
  ]

  for (const { file, name } of requiredFiles) {
    const exists = existsSync(join(cwd, file))
    checks.push({ name, pass: exists, message: exists ? 'Found' : 'Missing' })
  }

  // Check for @axiljs/core
  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg     = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const hasCore = pkg.dependencies?.['@axiljs/core'] !== undefined ||
                    pkg.devDependencies?.['@axiljs/core'] !== undefined

    checks.push({
      name:    '@axiljs/core dependency',
      pass:    hasCore,
      message: hasCore
        ? pkg.dependencies?.['@axiljs/core'] || pkg.devDependencies?.['@axiljs/core']
        : 'Not found in dependencies'
    })

    // Lock file
    // `axil install` delegates to npm (package-lock.json); @axiljs/pm writes @axiljs.lock
    const hasLock = ['axil.lock', '@axiljs.lock', 'package-lock.json']
      .some(f => existsSync(join(cwd, f)))
    checks.push({
      name:    'axil.lock (deterministic installs)',
      pass:    hasLock,
      message: hasLock ? 'Found' : 'Missing — run axil install'
    })
  }

  // .env protection
  const hasGitignore  = existsSync(join(cwd, '.gitignore'))
  let   envProtected  = false

  if (hasGitignore) {
    const gitignore = readFileSync(join(cwd, '.gitignore'), 'utf-8')
    envProtected    = gitignore.includes('.env')
  }

  checks.push({
    name:    '.env protected in .gitignore',
    pass:    envProtected,
    message: envProtected ? 'Protected' : '.env not in .gitignore'
  })

  // Print results
  spin.stop()

  const passed = checks.filter(c => c.pass).length
  const failed = checks.filter(c => !c.pass).length

  ui.table(checks.map(check => [
    `${check.pass ? ui.c.green(ui.sym.tick) : ui.c.red(ui.sym.cross)} ${check.name}`,
    check.pass ? ui.muted(check.message) : ui.c.yellow(check.message)
  ]), { gap: 2 })

  const summary = `${passed}/${checks.length} checks passed`
  if (failed > 0) ui.failed(summary, `${failed} issue(s) found`)
  else ui.done(summary, started)
}
