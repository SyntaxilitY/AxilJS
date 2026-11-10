#!/usr/bin/env bash
# Type-check AxilJS packages (no emit, dist/ untouched) and run test suites.
# Usage: bash .claude/skills/axiljs-verify/verify.sh [pkg ...]
#   no args  -> every package under packages/
#   pkg ...  -> only those packages, e.g. `core orm`
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if [ ! -d node_modules ]; then
  echo "node_modules missing - run: npm ci" >&2
  exit 2
fi

if [ "$#" -gt 0 ]; then PKGS="$*"; else PKGS="$(ls packages)"; fi

fail=0
for p in $PKGS; do
  dir="packages/$p"
  [ -f "$dir/tsconfig.json" ] || { echo "?? $p: no tsconfig.json"; fail=1; continue; }
  out="$(cd "$dir" && npx tsc --noEmit -p . 2>&1)"
  n="$(printf '%s\n' "$out" | grep -c 'error TS')"
  if [ "$n" -eq 0 ]; then
    echo "ok  $p: typecheck"
  else
    echo "ERR $p: $n type errors"
    printf '%s\n' "$out" | grep 'error TS' | head -20
    fail=1
  fi
  if grep -q '"test"' "$dir/package.json" && { [ -d "$dir/tests" ] || [ -d "$dir/test" ]; }; then
    if (cd "$dir" && NO_COLOR=1 npx vitest run >/tmp/axil-vitest-$p.log 2>&1); then
      echo "ok  $p: tests ($(grep -oE "Tests +[0-9]+ passed" /tmp/axil-vitest-$p.log | head -1))"
    else
      echo "ERR $p: tests failed"
      tail -30 "/tmp/axil-vitest-$p.log"
      fail=1
    fi
  fi
done

exit $fail
