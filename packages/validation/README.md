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

## Transforms, literals, unions and records

```typescript
v.string().trim()                          // validates and returns the trimmed string
v.string().transform(s => s.toLowerCase()) // map the output (after validation)
v.string().pattern(/^\d+$/).transform(Number)

v.literal('admin')                          // exactly this value (string/number/boolean/null)
v.union([v.string(), v.number()])           // first matching option wins (its output is used)
v.record(v.number().min(0))                 // object with any keys, every value validated
```

- Transforms run in order on the output only; validation rules still see the
  input. They are skipped for `null`/`undefined`. A throwing transform makes
  `parse()` fail with code `TRANSFORM_ERROR`.
- `v.number()` rejects `NaN` and `±Infinity` (including the strings `'NaN'`/`'Infinity'`).

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
