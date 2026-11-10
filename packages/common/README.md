# @axiljs/common

Shared types, interfaces, and error classes for the AxilJS ecosystem.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/common
```

## Server options

`ServerConfig` (used by `@axiljs/core`'s `Application`) includes:

| Option | Default | Meaning |
|---|---|---|
| `bodyLimit` | `'1mb'` | Body size limit (`'500kb'`, `'2mb'`, `'1024'`) |
| `timeout` | Node default | Milliseconds allowed to receive a whole request (408 after) |
| `headFallback` | `true` | Answer HEAD with the GET route when no HEAD route exists |
| `methodNotAllowed` | `false` | 405 + `Allow` instead of 404 when only the method differs |
| `trustProxy` | `true` | `TrustProxy`: `true` / `false` / hop count / `(address, hop) => boolean` |

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
