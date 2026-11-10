# Backups

Snapshots kept before larger rewrites. Nothing here is built, tested or published: npm workspaces only cover `packages/*` and `examples/*`, and `scripts/publish-all.js` only scans `packages/`.

| Folder | Snapshot of | Taken |
|---|---|---|
| `cli-2026-11-10/` | `packages/cli` (src, dist, tests, configs) right before the CLI layout/design rewrite, including that day's bug fixes and new commands (`generate`, `migrate`, per-command help) | 2026-11-10 |
| `cli-2026-11-10-v2/` | `packages/cli` after the first redesign (shared `ui.ts`, ✔/✖ status lines, rounded boxes, typed readline prompts), right before the "Hybrid" rail + arrow-key prompt redesign | 2026-11-10 |

Restore a snapshot:

```bash
rm -rf packages/cli/src packages/cli/tests
cp -r backups/cli-2026-11-10/src backups/cli-2026-11-10/tests packages/cli/
```
