# Changelog

All notable changes to this plugin are listed here. Versions follow [SemVer](https://semver.org/); the format is close to [Keep a Changelog](https://keepachangelog.com/).

## 1.0.1 — 2026-10-14

### Security
- `scripts/agent-guard.py`: read-only agents could run an arbitrary program through `git grep -O`, either with the flag clustered into other short options (`-nOsh`) or with an abbreviated long option (`--open-files-in-p`). Abbreviated forms of `--no-index`, `--ext-diff`, `--textconv` and `--output` also slipped past. The guard now denies every short cluster containing `O` and every long option that abbreviates a denied flag.

## 1.0.0 — 2026-10-14

### Added
- Agent `architecture-reviewer`: read-only review of a diff range or a review bundle against the architecture rules the project declares. Re-review mode closes earlier finding ids.
- PreToolUse hook that restricts the reviewer to read-only git plus the commands listed in `.claude/agent-guard.json`.
- Script `scripts/agent-guard.py`.

### Changed
- Depends on `engineering-paved-path` `^1.0.0`, declared in the object form. The reviewer preloads `engineering-paved-path:architecture-boundaries` through its `skills:` frontmatter.
- `scripts/agent-guard.py` is a real, byte-identical copy of the canonical file in `engineering-paved-path`, not a symlink. `scripts/check-repo.mjs` fails when the copies differ.
