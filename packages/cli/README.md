<p align="center">
  <img src="https://raw.githubusercontent.com/SyntaxilitY/AxilJS-Backend-Ecosystem/main/assets/logo-mark-128.png" alt="AxilJS logo" width="64" height="64">
</p>

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
axil create [name]          # Create a project (interactive template picker)
axil capacity               # Check capacity against axil.scaling.json

axil generate <kind> <name> # Generate module/controller/service/entity/migration (alias: g)
axil generate client        # Generate a typed API client from an OpenAPI document

axil migrate [up|down|status]
                            # Run database migrations (@axiljs/orm)
axil migrate --check        # Check pending migrations for locking and breaking changes

axil run                    # Start dev server with hot reload
axil run src/mvc/main.ts    # Start with a custom entry point

axil build                  # Compile TypeScript for production

axil test [pattern]         # Run test files

axil verify [pattern]       # Check decorator enforcement, then run tests in intent-enforce mode

axil deploy                 # Generate Docker + Kubernetes files

axil install [package]      # Install an AxilJS package

axil doctor                 # Diagnose project issues
```

Every command accepts `--help` / `-h` and prints its own usage instead of
running (`axil run --help` does not start the server). Unknown flags fail with
a suggestion, e.g. `Unknown flag '--forse'. Did you mean --force?`.

### `axil create`

```bash
axil create                                          # interactive: name → template → confirm
axil create my-api                                   # interactive, name given
axil create my-api --template rest-api               # straight from a template (-t)
axil create my-api --yes                             # accept all defaults
axil create my-api --db=sqlite --auth --ws --skip-install
axil create my-api -y --db postgres --no-auth --queue --force
```

On a terminal, `axil create` walks through four steps:

```
┌  axil create  AxilJS v0.3.2
│
◇  Project name
│  my-api
│
◆  Pick a template  2/4   10 templates
│   Start   APIs   Realtime   Background   AI   Production   Custom
│          ──────
│  ❯ REST API          CRUD API with SQLite, JWT auth, pagination
│    SaaS API          Multi-tenant API: flags, quotas, audit log
│
│   ╭─ REST API ──────────────────────────────── port 3001 ─╮
│   │ ✔ ORM + migrations on SQLite                          │
│   │ ✔ Register / login with JWT and scrypt                │
│   ╰───────────────────────────────────────────────────────╯
└  ↑↓ move · ←→ category · space/enter select · / search
```

| Key | In the template picker |
| --- | --- |
| `↑` `↓` | Move; flows into the next/previous category at the ends |
| `←` `→` / `tab` | Jump between categories |
| `space` / `enter` | Pick the highlighted template |
| `/` | Search all templates by name, description, packages; `esc` leaves search |
| `esc` / `ctrl+c` | Cancel |

**Custom** (last tab) asks for a database and features instead of using a template.

| Template | Category | What you get |
| --- | --- | --- |
| `minimal` | Start | Routes, validation, CORS and tests; nothing else |
| `rest-api` | APIs | CRUD on SQLite (ORM + migrations), JWT auth, pagination, filtering |
| `saas-api` | APIs | Multi-tenant: tenant isolation, roles, feature flags, quotas, audit log, shared runtime state |
| `realtime-chat` | Realtime | WebSocket rooms, presence, history, JWT on connect, browser demo |
| `live-dashboard` | Realtime | SSE live metrics, Prometheus `/metrics`, health checks, HTML dashboard |
| `background-jobs` | Background | Queue workers with retries, job status API, cron scheduler, events |
| `webhook-receiver` | Background | HMAC-verified webhooks, replay protection, idempotency, async processing |
| `ai-assistant` | AI | Chat + streaming, RAG over your documents, tool-using agent, any provider |
| `microservice` | Production | Circuit breaker, retries, timeouts, tracing, metrics, readiness |
| `high-scale-api` | Production | Cluster mode, `axil.scaling.json`, request context, redaction, audit, shared runtime state |

Every template's generated project type-checks under `strict` and ships with its own passing tests (`npm test`).

`saas-api` and `high-scale-api` are set up for several instances: on startup they open `DATABASE_URL` (a SQLite file by default; PostgreSQL for several servers) and install `@axiljs/stores`' SQL stores into `@axiljs/runtime` with `useStores()`, then call `wireAll()`. `high-scale-api` also relays cluster events from the primary (`onPrimary`). Both load Studio's intent endpoint only when `NODE_ENV` is not `production`, via a dynamic `require`, so a production install without dev dependencies works. Their READMEs have a *Running several instances* section.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--template`, `-t` | — | Start from a template (skips the picker) |
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

### Generate a typed client

`axil generate client` turns an OpenAPI 3.x document into one
dependency-free TypeScript file for frontends, other services and tests.

```bash
axil generate client                                   # from http://localhost:<PORT>/openapi.json
axil generate client --from ./openapi.json
axil g client --from https://api.example.com/openapi.json --out src/clients/billing.ts --name BillingClient
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--from <url\|file>` | `http://localhost:<PORT>/openapi.json` (`PORT` from `.env`, else 3000) | An http(s) URL (10 s timeout) or a local JSON file |
| `--out <file>` | `src/api-client.ts` | Output file |
| `--name <Class>` | `ApiClient` | Client class name; the factory is `create<Class>` |
| `--force` | | Replace an output file that was not generated by axil |

The generated file contains:

- a type for every `components.schemas` entry, and `<Operation>Params`,
  `Query`, `Headers`, `Body`, `Response` and `Input` types per operation;
- `ApiError` (`status`, `code`, `message`, `body`), thrown for every non-2xx
  response. `code` and `message` are read from `{ error: { code, message } }`
  or an envelope `{ code, message }`;
- a client class with one method per `operationId` (derived from the method and
  path when missing). Each method takes `{ params, query, headers, body }` as the
  operation needs and returns `Promise<ResponseType>`, the documented 2xx body
  (for AxilJS, the `{ status, code, message, data }` envelope);
- `create<Class>({ baseUrl, token, fetch, headers })`. `token` is a string or a
  (possibly async) function, sent as `Authorization: Bearer` on operations
  that declare `security`. `fetch` defaults to `globalThis.fetch`.

```typescript
import { createApiClient, ApiError } from './api-client.js'

const api = createApiClient({ baseUrl: 'https://api.example.com', token: () => session.token })

try {
  const { data } = await api.getProduct({ params: { id: 42 } })
} catch (error) {
  if (error instanceof ApiError && error.status === 404) { /* ... */ }
}
```

Schema mapping: `required` → required properties, arrays and tuples
(`prefixItems`), `enum` / `const` → literal unions, `type: [..., "null"]` and
`nullable` → `| null`, `oneOf` / `anyOf` → unions, `allOf` → intersections,
`$ref` → named types, `additionalProperties` → `Record` or an index signature,
anything else → `unknown`.

The file starts with a "generated by axil, do not edit" header (source and
timestamp) and is regenerated in place; types and methods are sorted, so diffs
show only real API changes. It compiles under `tsc --strict` and needs neither
DOM nor Node typings (ES2017+ `lib`). Not supported: YAML documents (convert to
JSON), external `$ref`s, cookie parameters, and multipart uploads (non-JSON
bodies are sent as strings).

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

### Migration safety

Some schema changes are instant on a development database and take an
application down in production: they hold a lock while a table is scanned or
rewritten, or they remove a name that the deployed code still uses.
`axil migrate --check` reports these statements before they run, using the
`@axiljs/orm` migration safety analysis (see the ORM README, "Migration
safety", for the full rule list).

```bash
axil migrate --check                     # pending migrations (same as `axil migrate check`)
axil migrate --check --all               # every migration file
axil migrate --check --json > safety.json
axil migrate --check --large-table users=4200000 --large-table orders=18m
axil migrate up --safety=warn            # report findings, then migrate
axil migrate up --safety=block           # refuse to migrate on any error finding
```

The check loads each migration and runs its `up()` against a recording driver:
the SQL is captured, nothing is executed and no database file is created.
Findings are printed per migration file with their severity, rule id, table,
lock, explanation and the zero-downtime alternative, followed by a summary.

| Flag | Meaning |
| --- | --- |
| `--check` | Analyze pending migrations; never runs them |
| `--all` | With `--check`: analyze every migration, not only pending ones |
| `--json` | With `--check`: print only a JSON report (`ok`, `driver`, `scope`, `offline`, `counts`, `migrations[].findings[]`) |
| `--safety=off\|warn\|block` | With `up`: run the check first. `warn` prints the findings and migrates; `block` runs nothing while an `error` finding remains |
| `--large-table <table>=<rows>` | Approximate row count, repeatable (`k`, `m`, `b` suffixes allowed). Lock-duration findings on tables above 1,000,000 rows are escalated one level |

**Exit codes.** `--check` exits with `1` when any finding is an `error` and
`0` otherwise (warnings and info do not fail), so it can gate a CI pipeline.
`up --safety=block` exits with `1` when it refuses to run.

**Pending without a database.** "Pending" is determined from the
`_migrations` table. When the database is unreachable, the SQLite file does not
exist yet, or `DB_DRIVER` is set without `DATABASE_URL`, every migration is
treated as pending. In CI, `DB_DRIVER=postgres axil migrate --check` therefore
analyzes all migrations with PostgreSQL rules without a database.

**Project defaults.** `up` keeps `safety` off unless configured. A project can
opt in, and record table sizes, in `package.json`; command-line flags take
precedence:

```json
{
  "axil": {
    "migrationSafety": "warn",
    "migrationTableSizes": { "users": 4200000, "orders": 18000000 }
  }
}
```

**Intended changes.** Mark a statement that is deliberate with a comment naming
the rule, and it is no longer reported:

```sql
-- axil:allow drop-column
ALTER TABLE users DROP COLUMN legacy_code;
```

A PostgreSQL `CREATE INDEX CONCURRENTLY` must run outside a transaction:
export `transaction = false` from that migration.

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

### Verify Command

`axil verify` answers "does my code keep the promises its decorators declare?".

```bash
axil verify                 # Static scan + tests with AXIL_INTENT_MODE=enforce
axil verify payments        # Only test files matching "payments"
axil verify --static        # Scan only, do not run the tests
axil verify --strict        # Also fail on unenforced behavioural decorators / unwired classes
axil verify --json          # Pure JSON report on stdout (for CI)
```

1. **Static scan** of `src/**/*.ts` (tests and `.d.ts` excluded; comments and
   strings ignored). Every `t*` decorator is listed with its `file:line`
   locations and classified as **enforced at runtime** (an `@axiljs/runtime`
   interceptor exists) or **metadata only**. The enforced set is read from the
   project's installed `@axiljs/runtime` (`enforcedDecorators()`), or from a
   bundled list matching runtime 0.3.4+ when it is not installed. Metadata-only
   decorators whose catalog category promises call-time behaviour (Security,
   Reliability, Concurrency, Caching, Data, …) are called out as *not enforced*.
2. **Wiring (heuristic)**: classes that use enforced decorators but are never
   reached by `wire(Class)`, `wire(new Class())`, `wire(this)` or `wireAll()`
   are flagged; interceptors only run on wired classes. A `wire(instance)`
   through a variable is not visible to this check.
3. **Tests**: runs the suite exactly like `axil test [pattern]`, with
   `AXIL_INTENT_MODE=enforce` so a broken contract throws `IntentViolationError`.
   Failures caused by one are listed in an *Intent violations* section
   (target, decorator, detail, test name).

Exit code is 1 when the tests fail, and with `--strict` also when a
not-enforced behavioural decorator is used or a class looks unwired. The
`--json` report has `project`, `enforced`, `files`, `summary`, `decorators`,
`unenforced`, `wiring`, `tests` (`null` with `--static`), `strict` and `ok`.

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
