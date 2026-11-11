/**
 * Template: saas-api
 *
 * A multi-tenant SaaS backend on @axiljs/cloud: tenants resolved from a header
 * or subdomain, data partitioned per tenant, JWT + role/permission checks,
 * plan-gated feature flags, per-plan quotas, a per-tenant rate limit and an
 * audit trail of sensitive actions. Persistence is in memory to keep the
 * focus on the tenancy model; the stores are small classes to swap out.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const saasApiTemplate: ProjectTemplate = {
  id:       'saas-api',
  title:    'SaaS API',
  summary:  'Multi-tenant API: plans, flags, quotas, RBAC, audit log',
  category: 'APIs',
  highlights: [
    'Tenant from X-Tenant-ID header or subdomain',
    'Per-tenant data, JWT roles and permissions',
    'Plan-gated feature flags, quotas, rate limits',
    'Audit trail of sensitive actions on the event bus',
    'Tests prove isolation, 403 flags and 429 quotas'
  ],
  packages: ['@axiljs/cloud', '@axiljs/auth', '@axiljs/core', '@axiljs/events', '@axiljs/validation', '@axiljs/config', '@axiljs/testing'],
  port:     3005,

  dependencies: ctx => ({
    '@axiljs/auth':       ctx.axilRange,
    '@axiljs/cloud':      ctx.axilRange,
    '@axiljs/config':     ctx.axilRange,
    '@axiljs/core':       ctx.axilRange,
    '@axiljs/events':     ctx.axilRange,
    '@axiljs/validation': ctx.axilRange
  }),

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

A multi-tenant SaaS backend built on [AxilJS](https://github.com/SyntaxilitY/AxilJS), created with
\`axil create ${ctx.name} --template saas-api\`.

Tenants (companies) share one deployment but never each other's data. Each tenant has a **plan**
that decides its **features** and **quotas**, users with **roles**, and an **audit trail**.

- **@axiljs/cloud**
  - \`multiTenancy()\` resolves the tenant from the \`X-Tenant-ID\` header (or the subdomain) and rejects unknown or suspended tenants
  - \`FeatureFlagManager\`: one flag per plan feature, whitelisting the tenants whose plan includes it
  - \`QuotaManager\`: per-plan limits on projects, users and daily API calls (429 \`QUOTA_EXCEEDED\`)
  - \`tenantRateLimiter()\`: N requests per minute per tenant (429 \`RATE_LIMIT_EXCEEDED\`)
  - \`auditLog()\` / \`auditMiddleware()\`: audit events on the global event bus
- **@axiljs/auth**: scrypt passwords, JWTs carrying \`tenantId\`, \`role\` and \`permissions\`; \`requirePermission\` / \`requireRole\`
- **@axiljs/events**: the audit trail is a bus subscriber; add your own to persist events
- **@axiljs/validation**, **@axiljs/config**, **@axiljs/core**: validated bodies, typed \`.env\`, routers and one JSON error shape
- **@axiljs/testing**: tests that prove isolation, plan gating, quotas, rate limits and auditing

Storage is in memory (\`src/data/*\`) so the tenancy model stays in focus; every store method takes
the tenant id first, so swapping in a database keeps the isolation rule in one place.

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
# edit .env: set JWT_SECRET to 32+ random characters
npm run dev                 # watch mode, http://localhost:3005
\`\`\`

Production build:

\`\`\`bash
npm run build
npm start
\`\`\`

Seeded tenants (\`src/data/tenants.ts\`):

| Tenant    | Plan | Status    | Try it for                                   |
|-----------|------|-----------|----------------------------------------------|
| \`acme\`    | pro  | active    | analytics enabled                            |
| \`globex\`  | free | active    | analytics refused (403), 3-project quota     |
| \`initech\` | free | suspended | every request refused (401)                  |

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

Each \`describe\` gets a fresh app (own tenants, users, quotas, flags) from \`useTestApp()\` in
\`src/testing/setup.ts\`. The tests show that:

- tenant B gets **404** for tenant A's project and an empty list; A's token sent with B's header gets **403**
- the free plan gets **403 FEATURE_NOT_IN_PLAN** on analytics, and an upgrade unlocks it
- the 4th project on the free plan gets **429 QUOTA_EXCEEDED**; deleting one frees the slot
- the 6th request in a minute with \`RATE_LIMIT_PER_MINUTE=5\` gets **429 RATE_LIMIT_EXCEEDED**, other tenants are unaffected
- sensitive actions emit audit events on the bus, and admins only see their own tenant's trail

## How a request is handled

\`\`\`
/api/*  multiTenancy        tenant from header/subdomain        401 unknown, malformed or suspended
        tenantRateLimiter   per-tenant requests per minute      429 RATE_LIMIT_EXCEEDED
        apiCallQuota        plan's daily api_calls              429 QUOTA_EXCEEDED
        authenticate        Bearer JWT (not on /api/auth)       401
        sameTenant          token tenant == resolved tenant     403 (and audited)
        requirePermission   e.g. projects:write                 403
        requireFeature      plan includes the feature           403 FEATURE_NOT_IN_PLAN
        handler             reads/writes via getTenantId(req)   404 for other tenants' ids
\`\`\`

## Endpoints

All \`/api\` routes need the tenant (\`X-Tenant-ID: acme\`); all but \`/api/auth/*\` need \`Authorization: Bearer <token>\`.

| Method | Path                     | Requires                        | Description                                           | Errors        |
|--------|--------------------------|---------------------------------|-------------------------------------------------------|---------------|
| GET    | \`/\`                      |                                 | Service info                                          |               |
| GET    | \`/health\`                |                                 | Liveness                                              |               |
| POST   | \`/api/auth/register\`     | tenant                          | First account of a tenant, becomes its admin          | 403, 422, 429 |
| POST   | \`/api/auth/login\`        | tenant                          | Token with tenantId, role, permissions                | 401, 422      |
| GET    | \`/api/projects\`          | \`projects:read\`                 | This tenant's projects                                | 401, 403      |
| POST   | \`/api/projects\`          | \`projects:write\`                | Create (projects quota)                               | 403, 422, 429 |
| GET    | \`/api/projects/:id\`      | \`projects:read\`                 | One project                                           | 404           |
| DELETE | \`/api/projects/:id\`      | \`projects:delete\` (admin)       | Delete, frees a quota slot, audited                   | 403, 404      |
| GET    | \`/api/tenant\`            | any member                      | Tenant, plan, enabled features, quota usage           |               |
| GET    | \`/api/tenant/members\`    | \`members:read\`                  | Members                                               | 403           |
| POST   | \`/api/tenant/members\`    | \`members:invite\` (admin)        | Invite a member/viewer/admin (users quota), audited   | 403, 409, 422, 429 |
| PUT    | \`/api/tenant/plan\`       | role \`admin\`                    | Change plan (stand-in for a billing webhook), audited | 403, 422      |
| GET    | \`/api/tenant/audit\`      | \`audit:read\` (admin)            | This tenant's audit events, newest first (\`?limit=\`)  | 403           |
| GET    | \`/api/tenant/analytics\`  | \`analytics:read\` + plan feature | Project and member stats (pro and enterprise)         | 403           |

### Roles

| Role     | Permissions                                                                 |
|----------|-----------------------------------------------------------------------------|
| \`admin\`  | \`projects:*\`, \`members:*\`, \`tenant:*\`, \`audit:read\`, \`analytics:read\`      |
| \`member\` | \`projects:read\`, \`projects:write\`, \`members:read\`, \`analytics:read\`        |
| \`viewer\` | \`projects:read\`, \`members:read\`, \`analytics:read\`                          |

### Plans

| Plan         | Features                     | Projects | Users | API calls / day |
|--------------|------------------------------|----------|-------|-----------------|
| \`free\`       |                              | 3        | 3     | 1,000           |
| \`pro\`        | \`analytics\`                  | 100      | 25    | 100,000         |
| \`enterprise\` | \`analytics\`, \`audit-export\`  | 10,000   | 1,000 | 1,000,000       |

Edit \`src/tenancy/plans.ts\`; flags and quotas follow on the next \`Entitlements.apply()\`.

### Errors

\`\`\`json
{ "error": { "code": "FEATURE_NOT_IN_PLAN", "message": "The free plan does not include \\"analytics\\". Upgrade to use it.", "details": { "feature": "analytics", "plan": "free" } } }
{ "error": { "code": "QUOTA_EXCEEDED", "message": "Quota exceeded: projects is limited to 3 on this plan", "details": { "metric": "projects", "limit": 3 } } }
{ "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Rate limit exceeded for tenant \\"globex\\".", "retryAfterMs": 41250 } }
{ "error": { "code": "FORBIDDEN", "message": "This token was issued for a different tenant" } }
\`\`\`

### Audit events

Every event is published as \`audit.log\` on the global \`@axiljs/events\` bus:

\`\`\`json
{ "action": "project.deleted", "actor": { "id": "6f1c...", "type": "user" }, "tenantId": "acme",
  "target": { "type": "project", "id": "2b9e..." }, "metadata": { "name": "Rocket skates" },
  "ip": "127.0.0.1", "success": true, "timestamp": "2026-01-01T12:00:00.000Z" }
\`\`\`

Recorded actions: \`tenant.bootstrapped\`, \`auth.login_failed\`, \`auth.cross_tenant_denied\`,
\`member.invited\`, \`tenant.plan_changed\`, \`project.deleted\`, \`quota.exceeded\`, plus one
\`METHOD /api/tenant/...\` event per request to the tenant admin routes (\`auditMiddleware\`).
To persist them, subscribe once at startup:

\`\`\`ts
import { getGlobalEventBus } from '@axiljs/events'
getGlobalEventBus().on('audit.log', async event => { await db.insert('audit_events', event.payload) })
\`\`\`

### curl

\`\`\`bash
# Bootstrap acme's admin and keep the token
TOKEN=$(curl -s -X POST http://localhost:3005/api/auth/register -H "X-Tenant-ID: acme" -H "Content-Type: application/json" \\
  -d '{"email":"admin@acme.test","name":"Admin","password":"correct-horse-battery"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

curl -X POST http://localhost:3005/api/projects -H "X-Tenant-ID: acme" -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"name":"Rocket skates"}'
curl http://localhost:3005/api/tenant           -H "X-Tenant-ID: acme" -H "Authorization: Bearer $TOKEN"
curl http://localhost:3005/api/tenant/analytics -H "X-Tenant-ID: acme" -H "Authorization: Bearer $TOKEN"
curl http://localhost:3005/api/tenant/audit     -H "X-Tenant-ID: acme" -H "Authorization: Bearer $TOKEN"
curl http://localhost:3005/api/projects         -H "X-Tenant-ID: globex" -H "Authorization: Bearer $TOKEN"   # 403
curl http://localhost:3005/api/projects         -H "X-Tenant-ID: initech"                                    # 401 suspended
\`\`\`

### PowerShell

\`curl\` is an alias for \`Invoke-WebRequest\` in Windows PowerShell, so use \`Invoke-RestMethod\` (or \`curl.exe\`):

\`\`\`powershell
$reg = Invoke-RestMethod http://localhost:3005/api/auth/register -Method Post -ContentType 'application/json' \`
  -Headers @{ 'X-Tenant-ID' = 'acme' } \`
  -Body (@{ email = 'admin@acme.test'; name = 'Admin'; password = 'correct-horse-battery' } | ConvertTo-Json)
$headers = @{ 'X-Tenant-ID' = 'acme'; Authorization = "Bearer $($reg.data.token)" }

Invoke-RestMethod http://localhost:3005/api/projects -Method Post -Headers $headers -ContentType 'application/json' \`
  -Body (@{ name = 'Rocket skates' } | ConvertTo-Json)
(Invoke-RestMethod http://localhost:3005/api/tenant -Headers $headers).data
\`\`\`

## Configuration

| Variable                | Default       | Description                                             |
|-------------------------|---------------|---------------------------------------------------------|
| \`PORT\`                  | \`3005\`        | HTTP port                                               |
| \`HOST\`                  | \`127.0.0.1\`   | Bind address (\`0.0.0.0\` in containers)                  |
| \`NODE_ENV\`              | \`development\` | \`development\`, \`production\` or \`test\`                   |
| \`JWT_SECRET\`            | (required)    | HS256 key, at least 32 characters                       |
| \`JWT_EXPIRES_IN\`        | \`1h\`          | Token lifetime: \`30m\`, \`1h\`, \`7d\`, ...                  |
| \`TENANT_STRATEGY\`       | \`header\`      | \`header\` or \`subdomain\` (\`acme.api.example.com\` -> \`acme\`) |
| \`TENANT_HEADER\`         | \`x-tenant-id\` | Header read by the \`header\` strategy                    |
| \`RATE_LIMIT_PER_MINUTE\` | \`120\`         | Requests per minute per tenant across \`/api\`            |
| \`AUDIT_LOG_TO_CONSOLE\`  | \`true\`        | Also print audit events to stdout                       |

On startup \`@axiljs/cloud\` may print a \`SecretsManager: no encryption key provided\` warning. It comes
from the package's built-in \`secrets\` instance, which this app does not use.

## Project structure

\`\`\`
src/
  main.ts                      entry point: config, services, listen, graceful shutdown
  app.ts                       createApp(config, services): tenant pipeline, routers, error handler
  config.ts                    typed config (defineConfig)
  services.ts                  createServices(): stores, JWT, quotas, flags, audit trail
  data/                        in-memory tenants, users, projects (partitioned by tenant)
  tenancy/plans.ts             plans -> features + quota limits
  tenancy/entitlements.ts      applies plans to FeatureFlagManager + QuotaManager
  tenancy/roles.ts             roles -> permissions, token claims
  tenancy/audit-trail.ts       bus subscriber keeping recent audit events; record() helper
  middleware/tenancy.ts        sameTenant, requireFeature, consumeQuota, apiCallQuota
  middleware/errors.ts         error handler + ConflictError, FeatureNotInPlanError, QuotaExceededError
  routes/auth.ts               /api/auth/register, /api/auth/login
  routes/projects.ts           /api/projects
  routes/tenant.ts             /api/tenant (members, plan, audit, analytics)
  lib/cloud.ts                 loads @axiljs/cloud's CommonJS build (see the comment inside)
  testing/setup.ts             useTestApp(): fresh app per describe()
  *.test.ts                    tenancy, plans/quotas/rate limit, audit tests
\`\`\`

## Next steps

- Persist tenants, users and projects: keep the method signatures in \`src/data/*\` and back them with
  \`@axiljs/orm\` (see the \`rest-api\` template: \`axil create my-api --template rest-api\`)
- Persist audit events: add an \`audit.log\` subscriber that writes to a table or append-only storage
- Drive \`PUT /api/tenant/plan\` from your billing provider's webhook instead of an admin call
- Different rate limits per plan: pass \`tenantRules\` to \`tenantRateLimiter()\` in \`src/app.ts\`
- Move quotas and rate-limit counters to a shared store before running several instances
`,

    '.env.example': `# Server
PORT=3005
HOST=127.0.0.1
NODE_ENV=development

# JWT signing key: at least 32 random characters. Generate one with
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=replace-me-with-at-least-32-random-characters
JWT_EXPIRES_IN=1h

# Tenant resolution: "header" (TENANT_HEADER) or "subdomain" (acme.api.example.com)
TENANT_STRATEGY=header
TENANT_HEADER=x-tenant-id

# Requests per minute per tenant across /api
RATE_LIMIT_PER_MINUTE=120

# Print audit events to stdout
AUDIT_LOG_TO_CONSOLE=true
`,

    'src/app.ts': `/**
 * Application factory.
 *
 * Request pipeline for every /api route:
 *
 *   multiTenancy        resolve the tenant (header or subdomain); 401 if unknown/suspended
 *   tenantRateLimiter   N requests per minute per tenant; 429 RATE_LIMIT_EXCEEDED
 *   apiCallQuota        daily api_calls quota of the tenant's plan; 429 QUOTA_EXCEEDED
 *   authenticate        JWT (per router; not on /api/auth)
 *   sameTenant          the token must belong to the resolved tenant; 403
 *   requirePermission   / requireRole / requireFeature per route
 *
 * Builds the app without listening, so tests can drive it directly.
 */

import { Application, Router } from '@axiljs/core'
import { multiTenancy, tenantRateLimiter } from './lib/cloud.js'
import type { Config } from './config.js'
import { errorHandler } from './middleware/errors.js'
import { apiCallQuota } from './middleware/tenancy.js'
import { authRoutes } from './routes/auth.js'
import { projectRoutes } from './routes/projects.js'
import { tenantRoutes } from './routes/tenant.js'
import { createServices } from './services.js'
import type { Services } from './services.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

export function createApp(config: Config, services: Services = createServices(config)): Application {
  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    logging: config.NODE_ENV !== 'test'
  })

  // One instance of each, shared by every tenant-scoped router
  const resolveTenant = multiTenancy({
    strategy:      config.TENANT_STRATEGY as 'header' | 'subdomain',
    headerName:    config.TENANT_HEADER,
    resolveTenant: id => services.tenants.get(id)
  })
  const rateLimit = tenantRateLimiter({
    defaultRule:  { max: config.RATE_LIMIT_PER_MINUTE, windowMs: 60_000 },
    // One budget per tenant across all endpoints (default: per tenant + method + path)
    keyExtractor: req => \`tenant:\${req.locals?.tenant?.id ?? 'anonymous'}\`
  })
  const apiCalls = apiCallQuota(services.quotas)

  const tenantScope = (router: Router): Router => router.use(resolveTenant).use(rateLimit).use(apiCalls)
  const logAudit    = config.AUDIT_LOG_TO_CONSOLE && config.NODE_ENV !== 'test'

  app.get('/', (_req, res) => {
    res.success({
      service: SERVICE,
      version: VERSION,
      tenancy: config.TENANT_STRATEGY === 'header' ? \`\${config.TENANT_HEADER} header\` : 'subdomain',
      endpoints: [
        'GET    /health',
        'POST   /api/auth/register',
        'POST   /api/auth/login',
        'GET    /api/projects',
        'POST   /api/projects',
        'GET    /api/projects/:id',
        'DELETE /api/projects/:id',
        'GET    /api/tenant',
        'GET    /api/tenant/members',
        'POST   /api/tenant/members',
        'PUT    /api/tenant/plan',
        'GET    /api/tenant/audit',
        'GET    /api/tenant/analytics'
      ]
    }, 'Service info')
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() })
  })

  app.mount('/api/auth', authRoutes(services, config.JWT_EXPIRES_IN, tenantScope))
  app.mount('/api/projects', projectRoutes(services, tenantScope))
  app.mount('/api/tenant', tenantRoutes(services, logAudit, tenantScope))

  app.use(errorHandler(config.NODE_ENV))

  return app
}
`,

    'src/audit.test.ts': `import { describe, it, expect, beforeAll, afterAll } from '@axiljs/testing'
import { getGlobalEventBus } from '@axiljs/events'
import type { AuditEvent } from '@axiljs/cloud'
import { useTestApp } from './testing/setup.js'

describe('audit log', () => {
  const t = useTestApp()
  let admin  = ''
  let member = ''
  let other  = ''

  // Listen on the bus like any external subscriber (database writer, SIEM, ...),
  // only while this suite runs
  const emitted: AuditEvent[] = []
  let unsubscribe = () => {}
  beforeAll(() => {
    unsubscribe = getGlobalEventBus().on<AuditEvent>('audit.log', e => { emitted.push(e.payload) }).unsubscribe
  })
  afterAll(() => unsubscribe())

  const actions = (tenantId: string) => emitted.filter(e => e.tenantId === tenantId).map(e => e.action)

  beforeAll(async () => {
    admin  = await t.bootstrap('acme')
    member = await t.invite('acme', admin, 'member@acme.test', 'member')
    other  = await t.bootstrap('globex')
  })

  it('emits an event when a tenant is bootstrapped and a member invited', () => {
    const bootstrapped = emitted.find(e => e.action === 'tenant.bootstrapped' && e.tenantId === 'acme')
    expect(bootstrapped?.actor.type).toBe('user')
    const invited = emitted.find(e => e.action === 'member.invited')
    expect(invited?.tenantId).toBe('acme')
    expect(invited?.actor.type).toBe('user')
    expect(invited?.metadata).toMatchObject({ email: 'member@acme.test', role: 'member' })
  })

  it('emits project.deleted with actor, target and tenant', async () => {
    const created = await t.client.post('/api/projects').set('x-tenant-id', 'acme').auth(member).send({ name: 'Doomed' })
    const id = created.body.data.id
    await t.client.delete(\`/api/projects/\${id}\`).set('x-tenant-id', 'acme').auth(admin)

    const event = emitted.find(e => e.action === 'project.deleted')
    expect(event).toBeDefined()
    expect(event?.tenantId).toBe('acme')
    expect(event?.target).toEqual({ type: 'project', id })
    expect(event?.success).toBe(true)
    expect(typeof event?.timestamp).toBe('string')
  })

  it('records failed logins as unsuccessful events', async () => {
    await t.client.post('/api/auth/login').set('x-tenant-id', 'acme').send({ email: 'member@acme.test', password: 'wrong-password' })
    const failed = emitted.find(e => e.action === 'auth.login_failed')
    expect(failed?.success).toBe(false)
    expect(failed?.actor.id).toBe('anonymous')
  })

  it('records plan changes and quota overruns', async () => {
    await t.client.put('/api/tenant/plan').set('x-tenant-id', 'globex').auth(other).send({ plan: 'enterprise' })
    const change = emitted.find(e => e.action === 'tenant.plan_changed')
    expect(change?.metadata).toEqual({ from: 'free', to: 'enterprise' })

    // Back to free (3 projects), then go over the limit
    await t.client.put('/api/tenant/plan').set('x-tenant-id', 'globex').auth(other).send({ plan: 'free' })
    for (let i = 0; i < 4; i++) {
      await t.client.post('/api/projects').set('x-tenant-id', 'globex').auth(other).send({ name: \`P\${i}\` })
    }
    const overrun = emitted.find(e => e.action === 'quota.exceeded' && e.tenantId === 'globex')
    expect(overrun?.metadata).toMatchObject({ metric: 'projects', limit: 3 })
  })

  it('shows admins their own tenant\\'s trail only, newest first', async () => {
    const res = await t.client.get('/api/tenant/audit?limit=50').set('x-tenant-id', 'acme').auth(admin)
    expect(res.status).toBe(200)
    const events = res.body.data as AuditEvent[]
    expect(events.length).toBeGreaterThan(0)
    expect(events.every(e => e.tenantId === 'acme')).toBe(true)
    expect(events.map(e => e.action)).toContain('project.deleted')
    expect(events.map(e => e.action)).not.toContain('tenant.plan_changed')
  })

  it('also records requests to /api/tenant through auditMiddleware', () => {
    expect(actions('acme')).toContain('POST /api/tenant/members')
  })

  it('records cross-tenant attempts in the targeted tenant trail', async () => {
    const res = await t.client.get('/api/projects').set('x-tenant-id', 'globex').auth(admin)
    expect(res.status).toBe(403)
    const denied = emitted.find(e => e.action === 'auth.cross_tenant_denied')
    expect(denied?.tenantId).toBe('globex')
    expect(denied?.success).toBe(false)
    expect(denied?.metadata).toMatchObject({ tokenTenant: 'acme' })
  })

  it('keeps the trail away from non-admins (403)', async () => {
    const res = await t.client.get('/api/tenant/audit').set('x-tenant-id', 'acme').auth(member)
    expect(res.status).toBe(403)
  })
})
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:                  { type: 'number', default: 3005, min: 0, max: 65535 },
    HOST:                  { type: 'string', default: '127.0.0.1' },
    NODE_ENV:              { type: 'string', default: 'development', enum: ['development', 'production', 'test'] },
    // HS256 signing key, at least 32 characters. No default on purpose.
    JWT_SECRET:            { type: 'string', required: true, description: 'at least 32 random characters' },
    JWT_EXPIRES_IN:        { type: 'string', default: '1h' },
    // How the tenant is identified: a header (X-Tenant-ID) or the subdomain (acme.api.example.com)
    TENANT_STRATEGY:       { type: 'string', default: 'header', enum: ['header', 'subdomain'] },
    TENANT_HEADER:         { type: 'string', default: 'x-tenant-id' },
    // Requests per minute per tenant, across all /api routes
    RATE_LIMIT_PER_MINUTE: { type: 'number', default: 120, min: 1 },
    // Print audit events to stdout (they are always kept in the in-memory trail)
    AUDIT_LOG_TO_CONSOLE:  { type: 'boolean', default: true }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/data/projects.ts': `/**
 * Projects, partitioned by tenant (in memory).
 *
 * Isolation lives here, not in the routes: get(tenantId, id) only searches
 * that tenant's partition, so another tenant's project id is simply "not found".
 */

import { randomUUID } from 'node:crypto'

export type ProjectStatus = 'active' | 'archived'

export interface Project {
  id:          string
  tenantId:    string
  name:        string
  description: string
  status:      ProjectStatus
  createdBy:   string
  createdAt:   string
}

export class ProjectStore {
  private byTenant = new Map<string, Map<string, Project>>()

  private partition(tenantId: string): Map<string, Project> {
    let projects = this.byTenant.get(tenantId)
    if (!projects) this.byTenant.set(tenantId, projects = new Map())
    return projects
  }

  list(tenantId: string): Project[] {
    return [...this.partition(tenantId).values()]
  }

  get(tenantId: string, id: string): Project | undefined {
    return this.partition(tenantId).get(id)
  }

  create(tenantId: string, data: Pick<Project, 'name' | 'description' | 'createdBy'>): Project {
    const project: Project = { id: randomUUID(), tenantId, status: 'active', createdAt: new Date().toISOString(), ...data }
    this.partition(tenantId).set(project.id, project)
    return project
  }

  delete(tenantId: string, id: string): boolean {
    return this.partition(tenantId).delete(id)
  }
}
`,

    'src/data/tenants.ts': `/**
 * Tenant registry (in memory, seeded at startup).
 *
 * In production this is a table or your billing system; multiTenancy() only
 * needs an async lookup by id, so swapping the storage changes nothing else.
 */

import type { Tenant, TenantPlan } from '@axiljs/cloud'

export const SEED_TENANTS: Tenant[] = [
  { id: 'acme',    name: 'Acme Corp',    status: 'active',    plan: 'pro' },
  { id: 'globex',  name: 'Globex',       status: 'active',    plan: 'free' },
  { id: 'initech', name: 'Initech',      status: 'suspended', plan: 'free' }
]

export class TenantStore {
  private tenants = new Map<string, Tenant>()

  constructor(seed: Tenant[] = SEED_TENANTS) {
    for (const tenant of seed) this.tenants.set(tenant.id, { ...tenant })
  }

  async get(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) ?? null
  }

  list(): Tenant[] {
    return [...this.tenants.values()]
  }

  setPlan(id: string, plan: TenantPlan): Tenant {
    const tenant = this.tenants.get(id)
    if (!tenant) throw new Error(\`Unknown tenant \${id}\`)
    tenant.plan = plan
    return tenant
  }
}
`,

    'src/data/users.ts': `/**
 * Users, partitioned by tenant (in memory).
 *
 * Every method takes the tenant id first: there is no way to look a user up
 * without saying which tenant you are in. The same email can exist in two
 * tenants as two unrelated accounts.
 */

import { randomUUID } from 'node:crypto'

export type Role = 'admin' | 'member' | 'viewer'

export interface User {
  id:           string
  tenantId:     string
  email:        string
  name:         string
  role:         Role
  passwordHash: string
  createdAt:    string
}

export class UserStore {
  private byTenant = new Map<string, Map<string, User>>()

  private partition(tenantId: string): Map<string, User> {
    let users = this.byTenant.get(tenantId)
    if (!users) this.byTenant.set(tenantId, users = new Map())
    return users
  }

  list(tenantId: string): User[] {
    return [...this.partition(tenantId).values()]
  }

  count(tenantId: string): number {
    return this.partition(tenantId).size
  }

  findByEmail(tenantId: string, email: string): User | undefined {
    return this.list(tenantId).find(u => u.email === email)
  }

  create(tenantId: string, data: Pick<User, 'email' | 'name' | 'role' | 'passwordHash'>): User {
    const user: User = { id: randomUUID(), tenantId, createdAt: new Date().toISOString(), ...data }
    this.partition(tenantId).set(user.id, user)
    return user
  }
}

/** Public shape: never expose the password hash. */
export function toUserDto(user: User) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt }
}
`,

    'src/lib/cloud.ts': `/**
 * @axiljs/cloud, loaded through require().
 *
 * The package's "import" export condition points at a dist/index.mjs that is
 * not shipped, so \`import { multiTenancy } from '@axiljs/cloud'\` type-checks
 * but fails at runtime in an ES module project. Its CommonJS build works, so
 * load that and re-export what the app uses. Types still come straight from
 * the package. Once the package is fixed, import from '@axiljs/cloud' directly
 * and delete this file.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cloud   = require('@axiljs/cloud') as typeof import('@axiljs/cloud')

export const {
  multiTenancy,
  getTenant,
  getTenantId,
  tenantRateLimiter,
  auditLog,
  auditMiddleware
} = cloud

export const FeatureFlagManager = cloud.FeatureFlagManager
export type FeatureFlagManager  = InstanceType<typeof FeatureFlagManager>

export const QuotaManager = cloud.QuotaManager
export type QuotaManager  = InstanceType<typeof QuotaManager>
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, build the services and the app, listen.
 */

import { loadEnv } from '@axiljs/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createServices } from './services.js'

loadEnv()

const config   = loadConfig()
const services = createServices(config)
const app      = createApp(config, services)

await app.listen()

console.log(\`Tenants: \${services.tenants.list().map(t => \`\${t.id} (\${t.plan}, \${t.status})\`).join(', ')}\`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    services.close()
    process.exit(0)
  })
}
`,

    'src/middleware/errors.ts': `/**
 * Error handler and the app's own error types.
 *
 * Every error becomes one JSON shape:
 *
 *   { "error": { "code": "QUOTA_EXCEEDED", "message": "...", "details": {...} } }
 *
 * (tenantRateLimiter answers 429 RATE_LIMIT_EXCEEDED itself, in the same shape.)
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'

export class ConflictError extends axilError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT')
  }
}

/** The tenant's plan does not include this feature. */
export class FeatureNotInPlanError extends axilError {
  constructor(feature: string, plan: string) {
    super(\`The \${plan} plan does not include "\${feature}". Upgrade to use it.\`, 403, 'FEATURE_NOT_IN_PLAN', { feature, plan })
  }
}

/** A plan quota (projects, users, API calls) is used up. */
export class QuotaExceededError extends axilError {
  constructor(metric: string, limit: number) {
    super(\`Quota exceeded: \${metric} is limited to \${limit} on this plan\`, 429, 'QUOTA_EXCEEDED', { metric, limit })
  }
}

export function errorHandler(env: string): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const known  = err instanceof axilError
    const status = known ? err.statusCode : 500

    if (status >= 500) console.error(\`[\${req.method} \${req.path}]\`, err)

    res.status(status).json({
      error: {
        code:    known ? err.code : 'INTERNAL_ERROR',
        message: status >= 500 && env === 'production' ? 'Internal server error' : err.message,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
`,

    'src/middleware/tenancy.ts': `/**
 * Tenant-aware middleware on top of @axiljs/cloud and @axiljs/auth.
 */

import { ForbiddenError } from '@axiljs/core'
import type { MiddlewareFn } from '@axiljs/core'
import { getUser } from '@axiljs/auth'
import type { QuotaMetric } from '@axiljs/cloud'
import { getTenant, getTenantId } from '../lib/cloud.js'
import type { QuotaManager } from '../lib/cloud.js'
import type { AuditTrail } from '../tenancy/audit-trail.js'
import type { Entitlements } from '../tenancy/entitlements.js'
import type { Feature } from '../tenancy/plans.js'
import type { TokenUser } from '../tenancy/roles.js'
import { FeatureNotInPlanError, QuotaExceededError } from './errors.js'

/** The signed-in user, typed. Use after authenticate(). */
export function currentUser(req: Parameters<MiddlewareFn>[0]): TokenUser {
  return getUser(req) as unknown as TokenUser
}

/**
 * A token is only valid for the tenant it was issued in. Without this check
 * an admin of tenant A could send "X-Tenant-ID: B" with their own token.
 * Attempts are audited in the targeted tenant's trail. Use after authenticate().
 */
export function sameTenant(audit: AuditTrail): MiddlewareFn {
  return (req, _res, next) => {
    const user = currentUser(req)
    if (user.tenantId !== getTenantId(req)) {
      audit.record(req, 'auth.cross_tenant_denied', {
        metadata: { tokenTenant: user.tenantId, path: req.path },
        success:  false,
        error:    'token issued for a different tenant'
      })
      return next(new ForbiddenError('This token was issued for a different tenant'))
    }
    next()
  }
}

/** 403 FEATURE_NOT_IN_PLAN unless the tenant's plan includes the feature. */
export function requireFeature(entitlements: Entitlements, feature: Feature): MiddlewareFn {
  return (req, _res, next) => {
    const tenant = getTenant(req)
    if (!entitlements.hasFeature(tenant.id, feature)) {
      return next(new FeatureNotInPlanError(feature, tenant.plan ?? 'free'))
    }
    next()
  }
}

/**
 * Consume \`amount\` of a tenant quota or throw 429 QUOTA_EXCEEDED.
 * A rejected request does not keep the units it asked for.
 */
export function consumeQuota(quotas: QuotaManager, tenantId: string, metric: QuotaMetric, amount = 1): void {
  if (quotas.increment(tenantId, metric, amount)) return
  quotas.increment(tenantId, metric, -amount)
  const limit = quotas.getUsage(tenantId).find(u => u.metric === metric)?.limit ?? 0
  throw new QuotaExceededError(metric, limit)
}

/** Count every /api request against the tenant's daily api_calls quota. */
export function apiCallQuota(quotas: QuotaManager): MiddlewareFn {
  return (req, _res, next) => {
    try {
      consumeQuota(quotas, getTenantId(req), 'api_calls')
      next()
    } catch (error) {
      next(error as Error)
    }
  }
}
`,

    'src/plans.test.ts': `import { describe, it, expect, beforeAll } from '@axiljs/testing'
import { useTestApp } from './testing/setup.js'

describe('feature flags per plan', () => {
  const t = useTestApp()
  let acme   = ''   // pro
  let globex = ''   // free

  beforeAll(async () => {
    acme   = await t.bootstrap('acme')
    globex = await t.bootstrap('globex')
  })

  it('serves analytics on the pro plan', async () => {
    const res = await t.client.get('/api/tenant/analytics').set('x-tenant-id', 'acme').auth(acme)
    expect(res.status).toBe(200)
    expect(res.body.data.members.total).toBe(1)
  })

  it('refuses analytics on the free plan (403 FEATURE_NOT_IN_PLAN)', async () => {
    const res = await t.client.get('/api/tenant/analytics').set('x-tenant-id', 'globex').auth(globex)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FEATURE_NOT_IN_PLAN')
    expect(res.body.error.details).toEqual({ feature: 'analytics', plan: 'free' })
  })

  it('lists enabled features with the tenant', async () => {
    const pro  = await t.client.get('/api/tenant').set('x-tenant-id', 'acme').auth(acme)
    const free = await t.client.get('/api/tenant').set('x-tenant-id', 'globex').auth(globex)
    expect(pro.body.data.features).toEqual(['analytics'])
    expect(free.body.data.features).toEqual([])
  })

  it('unlocks the feature after an upgrade, without touching other tenants', async () => {
    const upgrade = await t.client.put('/api/tenant/plan').set('x-tenant-id', 'globex').auth(globex).send({ plan: 'pro' })
    expect(upgrade.status).toBe(200)
    expect(upgrade.body.data.features).toEqual(['analytics'])

    const res = await t.client.get('/api/tenant/analytics').set('x-tenant-id', 'globex').auth(globex)
    expect(res.status).toBe(200)
    expect(t.services.entitlements.hasFeature('acme', 'audit-export')).toBe(false)
  })

  it('validates the plan name (422)', async () => {
    const res = await t.client.put('/api/tenant/plan').set('x-tenant-id', 'acme').auth(acme).send({ plan: 'platinum' })
    expect(res.status).toBe(422)
  })
})

describe('quotas per plan', () => {
  const t = useTestApp()
  let globex = ''   // free: 3 projects, 3 users

  beforeAll(async () => {
    globex = await t.bootstrap('globex')
  })

  const create = (name: string) =>
    t.client.post('/api/projects').set('x-tenant-id', 'globex').auth(globex).send({ name })

  it('allows up to the plan limit, then answers 429 QUOTA_EXCEEDED', async () => {
    for (const name of ['One', 'Two', 'Three']) expect((await create(name)).status).toBe(201)

    const res = await create('Four')
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('QUOTA_EXCEEDED')
    expect(res.body.error.details).toEqual({ metric: 'projects', limit: 3 })
    expect(t.services.projects.list('globex')).toHaveLength(3)
  })

  it('reports usage, and the rejected request did not count', async () => {
    const res = await t.client.get('/api/tenant').set('x-tenant-id', 'globex').auth(globex)
    const projects = res.body.data.usage.find((u: { metric: string }) => u.metric === 'projects')
    expect(projects).toMatchObject({ current: 3, limit: 3, percentUsed: 100 })
  })

  it('frees a slot when a project is deleted', async () => {
    const id = t.services.projects.list('globex')[0].id
    expect((await t.client.delete(\`/api/projects/\${id}\`).set('x-tenant-id', 'globex').auth(globex)).status).toBe(204)
    expect((await create('Four')).status).toBe(201)
  })

  it('caps members too (free plan: 3 users)', async () => {
    for (const n of [1, 2]) {
      const res = await t.client.post('/api/tenant/members').set('x-tenant-id', 'globex').auth(globex)
        .send({ email: \`m\${n}@globex.test\`, name: \`M\${n}\`, password: 'correct-horse-battery' })
      expect(res.status).toBe(201)
    }
    const res = await t.client.post('/api/tenant/members').set('x-tenant-id', 'globex').auth(globex)
      .send({ email: 'm3@globex.test', name: 'M3', password: 'correct-horse-battery' })
    expect(res.status).toBe(429)
    expect(res.body.error.details.metric).toBe('users')
  })
})

describe('per-tenant rate limit', () => {
  // A tiny budget so the test stays fast: 5 requests per minute per tenant
  const t = useTestApp({ RATE_LIMIT_PER_MINUTE: '5' })

  it('answers 429 RATE_LIMIT_EXCEEDED once a tenant spends its budget', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const res = await t.client.post('/api/auth/login').set('x-tenant-id', 'acme').send({ email: 'x@acme.test', password: 'whatever-123' })
      statuses.push(res.status)
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429])

    const res = await t.client.get('/api/projects').set('x-tenant-id', 'acme')
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(res.headers['x-ratelimit-limit']).toBe('5')
    expect(res.headers['x-ratelimit-remaining']).toBe('0')
  })

  it('does not slow down other tenants', async () => {
    const res = await t.client.post('/api/auth/login').set('x-tenant-id', 'globex').send({ email: 'x@globex.test', password: 'whatever-123' })
    expect(res.status).toBe(401)
    expect(res.headers['x-ratelimit-tenant']).toBe('globex')
  })
})
`,

    'src/routes/auth.ts': `/**
 * /api/auth: accounts live inside a tenant (pick it with X-Tenant-ID).
 *
 *   POST /api/auth/register   bootstrap: the first account of a tenant becomes its admin;
 *                             after that registration is closed (admins invite members)
 *   POST /api/auth/login      email + password -> JWT with tenantId, role, permissions
 */

import { Router, ForbiddenError, UnauthorizedError } from '@axiljs/core'
import type { axilRequest } from '@axiljs/core'
import { hashPassword, verifyPassword } from '@axiljs/auth'
import { v, validate } from '@axiljs/validation'
import type { BaseValidator } from '@axiljs/validation'
import { getTenantId } from '../lib/cloud.js'
import { toUserDto } from '../data/users.js'
import type { User } from '../data/users.js'
import { consumeQuota } from '../middleware/tenancy.js'
import { ROLE_PERMISSIONS } from '../tenancy/roles.js'
import type { Services } from '../services.js'

// Shared with the invite schema in tenant.ts. Exported schemas need an
// explicit BaseValidator type (the concrete validator classes are not exported).
export const emailField: BaseValidator<string>    = v.string().trim().email().max(255).transform(s => s.toLowerCase())
export const passwordField: BaseValidator<string> = v.string().min(8).max(128)

const RegisterBody = v.object({
  email:    emailField,
  name:     v.string().trim().min(1).max(100),
  password: passwordField
}).strip()

const LoginBody = v.object({
  email:    emailField,
  password: v.string().min(1).max(128)
}).strip()

interface RegisterInput { email: string; name: string; password: string }
interface LoginInput    { email: string; password: string }

/** Access token: everything the RBAC middleware needs, scoped to one tenant. */
export function issueToken(services: Services, user: User, expiresIn: string): string {
  return services.jwt.sign({
    sub:         user.id,
    tenantId:    user.tenantId,
    email:       user.email,
    role:        user.role,
    permissions: ROLE_PERMISSIONS[user.role]
  }, { expiresIn })
}

export function authRoutes(services: Services, expiresIn: string, tenantScope: (router: Router) => Router): Router {
  const { users, quotas, audit } = services
  const router = tenantScope(new Router())

  router.post('/register', validate({ body: RegisterBody }), async (req: axilRequest, res) => {
    const tenantId = getTenantId(req)
    const { email, name, password } = req.body as RegisterInput

    if (users.count(tenantId) > 0) {
      throw new ForbiddenError('Registration is closed for this tenant: ask an admin to invite you')
    }
    consumeQuota(quotas, tenantId, 'users')

    const user = users.create(tenantId, { email, name, role: 'admin', passwordHash: await hashPassword(password) })
    audit.record(req, 'tenant.bootstrapped', {
      actor:    { id: user.id, type: 'user' },
      target:   { type: 'user', id: user.id },
      metadata: { email }
    })

    res.created({ user: toUserDto(user), token: issueToken(services, user, expiresIn) }, 'Tenant admin created')
  })

  router.post('/login', validate({ body: LoginBody }), async (req, res) => {
    const tenantId = getTenantId(req)
    const { email, password } = req.body as LoginInput
    const user = users.findByEmail(tenantId, email)

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      audit.record(req, 'auth.login_failed', { metadata: { email }, success: false, error: 'invalid credentials' })
      throw new UnauthorizedError('Invalid email or password')
    }

    res.success({ user: toUserDto(user), token: issueToken(services, user, expiresIn) }, 'Logged in')
  })

  return router
}
`,

    'src/routes/projects.ts': `/**
 * /api/projects: tenant-owned data.
 *
 * Every handler reads and writes through getTenantId(req), and the store is
 * partitioned by tenant, so one tenant can never see another tenant's rows.
 *
 *   GET    /api/projects        projects:read
 *   POST   /api/projects        projects:write   (counts against the plan's projects quota)
 *   GET    /api/projects/:id    projects:read
 *   DELETE /api/projects/:id    projects:delete  (admins; audited)
 */

import { Router, NotFoundError } from '@axiljs/core'
import { authenticate, requirePermission } from '@axiljs/auth'
import { v, validate } from '@axiljs/validation'
import { getTenantId } from '../lib/cloud.js'
import { consumeQuota, currentUser, sameTenant } from '../middleware/tenancy.js'
import type { Services } from '../services.js'

const CreateBody = v.object({
  name:        v.string().trim().min(1).max(100),
  description: v.string().trim().max(1_000).default('')
}).strip()

const IdParams = v.object({
  id: v.string().pattern(/^[0-9a-f-]{36}$/)
})

interface CreateInput { name: string; description: string }

export function projectRoutes(services: Services, tenantScope: (router: Router) => Router): Router {
  const { projects, quotas, audit } = services
  const router = tenantScope(new Router())

  // Every project route needs a token for *this* tenant
  router.use(authenticate(services.jwt))
  router.use(sameTenant(audit))

  router.get('/', requirePermission('projects:read'), (req, res) => {
    const items = projects.list(getTenantId(req))
    res.success({ items, total: items.length }, 'Projects')
  })

  router.post('/', requirePermission('projects:write'), validate({ body: CreateBody }), (req, res) => {
    const tenantId = getTenantId(req)
    const input    = req.body as CreateInput

    consumeQuota(quotas, tenantId, 'projects')
    const project = projects.create(tenantId, { ...input, createdBy: currentUser(req).id })

    res.header('Location', \`/api/projects/\${project.id}\`)
    res.created(project, 'Project created')
  })

  router.get('/:id', requirePermission('projects:read'), validate({ params: IdParams }), (req, res) => {
    const project = projects.get(getTenantId(req), req.params.id)
    // Another tenant's id is indistinguishable from one that never existed
    if (!project) throw new NotFoundError('Project not found')
    res.success(project, 'Project')
  })

  router.delete('/:id', requirePermission('projects:delete'), validate({ params: IdParams }), (req, res) => {
    const tenantId = getTenantId(req)
    const project  = projects.get(tenantId, req.params.id)
    if (!project) throw new NotFoundError('Project not found')

    projects.delete(tenantId, project.id)
    quotas.increment(tenantId, 'projects', -1)       // free the slot
    audit.record(req, 'project.deleted', { target: { type: 'project', id: project.id }, metadata: { name: project.name } })

    res.status(204).send('')
  })

  return router
}
`,

    'src/routes/tenant.ts': `/**
 * /api/tenant: the tenant itself, its members, plan, usage, audit trail and
 * the plan-gated analytics endpoint. Every request here is also recorded by
 * auditMiddleware (method, path, status, actor, duration).
 *
 *   GET  /api/tenant              any member: plan, features, usage
 *   GET  /api/tenant/members      members:read
 *   POST /api/tenant/members      members:invite    (users quota; audited)
 *   PUT  /api/tenant/plan         admin role        (audited)
 *   GET  /api/tenant/audit        audit:read        (this tenant's events only)
 *   GET  /api/tenant/analytics    analytics:read + "analytics" feature (pro and up)
 */

import { Router } from '@axiljs/core'
import { authenticate, hashPassword, requirePermission, requireRole } from '@axiljs/auth'
import type { TenantPlan } from '@axiljs/cloud'
import { v, validate } from '@axiljs/validation'
import { auditMiddleware, getTenant, getTenantId } from '../lib/cloud.js'
import { toUserDto } from '../data/users.js'
import type { Role } from '../data/users.js'
import { ConflictError } from '../middleware/errors.js'
import { consumeQuota, requireFeature, sameTenant } from '../middleware/tenancy.js'
import { PLAN_NAMES } from '../tenancy/plans.js'
import { ROLES } from '../tenancy/roles.js'
import type { Services } from '../services.js'
import { emailField, passwordField } from './auth.js'

const InviteBody = v.object({
  email:    emailField,
  name:     v.string().trim().min(1).max(100),
  password: passwordField,
  role:     v.enum(ROLES).default('member')
}).strip()

const PlanBody = v.object({
  plan: v.enum(PLAN_NAMES)
}).strip()

const AuditQuery = v.object({
  limit: v.number().integer().min(1).max(500).default(100).transform(Number)
}).strip()

interface InviteInput { email: string; name: string; password: string; role: Role }

export function tenantRoutes(services: Services, logToConsole: boolean, tenantScope: (router: Router) => Router): Router {
  const { tenants, users, projects, quotas, entitlements, audit } = services
  const router = tenantScope(new Router())

  // auditMiddleware first, so rejected requests (401/403) are recorded too
  router.use(auditMiddleware({ logToConsole }))
  router.use(authenticate(services.jwt))
  router.use(sameTenant(audit))

  router.get('/', (req, res) => {
    const tenant = getTenant(req)
    res.success({
      tenant:   { id: tenant.id, name: tenant.name, plan: tenant.plan ?? 'free', status: tenant.status },
      features: entitlements.features(tenant.id),
      usage:    quotas.getUsage(tenant.id)
    }, 'Tenant')
  })

  router.get('/members', requirePermission('members:read'), (req, res) => {
    res.success(users.list(getTenantId(req)).map(toUserDto), 'Members')
  })

  router.post('/members', requirePermission('members:invite'), validate({ body: InviteBody }), async (req, res) => {
    const tenantId = getTenantId(req)
    const input    = req.body as InviteInput

    if (users.findByEmail(tenantId, input.email)) {
      throw new ConflictError('A member with this email already exists')
    }
    consumeQuota(quotas, tenantId, 'users')

    const user = users.create(tenantId, {
      email:        input.email,
      name:         input.name,
      role:         input.role,
      passwordHash: await hashPassword(input.password)
    })
    audit.record(req, 'member.invited', { target: { type: 'user', id: user.id }, metadata: { email: user.email, role: user.role } })

    res.created(toUserDto(user), 'Member invited')
  })

  // Demo stand-in for your billing webhook: in production the plan changes
  // when a subscription does, not because an admin asked for it
  router.put('/plan', requireRole('admin'), validate({ body: PlanBody }), (req, res) => {
    const tenant   = getTenant(req)
    const { plan } = req.body as { plan: TenantPlan }
    const previous = tenant.plan ?? 'free'

    tenants.setPlan(tenant.id, plan)
    entitlements.apply(tenants.list())
    audit.record(req, 'tenant.plan_changed', { target: { type: 'tenant', id: tenant.id }, metadata: { from: previous, to: plan } })

    res.success({ plan, features: entitlements.features(tenant.id), usage: quotas.getUsage(tenant.id) }, 'Plan updated')
  })

  router.get('/audit', requirePermission('audit:read'), validate({ query: AuditQuery }), (req, res) => {
    const { limit } = req.query as unknown as { limit: number }
    res.success(audit.forTenant(getTenantId(req), limit), 'Audit trail')
  })

  router.get('/analytics', requirePermission('analytics:read'), requireFeature(entitlements, 'analytics'), (req, res) => {
    const tenantId = getTenantId(req)
    const items    = projects.list(tenantId)
    const members  = users.list(tenantId)
    res.success({
      projects: { total: items.length, active: items.filter(p => p.status === 'active').length },
      members:  { total: members.length, byRole: Object.fromEntries(ROLES.map(r => [r, members.filter(m => m.role === r).length])) }
    }, 'Analytics')
  })

  return router
}
`,

    'src/services.ts': `/**
 * Everything the routes depend on, built in one place.
 *
 * createApp() takes these as an argument, so tests get a fresh, isolated set
 * (own tenants, users, quotas, flags) per app.
 */

import { JWT } from '@axiljs/auth'
import type { Tenant } from '@axiljs/cloud'
import { FeatureFlagManager, QuotaManager } from './lib/cloud.js'
import type { Config } from './config.js'
import { ProjectStore } from './data/projects.js'
import { SEED_TENANTS, TenantStore } from './data/tenants.js'
import { UserStore } from './data/users.js'
import { AuditTrail } from './tenancy/audit-trail.js'
import { Entitlements } from './tenancy/entitlements.js'

export interface Services {
  jwt:          JWT
  tenants:      TenantStore
  users:        UserStore
  projects:     ProjectStore
  quotas:       QuotaManager
  entitlements: Entitlements
  audit:        AuditTrail
  /** Detach from the global event bus. */
  close():      void
}

export function createServices(config: Config, seed: Tenant[] = SEED_TENANTS): Services {
  const tenants      = new TenantStore(seed)
  const quotas       = new QuotaManager()
  const entitlements = new Entitlements(new FeatureFlagManager(), quotas)
  entitlements.apply(tenants.list())

  const audit = new AuditTrail(config.AUDIT_LOG_TO_CONSOLE && config.NODE_ENV !== 'test')

  return {
    jwt:      new JWT(config.JWT_SECRET),
    tenants,
    users:    new UserStore(),
    projects: new ProjectStore(),
    quotas,
    entitlements,
    audit,
    close:    () => audit.close()
  }
}
`,

    'src/tenancy.test.ts': `import { describe, it, expect, beforeAll } from '@axiljs/testing'
import { useTestApp } from './testing/setup.js'

describe('tenant resolution', () => {
  const t = useTestApp()

  it('requires a tenant on /api routes (401)', async () => {
    const res = await t.client.post('/api/auth/login').send({ email: 'a@b.test', password: 'whatever-123' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('rejects unknown and malformed tenants (401)', async () => {
    const unknown = await t.client.get('/api/tenant').set('x-tenant-id', 'nope')
    expect(unknown.status).toBe(401)
    expect(unknown.body.error.message).toContain('Unknown tenant')

    const malformed = await t.client.get('/api/tenant').set('x-tenant-id', 'Not A Tenant!')
    expect(malformed.status).toBe(401)
  })

  it('rejects suspended tenants', async () => {
    const res = await t.client.post('/api/auth/register').set('x-tenant-id', 'initech')
      .send({ email: 'boss@initech.test', name: 'Bill', password: 'correct-horse-battery' })
    expect(res.status).toBe(401)
    expect(res.body.error.message).toContain('suspended')
  })

  it('keeps public routes tenant-free', async () => {
    const res = await t.client.get('/health')
    expect(res.status).toBe(200)
  })
})

describe('data isolation between tenants', () => {
  const t = useTestApp()
  let acme   = ''
  let globex = ''
  let acmeProjectId = ''

  beforeAll(async () => {
    acme   = await t.bootstrap('acme')
    globex = await t.bootstrap('globex')
    const res = await t.client.post('/api/projects').set('x-tenant-id', 'acme').auth(acme).send({ name: 'Rocket skates' })
    acmeProjectId = res.body.data.id
  })

  it('lets a tenant read its own project', async () => {
    const res = await t.client.get(\`/api/projects/\${acmeProjectId}\`).set('x-tenant-id', 'acme').auth(acme)
    expect(res.status).toBe(200)
    expect(res.body.data.tenantId).toBe('acme')
  })

  it('hides tenant A\\'s project from tenant B (404, not 403)', async () => {
    const res = await t.client.get(\`/api/projects/\${acmeProjectId}\`).set('x-tenant-id', 'globex').auth(globex)
    expect(res.status).toBe(404)
  })

  it('does not list tenant A\\'s projects for tenant B', async () => {
    const res = await t.client.get('/api/projects').set('x-tenant-id', 'globex').auth(globex)
    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(0)
  })

  it('rejects a token used against another tenant (403)', async () => {
    const res = await t.client.get('/api/projects').set('x-tenant-id', 'globex').auth(acme)
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('different tenant')
  })

  it('cannot delete another tenant\\'s project, even as its admin', async () => {
    const res = await t.client.delete(\`/api/projects/\${acmeProjectId}\`).set('x-tenant-id', 'globex').auth(globex)
    expect(res.status).toBe(404)
    expect(t.services.projects.get('acme', acmeProjectId)).toBeDefined()
  })

  it('scopes accounts per tenant: the same email is two accounts', async () => {
    const res = await t.client.post('/api/auth/login').set('x-tenant-id', 'globex')
      .send({ email: 'admin@acme.test', password: 'correct-horse-battery' })
    expect(res.status).toBe(401)
  })
})

describe('auth and roles', () => {
  const t = useTestApp()
  let admin  = ''
  let member = ''
  let viewer = ''
  let projectId = ''

  beforeAll(async () => {
    admin  = await t.bootstrap('acme')
    member = await t.invite('acme', admin, 'member@acme.test', 'member')
    viewer = await t.invite('acme', admin, 'viewer@acme.test', 'viewer')
    const res = await t.client.post('/api/projects').set('x-tenant-id', 'acme').auth(member).send({ name: 'Anvils' })
    projectId = res.body.data.id
  })

  it('closes registration after the first account (403)', async () => {
    const res = await t.client.post('/api/auth/register').set('x-tenant-id', 'acme')
      .send({ email: 'intruder@acme.test', name: 'Intruder', password: 'correct-horse-battery' })
    expect(res.status).toBe(403)
  })

  it('puts tenant, role and permissions into the token', async () => {
    const payload = t.services.jwt.verify(member)
    expect(payload.tenantId).toBe('acme')
    expect(payload.role).toBe('member')
    expect(payload.permissions).toContain('projects:write')
  })

  it('requires a token (401)', async () => {
    const res = await t.client.get('/api/projects').set('x-tenant-id', 'acme')
    expect(res.status).toBe(401)
  })

  it('rejects a bad password (401)', async () => {
    const res = await t.client.post('/api/auth/login').set('x-tenant-id', 'acme').send({ email: 'member@acme.test', password: 'nope-nope-nope' })
    expect(res.status).toBe(401)
  })

  it('lets a viewer read but not write (403)', async () => {
    const read = await t.client.get('/api/projects').set('x-tenant-id', 'acme').auth(viewer)
    expect(read.status).toBe(200)
    const write = await t.client.post('/api/projects').set('x-tenant-id', 'acme').auth(viewer).send({ name: 'Nope' })
    expect(write.status).toBe(403)
    expect(write.body.error.code).toBe('FORBIDDEN')
  })

  it('lets only admins delete projects', async () => {
    const asMember = await t.client.delete(\`/api/projects/\${projectId}\`).set('x-tenant-id', 'acme').auth(member)
    expect(asMember.status).toBe(403)
    const asAdmin = await t.client.delete(\`/api/projects/\${projectId}\`).set('x-tenant-id', 'acme').auth(admin)
    expect(asAdmin.status).toBe(204)
  })

  it('lets only admins invite and change the plan', async () => {
    const invite = await t.client.post('/api/tenant/members').set('x-tenant-id', 'acme').auth(member)
      .send({ email: 'x@acme.test', name: 'X', password: 'correct-horse-battery' })
    expect(invite.status).toBe(403)
    const plan = await t.client.put('/api/tenant/plan').set('x-tenant-id', 'acme').auth(member).send({ plan: 'enterprise' })
    expect(plan.status).toBe(403)
  })

  it('returns 409 for a duplicate member and 422 for invalid input', async () => {
    const dup = await t.client.post('/api/tenant/members').set('x-tenant-id', 'acme').auth(admin)
      .send({ email: 'member@acme.test', name: 'Again', password: 'correct-horse-battery' })
    expect(dup.status).toBe(409)
    const bad = await t.client.post('/api/tenant/members').set('x-tenant-id', 'acme').auth(admin)
      .send({ email: 'nope', name: '', password: 'short', role: 'owner' })
    expect(bad.status).toBe(422)
    const paths = bad.body.error.details.map((d: { path: string }) => d.path)
    for (const field of ['email', 'name', 'password', 'role']) expect(paths).toContain(field)
  })
})
`,

    'src/tenancy/audit-trail.ts': `/**
 * Audit trail.
 *
 * auditLog() / auditMiddleware() from @axiljs/cloud publish every event as
 * 'audit.log' on the global @axiljs/events bus. This class is one subscriber:
 * it keeps the most recent events in memory so tenant admins can read their
 * own trail (GET /api/tenant/audit). Add more subscribers to ship events to
 * a database, a SIEM or object storage.
 */

import type { AuditActor, AuditEvent, AuditTarget } from '@axiljs/cloud'
import type { axilRequest } from '@axiljs/core'
import { getGlobalEventBus } from '@axiljs/events'
import { auditLog } from '../lib/cloud.js'

export interface RecordOptions {
  /** Defaults to the signed-in user, or anonymous */
  actor?:    AuditActor
  target?:   AuditTarget
  metadata?: Record<string, unknown>
  success?:  boolean
  error?:    string
}

export class AuditTrail {
  private events: AuditEvent[] = []
  private unsubscribe: Array<() => void> = []

  constructor(
    private readonly logToConsole: boolean,
    private readonly maxEvents = 1_000
  ) {
    const bus = getGlobalEventBus()

    const audit = bus.on<AuditEvent>('audit.log', event => {
      this.events.push(event.payload)
      if (this.events.length > this.maxEvents) this.events.shift()
    })

    // Quota overruns are security-relevant too: turn them into audit events
    const quota = bus.on<{ tenantId: string; metric: string; current: number; limit: number }>('quota.exceeded', event => {
      const { tenantId, metric, current, limit } = event.payload
      auditLog({
        action:   'quota.exceeded',
        actor:    { id: 'system', type: 'system' },
        tenantId,
        metadata: { metric, current, limit },
        success:  false,
        error:    \`\${metric} quota of \${limit} exceeded\`
      }, { logToConsole: this.logToConsole })
    })

    this.unsubscribe.push(() => audit.unsubscribe(), () => quota.unsubscribe())
  }

  /** Emit an audit event for the current request's tenant and user. */
  record(req: axilRequest, action: string, options: RecordOptions = {}): void {
    const user   = req.locals.user as { id: string | number } | undefined
    const tenant = req.locals.tenant as { id: string } | undefined

    auditLog({
      action,
      actor:     options.actor ?? (user ? { id: user.id, type: 'user' } : { id: 'anonymous', type: 'api' }),
      tenantId:  tenant?.id,
      target:    options.target,
      metadata:  options.metadata ?? {},
      ip:        req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      success:   options.success ?? true,
      error:     options.error
    }, { logToConsole: this.logToConsole })
  }

  /** Newest first; only this tenant's events. */
  forTenant(tenantId: string, limit = 100): AuditEvent[] {
    return this.events.filter(e => e.tenantId === tenantId).slice(-limit).reverse()
  }

  /** Stop listening (tests, graceful shutdown). */
  close(): void {
    for (const off of this.unsubscribe.splice(0)) off()
  }
}
`,

    'src/tenancy/entitlements.ts': `/**
 * Entitlements: turns each tenant's plan into feature flags and quotas.
 *
 * One flag per feature, whitelisting the tenants whose plan includes it.
 * Call apply() at startup and whenever a plan changes; usage counters are
 * kept across plan changes (QuotaManager.configure only swaps the limits).
 */

import type { Tenant } from '@axiljs/cloud'
import type { FeatureFlagManager, QuotaManager } from '../lib/cloud.js'
import { FEATURES, PLANS } from './plans.js'
import type { Feature } from './plans.js'

export class Entitlements {
  constructor(
    readonly flags:  FeatureFlagManager,
    readonly quotas: QuotaManager
  ) {}

  apply(tenants: Tenant[]): void {
    for (const feature of FEATURES) {
      const allowed = tenants.filter(t => PLANS[t.plan ?? 'free'].features.includes(feature)).map(t => t.id)
      this.flags.define({
        name:           feature,
        description:    \`Plan feature: \${feature}\`,
        // An empty allowedTenants list means "no whitelist" (everyone), so a
        // feature no tenant has must be switched off instead
        enabled:        allowed.length > 0,
        allowedTenants: allowed
      })
    }

    for (const tenant of tenants) {
      this.quotas.configure({ tenantId: tenant.id, limits: PLANS[tenant.plan ?? 'free'].limits })
    }
  }

  hasFeature(tenantId: string, feature: Feature): boolean {
    return this.flags.isEnabled(feature, { tenantId })
  }

  features(tenantId: string): Feature[] {
    return FEATURES.filter(f => this.hasFeature(tenantId, f))
  }
}
`,

    'src/tenancy/plans.ts': `/**
 * Plans: which features each plan unlocks and the quotas it comes with.
 * Change a tenant's plan and both follow (see Entitlements).
 */

import type { QuotaLimit, TenantPlan } from '@axiljs/cloud'

/** Feature flags gated by plan. */
export const FEATURES = ['analytics', 'audit-export'] as const
export type Feature = typeof FEATURES[number]

export const PLAN_NAMES: TenantPlan[] = ['free', 'pro', 'enterprise']

export interface PlanDefinition {
  features: Feature[]
  limits:   QuotaLimit[]
}

export const PLANS: Record<TenantPlan, PlanDefinition> = {
  free: {
    features: [],
    limits: [
      { metric: 'projects',  max: 3,     period: 'lifetime' },
      { metric: 'users',     max: 3,     period: 'lifetime' },
      { metric: 'api_calls', max: 1_000, period: 'daily' }
    ]
  },
  pro: {
    features: ['analytics'],
    limits: [
      { metric: 'projects',  max: 100,     period: 'lifetime' },
      { metric: 'users',     max: 25,      period: 'lifetime' },
      { metric: 'api_calls', max: 100_000, period: 'daily' }
    ]
  },
  enterprise: {
    features: ['analytics', 'audit-export'],
    limits: [
      { metric: 'projects',  max: 10_000,    period: 'lifetime' },
      { metric: 'users',     max: 1_000,     period: 'lifetime' },
      { metric: 'api_calls', max: 1_000_000, period: 'daily' }
    ]
  }
}
`,

    'src/tenancy/roles.ts': `/**
 * Roles and the permissions they grant inside a tenant.
 *
 * Permissions go into the JWT, so routes check them with
 * requirePermission('projects:write') from @axiljs/auth ("x:*" is a wildcard).
 */

import type { Role } from '../data/users.js'

export const ROLES: Role[] = ['admin', 'member', 'viewer']

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin:  ['projects:*', 'members:*', 'tenant:*', 'audit:read', 'analytics:read'],
  member: ['projects:read', 'projects:write', 'members:read', 'analytics:read'],
  viewer: ['projects:read', 'members:read', 'analytics:read']
}

/** Claims carried by every access token (and found on req.locals.user). */
export interface TokenUser {
  id:          string
  tenantId:    string
  email:       string
  role:        Role
  permissions: string[]
}
`,

    'src/testing/setup.ts': `/**
 * Test helpers.
 *
 * useTestApp() registers beforeAll/afterAll in the enclosing describe(): each
 * suite gets a fresh app with its own tenants, users, quotas and flags, and
 * detaches its audit trail from the global event bus when it is done.
 */

import { afterAll, beforeAll, createTestClient } from '@axiljs/testing'
import type { TestClient } from '@axiljs/testing'
import { createApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createServices } from '../services.js'
import type { Services } from '../services.js'

// Test-only signing key (not a secret; never use it outside tests)
export const TEST_JWT_SECRET = 'test-only-jwt-secret-not-for-production-use'
export const PASSWORD        = 'correct-horse-battery'

export interface TestApp {
  client:   TestClient
  services: Services
  /** Bootstrap a tenant's first account (its admin) and return the token. */
  bootstrap(tenant: string, email?: string): Promise<string>
  /** Invite a member with a role and return their token. */
  invite(tenant: string, adminToken: string, email: string, role: 'admin' | 'member' | 'viewer'): Promise<string>
}

export function useTestApp(env: Record<string, string> = {}): TestApp {
  const ctx = {} as TestApp

  beforeAll(() => {
    const config   = loadConfig({ NODE_ENV: 'test', JWT_SECRET: TEST_JWT_SECRET, ...env })
    const services = createServices(config)
    const client   = createTestClient(createApp(config, services))

    async function login(tenant: string, email: string): Promise<string> {
      const res = await client.post('/api/auth/login').set('x-tenant-id', tenant).send({ email, password: PASSWORD })
      if (res.status !== 200) throw new Error(\`login \${email}@\${tenant} failed: \${res.status} \${res.text}\`)
      return res.body.data.token
    }

    Object.assign(ctx, {
      client,
      services,
      async bootstrap(tenant: string, email = \`admin@\${tenant}.test\`) {
        const res = await client.post('/api/auth/register').set('x-tenant-id', tenant).send({ email, name: 'Admin', password: PASSWORD })
        if (res.status !== 201) throw new Error(\`bootstrap \${tenant} failed: \${res.status} \${res.text}\`)
        return res.body.data.token
      },
      async invite(tenant: string, adminToken: string, email: string, role: string) {
        const res = await client.post('/api/tenant/members').set('x-tenant-id', tenant).auth(adminToken)
          .send({ email, name: role, password: PASSWORD, role })
        if (res.status !== 201) throw new Error(\`invite \${email} failed: \${res.status} \${res.text}\`)
        return login(tenant, email)
      }
    })
  })

  afterAll(() => ctx.services?.close())

  return ctx
}
`
  }),

  nextSteps: () => [
    ['Edit .env', 'Set JWT_SECRET to 32+ random characters'],
    ['npm test', 'Isolation, plan, quota, rate-limit and audit tests']
  ]
}
