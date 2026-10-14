# sdd-engineering evals

Behavior and negative evals for the spec-driven workflow, run through the real `claude` CLI with
this checkout's four plugins loaded. The runner is `scripts/run-evals.mjs` (Node 22+, no
dependencies). It is also the tool that produces the numbers for `docs/COST-BASELINE.md`.

## Run

```
node scripts/run-evals.mjs --cases negative --model haiku
node scripts/run-evals.mjs --cases spec-creator-writes-spec,planner-uses-existing-spec
node scripts/run-evals.mjs --cases all --include-expensive --repeat 3 --out .tmp/evals/baseline.json
node scripts/run-evals.mjs --probe          # isolation check, no case
```

| Flag | Meaning |
|---|---|
| `--cases` | comma list of ids, or `negative`, `behavior`, `all` (default) |
| `--model` | main-session model, default `haiku`. Subagents are forced to the same model, so the frontmatter `model: opus` of the agents does not raise the bill |
| `--repeat N` | run every selected case N times (the agents are not deterministic; use 3 for a baseline) |
| `--include-expensive` | also run cases marked `expensive: true` |
| `--max-total-usd` | stop launching runs once the summed cost reaches this (default 3) |
| `--out` | report path, default `.tmp/evals/<timestamp>.json` |
| `--keep` | keep each temp project and write the raw stream to `.tmp/evals/<id>-<run>.stream.jsonl` |

Exit code: 0 all assertions passed, 1 any failed, 2 usage or setup error. Needs the `claude` CLI
(tested with 2.1.296) logged in, or `ANTHROPIC_API_KEY`, and `git`.

## Output

stdout has one line per run and a table (case, result, cost, latency, turns, subagents, failed
assertions), then pass rate, median cost, median latency and token totals. The JSON report has
`summary` (`passRate`, `medianCostUsd`, `medianLatencyMs`, `tokens` for input, output, cache read
and cache creation, and `byCase`) and one record per run with `metrics` (`costUsd`, tokens,
`turns`, `durationMs`, `modelCostsUsd`), the dispatched agents, the invoked skills and every
assertion with its detail. Cost is the CLI's own `total_cost_usd`.

## What each case proves

| Case | Kind | Proves |
|---|---|---|
| `skills-load-clean` | negative | All four plugins' namespaced skills and agents appear in the init event, there are no plugin errors, and stderr has no warning |
| `irrelevant-question-no-sdd` | negative | "What does double(2) return?" starts no SDD agent or skill and writes nothing |
| `summarize-repo-no-retro` | negative | "Summarize this repo" does not run `workflow-retro` (manual-only) or any SDD agent |
| `spec-creator-asks-clarifications` | behavior | A vague request runs `spec-creator`; the session reports its questions, nothing is approved, no code is written |
| `spec-creator-writes-spec` | behavior | With requirements settled, `spec-creator` writes `specs/*.md` with a spec id, `AC-N` lines in EARS, status `draft`, no code fence in a programming language and no source file path |
| `planner-uses-existing-spec` | behavior | `implementation-planner` reads a seeded approved spec and writes a plan that traces AC-1..AC-3 only (no AC-4 or later), names the check command, and leaves the spec byte-identical |
| `run-plan-chain` (expensive) | behavior | `/sdd-engineering:run-plan` dispatches `implementer`, `plan-verifier` and `architecture-review:architecture-reviewer`, runs no `spec-creator` or planner, and creates `src/clamp.js` |

The assertions are deterministic checks on the stream and the files; no model judges the output.
They are deliberately loose about wording (a question mark, `NEEDS CLARIFICATION`, `shall`) and
strict about structure (who ran, what was written, what must not appear). A pass therefore means
"the workflow behaved", not "the spec is good".

## Isolation

Each run copies `fixtures/tiny-app` to a fresh directory under the OS temp folder (never inside a
`.claude` directory), `git init`s and commits it, applies the case's `setup.files`, and runs
`claude -p` there with `--setting-sources project`, `--strict-mcp-config` with an empty MCP
config, `--permission-mode bypassPermissions` (safe only because the directory is disposable),
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, and `--plugin-dir` for the four plugins resolved from the
repo root. `node scripts/run-evals.mjs --probe` checks the result: no skill, agent or command
from `~/.claude`, only the four plugins (plus the CLI's builtin ones), no MCP servers, no hook
events from outside the plugins, and the model, asked about the global `CLAUDE.md`, answers that
it has none. What stays shared: the login and the CLI's own bundled skills (`verify`, `code-review`
and so on), which are listed by the probe.

## Cost

With `haiku` for the session and every subagent, the seven cases cost about $0.08 for one pass
(median run about $0.01, the longest, `run-plan-chain`, about $0.04). Without the forced subagent
model, `spec-creator` and the planner run on Opus and one pass costs 10 to 20 times more. The
`maxBudgetUsd` of each case is passed to `--max-budget-usd`.

## Add a case

1. Append an object to `cases.json`: `id` (kebab-case, unique), `kind` (`behavior` or
   `negative`), `describes`, `prompt`, `maxTurns`, `maxBudgetUsd`, `assertions`, and optionally
   `setup.files` (`{ "path": "content" }` written into the fixture before the first commit),
   `expensive: true`, `allowIncomplete: true` (do not fail on max turns).
2. Assertions available: `subagentDispatched`, `notDispatched` (`*` and trailing `*` wildcards),
   `skillInvoked`, `skillNotInvoked`, `fileCreatedGlob`, `fileNotCreatedGlob`, `fileUnchanged`,
   `noFilesChanged`, `fileContainsRegex` and `fileNotContainsRegex` (lists of `{ glob, regex }`),
   `finalTextRegex`, `finalTextNotRegex`, `initHasSkills`, `initHasAgents`, `initNoPluginErrors`,
   `stderrNotRegex`. A regex may start with `(?i)`, `(?m)` and so on. `runCompleted` is implicit.
3. Run it with `--cases <id> --keep`, read the stream if it fails, and decide whether the assertion
   or the plugin is wrong. Seed fixtures so they pass the agents' own gates (the planner refuses a
   spec without proof tags; `run-plan` refuses a plan that skips an AC).
4. `npm run test:unit` checks that `cases.json` only uses known assertion keys and valid regexes.

A prompt that starts with `/plugin:skill` is expanded by the CLI, so the stream has no Skill call
for it; the runner counts it as invoked when the init event lists it as a slash command.

## Known limits

- Agents are probabilistic. A single failure is a signal, three failures in `--repeat 3` is a bug.
- Haiku is the cheap default; a case that passes on haiku and fails on `--model sonnet` points at
  a prompt that leans on model strength.
- Headless runs cannot answer questions, so cases tell the session what to do on a question.
- The fixture has no reviewers' project rules, so `run-plan-chain` shows that the chain runs, not
  that the review findings are good.
