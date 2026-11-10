#!/usr/bin/env bash
# Compare decorators defined in @axiljs/decorator with the CLI's bundled catalog.
# Exit 1 on drift. Usage: bash .claude/skills/axiljs-decorator/check-catalog.sh
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

DEF="$(mktemp)"; CAT="$(mktemp)"; EXP="$(mktemp)"
trap 'rm -f "$DEF" "$CAT" "$EXP"' EXIT

grep -ohE "export (const|function) t[A-Z][A-Za-z0-9]*" packages/decorator/src/decorators/*.ts | awk '{print $3}' | sort -u > "$DEF"
grep -ohE "name: 't[A-Z][A-Za-z0-9]*'" packages/cli/src/commands/decorator-catalog.ts | grep -oE "t[A-Z][A-Za-z0-9]*" | sort -u > "$CAT"
grep -oE "from './decorators/[a-z-]+'" packages/decorator/src/index.ts | grep -oE "[a-z-]+'$" | tr -d "'" | sort -u > "$EXP"

status=0
missing_files="$(while read -r f; do [ -f "packages/decorator/src/decorators/$f.ts" ] || echo "$f"; done < "$EXP")"
if [ -n "$missing_files" ]; then
  echo "index.ts re-exports files that do not exist:"; echo "$missing_files" | sed 's/^/  /'; status=1
fi
unexported="$(for f in packages/decorator/src/decorators/*.ts; do b="$(basename "$f" .ts)"; grep -qx "$b" "$EXP" || echo "$b"; done)"
if [ -n "$unexported" ]; then
  echo "decorator files not re-exported from index.ts:"; echo "$unexported" | sed 's/^/  /'; status=1
fi
unprimed="$(while read -r f; do grep -qE "^import \* as [A-Za-z]+ from './decorators/$f'" packages/decorator/src/index.ts || echo "$f"; done < "$EXP")"
if [ -n "$unprimed" ]; then
  echo "group files missing from __setCatalogLoader in index.ts (listDecorators won't see them):"; echo "$unprimed" | sed 's/^/  /'; status=1
fi
only_def="$(comm -23 "$DEF" "$CAT")"
only_cat="$(comm -13 "$DEF" "$CAT")"
if [ -n "$only_def" ]; then echo "defined but missing from CLI catalog:"; echo "$only_def" | sed 's/^/  /'; status=1; fi
if [ -n "$only_cat" ]; then echo "in CLI catalog but not implemented:"; echo "$only_cat" | sed 's/^/  /'; status=1; fi

[ "$status" -eq 0 ] && echo "ok: $(wc -l < "$DEF") decorators, package and CLI catalog in sync"
exit $status
