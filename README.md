# dev-digest-ai-marketplace

A Claude Code plugin marketplace with a reusable harness for spec-driven development: shared engineering practices, a read-only researcher, an architecture reviewer and a spec-driven workflow that ties them together. The plugins are derived from an internal harness and generalized for any repository. They read your project's own commands and rules instead of assuming a stack.

## Plugins

| Plugin | Purpose | Depends on |
|---|---|---|
| `engineering-paved-path` | Shared engineering practices: done gate, spec-tier guide, module insights, review bundle and the agent guard script. | none |
| `research-tools` | Read-only researcher agent that answers a concrete question from the repo or the web with evidence. | none |
| `architecture-review` | Independent read-only architecture reviewer that checks a diff against layer boundaries. | `engineering-paved-path` (`^1.0.0`) |
| `sdd-engineering` | Spec-driven workflow: idea to spec to plan, delegating research and architecture review. | `engineering-paved-path`, `research-tools`, `architecture-review` (all `^1.0.0`) |

## Install

Trust note: a plugin can run code on your machine with your user privileges (hooks, MCP servers, scripts). Read a plugin before you install it. See [docs/SECURITY.md](docs/SECURITY.md).

Add the marketplace and install a plugin:

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace
/plugin install sdd-engineering@dev-digest-ai-marketplace
```

Installing `sdd-engineering` also installs its dependencies:

```
sdd-engineering@1.0.0
├── engineering-paved-path@^1.0.0
├── research-tools@^1.0.0
└── architecture-review@^1.0.0
    └── engineering-paved-path@^1.0.0
```

To install into one project from a shell, add `--scope project`:

```
claude plugin marketplace add HlibHav/dev-digest-ai-marketplace
claude plugin install sdd-engineering@dev-digest-ai-marketplace --scope project
```

Each plugin's README has a quick start, usage examples and the files your project should declare. Start with [plugins/README.md](plugins/README.md).

Release state: all four plugins are prepared at 1.0.0 and not yet tagged. Dependency ranges resolve against release tags, so until the tags exist `claude plugin list` reports `sdd-engineering` and `architecture-review` with an unmet dependency. See [docs/RELEASES.md](docs/RELEASES.md).

To enable the plugin for everyone who opens a project, commit this to the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "dev-digest-ai-marketplace": {
      "source": { "source": "github", "repo": "HlibHav/dev-digest-ai-marketplace" }
    }
  },
  "enabledPlugins": {
    "sdd-engineering@dev-digest-ai-marketplace": true
  }
}
```

This takes effect after each teammate accepts the workspace trust dialog. To update later, see [docs/RELEASES.md](docs/RELEASES.md).

## Repository layout

```
.
├── .claude-plugin/marketplace.json   # the catalog
├── plugins/
│   └── <name>/                       # one directory per plugin
│       ├── .claude-plugin/plugin.json
│       ├── skills/ agents/ commands/ hooks/ scripts/
│       ├── README.md
│       ├── CHANGELOG.md
│       ├── COMPATIBILITY.md
│       └── LICENSE
├── docs/
│   ├── PLUGIN-GUIDELINES.md          # authoring rules
│   ├── SECURITY.md                   # threat model, reporting, incident runbook
│   ├── RELEASES.md                   # versions, tags, rollback
│   ├── SITE-SPEC.md                  # GitHub Pages catalog (skeleton)
│   ├── COST-BASELINE.md              # token cost baseline (skeleton)
│   ├── architecture-decisions/       # ADRs
│   └── design/                       # catalog design brief, hand-off, tokens
├── site-src/                         # browser code and styles bundled into the site
├── data/                             # curated search data (dictionary, stop words)
├── test/                             # unit, integration and e2e tests
├── scripts/                          # check.sh, check-repo.mjs, build-index.mjs, lib/
├── .github/workflows/                # validate, pages
├── CODEOWNERS
├── CONTRIBUTING.md
└── LICENSE
```

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Deeper rules are in [docs/PLUGIN-GUIDELINES.md](docs/PLUGIN-GUIDELINES.md). Decisions behind the repo structure are in [docs/architecture-decisions](docs/architecture-decisions/README.md).

## Documentation

- [Plugin guidelines](docs/PLUGIN-GUIDELINES.md)
- [Security](docs/SECURITY.md)
- [Releases](docs/RELEASES.md)
- [Site spec](docs/SITE-SPEC.md) (catalog search: [SPEC-2026-10-14-catalog-search](specs/SPEC-2026-10-14-catalog-search.md))
- [Cost baseline](docs/COST-BASELINE.md)

## License

[MIT](LICENSE).
