---
status: accepted
date: 2026-10-14
decision-makers: [Glib]
scope: harness
---

# Run browser acceptance tests with Playwright and axe, as test-only dependencies

## Context and Problem Statement

21 acceptance criteria in SPEC-2026-10-14-catalog-search need a real browser: a network log,
JavaScript disabled, clipboard, keyboard-only use, 320 px layout, reduced motion, WebGPU stubbed
off and an accessibility scan. Unit and integration tests run on `node:test`.

## Considered Options

1. `@playwright/test` and `@axe-core/playwright` as devDependencies, Chromium installed in a CI job.
2. jsdom or happy-dom under `node:test`, with the browser-only criteria checked by hand in a session browser.

## Decision Outcome

Chosen option: 1, because it keeps every e2e proof automated and repeatable in CI, and the
libraries never reach the published site.

### Consequences

- Good: the spec's proof tags stay as written; regressions in no-JS, a11y and effects fallbacks are caught on every PR.
- Bad: a heavier CI job (browser download) and more lockfile surface.
- Bad: WebGPU visuals and contrast over live frames still need a main-session browser check.

### Confirmation

The e2e job runs on pull requests; the site bundle check (AC-55, AC-8) fails if a test library is bundled.

## More Information

- Spec: `specs/SPEC-2026-10-14-catalog-search.md`
