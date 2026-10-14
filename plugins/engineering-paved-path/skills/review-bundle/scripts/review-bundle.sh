#!/bin/bash
# Write a review bundle for a diff range, once, so every reviewer reads it with Read instead of
# slicing it with `git diff` turn after turn.
#
#   review-bundle.sh <base>...<head> <out-dir>
#
# Produces, under <out-dir>:
#   stat.txt      `git diff --stat` of the whole range, generated files included, so a reverse
#                 map still sees them
#   diff.patch    the diff without generated files (migration snapshots, lock files)
#   hunks/<path>.patch   one file per changed path, same exclusions, `-M` rename detection;
#                 every hunk line starts with its new-side line number (blank for a removed
#                 line), so a reviewer cites `path:line` instead of counting from the `@@`
#                 header. Not `git apply`-able.
#   index.txt     one line per changed path: added/deleted lines, bytes of its hunk file, and
#                 the hunk file, or `excluded` for a generated file
set -euo pipefail

usage() { echo "usage: $0 <base>...<head> <out-dir>" >&2; exit 2; }
[ $# -eq 2 ] || usage
RANGE=$1
OUT=$2

case "$RANGE" in *...*) ;; *) echo "range must be <base>...<head>" >&2; exit 2 ;; esac
git rev-parse --verify --quiet "${RANGE%%...*}" >/dev/null || { echo "unknown ref: ${RANGE%%...*}" >&2; exit 2; }
git rev-parse --verify --quiet "${RANGE##*...}" >/dev/null || { echo "unknown ref: ${RANGE##*...}" >&2; exit 2; }

# Generated files: reviewers never read them, and one snapshot can be a third of a schema change.
EXCLUDE=(
  ':(exclude,glob)**/migrations/meta/**'
  ':(exclude,glob)**/pnpm-lock.yaml'
  ':(exclude,glob)**/package-lock.json'
  ':(exclude,glob)**/yarn.lock'
)

# Prefix each hunk line with its new-side line number: context and added lines get the number
# they have in the new file, removed lines a blank column; headers pass through.
number_hunks() {
  awk '
    /^diff --git / { in_hunk = 0; print; next }
    /^@@ / { split($3, side, ","); n = substr(side[1], 2) + 0; in_hunk = 1; print; next }
    in_hunk && /^[+ ]/ { printf "%5d %s\n", n, $0; n++; next }
    in_hunk && /^-/ { printf "%5s %s\n", "", $0; next }
    { print }
  '
}

# The out-dir is removed and rebuilt, so it must sit strictly below the system temp folder or the
# repo's .tmp/. Anything else (empty, /, the repo, $HOME, a `..` path) is refused before `rm -rf`.
canonical() {
  # Physical path of $1, which may not exist yet: resolve the nearest existing ancestor.
  local p=$1 rest=""
  while [ ! -d "$p" ]; do
    rest="/$(basename "$p")$rest"
    p=$(dirname "$p")
  done
  p=$(cd "$p" && pwd -P)
  printf '%s%s\n' "${p%/}" "$rest"
}
refuse() { echo "refusing out-dir '$OUT': $1" >&2; exit 2; }
[ -n "$OUT" ] || refuse "empty"
case "/$OUT/" in */./*|*/../*) refuse "contains . or .. segments" ;; esac
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
OUT_REAL=$(canonical "$OUT")
TOP=$(canonical "$(git rev-parse --show-toplevel)")
for keep in "$TOP" "$(canonical "$HOME")"; do
  case "$keep/" in "$OUT_REAL"/*) refuse "is or contains $keep" ;; esac
done
allowed=0
case "$OUT_REAL" in
  "$TOP"/.tmp/?*) allowed=1 ;;
  "$TOP"/*) ;;
  *)
    for base in "${TMPDIR:-/tmp}" /tmp; do
      case "$OUT_REAL" in "$(canonical "$base")"/?*) allowed=1 ;; esac
    done
    ;;
esac
[ "$allowed" -eq 1 ] || refuse "must be inside the system temp folder or the repo's .tmp/"

rm -rf "$OUT"
mkdir -p "$OUT/hunks"

git diff --stat=200 "$RANGE" > "$OUT/stat.txt"
git diff -M "$RANGE" -- . "${EXCLUDE[@]}" > "$OUT/diff.patch"

{
  echo "# range: $RANGE"
  echo "# head: $(git rev-parse "${RANGE##*...}")"
  echo "# columns: +added -deleted bytes hunk-file | excluded (generated)"
  # Every changed path, then the same list with the exclusions applied; a path in the first
  # list only is a generated file.
  git diff --name-only "$RANGE" | sort > "$OUT/.all"
  git diff --name-only "$RANGE" -- . "${EXCLUDE[@]}" | sort > "$OUT/.kept"
  while IFS= read -r path; do
    if grep -qxF "$path" "$OUT/.kept"; then
      hunk="$OUT/hunks/$path.patch"
      mkdir -p "$(dirname "$hunk")"
      git diff -M "$RANGE" -- "$path" | number_hunks > "$hunk"
      read -r added deleted _ < <(git diff --numstat "$RANGE" -- "$path")
      printf '%s +%s -%s %s hunks/%s.patch\n' "$path" "$added" "$deleted" "$(wc -c < "$hunk" | tr -d ' ')" "$path"
    else
      printf '%s excluded (generated)\n' "$path"
    fi
  done < "$OUT/.all"
  rm -f "$OUT/.all" "$OUT/.kept"
} > "$OUT/index.txt"

echo "bundle: $OUT ($(wc -l < "$OUT/index.txt" | tr -d ' ') entries, diff.patch $(wc -c < "$OUT/diff.patch" | tr -d ' ') bytes)"
