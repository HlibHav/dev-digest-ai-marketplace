# Changelog

All notable changes to this plugin are listed here. Versions follow [SemVer](https://semver.org/); the format is close to [Keep a Changelog](https://keepachangelog.com/).

## 1.0.2 — 2026-10-14

### Changed
- `spec-creator`: removed instructions that repeated its preloaded skills (the tier rules, the spec file naming and versioning, the spec-versus-code table, the diagram and untrusted-input lists). The agent now points at `engineering-paved-path:sdd-cascade`, `mermaid-diagram` and `security` for them. The prompt is 177 words shorter (3533 → 3356). Behaviour is unchanged: the spec-creator and planner evals pass 5/5 on Sonnet before and after, and the cost difference is within run-to-run noise (see `docs/COST-BASELINE.md`).

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
