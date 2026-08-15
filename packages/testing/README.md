# @axiljs/testing

Test runner, assertions, and HTTP test client — no external dependencies.

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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
