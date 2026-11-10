#!/usr/bin/env node
/**
 * AxilJS CLI — Entry Point
 * Developed by SyntaxilitY
 *
 * Commands:
 *   axil create <name>           Create a new project
 *   axil generate <kind> <name>  Generate module/controller/service/entity/migration
 *   axil migrate [up|down|status] Run database migrations
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

import { createProject, Database } from './commands/create'
import { generate, GENERATOR_KINDS } from './commands/generate'
import { migrate, MIGRATE_ACTIONS }  from './commands/migrate'
import {
  ArgError,
  COMMANDS,
  CommandSpec,
  ParsedArgs,
  closest,
  findCommand,
  formatCommandHelp,
  parseArgs
} from './args'
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

function fail(message: string, usage?: string): never {
  console.error(`\x1b[31mError:\x1b[0m ${message}`)
  if (usage) console.error(`  Usage: ${usage}`)
  process.exit(1)
}

/**
 * Parse the arguments after the command name. Prints the command's help
 * (and returns null) for --help/-h; exits with a helpful message on unknown
 * flags or bad values.
 */
function parseCommand(spec: CommandSpec): ParsedArgs | null {
  let parsed: ParsedArgs
  try {
    parsed = parseArgs(args.slice(1), spec.flags, spec.name)
  } catch (error) {
    if (error instanceof ArgError) fail(error.message)
    throw error
  }

  if (parsed.help) {
    console.log(formatCommandHelp(spec))
    return null
  }

  return parsed
}

function flagString(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.flags[name]
  return typeof v === 'string' ? v : undefined
}

function flagBool(parsed: ParsedArgs, name: string): boolean | undefined {
  const v = parsed.flags[name]
  return typeof v === 'boolean' ? v : undefined
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const spec = findCommand(command)

  if (spec) {
    const parsed = parseCommand(spec)
    if (!parsed) return
    await runCommand(spec.name, parsed)
    return
  }

  switch (command) {
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
    case 'help':
    case undefined: {
      const topic = command === 'help' ? findCommand(args[1]) : undefined
      if (topic) console.log(formatCommandHelp(topic))
      else printHelp()
      break
    }

    // ========================================================================
    // UNKNOWN COMMAND
    // ========================================================================

    default: {
      const names = COMMANDS.flatMap(c => [c.name, ...(c.aliases || [])])
      const guess = closest(command, names)

      console.error(
        `\x1b[31mError:\x1b[0m Unknown command '${command}'` +
        (guess ? ` — did you mean '${guess}'?` : '')
      )

      console.error(
        'Run \x1b[1maxil --help\x1b[0m for available commands.'
      )

      process.exit(1)
    }
  }
}

async function runCommand(name: string, parsed: ParsedArgs): Promise<void> {
  const pos = parsed.positionals

  switch (name) {
    case 'create': {
      const projectName = pos[0]

      if (!projectName) {
        fail('Please provide a project name.', 'axil create <project-name> [--yes] [--db=<driver>]')
      }
      if (pos.length > 1) {
        fail(`Unexpected argument '${pos[1]}'.`, 'axil create <project-name> [options]')
      }

      await createProject(projectName, {
        yes:         flagBool(parsed, 'yes'),
        db:          flagString(parsed, 'db') as Database | undefined,
        auth:        flagBool(parsed, 'auth'),
        ai:          flagBool(parsed, 'ai'),
        ws:          flagBool(parsed, 'ws'),
        queue:       flagBool(parsed, 'queue'),
        skipInstall: flagBool(parsed, 'skip-install'),
        force:       flagBool(parsed, 'force')
      })
      break
    }

    case 'generate': {
      const [kind, resource] = pos

      if (!kind || !resource) {
        fail(
          'Please provide what to generate and a name.',
          `axil generate <${GENERATOR_KINDS.join('|')}> <name>`
        )
      }

      await generate(kind, resource, {
        force: flagBool(parsed, 'force'),
        db:    flagString(parsed, 'db') as Database | undefined,
        auth:  flagBool(parsed, 'auth')
      })
      break
    }

    case 'migrate': {
      const action = pos[0] || 'up'

      if (!MIGRATE_ACTIONS.includes(action as any)) {
        fail(`Unknown migrate action '${action}'.`, 'axil migrate [up|down|status]')
      }

      await migrate(action, { dir: flagString(parsed, 'dir') })
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

    case 'install': {
      await installPackages(
        pos,
        flagBool(parsed, 'dev') === true
      )

      break
    }

    case 'test': {
      await runTests(pos[0])
      break
    }

    case 'deploy': {
      await deploy({
        port:     flagString(parsed, 'port'),
        replicas: flagString(parsed, 'replicas'),
        force:    flagBool(parsed, 'force')
      })
      break
    }

    case 'doctor': {
      await runDoctor()
      break
    }

    // ========================================================================
    // DECORATOR
    // ========================================================================

    case 'decorator': {
      const subcommand = pos[0]

      if (!subcommand) {
        printDecoratorHelp()
        break
      }

      // Accept both --category=<cat> and --category <cat>
      const category = flagString(parsed, 'category')
      const subArgs  = [
        ...pos.slice(1),
        ...(category !== undefined ? [`--category=${category}`] : [])
      ]

      await runDecorator(subcommand, subArgs)
      break
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
  create <name>          Create a new AxilJS project (--yes, --db=, --auth, --ws, --queue, --skip-install, --force)
  generate <kind> <name> Generate a module|controller|service|entity|migration (alias: g)
  migrate [up|down|status] Run database migrations
  run                    Start development server with hot reload
  build                  Compile TypeScript for production
  install [packages]     Install packages
  install -D [packages]  Install as devDependency
  test [pattern]         Run tests (*.test.ts, *.spec.ts)
  deploy                 Generate Docker + Kubernetes manifests (--port, --replicas, --force)
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
  --help, -h             Show this help message (after a command: that command's help)
  --version, -v          Show version number

\x1b[1mExamples:\x1b[0m
  axil create my-api
  axil create my-api --yes --db=sqlite --skip-install
  axil generate module products
  axil migrate status
  axil run --help
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