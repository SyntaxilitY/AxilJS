/**
 * Bundled AxilJS decorator catalog for CLI introspection.
 *
 * Mirrors the TDecoratorInfo contracts registered by @axiljs/decorator.
 * The catalog is bundled directly in the CLI so `axil decorator` works
 * even when @axiljs/decorator is not installed in the current project.
 *
 * IMPORTANT: when a decorator is added or changed in @axiljs/decorator,
 * this catalog must be updated to match.
 *
 * Complete catalog: HTTP + all semantic categories.
 */

export interface TDecoratorInfo {
  name: string
  description: string
  purpose: string
  why: string
  whenToUse: string
  whenNotToUse?: string
  category: string
  targets: string[]
  options?: Record<string, string>
  runtimeBehavior?: string
  metadataProduced?: string[]
  consumedBy?: string[]
  composesWith?: string[]
  conflictsWith?: string[]
  securityImpact?: string
  performanceImpact?: string
  examples: string[]
}

const HTTP_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tHttp',
    description: 'Declares an HTTP-accessible endpoint',
    purpose: 'Marks a method as reachable via HTTP with specified method and path',
    why: 'A single semantic declaration replaces framework-specific method decorators',
    whenToUse: 'On any method that should be exposed via HTTP',
    whenNotToUse: 'On internal service methods or background jobs',
    category: 'HTTP',
    targets: ['method'],
    options: {
      method: 'HTTP method (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ALL)',
      path: 'URL path with optional :params',
      version: 'API version string',
      prefix: 'Route prefix override'
    },
    metadataProduced: ['http.method', 'http.path', 'http.version'],
    consumedBy: ['@axiljs/core', 'OpenAPI Generator', '@axiljs/studio'],
    composesWith: ['tAuth', 'tRateLimit', 'tCache', 'tAudit'],
    examples: [
      '@tHttp({ method: "GET", path: "/users" })',
      '@tHttp({ method: "POST", path: "/users", version: "2" })'
    ]
  },
  {
    name: 'tParam',
    description: 'Binds a URL path parameter to a handler argument',
    purpose: 'Extracts a named path segment and passes it to the handler',
    why: 'Declarative parameter binding removes ad-hoc request parsing',
    whenToUse: 'When a handler needs access to a URL path segment',
    category: 'HTTP',
    targets: ['parameter'],
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp'],
    examples: ['@tParam("id")']
  },
  {
    name: 'tQuery',
    description: 'Binds a query string parameter to a handler argument',
    purpose: 'Extracts a named query parameter and passes it to the handler',
    why: 'Declarative query binding removes ad-hoc request parsing',
    whenToUse: 'When a handler needs access to query string data',
    category: 'HTTP',
    targets: ['parameter'],
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp'],
    examples: ['@tQuery("page")', '@tQuery("sort")']
  },
  {
    name: 'tBody',
    description: 'Binds the request body to a handler argument',
    purpose: 'Extracts the parsed request body or a specific field',
    why: 'Declarative body binding removes ad-hoc request parsing',
    whenToUse: 'When a handler needs access to the request body',
    category: 'HTTP',
    targets: ['parameter'],
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp', 'tSanitize'],
    examples: ['@tBody()', '@tBody("email")']
  },
  {
    name: 'tHeader',
    description: 'Binds a request header to a handler argument',
    purpose: 'Extracts a named header value',
    why: 'Declarative header binding removes ad-hoc request parsing',
    whenToUse: 'When a handler needs access to a specific header',
    category: 'HTTP',
    targets: ['parameter'],
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp'],
    examples: ['@tHeader("authorization")']
  },
  {
    name: 'tCookie',
    description: 'Binds a cookie to a handler argument',
    purpose: 'Extracts a named cookie value',
    why: 'Declarative cookie binding removes ad-hoc request parsing',
    whenToUse: 'When a handler needs access to a cookie',
    category: 'HTTP',
    targets: ['parameter'],
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp'],
    examples: ['@tCookie("session_id")']
  },
  {
    name: 'tFile',
    description: 'Binds an uploaded file to a handler argument',
    purpose: 'Provides multipart file upload binding with size and MIME validation',
    why: 'File handling is a first-class HTTP semantic',
    whenToUse: 'On endpoints that accept file uploads',
    category: 'HTTP',
    targets: ['parameter'],
    options: {
      maxSize: 'Maximum file size in bytes',
      mimeTypes: 'Allowed MIME types array',
      multiple: 'Accept multiple files'
    },
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp', 'tSanitize'],
    examples: ['@tFile({ maxSize: 5_000_000, mimeTypes: ["image/*"] })']
  },
  {
    name: 'tSse',
    description: 'Declares a Server-Sent Events stream endpoint',
    purpose: 'Marks a method as a long-lived SSE response stream',
    why: 'SSE is a distinct HTTP semantic that must be declared explicitly',
    whenToUse: 'On endpoints that push server events to the client',
    category: 'HTTP',
    targets: ['method'],
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp', 'tAuth'],
    examples: ['@tSse()']
  },
  {
    name: 'tStatus',
    description: 'Overrides the default HTTP status code',
    purpose: 'Sets a fixed HTTP status code on the response',
    why: 'Status semantics are separate from routing semantics',
    whenToUse: 'When an endpoint must always respond with a specific status',
    category: 'HTTP',
    targets: ['method'],
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp'],
    examples: ['@tStatus(202)', '@tStatus(204)']
  },
  {
    name: 'tRedirect',
    description: 'Declares a redirect response',
    purpose: 'Marks the endpoint as returning a redirect status and Location header',
    why: 'Redirects are a semantic contract worth declaring at the route level',
    whenToUse: 'On endpoints that always redirect to another URL',
    category: 'HTTP',
    targets: ['method'],
    consumedBy: ['@axiljs/core'],
    composesWith: ['tHttp'],
    examples: ['@tRedirect({ url: "/new", status: 301 })']
  }
]
// ============================================================================
// SECURITY
// ============================================================================

const SECURITY_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tAuth',
    description: 'Declares authentication requirements',
    purpose: 'Marks a method or class as requiring authenticated access',
    why: 'Separates auth policy declaration from provider implementation',
    whenToUse: 'On any endpoint that must not be accessible anonymously',
    whenNotToUse: 'On public endpoints like health checks or registration',
    category: 'Security',
    targets: ['method', 'class'],
    securityImpact: 'CRITICAL — misconfiguration exposes protected data',
    consumedBy: ['@axiljs/security', '@axiljs/auth', 'OpenAPI Generator'],
    composesWith: ['tRole', 'tPermission', 'tPolicy', 'tRateLimit'],
    examples: ['@tAuth()', '@tAuth({ mfa: true })']
  },
  {
    name: 'tRole',
    description: 'Requires one of the listed roles',
    purpose: 'Restricts execution to callers holding one of the given roles',
    why: 'Role-based access is a common semantic worth declaring at the callsite',
    whenToUse: 'When access is decided solely by role membership',
    whenNotToUse: 'When access depends on ownership or relationships — use tPolicy',
    category: 'Security',
    targets: ['method', 'class'],
    securityImpact: 'HIGH',
    consumedBy: ['@axiljs/security', 'Policy Engine'],
    composesWith: ['tAuth', 'tPermission', 'tPolicy'],
    examples: ['@tRole("admin")', '@tRole("admin", "editor")']
  },
  {
    name: 'tPermission',
    description: 'Requires all listed permissions',
    purpose: 'Restricts execution to callers holding every listed permission',
    why: 'Fine-grained permission checks are a first-class access semantic',
    whenToUse: 'When access requires granular capability checks',
    category: 'Security',
    targets: ['method', 'class'],
    securityImpact: 'HIGH',
    consumedBy: ['@axiljs/security', 'Policy Engine'],
    composesWith: ['tAuth', 'tRole', 'tPolicy'],
    examples: ['@tPermission("users.write")', '@tPermission("orders.read", "orders.update")']
  },
  {
    name: 'tPolicy',
    description: 'Declares an authorization policy',
    purpose: 'References a named policy that must evaluate true for access',
    why: 'Decouples authorization logic from route handlers via named policies',
    whenToUse: 'When access depends on relationships (ownership, membership, state)',
    whenNotToUse: 'For simple role checks — use tRole instead',
    category: 'Policy',
    targets: ['method', 'class'],
    securityImpact: 'HIGH — policy evaluation determines access',
    consumedBy: ['Policy Engine', '@axiljs/security'],
    composesWith: ['tAuth', 'tRole', 'tPermission'],
    examples: ['@tPolicy("OrderOwnership")', '@tPolicy("TenantAdmin")']
  },
  {
    name: 'tRateLimit',
    description: 'Declares rate limiting rules',
    purpose: 'Constrains how frequently an operation may execute',
    why: 'Rate limiting is a semantic constraint worth declaring at the callsite',
    whenToUse: 'On endpoints susceptible to abuse or expensive operations',
    category: 'Security',
    targets: ['method', 'class'],
    securityImpact: 'MEDIUM',
    consumedBy: ['@axiljs/security'],
    composesWith: ['tHttp', 'tAuth'],
    examples: ['@tRateLimit({ limit: 10, window: "1m" })']
  },
  {
    name: 'tCsrf',
    description: 'Declares CSRF protection requirement',
    purpose: 'Marks the endpoint as requiring a valid CSRF token',
    why: 'CSRF requirement is an explicit security semantic',
    whenToUse: 'On state-changing endpoints served to browser clients',
    category: 'Security',
    targets: ['method', 'class'],
    securityImpact: 'HIGH',
    consumedBy: ['@axiljs/security'],
    composesWith: ['tHttp', 'tAuth'],
    examples: ['@tCsrf()']
  },
  {
    name: 'tSanitize',
    description: 'Declares input sanitization',
    purpose: 'Cleans user-supplied input before it reaches the handler',
    why: 'Input sanitization is a repeatable security semantic',
    whenToUse: 'On endpoints that accept free-text input',
    category: 'Security',
    targets: ['method', 'parameter'],
    securityImpact: 'MEDIUM',
    consumedBy: ['@axiljs/security'],
    composesWith: ['tHttp', 'tBody'],
    examples: ['@tSanitize({ stripHtml: true, trim: true })']
  },
  {
    name: 'tIpAllowList',
    description: 'Restricts access to a set of IPs or CIDR blocks',
    purpose: 'Rejects requests from IPs outside the allow list',
    why: 'Network-layer restrictions belong in explicit route semantics',
    whenToUse: 'On internal or admin endpoints exposed on trusted networks',
    category: 'Security',
    targets: ['method', 'class'],
    securityImpact: 'HIGH',
    consumedBy: ['@axiljs/security'],
    composesWith: ['tHttp', 'tAuth'],
    examples: ['@tIpAllowList("192.168.1.0/24", "10.0.0.1")']
  },
  {
    name: 'tVerifiedEmail',
    description: 'Requires the caller to have a verified email',
    purpose: 'Blocks execution for identities without verified email addresses',
    why: 'Email verification is a common identity assurance semantic',
    whenToUse: 'On endpoints that require trusted contact information',
    category: 'Security',
    targets: ['method', 'class'],
    consumedBy: ['@axiljs/security', '@axiljs/auth'],
    composesWith: ['tAuth'],
    examples: ['@tVerifiedEmail()']
  }
]

// ============================================================================
// DATA
// ============================================================================

const DATA_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tDatabase',
    description: 'Declares database execution semantics',
    purpose: 'Describes how a method interacts with the database',
    why: 'Allows AxilJS and the ORM to route queries appropriately without coupling',
    whenToUse: 'On any method that reads or writes to the database',
    whenNotToUse: 'On methods that only manipulate in-memory data',
    category: 'Data',
    targets: ['method', 'class'],
    performanceImpact: 'Read operations may be routed to replicas for lower latency',
    consumedBy: ['VacuumORM', 'Transaction Engine', '@axiljs/observability', '@axiljs/cloud'],
    composesWith: ['tTransaction', 'tConsistent', 'tReadOnly', 'tTenantIsolated'],
    conflictsWith: ['tReadOnly'],
    examples: ['@tDatabase({ operation: "read" })', '@tDatabase({ operation: "write", replica: "primary" })']
  },
  {
    name: 'tTransaction',
    description: 'Wraps a method in a database transaction boundary',
    purpose: 'Ensures the method executes atomically under the given isolation',
    why: 'Transactional boundaries are a critical database semantic',
    whenToUse: 'On operations that must succeed or fail as a single unit',
    category: 'Data',
    targets: ['method'],
    consumedBy: ['VacuumORM', 'Transaction Engine'],
    composesWith: ['tDatabase', 'tIsolation', 'tOutbox'],
    examples: ['@tTransaction()', '@tTransaction({ isolation: "serializable" })']
  },
  {
    name: 'tIsolation',
    description: 'Declares required transaction isolation',
    purpose: 'Enforces a minimum isolation level for the operation',
    why: 'Isolation choice materially affects correctness and performance',
    whenToUse: 'On operations sensitive to concurrent modification',
    category: 'Data',
    targets: ['method'],
    consumedBy: ['VacuumORM', 'Transaction Engine'],
    composesWith: ['tTransaction', 'tDatabase'],
    examples: ['@tIsolation("serializable")']
  },
  {
    name: 'tConsistent',
    description: 'Declares consistency requirement for a read/write',
    purpose: 'Communicates the required consistency guarantee to the storage layer',
    why: 'Distributed systems require explicit consistency semantics',
    whenToUse: 'When correctness depends on a specific consistency model',
    category: 'Data',
    targets: ['method'],
    consumedBy: ['VacuumORM', 'Cache Consumer', 'Storage Router'],
    composesWith: ['tDatabase', 'tCache'],
    examples: ['@tConsistent("strong")', '@tConsistent("eventual")']
  },
  {
    name: 'tReadOnly',
    description: 'Forbids any write operations within the method',
    purpose: 'Guarantees the method only performs reads',
    why: 'A read-only guarantee is a valuable safety semantic',
    whenToUse: 'On query, report, and export operations',
    whenNotToUse: 'On any method that mutates state',
    category: 'Data',
    targets: ['method', 'class'],
    consumedBy: ['VacuumORM', 'Static Analyzer'],
    composesWith: ['tDatabase', 'tCache'],
    conflictsWith: ['tDatabase (write)'],
    examples: ['@tReadOnly()']
  },
  {
    name: 'tTenantIsolated',
    description: 'Auto-scopes queries to the current tenant',
    purpose: 'Injects a tenant filter into every query performed by the method',
    why: 'Tenant isolation is a critical multi-tenant safety semantic',
    whenToUse: 'On every operation that touches tenant-scoped data',
    category: 'Data',
    targets: ['method', 'class'],
    securityImpact: 'CRITICAL — prevents cross-tenant data leakage',
    consumedBy: ['VacuumORM', '@axiljs/cloud'],
    composesWith: ['tDatabase', 'tTransaction'],
    examples: ['@tTenantIsolated()']
  },
  {
    name: 'tEntity',
    description: 'Declares a class as a database entity',
    purpose: 'Marks a class as mapped to a database table',
    why: 'Entity mapping is a core data semantic',
    whenToUse: 'On classes that represent persistent domain models',
    category: 'Data',
    targets: ['class'],
    consumedBy: ['VacuumORM'],
    composesWith: ['tColumn', 'tRelation'],
    examples: ['@tEntity({ table: "users" })']
  },
  {
    name: 'tColumn',
    description: 'Declares an entity property as a database column',
    purpose: 'Maps a class property to a table column with a type contract',
    why: 'Column mapping is a core data semantic',
    whenToUse: 'On every persistent property of an entity',
    category: 'Data',
    targets: ['property'],
    consumedBy: ['VacuumORM'],
    composesWith: ['tEntity'],
    examples: ['@tColumn()', '@tColumn({ type: "varchar", length: 255 })']
  },
  {
    name: 'tPrimaryKey',
    description: 'Declares an entity primary key column',
    purpose: 'Marks a property as the entity primary key',
    why: 'Primary key identification is a core data semantic',
    whenToUse: 'On the primary key property of every entity',
    category: 'Data',
    targets: ['property'],
    consumedBy: ['VacuumORM'],
    composesWith: ['tEntity'],
    examples: ['@tPrimaryKey()']
  },
  {
    name: 'tRelation',
    description: 'Declares an entity relationship',
    purpose: 'Describes a relationship between two entities',
    why: 'Relationship modeling is a core ORM semantic',
    whenToUse: 'On properties that reference other entities',
    category: 'Data',
    targets: ['property'],
    consumedBy: ['VacuumORM'],
    composesWith: ['tEntity', 'tColumn'],
    examples: ['@tRelation({ type: "many-to-one", target: () => User })']
  }
]

// ============================================================================
// RELIABILITY
// ============================================================================

const RELIABILITY_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tRetry',
    description: 'Automatically retries a failed operation',
    purpose: 'Retries the method on failure with the given strategy',
    why: 'Retry policies are a first-class reliability semantic',
    whenToUse: 'On idempotent operations that may transiently fail',
    whenNotToUse: 'On non-idempotent operations without tIdempotent',
    category: 'Reliability',
    targets: ['method'],
    consumedBy: ['@axiljs/circuit', '@axiljs/queue'],
    composesWith: ['tTimeout', 'tCircuitBreaker', 'tIdempotent', 'tFallback'],
    examples: ['@tRetry({ attempts: 3, backoff: "exponential" })']
  },
  {
    name: 'tTimeout',
    description: 'Enforces a maximum execution time',
    purpose: 'Aborts the operation if it exceeds the given duration',
    why: 'Bounded execution time is a critical reliability semantic',
    whenToUse: 'On operations that call external systems or perform heavy work',
    category: 'Reliability',
    targets: ['method'],
    consumedBy: ['@axiljs/circuit'],
    composesWith: ['tRetry', 'tCircuitBreaker'],
    examples: ['@tTimeout(5000)']
  },
  {
    name: 'tDeadline',
    description: 'Enforces an absolute execution deadline',
    purpose: 'Rejects execution after the given absolute timestamp',
    why: 'Deadlines are useful for time-bounded workflows and scheduled tasks',
    whenToUse: 'On operations that must complete by a specific time',
    category: 'Reliability',
    targets: ['method'],
    consumedBy: ['@axiljs/circuit', '@axiljs/queue'],
    composesWith: ['tTimeout', 'tRetry'],
    examples: ['@tDeadline("2025-12-31T23:59:59Z")']
  },
  {
    name: 'tCircuitBreaker',
    description: 'Applies the circuit breaker pattern',
    purpose: 'Stops calling a failing dependency until it recovers',
    why: 'Circuit breakers prevent cascading failures across services',
    whenToUse: 'On calls to unstable or slow downstream services',
    category: 'Reliability',
    targets: ['method'],
    consumedBy: ['@axiljs/circuit'],
    composesWith: ['tRetry', 'tTimeout', 'tFallback'],
    examples: ['@tCircuitBreaker({ threshold: 5, resetTimeout: 30_000 })']
  },
  {
    name: 'tFallback',
    description: 'Provides a fallback when the operation fails',
    purpose: 'Returns a fallback value or method result on failure',
    why: 'Graceful degradation is a first-class reliability semantic',
    whenToUse: 'When failure of a call should not fail the caller',
    category: 'Reliability',
    targets: ['method'],
    consumedBy: ['@axiljs/circuit'],
    composesWith: ['tCircuitBreaker', 'tRetry', 'tTimeout'],
    examples: ['@tFallback({ value: [] })', '@tFallback({ method: "getCachedData" })']
  },
  {
    name: 'tBulkhead',
    description: 'Isolates resource capacity for a call',
    purpose: 'Prevents one workload from exhausting shared resources',
    why: 'Bulkheading is essential for multi-workload backend systems',
    whenToUse: 'When a subsystem must not consume more than a fixed share',
    category: 'Reliability',
    targets: ['method'],
    consumedBy: ['@axiljs/circuit'],
    composesWith: ['tRetry', 'tCircuitBreaker', 'tTimeout'],
    examples: ['@tBulkhead({ name: "payments", concurrency: 20, queue: 100 })']
  },
  {
    name: 'tHedge',
    description: 'Speculatively issues parallel attempts',
    purpose: 'Fires an additional attempt if the first exceeds a latency threshold',
    why: 'Hedging reduces tail latency for latency-sensitive operations',
    whenToUse: 'On idempotent reads sensitive to tail latency',
    whenNotToUse: 'On non-idempotent operations',
    category: 'Reliability',
    targets: ['method'],
    consumedBy: ['@axiljs/circuit'],
    composesWith: ['tIdempotent', 'tTimeout'],
    examples: ['@tHedge({ delay: 100, maxAttempts: 2 })']
  }
]

// ============================================================================
// CONCURRENCY
// ============================================================================

const CONCURRENCY_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tConcurrency',
    description: 'Limits concurrent executions',
    purpose: 'Bounds parallel execution of the operation',
    why: 'Concurrency limits are a critical backend safety semantic',
    whenToUse: 'On expensive or resource-bound operations',
    category: 'Concurrency',
    targets: ['method'],
    consumedBy: ['@axiljs/circuit', 'Runtime'],
    composesWith: ['tBulkhead', 'tTimeout', 'tThrottle'],
    examples: ['@tConcurrency({ limit: 10, strategy: "queue" })']
  },
  {
    name: 'tLock',
    description: 'Acquires a distributed or resource lock',
    purpose: 'Serializes execution across processes on a keyed lock',
    why: 'Distributed locking is essential for correctness in scaled systems',
    whenToUse: 'When only one process may execute a given operation at a time',
    whenNotToUse: 'On high-frequency operations without careful design',
    category: 'Concurrency',
    targets: ['method'],
    performanceImpact: 'Introduces coordination overhead',
    consumedBy: ['Lock Manager', '@axiljs/cloud'],
    composesWith: ['tTransaction', 'tIdempotent'],
    examples: ['@tLock({ key: (orderId) => `order:${orderId}`, ttl: 30_000 })']
  },
  {
    name: 'tMutex',
    description: 'In-process mutual exclusion',
    purpose: 'Ensures only one invocation runs at a time within a single process',
    why: 'Process-local mutual exclusion is simpler and cheaper than distributed locks',
    whenToUse: 'When contention is process-local',
    category: 'Concurrency',
    targets: ['method'],
    consumedBy: ['Runtime'],
    composesWith: ['tIdempotent'],
    examples: ['@tMutex()']
  },
  {
    name: 'tDedupe',
    description: 'Deduplicates concurrent identical requests',
    purpose: 'Coalesces overlapping calls with the same key into one execution',
    why: 'Deduplication prevents thundering-herd on expensive operations',
    whenToUse: 'On expensive reads or actions that may fire in bursts',
    category: 'Concurrency',
    targets: ['method'],
    consumedBy: ['Runtime', '@axiljs/circuit'],
    composesWith: ['tCache', 'tTimeout'],
    examples: ['@tDedupe({ key: (id) => `user:${id}` })']
  },
  {
    name: 'tIdempotent',
    description: 'Enforces idempotency using an idempotency key',
    purpose: 'Rejects duplicate operations within a TTL window',
    why: 'Idempotency is a first-class distributed correctness semantic',
    whenToUse: 'On write operations that must not be duplicated',
    category: 'Concurrency',
    targets: ['method'],
    consumedBy: ['Runtime', '@axiljs/queue'],
    composesWith: ['tRetry', 'tOutbox'],
    examples: ['@tIdempotent({ key: "request.id", ttl: 86_400_000 })']
  },
  {
    name: 'tThrottle',
    description: 'Limits execution frequency',
    purpose: 'Ensures the method executes at most N times per period',
    why: 'Throttling protects downstream systems and expensive operations',
    whenToUse: 'On operations that must not exceed a rate ceiling',
    category: 'Concurrency',
    targets: ['method'],
    consumedBy: ['Runtime'],
    composesWith: ['tRateLimit', 'tConcurrency'],
    examples: ['@tThrottle(1, 1000)']
  },
  {
    name: 'tDebounce',
    description: 'Collapses repeated invocations into one',
    purpose: 'Delays execution until after a quiet period',
    why: 'Debouncing is useful for reactive workloads (typing, saves)',
    whenToUse: 'On operations triggered by rapid user or event bursts',
    category: 'Concurrency',
    targets: ['method'],
    consumedBy: ['Runtime'],
    composesWith: ['tThrottle'],
    examples: ['@tDebounce(300)']
  }
]

// ============================================================================
// DISTRIBUTED
// ============================================================================

const DISTRIBUTED_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tSaga',
    description: 'Declares a class as a distributed saga',
    purpose: 'Marks a class as an orchestrated distributed workflow',
    why: 'Distributed transactions require explicit workflow semantics',
    whenToUse: 'On workflow classes coordinating multiple services',
    category: 'Distributed',
    targets: ['class'],
    consumedBy: ['Workflow Engine'],
    composesWith: ['tStep', 'tCompensate'],
    examples: ['@tSaga("checkout")']
  },
  {
    name: 'tStep',
    description: 'Declares a workflow or saga step',
    purpose: 'Marks a method as an ordered step in a workflow or saga',
    why: 'Workflow steps are the fundamental unit of distributed execution',
    whenToUse: 'On methods belonging to a saga or workflow',
    category: 'Distributed',
    targets: ['method'],
    consumedBy: ['Workflow Engine'],
    composesWith: ['tSaga', 'tWorkflow', 'tCompensate', 'tCheckpoint'],
    examples: ['@tStep("reserve-inventory")', '@tStep("charge-payment", { order: 2 })']
  },
  {
    name: 'tCompensate',
    description: 'Declares a compensating action for a workflow step',
    purpose: 'Executes when the referenced step must be rolled back',
    why: 'Compensation is essential for correctness in distributed workflows',
    whenToUse: 'On methods that reverse the effect of a completed step',
    category: 'Distributed',
    targets: ['method'],
    consumedBy: ['Workflow Engine'],
    composesWith: ['tSaga', 'tStep', 'tWorkflow'],
    examples: ['@tCompensate("charge-payment")']
  },
  {
    name: 'tOutbox',
    description: 'Transactional outbox event publication',
    purpose: 'Persists events atomically with the database transaction',
    why: 'The outbox pattern guarantees at-least-once event delivery',
    whenToUse: 'On operations that must publish events reliably',
    category: 'Distributed',
    targets: ['method'],
    consumedBy: ['Outbox Consumer', '@axiljs/events'],
    composesWith: ['tTransaction', 'tEmit'],
    examples: ['@tOutbox()', '@tOutbox({ channel: "domain-events" })']
  },
  {
    name: 'tInbox',
    description: 'Idempotent event consumption via an inbox table',
    purpose: 'Guarantees at-most-once handling of received events',
    why: 'The inbox pattern complements the outbox for exactly-once semantics',
    whenToUse: 'On event handlers that must not process duplicates',
    category: 'Distributed',
    targets: ['method'],
    consumedBy: ['Inbox Consumer', '@axiljs/events'],
    composesWith: ['tOnEvent', 'tTransaction'],
    examples: ['@tInbox()']
  },
  {
    name: 'tCheckpoint',
    description: 'Declares a resumable checkpoint in a workflow',
    purpose: 'Allows a workflow to resume from this point on failure',
    why: 'Checkpoints avoid re-running expensive completed work',
    whenToUse: 'On expensive workflow steps that should not be repeated',
    category: 'Distributed',
    targets: ['method'],
    consumedBy: ['Workflow Engine'],
    composesWith: ['tWorkflow', 'tStep'],
    examples: ['@tCheckpoint("after-index")']
  }
]

// ============================================================================
// MESSAGING
// ============================================================================

const MESSAGING_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tOnEvent',
    description: 'Subscribes to events matching a pattern',
    purpose: 'Registers the method as an event handler',
    why: 'Event subscription is a fundamental pub/sub semantic',
    whenToUse: 'On any handler that must react to a domain event',
    category: 'Messaging',
    targets: ['method'],
    consumedBy: ['@axiljs/events'],
    composesWith: ['tRetry', 'tInbox', 'tIdempotent'],
    examples: ['@tOnEvent("user.created")', '@tOnEvent("order.*", { async: true })']
  },
  {
    name: 'tEmit',
    description: 'Emits an event with the method return value',
    purpose: 'Publishes an event after the method resolves successfully',
    why: 'Declarative emission removes ad-hoc event publication',
    whenToUse: 'On methods whose completion signals a domain event',
    category: 'Messaging',
    targets: ['method'],
    consumedBy: ['@axiljs/events', 'Outbox Consumer'],
    composesWith: ['tOutbox', 'tTransaction'],
    examples: ['@tEmit("order.created")']
  },
  {
    name: 'tOnce',
    description: 'Subscribes to an event exactly once',
    purpose: 'Removes the subscription after the first invocation',
    why: 'One-shot subscription simplifies bootstrap and warmup handlers',
    whenToUse: 'On handlers that must fire only once during process lifetime',
    category: 'Messaging',
    targets: ['method'],
    consumedBy: ['@axiljs/events'],
    composesWith: [],
    examples: ['@tOnce("app.ready")']
  },
  {
    name: 'tMessage',
    description: 'Declares a message handler on a channel',
    purpose: 'Registers the method as a consumer for a messaging channel',
    why: 'Channel-based messaging is a distinct semantic from event pub/sub',
    whenToUse: 'On methods consuming messages from a broker',
    category: 'Messaging',
    targets: ['method'],
    consumedBy: ['Message Broker Consumer'],
    composesWith: ['tInbox', 'tRetry', 'tDeadLetter'],
    examples: ['@tMessage({ channel: "payments.inbox" })']
  },
  {
    name: 'tDeadLetter',
    description: 'Declares dead-letter behavior for a handler',
    purpose: 'Sends terminally failed messages to a dead-letter channel',
    why: 'Dead-letter handling is a first-class messaging semantic',
    whenToUse: 'On queue and message handlers that must not drop failures silently',
    category: 'Messaging',
    targets: ['method'],
    consumedBy: ['@axiljs/queue', 'Message Broker Consumer'],
    composesWith: ['tJob', 'tMessage', 'tRetry'],
    examples: ['@tDeadLetter({ channel: "failed-payments", maxAttempts: 5 })']
  },
  {
    name: 'tQueue',
    description: 'Declares a class as a queue processor',
    purpose: 'Registers a class as the worker for a named queue',
    why: 'Queue declarations belong to the class-level semantic layer',
    whenToUse: 'On worker classes that process background jobs',
    category: 'Messaging',
    targets: ['class'],
    consumedBy: ['@axiljs/queue'],
    composesWith: ['tJob'],
    examples: ['@tQueue("emails", { concurrency: 5 })']
  },
  {
    name: 'tJob',
    description: 'Declares a job handler within a queue',
    purpose: 'Registers a method as the handler for a named job',
    why: 'Job handling is a fundamental background-work semantic',
    whenToUse: 'On methods that process a specific job type in a queue',
    category: 'Messaging',
    targets: ['method'],
    consumedBy: ['@axiljs/queue'],
    composesWith: ['tQueue', 'tRetry', 'tDeadLetter', 'tTimeout'],
    examples: ['@tJob("send-welcome", { attempts: 3 })']
  },
  {
    name: 'tEnqueue',
    description: 'Enqueues a job after the method completes',
    purpose: 'Auto-enqueues a job with the method return value as data',
    why: 'Declarative enqueue removes boilerplate producer code',
    whenToUse: 'On methods whose result should become a queued job payload',
    category: 'Messaging',
    targets: ['method'],
    consumedBy: ['@axiljs/queue'],
    composesWith: ['tTransaction', 'tOutbox'],
    examples: ['@tEnqueue("emails", "send-welcome")']
  }
]

// ============================================================================
// CACHING
// ============================================================================

const CACHING_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tCache',
    description: 'Caches the return value of the method',
    purpose: 'Memoizes the result under the given key and TTL',
    why: 'Declarative caching decouples cache strategy from business logic',
    whenToUse: 'On expensive, idempotent reads',
    whenNotToUse: 'On writes, personalized or real-time data',
    category: 'Caching',
    targets: ['method'],
    performanceImpact: 'Significant improvement for expensive operations',
    consumedBy: ['@axiljs/cloud Cache', '@axiljs/observability'],
    composesWith: ['tDatabase', 'tHttp', 'tCacheStampede'],
    conflictsWith: ['tCacheEvict on same key'],
    examples: ['@tCache({ key: (id) => `user:${id}`, ttl: 60_000 })']
  },
  {
    name: 'tCacheEvict',
    description: 'Evicts cached values when the method runs',
    purpose: 'Removes matching entries from the cache after execution',
    why: 'Cache invalidation must be explicit and declarative',
    whenToUse: 'On write operations that invalidate cached reads',
    category: 'Caching',
    targets: ['method'],
    consumedBy: ['@axiljs/cloud Cache'],
    composesWith: ['tHttp', 'tDatabase'],
    examples: ['@tCacheEvict({ key: (id) => `user:${id}` })', '@tCacheEvict({ tags: ["products"] })']
  },
  {
    name: 'tCachePut',
    description: 'Updates the cache with the method result',
    purpose: 'Writes the method return value to the cache after execution',
    why: 'Explicit cache refresh is complementary to eviction',
    whenToUse: 'On write operations whose result should replace a cached value',
    category: 'Caching',
    targets: ['method'],
    consumedBy: ['@axiljs/cloud Cache'],
    composesWith: ['tHttp', 'tDatabase'],
    examples: ['@tCachePut({ key: (id) => `user:${id}`, ttl: 60_000 })']
  },
  {
    name: 'tCacheInvalidate',
    description: 'Invalidates cache entries by tag',
    purpose: 'Evicts every entry associated with the listed tags',
    why: 'Tag-based invalidation supports coordinated multi-key eviction',
    whenToUse: 'When several cached values must be evicted together',
    category: 'Caching',
    targets: ['method'],
    consumedBy: ['@axiljs/cloud Cache'],
    composesWith: ['tCache'],
    examples: ['@tCacheInvalidate("products", "categories")']
  },
  {
    name: 'tCacheStampede',
    description: 'Protects an expensive resource from cache stampedes',
    purpose: 'Coalesces concurrent misses into one underlying invocation',
    why: 'Cache stampedes can bring down downstream systems on cold caches',
    whenToUse: 'When a cache miss triggers an expensive downstream call',
    category: 'Caching',
    targets: ['method'],
    performanceImpact: 'Adds coordination cost during misses; eliminates stampedes',
    consumedBy: ['@axiljs/cloud Cache'],
    composesWith: ['tCache', 'tDedupe'],
    examples: ['@tCacheStampede({ strategy: "single-flight" })', '@tCacheStampede({ strategy: "stale-while-revalidate", staleTtl: 30_000 })']
  }
]

// ============================================================================
// OBSERVABILITY
// ============================================================================

const OBSERVABILITY_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tTrace',
    description: 'Creates a distributed trace span',
    purpose: 'Wraps execution in a named trace span with optional tags',
    why: 'Distributed tracing is a first-class observability semantic',
    whenToUse: 'On any operation that must appear in the trace tree',
    category: 'Observability',
    targets: ['method'],
    consumedBy: ['@axiljs/observability'],
    composesWith: ['tMetric', 'tLog'],
    examples: ['@tTrace("checkout-flow")', '@tTrace("db-query", { tags: { table: "users" } })']
  },
  {
    name: 'tMetric',
    description: 'Records a metric for the method invocation',
    purpose: 'Emits a metric of the given type on each call',
    why: 'Declarative metrics remove instrumentation boilerplate',
    whenToUse: 'On methods whose invocation is worth measuring',
    category: 'Observability',
    targets: ['method'],
    consumedBy: ['@axiljs/observability'],
    composesWith: ['tTrace', 'tLog'],
    examples: ['@tMetric("orders.created", "counter")', '@tMetric("search.duration", "histogram")']
  },
  {
    name: 'tLog',
    description: 'Structured logging around method execution',
    purpose: 'Emits a structured log entry at method boundaries',
    why: 'Structured logging is a first-class observability semantic',
    whenToUse: 'On methods whose invocation is worth logging',
    category: 'Observability',
    targets: ['method'],
    consumedBy: ['@axiljs/observability'],
    composesWith: ['tTrace', 'tMetric'],
    examples: ['@tLog("info", { includeArgs: true })']
  },
  {
    name: 'tHealthCheck',
    description: 'Registers a method as a health check probe',
    purpose: 'Marks the method as a health probe with a given name',
    why: 'Health checks are a first-class operational semantic',
    whenToUse: 'On methods that verify a subsystem is healthy',
    category: 'Observability',
    targets: ['method'],
    consumedBy: ['@axiljs/observability'],
    composesWith: [],
    examples: ['@tHealthCheck("database")']
  },
  {
    name: 'tSlo',
    description: 'Declares a service-level objective',
    purpose: 'Sets latency and error-budget targets for the operation',
    why: 'SLOs are a first-class operational semantic',
    whenToUse: 'On critical user-facing operations with reliability targets',
    category: 'Observability',
    targets: ['method'],
    consumedBy: ['@axiljs/observability', 'SLO Monitor'],
    composesWith: ['tCritical', 'tTrace'],
    examples: ['@tSlo({ latency: 300, percentile: 99 })']
  },
  {
    name: 'tCritical',
    description: 'Marks the method as a critical execution path',
    purpose: 'Flags the method for elevated monitoring and alerting',
    why: 'Critical paths deserve explicit operational attention',
    whenToUse: 'On operations whose failure has business-critical impact',
    category: 'Observability',
    targets: ['method'],
    consumedBy: ['@axiljs/observability', 'Alerting'],
    composesWith: ['tSlo', 'tTrace'],
    examples: ['@tCritical()']
  },
  {
    name: 'tSample',
    description: 'Controls telemetry sampling for the method',
    purpose: 'Sets a fractional sampling rate for traces/metrics/logs',
    why: 'Sampling controls telemetry cost on high-volume paths',
    whenToUse: 'On very high-volume endpoints with low individual signal value',
    category: 'Observability',
    targets: ['method'],
    consumedBy: ['@axiljs/observability'],
    composesWith: ['tTrace', 'tLog'],
    examples: ['@tSample({ rate: 0.1 })']
  }
]

// ============================================================================
// COMPLIANCE
// ============================================================================

const COMPLIANCE_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tAudit',
    description: 'Logs the action to an immutable audit trail',
    purpose: 'Emits an audit event on method completion',
    why: 'Auditability is a first-class compliance semantic',
    whenToUse: 'On operations subject to compliance or forensic review',
    category: 'Compliance',
    targets: ['method'],
    securityImpact: 'MEDIUM — audit failures can affect compliance posture',
    consumedBy: ['@axiljs/cloud', 'Audit Sink'],
    composesWith: ['tHttp', 'tAuth', 'tTenantIsolated'],
    examples: ['@tAudit({ action: "user.deleted" })', '@tAudit({ action: "funds.transferred", compliance: ["SOC2", "PCI-DSS"] })']
  },
  {
    name: 'tSensitive',
    description: 'Classifies data as sensitive',
    purpose: 'Marks a property as sensitive under a specific classification',
    why: 'Data classification drives redaction, encryption, and access rules',
    whenToUse: 'On persistent properties containing sensitive data',
    category: 'Compliance',
    targets: ['property'],
    securityImpact: 'HIGH — classification changes handling requirements',
    consumedBy: ['VacuumORM', '@axiljs/security', 'Data Export'],
    composesWith: ['tColumn', 'tRedact'],
    examples: ['@tSensitive("PII")', '@tSensitive("PCI")']
  },
  {
    name: 'tRedact',
    description: 'Redacts a property from logs and outbound payloads',
    purpose: 'Prevents sensitive values from appearing in logs or responses',
    why: 'Redaction is a first-class privacy semantic',
    whenToUse: 'On properties whose value must never leak',
    category: 'Compliance',
    targets: ['property'],
    securityImpact: 'HIGH',
    consumedBy: ['@axiljs/observability', 'Response Serializer'],
    composesWith: ['tColumn', 'tSensitive'],
    examples: ['@tRedact()', '@tRedact({ strategy: "mask", visibleChars: 4 })']
  },
  {
    name: 'tRetention',
    description: 'Declares data retention policy',
    purpose: 'Marks an entity or property with a retention window',
    why: 'Retention policy is a first-class compliance semantic',
    whenToUse: 'On data subject to legal or contractual retention limits',
    category: 'Compliance',
    targets: ['class', 'property'],
    consumedBy: ['Retention Sweeper', 'Data Export'],
    composesWith: ['tEntity', 'tColumn'],
    examples: ['@tRetention({ duration: "90d" })']
  }
]

// ============================================================================
// RUNTIME
// ============================================================================

const RUNTIME_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tFeatureFlag',
    description: 'Gates execution behind a feature flag',
    purpose: 'Enables or disables the operation based on a named flag',
    why: 'Feature flags are a first-class runtime control semantic',
    whenToUse: 'On operations under progressive rollout or kill-switching',
    category: 'Runtime',
    targets: ['method'],
    consumedBy: ['@axiljs/cloud'],
    composesWith: ['tExperiment', 'tRollout'],
    examples: ['@tFeatureFlag("new-checkout")', '@tFeatureFlag("ai-search", { fallback: "legacy-search" })']
  },
  {
    name: 'tExperiment',
    description: 'Declares an A/B or multivariate experiment',
    purpose: 'Selects a variant for the current caller',
    why: 'Experimentation is a distinct runtime semantic from feature flags',
    whenToUse: 'On operations under active experimental evaluation',
    category: 'Runtime',
    targets: ['method'],
    consumedBy: ['@axiljs/cloud', 'Experiment Engine'],
    composesWith: ['tFeatureFlag'],
    examples: ['@tExperiment({ name: "checkout-v2", variants: ["control", "new"] })']
  },
  {
    name: 'tRollout',
    description: 'Progressive rollout percentage',
    purpose: 'Enables the operation for a hashed percentage of callers',
    why: 'Progressive rollouts are safer than binary feature toggles',
    whenToUse: 'When rolling out new behavior to a fraction of traffic',
    category: 'Runtime',
    targets: ['method'],
    consumedBy: ['@axiljs/cloud'],
    composesWith: ['tFeatureFlag', 'tExperiment'],
    examples: ['@tRollout({ percentage: 10 })']
  },
  {
    name: 'tQuota',
    description: 'Checks and consumes tenant quota',
    purpose: 'Enforces a per-tenant resource limit for the operation',
    why: 'Quota enforcement is a first-class multi-tenant semantic',
    whenToUse: 'On operations that consume tenant-metered resources',
    category: 'Runtime',
    targets: ['method'],
    consumedBy: ['@axiljs/cloud'],
    composesWith: ['tTenantIsolated', 'tRateLimit'],
    examples: ['@tQuota({ resource: "api_calls", amount: 1 })', '@tQuota({ resource: "ai.tokens", amount: 1000 })']
  },
  {
    name: 'tResource',
    description: 'Declares resource requirements',
    purpose: 'Communicates required CPU/memory/GPU to the runtime',
    why: 'Resource-aware scheduling requires explicit requirements',
    whenToUse: 'On heavy or specialized workloads',
    category: 'Runtime',
    targets: ['method', 'class'],
    consumedBy: ['@axiljs/cloud', 'Runtime Scheduler'],
    composesWith: ['tConcurrency', 'tBulkhead'],
    examples: ['@tResource({ cpu: "500m", memory: "256Mi" })']
  },
  {
    name: 'tSchedule',
    description: 'Runs the method on a schedule',
    purpose: 'Registers the method with the scheduler using cron or interval',
    why: 'Scheduling is a first-class backend semantic',
    whenToUse: 'On maintenance, aggregation, and periodic jobs',
    category: 'Runtime',
    targets: ['method'],
    consumedBy: ['@axiljs/queue', 'Scheduler'],
    composesWith: ['tTimeout', 'tRetry'],
    examples: ['@tSchedule("0 */5 * * *")', '@tSchedule({ cron: "0 0 * * *", timezone: "UTC", overlap: "skip" })']
  },
  {
    name: 'tInterval',
    description: 'Runs the method at a fixed interval',
    purpose: 'Schedules the method every N milliseconds',
    why: 'Fixed intervals are simpler than cron for lightweight periodic work',
    whenToUse: 'On lightweight periodic tasks',
    category: 'Runtime',
    targets: ['method'],
    consumedBy: ['Scheduler'],
    composesWith: ['tTimeout'],
    examples: ['@tInterval(30_000)']
  },
  {
    name: 'tDelay',
    description: 'Runs the method once after a startup delay',
    purpose: 'Schedules a one-shot invocation N milliseconds after boot',
    why: 'Delayed startup tasks are common (warmup, prefetch)',
    whenToUse: 'On one-shot startup routines',
    category: 'Runtime',
    targets: ['method'],
    consumedBy: ['Scheduler'],
    composesWith: [],
    examples: ['@tDelay(5000)']
  },
  {
    name: 'tRunAt',
    description: 'Runs the method once at a specific date/time',
    purpose: 'Schedules a one-shot invocation at an absolute timestamp',
    why: 'Absolute-time scheduling is distinct from cron/interval',
    whenToUse: 'On tasks tied to specific calendar events',
    category: 'Runtime',
    targets: ['method'],
    consumedBy: ['Scheduler'],
    composesWith: [],
    examples: ['@tRunAt("2025-12-31T23:59:59Z")']
  },
  {
    name: 'tTenant',
    description: 'Declares tenant-scoped execution',
    purpose: 'Requires a tenant context for the operation',
    why: 'Multi-tenant scoping is a first-class semantic',
    whenToUse: 'On operations that must always run in a tenant context',
    category: 'Runtime',
    targets: ['method', 'class'],
    securityImpact: 'HIGH',
    consumedBy: ['@axiljs/cloud'],
    composesWith: ['tAuth', 'tTenantIsolated', 'tTenantBoundary'],
    examples: ['@tTenant()', '@tTenant({ strategy: "subdomain" })']
  },
  {
    name: 'tTenantBoundary',
    description: 'Declares a tenant isolation boundary',
    purpose: 'Forbids or allows cross-tenant access at the given strictness',
    why: 'Explicit boundaries prevent accidental cross-tenant leakage',
    whenToUse: 'On operations where cross-tenant access must be controlled',
    category: 'Runtime',
    targets: ['method', 'class'],
    securityImpact: 'CRITICAL',
    consumedBy: ['@axiljs/cloud'],
    composesWith: ['tTenant', 'tTenantIsolated'],
    examples: ['@tTenantBoundary("strict")']
  },
  {
    name: 'tCrossTenant',
    description: 'Explicitly authorizes cross-tenant access',
    purpose: 'Marks the operation as an audited administrative cross-tenant action',
    why: 'Dangerous cross-tenant operations must be explicit and auditable',
    whenToUse: 'On support and platform admin tools that inspect multiple tenants',
    whenNotToUse: 'On regular application code — a code smell for standard endpoints',
    category: 'Runtime',
    targets: ['method'],
    securityImpact: 'CRITICAL',
    consumedBy: ['@axiljs/cloud', 'Audit Sink'],
    composesWith: ['tAudit', 'tRole', 'tPermission'],
    examples: ['@tCrossTenant({ reason: "platform-admin" })']
  }
]

// ============================================================================
// WORKFLOW
// ============================================================================

const WORKFLOW_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tWorkflow',
    description: 'Declares a class as a workflow',
    purpose: 'Marks a class as a durable, resumable workflow',
    why: 'Long-running workflows require explicit lifecycle semantics',
    whenToUse: 'On classes representing multi-step durable processes',
    category: 'Workflow',
    targets: ['class'],
    consumedBy: ['Workflow Engine'],
    composesWith: ['tStep', 'tCheckpoint', 'tResume', 'tCompensate'],
    examples: ['@tWorkflow("document-processing")']
  },
  {
    name: 'tResume',
    description: 'Declares a resume entry point in a workflow',
    purpose: 'Registers the method as the target of a workflow resume',
    why: 'Explicit resume points are necessary for durable execution',
    whenToUse: 'On workflow steps that may be resumed after failure',
    category: 'Workflow',
    targets: ['method'],
    consumedBy: ['Workflow Engine'],
    composesWith: ['tWorkflow', 'tCheckpoint'],
    examples: ['@tResume({ from: "after-index" })']
  }
]

// ============================================================================
// AI
// ============================================================================

const AI_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tAIComplete',
    description: 'Auto-completion via an LLM',
    purpose: 'Marks the method as producing its result through LLM completion',
    why: 'Provider-independent AI declarations decouple app code from vendors',
    whenToUse: 'On methods whose output is generated by an LLM',
    category: 'AI',
    targets: ['method'],
    consumedBy: ['@axiljs/ai'],
    composesWith: ['tAIModel', 'tAITokenBudget', 'tAIGuard', 'tCache'],
    examples: ['@tAIComplete({ task: "summarization" })']
  },
  {
    name: 'tAIEmbed',
    description: 'Embeds text for vector storage or search',
    purpose: 'Produces embeddings for the input and optionally stores them',
    why: 'Embedding is a distinct AI semantic from completion',
    whenToUse: 'On methods that produce or index embeddings',
    category: 'AI',
    targets: ['method'],
    consumedBy: ['@axiljs/ai', 'Vector Store'],
    composesWith: ['tAIModel'],
    examples: ['@tAIEmbed({ storeIn: "documents" })']
  },
  {
    name: 'tAIRAG',
    description: 'Retrieval-augmented generation over a collection',
    purpose: 'Runs a RAG pipeline against the given collection',
    why: 'RAG is a distinct AI semantic worth declaring at the callsite',
    whenToUse: 'On question-answering endpoints over private knowledge bases',
    category: 'AI',
    targets: ['method'],
    consumedBy: ['@axiljs/ai'],
    composesWith: ['tAIModel', 'tCache'],
    examples: ['@tAIRAG({ collection: "documents", topK: 5 })']
  },
  {
    name: 'tAIGuard',
    description: 'AI content-safety guard',
    purpose: 'Screens input or output against safety policies',
    why: 'AI safety is a first-class semantic for AI-enabled operations',
    whenToUse: 'On any AI operation exposed to user input or public output',
    category: 'AI',
    targets: ['method'],
    securityImpact: 'HIGH',
    consumedBy: ['@axiljs/ai'],
    composesWith: ['tAIComplete', 'tAIRAG'],
    examples: ['@tAIGuard({ policies: ["toxicity", "pii"], action: "block" })']
  },
  {
    name: 'tAIModel',
    description: 'Declares required model capability',
    purpose: 'Selects a model by capability rather than by vendor name',
    why: 'Capability-based selection decouples code from providers',
    whenToUse: 'On AI operations with specific capability requirements',
    category: 'AI',
    targets: ['method'],
    consumedBy: ['@axiljs/ai'],
    composesWith: ['tAIComplete', 'tAIRAG', 'tAIEmbed'],
    examples: ['@tAIModel({ capability: "reasoning" })']
  },
  {
    name: 'tAITokenBudget',
    description: 'Declares a token / cost budget for an AI call',
    purpose: 'Enforces input, output, and cost limits on AI operations',
    why: 'Cost control is a first-class AI operational semantic',
    whenToUse: 'On any AI operation with financial impact',
    category: 'AI',
    targets: ['method'],
    consumedBy: ['@axiljs/ai'],
    composesWith: ['tAIComplete', 'tAIRAG', 'tQuota'],
    examples: ['@tAITokenBudget({ maxInput: 4000, maxOutput: 1000 })']
  }
]

// ============================================================================
// CONTRACT
// ============================================================================

const CONTRACT_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tContract',
    description: 'Declares a full request/response contract',
    purpose: 'Binds a method to input, output, and error contracts',
    why: 'Explicit contracts drive validation, OpenAPI, SDK, and Studio tooling',
    whenToUse: 'On public API endpoints with published contracts',
    category: 'Contract',
    targets: ['method'],
    consumedBy: ['@axiljs/core', 'OpenAPI Generator', 'SDK Generator', '@axiljs/studio'],
    composesWith: ['tHttp', 'tConsumes', 'tProduces', 'tPaginated'],
    examples: ['@tContract({ response: UserResponse })']
  },
  {
    name: 'tConsumes',
    description: 'Declares accepted request content types',
    purpose: 'Lists MIME types the endpoint can accept',
    why: 'Content negotiation is a first-class API contract semantic',
    whenToUse: 'On endpoints with a restricted content-type surface',
    category: 'Contract',
    targets: ['method'],
    consumedBy: ['@axiljs/core', 'OpenAPI Generator'],
    composesWith: ['tHttp', 'tContract'],
    examples: ['@tConsumes("application/json")']
  },
  {
    name: 'tProduces',
    description: 'Declares produced response content type',
    purpose: 'Lists the MIME type the endpoint returns',
    why: 'Response type is a first-class API contract semantic',
    whenToUse: 'On endpoints returning non-default content types',
    category: 'Contract',
    targets: ['method'],
    consumedBy: ['@axiljs/core', 'OpenAPI Generator'],
    composesWith: ['tHttp', 'tContract'],
    examples: ['@tProduces({ contentType: "application/json" })']
  },
  {
    name: 'tPaginated',
    description: 'Declares a paginated collection response',
    purpose: 'Marks the endpoint as returning a paginated envelope',
    why: 'Pagination is a first-class contract semantic',
    whenToUse: 'On any list endpoint returning bounded pages',
    category: 'Contract',
    targets: ['method'],
    consumedBy: ['@axiljs/core', 'OpenAPI Generator', 'SDK Generator'],
    composesWith: ['tHttp', 'tContract'],
    examples: ['@tPaginated({ strategy: "offset", defaultLimit: 20 })']
  },
  {
    name: 'tDeprecated',
    description: 'Marks the endpoint or method as deprecated',
    purpose: 'Signals that the operation should no longer be used',
    why: 'Deprecation is a first-class API lifecycle semantic',
    whenToUse: 'On endpoints scheduled for removal or replacement',
    category: 'Contract',
    targets: ['method', 'class'],
    consumedBy: ['OpenAPI Generator', '@axiljs/studio', 'Runtime Warning'],
    composesWith: ['tHttp'],
    examples: ['@tDeprecated({ since: "2.0", removeAfter: "3.0", replacement: "/v3/users" })']
  }
]

// ============================================================================
// EXECUTION
// ============================================================================

const EXECUTION_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tAtomic',
    description: 'Declares atomic execution semantics',
    purpose: 'Guarantees the operation appears atomic to its consumer',
    why: 'Atomicity is a first-class execution semantic',
    whenToUse: 'On operations that must be all-or-nothing from the outside',
    category: 'Execution',
    targets: ['method'],
    consumedBy: ['Runtime', 'Static Analyzer'],
    composesWith: ['tTransaction', 'tIdempotent', 'tLock'],
    examples: ['@tAtomic()']
  },
  {
    name: 'tPure',
    description: 'Declares the method is side-effect free',
    purpose: 'Guarantees no observable side effects outside the return value',
    why: 'Purity enables aggressive memoization and parallelization',
    whenToUse: 'On computations that only depend on their inputs',
    whenNotToUse: 'On any operation that reads mutable state or performs I/O',
    category: 'Execution',
    targets: ['method'],
    consumedBy: ['Static Analyzer', 'Runtime'],
    composesWith: ['tMemoize', 'tCache'],
    conflictsWith: ['tSideEffect'],
    examples: ['@tPure()']
  },
  {
    name: 'tSideEffect',
    description: 'Explicitly declares a side effect',
    purpose: 'Documents that the operation performs the given side effect',
    why: 'Explicit side-effect declarations aid analysis and audit',
    whenToUse: 'On operations touching external systems or shared state',
    category: 'Execution',
    targets: ['method'],
    consumedBy: ['Static Analyzer'],
    composesWith: ['tAudit', 'tRetry'],
    conflictsWith: ['tPure'],
    examples: ['@tSideEffect("external-api")', '@tSideEffect("filesystem")']
  },
  {
    name: 'tRequires',
    description: 'Declares required backend capabilities',
    purpose: 'Lists capabilities the runtime must provide for the operation',
    why: 'Capability graphs replace hidden module coupling',
    whenToUse: 'On operations depending on identifiable capabilities',
    category: 'Execution',
    targets: ['method', 'class'],
    consumedBy: ['Static Analyzer', 'Runtime', '@axiljs/studio'],
    composesWith: ['tProvides'],
    examples: ['@tRequires(["database", "redis", "payments"])']
  },
  {
    name: 'tProvides',
    description: 'Declares a provided backend capability',
    purpose: 'Marks the operation as providing a named capability',
    why: 'Capability graphs complement tRequires for static tooling',
    whenToUse: 'On operations that fulfill a named system capability',
    category: 'Execution',
    targets: ['method', 'class'],
    consumedBy: ['Static Analyzer', 'Runtime', '@axiljs/studio'],
    composesWith: ['tRequires'],
    examples: ['@tProvides("payment.completed")']
  }
]

// ============================================================================
// VALIDATION
// ============================================================================

const VALIDATION_DECORATORS: TDecoratorInfo[] = [
  {
    name: 'tMin',
    description: 'Numeric minimum',
    purpose: 'Enforces a minimum numeric value',
    why: 'Declarative numeric bounds simplify DTO contracts',
    whenToUse: 'On numeric properties with lower bounds',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation'],
    composesWith: ['tNumber', 'tMax'],
    examples: ['@tMin(0)']
  },
  {
    name: 'tMax',
    description: 'Numeric maximum',
    purpose: 'Enforces a maximum numeric value',
    why: 'Declarative numeric bounds simplify DTO contracts',
    whenToUse: 'On numeric properties with upper bounds',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation'],
    composesWith: ['tNumber', 'tMin'],
    examples: ['@tMax(100)']
  },
  {
    name: 'tMinLength',
    description: 'Minimum string length',
    purpose: 'Enforces a minimum length on string values',
    why: 'Declarative length bounds simplify DTO contracts',
    whenToUse: 'On string properties with a lower length bound',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation'],
    composesWith: ['tString', 'tMaxLength'],
    examples: ['@tMinLength(2)']
  },
  {
    name: 'tMaxLength',
    description: 'Maximum string length',
    purpose: 'Enforces a maximum length on string values',
    why: 'Declarative length bounds simplify DTO contracts',
    whenToUse: 'On string properties with an upper length bound',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation'],
    composesWith: ['tString', 'tMinLength'],
    examples: ['@tMaxLength(100)']
  },
  {
    name: 'tPattern',
    description: 'Regex pattern match',
    purpose: 'Enforces a regex pattern on string values',
    why: 'Declarative pattern matching simplifies DTO contracts',
    whenToUse: 'On string properties with a specific shape',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation'],
    composesWith: ['tString'],
    examples: ['@tPattern(/^[a-z0-9-]+$/)']
  },
  {
    name: 'tEnum',
    description: 'Value must be one of the listed options',
    purpose: 'Restricts a property to a fixed set of allowed values',
    why: 'Enumerated fields need explicit value contracts',
    whenToUse: 'On properties with a bounded value set',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tString', 'tNumber'],
    examples: ['@tEnum(["admin", "user"])']
  },
  {
    name: 'tNested',
    description: 'Validates a nested object against another DTO',
    purpose: 'Applies the nested DTO validators to the property value',
    why: 'Nested validation is a fundamental composition semantic',
    whenToUse: 'On properties whose value is another DTO',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation'],
    composesWith: ['tOptional', 'tArray'],
    examples: ['@tNested(() => AddressDto)']
  },
  {
    name: 'tCustom',
    description: 'Custom validation function',
    purpose: 'Runs a user-supplied validator against the property value',
    why: 'Application-specific validation is a natural extension point',
    whenToUse: 'When built-in validators are insufficient',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation'],
    composesWith: [],
    examples: ['@tCustom((v) => typeof v === "string" && v.startsWith("ax_"))']
  },
  {
    name: 'tString',
    description: 'Value must be a string',
    purpose: 'Validates that the value satisfies the "tString" constraint',
    why: 'Validation constraints are declarative field semantics',
    whenToUse: 'On DTO properties that must satisfy input constraints',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tOptional', 'tNested', 'tArray'],
    examples: ['@tString()']
  },
  {
    name: 'tNumber',
    description: 'Value must be a number',
    purpose: 'Validates that the value satisfies the "tNumber" constraint',
    why: 'Validation constraints are declarative field semantics',
    whenToUse: 'On DTO properties that must satisfy input constraints',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tOptional', 'tNested', 'tArray'],
    examples: ['@tNumber()']
  },
  {
    name: 'tBoolean',
    description: 'Value must be a boolean',
    purpose: 'Validates that the value satisfies the "tBoolean" constraint',
    why: 'Validation constraints are declarative field semantics',
    whenToUse: 'On DTO properties that must satisfy input constraints',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tOptional', 'tNested', 'tArray'],
    examples: ['@tBoolean()']
  },
  {
    name: 'tEmail',
    description: 'Value must be a valid email address',
    purpose: 'Validates that the value satisfies the "tEmail" constraint',
    why: 'Validation constraints are declarative field semantics',
    whenToUse: 'On DTO properties that must satisfy input constraints',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tOptional', 'tNested', 'tArray'],
    examples: ['@tEmail()']
  },
  {
    name: 'tUrl',
    description: 'Value must be a valid URL',
    purpose: 'Validates that the value satisfies the "tUrl" constraint',
    why: 'Validation constraints are declarative field semantics',
    whenToUse: 'On DTO properties that must satisfy input constraints',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tOptional', 'tNested', 'tArray'],
    examples: ['@tUrl()']
  },
  {
    name: 'tUuid',
    description: 'Value must be a valid UUID',
    purpose: 'Validates that the value satisfies the "tUuid" constraint',
    why: 'Validation constraints are declarative field semantics',
    whenToUse: 'On DTO properties that must satisfy input constraints',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tOptional', 'tNested', 'tArray'],
    examples: ['@tUuid()', '@tUuid({ version: 4 })']
  },
  {
    name: 'tOptional',
    description: 'Property may be omitted',
    purpose: 'Validates that the value satisfies the "tOptional" constraint',
    why: 'Validation constraints are declarative field semantics',
    whenToUse: 'On DTO properties that must satisfy input constraints',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tOptional', 'tNested', 'tArray'],
    examples: ['@tOptional()']
  },
  {
    name: 'tArray',
    description: 'Value must be an array',
    purpose: 'Validates that the value satisfies the "tArray" constraint',
    why: 'Validation constraints are declarative field semantics',
    whenToUse: 'On DTO properties that must satisfy input constraints',
    category: 'Validation',
    targets: ['property'],
    consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
    composesWith: ['tOptional', 'tNested', 'tArray'],
    examples: ['@tArray()']
  }
]

// ============================================================================
// COMBINED CATALOG
// ============================================================================

export const DECORATOR_CATALOG: TDecoratorInfo[] = [
  ...HTTP_DECORATORS,
  ...SECURITY_DECORATORS,
  ...DATA_DECORATORS,
  ...RELIABILITY_DECORATORS,
  ...CONCURRENCY_DECORATORS,
  ...DISTRIBUTED_DECORATORS,
  ...MESSAGING_DECORATORS,
  ...CACHING_DECORATORS,
  ...OBSERVABILITY_DECORATORS,
  ...COMPLIANCE_DECORATORS,
  ...RUNTIME_DECORATORS,
  ...WORKFLOW_DECORATORS,
  ...AI_DECORATORS,
  ...CONTRACT_DECORATORS,
  ...EXECUTION_DECORATORS,
  ...VALIDATION_DECORATORS
]