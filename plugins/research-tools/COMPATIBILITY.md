# Compatibility

Claude Code >=2.1.110

Tested with Claude Code 2.1.296. 2.1.110 is the floor because it is the first release with version-constrained plugin dependencies. Every other row below is verified only on 2.1.296.

| Feature used | Minimum | Notes |
|---|---|---|
| Agent `tools` list naming MCP tools | Tested on 2.1.296 | Names for a server that is not connected grant nothing; the agent falls back to web search. |
| Optional NotebookLM MCP server `notebooklm-mcp` | Any | Only when you want NotebookLM research. |
| Plugin manifest, `plugin.json` | Tested on 2.1.296 | Checked with `claude plugin validate --strict`. |
| `python3` for scripts | 3.9 | Standard library only. No `pip install`. |
| `git` | Any recent release | Needed by the review bundle, the guard's allowed commands and `git diff` based reviews. |
