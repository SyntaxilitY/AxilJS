# @axiljs/decorator

Semantic decorators and metadata for the AxilJS ecosystem.

Decorators declare capabilities and constraints without binding application code to a specific runtime or framework.

## Install

```bash
npm install @axiljs/decorator
```

Requires:

* Node.js 18+
* TypeScript 5+

## Example

```ts
import {
  tHttp,
  tAuth,
  tDatabase,
  tCache,
  tAudit,
} from '@axiljs/decorator'

class UserController {
  @tHttp({ method: 'GET', path: '/users/:id' })
  @tAuth()
  @tCache({
    key: (id: string) => `user:${id}`,
    ttl: 60_000,
  })
  @tDatabase({ operation: 'read' })
  @tAudit({ action: 'user.viewed' })
  async findOne(id: string) {
    return this.userService.findById(id)
  }
}
```

Decorators register metadata. Consumers decide what that metadata means.

```text
Application code
      ↓
  decorators
      ↓
metadata registry
      ↓
independent consumers
```

Consumers can include HTTP, security, ORM, queue, events, observability, cloud, or custom tooling.

## Naming

AxilJS semantic decorators use the `t*` convention:

```ts
@tHttp()
@tDatabase()
@tAuth()
@tCache()
```

Types use the `T*` convention:

```ts
TDecoratorInfo
THttpOptions
TDatabaseOptions
```

## Metadata

```ts
import {
  registerMetadata,
  getMetadata,
  getAllMetadata,
  hasMetadata,
} from '@axiljs/decorator'
```

Register metadata:

```ts
registerMetadata(
  'tDatabase',
  target,
  propertyKey,
  { operation: 'read' }
)
```

Read metadata:

```ts
const meta = getMetadata<TDatabaseOptions>(
  'tDatabase',
  target,
  propertyKey
)
```

Read all metadata:

```ts
const metadata = getAllMetadata(target, propertyKey)
```

Check for metadata:

```ts
const exists = hasMetadata(
  'tDatabase',
  target,
  propertyKey
)
```

## Decorator Contract

Every built-in decorator has a `TDecoratorInfo` definition.

```ts
interface TDecoratorInfo {
  name: string
  description: string
  purpose: string
  category: string
  targets: Array<
    'class' |
    'method' |
    'property' |
    'parameter'
  >
  options?: Record<string, unknown>
  runtimeBehavior?: string
  metadataProduced?: string[]
  consumedBy?: string[]
  composesWith?: string[]
  conflictsWith?: string[]
  examples: string[]
}
```

This metadata is used for documentation, introspection, validation, and tooling.

## Decorators

### HTTP

| Decorator   | Purpose                   |
| ----------- | ------------------------- |
| `tHttp`     | Declare HTTP endpoint     |
| `tParam`    | Bind route parameter      |
| `tQuery`    | Bind query parameter      |
| `tBody`     | Bind request body         |
| `tHeader`   | Bind request header       |
| `tCookie`   | Bind cookie               |
| `tFile`     | Bind uploaded file        |
| `tRedirect` | Declare redirect          |
| `tRender`   | Declare template response |
| `tSse`      | Declare SSE endpoint      |
| `tStatus`   | Set HTTP status           |

### Database

| Decorator           | Purpose                   |
| ------------------- | ------------------------- |
| `tDatabase`         | Declare database behavior |
| `tTransaction`      | Transaction boundary      |
| `tDatabaseRead`     | Read-only operation       |
| `tDatabaseWrite`    | Write operation           |
| `tDatabaseCache`    | Database result caching   |
| `tDatabaseReadOnly` | Forbid writes             |
| `tIsolation`        | Transaction isolation     |
| `tEntity`           | Declare entity            |
| `tColumn`           | Declare column            |
| `tPrimaryKey`       | Declare primary key       |
| `tRelation`         | Declare relation          |

### Security

| Decorator        | Purpose                    |
| ---------------- | -------------------------- |
| `tAuth`          | Authentication requirement |
| `tRateLimit`     | Rate limiting              |
| `tCsrf`          | CSRF protection            |
| `tSanitize`      | Input sanitization         |
| `tEncrypt`       | Response encryption        |
| `tSign`          | Response signing           |
| `tIpAllowList`   | IP restriction             |
| `tVerifiedEmail` | Require verified email     |

### Policy

| Decorator     | Purpose                        |
| ------------- | ------------------------------ |
| `tPolicy`     | Named authorization policy     |
| `tRole`       | Role requirement               |
| `tPermission` | Permission requirement         |
| `tOwnership`  | Resource ownership             |
| `tCondition`  | Expression-based authorization |

### Cache

| Decorator          | Purpose             |
| ------------------ | ------------------- |
| `tCache`           | Cache method result |
| `tCacheEvict`      | Invalidate cache    |
| `tCachePut`        | Update cache        |
| `tCacheInvalidate` | Invalidate by tag   |

### Queue

| Decorator     | Purpose               |
| ------------- | --------------------- |
| `tQueue`      | Declare queue         |
| `tJob`        | Declare job handler   |
| `tEnqueue`    | Enqueue work          |
| `tOnJobEvent` | Job lifecycle handler |

### Events

| Decorator  | Purpose               |
| ---------- | --------------------- |
| `tOnEvent` | Subscribe to event    |
| `tEmit`    | Emit event            |
| `tOnce`    | One-time subscription |

### Runtime

| Decorator         | Purpose                |
| ----------------- | ---------------------- |
| `tRetry`          | Retry failed execution |
| `tTimeout`        | Execution timeout      |
| `tCircuitBreaker` | Circuit breaker        |
| `tFallback`       | Failure fallback       |
| `tIdempotent`     | Idempotency            |
| `tDebounce`       | Debounce calls         |
| `tThrottle`       | Throttle calls         |
| `tMemoize`        | Memoize results        |
| `tLazy`           | Lazy resolution        |

### Observability

| Decorator      | Purpose             |
| -------------- | ------------------- |
| `tTrace`       | Distributed tracing |
| `tMetric`      | Metric collection   |
| `tLog`         | Structured logging  |
| `tHealthCheck` | Health check        |

### AI

| Decorator     | Purpose                 |
| ------------- | ----------------------- |
| `tAIComplete` | LLM completion          |
| `tAIEmbed`    | Generate embeddings     |
| `tAIRAG`      | RAG operation           |
| `tAIGuard`    | AI-based content checks |

### Cloud / Tenant

| Decorator         | Purpose            |
| ----------------- | ------------------ |
| `tTenant`         | Tenant context     |
| `tTenantIsolated` | Tenant-scoped data |
| `tAudit`          | Audit logging      |
| `tQuota`          | Quota enforcement  |
| `tFeatureFlag`    | Feature flag       |

### Validation

| Decorator                   | Purpose            |
| --------------------------- | ------------------ |
| `tString`                   | String validation  |
| `tNumber`                   | Number validation  |
| `tBoolean`                  | Boolean validation |
| `tEmail`                    | Email validation   |
| `tUrl`                      | URL validation     |
| `tUuid`                     | UUID validation    |
| `tMin` / `tMax`             | Numeric bounds     |
| `tMinLength` / `tMaxLength` | String length      |
| `tPattern`                  | Regex validation   |
| `tEnum`                     | Enum validation    |
| `tOptional`                 | Optional value     |
| `tNested`                   | Nested validation  |
| `tArray`                    | Array validation   |
| `tCustom`                   | Custom validation  |

### Lifecycle

| Decorator      | Purpose             |
| -------------- | ------------------- |
| `tOnInit`      | Initialization hook |
| `tOnDestroy`   | Destruction hook    |
| `tOnBootstrap` | Bootstrap hook      |
| `tOnShutdown`  | Shutdown hook       |
| `tOnReady`     | Ready hook          |

## Custom Decorators

Custom decorators can use the same registry and contract.

```ts
import {
  defineDecorator,
  registerMetadata,
  getMetadata,
  TDecoratorInfo,
} from '@axiljs/decorator'

interface TWebhookOptions {
  event: string
  version?: string
}

const info: TDecoratorInfo = {
  name: 'tWebhook',
  description: 'Webhook handler',
  purpose: 'Declares a webhook receiver',
  category: 'Integration',
  targets: ['method'],
  options: {
    event: 'Webhook event',
    version: 'API version',
  },
  examples: [
    '@tWebhook({ event: "payment.completed" })',
  ],
}

export function tWebhook(options: TWebhookOptions) {
  return defineDecorator(
    info,
    (target, propertyKey) => {
      registerMetadata(
        'tWebhook',
        target,
        propertyKey,
        options
      )
    }
  )
}
```

Consume the metadata from any runtime or tooling:

```ts
const metadata = getMetadata<TWebhookOptions>(
  'tWebhook',
  target,
  propertyKey
)
```

## Composition

Decorators can define compatible and conflicting combinations.

```ts
@tHttp({ method: 'GET', path: '/users/:id' })
@tAuth()
@tCache({ key: id => `user:${id}`, ttl: 60_000 })
@tDatabase({ operation: 'read' })
async getUser(id: string) {}
```

Composition can be validated with:

```ts
import { validateComposition } from '@axiljs/decorator'

const result = validateComposition(
  target,
  propertyKey
)

if (!result.valid) {
  console.error(result.errors)
}
```

## Introspection

```ts
import {
  listDecorators,
  getDecoratorInfo,
  searchDecorators,
} from '@axiljs/decorator'

listDecorators()

getDecoratorInfo('tDatabase')

searchDecorators('cache')
```

## API

```ts
registerMetadata()
getMetadata()
getAllMetadata()
hasMetadata()

defineDecorator()

listDecorators()
getDecoratorInfo()
searchDecorators()

validateComposition()
```

## CLI

```bash
axil decorator list
axil decorator info tDatabase
axil decorator search cache
axil decorator check src/users/user.controller.ts
axil decorator graph
```

## Design

`@axiljs/decorator` only defines metadata.

It does not own:

* HTTP routing
* database execution
* authentication
* queue infrastructure
* event transport
* cloud providers
* AI providers

Those are handled by independent consumers.

## License

MIT

```

This version removes the large architecture diagrams, repeated `TDecoratorInfo` blocks for individual decorators, the long NestJS comparison, migration section, verbose CLI output, marketing copy, and duplicated explanations. It reads much more like a package README than a full documentation site.

I would also rename the tagline from:

> “Decorators as capabilities and constraints — not framework architecture.”

to simply:

> **Semantic decorators and metadata for AxilJS.**

That is enough for a developer landing on the npm/GitHub package.
```
