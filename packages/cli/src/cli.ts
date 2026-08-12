#!/usr/bin/env node
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

import { createProject } from './commands/create';
import { runDev } from './commands/run';
import { buildProject } from './commands/build';
import { installPackages } from './commands/install';
import { runDoctor } from './commands/doctor';
import { runTests } from './commands/test';
import { deploy } from './commands/deploy';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'create': await createProject(args[1]); break;
    case 'run':    await runDev(); break;
    case 'build':  await buildProject(); break;
    case 'install':
    case 'i':      await installPackages(args.slice(1)); break;
    case 'test':   await runTests(args[1]); break;
    case 'deploy': await deploy(); break;
    case 'doctor': await runDoctor(); break;
    case '--version':
    case '-v':     console.log('REstJS v0.1.0 (Complete Ecosystem)'); break;
    default:       printHelp(); break;
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