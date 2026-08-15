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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
