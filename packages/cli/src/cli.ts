#!/usr/bin/env node
/**
 * AxilJS CLI — Entry Point
 * Developed by SyntaxilitY
 *
 * Commands:
 *   axil create <name>           Create a new project
 *   axil run                     Start development server
 *   axil build                   Build for production
 *   axil test                    Run tests
 *   axil deploy                  Generate Docker + K8s files
 *   axil install                 Install packages
 *   axil doctor                  Diagnose project
 *   axil decorator list          List all semantic decorators
 *   axil decorator info <name>   Show decorator documentation
 *   axil decorator search <q>    Search decorators by keyword
 *   axil decorator check <file>  Validate decorator composition
 *   axil decorator graph         Emit metadata dependency graph
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createProject }   from './commands/create'
import { runDev }          from './commands/run'
import { buildProject }    from './commands/build'
import { installPackages } from './commands/install'
import { runDoctor }       from './commands/doctor'
import { runTests }        from './commands/test'
import { deploy }          from './commands/deploy'
import { runDecorator }    from './commands/decorator'

// ============================================================================
// CLI PACKAGE METADATA
// ============================================================================

interface PackageMetadata {
  name?: string
  version?: string
  description?: string
  author?: string | {
    name?: string
    email?: string
    url?: string
  }
  homepage?: string
  repository?: string | {
    type?: string
    url?: string
  }
}

/**
 * Dynamically load metadata from the CLI package.json.
 *
 * Runtime structure:
 *
 * packages/cli/
 * ├── package.json
 * └── dist/
 *     └── cli.js
 *
 * This avoids hardcoding the CLI version.
 */
function loadPackageMetadata(): PackageMetadata {
  try {
    const packageJsonPath = join(
      __dirname,
      '..',
      'package.json'
    )

    const packageJson = readFileSync(
      packageJsonPath,
      'utf-8'
    )

    return JSON.parse(packageJson) as PackageMetadata
  } catch {
    return {
      name: '@axiljs/cli',
      version: 'unknown',
      description: 'AxilJS CLI',
      author: 'SyntaxilitY'
    }
  }
}

const packageMetadata = loadPackageMetadata()

const CLI_NAME =
  packageMetadata.name || '@axiljs/cli'

const CLI_VERSION =
  packageMetadata.version || 'unknown'

const CLI_DESCRIPTION =
  packageMetadata.description ||
  'The JavaScript Backend That Finally Rests.'

const CLI_AUTHOR =
  typeof packageMetadata.author === 'string'
    ? packageMetadata.author
    : packageMetadata.author?.name ||
      'SyntaxilitY'

// ============================================================================
// CLI ARGUMENTS
// ============================================================================

const args = process.argv.slice(2)
const command = args[0]

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  switch (command) {
    case 'create': {
      const name = args[1]

      if (!name) {
        console.error(
          '\x1b[31mError:\x1b[0m Please provide a project name.'
        )

        console.error(
          '  Usage: axil create <project-name>'
        )

        process.exit(1)
      }

      await createProject(name)
      break
    }

    case 'run': {
      await runDev()
      break
    }

    case 'build': {
      await buildProject()
      break
    }

    case 'install':
    case 'i': {
      const isDev =
        args.includes('-D') ||
        args.includes('--dev')

      const packages = args
        .slice(1)
        .filter(
          argument =>
            argument !== '-D' &&
            argument !== '--dev'
        )

      await installPackages(
        packages,
        isDev
      )

      break
    }

    case 'test': {
      const pattern = args[1]

      await runTests(pattern)
      break
    }

    case 'deploy': {
      await deploy()
      break
    }

    case 'doctor': {
      await runDoctor()
      break
    }

    // ========================================================================
    // DECORATOR
    // ========================================================================

    case 'decorator':
    case 'dec': {
      const subcommand = args[1]
      const subArgs = args.slice(2)

      if (!subcommand) {
        printDecoratorHelp()
        break
      }

      await runDecorator(subcommand, subArgs)
      break
    }

    // ========================================================================
    // VERSION
    // ========================================================================

    case '--version':
    case '-v': {
      console.log(
        `${CLI_NAME} v${CLI_VERSION}`
      )

      break
    }

    // ========================================================================
    // HELP
    // ========================================================================

    case '--help':
    case '-h':
    case undefined: {
      printHelp()
      break
    }

    // ========================================================================
    // UNKNOWN COMMAND
    // ========================================================================

    default: {
      console.error(
        `\x1b[31mError:\x1b[0m Unknown command '${command}'`
      )

      console.error(
        'Run \x1b[1maxil --help\x1b[0m for available commands.'
      )

      process.exit(1)
    }
  }
}

// ============================================================================
// HELP
// ============================================================================

function printHelp(): void {
  console.log(`
\x1b[36m\x1b[1mAxilJS\x1b[0m v${CLI_VERSION} — Developed by ${CLI_AUTHOR}
${CLI_DESCRIPTION}

\x1b[1mUsage:\x1b[0m
  axil <command> [options]

\x1b[1mCommands:\x1b[0m
  create <name>          Create a new AxilJS project
  run                    Start development server with hot reload
  build                  Compile TypeScript for production
  install [packages]     Install packages
  install -D [packages]  Install as devDependency
  test [pattern]         Run tests (*.test.ts, *.spec.ts)
  deploy                 Generate Docker + Kubernetes manifests
  doctor                 Diagnose project issues
  decorator <sub>        Inspect semantic decorators

\x1b[1mDecorator Commands:\x1b[0m
  decorator list         List all registered decorators
  decorator info <name>  Show full documentation for a decorator
  decorator search <q>   Search decorators by keyword
  decorator check <file> Validate decorator composition in a file
  decorator graph        Emit metadata dependency graph
  decorator categories   List all decorator categories

\x1b[1mOptions:\x1b[0m
  --help, -h             Show this help message
  --version, -v          Show version number

\x1b[1mExamples:\x1b[0m
  axil create my-api
  axil run
  axil build
  axil test
  axil test users
  axil deploy
  axil doctor
  axil decorator list
  axil decorator list --category=Security
  axil decorator info tDatabase
  axil decorator search cache
  axil decorator check src/controllers/user.controller.ts
  axil decorator graph
`)
}

function printDecoratorHelp(): void {
  console.log(`
\x1b[36m\x1b[1maxil decorator\x1b[0m — Inspect AxilJS semantic decorators

\x1b[1mUsage:\x1b[0m
  axil decorator <subcommand> [options]

\x1b[1mSubcommands:\x1b[0m
  list                   List all registered decorators
  list --category=<cat>  Filter by category (HTTP, Security, Data, etc.)
  info <name>            Show full documentation for a decorator
  search <query>         Search decorators by keyword
  check <file>           Validate decorator composition in a TypeScript file
  graph                  Emit metadata dependency graph as JSON
  categories             List all decorator categories

\x1b[1mExamples:\x1b[0m
  axil decorator list
  axil decorator list --category=Reliability
  axil decorator info tDatabase
  axil decorator info tCacheStampede
  axil decorator search "rate limit"
  axil decorator check src/controllers/user.controller.ts
  axil decorator graph
  axil decorator categories
`)
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

main().catch(error => {
  const message =
    error instanceof Error
      ? error.message
      : String(error)

  console.error(
    '\x1b[31m[AxilJS]\x1b[0m Fatal error:',
    message
  )

  process.exit(1)
})