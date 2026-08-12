#!/usr/bin/env node
"use strict";
/**
 * REstJS CLI Entry Point.
 * Parses command line arguments and delegates to the appropriate command.
 *
 * Commands:
 *   rest create <name>    Create a new project
 *   rest run              Start development server
 *   rest build            Build for production (stub - Phase 2)
 *   rest --version        Show version
 *   rest --help           Show help
 */
Object.defineProperty(exports, "__esModule", { value: true });
const create_1 = require("./commands/create");
const run_1 = require("./commands/run");
const build_1 = require("./commands/build");
const install_1 = require("./commands/install");
const doctor_1 = require("./commands/doctor");
const test_1 = require("./commands/test");
const args = process.argv.slice(2);
const command = args[0];
async function main() {
    switch (command) {
        case 'create': {
            const name = args[1];
            if (!name) {
                console.error('\x1b[31mError:\x1b[0m Please provide a project name.');
                process.exit(1);
            }
            await (0, create_1.createProject)(name);
            break;
        }
        case 'run': {
            await (0, run_1.runDev)();
            break;
        }
        case 'build': {
            await (0, build_1.buildProject)();
            break;
        }
        case 'install':
        case 'i': {
            const isDev = args.includes('-D') || args.includes('--dev');
            const packages = args.slice(1).filter(a => a !== '-D' && a !== '--dev');
            await (0, install_1.installPackages)(packages, isDev);
            break;
        }
        case 'test': {
            // Optional pattern: rest test users
            const pattern = args[1];
            await (0, test_1.runTests)(pattern);
            break;
        }
        case 'migrate': {
            // Sub-commands: rest migrate, rest migrate:rollback, rest migrate:status
            await runMigration(args[1]);
            break;
        }
        case 'doctor': {
            await (0, doctor_1.runDoctor)();
            break;
        }
        case '--version':
        case '-v': {
            console.log('REstJS v0.1.0');
            break;
        }
        case '--help':
        case '-h':
        case undefined: {
            printHelp();
            break;
        }
        default: {
            console.error(`\x1b[31mError:\x1b[0m Unknown command '${command}'`);
            console.error('Run \x1b[1mrest --help\x1b[0m for available commands.');
            process.exit(1);
        }
    }
}
async function runMigration(subCommand) {
    console.log('\x1b[36m[REstJS]\x1b[0m Migration commands require database configuration.');
    console.log('Ensure your app calls createConnection() before running migrations.');
    console.log('');
    // Dynamic import of migration runner
    switch (subCommand) {
        case 'rollback':
            console.log('Usage: Import MigrationRunner and call runner.down()');
            break;
        case 'status':
            console.log('Usage: Import MigrationRunner and call runner.status()');
            break;
        default:
            console.log('Usage: Import MigrationRunner and call runner.up()');
    }
}
function printHelp() {
    console.log(`
\x1b[36m\x1b[1mREstJS\x1b[0m v0.1.0 - Next-Generation JavaScript Backend Ecosystem

\x1b[1mUsage:\x1b[0m
  rest <command> [options]

\x1b[1mCommands:\x1b[0m
  create <name>          Create a new REstJS project
  run                    Start development server with hot reload
  build                  Compile TypeScript, build for production
  install [packages]     Install packages
  install -D [packages]  Install as devDependency
  test [pattern]         Run tests (*.test.ts, *.spec.ts)
  migrate                Run pending database migrations
  migrate rollback       Roll back last migration batch
  migrate status         Show migration status
  doctor                 Diagnose project issues

\x1b[1mExamples:\x1b[0m
  rest create my-api
  rest run
  rest test
  rest test users
  rest migrate
  rest build
`);
}
main().catch(error => {
    console.error('\x1b[31m[REstJS]\x1b[0m Fatal error:', error.message);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map