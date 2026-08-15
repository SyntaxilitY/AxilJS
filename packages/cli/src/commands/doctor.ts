/**
 * axil doctor
 * Diagnoses project for common issues.
 */

import { existsSync, readFileSync } from 'fs'
import { join }                     from 'path'
import { execSync }                 from 'child_process'

interface Check {
  name: string
  pass: boolean
  message: string
}

export async function runDoctor(): Promise<void> {
  console.log('\n\x1b[36m[AxilJS]\x1b[0m Running diagnostics...\n')

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

  // Check for @axil/core
  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg     = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const hasCore = pkg.dependencies?.['@axil/core'] !== undefined ||
                    pkg.devDependencies?.['@axil/core'] !== undefined

    checks.push({
      name:    '@axil/core dependency',
      pass:    hasCore,
      message: hasCore
        ? pkg.dependencies?.['@axil/core'] || pkg.devDependencies?.['@axil/core']
        : 'Not found in dependencies'
    })

    // Lock file
    const hasLock = existsSync(join(cwd, 'axil.lock'))
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
  const passed = checks.filter(c => c.pass).length
  const failed = checks.filter(c => !c.pass).length

  for (const check of checks) {
    const icon = check.pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
    console.log(`  ${icon} ${check.name.padEnd(35)} ${check.message}`)
  }

  console.log('')
  console.log(
    `  ${passed}/${checks.length} checks passed` +
    (failed > 0 ? ` \x1b[31m(${failed} issues found)\x1b[0m` : ' \x1b[32m✓\x1b[0m')
  )
  console.log('')
}