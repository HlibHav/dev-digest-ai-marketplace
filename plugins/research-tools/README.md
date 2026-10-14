# research-tools

Read-only researcher agent that answers a concrete question from the repo or the web with evidence.

The agent asks clarifying questions when the brief has no concrete question. Otherwise it routes the question to repo research or external research, cites `path:line` or a source for every claim, and lists what it could not find. NotebookLM is used when you have a NotebookLM MCP server; without one it researches with the web only.

## What it provides

| Name | Kind | What it does |
|---|---|---|
| `research-tools:researcher` | agent | Read-only research on one question. Returns a report with the answer, confidence, findings with evidence, related files, a "Not found" list and open questions. External reports add conflicts and a "do not cite" list. |

## Quick start

```
/plugin marketplace add HlibHav/dev-digest-ai-marketplace
/plugin install research-tools@dev-digest-ai-marketplace --scope project
```

Or from a shell:

```
claude plugin marketplace add HlibHav/dev-digest-ai-marketplace
claude plugin install research-tools@dev-digest-ai-marketplace --scope project
```

Then try: `Use research-tools:researcher to find out how authentication is wired in this repo and where sessions are validated.`

## Usage

**Repo question.** Ask the agent a concrete question about the code:

```
Use research-tools:researcher: where do we retry failed HTTP calls, and which of them have a timeout?
```

It reads, in this order, the touched package's `INSIGHTS.md` (if any), its `docs/` and `specs/`, `CLAUDE.md` / `AGENTS.md`, then code. Where those files don't exist it goes straight to code. The reply is a report: a two-to-three sentence answer, confidence with a reason, numbered findings (`claim - path:line - "short quote"`), related files, what it searched for and did not find, and open questions for you.

**External question.** Ask for facts that live outside the repo:

```
Use research-tools:researcher: compare the license terms of library A and library B for commercial use.
```

The report lists what existing notebooks already answered, what new research added, findings with links, conflicts between sources, and sources it advises you not to cite.

**No concrete question.** "Look into the build" returns clarifying questions instead of a guess.

The agent returns the report to the caller and saves nothing. If you want it kept, save it yourself; the suggested path is `docs/research/YYYY-MM-DD-<topic>.md`. Budget: at most 150 tool calls or 45 minutes; on hitting it the agent returns what it has and marks the unfinished parts under "Not found".

## Dependencies

None. `sdd-engineering` depends on this plugin (`^1.0.0`): its `spec-creator` returns research requests that the main session hands to `research-tools:researcher`. Without it those requests have no agent to go to.

## What your project should declare

Nothing is required. Helpful, if present: `INSIGHTS.md` in package roots, `docs/` and `specs/` folders, `CLAUDE.md` / `AGENTS.md`. When none exist, the agent works from code alone and says what it could not find.

## Hooks

None. The agent is read-only because its `tools` list has no Write, Edit or Bash. The plugin itself makes no network calls. The agent's WebSearch and WebFetch tools, and the NotebookLM server it may use, do reach the network.

## External tools

- Optional: a NotebookLM MCP server named `notebooklm-mcp`. The agent's `tools` list names the NotebookLM tools it may use one by one: query, research, create and add. There are no delete, share or studio tools in the list. With no such server those names grant nothing and the agent is web-only. On a NotebookLM auth error the agent stops using it and tells you to re-authenticate that server.
- Web access through the agent's WebSearch and WebFetch tools.

## Compatibility

Claude Code `>=2.1.110`. Details in [COMPATIBILITY.md](COMPATIBILITY.md).

## Troubleshooting

- `claude plugin list --json` shows `dependency-unsatisfied`, `range-conflict` or `no-matching-tag` for `sdd-engineering` and names this plugin: install or update `research-tools` to a `1.x` version, or check that the `research-tools--v1.0.0` tag exists, then run `/reload-plugins`.
- The agent says NotebookLM is unavailable: connect the `notebooklm-mcp` server and sign in, or ignore it; the web path still works.
- The agent replies with questions instead of a report: the brief had no concrete question. Name the thing to find and where to look.

## Local development

```
claude --plugin-dir ./plugins/research-tools
```

Run `/reload-plugins` after each edit.

## Versioning

SemVer. See [CHANGELOG.md](CHANGELOG.md).

## Provenance

Derived from an internal spec-driven development harness and generalized for any repository.
