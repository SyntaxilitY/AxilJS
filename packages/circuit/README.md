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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
