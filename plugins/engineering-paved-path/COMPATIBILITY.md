# Compatibility

Claude Code >=2.1.110

Tested with Claude Code 2.1.296. 2.1.110 is the floor because it is the first release with version-constrained plugin dependencies. Every other row below is verified only on 2.1.296.

| Feature used | Minimum | Notes |
|---|---|---|
| `${CLAUDE_SKILL_DIR}` in a skill | Tested on 2.1.296 | Used by `review-bundle` to find its script. |
| Skills preloaded by other plugins' agents through `skills:` | Tested on 2.1.296 | Agents in `architecture-review` and `sdd-engineering` name these skills as `engineering-paved-path:<skill>`. Tested on 2.1.296. |
| Plugin manifest, `plugin.json` | Tested on 2.1.296 | Checked with `claude plugin validate --strict`. |
| `python3` for scripts | 3.9 | Standard library only. No `pip install`. |
| `git` | Any recent release | Needed by the review bundle, the guard's allowed commands and `git diff` based reviews. |
