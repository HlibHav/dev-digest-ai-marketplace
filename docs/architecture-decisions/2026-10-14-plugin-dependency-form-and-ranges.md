---
status: accepted
date: 2026-10-14
decision-makers: [Glib]
scope: harness
---

# Plugin dependencies: object form with `^1.0.0` ranges, real copies of the guard script

## Context and Problem Statement

`sdd-engineering` and `architecture-review` depend on other plugins in this marketplace. Two
questions had no evidence behind them: does Claude Code enforce a semver range written in the
object form `{ "name": "x", "version": "^1.0.0" }` (a reference repo claims the version is
silently ignored), and does the `skills:` frontmatter of a plugin agent inject a skill that
lives in a dependency plugin. A third point is smaller: `scripts/agent-guard.py` was shared
between plugins by symlink, but a plugin is installed by copying its directory, and
`scripts/check-repo.mjs` forbids symlinks under `plugins/`.

## Decision Drivers

- A range that is silently ignored gives false safety.
- A plugin must work from the installed cache, with no path outside its own directory.
- Shared skills should live once, not be pasted into agent bodies.

## Considered Options

1. Object form `{ "name", "version": "^1.0.0" }`.
2. String form `"name@marketplace@^1.0.0"`.
3. Ranges with `~` (the earlier example) instead of `^`.

## Decision Outcome

Chosen: option 1 with `^1.0.0` ranges, because the experiment below shows that the object form
is enforced and the string form is not. The guard script is a real, byte-identical copy in each
plugin that runs it (`engineering-paved-path` is the canonical copy). Agents declare shared
skills in `skills:` with the namespaced name `engineering-paved-path:<skill>`.

### Experiment 1: which form is enforced (Claude Code 2.1.296)

Method: a clone of the repo with every plugin at `1.0.0`, local tags `<plugin>--v1.0.0`,
`sdd-engineering` depending on the other three at a deliberately unsatisfiable `^2.0.0`.

```
claude plugin marketplace add <clone> --scope project     # from <consumer>
claude plugin install sdd-engineering@dev-digest-ai-marketplace --scope project
claude plugin list --json
```

Object form, `^2.0.0`: the install reports success, then

```
sdd-engineering@dev-digest-ai-marketplace  errors: ['Requires "engineering-paved-path@dev-digest-ai-marketplace" ^2.0.0, installed 1.0.0']
Status: ✘ failed to load
```

String form `"engineering-paved-path@dev-digest-ai-marketplace@^2.0.0"`, same clone: all four plugins
load, `errors: None`. The range is dropped. Controls with a satisfied `^1.0.0` load in both forms.
`claude plugin validate --strict` passes all four variants, so validation does not catch the
difference. With no tags at all, a local-path marketplace still installs and resolves the range
against the version in `plugin.json`.

### Experiment 2: does `skills:` reach into a dependency plugin

Method: a scratch copy of two plugins, with a canary sentence appended to the dependency's skill,
a test agent in the other plugin declaring `skills: [engineering-paved-path:verify-done]`, run
with `claude -p --setting-sources project --strict-mcp-config --model haiku --plugin-dir ...`
and the main session asked to dispatch the agent and print its answer.

- Agent with the namespaced skill, `Read` allowed: quoted the canary line.
- Agent with the namespaced skill and no file tools at all (`disallowedTools: Read, Glob, Grep,
  Bash, ...`): quoted the canary line, so the text came from injected context, not from a file read.
- Control agent without `skills:` and the same tool ban: answered `NO-SKILL-CONTEXT`.

The namespaced form works, so agent bodies point at the skill instead of repeating it.

### Consequences

- Good: a dependency range is real; installing against an incompatible dependency version fails
  loudly.
- Good: shared rules live in one skill and reach every agent that lists it.
- Bad: three copies of `agent-guard.py` must stay identical; `check-repo` and the unit tests are
  the guard against drift.
- Bad: an unmet range still lets the install succeed and fails at load time, so the consumer sees
  the error in `claude plugin list`, not at install.

### Confirmation

`claude plugin list --json` in a consumer project shows no `Requires ...` error; a unit or
repo check compares the three script copies byte for byte.

## More Information

- Related, not superseded: [2026-10-14-native-plugin-release-tags.md](2026-10-14-native-plugin-release-tags.md)
  stays valid for the tag format; only its `~1.0.0` example range is now `^1.0.0`.
- https://code.claude.com/docs/en/plugins/dependencies
