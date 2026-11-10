# @axiljs/memory

Memory leak detection, automatic cleanup, GC optimization, and monitoring.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/memory
```

## Usage

```typescript
import { MemoryMonitor, optimizer, memoryMiddleware } from '@axiljs/memory'

const monitor = new MemoryMonitor({
  intervalMs:               30000,
  warnThresholdPercent:     70,
  criticalThresholdPercent: 85,
  autoFix:                  true
})

monitor.start()
app.use(memoryMiddleware({ leakThresholdMb: 50 }))
```

## Thresholds

Snapshots include `heapLimit`, `heapLimitMb` and `heapLimitPercent`
(`heapUsed / v8.getHeapStatistics().heap_size_limit`). `usagePercent`
(`heapUsed / heapTotal`) is unchanged, but it sits near 90% in healthy processes
because `heapTotal` grows on demand, so the monitor's thresholds use
`heapLimitPercent`:

- `criticalThresholdPercent` (default 85): status `critical`, `onCritical`,
  `'critical'` event, emergency optimization.
- `warnThresholdPercent` (default 70): `'warning'` event.
- `maxHeapMb`: optional absolute cap; `heapUsedMb >= maxHeapMb` is treated as
  critical. Not enforced unless you set it.

```typescript
const monitor = new MemoryMonitor({ maxHeapMb: 1024 })
monitor.on('warning',  snap => log.warn(`heap at ${snap.heapLimitPercent}% of limit`))
monitor.on('critical', snap => alert(snap))
```

## Optimizer

`optimizer.optimize()` triggers GC (with `--expose-gc`) and prunes tracked caches.
Clearing `require.cache` is **opt-in**, because re-requiring a module creates
duplicate singletons/classes and re-runs side effects:

```typescript
new MemoryOptimizer({ clearModuleCache: true }).optimize()
optimizer.optimize({ clearModuleCache: true })   // per call
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
