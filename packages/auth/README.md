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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
