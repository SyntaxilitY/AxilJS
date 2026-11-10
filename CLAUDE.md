# AxilJS

TypeScript backend framework published as `@axiljs/*` packages. npm-workspaces monorepo (`packages/*`, `examples/*`). Node ≥ 20 (developed on 24), TypeScript 7, CommonJS output (`module: Node16`), `experimentalDecorators` on.

## Commands

```bash
npm ci                                              # install (lockfile is stale on versions but installs fine)
bash .claude/skills/axiljs-verify/verify.sh [pkg…]  # type-check (no emit) + tests; use this, not `npm run build`
powershell -ExecutionPolicy Bypass -File .claude\skills\axiljs-verify\verify.ps1 [pkg…]   # same, from PowerShell
bash .claude/skills/axiljs-decorator/check-catalog.sh   # decorator package ↔ CLI catalog drift
cd packages/<pkg> && npx vitest run                 # every package has a vitest suite in tests/
npm run build:<pkg> / npm run build:all             # REWRITES the committed dist/; only when asked
```

## Repo gotchas

- **`dist/` is committed** (despite `dist*` in .gitignore). Packages resolve each other through `node_modules/@axiljs/<pkg>` → `packages/<pkg>/dist`. A change to package A's public types is invisible to package B's type-check until A is rebuilt. Don't rebuild unless asked; say so instead.
- **Stale `.js`/`.d.ts`/`.map` files are committed inside most `packages/*/src/`.** They are old build output, not sources. Edit only the `.ts` files; never "fix" the `.js` copies.
- Code style: every package uses semicolons **except `decorator` and `cli`**, which don't. Match the file you're in; don't reformat.
- House style: zero third-party runtime deps (only `core` → `syntaxility-api-response-manager`, `studio` → `qrcode`; DB drivers `pg`/`mysql2`/`better-sqlite3` are optional peers loaded at runtime). Use `node:` built-ins.
- `build:all` in root package.json is dependency-ordered. A new package must be inserted after its deps.
- Package versions move in lockstep (root `version`); `cli` is currently one patch ahead.
- Throwaway `npx tsx` scripts go in the session scratchpad with a `tsconfig.json` that sets `experimentalDecorators: true`. Without it esbuild compiles TC39 decorators and metadata silently disappears.

## Packages (dependency order)

| Package | What it is | Key exports |
|---|---|---|
| `common` | Types + error classes only | `axilRequest`/`axilResponse`, `MiddlewareFn`, `axilError` + `NotFoundError`/`BadRequestError`/`UnauthorizedError`/`ForbiddenError`/`ValidationError`(422)/`InternalError` |
| `config` | .env loading + typed config | `loadEnv`, `defineConfig(schema)` |
| `security` | HTTP hardening middleware | `helmet`, `rateLimit` (per-instance store), `csrf` (double-submit), `sanitize` |
| `auth` | JWT (HS256, node:crypto), RBAC, scrypt passwords | `JWT`, `authenticate`, `getUser`, `requireRole`/`requirePermission`/`requireOwnership`, `hashPassword`/`verifyPassword` |
| `validation` | Zod-like schema builder | `v.string/number/boolean/array/object/enum`, `.optional/.nullable/.default/.custom`, `validate({body,params,query})` |
| `core` | node:http server, trie router, middleware chain, response envelope | `Application`, `Router`, `cors`, `serveStatic`, `createSSE`, `bodyParser`; re-exports `common` |
| `orm` | SQLite/Postgres/MySQL; Active Record + repository; migrations | `createConnection`, `BaseModel`, `BaseRepository`, `@Entity/@Column/@PrimaryKey…`, `Schema`, `MigrationRunner`, `Transaction` |
| `testing` | Jest-like runner + HTTP test client | `describe/it/expect`, `runTests`, `createTestClient(app)` |
| `events` | In-process async pub/sub with `*` wildcards | `EventBus`, `getGlobalEventBus`, `@OnEvent`, `registerEventHandlers` |
| `websocket` | Dependency-free RFC 6455 server with rooms | `WSServer`, `WSClient`, `parseFrame/buildFrame` |
| `queue` | In-memory job queue + 5-field cron scheduler | `Queue`, `Scheduler`, `createJob` |
| `circuit` | Circuit breaker, retry, timeout | `CircuitBreaker`, `retry`, `withTimeout` |
| `observability` | Logger, Prometheus metrics, W3C/B3 tracing, health | `Logger`, `MetricsRegistry`, `Tracer`, `HealthChecker`, `observabilityMiddleware`, `metricsHandler` |
| `ai` | SDK-free LLM providers, RAG, agents, MCP client | `OpenAIProvider`/`AnthropicProvider`/`GeminiProvider`/`OllamaProvider`, `VectorStore`, `RAGPipeline`, `Agent`, `createTool`, `MCPClient`, `aiChat`/`aiChatStream` |
| `cloud` | Multi-tenancy, audit, flags, quotas, secrets, deploy manifests | `multiTenancy`, `auditLog`, `FeatureFlagManager`, `tenantRateLimiter`, `SecretsManager`, `QuotaManager`, `CloudCache`, `generateDeployment`, `createDashboard` |
| `memory` | Leak detection + heap monitoring | `MemoryMonitor`, `trackTimer/trackCache/trackEmitter`, `optimizer`, `memoryMiddleware` |
| `pm` | Experimental package manager (`Installer.extract` is still a stub) | `RegistryClient`, `LockFileManager`, `Installer` |
| `studio` | Local dev dashboard on app port + 1 (routes, DB browser, Postman/OpenAPI export) | `StudioServer` |
| `cli` | `axil` / `axiljs` binary | `create`, `run`, `build`, `install`/`i`, `test`, `deploy`, `doctor`, `decorator list/info/search/check/graph/categories` |
| `decorator` | 119 semantic `t*` decorators that only record metadata | `tHttp`, `tAuth`, `tRetry`, `tSaga`, … + `getMetadata`, `validateComposition`, `listDecorators` |

## Request pipeline (core)

`Application` → global middleware (built-in `requestLogger`, `bodyParser`: JSON/urlencoded/text, 1 MB) → router middleware → route middleware → handler. A thrown error or `next(err)` goes to 4-arg error middleware, then a default JSON error `{error:{code,message}}` (500 messages hidden in production). Handlers respond with envelope helpers: `res.success(data, msg)`, `res.created`, `res.paginated`, `res.badRequest`, … → `{status, code:'HTTP_200_OK', message, data}`. Route matching: static > `:param` > `*`. `app.mount(prefix, router)` strips the prefix before matching.

## CLI output

All `axil` terminal output goes through `packages/cli/src/ui.ts`; interactive input goes through `packages/cli/src/prompts.ts` (`select`, `multiselect`, `confirm`, `text`; they return defaults without a TTY and throw `PromptCancelled` on Ctrl+C).

- Look: gradient `▲ AXIL` banner + `badge()`s for help screens; a **rail** for command flows. `ui.title()` opens it (`┌`), helpers draw on it (`◇` success, `▲` warn, `●` info, `○` step, `◆` section/result, `│` lines), and `box()` / `failed()` / `error()` / `outro()` / process exit close it (`└`).
- Never write raw `\x1b[` codes elsewhere; `git grep -n 'x1b\[' -- 'packages/cli/src/*.ts'` should only hit `ui.ts` and `prompts.ts`.
- Third-party output that would break the rail (e.g. the ORM's migration logs) is captured and re-rendered: see `withOrmOutput` in `commands/migrate.ts`.
- Keep `axil decorator graph` pure JSON and `--version` as `@axiljs/cli vX.Y.Z`.
- Run from the repo without linking: `npm run axil -- <command>`.
- Snapshots: `backups/cli-2026-11-10/` (original), `backups/cli-2026-11-10-v2/` (first redesign, before the rail).

## Decorators

`packages/decorator/+REQUIREMENT.md` is the design spec. Names are `t`-prefixed; no `@Get/@Post` and no Nest-style `@Injectable/@Controller`. Every decorator also lives in `packages/cli/src/commands/decorator-catalog.ts`; use the `axiljs-decorator` skill when touching either.

## Project tooling in `.claude/`

- Skills: `axiljs-verify`, `axiljs-decorator`, `axiljs-new-package`, `axiljs-api-feature`
- Agents: `axiljs-package-reviewer` (bug audit + minimal fixes), `axiljs-test-writer` (vitest suites), `axiljs-docs-sync` (README ↔ exports drift)
