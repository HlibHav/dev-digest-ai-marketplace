# Research: structuring a Claude Code plugin marketplace repo

Date: 2026-10-14. Sources: official Claude Code docs (code.claude.com/docs/en/plugins/*),
`anthropics/claude-plugins-official`, `anthropics/skills`, `wshobson/agents`,
`obra/superpowers-marketplace`, `thelobbi/claude`, GitHub docs, issues on `anthropics/claude-code`.
Items marked **(inference)** are design conclusions, not documented behaviour.

## Decisions taken (2026-10-14, Glib)

| Topic | Decision | Why |
|---|---|---|
| Release tags | git tag `<plugin>--v<semver>` (e.g. `sdd-engineering--v1.0.0`) created with `claude plugin tag --push`; the GitHub Release is titled `<plugin>@<semver>` | Dependency ranges resolve only against `--v` tags |
| Main protection | Ruleset requiring code-owner review, with admin bypass | A sole owner cannot approve their own PR |
| Research location | `docs/research/` in this repo | New authors see where the rules come from |

## 1. marketplace.json

- Path: `.claude-plugin/marketplace.json`. Relative sources resolve from the repo root (the directory
  that contains `.claude-plugin/`). Source: marketplace-reference.
- Required: `name`, `owner.name`, `plugins[]`; each entry needs `name` and `source`.
  Optional entry fields: `description`, `version`, `category`, `tags`, `strict` (default `true`),
  `dependencies`, `displayName`, plus any `plugin.json` field.
- Relative sources start with `./`; `..` fails validation; a missing directory passes `validate`
  and fails only at install.
- Relative sources work only when the marketplace is added via git/GitHub/local path. A bare
  `marketplace.json` URL (e.g. on GitHub Pages) downloads only that file, so relative entries fail.
  **The Pages site is a catalog, never an install source.**
- Entry `name` must equal the manifest `name`, otherwise install says
  `Plugin "<name>" not found in marketplace`.
- Plugin names are effectively immutable. Use `displayName` for labels and the append-only
  `renames` map for real renames. A removed entry stays installed on user machines unless
  `forceRemoveDeletedPlugins: true`.
- Reserved: names starting with `claude-`, `anthropic-`, `cc-plugin-`, `claudeai-`, and the
  official marketplace names. Our five names are allowed.

## 2. Plugin layout

```
plugins/<name>/
├── .claude-plugin/plugin.json   # only this file in .claude-plugin/
├── skills/<skill>/SKILL.md
├── agents/*.md
├── commands/*.md
├── hooks/hooks.json             # top-level "hooks" key
├── .mcp.json
├── scripts/                     # not bin/: claude.ai org sync rejects a top-level bin/
└── README.md
```

- `CLAUDE.md` at a plugin root is **not loaded** (validate warns). Guidance belongs in a skill.
- Component paths must start with `./` and stay inside the plugin root.
- Installed plugins are copied to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`.
  Anything outside the plugin dir is not copied, so `../shared` breaks for real users while still
  working from a local checkout. Share files between plugins with a symlink inside the repo
  (the target is dereferenced into the cache).
- Variables: `${CLAUDE_PLUGIN_ROOT}` (changes on every update, never write state there),
  `${CLAUDE_PLUGIN_DATA}` (persistent), `${CLAUDE_PROJECT_DIR}`. They are not set in Bash-tool commands.
- Namespacing: skills `/<plugin>:<skill>`, agents `<plugin>:<agent>`, MCP tools
  `mcp__plugin_<plugin>_<server>__<tool>`. Names across our plugins cannot collide.
- npm deps auto-install only with `package-lock.json` or `bun.lock`; a `pnpm-lock.yaml` is skipped.

## 3. Dependencies (native)

```json
{
  "name": "sdd-engineering",
  "version": "1.0.0",
  "dependencies": [
    { "name": "engineering-paved-path", "version": "~1.0.0" },
    { "name": "research-tools", "version": "~1.0.0" },
    { "name": "architecture-review", "version": "~1.0.0" }
  ]
}
```

- Installing the dependent installs and enables its dependencies at the same scope; disabling a
  needed dependency is refused; `claude plugin prune` removes orphans.
- A range resolves to the highest `<dep>--v<semver>` tag that satisfies it. For relative-path
  plugins the tags live on this repo. If no tag matches, the current copy is installed and the
  dependent stays disabled when it is out of range (`claude plugin list` shows `Requires ...`).
- Unconstrained deps float to the latest copy, so a breaking change in a dependency silently breaks
  `sdd-engineering`. **Always give ranges and always tag the dependencies.**
- Pre-releases need an opt-in range (`^2.0.0-0`).
- Local dev: `claude --plugin-dir ./plugins/a --plugin-dir ./plugins/b` satisfies deps without tags.

## 4. Versions, updates, rollback

- Version resolution: `plugin.json` `version` → entry `version` → commit SHA.
  **Set `version` only in `plugin.json`**; if both are set, `plugin.json` wins silently.
- An update fires only when the version string changes. Pushing without a bump means
  `claude plugin update` says "already at the latest version".
- Consumers: `claude plugin marketplace update <name>` refreshes the listing;
  `claude plugin update <plugin>@<marketplace>` updates one plugin. Auto-update is off by default
  for third-party marketplaces; a consumer project can set `"autoUpdate": true` on its
  `extraKnownMarketplaces` entry.
- No `install <plugin>@<version>` flag and no rollback command exist.
- Pinning: `/plugin marketplace add HlibHav/dev-digest-ai-marketplace#<ref>` pins the whole catalog;
  per-plugin `ref`/`sha` only exist for `github`/`git-subdir` sources, not for relative paths.
- **Rollback (inference):** restore the 1.0.0 content and set `version` back to `1.0.0` in a new
  commit. Consumers on 1.1.0 see a changed string and `claude plugin update` returns them to 1.0.0.
  Emergency path for one consumer: re-add the marketplace with `#sdd-engineering--v1.0.0`.
- Known bug #14061 (open, 2.0.69–2.1.101): the cache keeps the old commit after update.
  Workaround: delete `~/.claude/plugins/cache/dev-digest-ai-marketplace/` and restart.
  The rollback rehearsal must check for it.
- Old version dirs are removed 14 days after an update; a running session keeps the old version
  until `/reload-plugins`.

## 5. Consumer project setup

```json
{
  "extraKnownMarketplaces": {
    "dev-digest-ai-marketplace": {
      "source": { "source": "github", "repo": "HlibHav/dev-digest-ai-marketplace" }
    }
  },
  "enabledPlugins": { "sdd-engineering@dev-digest-ai-marketplace": true }
}
```

Applies only after the user accepts the workspace trust dialog. For relative-path plugins,
`enabledPlugins` in project settings is enough; no per-teammate install is needed.

## 6. CI validation

- `claude plugin validate . --strict` checks the catalog and each listed `plugin.json`, but **does
  not open skills, agents, commands or hooks of listed plugins**. Also run
  `claude plugin validate plugins/<name> --strict` for every plugin.
- Exit codes: 0 pass, 1 fail (or warning under `--strict`), 2 validator error. `--json` available.
- Not caught by validate: entry `hooks` given as a file path, source fetch errors.
- Version agreement and tag uniqueness: `claude plugin tag --dry-run` per plugin.
- Not in any official workflow, worth adding: gitleaks, a grep for absolute paths (`/Users/`, `C:\`).
- `anthropics/claude-plugins-official` runs nine workflows (validate-plugins, validate-frontmatter,
  validate-licenses, check-mcp-urls, scan-plugins, …). Traps it documents: a required check whose
  path filter misses a file stays "Expected" forever; PRs opened by `GITHUB_TOKEN` do not trigger
  `pull_request` workflows.
- `claude plugin eval` (v2.1.269+) runs per-plugin eval suites with and without the plugin; the
  publish checklist lists it as a pre-release step.

## 7. GitHub Pages catalog

Pattern from `thelobbi/claude/.github/workflows/pages.yml`: trigger on `site/**`,
`.claude-plugin/marketplace.json`, `plugins/**/.claude-plugin/plugin.json` and the build script;
build → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` → a deploy job with
`actions/deploy-pages@v4` in environment `github-pages`; permissions `contents: read`,
`pages: write`, `id-token: write`; concurrency group `pages`. Pages must be enabled once in
Settings → Pages → Source: GitHub Actions. `build-index.mjs` should read `plugin.json`, which wins
over entry fields (**inference**).

## 8. Security

- "A Claude Code plugin you install can execute arbitrary code on your machine with your user
  privileges." Hooks, MCP/LSP servers and monitors run outside the sandbox.
- Secrets: `userConfig` with `sensitive: true` (stored in the OS credential store). `${user_config.KEY}`
  is rejected in shell-form hook commands; use exec-form `args` or `CLAUDE_PLUGIN_OPTION_<KEY>`.
- Quote `"${CLAUDE_PLUGIN_ROOT}"` in shell-form hooks.
- The official policy scan fails: broad hooks (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`)
  without a gate, undisclosed telemetry, a description that does not match behaviour, credential
  exfiltration, runtime downloads (`npx --yes`, `pip install`) in hooks or skills.
- Documented attacks: PromptArmor (hooks rewriting permissions to auto-approve `curl`),
  SentinelOne (a skill steering installs to a malicious package).
- Bad-release levers: fix forward with a patch; `renames: { "<name>": null }` plus
  `forceRemoveDeletedPlugins: true` uninstalls a malicious plugin at next session start; delete the
  tag; publish an advisory. Consumers without auto-update stay on the bad version until they update.

## 9. Governance (CODEOWNERS)

- Valid locations: `.github/`, root, `docs/`; the first found wins; the last matching pattern wins.
- Enforcement needs "Require review from Code Owners" in a ruleset. Owners need write access.
- Give `CODEOWNERS`, `.claude-plugin/marketplace.json`, `.github/**` and `docs/SECURITY.md` an owner.
- Invalid lines are skipped silently.

## Not found

- An official rollback or incident-response procedure.
- A real marketplace generating `<plugin>--v<semver>` tags with release-please or changesets
  (release-please emits a single dash by default).
- A second public example of a Pages catalog generated from `marketplace.json`.
