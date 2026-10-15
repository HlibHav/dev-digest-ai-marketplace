# Releases

Decisions behind this page: [native release tags](architecture-decisions/2026-10-14-native-plugin-release-tags.md) and [version only in plugin.json](architecture-decisions/2026-10-14-relative-sources-version-in-plugin-json.md). Source: [2026-10-14_marketplace-repo-structure.md](https://github.com/HlibHav/dev-digest-ai-marketplace/blob/631e50bf8e58a2d872598fdd2dac1b8d5ddf111d/docs/temp/2026-10-14_marketplace-repo-structure.md) (archived), sections 3 and 4.

## What SemVer means for a plugin

| Bump | When | Examples |
|---|---|---|
| Major | A consumer's existing workflow can break. | Skill or agent renamed or removed; a hook now blocks something it allowed; a required `userConfig` key added; a dependency range raised to a new major. |
| Minor | New capability, nothing existing breaks. | New skill, agent or command; a new gated hook; a skill gains an optional step. |
| Patch | Same interface, better behaviour. | Prompt wording fix; bug fix in a script; README and metadata fixes that ship with the plugin. |

Dependents use `^` ranges in the object form, so `^1.0.0` accepts any `1.x.y` and rejects `2.0.0`. A minor or patch release of a dependency reaches dependents without a change on their side. A major release needs the dependent's range raised in the same or a following PR. The string form of a dependency drops the range on Claude Code 2.1.296; see [the dependency ADR](architecture-decisions/2026-10-14-plugin-dependency-form-and-ranges.md).

## Current state

Released: `engineering-paved-path`, `research-tools` and `architecture-review` at 1.0.1; `sdd-engineering` at 1.1.0 (Latest), with 1.0.2 as the stable channel below. Every version has a `<plugin>--v<version>` tag and a GitHub Release. `sdd-engineering` declares `^1.0.0` ranges on its three dependencies, and `architecture-review` declares one on `engineering-paved-path`. A tagless marketplace added from a local path still installs and resolves ranges against the version in `plugin.json` (checked on 2.1.296; see the dependency ADR).

## Cut a release

1. Merge the PR that bumps `version` in `plugin.json` and adds the matching `CHANGELOG.md` heading.
2. Review the `CHANGELOG.md` entry of every plugin you are about to tag: it must describe what changed, and the version and date must be right. The catalog site shows these bullets, and a tag cannot be moved.
3. Release dependencies first. The order for this catalog is `engineering-paved-path` and `research-tools` (no dependencies), then `architecture-review` (needs `engineering-paved-path`), then `sdd-engineering` (needs the other three). Tagging a plugin before its dependencies leaves its `^1.0.0` ranges with no tag to resolve.
4. From the plugin directory, on a clean tree at the merged commit:

```
cd plugins/<name>
claude plugin tag --push
```

This checks that `plugin.json` and the catalog agree, that the tree is clean and that the tag is new, then creates and pushes `<name>--v<version>` (for example `research-tools--v1.0.0`). Use `claude plugin tag --dry-run` first if unsure.

5. Create the GitHub Release. The title uses `@`, the tag uses `--v`:

```
gh release create research-tools--v1.0.0 --title "research-tools@1.0.0" --generate-notes
```

Repeat for each plugin, dependencies first. Paste the plugin's `CHANGELOG.md` section into the release notes if `--generate-notes` is not enough.

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

## Release channels

| Channel | Source | What you get today |
|---|---|---|
| latest | `HlibHav/dev-digest-ai-marketplace` (`main`) | `sdd-engineering` 1.1.0, dependencies 1.0.1 |
| stable | `HlibHav/dev-digest-ai-marketplace#sdd-engineering--v1.0.2` | `sdd-engineering` 1.0.2, dependencies 1.0.1 |

The stable channel is the catalog pinned to the last tag before 1.1.0. At that tag all four plugins are 1.0.x. A tag cannot move, so stable stays at 1.0.2 until this table names a newer tag. Moving it is a docs change, not a release.

Both channels use the same catalog name, `dev-digest-ai-marketplace`. That name is machine-wide: `marketplace add` with a different source under the same name repoints every project on the machine that uses it, and the CLI says so ("Plugins already installed from it now update from the new source"). One machine therefore follows one channel at a time. A real parallel beta would need a second catalog with its own `name`.

There is no `plugin rollback` and no `install <plugin>@<version>`. Switching channels means removing the catalog and adding it again. Removing a catalog uninstalls its plugins and deletes their saved options, secrets and data. These four plugins keep no data: there is no `~/.claude/plugins/data/` directory for them, and they change no state outside the session, so a switch loses nothing.

### Switch to stable (rehearsed 2026-10-15, Claude Code 2.1.296)

From the consumer project:

```
claude plugin marketplace remove dev-digest-ai-marketplace
claude plugin marketplace add 'HlibHav/dev-digest-ai-marketplace#sdd-engineering--v1.0.2' --scope project
claude plugin install sdd-engineering@dev-digest-ai-marketplace --scope project
```

A running session keeps what it loaded until `/reload-plugins`. The rehearsal was headless, so a fresh `claude -p` session stood in for that step.

Output of the rehearsal, in a temp project that started on latest (1.1.0):

```
✔ Successfully installed plugin: sdd-engineering@dev-digest-ai-marketplace (scope: project) (+ 3 dependencies: engineering-paved-path, research-tools, architecture-review)

$ claude plugin list --json   (filtered)
architecture-review     1.0.1-885d6fb5a22c
engineering-paved-path  1.0.1-885d6fb5a22c
research-tools          1.0.1-885d6fb5a22c
sdd-engineering         1.0.2
```

`.claude/settings.json` of the project now holds the pin as `"ref": "sdd-engineering--v1.0.2"` under `extraKnownMarketplaces`. A dependency version carries the short commit of the tag it resolved to; `sdd-engineering` shows the plain version.

Checks on the stable install:
- The plugin cache matches the tag: `diff -r` of each installed plugin against `plugins/<name>` in a checkout of `sdd-engineering--v1.0.2` showed no difference (only the CLI's `.in_use` marker). The 1.1.0 coverage gate is absent: `Requirements coverage` occurs 0 times in the stable `spec-creator.md` and 4 times in 1.1.0.
- A fresh `claude -p` session in the project lists `sdd-engineering` 1.0.2 and its agents `sdd-engineering:spec-creator` and `sdd-engineering:implementation-planner`.
- Smoke eval: `node scripts/run-evals.mjs --cases negative --model haiku`, run from the checkout of the stable tag (the runner loads the plugins of the checkout it runs in, so this tests the stable content): 3/3 PASS, total $0.0091.

```
skills-load-clean           1    PASS    $0.0041  1.8s
irrelevant-question-no-sdd  1    PASS    $0.0020  3.9s
summarize-repo-no-retro     1    PASS    $0.0030  6.3s
```

### Switch back to latest

```
claude plugin marketplace remove dev-digest-ai-marketplace
claude plugin marketplace add HlibHav/dev-digest-ai-marketplace --scope project
claude plugin install sdd-engineering@dev-digest-ai-marketplace --scope project
```

After the `add` the project had no plugins from this catalog: removing the catalog had uninstalled them, so `install` is needed, not `update`. The install brought back `sdd-engineering` 1.1.0 with the same three dependencies at 1.0.1.

## How to confirm the active version

Two commands, both read-only. `plugin list` shows what is installed; the `init` event of a headless session shows what that session actually loaded, with the plugin's version and cache path. The init event is the telemetry that the version in use is the one you pinned.

```
claude plugin list --json     # filter to your project with projectPath
claude -p "say ok" --output-format stream-json --verbose --model claude-haiku-5-5 --setting-sources project \
  | jq -c 'select(.type=="system" and .subtype=="init") | .plugins[] | select(.path!="builtin") | {name,version,path}'
```

Run on 2026-10-15 with Claude Code 2.1.296, in a fresh temp project (`git init` only, no DevDigest files, no `.claude/` of its own), all with `--scope project`. The three steps moved the channel the way [Switch to stable](#switch-to-stable-rehearsed-2026-10-15-claude-code-21296) describes: `marketplace remove`, `marketplace add '...#<tag>'`, `install sdd-engineering@dev-digest-ai-marketplace`. Paths are shortened to the part after `~/.claude/plugins/cache/`.

| Step | Pinned ref | `sdd-engineering` in the init event | Dependencies in the init event |
|---|---|---|---|
| 1 | `sdd-engineering--v1.0.0` | `1.0.0` (`dev-digest-ai-marketplace/sdd-engineering/1.0.0`) | all three `1.0.1` |
| 2 | `sdd-engineering--v1.1.0` | `1.1.0` (`dev-digest-ai-marketplace/sdd-engineering/1.1.0`) | all three `1.0.1` |
| 3 | `sdd-engineering--v1.0.2` (stable) | `1.0.2` (`dev-digest-ai-marketplace/sdd-engineering/1.0.2`) | all three `1.0.1` |

Step 1 in full, the `jq` output of the command above:

```
{"name":"sdd-engineering","version":"1.0.0","path":"~/.claude/plugins/cache/dev-digest-ai-marketplace/sdd-engineering/1.0.0"}
{"name":"engineering-paved-path","version":"1.0.1","path":"~/.claude/plugins/cache/dev-digest-ai-marketplace/engineering-paved-path/1.0.1-885d6fb5a22c"}
{"name":"research-tools","version":"1.0.1","path":"~/.claude/plugins/cache/dev-digest-ai-marketplace/research-tools/1.0.1-885d6fb5a22c"}
{"name":"architecture-review","version":"1.0.1","path":"~/.claude/plugins/cache/dev-digest-ai-marketplace/architecture-review/1.0.1-885d6fb5a22c"}
```

The same session lists the plugins' agents and skills, for example `sdd-engineering:spec-creator`, `sdd-engineering:implementation-planner`, `sdd-engineering:plan-verifier`, `architecture-review:architecture-reviewer`, `research-tools:researcher` and `engineering-paved-path:sdd-cascade`.

### `sdd-engineering@1.0.0` installs clean

`marketplace add '...#sdd-engineering--v1.0.0'` and `install` printed:

```
✔ Successfully installed plugin: sdd-engineering@dev-digest-ai-marketplace (scope: project) (+ 3 dependencies: engineering-paved-path, research-tools, architecture-review)
```

`claude plugin list --json`, entries of this project (the `errors` key is absent on every entry; it appears only when a plugin has one, and the text view of `plugin list` has no `Requires` or error line):

| Plugin | Version | enabled | scope | `errors` |
|---|---|---|---|---|
| `sdd-engineering` | `1.0.0` | true | project | none |
| `engineering-paved-path` | `1.0.1-885d6fb5a22c` | true | project | none |
| `research-tools` | `1.0.1-885d6fb5a22c` | true | project | none |
| `architecture-review` | `1.0.1-885d6fb5a22c` | true | project | none |

The dependencies did not resolve to 1.0.0. The range `^1.0.0` takes the highest tag it accepts, and the dependency tags 1.0.0 and 1.0.1 both exist, so all three came in at 1.0.1 (the short commit of that tag follows the version). The pin on `sdd-engineering--v1.0.0` fixes the catalog and `sdd-engineering`, not the dependencies below their range ceiling.

The project had no DevDigest files: the plugin content comes from the cache, not from the repository.

## Pinning

Pin the whole catalog to a tag or ref:

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace#sdd-engineering--v1.0.2
```

Per-plugin `ref` or `sha` pins exist only for `github` and `git-subdir` sources, not for the relative-path sources used here, so pinning is catalog-wide.

## Rollback

There is no `install <plugin>@<version>` flag and no rollback command. Roll back by moving forward:

1. Restore the old content of the plugin, for example `git checkout sdd-engineering--v1.0.2 -- plugins/sdd-engineering`. This also restores the old `plugin.json` and `CHANGELOG.md`.
2. Give it a new version: 1.1.0 becomes 1.1.1, with a CHANGELOG entry that says it rolls back to 1.0.2 content. Keeping the old string (1.0.2) also moves consumers back. But that version already has a tag, so it cannot be released with `claude plugin tag`. Its cache directory may also already exist on a consumer's machine.
3. Commit and merge, then tag and release 1.1.1 as usual. The string on `main` now differs from what 1.1.0 consumers hold, so `claude plugin marketplace update` plus `claude plugin update` moves them to the old content.
4. Do not move or re-create an existing tag. If the tag for the bad version must go, see the runbook in [SECURITY.md](SECURITY.md) and "Delete a tag" below.

Emergency pin for one consumer who cannot wait: switch to the stable channel above.

### Rehearsal of the roll-forward (2026-10-15, Claude Code 2.1.296)

This ran against a local clone of this repo, added as the catalog of a temp project, so `main` and real consumers saw nothing. The project first installed `sdd-engineering` 1.1.0 from the clone. Then two commits went on a branch of the clone, each followed by:

```
claude plugin marketplace update dev-digest-ai-marketplace
claude plugin update sdd-engineering@dev-digest-ai-marketplace --scope project
```

| Commit in the clone | Update output |
|---|---|
| `git checkout sdd-engineering--v1.0.2 -- plugins/sdd-engineering` (version string back to 1.0.2) | `Plugin "sdd-engineering" updated from 1.1.0 to 1.0.2` |
| same content, `version` set to 1.1.1 | `Plugin "sdd-engineering" updated from 1.0.2 to 1.1.1` |

A downgrade of the version string is accepted: any change of the string counts as an update. A fresh `claude -p` session reported 1.0.2 and then 1.1.1. The 1.1.1 cache matched the 1.0.2 tag except for the `version` field in `plugin.json`.

### Delete a tag (rehearsed 2026-10-15)

Dependency ranges resolve against the tags on GitHub, so deleting a tag takes that version out of resolution. The rehearsal pushed a throwaway tag `engineering-paved-path--v1.0.99`. It sat on a commit outside `main` whose only change was the version string. The tag was public for about a minute.

1. A fresh temp project installed `sdd-engineering` from latest. The `^1.0.0` range picked the throwaway tag: `engineering-paved-path 1.0.99-7c45dd15506f`.
2. `git push origin :refs/tags/engineering-paved-path--v1.0.99`, then `git ls-remote --tags` showed no such tag.
3. `claude plugin marketplace update dev-digest-ai-marketplace` and `claude plugin update engineering-paved-path@dev-digest-ai-marketplace --scope project` printed `updated from 1.0.99-7c45dd15506f to 1.0.1-885d6fb5a22c (highest tag satisfying ^1.0.0, ^1.0.0 from sdd-engineering, architecture-review)`.

Deleting a tag does not reach into installs that already hold it: a consumer stays on the deleted version until their next `plugin update`.

## Stale cache bug (anthropics/claude-code #14061)

Open for Claude Code 2.0.69 to 2.1.101: after an update the cache can keep the old commit, so the plugin still shows the old content. Workaround:

```
rm -rf ~/.claude/plugins/cache/dev-digest-ai-marketplace/
```

then restart Claude Code. Old version directories are removed 14 days after an update on their own.

It did not reproduce on 2.1.296. On 2026-10-15 there were eight channel switches, updates and rollbacks, and after each one the reported version and the loaded content were the new ones. No cache workaround was needed.

## Rehearsal checklist

Run once before the first real release, and after any Claude Code major upgrade. Last full run: 2026-10-15, Claude Code 2.1.296. The versions differ from the ones the list was written with (1.0.0 to 1.1.0): the real releases went 1.0.0, 1.0.1, 1.0.2 and 1.1.0.

- [x] `claude plugin tag --dry-run` passes in each plugin directory (the 1.0.1 releases were cut with `claude plugin tag --push`)
- [x] Tag and release dependencies first, then `sdd-engineering`; `claude plugin list` in a clean project shows no `Requires ...` (1.0.1 install check, 2026-10-14)
- [x] Publish a 1.1.0 of one plugin with a visible change; the consumer updates to it (`sdd-engineering` 1.0.2 to 1.1.0, 2026-10-14)
- [x] Roll back with a new commit; the consumer's `claude plugin update` returns to the old content (1.1.0 to 1.0.2 content, both version-string variants; see "Rehearsal of the roll-forward")
- [x] If the consumer still shows the new version, apply the cache workaround and record whether bug #14061 reproduced (it did not)
- [x] Delete a throwaway tag and confirm a range no longer resolves to it (see "Delete a tag")
- [x] Re-add the marketplace with `#<tag>` and confirm the pinned content (stable channel; cache equals the tag)
