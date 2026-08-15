# @axiljs/security

Security middleware — Helmet, rate limiting, CSRF, and sanitization.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/security
```

## Usage

```typescript
import { helmet, rateLimit, csrf, sanitize } from '@axiljs/security'

app.use(helmet())
app.use(rateLimit({ max: 100, windowMs: 60000 }))
app.use(csrf())
app.use(sanitize())
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
