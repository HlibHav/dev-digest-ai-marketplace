---
status: accepted
date: 2026-10-14
decision-makers: [Glib]
scope: harness
---

# Tag releases as `<plugin>--v<semver>`, title GitHub Releases `<plugin>@<semver>`

## Context and Problem Statement

The lab asks for a release `sdd-engineering@1.0.0`. Claude Code resolves plugin dependency
version ranges only against git tags named `<plugin>--v<version>` and ships `claude plugin tag`
to create them. A tag in another format is invisible to the resolver.

## Considered Options

1. Native git tag `<plugin>--v<semver>` created by `claude plugin tag --push`; the GitHub Release is titled `<plugin>@<semver>`.
2. Git tag `<plugin>@<semver>` as written in the lab.
3. release-please with `include-component-in-tag` (emits `<component>-v<semver>`, single dash).

## Decision Outcome

Chosen option: 1, because dependency ranges in `sdd-engineering` (`~1.0.0`) only work against
native tags, and `claude plugin tag` also checks that the version in `plugin.json` matches the
catalog, that the tree is clean and that the tag is new. The Release title keeps the lab's name.

### Consequences

- Good: ranges resolve; one command validates and tags; the lab deliverable name is still visible.
- Bad: two spellings of one release (tag vs Release title); authors must learn which is which.
- Bad: no release automation yet; tagging is a manual step listed in `docs/RELEASES.md`.

### Confirmation

`docs/RELEASES.md` prescribes `claude plugin tag --push`; review of every release PR checks the
tag name; `claude plugin list` in a consumer shows no `Requires ...` error.

## More Information

- Research: `docs/temp/2026-10-14_marketplace-repo-structure.md` (sections 3, 4)
- https://code.claude.com/docs/en/plugins/dependencies
