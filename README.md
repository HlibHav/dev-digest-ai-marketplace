# dev-digest-ai-marketplace

A Claude Code plugin marketplace with the reusable harness extracted from DevDigest: shared engineering practices, a read-only researcher, an architecture reviewer and a spec-driven workflow that ties them together. It lives in its own repository because the DevDigest product and this harness have different owners and different release cadences. A product change should not force a plugin release, and a plugin fix should not need a product deploy.

## Plugins

| Plugin | Purpose | Depends on |
|---|---|---|
| `engineering-paved-path` | Shared engineering practices: verification gate, test-first done, scope discipline. | none |
| `research-tools` | Read-only researcher agent that answers a concrete question from the repo or the web with evidence. | none |
| `architecture-review` | Independent read-only architecture reviewer that checks a diff against layer boundaries. | none |
| `sdd-engineering` | Spec-driven workflow: idea to spec to plan, delegating research and architecture review. | `engineering-paved-path`, `research-tools`, `architecture-review` (all `~1.0.0`) |

## Install

Trust note: a plugin can run code on your machine with your user privileges (hooks, MCP servers, scripts). Read a plugin before you install it. See [docs/SECURITY.md](docs/SECURITY.md).

Add the marketplace and install a plugin:

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace
/plugin install sdd-engineering@dev-digest-ai-marketplace
```

Installing `sdd-engineering` also installs its three dependencies.

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
│       └── README.md
├── docs/
│   ├── PLUGIN-GUIDELINES.md          # authoring rules
│   ├── SECURITY.md                   # threat model, reporting, incident runbook
│   ├── RELEASES.md                   # versions, tags, rollback
│   ├── SITE-SPEC.md                  # GitHub Pages catalog (skeleton)
│   ├── COST-BASELINE.md              # token cost baseline (skeleton)
│   ├── architecture-decisions/       # ADRs
│   ├── design/                       # catalog design brief, hand-off, tokens
│   └── temp/                         # working notes, deleted after the plugins are built
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
