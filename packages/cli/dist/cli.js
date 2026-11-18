#!/usr/bin/env node
"use strict";
/**
 * AxilJS CLI — Entry Point
 * Developed by SyntaxilitY
 *
 * Commands:
 *   axil create [name]           Create a new project (interactive picker)
 *   axil generate <kind> <name>  Generate module/controller/service/entity/migration
 *   axil generate client         Generate a typed API client from an OpenAPI document
 *   axil migrate [up|down|status] Run database migrations
 *   axil migrate --check         Check pending migrations for locking/breaking changes
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const create_1 = require("./commands/create");
const generate_1 = require("./commands/generate");
const generate_client_1 = require("./commands/generate-client");
const migrate_1 = require("./commands/migrate");
const args_1 = require("./args");
const run_1 = require("./commands/run");
const build_1 = require("./commands/build");
const install_1 = require("./commands/install");
const doctor_1 = require("./commands/doctor");
const test_1 = require("./commands/test");
const deploy_1 = require("./commands/deploy");
const capacity_1 = require("./commands/capacity");
const decorator_1 = require("./commands/decorator");
const verify_1 = require("./commands/verify");
const ui = __importStar(require("./ui"));
const prompts_1 = require("./prompts");
const templates_1 = require("./templates");
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
// Product tagline for the banner (package.json's description is npm-facing)
const CLI_TAGLINE = 'The JavaScript Backend That Finally Rests.';
// Display name only: "Name <email> (url)" → "Name"
const CLI_AUTHOR = (typeof packageMetadata.author === 'string'
    ? packageMetadata.author
    : packageMetadata.author?.name ||
        'SyntaxilitY').replace(/\s*[<(].*$/, '');
// ============================================================================
// CLI ARGUMENTS
// ============================================================================
const args = process.argv.slice(2);
const command = args[0];
function fail(message, usage) {
    ui.error(message, usage ? `Usage: ${usage}` : undefined);
    process.exit(1);
}
/**
 * Parse the arguments after the command name. Prints the command's help
 * (and returns null) for --help/-h; exits with a helpful message on unknown
 * flags or bad values.
 */
function parseCommand(spec) {
    let parsed;
    try {
        parsed = (0, args_1.parseArgs)(args.slice(1), spec.flags, spec.name);
    }
    catch (error) {
        if (error instanceof args_1.ArgError)
            fail(error.message);
        throw error;
    }
    if (parsed.help) {
        console.log((0, args_1.formatCommandHelp)(spec));
        return null;
    }
    return parsed;
}
function flagString(parsed, name) {
    const v = parsed.flags[name];
    return typeof v === 'string' ? v : undefined;
}
function flagBool(parsed, name) {
    const v = parsed.flags[name];
    return typeof v === 'boolean' ? v : undefined;
}
// ============================================================================
// MAIN
// ============================================================================
async function main() {
    const spec = (0, args_1.findCommand)(command);
    if (spec) {
        const parsed = parseCommand(spec);
        if (!parsed)
            return;
        await runCommand(spec.name, parsed);
        return;
    }
    switch (command) {
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
        case 'help':
        case undefined: {
            const topic = command === 'help' ? (0, args_1.findCommand)(args[1]) : undefined;
            if (topic)
                console.log((0, args_1.formatCommandHelp)(topic));
            else
                printHelp();
            break;
        }
        // ========================================================================
        // UNKNOWN COMMAND
        // ========================================================================
        default: {
            const names = args_1.COMMANDS.flatMap(c => [c.name, ...(c.aliases || [])]);
            const guess = (0, args_1.closest)(command, names);
            ui.error(`Unknown command '${command}'` + (guess ? ` — did you mean '${guess}'?` : ''), `Run 'axil --help' for available commands.`);
            process.exit(1);
        }
    }
}
async function runCommand(name, parsed) {
    const pos = parsed.positionals;
    switch (name) {
        case 'create': {
            const projectName = pos[0];
            // On a terminal a missing name is asked for (step 1 of the create flow)
            if (!projectName && (flagBool(parsed, 'yes') || !(0, prompts_1.canPrompt)())) {
                fail('Please provide a project name.', 'axil create <project-name> [--yes] [--template=<id>]');
            }
            if (pos.length > 1) {
                fail(`Unexpected argument '${pos[1]}'.`, 'axil create <project-name> [options]');
            }
            await (0, create_1.createProject)(projectName, {
                yes: flagBool(parsed, 'yes'),
                db: flagString(parsed, 'db'),
                auth: flagBool(parsed, 'auth'),
                ai: flagBool(parsed, 'ai'),
                ws: flagBool(parsed, 'ws'),
                queue: flagBool(parsed, 'queue'),
                skipInstall: flagBool(parsed, 'skip-install'),
                force: flagBool(parsed, 'force'),
                template: flagString(parsed, 'template')
            });
            break;
        }
        case 'generate': {
            const [kind, resource] = pos;
            if (kind === 'client') {
                if (resource) {
                    fail(`Unexpected argument '${resource}'.`, 'axil generate client [--from <url|file>] [--out <file>] [--name <Class>]');
                }
                await (0, generate_client_1.generateClient)({
                    from: flagString(parsed, 'from'),
                    out: flagString(parsed, 'out'),
                    name: flagString(parsed, 'name'),
                    force: flagBool(parsed, 'force')
                });
                break;
            }
            for (const only of ['from', 'out', 'name']) {
                if (parsed.flags[only] !== undefined)
                    fail(`--${only} only applies to 'axil generate client'.`);
            }
            if (!kind || !resource) {
                fail('Please provide what to generate and a name.', `axil generate <${generate_1.GENERATOR_KINDS.join('|')}> <name>  or  axil generate client`);
            }
            await (0, generate_1.generate)(kind, resource, {
                force: flagBool(parsed, 'force'),
                db: flagString(parsed, 'db'),
                auth: flagBool(parsed, 'auth')
            });
            break;
        }
        case 'migrate': {
            let action = pos[0] || 'up';
            const usage = 'axil migrate [up|down|status|check] [options]';
            if (flagBool(parsed, 'check')) {
                if (pos[0] && pos[0] !== 'check')
                    fail(`--check cannot be combined with '${pos[0]}'.`, usage);
                action = 'check';
            }
            if (!migrate_1.MIGRATE_ACTIONS.includes(action)) {
                fail(`Unknown migrate action '${action}'.`, usage);
            }
            if (pos.length > 1)
                fail(`Unexpected argument '${pos[1]}'.`, usage);
            if (action !== 'check') {
                for (const only of ['all', 'json']) {
                    if (parsed.flags[only] !== undefined)
                        fail(`--${only} only applies to 'axil migrate --check'.`, usage);
                }
            }
            if (action !== 'up' && parsed.flags.safety !== undefined) {
                fail("--safety only applies to 'axil migrate up'.", usage);
            }
            const result = await (0, migrate_1.migrate)(action, {
                dir: flagString(parsed, 'dir'),
                safety: flagString(parsed, 'safety'),
                all: flagBool(parsed, 'all'),
                json: flagBool(parsed, 'json'),
                largeTables: flagString(parsed, 'large-table')
            });
            if (result.exitCode !== 0)
                process.exitCode = result.exitCode;
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
        case 'install': {
            await (0, install_1.installPackages)(pos, flagBool(parsed, 'dev') === true);
            break;
        }
        case 'test': {
            await (0, test_1.runTests)(pos[0]);
            break;
        }
        case 'verify': {
            if (pos.length > 1) {
                fail(`Unexpected argument '${pos[1]}'.`, 'axil verify [pattern] [--static] [--json] [--strict]');
            }
            await (0, verify_1.verify)({
                pattern: pos[0],
                static: flagBool(parsed, 'static'),
                json: flagBool(parsed, 'json'),
                strict: flagBool(parsed, 'strict')
            });
            break;
        }
        case 'deploy': {
            await (0, deploy_1.deploy)({
                port: flagString(parsed, 'port'),
                replicas: flagString(parsed, 'replicas'),
                force: flagBool(parsed, 'force')
            });
            break;
        }
        case 'doctor': {
            await (0, doctor_1.runDoctor)();
            break;
        }
        case 'capacity': {
            await (0, capacity_1.capacity)({
                url: flagString(parsed, 'url'),
                serverWorkers: flagString(parsed, 'server-workers'),
                duration: flagString(parsed, 'duration'),
                connections: flagString(parsed, 'connections'),
                init: flagBool(parsed, 'init'),
                force: flagBool(parsed, 'force'),
                json: flagBool(parsed, 'json')
            });
            break;
        }
        // ========================================================================
        // DECORATOR
        // ========================================================================
        case 'decorator': {
            const subcommand = pos[0];
            if (!subcommand) {
                printDecoratorHelp();
                break;
            }
            // Accept both --category=<cat> and --category <cat>
            const category = flagString(parsed, 'category');
            const subArgs = [
                ...pos.slice(1),
                ...(category !== undefined ? [`--category=${category}`] : [])
            ];
            await (0, decorator_1.runDecorator)(subcommand, subArgs);
            break;
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
const HELP_GROUPS = [
    { title: 'Project', commands: [
            ['create', 'create [name]'],
            ['generate', 'generate <kind> <name>'],
            ['generate', 'generate client --from <url>', 'Generate a typed API client from an OpenAPI document'],
            ['install', 'install [packages…]']
        ] },
    { title: 'Develop', commands: [['run', 'run'], ['test', 'test [pattern]'], ['doctor', 'doctor']] },
    { title: 'Database', commands: [
            ['migrate', 'migrate [up|down|status]'],
            ['migrate', 'migrate --check', 'Check pending migrations for locking and breaking changes']
        ] },
    { title: 'Ship', commands: [['build', 'build'], ['capacity', 'capacity'], ['deploy', 'deploy']] },
    { title: 'Inspect', commands: [['decorator', 'decorator <sub>'], ['verify', 'verify [pattern]']] }
];
function printHelp() {
    ui.banner(CLI_VERSION, CLI_TAGLINE);
    ui.line();
    // Template ids wrapped to the card width
    const idLines = [];
    for (const id of templates_1.TEMPLATES.map(t => t.id)) {
        const last = idLines.length - 1;
        if (last >= 0 && idLines[last].length + id.length + 3 <= 66)
            idLines[last] += ` ${ui.sym.dot} ${id}`;
        else
            idLines.push(id);
    }
    ui.card('Start a project', [
        `${ui.muted('$')} ${ui.cmd('axil create')}                     ${ui.muted('browse templates, space to pick')}`,
        `${ui.muted('$')} ${ui.cmd('axil create my-api -t rest-api')}  ${ui.muted('or name one directly')}`,
        '',
        ...idLines.map(l => ui.muted(l))
    ], { meta: `${templates_1.TEMPLATES.length} templates`, width: 74 });
    ui.section('Usage:');
    ui.line(`  ${ui.muted('$')} ${ui.cmd('axil <command> [options]')}`);
    const rows = [];
    for (const group of HELP_GROUPS) {
        rows.push(['']);
        rows.push([ui.badge(group.title.toUpperCase(), 'muted')]);
        for (const [name, label, summary] of group.commands) {
            const spec = (0, args_1.findCommand)(name);
            const alias = spec?.aliases?.length && !summary ? ui.muted(`  (alias: ${spec.aliases.join(', ')})`) : '';
            rows.push([`  ${ui.cmd(label)}`, (summary ?? spec?.summary ?? '') + alias]);
        }
    }
    ui.table(rows, { indent: 2, gap: 3 });
    ui.section('Options:');
    ui.table([
        [ui.cmd('-h, --help'), 'Show help  ' + ui.muted('(after a command: that command\'s help)')],
        [ui.cmd('-v, --version'), 'Show the CLI version']
    ], { indent: 4 });
    ui.section('Quick start:');
    for (const example of [
        'axil create my-api --yes --db=sqlite',
        'cd my-api && axil run',
        'axil capacity',
        'axil generate module products',
        'axil migrate status',
        'axil decorator search cache'
    ])
        ui.line(`  ${ui.muted('$')} ${example}`);
    ui.line();
    ui.line(ui.muted(`Run ${ui.cmd('axil <command> --help')} for a command's options.  ${ui.sym.dot}  ${CLI_AUTHOR}`));
    ui.line();
}
function printDecoratorHelp() {
    ui.title('decorator', 'Inspect AxilJS semantic decorators');
    ui.line(ui.c.bold('Usage:'));
    ui.line(`  ${ui.muted('$')} ${ui.cmd('axil decorator <subcommand> [options]')}`);
    ui.section('Subcommands:');
    ui.table([
        [ui.cmd('list'), 'List all registered decorators'],
        [ui.cmd('list --category=<cat>'), 'Filter by category (HTTP, Security, Data, …)'],
        [ui.cmd('info <name>'), 'Show full documentation for a decorator'],
        [ui.cmd('search <query>'), 'Search decorators by keyword'],
        [ui.cmd('check <file>'), 'Validate decorator composition in a TypeScript file'],
        [ui.cmd('graph'), 'Emit the metadata dependency graph as JSON'],
        [ui.cmd('categories'), 'List all decorator categories']
    ], { indent: 4 });
    ui.section('Examples:');
    for (const example of [
        'axil decorator list --category=Reliability',
        'axil decorator info tCacheStampede',
        'axil decorator search "rate limit"',
        'axil decorator check src/controllers/user.controller.ts'
    ])
        ui.line(`  ${ui.muted('$')} ${example}`);
    ui.line();
}
// ============================================================================
// ERROR HANDLING
// ============================================================================
main().catch(error => {
    // Ctrl+C / Esc in a prompt: it already printed "Cancelled"
    if (error instanceof Error && error.name === 'PromptCancelled')
        process.exit(130);
    const message = error instanceof Error
        ? error.message
        : String(error);
    ui.error(message);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map