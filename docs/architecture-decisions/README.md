# Architecture decisions

MADR 4.0 records. Statuses: proposed, accepted, rejected, deprecated, superseded. An accepted
record is never rewritten; a change is a new record with `supersedes:`.

| Date | Decision | Status |
|---|---|---|
| 2026-10-14 | [Tag releases as `<plugin>--v<semver>`, title Releases `<plugin>@<semver>`](2026-10-14-native-plugin-release-tags.md) | accepted |
| 2026-10-14 | [Relative-path sources, `version` only in `plugin.json`](2026-10-14-relative-sources-version-in-plugin-json.md) | accepted |
| 2026-10-14 | [Protect `main` with a code-owner ruleset, admin bypass](2026-10-14-main-ruleset-admin-bypass.md) | accepted |
| 2026-10-14 | [Catalog site: MiniSearch, vanilla JS, `shaders`, esbuild](2026-10-14-catalog-stack.md) | superseded |
| 2026-10-14 | [Browser acceptance tests: Playwright + axe, test-only](2026-10-14-e2e-playwright.md) | accepted |
| 2026-10-14 | [In-house WebGPU effects (supersedes the `shaders` choice)](2026-10-14-own-webgpu-effects.md) | accepted |
| 2026-10-14 | [Plugin dependencies: object form with `^1.0.0` ranges, real copies of the guard script](2026-10-14-plugin-dependency-form-and-ranges.md) | accepted |
