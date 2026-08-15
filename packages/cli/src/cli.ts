#!/usr/bin/env node
/**
 * AxilJS CLI — Entry Point
 * Developed by SyntaxilitY
 *
 * Commands:
 *   axil create <name>    Create a new project
 *   axil run              Start development server
 *   axil build            Build for production
 *   axil test             Run tests
 *   axil deploy           Generate Docker + K8s files
 *   axil install           Install packages
 *   axil doctor           Diagnose project
 */

import { createProject }    from './commands/create'
import { runDev }           from './commands/run'
import { buildProject }     from './commands/build'
import { installPackages }  from './commands/install'
import { runDoctor }        from './commands/doctor'
import { runTests }         from './commands/test'
import { deploy }           from './commands/deploy'

const args    = process.argv.slice(2)
const command = args[0]

async function main(): Promise<void> {
  switch (command) {
    case 'create': {
      const name = args[1]
      if (!name) {
        console.error('\x1b[31mError:\x1b[0m Please provide a project name.')
        console.error('  Usage: axil create <project-name>')
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
      const isDev    = args.includes('-D') || args.includes('--dev')
      const packages = args.slice(1).filter(a => a !== '-D' && a !== '--dev')
      await installPackages(packages, isDev)
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

    case '--version':
    case '-v': {
      console.log('AxilJS v0.1.0')
      break
    }

    case '--help':
    case '-h':
    case undefined: {
      printHelp()
      break
    }

    default: {
      console.error(`\x1b[31mError:\x1b[0m Unknown command '${command}'`)
      console.error('Run \x1b[1maxil --help\x1b[0m for available commands.')
      process.exit(1)
    }
  }
}

function printHelp(): void {
  console.log(`
\x1b[36m\x1b[1mAxilJS\x1b[0m v0.1.0 — Developed by SyntaxilitY
The JavaScript Backend That Finally Rests.

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
`)
}

main().catch(error => {
  console.error('\x1b[31m[AxilJS]\x1b[0m Fatal error:', error.message)
  process.exit(1)
})