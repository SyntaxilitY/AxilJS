/**
 * axil install [package]
 * Install packages using the AxilJS package manager.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export async function installPackages(
  packages: string[],
  isDev: boolean = false
): Promise<void> {
  const cwd = process.cwd()

  if (packages.length > 0) {
    await addToPackageJson(packages, isDev, cwd)
  }

  // Delegate to npm for actual installation
  const { execSync } = require('child_process')
  try {
    execSync('npm install', { cwd, stdio: 'inherit' })
  } catch {
    console.error('\x1b[31m[AxilJS]\x1b[0m Installation failed.')
    process.exit(1)
  }
}

async function addToPackageJson(
  packages: string[],
  isDev: boolean,
  cwd: string
): Promise<void> {
  const pkgPath = join(cwd, 'package.json')

  if (!existsSync(pkgPath)) {
    console.error('\x1b[31mError:\x1b[0m No package.json found.')
    process.exit(1)
  }

  const pkg     = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const section = isDev ? 'devDependencies' : 'dependencies'

  if (!pkg[section]) pkg[section] = {}

  for (const packageName of packages) {
    const atIndex = packageName.lastIndexOf('@')
    let name    = packageName
    let version = 'latest'

    if (atIndex > 0) {
      name    = packageName.slice(0, atIndex)
      version = packageName.slice(atIndex + 1)
    }

    // Only exact versions get a caret; tags ("latest") and explicit ranges
    // ("^1.2", "~1.2.3", ">=2") are written as-is ("^latest" is invalid).
    pkg[section][name] = /^\d/.test(version) ? `^${version}` : version
    console.log(`  \x1b[32m+\x1b[0m Added ${name}@${version} to ${section}`)
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8')
}