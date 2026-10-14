#!/usr/bin/env bash
# The one command authors run before opening a PR. CI runs `--no-build` (harness checks only) in the
# `validate` job and builds the site in its own `build-site` job.
# Usage: bash scripts/check.sh [--no-build]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    *) echo "usage: bash scripts/check.sh [--no-build]"; exit 2 ;;
  esac
done

[ -d node_modules ] || { echo "node_modules missing: run npm ci --ignore-scripts first"; exit 1; }

RAN=()
step() { RAN+=("$1"); }

node scripts/check-repo.mjs
step "repo checks (scripts/check-repo.mjs)"
claude plugin validate . --strict
for d in plugins/*/; do
  claude plugin validate "$d" --strict
done
step "claude plugin validate (marketplace + each plugin)"
npm test
step "unit and integration tests (npm test)"
if [ "$BUILD" -eq 1 ]; then
  node scripts/build-index.mjs
  step "site build (scripts/build-index.mjs)"
else
  echo "site build skipped (--no-build)"
fi

echo "Steps run:"
for s in "${RAN[@]}"; do echo "  - $s"; done
echo "ALL CHECKS PASSED"
