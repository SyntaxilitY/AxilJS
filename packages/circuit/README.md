# @axiljs/circuit

Circuit breaker, retry with backoff, and timeout utilities.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/circuit
```

## Usage

```typescript
import { CircuitBreaker, retry, withTimeout } from '@axiljs/circuit'

const cb   = new CircuitBreaker('payment', { failureThreshold: 5, resetTimeoutMs: 30000 })
const data = await retry(() => fetchAPI(), { attempts: 3, delay: 1000, backoff: 'exponential' })
const res  = await withTimeout(fetch(url), 5000)
```

## Rolling window, bulkhead, late results

```typescript
const cb = new CircuitBreaker('payments', {
  rollingWindowMs: 60_000, // count failures in the last minute only (default: cumulative)
  maxConcurrent: 10,       // bulkhead (default: unlimited)
  maxQueue: 50             // callers waiting for a slot (default: 0)
})

try {
  await cb.execute(() => charge())
} catch (e) {
  if (e instanceof BulkheadRejectedError) { /* shed load */ }
}
```

- Results of requests that were already in flight when the circuit changed
  state are ignored, so late failures can't extend the OPEN timer and stale
  results can't decide a HALF_OPEN probe.
- `getStats()` also reports `activeCount` and `queuedCount`.
- `retry(fn, { attempts: 0 })` runs `fn` once (attempts below 1 are treated as 1).

## State changes and logging

Every transition emits `stateChange` (`(next, previous)`), which is the
supported way to observe the breaker. By default it is also printed to the
console; `logger: false` silences that, or pass your own logger (plain text;
transitions to `OPEN` go to `warn`, the rest to `info`):

```typescript
const cb = new CircuitBreaker('payments', { logger: false })
cb.on('stateChange', (next, previous) => log.info({ breaker: cb.name, previous, next }))
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
