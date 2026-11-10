/**
 * axil install [package]
 * Install packages using the AxilJS package manager.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

import * as ui from '../ui'
import { npmSummary, printCaptured, runCaptured } from '../utils/exec'

export async function installPackages(
  packages: string[],
  isDev: boolean = false
): Promise<void> {
  const cwd     = process.cwd()
  const started = Date.now()

  ui.title('install', packages.length > 0 ? `Add ${packages.length} package(s)` : 'Install dependencies')

  if (packages.length > 0) {
    await addToPackageJson(packages, isDev, cwd)
  }

  // Delegate to npm for actual installation
  const spin = ui.spinner('Installing dependencies')
  let result
  try {
    result = await runCaptured('npm install', cwd)
  } catch (error: any) {
    result = { code: 1, output: error?.message ?? String(error) }
  }

  if (result.code !== 0) {
    spin.fail('Installation failed', 'npm install')
    console.error('')
    printCaptured(result.output, l => console.error(l))
    ui.error('Installation failed.', 'See the npm output above.')
    process.exit(1)
  }

  spin.succeed('Dependencies installed', npmSummary(result.output))
  ui.done('Install done', started)
}

async function addToPackageJson(
  packages: string[],
  isDev: boolean,
  cwd: string
): Promise<void> {
  const pkgPath = join(cwd, 'package.json')

  if (!existsSync(pkgPath)) {
    ui.error('No package.json found.', 'Run axil install from the project root.')
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
    ui.success(`Added ${ui.c.bold(`${name}@${version}`)} to ${section}`)
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8')
}
