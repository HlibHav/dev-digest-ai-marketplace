# architecture-review

Independent read-only architecture reviewer that checks a diff against layer boundaries.

The reviewer works from the rules your project declares (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/`, an architecture skill, ADRs) and runs only the boundary checks you list. Every finding carries a severity, the quoted rule with its source file, a `path:line` and a quoted line or command output. With no declared rules it says so and falls back to labelled default heuristics, graded no higher than minor.

## What it provides

| Name | Kind | What it does |
|---|---|---|
| `architecture-review:architecture-reviewer` | agent | Reviews a `<base>...<head>` range, a branch, the uncommitted tree, a pasted diff or a review bundle for layering, import direction, edge I/O, wiring and placement. In re-review mode it closes earlier finding ids and looks only for regressions. |
| `hooks/hooks.json` | hook | PreToolUse guard that keeps the reviewer read-only. See Hooks. |
| `scripts/agent-guard.py` | script | The guard. A byte-identical copy of the canonical file in `engineering-paved-path`. |

## Quick start

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace
/plugin install architecture-review@dev-digest-ai-marketplace --scope project
```

Or from a shell:

```
claude plugin marketplace add HlibHav/dev-digest-ai-marketplace
claude plugin install architecture-review@dev-digest-ai-marketplace --scope project
```

The install pulls `engineering-paved-path` too. Then try: `Use architecture-review:architecture-reviewer to review the current branch against main.`

## Usage

**Review a branch.**

```
Use architecture-review:architecture-reviewer on origin/main...HEAD.
```

The reviewer reads your rules first, notes the file of each rule it will quote, runs the boundary checks you listed in `.claude/agent-guard.json` (one command per call) and then reads each hunk. It returns a report with `Verdict: pass` or `Verdict: fail` (fail means at least one verified critical or major finding), the rules applied, the surfaces touched, the checks it ran, and a findings table:

| # | severity | verified / plausible | rule (quoted, with source) | `path:line` | evidence |
|---|---|---|---|---|---|

Zero findings is a valid result and is reported as such. There is no recommendations section: a finding says which rule the line breaks, and the fix belongs to whoever implements it.

**Review through a bundle.** On a large diff, build a bundle once and pass the directory:

```
/engineering-paved-path:review-bundle
Use architecture-review:architecture-reviewer with the bundle in <out-dir>.
```

The reviewer reads `stat.txt`, `index.txt` and only the hunks it needs.

**Re-review after fixes.** Give the reviewer its previous finding ids (`AR-1`, `AR-2`) and the delta range `<previous-head>...<new-head>`. It reports each id `closed` with the proving line, or `open`, and adds findings only for regressions the delta introduced.

**No target.** With no range, branch, uncommitted-tree request or pasted diff, it returns a `needs-answers` block with questions. A pasted diff is itself a target: it is reviewed as given, and checks are marked "not run: diff not applied".

What it does not do: correctness bugs, security, naming and style are out of scope. At most it lists one line each under "Out of scope, noticed". Violations your project has recorded as grandfathered are not findings, and code outside the diff's hunks is not reviewed. Budget: 80 tool calls; the rest goes under "Not checked".

## Dependencies

| Plugin | Range | Used for | Without it |
|---|---|---|---|
| `engineering-paved-path` | `^1.0.0` | The agent preloads `engineering-paved-path:architecture-boundaries` (the default heuristics) through its `skills:` frontmatter. `review-bundle` builds the bundle it can read. | The plugin does not load; `claude plugin list` reports the unmet dependency. |

`sdd-engineering` depends on this plugin (`^1.0.0`) and uses the reviewer in step 2 of `run-plan`.

## What your project should declare

- Architecture rules the reviewer can quote: in `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md`, a skill under `.claude/skills/`, or ADRs in `docs/architecture-decisions/` or `decisions/`. Missing: it reviews only against default heuristics, labels each finding `default heuristic, not a project rule`, and grades it no higher than `minor`.
- Optionally `.claude/agent-guard.json` listing the boundary checks the reviewer may run, as exact command prefixes:

  ```json
  { "checkCommands": ["npm run lint:arch", "pnpm test:boundaries"] }
  ```

  Missing: Bash is limited to read-only git and the report says "not run: no check commands declared". These commands execute project code, so list only commands you trust on the branch under review. A check runs only on a checkout of the target; if the target ref is not checked out it is marked "not run: target not checked out".
- Optionally recorded violations (a baseline or a "grandfathered" list) so existing debt is not reported as new.

## Hooks

One `PreToolUse` hook, matcher `Write|Edit|MultiEdit|NotebookEdit|Bash`, running `agent-guard.py --agent architecture-reviewer=readonly`. It fires on every such tool call in a session and acts only when the calling agent is `architecture-reviewer`.

- Writes are denied.
- Bash is allowed only for read-only git (`diff`, `log`, `show`, `status`, `blame`, `merge-base`, `rev-parse`, `ls-files`, `grep`, `cat-file`, `branch` listing, `describe`, `shortlog`) and for the exact command prefixes in `checkCommands`.
- `;`, `&`, `|`, `<`, `>` outside quotes, and backticks, `$(`, `${` and newlines anywhere, are denied. Options before the git subcommand (`-C`, `-c`) and `--output`, `-O`, `--no-index`, `--ext-diff`, `--textconv` are denied.
- Where the guard cannot tell who is calling, it fails open: when stdin is not a JSON object, or the input has no string `agent_type` (the main session, and any agent not named on the command line), it exits 0 silently and the tool call goes ahead. It denies malformed input only once it knows the caller is guarded: a guarded agent whose input has no string `tool_name` or no object `tool_input`, or a Bash call with no string `command`.

The hook reads the tool input and one local config file, writes nothing and makes no network calls.

## External tools

`git` and `python3` 3.9 or newer. Whatever commands you list in `checkCommands`.

## Compatibility

Claude Code `>=2.1.110`. Details in [COMPATIBILITY.md](COMPATIBILITY.md).

## Troubleshooting

- `claude plugin list --json` shows `dependency-unsatisfied`, `range-conflict` or `no-matching-tag`: `engineering-paved-path` is missing or outside `^1.0.0`, or its release tag does not exist. Install or update it, then run `/reload-plugins`.
- The plugin shows as failed to load with `Requires "engineering-paved-path@..." ^1.0.0, installed ...`: same cause.
- The reviewer reports "not run: no check commands declared": add your boundary check to `checkCommands` in `.claude/agent-guard.json`.
- A command is denied by `agent-guard`: it is not read-only git and not in `checkCommands`, or it is chained or piped. Add it to `checkCommands` and run one plain command. A denial is final; the reviewer does not rephrase around it.
- The reviewer returns questions instead of a review: pass a range, a branch or a diff.

## Local development

Load this plugin with its dependency:

```
claude --plugin-dir ./plugins/engineering-paved-path \
       --plugin-dir ./plugins/architecture-review
```

Run `/reload-plugins` after each edit. If you edit `scripts/agent-guard.py`, change the canonical copy in `engineering-paved-path` and copy it byte for byte; `node scripts/check-repo.mjs` fails on drift.

## Versioning

SemVer. See [CHANGELOG.md](CHANGELOG.md).

## Provenance

Derived from an internal spec-driven development harness and generalized for any repository.
