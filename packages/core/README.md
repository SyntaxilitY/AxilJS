# @axiljs/core

HTTP server, router, middleware, SSE, static files, and built-in SyntaxilitY response manager.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/core
```

## Usage

```typescript
import { Application, cors } from '@axiljs/core'

const app = new Application()

app.get('/users', (req, res) => {
  res.success(users, 'Users fetched')
})

app.post('/users', (req, res) => {
  res.created(req.body, 'User created')
})

app.listen()
```

## Built-in Response Manager

Every `res` object includes SyntaxilitY API Response Manager — no imports needed:

```typescript
res.success(data, 'message')               // 200 OK
res.created(data, 'message')               // 201 Created
res.paginated(items, total, page, limit)   // 200 with pagination metadata
res.noContent()                            // 204 No Content
res.badRequest('message')                  // 400 Bad Request
res.unauthorized('message')                // 401 Unauthorized
res.forbidden('message')                   // 403 Forbidden
res.notFound('message')                    // 404 Not Found
res.conflict('message')                    // 409 Conflict
res.validationError('message')             // 422 Unprocessable Entity
res.tooManyRequests('message')             // 429 Too Many Requests
res.serverError('message')                 // 500 Internal Server Error
res.serviceUnavailable('message')          // 503 Service Unavailable
```

Response format:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": { }
}
```

Paginated response:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": {
    "metadata": [],
    "pagination": {
      "total": 42,
      "page": 1,
      "limit": 10,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
