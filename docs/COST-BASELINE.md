# Cost baseline

What the plugins cost a session, measured on a fixed scenario, so a change that makes a plugin heavier, or a claimed saving, can be checked against numbers instead of a feeling.

## Scenario and method

| | |
|---|---|
| Scenario | "Spec and plan for a small feature": eval cases `spec-creator-writes-spec` and `planner-uses-existing-spec` from `plugins/sdd-engineering/evals/cases.json` |
| Command | `node scripts/run-evals.mjs --cases spec-creator-writes-spec,planner-uses-existing-spec --model sonnet --repeat 5 --max-total-usd 2.5` |
| Model | `sonnet` → `claude-sonnet-5-5`, for the main session and, through `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`, for every subagent |
| CLI | Claude Code 2.1.296 |
| Code | commit `885d6fb` (main after PR #5). Plugin versions: `engineering-paved-path` 1.0.1, `research-tools` 1.0.1, `architecture-review` 1.0.1, `sdd-engineering` 1.0.1 for the baseline, 1.0.2 for the rerun |
| Runs | 5 per case, 10 per pass. Isolation as described in `plugins/sdd-engineering/evals/README.md` (no user settings, no MCP, only the four plugins) |
| Date | 2026-10-14 |

How to read the fields:

- **Cost** is the run's `total_cost_usd`. It includes the subagent: the per-model breakdown shows only `claude-sonnet-5-5`, and the main-thread tokens alone could not reach it.
- **Tokens** in the result event count the **main thread only**. A spec-creator run reports about 500 output tokens even though the subagent wrote a whole spec. Treat them as the orchestration overhead, not the workflow total.
- **Latency** is the runner's `wallMs` (process start to exit). The result event's `duration_ms` is not usable here: when the subagent finishes after the main turn, it reports 3–4 s for a 35 s run.
- **Pass** means every deterministic assertion of the case held (spec path, `SPEC-` id, `AC-1`, an EARS line, `Status: draft`, no code in the spec; plan path, `AC-1..3` verbatim, `npm test`, no invented AC, spec unchanged).
- **Critical error** means a failed assertion, a wrong agent dispatched, or a write outside the case's allowed paths.

## Baseline (sdd-engineering 1.0.1)

| Case | Pass | Median cost | Cost range | Median latency | Turns (main) |
|---|---|---|---|---|---|
| `spec-creator-writes-spec` | 5/5 | $0.132 | $0.120–0.203 | 35.0 s | 1–2 |
| `planner-uses-existing-spec` | 5/5 | $0.183 | $0.173–0.223 | 50.9 s | 3–4 |
| Both | 10/10 | $0.176 | | 42.1 s | |

Total spend for the pass: $1.69. Main-thread tokens across the 10 runs: input 48, output 30,762, cache read 458,578, cache creation 107,973. One subagent per run, always the expected one. Critical errors: none.

The main source of variance is not the plugins. In 2 of 5 planner runs, the main session tried to save the returned plan with a Bash heredoc. The eval allowlist denied it, so the session retried with Write. That extra turn produces the four most expensive planner runs across both passes ($0.203–0.243). It is a denial, not a failure: the plan still lands and the case passes.

## Always-loaded cost per plugin

From the catalog's estimator (`scripts/lib/cost.mjs`: characters / 4, rounded up; excludes hook output and MCP tool descriptions). "Always" is what every session with the plugin enabled pays for names and descriptions. "On invocation" is the full bodies, paid only when a skill or agent is used.

| Plugin | Version | Always loaded | On invocation |
|---|---|---|---|
| `engineering-paved-path` | 1.0.1 | 1,036 | 6,158 |
| `research-tools` | 1.0.1 | 128 | 1,928 |
| `architecture-review` | 1.0.1 | 186 | 2,444 |
| `sdd-engineering` | 1.0.1 → 1.0.2 | 1,114 | 21,687 → 21,440 |

Installing `sdd-engineering` pulls in all four plugins, about 2,460 always-loaded tokens.

## Optimization: drop prompt text the preloaded skills already carry

**Hypothesis.** `spec-creator` preloads `sdd-cascade`, `security` and `mermaid-diagram` through its `skills:` frontmatter, so the skill bodies already sit in its context. Where the agent prompt restates them, the subagent pays for the same rule twice.

**Change** (only this; same model, same routing, same cases). A read-only comparison of each agent against its preloaded skills found:

- **`spec-creator`**: passages that repeat the skills: tier rules, spec file naming and versioning, the spec-versus-code table, and the diagram rule. They became pointers to the skills. Everything that says what to output or where to write stayed, as did every phrase the evals assert. The rerun measured a 3,356-word prompt (177 fewer). Review then restored the untrusted-input example list, because the `security` skill does not name diff or repository content, so the shipped prompt is 3,366 words (167 fewer, about 247 tokens by the estimator).
- **`implementation-planner`**: duplicates almost nothing. Its use of `architecture-boundaries` and `security` is already a one-line pointer, so it was left unchanged.
- **`implementer`**: the plan named it, but the fixed scenario never runs it, so a change there could not be measured. It was left unchanged.

**Rerun (sdd-engineering 1.0.2), same command:**

| Case | Pass | Median cost | Cost range | Median latency |
|---|---|---|---|---|
| `spec-creator-writes-spec` | 5/5 | $0.122 (−7.7%) | $0.111–0.140 | 33.0 s |
| `planner-uses-existing-spec` (prompt not changed) | 5/5 | $0.176 (−4.3%) | $0.163–0.243 | 50.5 s |
| Both | 10/10 | $0.152 | | 42.9 s |

Total spend for the pass: $1.59.

**Verdict: quality gate green, saving within noise.** The planner's prompt did not change and its median still moved 4%, which sets the noise floor for 5 runs. The spec-creator ranges overlap. On top of that, about 250 fewer prompt tokens are worth well under a cent per run on Sonnet, so the $0.010 drop in the median is mostly noise, not the change. Passes stayed 10/10, and no new critical errors appeared. The change stays because it removes duplicated rules that could drift apart, not because of the cost. It is not claimed as a saving.

What would move the number, as a next experiment: the denied Bash-heredoc save (an extra turn in 40% of planner runs) costs more than the whole prompt trim.

## Budget and review threshold

- A pull request that changes an agent prompt or a preloaded skill reruns the scenario command above. Use `sonnet` with `--repeat 5`, about $1.70 a pass.
- Treat a median-cost change under ±10% on 5 runs as noise. Above that, or when the change targets cost, use `--repeat 10`.
- Any failed assertion or new critical error blocks the change, whatever the cost.
- Always-loaded tokens are checked from the catalog build. A description change that adds more than 100 always-loaded tokens to a plugin needs a line in its CHANGELOG saying why.

## History

| Date | Commit | sdd-engineering | Model | Pass | Median cost | Median latency | Note |
|---|---|---|---|---|---|---|---|
| 2026-10-14 | `885d6fb` | 1.0.1 | claude-sonnet-5-5 | 10/10 | $0.176 | 42.1 s | Baseline |
| 2026-10-14 | `885d6fb` + spec-creator trim | 1.0.2 | claude-sonnet-5-5 | 10/10 | $0.152 | 42.9 s | Prompt dedup; within noise |
