---
status: accepted
date: 2026-10-14
decision-makers: [Glib]
scope: harness
---

# Keep the catalog UI in vanilla JS; do not move to React now

## Context and Problem Statement

The catalog site is vanilla JS (about 1,200 lines of UI), MiniSearch and esbuild, built by
`scripts/build-index.mjs` and deployed by `.github/workflows/pages.yml` on every push to `main`
that touches the catalog, plugins or site code. Moving to React with its own build was raised
again: would a framework pay for itself, and does the GitHub Action build need it?

## Considered Options

1. Keep vanilla JS (current stack).
2. React + a framework build (for example Vite) with build-time prerendering.
3. Preact (React-compatible API via `preact/compat`) with build-time prerendering.

## Decision Outcome

Chosen option: 1, because the site works, has four plugins, and the Action-triggered build already
exists. React would add roughly 45–60 KB gzipped (estimate, not measured), on top of a 19.5 KB core
bundle. That breaks the 60 KB limit of AC-55. It would also need prerendering to keep the no-JS list
(AC-25), and it means a full UI rewrite with no user-visible gain today.

### Consequences

- Good: no rewrite, the bundle stays far under budget, no new runtime dependencies.
- Bad: detail pages, a dependency graph or richer filters mean more hand-written DOM code.
- Revisit when that work starts. Option 3 is the first candidate then, because it keeps AC-25 and
  AC-55.

### Confirmation

The core JS budget check in the build (AC-55). Review rejects a UI framework without a record that
supersedes this one.

## More Information

- [Catalog site stack](2026-10-14-catalog-stack.md), option 3 rejected there for the same reasons.
- Local development: `npm run dev` (`scripts/dev-server.mjs`).
