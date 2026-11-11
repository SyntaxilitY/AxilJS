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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
