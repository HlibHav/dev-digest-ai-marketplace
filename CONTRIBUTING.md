# Contributing

This page is the whole path for a new author. You should not need to ask anyone to ship a plugin change. Deeper rules are in [docs/PLUGIN-GUIDELINES.md](docs/PLUGIN-GUIDELINES.md), security rules in [docs/SECURITY.md](docs/SECURITY.md), release steps in [docs/RELEASES.md](docs/RELEASES.md).

## Branches

Branch from `main`, never commit to it directly. Name the branch after the plugin and the task:

```
feat/<plugin>-<slug>     new skill, agent, command or hook
fix/<plugin>-<slug>      bug fix
docs/<slug>              docs only
chore/<slug>             repo tooling, CI, scripts
```

Example: `feat/research-tools-source-ranking`.

## Where files go

```
plugins/<name>/
├── .claude-plugin/plugin.json   # only this file in .claude-plugin/
├── skills/<skill>/SKILL.md
├── agents/<agent>.md
├── commands/<command>.md
├── hooks/hooks.json             # top-level "hooks" key
├── .mcp.json
├── scripts/                     # helper scripts; never bin/
├── README.md                    # required
├── CHANGELOG.md                 # required; first "## x.y.z" heading equals plugin.json version
├── COMPATIBILITY.md             # required; contains a line such as "Claude Code >=2.1.110"
└── LICENSE                      # required; MIT
```

`CHANGELOG.md` headings look like `## 1.0.0 — 2026-10-14`, with bullets under `### Added`, `### Changed`, `### Removed` or `### Migration`. The catalog site reads the bullets. `COMPATIBILITY.md` gives the minimum Claude Code version and the features that set it. `node scripts/check-repo.mjs` fails when any of the three files is missing. A script shared between plugins is a real copy in each plugin, not a symlink; a symlink under `plugins/` fails the check.

Do not put `CLAUDE.md` at a plugin root (Claude Code does not load it; use a skill). Do not put anything but `plugin.json` in `.claude-plugin/`.

## Manifest fields

Each plugin has one `plugin.json`. The catalog (`.claude-plugin/marketplace.json`) only lists it.

| Field | Where | Rule |
|---|---|---|
| `name` | `plugin.json`, catalog entry | Required in both, must be equal. Immutable once released. |
| `version` | `plugin.json` only | Required, semver. Never in the catalog entry. |
| `description` | `plugin.json`, catalog entry | Keep both the same and true to the behaviour. |
| `author` | `plugin.json` | Your own name and GitHub URL, not the maintainer's. |
| `homepage` | `plugin.json` | `https://github.com/HlibHav/dev-digest-ai-marketplace/tree/main/plugins/<name>` |
| `repository`, `license` | `plugin.json` | `https://github.com/HlibHav/dev-digest-ai-marketplace`; `MIT`. |
| `dependencies` | `plugin.json` | See below. |
| `source` | catalog entry | `./plugins/<name>`. |
| `category` | catalog entry | One of `engineering`, `research`, `review`, `workflow`, `example`. A new category needs a line in the PR description saying why. |
| `tags` | catalog entry | 1 to 4 lowercase keywords; used for search on the site. |

## Dependencies

- Use the object form with a `^` range: `{ "name": "research-tools", "version": "^1.0.0" }`. The string form (`"research-tools@dev-digest-ai-marketplace@^1.0.0"`) silently drops the range on Claude Code 2.1.296, so use the object form. The repo check rejects the string form and requires a `^` range. Evidence: [the dependency ADR](docs/architecture-decisions/2026-10-14-plugin-dependency-form-and-ranges.md).
- A dependency must be a plugin in this catalog, and it must have a release tag, because ranges resolve only against `<plugin>--v<semver>` tags.
- An unconstrained dependency floats to the latest copy and can break your plugin silently. Do not leave one.
- To use a dependency's skill in an agent, list it in the agent's `skills:` frontmatter with its namespace, for example `engineering-paved-path:security`. The dependency makes the skill exist; `skills:` puts it into the agent's context.

## Skill and agent files

A skill is `skills/<skill>/SKILL.md` with YAML frontmatter, then the instructions:

```markdown
---
name: greet
description: Greets the user by name. Use when the user says hello or asks to be greeted.
---

Ask for the user's name if you do not know it, then greet them by name in one line.
```

`description` decides when Claude loads the skill, so say what it does and when to use it.
An agent is `agents/<agent>.md` with `name` and `description` frontmatter. The build validates skill and agent frontmatter.

## Test locally

Requirements: Node 22 or newer and Claude Code with `claude plugin validate`. Install the locked dependencies once, without running install scripts:

```
npm ci --ignore-scripts
```

Load your plugin, plus its dependencies if it has any, straight from the checkout, with no tags needed:

```
claude --plugin-dir ./plugins/sdd-engineering \
       --plugin-dir ./plugins/research-tools \
       --plugin-dir ./plugins/architecture-review \
       --plugin-dir ./plugins/engineering-paved-path
```

Inside the session, run `/reload-plugins` after each edit. Then run the one check CI runs:

```
bash scripts/check.sh
```

It runs `node scripts/check-repo.mjs` (repo rules), `claude plugin validate . --strict`, `claude plugin validate plugins/<name> --strict` for each plugin, `npm test`, and `node scripts/build-index.mjs` (the site build). Fix everything it reports before you open a PR.

`bash scripts/check.sh --no-build` runs the same without the site build. Use it for a quick pass on a plugin-only change.

CI runs three jobs on every pull request: `validate` (`bash scripts/check.sh --no-build` plus a secret scan), `Build catalog site` (`node scripts/build-index.mjs`, which also checks that the site data is valid) and `e2e` (the browser tests). All three must be green.

Run the tests on their own with `npm test`. The browser tests need Chromium once (`npx playwright install chromium`), then run with `npm run test:e2e`.

To exercise the `sdd-engineering` workflow itself, run the eval suite: `node scripts/run-evals.mjs`. It spends model tokens, so it is not part of `check.sh`. See `plugins/sdd-engineering/evals/README.md`.

## Add a new plugin

1. Create `plugins/<name>/` with the layout above. Pick a name that is not reserved (`claude-`, `anthropic-`, `cc-plugin-`, `claudeai-` prefixes are rejected) and that will not need to change.
2. Write `plugins/<name>/.claude-plugin/plugin.json` with `name`, `version` (start at `0.1.0`), `description`, `author`, `homepage`, `repository`, `license`.
3. Write `plugins/<name>/README.md`: what it does, what it provides, quick start, usage with examples, dependencies and what breaks without them, what the project must declare, hooks, external tools, troubleshooting. The `engineering-paved-path` README is a good model. Add `CHANGELOG.md` (a `## 0.1.0` heading with an `### Added` list), `COMPATIBILITY.md` (a `Claude Code >=x.y.z` line) and `LICENSE`.
4. Add an entry to `.claude-plugin/marketplace.json` with `name`, `source` (`./plugins/<name>`), `description`, `category`, `tags`. No `version`.
5. Add a line to `CODEOWNERS`: `/plugins/<name>/   @<your-github-handle> @HlibHav`. You own your plugin; the maintainer stays a co-owner until you have write access.
6. Add a row to the plugin table in `README.md`.
7. Run `bash scripts/check.sh`, then open the PR.

## PR checklist

Paste this into the PR description on GitHub (do not commit it as a file). An ADR is needed only for a choice that affects the whole repo (see [docs/architecture-decisions/](docs/architecture-decisions/README.md)); a new plugin alone does not need one.

- [ ] Branch name follows the pattern above
- [ ] `bash scripts/check.sh` passes locally
- [ ] Catalog entry `name` equals `plugin.json` `name`; no `version` in the catalog entry
- [ ] `version` bumped in `plugin.json` if installed behaviour changed
- [ ] Plugin has `README.md`, `CHANGELOG.md`, `COMPATIBILITY.md` and `LICENSE`; new components are described in the README
- [ ] `CHANGELOG.md` has a heading for the new version, first in the file
- [ ] Dependencies use the object form with `^` ranges and name catalog plugins
- [ ] No secrets, tokens or absolute paths (user-home or Windows drive paths)
- [ ] No runtime downloads (`npx --yes`, `pip install`) in hooks or skills
- [ ] Any `UserPromptSubmit`, `PreToolUse` or `PostToolUse` hook is gated (see guidelines)
- [ ] `CODEOWNERS` has a line for a new plugin

## What review looks for

- The description matches what the plugin does, including what hooks do.
- Hooks are narrow, gated and quote `"${CLAUDE_PLUGIN_ROOT}"`.
- Nothing reads or writes outside the plugin root; no `../`.
- Secrets arrive through `userConfig` with `sensitive: true`, not through files.
- Skill and agent names are specific and do not collide across plugins.
- The version bump matches the change (next section).
- Dependency ranges are tight enough that a breaking release of a dependency cannot reach this plugin unseen.
- The README states what the project must declare and what the plugin does when it is missing.

A code owner must approve, and the `validate` check must be green, before merge.

## Version bump rule

Bump `version` in `plugin.json` in the same PR whenever installed behaviour changes, and add the matching `## x.y.z — YYYY-MM-DD` heading at the top of `CHANGELOG.md` (the repo check compares the two). A change without a bump never reaches users: `claude plugin update` reports "already at the latest version" because the version string did not change. Docs-only and CI-only changes do not need a bump. What counts as major, minor or patch is in [docs/RELEASES.md](docs/RELEASES.md). Tagging a release is a separate step after merge.
