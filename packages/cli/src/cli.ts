#!/usr/bin/env node
/**
 * AxilJS CLI — Entry Point
 * Developed by SyntaxilitY
 *
 * Commands:
 *   axil create [name]           Create a new project (interactive picker)
 *   axil generate <kind> <name>  Generate module/controller/service/entity/migration
 *   axil migrate [up|down|status] Run database migrations
 *   axil run                     Start development server
 *   axil build                   Build for production
 *   axil test                    Run tests
 *   axil verify                  Check decorator enforcement + run tests in enforce mode
 *   axil deploy                  Generate Docker + K8s files
 *   axil install                 Install packages
 *   axil doctor                  Diagnose project
 *   axil capacity                Check capacity against the scaling target
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
import { capacity }        from './commands/capacity'
import { runDecorator }    from './commands/decorator'
import { verify }          from './commands/verify'
import * as ui             from './ui'
import { canPrompt }       from './prompts'
import { TEMPLATES }       from './templates'

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

// Product tagline for the banner (package.json's description is npm-facing)
const CLI_TAGLINE = 'The JavaScript Backend That Finally Rests.'

// Display name only: "Name <email> (url)" → "Name"
const CLI_AUTHOR = (
  typeof packageMetadata.author === 'string'
    ? packageMetadata.author
    : packageMetadata.author?.name ||
      'SyntaxilitY'
).replace(/\s*[<(].*$/, '')

// ============================================================================
// CLI ARGUMENTS
// ============================================================================

const args = process.argv.slice(2)
const command = args[0]

function fail(message: string, usage?: string): never {
  ui.error(message, usage ? `Usage: ${usage}` : undefined)
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

      ui.error(
        `Unknown command '${command}'` + (guess ? ` — did you mean '${guess}'?` : ''),
        `Run 'axil --help' for available commands.`
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

      // On a terminal a missing name is asked for (step 1 of the create flow)
      if (!projectName && (flagBool(parsed, 'yes') || !canPrompt())) {
        fail('Please provide a project name.', 'axil create <project-name> [--yes] [--template=<id>]')
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
        force:       flagBool(parsed, 'force'),
        template:    flagString(parsed, 'template')
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

    case 'verify': {
      if (pos.length > 1) {
        fail(`Unexpected argument '${pos[1]}'.`, 'axil verify [pattern] [--static] [--json] [--strict]')
      }

      await verify({
        pattern: pos[0],
        static:  flagBool(parsed, 'static'),
        json:    flagBool(parsed, 'json'),
        strict:  flagBool(parsed, 'strict')
      })
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

    case 'capacity': {
      await capacity({
        url:           flagString(parsed, 'url'),
        serverWorkers: flagString(parsed, 'server-workers'),
        duration:      flagString(parsed, 'duration'),
        connections:   flagString(parsed, 'connections'),
        init:          flagBool(parsed, 'init'),
        force:         flagBool(parsed, 'force'),
        json:          flagBool(parsed, 'json')
      })
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

/**
 * Commands grouped by workflow. Labels come from the COMMANDS specs in
 * args.ts, so a command's summary only lives in one place.
 */
const HELP_GROUPS: Array<{ title: string; commands: Array<[string, string]> }> = [
  { title: 'Project',  commands: [['create', 'create [name]'], ['generate', 'generate <kind> <name>'], ['install', 'install [packages…]']] },
  { title: 'Develop',  commands: [['run', 'run'], ['test', 'test [pattern]'], ['doctor', 'doctor']] },
  { title: 'Database', commands: [['migrate', 'migrate [up|down|status]']] },
  { title: 'Ship',     commands: [['build', 'build'], ['capacity', 'capacity'], ['deploy', 'deploy']] },
  { title: 'Inspect',  commands: [['decorator', 'decorator <sub>'], ['verify', 'verify [pattern]']] }
]

function printHelp(): void {
  ui.banner(CLI_VERSION, CLI_TAGLINE)

  ui.line()
  // Template ids wrapped to the card width
  const idLines: string[] = []
  for (const id of TEMPLATES.map(t => t.id)) {
    const last = idLines.length - 1
    if (last >= 0 && idLines[last].length + id.length + 3 <= 66) idLines[last] += ` ${ui.sym.dot} ${id}`
    else idLines.push(id)
  }
  ui.card('Start a project', [
    `${ui.muted('$')} ${ui.cmd('axil create')}                     ${ui.muted('browse templates, space to pick')}`,
    `${ui.muted('$')} ${ui.cmd('axil create my-api -t rest-api')}  ${ui.muted('or name one directly')}`,
    '',
    ...idLines.map(l => ui.muted(l))
  ], { meta: `${TEMPLATES.length} templates`, width: 74 })

  ui.section('Usage:')
  ui.line(`  ${ui.muted('$')} ${ui.cmd('axil <command> [options]')}`)

  const rows: string[][] = []
  for (const group of HELP_GROUPS) {
    rows.push([''])
    rows.push([ui.badge(group.title.toUpperCase(), 'muted')])
    for (const [name, label] of group.commands) {
      const spec = findCommand(name)
      const alias = spec?.aliases?.length ? ui.muted(`  (alias: ${spec.aliases.join(', ')})`) : ''
      rows.push([`  ${ui.cmd(label)}`, (spec?.summary ?? '') + alias])
    }
  }
  ui.table(rows, { indent: 2, gap: 3 })

  ui.section('Options:')
  ui.table([
    [ui.cmd('-h, --help'), 'Show help  ' + ui.muted('(after a command: that command\'s help)')],
    [ui.cmd('-v, --version'), 'Show the CLI version']
  ], { indent: 4 })

  ui.section('Quick start:')
  for (const example of [
    'axil create my-api --yes --db=sqlite',
    'cd my-api && axil run',
    'axil capacity',
    'axil generate module products',
    'axil migrate status',
    'axil decorator search cache'
  ]) ui.line(`  ${ui.muted('$')} ${example}`)

  ui.line()
  ui.line(ui.muted(`Run ${ui.cmd('axil <command> --help')} for a command's options.  ${ui.sym.dot}  ${CLI_AUTHOR}`))
  ui.line()
}

function printDecoratorHelp(): void {
  ui.title('decorator', 'Inspect AxilJS semantic decorators')

  ui.line(ui.c.bold('Usage:'))
  ui.line(`  ${ui.muted('$')} ${ui.cmd('axil decorator <subcommand> [options]')}`)

  ui.section('Subcommands:')
  ui.table([
    [ui.cmd('list'), 'List all registered decorators'],
    [ui.cmd('list --category=<cat>'), 'Filter by category (HTTP, Security, Data, …)'],
    [ui.cmd('info <name>'), 'Show full documentation for a decorator'],
    [ui.cmd('search <query>'), 'Search decorators by keyword'],
    [ui.cmd('check <file>'), 'Validate decorator composition in a TypeScript file'],
    [ui.cmd('graph'), 'Emit the metadata dependency graph as JSON'],
    [ui.cmd('categories'), 'List all decorator categories']
  ], { indent: 4 })

  ui.section('Examples:')
  for (const example of [
    'axil decorator list --category=Reliability',
    'axil decorator info tCacheStampede',
    'axil decorator search "rate limit"',
    'axil decorator check src/controllers/user.controller.ts'
  ]) ui.line(`  ${ui.muted('$')} ${example}`)
  ui.line()
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

main().catch(error => {
  // Ctrl+C / Esc in a prompt: it already printed "Cancelled"
  if (error instanceof Error && error.name === 'PromptCancelled') process.exit(130)

  const message =
    error instanceof Error
      ? error.message
      : String(error)

  ui.error(message)

  process.exit(1)
})