# @axiljs/auth

JWT authentication, password hashing with scrypt, and RBAC middleware.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/auth
```

## Usage

```typescript
import { JWT, hashPassword, verifyPassword,
         authenticate, requireRole } from '@axiljs/auth'

const jwt    = new JWT(process.env.JWT_SECRET)
const hashed = await hashPassword('password123')
const valid  = await verifyPassword('password123', hashed)
const token  = jwt.sign({ sub: '1', role: 'admin' }, { expiresIn: '7d' })

app.get('/profile', authenticate(jwt), (req, res) => {
  res.success(req.locals.user, 'Profile fetched')
})

app.delete('/users/:id', authenticate(jwt), requireRole('admin'), handler)
```

## Algorithms, audience and token sources

```typescript
// HS256 (default), HS384 or HS512. verify() rejects tokens whose header
// names any other algorithm.
const jwt = new JWT(process.env.JWT_SECRET, { algorithm: 'HS512' })

// aud may be a string or an array (RFC 7519)
const token = jwt.sign({ sub: '1' }, { audience: ['api', 'admin'], issuer: 'auth.example' })
jwt.verify(token, { audience: 'api' })              // ok - 'api' is in aud
jwt.verify(token, { audience: ['web', 'admin'] })   // ok - any match

// authenticate() passes audience/issuer to verify(), and the cookie/query
// names are configurable (both default to 'token')
app.use(authenticate(jwt, {
  source: ['header', 'cookie', 'query'],
  cookieName: 'session',
  queryParam: 'access_token',
  audience: 'api',
  issuer: 'auth.example'
}))
```

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
