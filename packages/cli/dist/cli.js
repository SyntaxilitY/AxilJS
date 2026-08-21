#!/usr/bin/env node
"use strict";
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
 *   axil install          Install packages
 *   axil doctor           Diagnose project
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const create_1 = require("./commands/create");
const run_1 = require("./commands/run");
const build_1 = require("./commands/build");
const install_1 = require("./commands/install");
const doctor_1 = require("./commands/doctor");
const test_1 = require("./commands/test");
const deploy_1 = require("./commands/deploy");
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
function loadPackageMetadata() {
    try {
        const packageJsonPath = (0, node_path_1.join)(__dirname, '..', 'package.json');
        const packageJson = (0, node_fs_1.readFileSync)(packageJsonPath, 'utf-8');
        return JSON.parse(packageJson);
    }
    catch {
        return {
            name: '@axiljs/cli',
            version: 'unknown',
            description: 'AxilJS CLI',
            author: 'SyntaxilitY'
        };
    }
}
const packageMetadata = loadPackageMetadata();
const CLI_NAME = packageMetadata.name || '@axiljs/cli';
const CLI_VERSION = packageMetadata.version || 'unknown';
const CLI_DESCRIPTION = packageMetadata.description ||
    'The JavaScript Backend That Finally Rests.';
const CLI_AUTHOR = typeof packageMetadata.author === 'string'
    ? packageMetadata.author
    : packageMetadata.author?.name ||
        'SyntaxilitY';
// ============================================================================
// CLI ARGUMENTS
// ============================================================================
const args = process.argv.slice(2);
const command = args[0];
// ============================================================================
// MAIN
// ============================================================================
async function main() {
    switch (command) {
        case 'create': {
            const name = args[1];
            if (!name) {
                console.error('\x1b[31mError:\x1b[0m Please provide a project name.');
                console.error('  Usage: axil create <project-name>');
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
            const isDev = args.includes('-D') ||
                args.includes('--dev');
            const packages = args
                .slice(1)
                .filter(argument => argument !== '-D' &&
                argument !== '--dev');
            await (0, install_1.installPackages)(packages, isDev);
            break;
        }
        case 'test': {
            const pattern = args[1];
            await (0, test_1.runTests)(pattern);
            break;
        }
        case 'deploy': {
            await (0, deploy_1.deploy)();
            break;
        }
        case 'doctor': {
            await (0, doctor_1.runDoctor)();
            break;
        }
        // ========================================================================
        // VERSION
        // ========================================================================
        case '--version':
        case '-v': {
            console.log(`${CLI_NAME} v${CLI_VERSION}`);
            break;
        }
        // ========================================================================
        // HELP
        // ========================================================================
        case '--help':
        case '-h':
        case undefined: {
            printHelp();
            break;
        }
        // ========================================================================
        // UNKNOWN COMMAND
        // ========================================================================
        default: {
            console.error(`\x1b[31mError:\x1b[0m Unknown command '${command}'`);
            console.error('Run \x1b[1maxil --help\x1b[0m for available commands.');
            process.exit(1);
        }
    }
}
// ============================================================================
// HELP
// ============================================================================
function printHelp() {
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
`);
}
// ============================================================================
// ERROR HANDLING
// ============================================================================
main().catch(error => {
    const message = error instanceof Error
        ? error.message
        : String(error);
    console.error('\x1b[31m[AxilJS]\x1b[0m Fatal error:', message);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map