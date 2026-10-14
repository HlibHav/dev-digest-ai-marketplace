---
status: accepted
date: 2026-10-14
decision-makers: [Glib]
scope: harness
---

# Host plugins as relative-path sources and keep `version` only in `plugin.json`

## Context and Problem Statement

All four plugins live in this repo. A catalog entry can point at them by relative path
(`./plugins/<name>`) or by `git-subdir` with a pinned `ref`/`sha`. Claude Code reads the version
from `plugin.json` first, then the catalog entry; when both are set `plugin.json` wins silently.
An update reaches users only when that version string changes.

## Considered Options

1. Relative-path sources; `version` only in `plugin.json`.
2. `git-subdir` sources pinned by `ref`/`sha` per plugin; `version` in `plugin.json`.
3. Relative-path sources with `version` in both files, kept equal by CI.

## Decision Outcome

Chosen option: 1, because a consumer project can enable a relative-path plugin through committed
`enabledPlugins` with no per-teammate install, the release flow stays one commit plus one tag,
and one source of truth removes the silent-precedence trap.

### Consequences

- Good: simplest consumer setup; no SHA bumps; one place to change a version.
- Bad: no per-plugin pin in the catalog. Pinning is catalog-wide (`marketplace add ...#<ref>`),
  and rollback is a new commit that restores old content and sets `version` back.
- Bad: forgetting a version bump means users never receive the change.

### Confirmation

`scripts/check-repo.mjs` in `validate.yml` fails when a catalog entry carries `version` or when a
plugin directory lacks a `version`; release PR review checks the bump.

## More Information

- Research: `docs/research/2026-10-14_marketplace-repo-structure.md` (sections 1, 4, 5)
- https://code.claude.com/docs/en/plugins/loading
