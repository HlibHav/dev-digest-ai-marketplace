# architecture-review

Independent read-only architecture reviewer that checks a diff against layer boundaries.

It reviews against the rules your project declares (CLAUDE.md, AGENTS.md, `.claude/rules/`, an architecture skill, ADRs) and runs only the boundary checks you list. Every finding carries a severity, the quoted rule, a `path:line` and a quoted line or command output. With no declared rules it says so and falls back to labelled default heuristics, graded no higher than minor.

## Components

| Name | Kind | What it does |
|---|---|---|
| `architecture-review:architecture-reviewer` | agent | Reviews a `<base>...<head>` range (or a review bundle) for layering, import direction, edge I/O, wiring and placement. Re-review mode closes previous finding ids. |
| PreToolUse guard (`hooks/hooks.json`) | hook | Restricts the reviewer's writes and Bash. See Hooks. |
| `scripts/agent-guard.py` | script | The guard, a symlink to the copy shipped in `engineering-paved-path`. |

## Dependencies

None. When a caller passes a review bundle directory (made by `/engineering-paved-path:review-bundle`) the reviewer reads it; otherwise it uses `git diff`.

## Requirements on your project

- Architecture rules the reviewer can quote: in `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md`, a skill under `.claude/skills/`, or ADRs in `docs/architecture-decisions/` or `decisions/`. Without them it reviews only against default heuristics and says so.
- Optional `.claude/agent-guard.json` listing the boundary checks the reviewer may run, as exact command prefixes:

  ```json
  { "checkCommands": ["npm run lint:arch", "pnpm test:boundaries"] }
  ```

  Without the file, Bash is limited to read-only git and no checks run. These commands execute project code, so list only commands you trust on the branch under review.
- Optional recorded violations (a baseline or a "grandfathered" list) so existing debt is not reported as new.

## Hooks

- Event and matcher: `PreToolUse`, matcher `Write|Edit|MultiEdit|NotebookEdit|Bash`. It fires for every tool call of those types in any session where the plugin is enabled, including the main session and other agents.
- It guards `architecture-reviewer` (or `<plugin>:architecture-reviewer`).
- The guard acts only when the hook input's `agent_type` matches a guarded agent. For those agents, malformed tool input is denied. Input with no `agent_type` (the main session, other agents) passes silently.
- Denied shell characters for read-only agents: `;`, `&`, `|`, `<` and `>` outside quotes, and backticks, `$(`, `${` and newlines anywhere.
- Allowed git: read-only subcommands (`diff`, `log`, `show`, `status`, `blame`, `merge-base`, `rev-parse`, `ls-files`, `grep`, `cat-file`, branch listing, `describe`, `shortlog`). Denied: `git -C`, `git -c` (options before the subcommand), `--output`, `-O`, `--no-index`, `--ext-diff`, `--textconv`.
- For the reviewer it denies all Write, Edit, MultiEdit and NotebookEdit calls. Bash is allowed only as one plain read-only git command or a command that starts with an entry of `checkCommands`.
- It never approves anything on its own: it only denies. It makes no network calls and writes nothing. It needs `python3` on PATH.

## External tools

`git` and `python3`. Whatever your own check commands need.

## Install

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace
/plugin install architecture-review@dev-digest-ai-marketplace
```

Local development:

```
claude --plugin-dir plugins/architecture-review
```

## Provenance

Extracted from the DevDigest `architecture-reviewer` agent; its project-specific layer rules, checks and skills were replaced by discovery of the consuming project's own declarations.
