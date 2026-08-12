#!/usr/bin/env node
"use strict";
/**
 * REstJS CLI Entry Point.
 * Parses command line arguments and delegates to the appropriate command.
 *
 * Commands:
 *   rest create <name>    Create a new project
 *   rest run              Start development server
 *   rest build            Build for production
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
const deploy_1 = require("./commands/deploy");
const args = process.argv.slice(2);
const command = args[0];
async function main() {
    switch (command) {
        case 'create':
            await (0, create_1.createProject)(args[1]);
            break;
        case 'run':
            await (0, run_1.runDev)();
            break;
        case 'build':
            await (0, build_1.buildProject)();
            break;
        case 'install':
        case 'i':
            await (0, install_1.installPackages)(args.slice(1));
            break;
        case 'test':
            await (0, test_1.runTests)(args[1]);
            break;
        case 'deploy':
            await (0, deploy_1.deploy)();
            break;
        case 'doctor':
            await (0, doctor_1.runDoctor)();
            break;
        case '--version':
        case '-v':
            console.log('REstJS v0.1.0 (Complete Ecosystem)');
            break;
        default:
            printHelp();
            break;
    }
}
function printHelp() {
    console.log(`
\x1b[36m\x1b[1mREstJS\x1b[0m v0.1.0 — Complete Next-Generation JavaScript Backend Ecosystem

Commands:
  create <name>     Create new project
  run               Start dev server
  build             Build for production
  test [pattern]    Run tests
  deploy            Generate Docker + Kubernetes manifests
  install [pkg]     Install packages
  doctor            Diagnose project
  --help            Show this help

The full ecosystem is now implemented:
• Runtime + HTTP Server
• Batteries-included framework
• ORM + Migrations
• Auth (JWT, RBAC)
• Validation + Testing
• Events, WebSockets, Queue
• Circuit Breaker, Observability
• Full AI Platform (Providers, RAG, Agents, MCP)
• Cloud Deployment + Monitoring

Run: rest create my-app
`);
}
main().catch(e => {
    console.error('\x1b[31m[REstJS]\x1b[0m', e.message);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map