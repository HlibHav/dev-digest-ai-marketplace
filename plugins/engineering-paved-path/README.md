# engineering-paved-path

Shared engineering practices: done gate, spec-tier guide, module insights, review bundle and the agent guard script.

This is the base layer of the marketplace. It has no agents of its own. It ships seven skills that any session can load, and the canonical `agent-guard.py` that `architecture-review` and `sdd-engineering` call from their hooks. Agents in those plugins also preload some of these skills, so installing either of them installs this plugin too.

## What it provides

| Name | Kind | What it does |
|---|---|---|
| `/engineering-paved-path:sdd-cascade` | skill | Picks the spec tier (Direct, Lightweight SDD, Full SDD, Discovery-First) with a six-question scorecard, says where specs live and when to change the spec versus the code. |
| `/engineering-paved-path:verify-done` | skill | The done gate. Finds the project's own check commands, runs the ones the change touches, quotes each command and its result line. Never claims done from a diff. |
| `/engineering-paved-path:engineering-insights` | skill | Reads the `INSIGHTS.md` nearest the code before work and records confirmed lessons after it, insert-only. |
| `/engineering-paved-path:review-bundle` | skill | Builds a review bundle for a git range: stat, filtered patch, numbered hunks per file, an index. Ships `review-bundle.sh`. |
| `/engineering-paved-path:architecture-boundaries` | skill | Defaults for layering, ports and adapters, inward-only imports and frontend placement. The project's own declared rules win. |
| `/engineering-paved-path:security` | skill | OWASP Top 10:2025 review method: trace the data flow, prove reachability, report with the exploit and the fix. |
| `/engineering-paved-path:mermaid-diagram` | skill | Picks a Mermaid diagram type and gives the syntax that tends to break. |
| `scripts/agent-guard.py` | script | The canonical PreToolUse guard. Not registered here; other plugins call it. |

## Quick start

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace
/plugin install engineering-paved-path@dev-digest-ai-marketplace --scope project
```

Or from a shell:

```
claude plugin marketplace add HlibHav/dev-digest-ai-marketplace
claude plugin install engineering-paved-path@dev-digest-ai-marketplace --scope project
```

Then try: `Do we need a spec for adding rate limiting to the login endpoint? Use the sdd-cascade skill.` You get a yes/no on each scorecard question, the tier they add up to and the folder the spec belongs in.

## Usage

**Pick a spec tier.** Call `/engineering-paved-path:sdd-cascade` or ask "how much process does this change need?". It returns the six answers, the tier and the spec path (`specs/YYYY-MM-DD-<feature>.md` in the package, or at the repo root when two packages are touched). It also says when a bug means the spec was wrong and when only the code was.

**Check that a task is done.** Say "is it done?" or call `/engineering-paved-path:verify-done`. The skill looks for check commands in `CLAUDE.md` / `AGENTS.md`, then `package.json` scripts, a Makefile or CI steps, then `.claude/agent-guard.json`. It runs the ones the change touches and answers with each command and its result line. A red check means not done; it is reported as the blocker or fixed and rerun.

**Read and record insights.** At the start of work in a package the skill reads that package's `INSIGHTS.md` and names up to three relevant entries. At the end it keeps at most three confirmed lessons, each with a date and `Evidence: path:line`, and inserts them without touching existing lines. It offers to create an `INSIGHTS.md` only after a lesson passes its gate, and waits for a yes.

**Build a review bundle.**

```
/engineering-paved-path:review-bundle
```

The skill finds the merge base with the default branch and writes the bundle to a scratch directory outside the repo: `stat.txt`, `diff.patch` (lock files and migration snapshots excluded), `hunks/<path>.patch` with the new-side line number on every line, and `index.txt`. Reviewers read the hunks with `Read` instead of slicing the diff again and again. The range is `<base>...<head>`, with three dots.

**The other three skills** load when a task matches their descriptions: "where does this code go?" (`architecture-boundaries`), "review this endpoint for vulnerabilities" (`security`), "draw the request flow" (`mermaid-diagram`).

## Dependencies

None. Other plugins depend on this one:

| Plugin | Range | Uses |
|---|---|---|
| `architecture-review` | `^1.0.0` | `architecture-boundaries` (preloaded), `review-bundle` |
| `sdd-engineering` | `^1.0.0` | `sdd-cascade`, `security`, `mermaid-diagram`, `architecture-boundaries` (preloaded), `review-bundle`, `engineering-insights`, `agent-guard.py` |

Without this plugin those two fail to load, with an error that names the unmet dependency.

## What your project should declare

- Check commands in `CLAUDE.md` or `AGENTS.md`, `package.json` scripts or a Makefile. Missing: `verify-done` asks which commands to run and does not report done. It never guesses.
- Optionally `.claude/agent-guard.json`, so read-only agents from other plugins can run your checks:

  ```json
  { "checkCommands": ["npm test", "npm run typecheck"] }
  ```

  Commands match as exact token prefixes. No file means read-only git only.
- Optionally a `specs/` folder per package and an `INSIGHTS.md` in each package root. Missing `INSIGHTS.md`: `engineering-insights` reads nothing and offers to create one when it has a lesson.
- A default branch reachable as `origin/HEAD`, `origin/main` or `main` for `review-bundle`. If none resolves, the skill says so and asks for the base.
- Your own architecture rules (`CLAUDE.md`, `.claude/rules/`, ADRs). `architecture-boundaries` follows them first and uses its defaults only where you declare nothing, labelled as defaults.

## Hooks

This plugin registers no hooks. `scripts/agent-guard.py` is the script that `architecture-review` and `sdd-engineering` call from their own PreToolUse hooks (matcher `Write|Edit|MultiEdit|NotebookEdit|Bash`).

The guard acts only for the agents named in `--agent <name>=<profile>` pairs on its command line. It exits silently for every other agent and for the main session. An agent matches when the hook input's `agent_type` equals the name or ends with `:<name>`.

| Profile | Writes | Bash |
|---|---|---|
| `readonly` | denied | read-only git and your `checkCommands` only. `;`, `&`, `\|`, `<` and `>` outside quotes are denied. Backticks, `$(`, `${` and newlines are denied anywhere. |
| `specs` | only Markdown under a `specs/` directory inside the project | denied |
| `planner` | denied | denied |

Allowed git subcommands: `diff`, `log`, `show`, `status`, `blame`, `merge-base`, `rev-parse`, `ls-files`, `grep`, `cat-file`, `branch` (listing only), `describe`, `shortlog`. Denied: options before the subcommand (`git -C`, `git -c`), `--output`, `-O`, `--open-files-in-pager`, `--no-index`, `--ext-diff`, `--textconv`.

For a guarded agent, malformed hook input is denied. The script makes no network calls and writes nothing. Commands you list in `checkCommands` run your own project code, so list only commands you trust on the branch under review.

`architecture-review` and `sdd-engineering` each ship a byte-identical copy of the script, because a plugin is installed by copying its directory. `scripts/check-repo.mjs` in the marketplace repo fails when a copy drifts.

## External tools

`git` and `bash` (review-bundle), `python3` 3.9 or newer (agent-guard, standard library only). No network access, no downloads.

## Compatibility

Claude Code `>=2.1.110`. Details in [COMPATIBILITY.md](COMPATIBILITY.md).

## Troubleshooting

- `claude plugin list --json` shows `dependency-unsatisfied`, `range-conflict` or `no-matching-tag` for a plugin that depends on this one: this plugin is missing, disabled, or at a version outside the dependent's `^1.0.0`, or the release tag does not exist yet. Install or update it, then run `/reload-plugins`.
- A dependent plugin fails to load with `Requires "engineering-paved-path@..." ^1.0.0, installed ...`: same cause. Check the installed version with `claude plugin list`.
- `verify-done` says the checks are unknown: add them to `CLAUDE.md` or `AGENTS.md`, or to `package.json` scripts.
- A read-only agent's command is denied by `agent-guard`: add that command to `checkCommands` in `.claude/agent-guard.json`. Chained or piped commands stay denied; run one plain command.
- `review-bundle` cannot find a base: pass the base ref explicitly.

## Local development

```
claude --plugin-dir ./plugins/engineering-paved-path
```

Run `/reload-plugins` after each edit. To test it together with the plugins that depend on it, pass one `--plugin-dir` per plugin; the full command is in the `sdd-engineering` README.

## Versioning

SemVer. See [CHANGELOG.md](CHANGELOG.md). Dependents use `^1.0.0` ranges, so a breaking change here needs a new major version.

## Provenance

Derived from an internal spec-driven development harness and generalized for any repository.
