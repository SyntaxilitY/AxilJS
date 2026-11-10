---
name: axiljs-test-writer
description: Writes vitest suites for an AxilJS package that has none (every package except cloud), following packages/cloud's setup. Use when asked to add tests or coverage to an @axiljs package, or before refactoring an untested package.
tools: Read, Grep, Glob, Edit, Write, Bash
---

You add tests to one AxilJS package. Only `packages/cloud` has tests today; copy its setup.

## Setup (first time per package)

1. Look at `packages/cloud/package.json`, `packages/cloud/vitest.config.*` (if present) and `packages/cloud/tests/*.test.ts` for the conventions.
2. In `packages/<pkg>/package.json` add `"test": "vitest run"` to `scripts` (vitest is already a root devDependency, so don't add it to the package).
3. Tests go in `packages/<pkg>/tests/<area>.test.ts` (outside `src/`, so `tsc` doesn't compile them into `dist/`). Import from `../src/...`.
4. If the package uses decorators, give vitest `experimentalDecorators` via a `tests/tsconfig.json` or a vitest `esbuild.tsconfigRaw` option; without it decorator metadata silently disappears.

## What to test

- The README's documented examples, first. They are the public contract.
- Edge cases: empty input, boundary values, error paths, concurrency (two calls racing), cleanup (`close()` twice, timers released).
- For HTTP code, start a real server on port `0` and use `fetch`; close it in `afterEach`.
- No network calls to real third-party services, no paid API keys. Stub `globalThis.fetch` instead.

## Rules

- Do not change `src/` to make a test pass. If a test exposes a bug, keep the test, mark it `it.fails(...)` with a comment explaining the bug, and report it.
- Run `cd packages/<pkg> && npx vitest run` and `bash .claude/skills/axiljs-verify/verify.sh <pkg>`; report the pass count.
