# @axiljs/testing

Test runner, assertions, mocks and HTTP test client — no external dependencies.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/testing
```

## Usage

```typescript
import { describe, it, expect, createTestClient } from '@axiljs/testing'

describe('Users API', () => {
  const client = createTestClient(app)

  it('creates a user', async () => {
    const res = await client.post('/users').auth(token).send({ name: 'Tariq' })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Tariq')
  })
})
```

Run with `axil test [pattern]` (projects from `axil create` already have
`@axiljs/testing` and `"test": "axil test"`), or call `runTests()` yourself.

## Runner

```typescript
describe('Users', () => {
  beforeEach(() => db.reset())              // runs before every test below, incl. nested ones

  describe('create', () => {                // reported as "Users > create > ..."
    beforeEach(() => seed())                // runs after the parent's beforeEach
    it('rejects duplicates', async () => { /* ... */ })
    it('is slow', async () => { /* ... */ }, 10_000)   // per-test timeout (ms)
  })

  it.each([[1, 1, 2], [2, 3, 5]])('%i + %i = %i', (a, b, sum) => {
    expect(a + b).toBe(sum)
  })
  it.each([{ role: 'admin' }, { role: 'user' }])('works for $role', ({ role }) => { /* ... */ })

  it.skip('later', () => {})                 // also xit()
  it.only('focus', () => {})                 // also fit()
})

describe.skip('disabled suite', () => {})   // also xdescribe()
describe.only('focused suite', () => {})    // also fdescribe()
describe.each([['sqlite'], ['postgres']])('driver %s', (driver) => { /* ... */ })
```

- Nested `describe` blocks; names are prefixed with every parent suite.
- Hooks are inherited: parent `beforeEach` → child `beforeEach` → test →
  child `afterEach` → parent `afterEach`. Several hooks of the same type run in
  registration order. Hooks called outside any `describe` apply to every test in
  that file (outermost: top-level `beforeEach` runs before the suites' own, its
  `afterEach` after them). `beforeAll`/`afterAll` run once per suite (skipped when
  nothing in the suite will run). A failing `beforeAll` fails every test of the suite;
  a failing `beforeEach`/`afterEach` fails that test.
- `only` applies across all suites; `skip` wins over `only`.
- Every test and hook has a timeout: the third `it()` argument, else
  `runTests({ timeout })`, else **5000 ms** (`DEFAULT_TIMEOUT`).
- `it.each` / `describe.each` names support `%s %d %i %f %j %o %p %#` and `$key` / `$a.b`.
- `runTests(options?)` resolves to `true`/`false`; `runTestsWithResults(options?)`
  returns `{ success, passed, failed, skipped, durationMs, results }`.
  Options: `{ timeout?, silent? }`. Both clear the registry afterwards;
  `resetTests()` clears it manually.

## Assertions

```typescript
expect(value).toBe(x) / .toEqual(x) / .toMatchObject({ user: { name: 'Tariq' } })
expect(obj).toHaveProperty('a.b[0].c', 5)          // path or ['a', 'b', 0, 'c']
expect(list).toContain(item) / .toContainEqual({ id: 1 }) / .toHaveLength(3)
expect(0.1 + 0.2).toBeCloseTo(0.3)                 // numDigits defaults to 2
expect(n).toBeGreaterThan(1) / .toBeGreaterThanOrEqual / .toBeLessThan / .toBeLessThanOrEqual
expect(err).toBeInstanceOf(NotFoundError) / expect(x).toBeNaN()
expect(fn).toThrow() / .toThrow('message') / .toThrow(/regex/) / .toThrow(TypeError)
expect(x).not.toBe(y)

await expect(promise).resolves.toEqual({ ok: true })   // any matcher
await expect(promise).rejects.toThrow('timeout')
await expect(promise).rejects.toBeInstanceOf(NotFoundError)
```

## Mocks

```typescript
import { fn, spyOn } from '@axiljs/testing'

const send = fn().mockResolvedValue({ id: 1 })
await send('a@b.c')
expect(send).toHaveBeenCalled()
expect(send).toHaveBeenCalledTimes(1)
expect(send).toHaveBeenCalledWith('a@b.c')
send.mock.calls          // [['a@b.c']]

const spy = spyOn(mailer, 'deliver').mockImplementation(async () => true)
// ...
spy.mockRestore()        // original method is back
```

Mock API: `mock.calls`, `mock.results`, `mock.lastCall`, `mockReturnValue(Once)`,
`mockResolvedValue(Once)`, `mockRejectedValue(Once)`, `mockImplementation(Once)`,
`mockClear()`, `mockReset()`, `mockRestore()`. Matchers: `toHaveBeenCalled`,
`toHaveBeenCalledTimes`, `toHaveBeenCalledWith`, `toHaveBeenLastCalledWith`.

## HTTP test client

`createTestClient(app)` → `get/post/put/patch/delete(path)`, chain `.set(name, value)`,
`.auth(token)`, `.send(body)`, then `await`. Objects, arrays, numbers etc. are
JSON-encoded (default `Content-Type: application/json`); a string or `Buffer` body
is always sent **as-is**, so you can post exact pre-serialized JSON or set another
`Content-Type` (e.g. `application/x-www-form-urlencoded`, `text/plain`). The builder
type is exported as `TestRequest`, so helpers like
`export const createUser = (body: object) => client.post('/users').send(body)`
work with `declaration: true`.

## Contract testing

Contract helpers turn declared intent into executable checks. They work over
HTTP through `createTestClient(app)`, so they test the same pipeline your users
hit. Requests are described as data (`{ method?, path, headers?, body? }`) so the
helpers can replay them. Every helper returns a report object and, on failure,
throws a `ContractViolationError` (a subclass of `AssertionError`) whose message
explains what diverged; the report is attached as `error.report`.

### Idempotency

```typescript
import { createTestClient, expectIdempotent } from '@axiljs/testing'

const client = createTestClient(app)

await expectIdempotent(client, { method: 'POST', path: '/orders', body: { sku: 'A1' } }, {
  times: 3,                                  // default 2
  concurrent: true,                          // first call alone, the rest in parallel
  ignore: ['timestamp', 'data.*.updatedAt'], // volatile fields
  snapshot: () => db.query('SELECT count(*) AS n FROM orders')
})
```

The same request is sent `times` times with one generated `Idempotency-Key`
header (pass `idempotencyKey: 'fixed'` to choose it, `false` to omit it, or set
the header yourself). Every response must have the status and body of the first
call. Body comparison ignores the dotted paths in `ignore` (default
`['timestamp', 'requestId', 'meta.timestamp']`; `*` matches any key or index);
for an AxilJS envelope the paths also match inside `data`. With `snapshot`, the
state observed after the first call must equal the state after the last.

```text
AssertionError: Expected POST /counter (2x, sequential) to be idempotent:
call #2 body differs from call #1 (ignoring timestamp, requestId, meta.timestamp):
  - data.count: 1 != 2
```

### Tenant isolation

```typescript
await expectTenantIsolated(client, {
  seed: [
    { tenant: 'acme',   as: { authorization: `Bearer ${acmeToken}` } },
    { tenant: 'globex', as: { headers: { authorization: `Bearer ${globexToken}` } } }
  ],
  read: { path: '/invoices' },
  tenantOf: row => row.tenantId,
  forbidden: [{ path: `/invoices/${globexInvoiceId}`, as: { authorization: `Bearer ${acmeToken}` } }]
})
```

`read` is performed once per tenant with that tenant's credentials (`as` is a
header map or a partial request merged over `read`). The read must succeed with
a 2xx status, and every returned row must belong to the calling tenant. Rows are
found in a plain array, `{ data: [...] }`, or the paginated
`{ data: { metadata: [...] } }` shape; pass `rows: body => ...` for anything
else. Each `forbidden` probe must be refused with 403 or 404 (override with
`expect: [...]`).

### Runtime intent violations

```typescript
await expectNoIntentViolations(async () => {
  await client.post('/reports').send({ range: 'month' })
})
```

When `@axiljs/runtime` is loaded it publishes its report on
`globalThis[Symbol.for('axiljs.runtime.report')]`. The helper runs the
function, compares the runtime's violations before and after, and fails with a
list of any new ones (also when the function itself threw). Without the
runtime it simply runs the function and returns its result. This package does
not depend on `@axiljs/runtime`.

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
