# minimal

A minimal [AxilJS](https://github.com/SyntaxilitY/AxilJS) HTTP API, created with
`axil create minimal --template minimal`.

It shows the core building blocks and nothing else:

- **@axiljs/core**: `Application`, routes with path params, CORS, the response envelope (`res.success`)
- **@axiljs/config**: `.env` loading and a typed config (`loadEnv` + `defineConfig`)
- **@axiljs/validation**: request validation with `v.object(...)` and `validate({ body, params })`, 422 on bad input
- **Errors**: one error handler that turns thrown errors (404, 405, 422, 500) into the same JSON shape
- **@axiljs/testing**: tests that drive the app without opening a port

## Run

```bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # watch mode, http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## Test

```bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
```

## Endpoints

| Method | Path           | Description                         | Success | Errors   |
|--------|----------------|-------------------------------------|---------|----------|
| GET    | `/`            | Service name, version and endpoints | 200     |          |
| GET    | `/health`      | Liveness: status, uptime, timestamp | 200     |          |
| GET    | `/hello/:name` | Greeting; `name` is letters only    | 200     | 422      |
| POST   | `/echo`        | Echo a validated JSON body          | 200     | 422      |
| *      | anything else  | JSON error                          |         | 404, 405 |

`POST /echo` body:

| Field     | Type     | Rules                               |
|-----------|----------|-------------------------------------|
| `message` | string   | required, trimmed, 1-280 characters |
| `repeat`  | integer  | 1-5, default 1                      |
| `tags`    | string[] | up to 5 tags of 1-20 characters     |

Unknown fields are dropped (`.strip()`).

Successful responses use the AxilJS envelope:

```json
{ "status": 200, "code": "HTTP_200_OK", "message": "Greeting created", "data": { "greeting": "Hello, Ada!" } }
```

Errors share one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [ { "path": "message", "code": "REQUIRED", "source": "body", "message": "message is required" } ] } }
```

### curl

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/hello/Ada
curl -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d '{"message":"hello","repeat":2,"tags":["demo"]}'
curl -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d '{"message":""}'    # 422
curl http://localhost:3000/nope                                                                     # 404
```

### PowerShell

`curl` is an alias for `Invoke-WebRequest` in Windows PowerShell, so use `curl.exe` or `Invoke-RestMethod`:

```powershell
Invoke-RestMethod http://localhost:3000/hello/Ada
Invoke-RestMethod http://localhost:3000/echo -Method Post -ContentType 'application/json' `
  -Body (@{ message = 'hello'; repeat = 2; tags = @('demo') } | ConvertTo-Json)
curl.exe -s http://localhost:3000/health
```

## Configuration

| Variable      | Default       | Description                                    |
|---------------|---------------|------------------------------------------------|
| `PORT`        | `3000`        | HTTP port                                      |
| `HOST`        | `127.0.0.1`   | Bind address (`0.0.0.0` in containers)         |
| `NODE_ENV`    | `development` | `development`, `production` or `test`          |
| `CORS_ORIGIN` | `*`           | `*` or a comma-separated list of origins       |

## Project structure

```
src/
  main.ts                     entry point: loadEnv, createApp, listen, graceful shutdown
  app.ts                      createApp(config): routes, validation schemas, CORS
  config.ts                   typed config (defineConfig)
  middleware/error-handler.ts thrown errors -> { error: { code, message, details } }
  app.test.ts                 tests for every route
```

`createApp()` never listens, so tests build the app and call it through
`createTestClient(app)`; only `main.ts` opens a port.

## Next steps

- Add routes in `src/app.ts`, or move them into a `Router` and `app.mount('/prefix', router)`
- Need a database, auth and RBAC? See the `rest-api` template: `axil create my-api --template rest-api`
