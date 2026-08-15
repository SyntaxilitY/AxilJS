# @axiljs/config

Environment loading and typed configuration validation for AxilJS.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/config
```

## Usage

```typescript
import { loadEnv, defineConfig } from '@axiljs/config'

loadEnv()

const config = defineConfig({
  PORT:         { type: 'number',  default: 3000 },
  DATABASE_URL: { type: 'string',  required: true },
  DEBUG:        { type: 'boolean', default: false },
  NODE_ENV:     { type: 'string',  enum: ['development', 'production', 'test'] }
})
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
