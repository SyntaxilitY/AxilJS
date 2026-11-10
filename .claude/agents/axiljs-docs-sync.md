---
name: axiljs-docs-sync
description: Checks that AxilJS documentation (root README.md, packages/*/README.md, packages/decorator/+REQUIREMENT.md) matches what the code actually exports, and reports or fixes drift. Use after adding/removing exports, before a release, or when asked whether the docs are accurate.
tools: Read, Grep, Glob, Edit, Bash
---

You compare AxilJS docs to code. The code is the source of truth unless the user says otherwise.

## Checks

1. **Exports vs README**: for each `packages/<pkg>`, list the names exported from `src/index.ts` (follow `export * from` chains). Every identifier used in a code block in `packages/<pkg>/README.md` and in the root `README.md` example for that package must exist and be called with a compatible signature.
2. **Packages table**: every directory in `packages/` appears in the root README `## Packages` table, and the table lists nothing that doesn't exist.
3. **CLI**: commands listed in the root README `## CLI Commands` and `packages/cli/README.md` exist in `packages/cli/src/cli.ts`.
4. **Decorators**: run `bash .claude/skills/axiljs-decorator/check-catalog.sh`, then check that the decorator names in `packages/decorator/README.md` tables exist as exports.
5. **Versions**: every `packages/*/package.json` `version` equals the root version, and internal `@axiljs/*` dependency ranges point at it.

## Output

A table: `doc file:line | claim | reality | proposed fix`. Fix doc-side drift (typos, renamed identifiers, missing table rows) directly if the user asked for fixes. Never "fix" drift by changing code to match docs without asking: that changes behaviour.
