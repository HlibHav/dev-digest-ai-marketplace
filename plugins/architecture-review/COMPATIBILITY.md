# Compatibility

Claude Code >=2.1.110

Tested with Claude Code 2.1.296. 2.1.110 is the floor because it is the first release with version-constrained plugin dependencies. Every other row below is verified only on 2.1.296.

| Feature used | Minimum | Notes |
|---|---|---|
| Plugin dependencies with semver ranges (`engineering-paved-path` `^1.0.0`) | 2.1.110 | Object form `{ "name", "version" }`. The string form drops the range on 2.1.296. |
| Agent `skills:` preload of a dependency's namespaced skill | Tested on 2.1.296 | `engineering-paved-path:architecture-boundaries`. See the dependency ADR in the marketplace repo. |
| `${CLAUDE_PLUGIN_ROOT}` in a hook command | Tested on 2.1.296 | Resolves to this plugin's installed directory. |
| PreToolUse hook that receives `agent_type` | Tested on 2.1.296 | The guard acts only for the named agent; other callers pass silently. |
| Plugin manifest, `plugin.json` | Tested on 2.1.296 | Checked with `claude plugin validate --strict`. |
| `python3` for scripts | 3.9 | Standard library only. No `pip install`. |
| `git` | Any recent release | Needed by the review bundle, the guard's allowed commands and `git diff` based reviews. |
