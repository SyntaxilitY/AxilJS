---
name: axiljs-verify
description: Type-check and test AxilJS packages without touching the committed dist/ folders. Use after any change under packages/*/src, before committing, or when asked to "verify", "check the build", or "run the tests" in this repo.
---

# Verify AxilJS

Run from the repo root:

```bash
bash .claude/skills/axiljs-verify/verify.sh            # every package
bash .claude/skills/axiljs-verify/verify.sh core orm   # only some
```

Windows PowerShell (5.1+ or pwsh), same checks plus a summary table:

```powershell
powershell -ExecutionPolicy Bypass -File .claude\skills\axiljs-verify\verify.ps1
powershell -ExecutionPolicy Bypass -File .claude\skills\axiljs-verify\verify.ps1 core orm
```

What it does, per package:

1. `npx tsc --noEmit -p packages/<pkg>`: type-check only, so the **committed `dist/` is not rewritten**.
2. If the package has a `test` script and a `tests/` dir, run `npx vitest run`. Each package's `vitest.config.*` makes Vite load `src/*.ts` before the stale committed `src/*.js`; keep that config when adding tests.

Exit code is non-zero if anything fails. Report failures with the printed `error TS` lines; do not claim success unless every line starts with `ok`.

## Rules

- If `node_modules` is missing, run `npm ci` first (the script tells you).
- Packages import each other through their published `dist/` (workspace symlinks). If you changed package A's **public types** and package B depends on them, B type-checks against A's *old* `dist/` until A is rebuilt. Rebuild A with `npm run build:<a>` only when the user agrees to regenerate `dist/`, otherwise mention the caveat.
- Throwaway runtime checks go in the session scratchpad, run with `npx tsx`. Put a `tsconfig.json` with `"experimentalDecorators": true` next to them, or decorators compile as TC39 decorators and metadata silently goes missing.
- Never leave scratch scripts in `packages/` or `examples/`.
