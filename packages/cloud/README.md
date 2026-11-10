# @axiljs/cloud

> Enterprise cloud platform layer for the AxilJS ecosystem — multi-tenancy, audit logging, feature flags, deployment generation, rate limiting, secrets management, quotas, distributed cache, and observability.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-37%20passing-brightgreen.svg)](#testing)

---

## Table of Contents

- [Overview](#overview)
- [Why AxilJS Cloud?](#why-axiljs-cloud)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Capabilities](#capabilities)
  - [Multi-Tenancy](#multi-tenancy)
  - [Audit Logging](#audit-logging)
  - [Feature Flags](#feature-flags)
  - [Deployment Generator](#deployment-generator)
  - [Operational Dashboard](#operational-dashboard)
  - [Rate Limiting](#rate-limiting)
  - [Secrets Management](#secrets-management)
  - [Quota Management](#quota-management)
  - [Distributed Cache](#distributed-cache)
  - [Correlation ID Propagation](#correlation-id-propagation)
  - [Health Aggregation](#health-aggregation)
- [Request Lifecycle](#request-lifecycle)
- [Integration with AxilJS Ecosystem](#integration-with-axiljs-ecosystem)
- [Testing](#testing)
- [Future Development](#future-development)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

`@axiljs/cloud` is the **cloud-native infrastructure layer** for the AxilJS ecosystem. It provides everything a production-grade multi-tenant SaaS application needs, out of the box:

- **Tenant isolation** with header, subdomain, JWT, or custom resolution strategies
- **Immutable, event-driven audit trails** compliant with SOC2, HIPAA, and GDPR requirements
- **Deterministic feature flag rollouts** using FNV-1a hashing
- **Production-grade deployment manifests** for Docker and Kubernetes
- **Per-tenant rate limiting** with sliding window counters
- **AES-256-GCM secrets management** with authenticated encryption
- **Tenant quota tracking** with configurable periods and warning events
- **TTL cache** with tag-based invalidation and tenant isolation
- **Request/correlation ID propagation** for distributed tracing
- **Multi-service health aggregation** for gateway services
- **Operational monitoring dashboard** with Prometheus integration

Every module is **type-safe, tested, and framework-consistent within AxilJS**, and designed to work in horizontally scaled cloud deployments.

---

## Why AxilJS Cloud?

Building a multi-tenant SaaS application traditionally requires stitching together 15+ npm packages from different maintainers, each with their own conventions, security posture, and update cadence.

### The Problem

```text
Traditional Node.js SaaS Stack
├── express                      (HTTP)
├── express-rate-limit           (rate limiting)
├── helmet                       (security headers)
├── express-audit-logger         (audit trails)
├── unleash-client               (feature flags)
├── node-vault                   (secrets)
├── ioredis                      (cache)
├── prom-client                  (metrics)
├── opentelemetry                (tracing)
├── uuid                         (request IDs)
├── kubernetes-client            (manifests)
└── ... 40+ more packages
```

Every one of these needs to be evaluated, integrated, updated, and secured independently. Version conflicts, missing types, inconsistent APIs, and abandoned packages create constant friction.

### The AxilJS Solution

```text
@axiljs/cloud
├── Multi-tenancy       ← built-in
├── Rate limiting       ← built-in
├── Audit logging       ← built-in
├── Feature flags       ← built-in
├── Secrets management  ← built-in
├── Quotas              ← built-in
├── Cache               ← built-in
├── Correlation IDs     ← built-in
├── Health monitoring   ← built-in
├── Dashboard           ← built-in
└── Deployment          ← built-in
```

**One install. One version. One unified API. One team maintaining it.**

### Real-World Benefits

| Concern                            | Traditional Stack           | AxilJS Cloud     |
|------------------------------------|-----------------------------|------------------|
| Setup time for multi-tenant SaaS   | 2–4 weeks                   | 30 minutes       |
| Type-safety across packages        | Fragmented, often missing   | 100% TypeScript  |
| Security audit scope               | 40+ packages                | 1 package        |
| Version conflicts                  | Frequent                    | None             |
| API consistency                    | Poor                        | Uniform          |
| Distributed deployment             | Manual configuration        | Built-in         |
| Learning curve                     | High (many docs)            | Low (one doc)    |

---

## Architecture

`@axiljs/cloud` is organized as a unified set of composable capability modules that share a single type system, event bus, and observability layer.

```text
┌───────────────────────────────────────────────────────────────────┐
│                     AxilJS Cloud Platform                         │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Tenancy & Access             Governance                          │
│  ─────────────────            ─────────────                       │
│  multi-tenancy                audit                               │
│  rate-limiter                 quota                               │
│  correlation                  feature-flags                       │
│                                                                   │
│  Data & Secrets               Deployment & Ops                    │
│  ─────────────────            ─────────────────                   │
│  cache                        deployment                          │
│  secrets                      dashboard                           │
│                               health-aggregator                   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Module Dependency Graph

```text
                    ┌──────────────┐
                    │  @axiljs/    │
                    │  common      │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐┌────▼──────┐┌────▼──────┐
       │  @axiljs/   ││ @axiljs/  ││ @axiljs/  │
       │  events     ││ observab. ││ security  │
       └──────┬──────┘└────┬──────┘└────┬──────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼───────┐
                    │  @axiljs/    │
                    │  cloud       │
                    └──────────────┘
```

---

## Installation

```bash
npm install @axiljs/cloud
```

### Peer Dependencies

`@axiljs/cloud` requires the following AxilJS packages:

- `@axiljs/common` ^0.2.0
- `@axiljs/events` ^0.2.0

They are installed automatically when using AxilJS's monorepo or `axil create`.

---

## Quick Start

```typescript
import { Application } from '@axiljs/core';
import {
  multiTenancy,
  auditMiddleware,
  featureFlags,
  tenantRateLimiter,
  correlationId,
  createDashboard,
  getTenant
} from '@axiljs/cloud';

const app = new Application();

// 1. Attach correlation IDs to every request
app.use(correlationId());

// 2. Resolve the tenant from the `x-tenant-id` header
app.use(multiTenancy({
  strategy: 'header',
  resolveTenant: async (id) => ({ id, name: `Tenant ${id}`, status: 'active' }),
}));

// 3. Enforce a per-tenant rate limit
app.use(tenantRateLimiter({
  defaultRule: { max: 100, windowMs: 60_000 },
  tenantRules: { 'enterprise-corp': { max: 10_000, windowMs: 60_000 } },
}));

// 4. Log every request to the audit trail
app.use(auditMiddleware());

// 5. Define a feature flag
featureFlags.define({
  name: 'new-checkout',
  enabled: true,
  rolloutPercentage: 25,
  allowedTenants: ['beta-tester-1'],
});

// 6. Serve the operational dashboard
app.get('/dashboard', createDashboard({
  title: 'My SaaS Dashboard',
  metricsEndpoint: '/metrics',
  healthEndpoint: '/health',
}));

// 7. Use the tenant context in your business logic
app.get('/api/data', (req, res) => {
  const tenant = getTenant(req);
  const enabled = featureFlags.isEnabled('new-checkout', {
    tenantId: tenant.id,
    userId: req.locals?.user?.id,
  });
  res.json({ tenant, feature: enabled });
});

app.listen(3000);
```

That's a **fully multi-tenant, rate-limited, audited, feature-flagged, and observable** SaaS application in **fewer than 40 lines of code**.

---

## Capabilities

### Multi-Tenancy

Resolves and validates the current tenant from every incoming request.

**Resolution strategies:**
- `header` — from a configurable request header (default: `x-tenant-id`)
- `subdomain` — from the first segment of the `Host` header (IP-address hosts are ignored)
- `jwt` — from `req.locals.user.tenantId` (populated by `@axiljs/auth`)
- `custom` — from a user-supplied resolver function

**Guarantees:**
- Tenant ID format validation (RFC 1123 by default)
- Rejects suspended and archived tenants with `401`
- Attaches full tenant context to `req.locals.tenant`
- Zero process state — safe for horizontal scaling

```typescript
app.use(multiTenancy({
  strategy: 'header',
  headerName: 'x-tenant-id',
  resolveTenant: async (id) => await db.tenants.findById(id),
  required: true,
}));

// In any handler:
const tenant = getTenant(req);   // throws if missing
const id = getTenantId(req);     // shorthand for tenant.id
```

### Audit Logging

Emits an immutable event onto the AxilJS global event bus for every request, method call, or business action.

**Why it matters:**
- SOC2, HIPAA, and GDPR compliance
- Security incident forensics
- Behavioural analytics
- Regulatory reporting

**Key architectural feature:** Uses Node's `finish` and `close` response lifecycle events instead of monkey-patching `res.raw.end`, ensuring safe operation in production HTTP servers.

```typescript
app.use(auditMiddleware());

// Manually log a business action
auditLog({
  action: 'user.password_reset',
  actor: { id: adminId, type: 'user' },
  tenantId: tenant.id,
  metadata: { targetUser: userId },
  success: true,
});

// Subscribe to persist audit events externally
getGlobalEventBus().on('audit.log', async (event) => {
  await db.auditLog.insert(event);
});
```

### Feature Flags

Runtime feature toggles with **deterministic, identity-based rollout** using FNV-1a hashing.

**Why deterministic?** Traditional random rollouts flip users between "on" and "off" between requests, causing broken UI states. Deterministic hashing ensures the same user always sees the same result.

```typescript
featureFlags.define({
  name: 'ai-search',
  enabled: true,
  rolloutPercentage: 30,             // 30% of all users
  allowedTenants: ['acme-corp'],     // plus these tenants always
  allowedUsers: ['vip-user-1'],      // plus these users always
  startAt: '2025-01-01T00:00:00Z',   // scheduled activation
  endAt: '2025-12-31T23:59:59Z',     // scheduled expiration
});

const enabled = featureFlags.isEnabled('ai-search', {
  tenantId: 'some-tenant',
  userId: 'usr-42',
});
```

### Deployment Generator

Generates production-grade Docker and Kubernetes manifests from a single configuration object.

**Generated artifacts:**
- `Dockerfile` — multi-stage build, Node 22 Alpine, non-root user
- `docker-compose.yml` — for local development
- `kubernetes.yaml` — Deployment, Service, HPA, PodDisruptionBudget, and optional Ingress

**Security features:**
- Runs as non-root user (UID 1001)
- Read-only root filesystem
- Dropped Linux capabilities
- Resource requests and limits
- Rolling update strategy
- Readiness and liveness probes
- The `version` label is quoted, so values like `1.0` stay strings

```typescript
generateDeployment({
  appName: 'payment-service',
  version: '1.4.2',
  port: 8080,
  replicas: 3,
  domain: 'payments.myapp.io',
  env: { DATABASE_URL: '...', LOG_LEVEL: 'info' },
  resources: {
    cpuRequest: '100m', cpuLimit: '500m',
    memoryRequest: '128Mi', memoryLimit: '512Mi',
  },
});
```

### Operational Dashboard

A responsive, auto-refreshing operational dashboard that pulls live metrics from your Prometheus endpoint and health data from your health-check endpoint.

```typescript
app.get('/dashboard', createDashboard({
  title: 'My Cloud Console',
  metricsEndpoint: '/metrics',
  healthEndpoint: '/health',
  refreshMs: 5000,
}));
```

**Security features:**
- All dynamic content HTML-escaped
- `Content-Security-Policy` header
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`

### Rate Limiting

Per-tenant rate limiter with configurable per-endpoint rules. Uses a fixed
window by default; pass `algorithm: 'sliding'` for a sliding window counter
(the previous window's count is weighted by how much of it still overlaps;
rejected requests aren't counted).

```typescript
app.use(tenantRateLimiter({
  defaultRule: { max: 100, windowMs: 60_000 },
  tenantRules: {
    'free-tier': { max: 10, windowMs: 60_000 },
    'enterprise': { max: 10_000, windowMs: 60_000 },
  },
}));
```

**Response headers automatically set:**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `X-RateLimit-Tenant`

Over-limit requests never reach `next()`: the envelope response gets
`status(429).json(...)`; otherwise the raw Node response is ended with `429`.

### Secrets Management

AES-256-GCM authenticated encryption for secrets at rest.

```typescript
import { SecretsManager } from '@axiljs/cloud';

const secrets = new SecretsManager({
  encryptionKey: process.env.SECRETS_KEY,
});

await secrets.set('DATABASE_URL', 'postgres://...');
const dbUrl = await secrets.get('DATABASE_URL');

// Generate a new 32-byte key
const key = SecretsManager.generateKey();
```

### Quota Management

Track and enforce per-tenant resource limits with automatic period rollover.
`daily` is a rolling 24 hours; `monthly` resets at the start of the next
calendar month (UTC). Before this change `monthly` was a rolling 30 days.

```typescript
quotas.configure({
  tenantId: 'acme-corp',
  limits: [
    { metric: 'api_calls',     max: 100_000, period: 'monthly' },
    { metric: 'storage_bytes', max: 5_000_000_000, period: 'lifetime' },
    { metric: 'users',         max: 500, period: 'lifetime' },
  ],
});

const allowed = quotas.increment('acme-corp', 'api_calls');
const usage = quotas.getUsage('acme-corp');

// Automatic warning event when 90% of quota is used
getGlobalEventBus().on('quota.warning', ({ tenantId, metric, percentUsed }) => {
  notifyAdmin(`${tenantId} is at ${percentUsed}% of ${metric}`);
});
```

### Distributed Cache

TTL cache with tag-based invalidation and LRU eviction.

```typescript
cache.set(`user:${userId}`, userData, {
  ttlMs: 60_000,
  tags: [`tenant:${tenantId}`, 'user-data'],
});

const user = cache.get(`user:${userId}`);

// Invalidate all data for a tenant at once
cache.invalidateTag(`tenant:${tenantId}`);
```

### Correlation ID Propagation

Request and correlation ID propagation for distributed tracing.

```typescript
app.use(correlationId());

// req.locals.requestId    — unique per request
// req.locals.correlationId — shared across service boundaries

// Headers automatically echoed:
// X-Request-Id: req_a1b2c3d4
// X-Correlation-Id: corr_x9y8z7w6
```

### Health Aggregation

Aggregate health status from multiple downstream services.

```typescript
const aggregator = new HealthAggregator([
  { name: 'auth-service',    url: 'http://auth:3001/health' },
  { name: 'payment-service', url: 'http://payments:3002/health' },
  { name: 'search-service',  url: 'http://search:3003/health', timeoutMs: 2000 },
]);

const report = await aggregator.check();
// {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   services: [{ name, status, latencyMs, error? }],
//   timestamp: '2025-08-21T...'
// }
```

---

## Request Lifecycle

Understanding how `@axiljs/cloud` middleware processes a request:

```text
┌───────────────────────────────────────────────────────────────┐
│                     INCOMING HTTP REQUEST                     │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  correlationId()                                              │
│  → Generate req_xxx and corr_yyy                              │
│  → Attach to req.locals                                       │
│  → Echo in response headers                                   │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  multiTenancy()                                               │
│  → Extract tenant ID from header/subdomain/JWT                │
│  → Validate format                                            │
│  → Load tenant from database                                  │
│  → Reject if suspended/archived                               │
│  → Attach to req.locals.tenant                                │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  tenantRateLimiter()                                          │
│  → Look up tenant-specific rule                               │
│  → Increment sliding window counter                           │
│  → Set X-RateLimit-* headers                                  │
│  → Return 429 if exceeded                                     │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  auditMiddleware()                                            │
│  → Register response 'finish' and 'close' handlers            │
│  → On completion: emit 'audit.log' event                      │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                   YOUR BUSINESS LOGIC                         │
│                                                               │
│  • Use getTenant(req) for tenant context                      │
│  • Use featureFlags.isEnabled() for A/B testing               │
│  • Use quotas.increment() to track resource usage             │
│  • Use cache.get()/set() for performance                      │
│  • Use secrets.get() for credentials                          │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    RESPONSE SENT TO CLIENT                    │
│                                                               │
│  Audit event automatically emitted on 'finish'                │
└───────────────────────────────────────────────────────────────┘
```

---

## Integration with AxilJS Ecosystem

`@axiljs/cloud` is designed to work seamlessly with every other AxilJS package:

| Package                    | Integration                                                                 |
|----------------------------|-----------------------------------------------------------------------------|
| `@axiljs/core`             | Uses `Application`, `MiddlewareFn`, `RouteHandler` types                    |
| `@axiljs/common`           | Extends `axilRequest`, `axilResponse`, throws `UnauthorizedError`           |
| `@axiljs/events`           | Emits audit and quota events on the global event bus                        |
| `@axiljs/observability`    | Dashboard pulls from `MetricsRegistry` and `HealthChecker`                  |
| `@axiljs/security`         | Rate limiter complements `helmet()` and `cors()`                            |
| `@axiljs/auth`             | JWT strategy extracts `tenantId` from `req.locals.user`                     |
| `@axiljs/config`           | Secrets manager pairs with `defineConfig()` for typed env                   |
| `@axiljs/orm`              | Tenant context can be injected into query builders                          |
| `@axiljs/queue`            | Audit events can be routed to durable job queues                            |
| `@axiljs/websocket`        | Correlation IDs propagate to WebSocket sessions                             |

### Example: Full Integration

```typescript
import { Application } from '@axiljs/core';
import { loadEnv, defineConfig } from '@axiljs/config';
import { helmet, cors } from '@axiljs/security';
import { JWT, authenticate } from '@axiljs/auth';
import { MetricsRegistry, HealthChecker, observabilityMiddleware } from '@axiljs/observability';
import {
  correlationId,
  multiTenancy,
  tenantRateLimiter,
  auditMiddleware,
  featureFlags,
  quotas,
  cache,
  secrets,
  createDashboard,
} from '@axiljs/cloud';

loadEnv();
const config = defineConfig({ /* ... */ });
const jwt = new JWT(config.JWT_SECRET);
const metrics = new MetricsRegistry();
const health = new HealthChecker();

const app = new Application();

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(observabilityMiddleware({ metrics }));
app.use(correlationId());
app.use(authenticate(jwt, { required: false }));
app.use(multiTenancy({ strategy: 'jwt' }));
app.use(tenantRateLimiter({ defaultRule: { max: 100, windowMs: 60_000 } }));
app.use(auditMiddleware());

app.get('/dashboard', createDashboard({ /* ... */ }));
app.get('/health', health.handler());
app.get('/metrics', /* metrics handler */);

app.listen(3000);
```

---

## Testing

The `@axiljs/cloud` package ships with **54 tests across 12 test suites**, all passing.

```bash
npm test
```

```text
 ✓ tests/multi-tenancy.test.ts     (10 tests)
 ✓ tests/audit.test.ts             (2 tests)
 ✓ tests/feature-flags.test.ts     (4 tests)
 ✓ tests/deployment.test.ts        (2 tests)
 ✓ tests/dashboard.test.ts         (1 test)
 ✓ tests/rate-limiter.test.ts      (3 tests)
 ✓ tests/secrets.test.ts           (4 tests)
 ✓ tests/quota.test.ts             (4 tests)
 ✓ tests/cache.test.ts             (3 tests)
 ✓ tests/correlation.test.ts       (2 tests)
 ✓ tests/e2e.test.ts               (2 tests)
 ✓ tests/cloud-hardening.test.ts   (17 tests)

 Test Files  12 passed (12)
      Tests  54 passed (54)
```

The suite covers:

- Middleware lifecycle correctness
- Tenant resolution across all strategies
- Deterministic feature flag evaluation
- Audit event emission and ordering
- Rate-limit fixed and sliding window behaviour, 429 for any response shape
- Encryption round-trip integrity for secrets
- Quota period rollover and warning events
- Cache invalidation by tag
- Correlation ID header propagation
- Deployment manifest generation
- End-to-end integrated request flows

---

## Future Development

`@axiljs/cloud` is a foundation for a broader cloud-native platform. Planned enhancements include:

### Control Plane

- Cloud Management API
- Project and environment lifecycle management
- Multi-cluster deployment orchestration
- Centralized logging pipeline
- Distributed tracing collector
- Web-based tenant administration console

### Cloud Provider Integrations

- **AWS** — EKS, RDS, S3, KMS, CloudWatch
- **Azure** — AKS, Cosmos DB, Blob Storage, Key Vault
- **GCP** — GKE, Cloud SQL, Cloud Storage, Secret Manager

### Distributed Backends

- Redis-backed feature flag and cache providers
- NATS and Kafka event bus adapters
- Cross-instance quota and rate-limit synchronization

---

## Contributing

`@axiljs/cloud` is part of the AxilJS monorepo. Contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Write tests for your changes
4. Ensure all tests pass: `npm test`
5. Ensure the build succeeds: `npm run build`
6. Submit a pull request

### Coding Standards

- 100% TypeScript with strict mode
- All public APIs must have JSDoc documentation
- Every module must have accompanying tests
- No untyped `any` in public API surfaces
- Follow the existing code style (Prettier-compatible)

---

## License

MIT © [Tariq Mehmood](https://github.com/TariqMehmood1004) and the AxilJS contributors.

---

## Links

- **AxilJS Homepage:** [https://axiljs.dev](https://axiljs.dev)
- **Documentation:** [https://docs.axiljs.dev/cloud](https://docs.axiljs.dev/cloud)
- **GitHub:** [https://github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
- **Issues:** [https://github.com/SyntaxilitY/AxilJS/issues](https://github.com/SyntaxilitY/AxilJS/issues)
- **Discussions:** [https://github.com/SyntaxilitY/AxilJS/discussions](https://github.com/SyntaxilitY/AxilJS/discussions)