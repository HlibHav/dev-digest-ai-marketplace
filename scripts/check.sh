#!/usr/bin/env bash
# The one command authors run before opening a PR. CI runs the same script.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -d node_modules ] || { echo "node_modules missing: run npm ci --ignore-scripts first"; exit 1; }

node scripts/check-repo.mjs
claude plugin validate . --strict
for d in plugins/*/; do
  claude plugin validate "$d" --strict
done
npm test
node scripts/build-index.mjs

echo "ALL CHECKS PASSED"
