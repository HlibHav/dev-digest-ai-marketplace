# Changelog

All notable changes to this plugin are listed here. Versions follow [SemVer](https://semver.org/); the format is close to [Keep a Changelog](https://keepachangelog.com/).

## 1.1.1 — 2026-10-15

### Fixed
- `workflow-retro deep --since <run start>` reported no multi-agent run when the run happened in another session. Without `--session`, `scripts/collect.py` read only the newest transcript in the project, which is the retro's own session. With `--since` and no `--session` it now scans every transcript in the project with lines at or after `--since` and reports each session that launched agents, skipping the ones that didn't. If none is found it exits with "no multi-agent run found". `--session`, and a run with neither flag, behave as before. A `--since` without a timezone is now read as UTC; before, it crashed on comparison with the transcripts' UTC timestamps.
- In this mode `--json` prints `{"runs": [...]}`, one object per run in the existing per-session shape.

## 1.1.0 — 2026-10-14

### Added
- `spec-creator`: a spec is not finished until every mandatory requirement has an acceptance criterion. The agent numbers the mandatory requirements from the brief and the design sources (`R-1`, `R-2`, …), including ones that read like a contract or a non-functional note, and the spec gets a `## Requirements coverage` section that maps each one to its `AC-N` ids. A requirement whose behaviour the sources don't state is a blocking question; a row left with only `[NEEDS CLARIFICATION]` keeps the spec `draft`, makes the report `Status: needs-answers` and marks the planner handoff `not yet`. The self-check and the Spec Report show the coverage count.
- Evals `spec-creator-requirement-without-ac` (an undecided mandatory requirement gets no guessed AC and is not dropped) and `spec-creator-every-requirement-has-ac` (the coverage section exists and maps the export and no-console requirements to ACs).

### Evidence
On `claude-sonnet-5-5`, three runs per case. 1.0.2 already turned an undecided requirement into a blocking question (3/3, and 3/3 on Haiku) and already wrote an AC for each settled one, so the gain is that coverage is now explicit and checkable, not a fixed miss. With the coverage assertions, 1.0.2's specs fail 3/3 (no coverage section) and 1.1.0's pass 3/3. The regression cases stay green on 1.1.0: `spec-creator-writes-spec` 3/3, `spec-creator-asks-clarifications` 3/3, `planner-uses-existing-spec` 3/3. Median cost per run $0.126.

## 1.0.2 — 2026-10-14

### Changed
- `spec-creator`: removed instructions that repeated its preloaded skills (the tier rules, the spec file naming and versioning, the spec-versus-code table, the diagram rule). The agent now points at `engineering-paved-path:sdd-cascade`, `mermaid-diagram` and `security` for them. The prompt is 167 words shorter (3533 → 3366). The removed rules are all in those preloaded skills, which is the evidence that behaviour is unchanged. The spec-creator and planner evals pass 5/5 on Sonnet before and after, but they use a Lightweight, single-module feature and do not exercise the tier, versioning or update rules. The cost difference is within run-to-run noise (see `docs/COST-BASELINE.md`).

## 1.0.1 — 2026-10-14

### Security
- `scripts/agent-guard.py`: read-only agents could run an arbitrary program through `git grep -O`, either with the flag clustered into other short options (`-nOsh`) or with an abbreviated long option (`--open-files-in-p`). Abbreviated forms of `--no-index`, `--ext-diff`, `--textconv` and `--output` also slipped past. The guard now denies every short cluster containing `O` and every long option that abbreviates a denied flag.

## 1.0.0 — 2026-10-14

### Added
- Agent `spec-creator`: picks the spec tier, asks blocking questions and research requests, writes the spec. Preloads `sdd-cascade`, `security` and `mermaid-diagram`.
- Agent `implementation-planner`: turns an approved spec into an ordered, test-first plan with lanes and check commands. Read-only.
- Agent `implementer`: executes one lane or a whole plan, writes red-first tests, returns an Implementation Report. Also runs in fix mode.
- Agent `plan-verifier`: read-only. Gives every plan item a verdict with evidence and maps every changed hunk to a plan item.
- Skill `run-plan` (manual): runs implementer lanes, the package gate, reviews and a fix loop of up to three rounds from a saved plan.
- Skill `workflow-retro` (manual): retrospective of a multi-agent run with a lesson ledger in `docs/retros/ledger.md` and an optional transcript parser.
- PreToolUse hook that restricts `spec-creator`, `implementation-planner` and `plan-verifier`.
- Offline eval suite in `evals/`, run with `node scripts/run-evals.mjs` from the marketplace repo.

### Changed
- Depends on `engineering-paved-path`, `research-tools` and `architecture-review`, each `^1.0.0`, declared in the object form. The three agents that need shared skills preload them as `engineering-paved-path:<skill>`.
- `scripts/agent-guard.py` is a real, byte-identical copy of the canonical file in `engineering-paved-path`, not a symlink. `scripts/check-repo.mjs` fails when the copies differ.
