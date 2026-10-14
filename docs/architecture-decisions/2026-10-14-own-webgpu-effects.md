---
status: accepted
date: 2026-10-14
decision-makers: [Glib]
scope: harness
supersedes: docs/architecture-decisions/2026-10-14-catalog-stack.md
---

# Write the catalog's WebGPU effects in-house; keep MiniSearch, vanilla JS and esbuild

## Context and Problem Statement

[2026-10-14-catalog-stack](2026-10-14-catalog-stack.md) chose the `shaders` package for the
catalog's active effects. The spike (`docs/temp/2026-10-14_shaders-spike.md`) found, in `shaders`
4.0.4: telemetry to `https://shaders.com/api/telemetry` started by default on any host except
shaders.com and localhost; a `new Function` probe at module load that violates the same-origin CSP;
two `fetch` call sites left in the bundle after every exclusion; and about 295 KB gzipped for one
patched component. The spec forbids third-party requests (AC-8) and the plan's stop rule fired.

## Considered Options

1. Own small WebGPU shader for the header background and the card glow.
2. Keep `shaders`, neutralised by three esbuild plugins (stub telemetry and the registry, rewrite the probe) with fail-closed assertions.
3. No WebGPU; static gradient and CSS animation only.

## Decision Outcome

Chosen option: 1, because it keeps the owner's "active effects" with a few KB of code we control,
no telemetry or network code, and a clean `'self'` CSP. Option 2 ships unreachable network code and
breaks on every package update; option 3 drops the requested effects. MiniSearch, the vanilla UI and
esbuild from the superseded record stay unchanged.

### Consequences

- Good: no vendor telemetry, no dynamic code, tiny effects bundle; AC-57 becomes a hard build check.
- Bad: a handful of effects instead of 200; shader code (WGSL) is ours to maintain and test.
- Bad: real rendering is still only checkable in a GPU browser, not in headless CI.

### Confirmation

The build scans the effects bundle for network calls, `eval`, `new Function` and `http(s)` URLs
and fails on any (AC-57); `repo-hygiene.test.mjs` fails if any `*shader*` package is added.

## More Information

- Spike: `docs/temp/2026-10-14_shaders-spike.md`
- Spec: `specs/SPEC-2026-10-14-catalog-search.md` (section I, changelog)
