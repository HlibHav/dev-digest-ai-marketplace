# Releases

Decisions behind this page: [native release tags](architecture-decisions/2026-10-14-native-plugin-release-tags.md) and [version only in plugin.json](architecture-decisions/2026-10-14-relative-sources-version-in-plugin-json.md). Source: `docs/temp/2026-10-14_marketplace-repo-structure.md`, sections 3 and 4.

## What SemVer means for a plugin

| Bump | When | Examples |
|---|---|---|
| Major | A consumer's existing workflow can break. | Skill or agent renamed or removed; a hook now blocks something it allowed; a required `userConfig` key added; a dependency range raised to a new major. |
| Minor | New capability, nothing existing breaks. | New skill, agent or command; a new gated hook; a skill gains an optional step. |
| Patch | Same interface, better behaviour. | Prompt wording fix; bug fix in a script; README and metadata fixes that ship with the plugin. |

Dependents use `~` ranges, so `~1.0.0` accepts `1.0.x` and rejects `1.1.0`. A minor release of a dependency therefore needs the dependent's range raised in the same or a following PR.

## Current state: skeletons at 0.1.0

All four plugins start at `0.1.0` with no tags, while `sdd-engineering` already declares `~1.0.0`
ranges. Until the first release, installing `sdd-engineering` pulls its dependencies at `0.1.0` and
`claude plugin list` reports it as disabled with `Requires ... ~1.0.0`. This is expected. The first
release bumps all four to `1.0.0` in one PR and tags them in the order below.

## Cut a release

1. Merge the PR that bumps `version` in `plugin.json`.
2. Release dependencies first. For `sdd-engineering`, tag `engineering-paved-path`, `research-tools` and `architecture-review` before it, otherwise its `~1.0.0` ranges find no tag.
3. From the plugin directory, on a clean tree at the merged commit:

```
cd plugins/<name>
claude plugin tag --push
```

This checks that `plugin.json` and the catalog agree, that the tree is clean and that the tag is new, then creates and pushes `<name>--v<version>` (for example `research-tools--v1.0.0`). Use `claude plugin tag --dry-run` first if unsure.

4. Create the GitHub Release. The title uses `@`, the tag uses `--v`:

```
gh release create research-tools--v1.0.0 --title "research-tools@1.0.0" --generate-notes
```

Repeat for each plugin, dependencies first.

## How consumers update

```
claude plugin marketplace update dev-digest-ai-marketplace
claude plugin update sdd-engineering@dev-digest-ai-marketplace
```

An update happens only when the version string changed. A running session keeps the old version until `/reload-plugins`. Auto-update is off by default for third-party marketplaces. A consumer project can turn it on:

```json
{
  "extraKnownMarketplaces": {
    "dev-digest-ai-marketplace": {
      "source": { "source": "github", "repo": "HlibHav/dev-digest-ai-marketplace" },
      "autoUpdate": true
    }
  }
}
```

## Release channels (optional, not set up)

A stable and a beta channel could be two catalogs with different `name` values, for example `dev-digest-ai-marketplace` on `main` and `dev-digest-ai-marketplace-beta` on a `beta` ref, both added with `marketplace add HlibHav/dev-digest-ai-marketplace#beta`. This repo has one catalog on `main` and no beta ref.

## Pinning

Pin the whole catalog to a tag or ref:

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace#sdd-engineering--v1.0.0
```

Per-plugin `ref` or `sha` pins exist only for `github` and `git-subdir` sources, not for the relative-path sources used here, so pinning is catalog-wide.

## Rollback

There is no `install <plugin>@<version>` flag and no rollback command. Roll back by moving forward:

1. Restore the old content of the plugin (for example `git checkout sdd-engineering--v1.0.0 -- plugins/sdd-engineering`).
2. Set `version` in `plugin.json` back to the old string (1.1.0 becomes 1.0.0).
3. Commit and merge. The string on `main` now differs from what 1.1.0 consumers hold, so `claude plugin update` moves them back to 1.0.0.
4. Do not re-tag 1.0.0 (it exists). If the tag for the bad version must go, see the runbook in [SECURITY.md](SECURITY.md).

Emergency pin for one consumer who cannot wait: re-add the marketplace at the old tag, `/plugin marketplace add HlibHav/dev-digest-ai-marketplace#sdd-engineering--v1.0.0`.

## Stale cache bug (anthropics/claude-code #14061)

Open for Claude Code 2.0.69 to 2.1.101: after an update the cache can keep the old commit, so the plugin still shows the old content. Workaround:

```
rm -rf ~/.claude/plugins/cache/dev-digest-ai-marketplace/
```

then restart Claude Code. Old version directories are removed 14 days after an update on their own.

## Rehearsal checklist

Run once before the first real release, and after any Claude Code major upgrade.

- [ ] `claude plugin tag --dry-run` passes in each plugin directory
- [ ] Tag and release `research-tools` at 1.0.0, then `sdd-engineering` at 1.0.0; `claude plugin list` in a clean project shows no `Requires ...`
- [ ] Publish a 1.1.0 of one plugin with a visible change; the consumer updates to it
- [ ] Roll back to 1.0.0 with a new commit; the consumer's `claude plugin update` returns to 1.0.0
- [ ] If the consumer still shows 1.1.0, apply the cache workaround and record whether bug #14061 reproduced
- [ ] Delete a throwaway tag and confirm a range no longer resolves to it
- [ ] Re-add the marketplace with `#<tag>` and confirm the pinned content
