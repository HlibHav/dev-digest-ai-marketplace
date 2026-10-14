# Changelog

All notable changes to this plugin are listed here. Versions follow [SemVer](https://semver.org/); the format is close to [Keep a Changelog](https://keepachangelog.com/).

## 1.0.1 — 2026-10-14

### Security
- `scripts/agent-guard.py`: read-only agents could run an arbitrary program through `git grep -O`, either with the flag clustered into other short options (`-nOsh`) or with an abbreviated long option (`--open-files-in-p`). Abbreviated forms of `--no-index`, `--ext-diff`, `--textconv` and `--output` also slipped past. The guard now denies every short cluster containing `O` and every long option that abbreviates a denied flag.

## 1.0.0 — 2026-10-14

### Added
- Skill `sdd-cascade`: picks the spec tier (Direct, Lightweight SDD, Full SDD, Discovery-First) with a six-question scorecard, says where specs live and when a spec changes versus the code.
- Skill `engineering-insights`: reads the nearest `INSIGHTS.md` before work and records confirmed lessons after it, insert-only.
- Skill `review-bundle`: builds a review bundle for a git range (stat, filtered patch, numbered hunks per file, index) with `review-bundle.sh`.
- Skill `verify-done`: the done gate. Finds the project's own check commands, runs the ones a change touches and quotes each result.
- Skill `architecture-boundaries`: defaults for layering, ports and adapters, inward-only imports and frontend placement. The project's own declared rules win.
- Skill `security`: OWASP Top 10:2025 review method with reachability checks and reference tables.
- Skill `mermaid-diagram`: picks the diagram type and gives syntax that tends to break.
- Script `scripts/agent-guard.py`: the canonical PreToolUse guard that other plugins call from their hooks. Profiles `readonly`, `specs` and `planner`.
