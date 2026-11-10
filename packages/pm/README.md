# @axiljs/pm

Package manager with lock file and SHA-256 checksum verification — zero
dependencies (`node:https`/`node:http`, `node:zlib`, `node:crypto`).

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/pm
```

## Usage

```typescript
import { Installer } from '@axiljs/pm'

const installer = new Installer({ cwd: process.cwd() })
const result = await installer.install({ includeDev: true })
// result: { installed, cached, failed, placements, errors }
```

What `install()` does:

1. Reads `dependencies` (+ `devDependencies` unless `includeDev: false`) from `package.json`.
2. Resolves every package **and its transitive dependencies** — from `@axiljs.lock`
   when an entry exists (no registry request), otherwise from the registry
   (semver ranges are resolved locally: `^`, `~`, `>=`, `<`, `x`, `||`, hyphen ranges).
   Versions are de-duplicated by `name@version`.
3. Lays out a **flat `node_modules`**: a dependency is hoisted to the top level unless a
   different, incompatible version already lives there — then it is nested under the
   package that needs it (`node_modules/c/node_modules/b`). Cycles are handled.
4. Downloads each tarball once, verifies the registry `integrity` (sha512 SRI) or
   `shasum`, and — for locked packages — the SHA-256 checksum in `@axiljs.lock`.
5. **Extracts the `.tgz`** with `node:zlib` + a built-in ustar reader: 512-byte headers,
   pax (`x`) and GNU long-name (`L`) headers, files and directories, `package/` prefix
   stripped. Entries that would escape the target directory (`..`, absolute paths,
   drive letters) abort the extraction before anything is written; symlinks/hard links
   are skipped.
6. Writes `@axiljs.lock` (one entry per requested `name@range`, including transitive ones).

### Options

| Option | Default | |
| --- | --- | --- |
| `cwd` | `process.cwd()` | Project directory |
| `includeDev` | `true` | Install devDependencies |
| `force` | `false` | Ignore lock entries and the cache |
| `registry` | `https://registry.npmjs.org` | Registry URL (`http://` works for local mirrors) or a `RegistryClient` |
| `cacheDir` | `$AXILJS_CACHE_DIR` or `~/.axiljs/cache` | Tarball cache |
| `transitive` | `true` | Install dependencies of dependencies |
| `silent` / `verbose` | `false` | Output control |

### Cache directory

Tarballs are cached in **`~/.axiljs/cache`** (override with `AXILJS_CACHE_DIR` or
`cacheDir`). Versions before 0.3.2 wrote to the misspelled `~/.@axiljsjs/cache`; that
directory is still **read** as a fallback so existing caches keep working, but nothing
new is written there — it can be deleted at any time.

## Utilities

```typescript
import {
  extractTarball, parseTar, createTar,   // tar/tgz helpers
  maxSatisfying, satisfiesRange,         // semver
  calculateChecksum, verifyChecksum, verifyIntegrity
} from '@axiljs/pm'

extractTarball(tgzBuffer, 'node_modules/left-pad')   // strips "package/"
maxSatisfying(['1.0.0', '1.2.0', '2.0.0'], '^1.0.0') // '1.2.0'
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
