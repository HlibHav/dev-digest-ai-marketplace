# Security

This page is owned by a code owner (see `CODEOWNERS`). Source: [2026-10-14_marketplace-repo-structure.md](https://github.com/HlibHav/dev-digest-ai-marketplace/blob/631e50bf8e58a2d872598fdd2dac1b8d5ddf111d/docs/temp/2026-10-14_marketplace-repo-structure.md) (archived), section 8.

## Threat model

A Claude Code plugin you install can execute arbitrary code on your machine with your user privileges. Hooks, MCP servers, LSP servers and monitors run outside the sandbox. A skill can also steer the model: a poisoned skill can push an install of a malicious package, and a hook can rewrite permissions so that commands such as `curl` run without a prompt. Both attack classes have been documented against other marketplaces.

Consequences for this repo:

- Every plugin change is reviewed by a code owner before it reaches `main`.
- Consumers should read a plugin before installing it, and should pin or review updates for plugins they depend on.
- A release is public the moment it is tagged and pushed, so the review happens before the merge, not after.
- The eval runner (`scripts/run-evals.mjs`) runs `claude -p` with `acceptEdits`, a tool allowlist and a reduced environment, in a throwaway repo. It is still not a sandbox: the tests a run executes are code the model wrote. Details and the residual risk: [the evals README](../plugins/sdd-engineering/evals/README.md#isolation).

## Forbidden

A PR containing any of these is rejected.

- Secrets, API keys, tokens or passwords in any file. CI runs gitleaks.
- Absolute paths (user-home or Windows drive paths). Use `${CLAUDE_PLUGIN_ROOT}` or a path relative to the plugin.
- Runtime downloads in hooks or skills: `npx --yes`, `pip install`, `curl ... | sh`, or anything that fetches and runs code at use time. Ship the code in the plugin, or use a lockfile and a disclosed install step.
- Undisclosed telemetry or any network call not described in the plugin README.
- Ungated `UserPromptSubmit`, `PreToolUse` or `PostToolUse` hooks (no matcher, no early exit).
- Hooks that change permission decisions as a side effect.
- A description that does not match the behaviour.
- Symlinks that leave the repo.

## Secrets

If a plugin needs a credential, declare it in `userConfig` with `sensitive: true`. Claude Code stores the value in the OS credential store. In hooks, pass it through exec-form `args` or read `CLAUDE_PLUGIN_OPTION_<KEY>` from the environment; `${user_config.KEY}` is rejected in shell-form commands. Never write the value to a file in the plugin, and never print it.

## Report a vulnerability

Use GitHub private vulnerability reporting: on the repository page, Security, then "Report a vulnerability" (a private security advisory). Do not open a public issue for a vulnerability. Include the plugin name, the version, and the steps to reproduce.

## Incident runbook: a dangerous release

Use this when a released plugin version is broken, leaks data, or is malicious.

1. **Assess.** Which plugin and versions are affected? Is it a bug or malicious content? What can it reach (hooks, MCP, scripts)? Write the answer in a private security advisory draft.
2. **Fix forward.** Open a PR with a patch release (new `version` in `plugin.json`) or a rollback commit that restores the last good content and sets `version` back (see [RELEASES.md](RELEASES.md)). Merge, then tag with `claude plugin tag --push`.
3. **Malicious content only: force removal.** In `.claude-plugin/marketplace.json` add `"renames": { "<name>": null }` and set `"forceRemoveDeletedPlugins": true`. Claude Code then uninstalls the plugin at the next session start on consumers who refresh the marketplace.
4. **Delete the bad tag.** `git push origin :refs/tags/<plugin>--v<bad-version>` and `git tag -d <plugin>--v<bad-version>`. Dependency ranges must not resolve to it.
5. **Publish an advisory and a Release note.** Publish the GitHub security advisory. Edit or create the GitHub Release for the fixed version and state the affected versions, the impact and the fix.
6. **Remember the long tail.** Consumers without auto-update stay on the bad version until they run `claude plugin marketplace update` and `claude plugin update`. The advisory must tell them to do so, and in a project that sets `autoUpdate: true` the fix arrives on its own.

Rehearse steps 2 and 4 before you need them; the checklist is in [RELEASES.md](RELEASES.md).
