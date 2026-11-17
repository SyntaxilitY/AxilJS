# @axiljs/scale

Vertical scaling (cluster mode), capacity planning and multi-process readiness checks for AxilJS. Zero dependencies.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

```bash
npm install @axiljs/scale
```

## The honest numbers

No Node.js framework (or any other) serves millions of requests per second from one process or one machine. One `@axiljs/core` worker does roughly 15–25k req/s on a hello-world route, and real routes with DB calls do less. Large targets are reached by **more cores** (vertical: one worker per core) and **more machines** (horizontal: instances behind a load balancer):

```
1,500,000 req/s × 1.3 headroom ÷ (17k req/s × 8 cores × 0.85) ≈ 17 instances of 8 CPU
```

This package does that arithmetic with *your* numbers and tells you whether your configuration can carry the target.

## Configure: `axil.scaling.json`

```json
{
  "target":     { "rps": 1500000, "concurrentConnections": 2000000, "p99Ms": 50 },
  "vertical":   { "workers": "auto", "maxConnectionsPerWorker": 20000, "memoryPerWorkerMb": 512,
                  "shutdownTimeoutMs": 10000, "keepAliveTimeoutMs": 65000 },
  "horizontal": { "instances": { "min": 6, "max": 18 }, "instanceSize": { "cpus": 8, "memoryGb": 16 } },
  "headroom": 0.3
}
```

`axil capacity --init` writes a starter file. `AXIL_WORKERS` overrides `vertical.workers`.

## Check: `axil capacity`

```bash
axil capacity                                    # calibrate one worker on this machine, then plan
axil capacity --url http://localhost:3000/api/users --server-workers 8   # plan from your real route
axil capacity --json                             # CI: exit code 1 when the target can't be met
```

It reports:

- **This machine**: cores, memory, container CPU quota, open-file limit
- **Measurement**: req/s per worker, p50/p99 latency
- **Plan**: per-instance and deployment throughput vs target + headroom, instances needed
- **Checks**: instance count, connections per worker, memory per instance, `ulimit -n`, oversubscribed workers, `workers: 'auto'` inside a CPU-limited container, p99 vs target
- **Multi-process readiness**: scans `src/` for in-memory state that breaks with several workers or instances: `rateLimit()` without a shared `store`, `new Scheduler()` (cron fires once per process), in-memory `Queue`, `EventBus`, `WSServer` rooms, `CloudCache`, SQLite

`axil deploy` reads the same file: replicas = `instances.min`, an HPA up to `instances.max`, pod resources from `instanceSize`, `AXIL_WORKERS` pinned to the pod's CPUs, and a termination grace period that covers the drain.

## Run: `serve()`

```typescript
import { Application } from '@axiljs/core'
import { serve } from '@axiljs/scale'

serve(() => {
  const app = new Application()
  app.get('/', (req, res) => res.success({ ok: true }))
  return app
}, { port: 3000 })
```

- `workers > 1`: the primary forks one worker per core, restarts crashed workers with backoff (gives up after `maxRestarts` crashes per minute), and on SIGTERM/SIGINT drains every worker: stop accepting, finish in-flight requests, close idle keep-alive sockets, force-close after `shutdownTimeoutMs`.
- `workers = 1`: same graceful shutdown, in-process.
- Each worker gets `--max-old-space-size=memoryPerWorkerMb`, `server.maxConnections = maxConnectionsPerWorker`, and `keepAliveTimeoutMs` when set. Behind a load balancer, set `keepAliveTimeoutMs` above the balancer's idle timeout (AWS ALB: 60 s) to avoid sporadic 502s.
- At startup the primary prints host-check warnings (oversubscription, container quota, memory, `ulimit -n`).

### Shared state across workers

Each worker is a separate process, so in-memory state is per worker. `onPrimary` runs once in the primary before the workers start; use it to install the primary-side services that share rate-limit counters and events between workers:

```typescript
import { serve } from '@axiljs/scale'
import { installClusterRateLimitPrimary } from '@axiljs/security'
import { installClusterEventRelay } from '@axiljs/events'

serve(createApp, {
  port: 3000,
  onPrimary: () => {
    const stopRateLimits = installClusterRateLimitPrimary()
    const stopRelay = installClusterEventRelay()
    return () => { stopRateLimits(); stopRelay() }
  }
})
```

Inside the app, use `rateLimit({ store: new ClusterStore() })` and `new EventBus({ transport: new ClusterTransport() })`. Both behave like their in-process versions when there is only one worker.

## Programmatic API

```typescript
import { detectSystem, resolveScaling, calibrate, loadTest, planCapacity, scanProject } from '@axiljs/scale'

const system  = detectSystem()
const scaling = resolveScaling({ target: { rps: 200_000 } }, system)
const cal     = await calibrate({ coreEntry: require.resolve('@axiljs/core') })
const report  = planCapacity({ scaling, system, measurement: { rpsPerWorker: cal.rpsPerWorker, source: 'calibrated' } })
report.verdict        // 'ok' | 'warn' | 'fail'
report.required       // { rps, instances }
report.findings       // [{ level, area, title, detail, fix }]
```

The model (printed in every report) is deliberately simple: linear per-core scaling × `clusterEfficiency` (default 0.85), `memoryPerConnectionKb` (default 48). Override both in `planCapacity()` when you have better numbers, and confirm with a load test against a real deployment.
