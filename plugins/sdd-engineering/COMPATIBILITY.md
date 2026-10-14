# Compatibility

Claude Code >=2.1.110

Tested with Claude Code 2.1.296. 2.1.110 is the floor because it is the first release with version-constrained plugin dependencies. Every other row below is verified only on 2.1.296.

| Feature used | Minimum | Notes |
|---|---|---|
| Plugin dependencies with semver ranges (three plugins, all `^1.0.0`) | 2.1.110 | Object form `{ "name", "version" }`. The string form drops the range on 2.1.296. |
| Agent `skills:` preload of a dependency's namespaced skill | Tested on 2.1.296 | `spec-creator`, `implementation-planner` and `implementer` preload `engineering-paved-path:*` skills. |
| `${CLAUDE_PLUGIN_ROOT}` in a hook command | Tested on 2.1.296 | Resolves to this plugin's installed directory. |
| `${CLAUDE_SKILL_DIR}` in a skill | Tested on 2.1.296 | Used by `workflow-retro` to find `collect.py`. |
| PreToolUse hook that receives `agent_type` | Tested on 2.1.296 | The guard acts only for the named agents; other callers pass silently. |
| Skills with `disable-model-invocation` | Tested on 2.1.296 | `run-plan` and `workflow-retro` run only when you call them. |
| `gh` CLI | Optional | Only to open a PR at the end of `run-plan`. |
| Plugin manifest, `plugin.json` | Tested on 2.1.296 | Checked with `claude plugin validate --strict`. |
| `python3` for scripts | 3.9 | Standard library only. No `pip install`. |
| `git` | Any recent release | Needed by the review bundle, the guard's allowed commands and `git diff` based reviews. |
