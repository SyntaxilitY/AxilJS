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

## .env syntax

```bash
# comments and blank lines are ignored
PLAIN=value            # inline comments are stripped from unquoted values
DOUBLE="a\nb"          # \n becomes a newline inside double quotes
SINGLE='a\nb'          # single quotes are literal (no escape processing)
PRIVATE_KEY="-----BEGIN KEY-----
MIIB...
-----END KEY-----"     # quoted values may span several lines
```

Multiline values continue until the line holding the closing quote; a quote
that never closes is read as a plain single-line value. `parseEnvFile(text)`
is exported for parsing without touching `process.env`.

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
