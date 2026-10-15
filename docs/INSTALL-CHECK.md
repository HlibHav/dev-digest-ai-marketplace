# Install check in another project

Whether the 1.0.x release works in a real repository that was not built with these plugins. The project was [HlibHav/BigBerlinHack](https://github.com/HlibHav/BigBerlinHack) (BBH), a Next.js + vitest app with its own `CLAUDE.md`, no `.claude/agents/` and no `.claude/skills/`. The check ran on 2026-10-15.

## Setup

| | |
|---|---|
| Project | Fresh clone of BBH at `c30879b`. BBH's `CLAUDE.md` and `.claude/contexts/` are git-ignored, so the author's local copies were added to the clone. The clone was never pushed. |
| Channel | Stable: `claude plugin marketplace add 'HlibHav/dev-digest-ai-marketplace#sdd-engineering--v1.0.2' --scope project`, then `claude plugin install sdd-engineering@dev-digest-ai-marketplace --scope project` |
| Versions | `sdd-engineering` 1.0.2; `engineering-paved-path`, `research-tools` and `architecture-review` at `1.0.1-885d6fb5a22c` |
| Project config | `.claude/agent-guard.json`: `{ "checkCommands": ["pnpm test", "pnpm typecheck", "pnpm exec vitest run"] }` |
| Baseline | `pnpm typecheck` clean. `pnpm test`: 121 passed and 4 failed, all 4 in `tests/services/peec-snapshot.test.ts`, which needs a git-ignored data file. |
| Sessions | Headless `claude -p`, `--model sonnet --setting-sources project`, with `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` and `_FORCE=1`. Project settings only, so the author's user-level `CLAUDE.md`, hooks and plugins stayed out. Claude Code 2.1.296. |
| Feature | `forbiddenHitDensity(body)` in `lib/brand/forbidden-phrases.ts`: forbidden-vocabulary hits per 100 words, with unit tests. |
| Spend | $2.35 in total: spec and plan $0.86, `run-plan` $1.04, retro and probes $0.45. |

## The checks

The brief has 11 points, but its full text was not available during the check. Points 1–6 are the ones the [finish-lab plan](plans/2026-10-15-finish-lab.md) quotes from the brief, and points 7–8 come from the brief's end-of-lab checklist. Points 9–11 were derived from the plugin READMEs.

| # | Check | Source | Result | Evidence |
|---|---|---|---|---|
| 1 | The spec lands in the documented path | brief | pass | `specs/2026-10-15-forbidden-hit-density.md`, `Spec ID: SPEC-2026-10-15-forbidden-hit-density`. The plan was saved to `docs/plans/2026-10-15-forbidden-hit-density.md`, and run state to `….state.md` next to it. |
| 2 | `run-plan` dispatches `implementer` | brief | pass | `/sdd-engineering:run-plan docs/plans/…` dispatched `sdd-engineering:implementer`, then `/engineering-paved-path:review-bundle`, `sdd-engineering:plan-verifier`, `architecture-review:architecture-reviewer` and `/code-review`, all in the foreground. It was red first (`forbiddenHitDensity is not a function`), and the file ended at 13/13 green. Typecheck was clean, and the full suite had only the 4 baseline failures. It skipped security review with a reason: no I/O sink. It did not commit. |
| 3 | `researcher` and `architecture-reviewer` are available | brief | pass | The session's init lists `research-tools:researcher` and `architecture-review:architecture-reviewer`. The reviewer ran in item 2 and passed with no findings. It said BBH declares no boundary checks, so its review was a read of the imports. The planner did not dispatch the researcher and gave a reason ("no external facts are needed"). |
| 4 | `workflow-retro` runs only by hand, with `${CLAUDE_SKILL_DIR}` | brief | pass, with a defect | The skill sets `disable-model-invocation: true`. Asked "run a retrospective … use whatever skill fits", the model picked `engineering-paved-path:engineering-insights` and never called `workflow-retro`. `/sdd-engineering:workflow-retro deep` ran `python3 ~/.claude/plugins/cache/dev-digest-ai-marketplace/sdd-engineering/1.0.2/skills/workflow-retro/scripts/collect.py`, so the variable resolved into the cache. Defect: see Findings, item A. |
| 5 | The project's own instructions are not overridden | brief | pass | With the plugins loaded, a probe answered from BBH's `CLAUDE.md`: the commit format `[BBH] short imperative — <72 chars`, Ukrainian commit bodies, and a `code-reviewer` run for CRITICAL zones. The planner quoted `CLAUDE.md:30-36` (no new dependencies) and the CRITICAL-zone list, and noted that commits follow `[BBH] …`. `package.json` and `pnpm-lock.yaml` are unchanged. |
| 6 | The project lists its check commands in `.claude/agent-guard.json` | brief | pass | The planner cited the file and confirmed both reviewer commands are prefix matches. `plan-verifier` ran `pnpm exec vitest run tests/brand/forbidden-phrases.test.ts`, and both reviewers ran `git diff`. None of them was denied. |
| 7 | Supporting files survive the plugin cache | brief (checklist) | pass | Present and executable in the cache: `scripts/agent-guard.py` (three copies, one sha), `review-bundle.sh` and `collect.py`. `review-bundle` and `collect.py` both ran from the cache. |
| 8 | Namespaced names, no clash with the project | brief (checklist) | pass | Every agent and skill shows up as `<plugin>:<name>`. BBH has no `.claude/agents/` or `.claude/skills/`. |
| 9 | 1.0.x installs and resolves dependencies | README | pass | `claude plugin list --json`: four entries, `errors: null`. There was no `dependency-unsatisfied`, `range-conflict` or `no-matching-tag`. |
| 10 | `agent-guard` allows listed commands and denies the rest | README | pass | The hook script was fed `PreToolUse` input as `sdd-engineering:plan-verifier`. Allowed: `pnpm test`, `pnpm exec vitest run tests/brand`, `git diff HEAD~1`. Denied: `pnpm install left-pad`, `rm -rf lib`, `pnpm test && rm -rf lib`, and a `Write` to `lib/x.ts` by `spec-creator`. With `agent-guard.json` removed, `pnpm test` was denied too. In the live run, the guarded agents used only plain, listed commands. |
| 11 | Agents take check commands from the project, never guess | README | pass | BBH keeps its commands in `.claude/contexts/verification.md`, which the `CLAUDE.md` loads lazily through a hook. That hook was absent in the clone. The planner found the commands there and in the `package.json` scripts, and cited both. It also routed `pnpm lint` to the main session because `lint` is not in `checkCommands`. |

## Findings

A. **The retro collector misses the run it is asked about.** Run as `workflow-retro deep --since <run start>`, `collect.py` reads only the newest transcript in the project. That transcript is the retro's own session, so it reported "no multi-agent run found". Run by hand with `--session <run-plan session id>`, the same script found all 3 agents with tokens, timing and tool mix. A fix belongs in a sdd-engineering patch release: the skill should pass the run's session, or the collector should scan every transcript newer than `--since`.

B. **The review bundle is written outside the project.** `review-bundle` wrote to the system temp directory. The main session's `cat` of its `index.txt` was refused as outside the allowed working directories. The reviewers still read the bundle and passed, so nothing failed. A headless consumer with a strict allowlist could hit this, though.

C. **Small inaccuracies in the `run-plan` close report.** It said `specs/` was untracked, but it was committed. It also left the spec at `Status: approved` without offering `implemented`, which is what its README promises.

D. **Prose language.** The spec and plan were written in English, while BBH's `CLAUDE.md` asks for Ukrainian prose in commits, ADRs and `knowledge/`. Specs are not on that list, so this is not counted as an override. A project that wants specs in its own language has to say so.

## Reproduce

1. Clone the project and add its check commands to `.claude/agent-guard.json`.
2. Add the catalog and install, using the commands in Setup.
3. From the project, run the following prompts. Use the same flags as above, `--permission-mode acceptEdits`, and an allowlist that covers `pnpm`, `git` and `python3`:
   - "Use `sdd-engineering:spec-creator`, then `sdd-engineering:implementation-planner` (single-agent), for: <feature>". Approve the spec.
   - `/sdd-engineering:run-plan docs/plans/<plan>.md`
   - `/sdd-engineering:workflow-retro deep --since <run start>`

Remove the plugins afterwards with `claude plugin uninstall … --scope project` and `claude plugin marketplace remove dev-digest-ai-marketplace`.
