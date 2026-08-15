# @axiljs/validation

Schema-based request validation with chainable API.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/validation
```

## Usage

```typescript
import { v, validate } from '@axiljs/validation'

app.post('/users',
  validate({
    body: v.object({
      name:  v.string().min(2).max(100),
      email: v.string().email(),
      role:  v.enum(['admin', 'user']),
      age:   v.number().min(0).integer().optional()
    })
  }),
  (req, res) => {
    res.created(req.body, 'User created')
  }
)
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
