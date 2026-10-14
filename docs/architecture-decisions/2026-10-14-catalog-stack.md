---
status: accepted
date: 2026-10-14
decision-makers: [Glib]
scope: harness
---

# Build the catalog site with MiniSearch, vanilla JS and `shaders`, bundled by esbuild

## Context and Problem Statement

[SPEC-2026-10-14-catalog-search](../../specs/SPEC-2026-10-14-catalog-search.md) turns the Pages
catalog into a search app with an install builder, trust profile, context cost and WebGPU effects.
GitHub Pages serves static files only, the site must make no third-party requests, and the repo has
been zero-dependency Node so far. Fuzzy and prefix search with field boosts is needed in the browser.

## Considered Options

1. Zero dependencies: hand-written search and vanilla UI, CSS-only decoration.
2. MiniSearch for search, vanilla JS UI, `shaders` (MIT, `shaders/js`) for effects, bundled by esbuild; one `package.json` with a committed lockfile.
3. A search library plus a UI framework (Preact or React) with a framework build.

## Decision Outcome

Chosen option: 2, because MiniSearch gives fuzzy, prefix and field boosting in a few KB without
hand-rolled ranking, a vanilla UI keeps the core bundle small (AC-55), and the owner wants active
shader effects, which `shaders/js` provides without a framework. esbuild bundles everything so it
is served same-origin (AC-8).

### Consequences

- Good: tested search behaviour off the shelf; small core JS; effects without a framework.
- Good: one bundler covers core and lazy effects bundles.
- Bad: the repo gains `package.json`, a lockfile and an install step in CI; supply-chain surface grows.
- Bad: WebGPU effects need fallbacks, a canvas cap and contrast checks (AC-49 to AC-57).
- Bad: vanilla UI means more hand-written DOM code as later phases (graph, detail pages) arrive; revisit then.

### Confirmation

CI installs with a frozen lockfile; the build checks the core bundle budget (AC-55) and that effect
components come from the MIT package (AC-57); review rejects a framework or a CDN script without a
superseding record.

## More Information

- https://github.com/lucaong/minisearch
- https://github.com/shader-effects-inc/shaders (MIT; "Pro" components excluded)
