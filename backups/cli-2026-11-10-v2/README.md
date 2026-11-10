# @axiljs/cli

The official command-line interface for [AxilJS](https://github.com/SyntaxilitY/AxilJS).

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install -g @axiljs/cli
````

## Commands

### Project Commands

```bash
axil create <name>          # Create a new AxilJS project

axil generate <kind> <name> # Generate module/controller/service/entity/migration (alias: g)

axil migrate [up|down|status]
                            # Run database migrations (@axiljs/orm)

axil run                    # Start dev server with hot reload
axil run src/mvc/main.ts    # Start with a custom entry point

axil build                  # Compile TypeScript for production

axil test [pattern]         # Run test files

axil deploy                 # Generate Docker + Kubernetes files

axil install [package]      # Install an AxilJS package

axil doctor                 # Diagnose project issues
```

Every command accepts `--help` / `-h` and prints its own usage instead of
running (`axil run --help` does not start the server). Unknown flags fail with
a suggestion, e.g. `Unknown flag '--forse'. Did you mean --force?`.

### `axil create`

```bash
axil create my-api                                   # interactive prompts (TTY)
axil create my-api --yes                             # accept all defaults
axil create my-api --db=sqlite --auth --ws --skip-install
axil create my-api -y --db postgres --no-auth --queue --force
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--yes`, `-y` | off | Use defaults for every option not given as a flag; no prompts |
| `--db=<none\|sqlite\|postgres\|mysql>` | `none` | Database driver |
| `--auth` / `--no-auth` | on | JWT + RBAC |
| `--ai` | off | AI platform |
| `--ws` | off | WebSocket support |
| `--queue` | off | Queue and Scheduler |
| `--skip-install` | off | Don't run `npm install` |
| `--force` | off | Create into an existing **non-empty** directory (an empty one is always allowed) |

Prompts appear only for options without a flag, and only when stdin is a TTY.
In CI/pipes (no TTY) the defaults are used instead of waiting for input.

Database projects get an `npm run migrate` script (`axil migrate`), and every
project gets `@axiljs/testing` as a devDependency so `npm test` (`axil test`)
works out of the box.

### `axil generate` (alias `axil g`)

Uses the same templates and layout as `axil create`:

| Kind | Files |
| --- | --- |
| `module <name>` | `src/modules/<name>/controllers/<name>.controller.ts`, `src/modules/<name>/services/<name>.service.ts`, plus `src/migrations/<NNN>_create_<table>.ts` in database projects |
| `controller <name>` | `src/modules/<name>/controllers/<name>.controller.ts` |
| `service <name>` | `src/modules/<name>/services/<name>.service.ts` |
| `entity <name>` | `src/modules/<name>/entities/<name>.entity.ts` (`@Entity` + `BaseModel`) |
| `migration <name>` | `src/migrations/<NNN>_<name>.ts` (next free number) |

The database driver and auth are detected from the project's `package.json`
(override with `--db=<driver>` / `--auth` / `--no-auth`). Existing files are
**never overwritten** — they are skipped with a warning unless `--force` is
given. The command prints every file it created and how to register the
controller in `src/main.ts`.

```bash
axil g module products
axil g migration add_price_to_products
```

### `axil migrate`

```bash
axil migrate            # apply pending migrations (same as `up`)
axil migrate status     # applied / pending
axil migrate down       # roll back the last batch
axil migrate --dir=dist/migrations
```

Runs `MigrationRunner` from the project's `@axiljs/orm`. `.env` in the project
directory is loaded first (variables already in the environment win). The
connection comes from the same variables the scaffolded `src/db/connection.ts`
uses:

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | `postgres://…` / `postgresql://…` / `mysql://…` |
| `DATABASE_FILENAME` | SQLite file (`DB_FILE` is accepted as an alias); relative to the project |
| `DB_DRIVER` | Optional override: `sqlite`, `postgres` or `mysql` |

Migrations are read from `src/migrations` (Node ≥ 22.18 loads the `.ts` files
directly via type stripping). If Node cannot load `.ts` files and
`dist/migrations` exists, the compiled migrations are used instead.

### `axil deploy`

```bash
axil deploy                              # port 3000, 3 replicas
axil deploy --port=8080 --replicas=2
axil deploy --force                      # no overwrite warnings; also replaces .dockerignore
```

Writes `deploy/Dockerfile`, `deploy/deployment.yaml`, `deploy/deploy.sh`
(existing files are overwritten with a warning, as before) and creates a
`.dockerignore` in the project root when one does not exist yet.

### `axil run`

Reads `PORT` from `.env` (quoted values such as `PORT="4000"` are unquoted)
and starts Studio on `PORT + 1`. If the first compile fails, Studio starts
as soon as a later compile succeeds.

### Decorator Commands

AxilJS provides a semantic decorator system with a comprehensive decorator catalog.

```bash
axil decorator list         # List all available decorators

axil decorator list --category Security
                            # List decorators in a category

axil decorator info <name>  # Show detailed decorator information

axil decorator search <query>
                            # Search decorators by name or description

axil decorator check <file>
                            # Check decorator composition and conflicts

axil decorator graph <file>
                            # Generate decorator metadata graph

axil decorator categories   # Show all decorator categories
```

### CLI Information

```bash
axil --version              # Show CLI version

axil --help                 # Show available commands
```

## Quick Start

Create a new AxilJS project:

```bash
axil create my-api

cd my-api

npm install

axil run
```

Non-interactive (CI):

```bash
axil create my-api --yes --db=sqlite --skip-install
```

Your development server will start with hot reload enabled.

## Decorator Catalog

The decorator catalog organizes AxilJS decorators into semantic categories, including:

* HTTP
* Security
* Data
* Reliability
* Concurrency
* Distributed
* Messaging
* Caching
* Observability
* Compliance
* Runtime
* AI
* Validation
* Contract
* Execution
* Workflow

You can inspect the catalog directly from the CLI:

```bash
axil decorator categories
```

List all decorators:

```bash
axil decorator list
```

Inspect a specific decorator:

```bash
axil decorator info tAuth
```

Search the catalog:

```bash
axil decorator search authentication
```

Check decorator composition:

```bash
axil decorator check src/controllers/user.controller.ts
```

Generate a decorator metadata graph:

```bash
axil decorator graph src/controllers/user.controller.ts
```

## Documentation

Full documentation:

[AxilJS Documentation](https://github.com/SyntaxilitY/AxilJS)

[AxilJS Website](https://www.axiljs.dev/)

## License

See the [LICENSE](https://github.com/SyntaxilitY/AxilJS/blob/main/LICENSE) file for license information.
