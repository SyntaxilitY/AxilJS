---
name: axiljs-new-package
description: Scaffold a new @axiljs/<name> workspace package in this monorepo with the same package.json, tsconfig, README and build wiring as the existing packages. Use when asked to add a new AxilJS package/module (e.g. @axiljs/mail, @axiljs/storage).
---

# New @axiljs package

All packages live in `packages/<name>/` and are published as `@axiljs/<name>`. Copy the conventions of a small existing package (`packages/circuit` or `packages/events`), not a big one.

## Files

```
packages/<name>/
├── package.json
├── tsconfig.json
├── README.md
├── .npmignore        # copy from packages/circuit
└── src/
    └── index.ts      # the only public entry; re-export everything public from here
```

**package.json**: copy `packages/circuit/package.json`, then change only `name`, `description`, `dependencies`. Keep:
- `"version"` equal to the root `package.json` version (all packages move in lockstep).
- `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`, `"files": ["dist", "README.md"]`.
- `"scripts": { "build": "tsc", "dev": "tsc --watch" }`. Add `"test": "vitest run"` only if you add a `tests/` dir (see `packages/cloud`).
- the same `repository`, `homepage`, `bugs`, `author`, `license`, `publishConfig`.
- Internal deps as `"@axiljs/common": "^<root version>"`.

**tsconfig.json**:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

## Wiring

1. Root `package.json`: add `"build:<name>": "cd packages/<name> && npm run build"` and append it to `build:all` **after** every package it depends on (`build:all` is ordered by dependency).
2. Root `README.md` → `## Packages` table: add a row.
3. Run `npm install` at the root so the workspace symlink exists.

## Code rules

- Zero runtime dependencies is the house style. Prefer `node:` built-ins (`node:crypto`, `node:http`, `node:events`); justify any npm dependency to the user first.
- Timers that run in the background must call `.unref()` so they don't keep the process alive.
- Classes that own resources expose `close()`/`stop()` and are idempotent.

## Verify

```bash
bash .claude/skills/axiljs-verify/verify.sh <name>
```
