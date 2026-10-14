# Site spec (skeleton)

## Purpose

A GitHub Pages page that lets people browse the plugins in this marketplace. It is a catalog only, never an install source. Relative plugin sources work only when the marketplace is added from git, GitHub or a local path; a bare `marketplace.json` URL downloads that one file and every relative entry fails. The page therefore always shows the `/plugin marketplace add HlibHav/dev-digest-ai-marketplace` command and never a Pages URL to install from.

## Build

`scripts/build-index.mjs` reads `.claude-plugin/marketplace.json` and each `plugins/<name>/.claude-plugin/plugin.json` and writes `site/`. Fields from `plugin.json` win over the catalog entry. The `pages` workflow builds and deploys on changes to the catalog, any `plugin.json`, `site/**` or the script. Pages must be enabled once under Settings, Pages, Source: GitHub Actions.

## Sections

| Section | Content |
|---|---|
| Plugin list | TBD in lab step N |
| Plugin card (name, version, description, category, tags, dependencies) | TBD in lab step N |
| Install block (marketplace add and install commands, settings snippet) | TBD in lab step N |
| Trust notice | TBD in lab step N |
| Links (repo, README, SECURITY, RELEASES) | TBD in lab step N |
| Visual design | TBD in lab step N |

## Acceptance

- TBD in lab step N
