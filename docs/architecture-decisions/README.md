# Architecture decisions

MADR 4.0 records. Statuses: proposed, accepted, rejected, deprecated, superseded. An accepted
record is never rewritten; a change is a new record with `supersedes:`.

| Date | Decision | Status |
|---|---|---|
| 2026-10-14 | [Tag releases as `<plugin>--v<semver>`, title Releases `<plugin>@<semver>`](2026-10-14-native-plugin-release-tags.md) | accepted |
| 2026-10-14 | [Relative-path sources, `version` only in `plugin.json`](2026-10-14-relative-sources-version-in-plugin-json.md) | accepted |
| 2026-10-14 | [Protect `main` with a code-owner ruleset, admin bypass](2026-10-14-main-ruleset-admin-bypass.md) | accepted |
