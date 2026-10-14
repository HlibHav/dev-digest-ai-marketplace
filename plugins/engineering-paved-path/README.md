# engineering-paved-path

Shared engineering practices: verification gate, test-first done, scope discipline. It also carries the spec-tier scorecard, module-local insights, the numbered-hunk review bundle and the guard script that the other plugins' agent hooks call.

## Components

| Name | Kind | What it does |
|---|---|---|
| `/engineering-paved-path:sdd-cascade` | skill | Picks the spec tier (Direct, Lightweight, Full, Discovery-First) by scorecard, says where specs live, and when to change the spec versus the code. |
| `/engineering-paved-path:engineering-insights` | skill | Reads the `INSIGHTS.md` nearest the code before work, records confirmed lessons after, insert-only. |
| `/engineering-paved-path:review-bundle` | skill | Builds a review bundle for a diff range: stat, filtered patch, numbered hunks per file, index. Ships `skills/review-bundle/scripts/review-bundle.sh`. |
| `/engineering-paved-path:verify-done` | skill | The done gate: run the project's own checks, quote command and result line, never claim done from a diff. |
| `scripts/agent-guard.py` | script | PreToolUse guard used by the hooks of other plugins (see below). |

## Dependencies

None.

## What your project should declare

- Check commands in `CLAUDE.md` or `AGENTS.md`, `package.json` scripts or a Makefile. Without them `verify-done` asks instead of guessing.
- Optionally `.claude/agent-guard.json`, so read-only agents can run your checks:

  ```json
  { "checkCommands": ["npm test"] }
  ```

  Commands match as exact prefixes. No file means read-only git only.
- Optionally a spec folder per package (`specs/`) and an `INSIGHTS.md` in each package root. Without an `INSIGHTS.md`, `engineering-insights` reads nothing and offers to create one when it has a lesson.
- A default branch reachable as `origin/HEAD`, `origin/main` or `main` for `review-bundle`.

## Hooks

This plugin registers no hooks. `scripts/agent-guard.py` is the guard that `architecture-review` and `sdd-engineering` call from their own PreToolUse hooks (matcher `Write|Edit|MultiEdit|NotebookEdit|Bash`). It acts only for the agents named in `--agent <name>=<profile>` pairs and exits silently for every other agent and for the main session. Profiles: `readonly` (no writes; Bash only read-only git plus your `checkCommands`; chaining and redirect characters denied), `specs` (writes only to Markdown under `specs/`; no Bash), `planner` (no writes, no Bash). It makes no network calls and writes nothing. Commands you list in `checkCommands` run your own project code.

## External tools

`git` and `bash` (review-bundle), `python3` (agent-guard). No network access, no downloads.

## Install

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace
/plugin install engineering-paved-path@dev-digest-ai-marketplace
```

Local development from a checkout:

```
claude --plugin-dir ./plugins/engineering-paved-path
```

## Provenance

Extracted from the DevDigest harness (`docs/sdd-cascade.md`, the `engineering-insights` skill, `review-bundle.sh`, the agent hook scripts). Package names, fixed module tables and project-specific commands were replaced by discovery from the consuming project. See `docs/plans/2026-10-14-plugin-extraction.md` in this repo.
