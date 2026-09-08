# AxilJS Decorators

Semantic decorators for backend systems.

AxilJS decorators describe behavior, constraints, execution semantics, and system capabilities. They are not tied to controllers, modules, guards, pipes, or other framework architecture.

```text
Application
    ↓
Semantic Decorators
    ↓
Metadata
    ↓
Runtime / ORM / Queue / Security / Cloud / AI / Observability
```

## Design Principles

* Semantic, not framework-specific
* Runtime-independent metadata
* Composable
* Type-safe
* Introspectable
* Suitable for distributed systems
* Usable by independent consumers

---

# 1. HTTP

Keep HTTP semantics because they describe the actual API contract.

```ts
@tHttp({ method: 'GET', path: '/users/:id' })
@tParam('id')
@tQuery('page')
@tBody()
@tHeader('authorization')
@tCookie('session')
@tFile()
@tSse()
@tRedirect()
@tStatus(201)
```

Core decorators:

| Decorator   | Purpose                  |
| ----------- | ------------------------ |
| `tHttp`     | HTTP endpoint definition |
| `tParam`    | Route parameter          |
| `tQuery`    | Query parameter          |
| `tBody`     | Request body             |
| `tHeader`   | Header                   |
| `tCookie`   | Cookie                   |
| `tFile`     | File upload              |
| `tSse`      | SSE stream               |
| `tRedirect` | Redirect                 |
| `tStatus`   | Response status          |

Do not add `@Get`, `@Post`, `@Put`, etc. The single `tHttp` declaration is more consistent with semantic metadata.

```ts
@tHttp({
  method: 'POST',
  path: '/users',
})
async createUser() {}
```

---

# 2. Security

Keep security declarations, but make them policy-oriented rather than guard-oriented.

```ts
@tAuth()
@tRole('admin')
@tPermission('users.write')
@tPolicy('user.owner')
@tRateLimit({
  limit: 10,
  window: '1m',
})
async updateUser() {}
```

Core decorators:

| Decorator        | Purpose                       |
| ---------------- | ----------------------------- |
| `tAuth`          | Authentication requirement    |
| `tRole`          | Role requirement              |
| `tPermission`    | Permission requirement        |
| `tPolicy`        | Policy evaluation             |
| `tRateLimit`     | Request rate limit            |
| `tCsrf`          | CSRF requirement              |
| `tSanitize`      | Input sanitization            |
| `tIpAllowList`   | Network restriction           |
| `tVerifiedEmail` | Verified identity requirement |

---

# 3. Data Semantics

This is where AxilJS should go beyond traditional backend frameworks.

```ts
@tDatabase({ operation: 'read' })
@tTransaction()
@tIsolation('serializable')
@tConsistent('strong')
async transfer() {}
```

Core:

| Decorator         | Purpose                      |
| ----------------- | ---------------------------- |
| `tDatabase`       | Database operation semantics |
| `tTransaction`    | Transaction boundary         |
| `tIsolation`      | Transaction isolation        |
| `tConsistent`     | Consistency requirement      |
| `tReadOnly`       | Prevent writes               |
| `tTenantIsolated` | Tenant-scoped data           |
| `tEntity`         | Entity declaration           |
| `tColumn`         | Column declaration           |
| `tRelation`       | Relation declaration         |

### New: `tConsistent`

Declare the consistency required by an operation.

```ts
@tConsistent('strong')
async getBalance() {}
```

Possible values:

```ts
'strong'
'eventual'
'snapshot'
'bounded'
```

The runtime/ORM can decide how to satisfy the requirement.

---

# 4. Concurrency

Backend systems frequently need concurrency semantics that are normally buried inside services.

AxilJS should expose them explicitly.

```ts
@tConcurrency({
  limit: 10,
  strategy: 'queue',
})
async processPayment() {}
```

Decorators:

| Decorator      | Purpose                         |
| -------------- | ------------------------------- |
| `tConcurrency` | Limit concurrent executions     |
| `tLock`        | Distributed/resource lock       |
| `tMutex`       | Mutual exclusion                |
| `tDedupe`      | Deduplicate concurrent requests |
| `tIdempotent`  | Enforce idempotency             |
| `tThrottle`    | Limit execution frequency       |
| `tDebounce`    | Collapse repeated calls         |

Example:

```ts
@tLock({
  key: orderId => `order:${orderId}`,
  ttl: 30_000,
})
@tIdempotent({
  key: 'request.id',
})
async processOrder(orderId: string) {}
```

This is especially useful for payment, inventory, order, and distributed job systems.

---

# 5. Distributed Reliability

This should be one of AxilJS's major differentiators.

```ts
@tTimeout(5000)
@tRetry({
  attempts: 3,
  backoff: 'exponential',
})
@tCircuitBreaker({
  threshold: 5,
})
async callPaymentProvider() {}
```

Core:

| Decorator         | Purpose                        |
| ----------------- | ------------------------------ |
| `tRetry`          | Retry failed operations        |
| `tTimeout`        | Execution deadline             |
| `tDeadline`       | Absolute execution deadline    |
| `tCircuitBreaker` | Circuit breaker                |
| `tFallback`       | Fallback behavior              |
| `tBulkhead`       | Isolate resource capacity      |
| `tHedge`          | Speculative parallel execution |
| `tIdempotent`     | Safe retry semantics           |

### New: `tBulkhead`

Prevent one workload from exhausting shared resources.

```ts
@tBulkhead({
  name: 'payment-provider',
  concurrency: 20,
  queue: 100,
})
async chargeCard() {}
```

### New: `tHedge`

Useful for latency-sensitive distributed calls.

```ts
@tHedge({
  delay: 100,
  maxAttempts: 2,
})
async getUserProfile() {}
```

The runtime can issue a second attempt when the first one exceeds the latency threshold.

---

# 6. Distributed Transactions

Instead of pretending every operation can use a database transaction, explicitly model distributed workflows.

### `tSaga`

```ts
@tSaga('order.create')
async createOrder() {}
```

### `tCompensate`

```ts
@tCompensate('payment.failed')
async refundPayment() {}
```

### `tStep`

```ts
@tStep('reserve-inventory')
async reserveInventory() {}
```

Example:

```ts
@tSaga('checkout')
class CheckoutWorkflow {

  @tStep('reserve-inventory')
  async reserveInventory() {}

  @tStep('charge-payment')
  async chargePayment() {}

  @tStep('create-order')
  async createOrder() {}

  @tCompensate('charge-payment')
  async refundPayment() {}
}
```

These describe distributed transaction semantics without requiring a specific workflow engine.

---

# 7. Events and Messaging

Keep event semantics.

```ts
@tOnEvent('user.created')
async handleUserCreated() {}

@tEmit('user.created')
async createUser() {}
```

Add delivery semantics:

```ts
@tEmit('payment.completed')
@tOutbox()
async completePayment() {}
```

Decorators:

| Decorator     | Purpose                         |
| ------------- | ------------------------------- |
| `tOnEvent`    | Event subscription              |
| `tEmit`       | Event publication               |
| `tOnce`       | One-time event handling         |
| `tOutbox`     | Transactional event publication |
| `tInbox`      | Idempotent event consumption    |
| `tMessage`    | Message semantics               |
| `tDeadLetter` | Dead-letter behavior            |

### `tOutbox`

This is particularly important.

```ts
@tTransaction()
@tOutbox()
async createOrder() {
  const order = await orders.create(data)

  return {
    order,
    events: [
      {
        type: 'order.created',
        payload: order,
      },
    ],
  }
}
```

The consumer can guarantee database state and event publication are coordinated.

---

# 8. Queue and Jobs

Keep the useful queue decorators, but add execution semantics.

```ts
@tQueue('emails')
class EmailWorker {

  @tJob('welcome-email')
  @tRetry({ attempts: 3 })
  @tTimeout(30_000)
  async sendWelcome() {}
}
```

Decorators:

| Decorator         | Purpose             |
| ----------------- | ------------------- |
| `tQueue`          | Queue declaration   |
| `tJob`            | Job handler         |
| `tEnqueue`        | Enqueue work        |
| `tRetry`          | Job retry           |
| `tJobTimeout`     | Job timeout         |
| `tJobPriority`    | Job priority        |
| `tJobConcurrency` | Job concurrency     |
| `tDeadLetter`     | Failed-job handling |

---

# 9. Caching

Keep caching, but expand it into cache semantics.

```ts
@tCache({
  key: id => `user:${id}`,
  ttl: 60_000,
})
async getUser(id: string) {}
```

Decorators:

| Decorator          | Purpose                |
| ------------------ | ---------------------- |
| `tCache`           | Cache result           |
| `tCacheEvict`      | Remove cached value    |
| `tCachePut`        | Update cache           |
| `tCacheInvalidate` | Tag-based invalidation |

### New: `tCacheStampede`

Protect expensive resources from cache stampedes.

```ts
@tCache({
  key: id => `product:${id}`,
  ttl: 60_000,
})
@tCacheStampede({
  strategy: 'single-flight',
})
async getProduct(id: string) {}
```

Multiple concurrent misses result in one underlying operation.

---

# 10. API Consistency

Backend APIs benefit from explicit response and contract semantics.

### `tContract`

```ts
@tContract({
  response: UserResponse,
})
async getUser() {}
```

### `tProduces`

```ts
@tProduces({
  contentType: 'application/json',
})
async getUser() {}
```

### `tConsumes`

```ts
@tConsumes('application/json')
async createUser() {}
```

### `tPaginated`

```ts
@tPaginated({
  item: User,
})
async listUsers() {}
```

These metadata declarations can be consumed by HTTP, OpenAPI, validation, SDK generation, and Studio.

---

# 11. Validation

Keep only useful semantic validation decorators.

```ts
@tString()
@tMinLength(2)
@tMaxLength(100)
name: string

@tEmail()
email: string

@tNumber()
@tMin(0)
age: number
```

Core:

```text
tString
tNumber
tBoolean
tEmail
tUrl
tUuid
tEnum
tPattern
tMin
tMax
tMinLength
tMaxLength
tOptional
tArray
tNested
tCustom
```

Do not introduce a separate NestJS-style `Pipe` abstraction just for validation.

---

# 12. Observability

Keep the basic observability decorators, but add backend-level semantics.

```ts
@tTrace('checkout')
@tMetric('checkout.total', 'counter')
@tLog('info')
async checkout() {}
```

New:

### `tSlo`

Declare a service-level objective.

```ts
@tSlo({
  latency: 300,
  percentile: 99,
})
async getUser() {}
```

### `tCritical`

Mark critical execution paths.

```ts
@tCritical()
async processPayment() {}
```

### `tSample`

Control telemetry sampling.

```ts
@tSample({
  rate: 0.1,
})
async healthCheck() {}
```

Decorators:

```text
tTrace
tMetric
tLog
tHealthCheck
tSlo
tCritical
tSample
```

---

# 13. Audit and Compliance

Keep `tAudit`.

Add explicit data classification.

### `tAudit`

```ts
@tAudit({
  action: 'user.password.changed',
})
async changePassword() {}
```

### `tSensitive`

```ts
@tSensitive('PII')
email: string
```

### `tRedact`

```ts
@tRedact()
password: string
```

### `tRetention`

```ts
@tRetention({
  duration: '90d',
})
auditLog: AuditLog
```

Decorators:

```text
tAudit
tSensitive
tRedact
tRetention
```

These can be consumed by logging, database, observability, compliance, and export tooling.

---

# 14. Multi-Tenancy

Keep tenant semantics.

```ts
@tTenant()
@tTenantIsolated()
async findUsers() {}
```

Add:

### `tTenantBoundary`

```ts
@tTenantBoundary('strict')
async updateUser() {}
```

This declares that cross-tenant access is forbidden.

### `tCrossTenant`

Explicitly mark administrative cross-tenant operations.

```ts
@tCrossTenant({
  reason: 'platform-admin',
})
async inspectTenant() {}
```

This makes dangerous operations explicit and auditable.

---

# 15. Feature and Runtime Control

Keep feature flags.

```ts
@tFeatureFlag('new-checkout')
async checkout() {}
```

Add:

### `tExperiment`

```ts
@tExperiment({
  name: 'checkout-v2',
  variants: ['control', 'new'],
})
async checkout() {}
```

### `tRollout`

```ts
@tRollout({
  percentage: 10,
})
async newFeature() {}
```

These can be consumed by cloud/runtime infrastructure without coupling application code to a provider.

---

# 16. Resource Semantics

A backend operation often consumes resources that need explicit limits.

### `tResource`

```ts
@tResource({
  cpu: '500m',
  memory: '256Mi',
})
async generateReport() {}
```

### `tConcurrency`

```ts
@tConcurrency({
  limit: 5,
})
async generateReport() {}
```

### `tQuota`

```ts
@tQuota({
  resource: 'ai.tokens',
  amount: 1000,
})
async generateSummary() {}
```

This gives AxilJS a semantic layer for resource-aware execution.

---

# 17. AI Semantics

Keep AI decorators, but make them provider-independent.

```ts
@tAIComplete({
  task: 'summarization',
})
async summarize(text: string) {}
```

```ts
@tAIEmbed()
async embedDocument(text: string) {}
```

```ts
@tAIRAG({
  collection: 'documents',
})
async answer(question: string) {}
```

Add:

### `tAIGuard`

```ts
@tAIGuard({
  policies: ['toxicity', 'pii'],
  action: 'block',
})
async generateContent() {}
```

### `tAITokenBudget`

```ts
@tAITokenBudget({
  maxInput: 4000,
  maxOutput: 1000,
})
async summarize() {}
```

### `tAIModel`

```ts
@tAIModel({
  capability: 'reasoning',
})
async analyze() {}
```

The decorator describes the required capability rather than forcing an application to a provider.

---

# 18. Workflow Semantics

Introduce a generic workflow model.

```ts
@tWorkflow('document-processing')
class DocumentWorkflow {

  @tStep('extract')
  async extract() {}

  @tStep('classify')
  async classify() {}

  @tStep('index')
  async index() {}
}
```

Useful decorators:

```text
tWorkflow
tStep
tCompensate
tCheckpoint
tResume
tTimeout
tRetry
```

### `tCheckpoint`

```ts
@tCheckpoint('after-index')
async indexDocument() {}
```

A workflow runtime can resume from the checkpoint instead of restarting the entire workflow.

---

# 19. Execution Semantics

This should be a core AxilJS concept.

### `tAtomic`

Declare that an operation must appear atomic to its consumer.

```ts
@tAtomic()
async incrementBalance() {}
```

### `tPure`

Declare that an operation must not produce external side effects.

```ts
@tPure()
async calculatePrice() {}
```

### `tReadOnly`

```ts
@tReadOnly()
async calculateReport() {}
```

### `tSideEffect`

Explicitly identify side-effecting operations.

```ts
@tSideEffect('external-api')
async notifyPaymentProvider() {}
```

These declarations enable static analysis and runtime validation.

---

# 20. Scheduling

Backend applications frequently need scheduled execution.

```ts
@tSchedule('0 */5 * * *')
async syncProducts() {}
```

Additional semantics:

```ts
@tSchedule({
  cron: '0 0 * * *',
  timezone: 'UTC',
  overlap: 'skip',
})
async dailyCleanup() {}
```

Decorators:

```text
tSchedule
tInterval
tDelay
tRunAt
```

---

# 21. API Deprecation

### `tDeprecated`

```ts
@tDeprecated({
  since: '2.0',
  removeAfter: '3.0',
  replacement: '/v3/users',
})
async oldEndpoint() {}
```

Consumers can use this for OpenAPI, Studio, runtime warnings, and SDK generation.

---

# 22. Backend Capability Declaration

A particularly useful AxilJS concept is declaring what an operation requires.

### `tRequires`

```ts
@tRequires([
  'database',
  'redis',
  'payments',
])
async checkout() {}
```

### `tProvides`

```ts
@tProvides('payment.completed')
async processPayment() {}
```

This allows tooling to construct dependency/capability graphs without coupling the application to a module architecture.

---

# Recommended Core Set

Do not ship 100+ decorators immediately.

Start with a strong core:

```text
HTTP
────
tHttp
tParam
tQuery
tBody
tHeader
tCookie
tFile
tSse
tStatus

Security
────────
tAuth
tRole
tPermission
tPolicy
tRateLimit
tCsrf
tSanitize

Data
────
tDatabase
tTransaction
tIsolation
tConsistent
tReadOnly
tEntity
tColumn
tRelation
tTenantIsolated

Reliability
───────────
tRetry
tTimeout
tDeadline
tCircuitBreaker
tFallback
tBulkhead
tHedge

Concurrency
───────────
tConcurrency
tLock
tMutex
tDedupe
tIdempotent

Distributed Systems
────────────────────
tSaga
tStep
tCompensate
tOutbox
tInbox
tCheckpoint

Messaging
─────────
tOnEvent
tEmit
tOnce
tQueue
tJob
tEnqueue
tDeadLetter

Caching
───────
tCache
tCacheEvict
tCachePut
tCacheInvalidate
tCacheStampede

Observability
─────────────
tTrace
tMetric
tLog
tHealthCheck
tSlo
tCritical
tSample

Compliance
──────────
tAudit
tSensitive
tRedact
tRetention

Runtime
───────
tFeatureFlag
tExperiment
tRollout
tQuota
tSchedule

Workflow
────────
tWorkflow
tStep
tCheckpoint
tResume
tCompensate

AI
──
tAIComplete
tAIEmbed
tAIRAG
tAIGuard
tAIModel
tAITokenBudget

API Contract
────────────
tContract
tConsumes
tProduces
tPaginated
tDeprecated

Execution
─────────
tAtomic
tPure
tSideEffect
tRequires
tProvides
```

## What Should Be Removed

Do not build AxilJS decorators around these NestJS-style abstractions:

```text
@Injectable
@Controller
@Module
@Global
@UseGuards
@UsePipes
@UseInterceptors
@UseFilters
@Middleware
```

They describe framework architecture rather than backend semantics.

Also avoid duplicating HTTP verbs:

```text
@Get
@Post
@Put
@Patch
@Delete
@All
```

Use:

```ts
@tHttp({
  method: 'POST',
  path: '/users',
})
```

Avoid framework-specific decorators such as:

```text
@SetMetadata
@Catch
@UseMiddleware
@UseGuards
@UseInterceptors
```

They can be replaced by AxilJS metadata and semantic consumers.

## The AxilJS Model

The final architecture should look like this:

```text
                    Application Code
                          │
                          ▼
                 Semantic Decorators
                          │
                          ▼
                 Metadata Registry
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
        ▼                 ▼                  ▼
      Runtime            ORM              Security
        │                 │                  │
        ├──── Queue ──────┼──── Events ──────┤
        │                 │                  │
        ├── Observability ├── Cloud ─────────┤
        │                 │                  │
        └─────────────────┴──── AI ──────────┘
```

The important distinction is:

```text
NestJS approach
────────────────
Framework
  └── Controller
       └── Guard
            └── Pipe
                 └── Interceptor
                      └── Service


AxilJS approach
────────────────
Application
  └── Semantic declarations
       ├── HTTP
       ├── Security
       ├── Data
       ├── Reliability
       ├── Concurrency
       ├── Workflow
       ├── Events
       ├── Observability
       ├── Cloud
       └── AI
              ↓
       Independent consumers
```

That is the direction I would take if the objective is to make `@axiljs/decorator` a genuinely distinctive package rather than another NestJS-style decorator library.
