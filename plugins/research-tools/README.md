# research-tools

Read-only researcher agent that answers a concrete question from the repo or the web with evidence.

It asks clarifying questions when the brief has no concrete question, routes the question to repo research or external research, cites `path:line` or sources for every claim, and lists what it could not find. NotebookLM is used when you have a NotebookLM MCP server; otherwise it researches with the web only.

## Components

| Name | Kind | What it does |
|---|---|---|
| `research-tools:researcher` | agent | Read-only research on one question. Returns a report with answer, confidence, findings with evidence, conflicts, a "Not found" list and open questions. |

## Dependencies

None.

## Requirements on your project

Nothing is required. For repo research the agent reads, in this order, the touched package's `INSIGHTS.md` (if any), its `docs/` and `specs/`, `CLAUDE.md` / `AGENTS.md`, then code. Where those files don't exist it goes straight to code. Findings are returned to the caller, not saved; the suggested path is `docs/research/YYYY-MM-DD-<topic>.md`.

## Hooks

None. The agent is read-only because it has no Write, Edit or Bash tool. No network calls from the plugin itself; the agent's WebSearch and WebFetch tools and the NotebookLM server it may use do reach the network.

## External tools

- Optional: a NotebookLM MCP server named `notebooklm-mcp`. The agent's `tools` list names the NotebookLM tools it may use one by one (query, research, create and add; no delete, share or studio tools); with no such server those names grant nothing and the agent is web-only. When NotebookLM reports an auth error the agent stops using it and tells you to re-authenticate that server. It only creates and adds (notebooks, sources, imports, notes, tags); it never deletes, shares or generates studio artifacts.

## Install

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace
/plugin install research-tools@dev-digest-ai-marketplace
```

Local development:

```
claude --plugin-dir plugins/research-tools
```

## Provenance

Extracted from the DevDigest `researcher` agent; project paths, the NotebookLM CLI login path and the global research-gate rule file were removed, and the gate is restated inside the agent.
