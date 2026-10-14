---
name: review-bundle
description: Writes a review bundle for a git diff range once (stat, filtered patch, one numbered-hunk file per changed path, an index) so reviewers read it with Read instead of re-slicing the diff turn after turn. Use before reviewing or verifying a branch, a PR or a commit range, before handing a diff to a reviewer subagent, or when someone says "bundle the diff", "prepare the review", "review this branch". Make sure to use it for any diff of more than a handful of files.
---

# review-bundle

Reviewers that slice a large diff with `git diff -- <subset>` read the same hunks several times and wade through generated files they never needed. The bundle is built once; everyone then reads files from it.

## Run it

Pick the base. Default to the merge base with the remote's default branch:

```sh
base=$(git merge-base HEAD origin/HEAD 2>/dev/null || git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
```

Then build the bundle into a scratch directory outside the repo:

```sh
bash ${CLAUDE_SKILL_DIR}/scripts/review-bundle.sh "$base"...HEAD <out-dir>
```

The range is `<base>...<head>`, with the three dots. Use another head (a branch, a SHA) when reviewing something other than the checked-out state. If every ref fails to resolve, say so and ask for the base; do not guess one. Re-running replaces `<out-dir>`.

## What it writes

| File | Content |
|---|---|
| `stat.txt` | `git diff --stat` of the whole range, generated files included |
| `diff.patch` | the full diff without generated files |
| `hunks/<path>.patch` | one file per changed path, rename detection on; each hunk line starts with its new-side line number (blank for a removed line), so a finding cites `path:line` without counting from the `@@` header. Not `git apply`-able |
| `index.txt` | one line per changed path: added and deleted lines, bytes of the hunk file and its location, or `excluded (generated)` |

Excluded as generated: lock files (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) and `migrations/meta/` snapshots. Their lines still count in `stat.txt`.

## Using it

Read `index.txt` first, then only the `hunks/` files the review needs. Pass `<out-dir>` to each reviewer instead of the diff. Cite lines from the numbered column, not from the `@@` headers. A path marked `excluded` was not reviewed; say so if it matters.
