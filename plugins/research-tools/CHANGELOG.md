# Changelog

All notable changes to this plugin are listed here. Versions follow [SemVer](https://semver.org/); the format is close to [Keep a Changelog](https://keepachangelog.com/).

## 1.0.1 — 2026-10-14

### Security
- `researcher` combined WebFetch with NotebookLM write tools, so a prompt injection in a fetched page could make it copy repository content into a notebook. Removed `notebook_create`, `notebook_rename`, `source_add`, `source_rename`, `note` and `tag` from its `tools` list. It keeps listing, querying, reading sources and the research flow (`research_start`, which creates the notebook for new research, `research_status`, `research_import`).
- A patch, not a minor: the agent's job (answer a question with evidence, write nothing in the repo) is unchanged, and nothing in the documented usage relied on the removed tools. If you prompted the agent to add notes or sources to a notebook, do that yourself or from the main session.

## 1.0.0 — 2026-10-14

### Added
- Agent `researcher`: read-only research on one concrete question, from the repository or from external sources, with evidence and an explicit "Not found" list.
- Optional NotebookLM support through the `notebooklm-mcp` server. The agent only creates and adds there; it never deletes, shares or generates studio artifacts.
