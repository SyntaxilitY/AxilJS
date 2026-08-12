# Build in dependency order
cd packages/common        && npm install && npm run build
cd ../config              && npm install && npm run build
cd ../security            && npm install && npm run build
cd ../pm                  && npm install && npm run build
cd ../orm                 && npm install && npm run build
cd ../auth                && npm install && npm run build
cd ../validation          && npm install && npm run build
cd ../core                && npm install && npm run build
cd ../testing             && npm install && npm run build
cd ../events              && npm install && npm run build
cd ../websocket           && npm install && npm run build
cd ../queue               && npm install && npm run build
cd ../circuit             && npm install && npm run build
cd ../observability       && npm install && npm run build
cd ../cli                 && npm install && npm run build

# Or from root:
npm run build:all

---

Phase 4 Complete ✅
Component	Status	Details
@restjs/events	✅	Event bus, pub/sub, wildcards, @OnEvent decorator
@restjs/websocket	✅	Full RFC 6455 implementation, rooms, broadcast
@restjs/queue	✅	Job queue, priority, retry, exponential backoff
Scheduler	✅	Cron-based task scheduler, zero dependencies
@restjs/circuit	✅	Circuit breaker, retry with backoff, timeout
@restjs/observability	✅	Structured logging, Prometheus metrics, health checks
Tracer	✅	Distributed tracing, W3C traceparent, span management
Observability middleware	✅	Auto request metrics + tracing on every route