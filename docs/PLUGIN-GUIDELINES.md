# Plugin guidelines

Authoring rules for plugins in this repo. [CONTRIBUTING.md](../CONTRIBUTING.md) is the short path; this page is the reasoning. Source: [2026-10-14_marketplace-repo-structure.md](https://github.com/HlibHav/dev-digest-ai-marketplace/blob/631e50bf8e58a2d872598fdd2dac1b8d5ddf111d/docs/temp/2026-10-14_marketplace-repo-structure.md) (archived).

## Layout

```
plugins/<name>/
├── .claude-plugin/plugin.json   # only this file in .claude-plugin/
├── skills/<skill>/SKILL.md
├── agents/*.md
├── commands/*.md
├── hooks/hooks.json
├── .mcp.json
├── scripts/
├── README.md
├── CHANGELOG.md
├── COMPATIBILITY.md
└── LICENSE
```

- `README.md`, `CHANGELOG.md`, `COMPATIBILITY.md` and `LICENSE` are required. `check-repo.mjs` fails without them.
- The first `## x.y.z` heading of `CHANGELOG.md` equals the `version` in `plugin.json`. Bullets under the heading feed the catalog site.
- `COMPATIBILITY.md` contains a line such as `Claude Code >=2.1.110`. The site shows it. Only claim a minimum you have tested or can support from the documentation; write "tested on <version>" for the rest.
- `.claude-plugin/` holds `plugin.json` and nothing else.
- Component paths in manifests start with `./` and stay inside the plugin root.

## Paths

Claude Code copies an installed plugin to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Only files inside the plugin directory are copied.

- Never write `../`. A path like `../shared/x.md` works from a local checkout and breaks for every real user.
- Never write an absolute path (a user-home or Windows drive path). `check-repo.mjs` rejects them.
- To share a file between two plugins, ship a real copy in each plugin that needs it. Do not use a symlink: `check-repo.mjs` rejects symlinks under `plugins/`, and an installed plugin must work from its own directory. Pick one canonical copy and let `check-repo.mjs` compare the others byte for byte, as it does for `agent-guard.py` (canonical in `engineering-paved-path`).
- Shared skills are different: they live once, in one plugin, and other plugins depend on it. An agent in another plugin names them in `skills:` with the namespace (`engineering-paved-path:security`).

Variables, for use in hook commands, MCP configs and skill content:

| Variable | Meaning | Use for |
|---|---|---|
| `${CLAUDE_PLUGIN_ROOT}` | The installed plugin directory. Changes on every update. | Reading files that ship with the plugin. Never write state here. |
| `${CLAUDE_PLUGIN_DATA}` | Persistent directory that survives updates. | Caches, state, installed dependencies. |
| `${CLAUDE_PROJECT_DIR}` | The user's project root. | Reading project files. |

These variables are not set in commands run through the Bash tool, so a skill that tells Claude to run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/x.sh` needs the path resolved another way; prefer hooks, MCP configs, or inline skill content for them.

## Guidance goes in skills

A `CLAUDE.md` at a plugin root is not loaded, and `claude plugin validate` warns about it. Put guidance in a skill: a `SKILL.md` with a clear `description` so it triggers when relevant. `check-repo.mjs` fails on a root `CLAUDE.md`.

## scripts/, not bin/

Put helper executables in `scripts/`. A top-level `bin/` is rejected by claude.ai organization sync, and `check-repo.mjs` fails on it.

## Namespacing

Components are namespaced by plugin name, so two plugins can ship a skill with the same folder name without a clash, but keep names specific anyway.

- Skills: `/<plugin>:<skill>`
- Agents: `<plugin>:<agent>`
- MCP tools: `mcp__plugin_<plugin>_<server>__<tool>`

Do not reference another plugin's component by a short name; use the full namespaced name and declare the plugin in `dependencies`.

## Names

- A plugin `name` is effectively immutable. Users enable it by `name@marketplace`; renaming breaks every `enabledPlugins` entry.
- Need a nicer label? Set `displayName`. It changes the label only.
- Need a real rename? Add an entry to the append-only `renames` map in the catalog (old name to new name) in the same PR. Never delete a `renames` entry.
- A catalog entry `name` must equal the `name` in its `plugin.json`, or install fails with `Plugin "<name>" not found in marketplace`.
- Reserved prefixes: `claude-`, `anthropic-`, `cc-plugin-`, `claudeai-`.
- Removing a catalog entry does not uninstall the plugin from user machines. Only `forceRemoveDeletedPlugins: true` does (see [SECURITY.md](SECURITY.md)).

## Versions and dependencies

- Set `version` only in `plugin.json`. If a catalog entry also sets it, `plugin.json` wins silently and the two drift.
- Dependencies are `{ "name": "...", "version": "^1.0.0" }`, the object form. Always a range, always a catalog plugin, always with a release tag. The string form `name@marketplace@^1.0.0` silently ignores the range on Claude Code 2.1.296, so use the object form. `check-repo.mjs` rejects the string form and requires a `^` range; see [the dependency ADR](architecture-decisions/2026-10-14-plugin-dependency-form-and-ranges.md).
- `dependencies` (a hard requirement, checked when the plugin loads) and an agent's `skills:` frontmatter (which skills are injected into that agent at start) are two mechanisms. A plugin whose agent preloads `other-plugin:skill` must also depend on `other-plugin`.
- A plugin keeps only the dependencies it needs. Skills an agent might use are left to the `Skill` tool, not declared.
- Pre-releases need an opt-in range such as `^2.0.0-0`.

## npm dependencies

Claude Code installs a plugin's npm dependencies automatically only when the plugin has a `package-lock.json` or `bun.lock`. A `pnpm-lock.yaml` is skipped. If a plugin needs npm packages, commit a `package-lock.json`, and install into `${CLAUDE_PLUGIN_DATA}`, not `${CLAUDE_PLUGIN_ROOT}`.

## Hooks

- Prefer exec form (`command` plus `args`). In shell form, always quote the variable: `"${CLAUDE_PLUGIN_ROOT}/scripts/gate.sh"`.
- `${user_config.KEY}` is rejected in shell-form commands. Use exec-form `args`, or read `CLAUDE_PLUGIN_OPTION_<KEY>` from the environment.
- Gate broad hooks. `UserPromptSubmit`, `PreToolUse` and `PostToolUse` fire on a large share of all activity. Give them a `matcher` or an early exit so they act only on the case they exist for, and say in the README what they do.
- Hooks run outside the sandbox. Keep them short, read-only where possible, and free of network calls unless the README discloses them.
- A hook must not change permissions (for example auto-approve a command) unless that is its documented purpose.

## Description honesty

The `description` in `plugin.json` and the catalog must match behaviour. A plugin that says "read-only reviewer" must not carry a hook that writes files.

## README content

Each plugin README covers, in this order: purpose (matching `plugin.json`), what it provides (table with namespaced names), quick start, usage with example prompts and what comes back, dependencies and what breaks without them, what the project must declare and what happens when it does not, hooks (event, matcher, what is allowed and denied, which agents), external tools, compatibility, troubleshooting, local development, versioning, provenance. Agents must never guess a missing project fact; say in the README that they ask or report it as unverifiable.
