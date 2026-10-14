# plugins/

Each plugin lives in its own subdirectory here: `plugins/<name>/`.

## Current catalog

The catalog is layered, so nothing forces you to adopt a whole workflow. `engineering-paved-path` and `research-tools` stand alone. `architecture-review` builds on the paved path. `sdd-engineering` builds on all three.

| Plugin | Ships | Depends on |
|---|---|---|
| `engineering-paved-path` | skills: `sdd-cascade`, `verify-done`, `engineering-insights`, `review-bundle`, `architecture-boundaries`, `security`, `mermaid-diagram`; script `agent-guard.py` | none |
| `research-tools` | agent: `researcher` | none |
| `architecture-review` | agent: `architecture-reviewer`; PreToolUse hook | `engineering-paved-path` `^1.0.0` |
| `sdd-engineering` | agents: `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier`; skills `run-plan`, `workflow-retro`; PreToolUse hook; evals | `engineering-paved-path`, `research-tools`, `architecture-review` (all `^1.0.0`) |

Dependency tree for the largest plugin:

```
sdd-engineering@1.0.0
├── engineering-paved-path@^1.0.0
├── research-tools@^1.0.0
└── architecture-review@^1.0.0
    └── engineering-paved-path@^1.0.0
```

Three entry points: install `engineering-paved-path` for the skills alone, `research-tools` for a researcher, or `sdd-engineering` and let its dependencies pull the rest. Each plugin's README has its own quick start.

### Hard vs runtime dependencies

`dependencies` in `plugin.json` declares what must be installed and enabled for the plugin to work. Claude Code resolves it at install time against release tags, and checks the semver range when the plugin loads. Use the object form, `{ "name": "...", "version": "^1.0.0" }`: the string form `name@marketplace@^1.0.0` silently ignores the range on Claude Code 2.1.296 (see the [dependency ADR](../docs/architecture-decisions/2026-10-14-plugin-dependency-form-and-ranges.md)).

An agent's `skills:` frontmatter is a separate, runtime concern. It lists skills whose text is injected into that agent when it starts, for example `engineering-paved-path:architecture-boundaries` in `architecture-reviewer`. A skill from another plugin must be written with its namespace. The two mechanisms work together: the dependency makes the skill exist, the `skills:` entry puts it in the agent's context.

Skills an agent may or may not need stay out of `skills:` and out of `dependencies`; the agent loads them through the `Skill` tool when they are installed.

## Adding a plugin

1. Create `plugins/<name>/` following the anatomy in [`../docs/PLUGIN-GUIDELINES.md`](../docs/PLUGIN-GUIDELINES.md). Besides `.claude-plugin/plugin.json` and the components, a plugin needs `README.md`, `CHANGELOG.md`, `COMPATIBILITY.md` and `LICENSE`.
2. Register it in [`../.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) (no `version` there).
3. Add an owner line in [`../CODEOWNERS`](../CODEOWNERS).
4. Add a row to the table above and to the root `README.md`.
5. Run `bash scripts/check.sh`.

Minimum a plugin needs:

```
plugins/<name>/
├── .claude-plugin/plugin.json      # name, version, description, author, homepage, repository, license
├── README.md
├── CHANGELOG.md                    # first "## x.y.z" heading equals plugin.json version
├── COMPATIBILITY.md                # a line such as "Claude Code >=2.1.110"
└── LICENSE
```

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for the full checklist and [`../docs/CATALOG-CONTRACTS.md`](../docs/CATALOG-CONTRACTS.md) for how the site reads these files.
