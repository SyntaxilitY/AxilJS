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
- Query/form strings are coerced: `v.number()` accepts numeric strings and returns
  the **number** (`'42'` → `42`; empty/blank strings are rejected), `v.boolean()`
  returns `true` for `'true'`/`'1'` and `false` for `'false'`/`'0'`.
  `integer/min/max/positive`, `custom()` and `transform()` see the coerced value.
- The validator classes (`StringValidator`, `NumberValidator`, `ObjectValidator`, …,
  `BaseValidator`) and helper types (`SchemaShape`, `InferShape`, …) are exported,
  so `export const userSchema = v.object({...})` compiles with `declaration: true`.

## JSON Schema

Every schema converts to JSON Schema 2020-12, the dialect of OpenAPI 3.1:

```typescript
import { v, toJSONSchema } from '@axiljs/validation'

const createUser = v.object({
  name:  v.string().min(2).max(100),
  email: v.string().email(),
  age:   v.number().integer().min(0).optional(),
  role:  v.enum(['admin', 'user']).default('user'),
  bio:   v.string().nullable()
})

createUser.toJSONSchema()
// {
//   type: 'object',
//   properties: {
//     name:  { type: 'string', minLength: 2, maxLength: 100 },
//     email: { type: 'string', format: 'email' },
//     age:   { type: 'integer', minimum: 0 },
//     role:  { type: 'string', enum: ['admin', 'user'], default: 'user' },
//     bio:   { type: ['string', 'null'] }
//   },
//   required: ['name', 'email', 'bio']
// }

toJSONSchema(createUser, { $schema: true }) // adds $schema: JSON_SCHEMA_DIALECT
```

| Builder | JSON Schema |
|---|---|
| `v.string()` `.min/.max/.pattern` | `type: 'string'`, `minLength`, `maxLength`, `pattern` (regex source; flags dropped) |
| `.email()` / `.url()` | `format: 'email'` / `format: 'uri'` |
| `v.number()` `.integer/.min/.max/.positive` | `type: 'number'` or `'integer'`, `minimum`, `maximum`, `exclusiveMinimum: 0` |
| `v.boolean()` | `type: 'boolean'` |
| `v.enum([...])` | `type: 'string'`, `enum` |
| `v.literal(x)` | `const` (with its `type`) |
| `v.array(item)` `.min/.max` | `type: 'array'`, `items`, `minItems`, `maxItems` |
| `v.object(shape)` | `type: 'object'`, `properties`, `required` |
| `v.record(value)` | `type: 'object'`, `additionalProperties: <value schema>` |
| `v.union([...])` | `anyOf` |
| `.optional()` / `.default(x)` | left out of the parent's `required`; `default: x` |
| `.nullable()` | `type: [T, 'null']` (`enum` gains `null`; `const` / `anyOf` gain `{ type: 'null' }`) |
| `.custom()` / `.transform()` | nothing; not representable |

Notes:

- The schema describes the **input** a validator accepts. Transforms change the
  output and are not reflected.
- `v.number()` and `v.boolean()` also accept numeric / boolean strings (query
  strings and form fields are text). The schema still says `number` / `boolean`,
  which is the type clients send and how query parameters are documented.
- Objects accept unknown keys (kept by default, removed by `strip()`), so
  `additionalProperties` is not set.
- `.trim()` length limits apply to the trimmed value; `minLength` / `maxLength`
  are emitted unchanged.

### Discovering the schemas of `validate()`

The middleware returned by `validate()` carries the schemas it checks, so tools
(for example `generateOpenAPI()` in `@axiljs/core`) can document a route
without importing this package:

```typescript
const mw = validate({ body: createUser, query: listQuery })

mw.schemas.body                              // createUser
mw[Symbol.for('axiljs.validation.schemas')]  // the same object (exported as VALIDATION_SCHEMAS)
mw.schemas.body?.toJSONSchema()
```

Only the locations passed to `validate()` are present. Both properties are
read-only and non-enumerable, and validation behaviour is unchanged.

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
