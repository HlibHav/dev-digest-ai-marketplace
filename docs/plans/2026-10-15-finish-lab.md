# Plan: finish the marketplace lab

Status: ready. Written 2026-10-14, after PR #4 merged as `8e45711`. Start a NEW Claude Code session
**inside this repo**: the DevDigest session's write-scope hook blocks implementer/test-writer agents
here.

## Where things stand

| Item | State |
|---|---|
| Four plugins | On `main`. `research-tools` is at 1.0.0. `engineering-paved-path`, `architecture-review` and `sdd-engineering` are at **1.0.1** (guard security fix). |
| Tags | `<plugin>--v1.0.0` for all four, on `032763b`, which is in `main`. **No 1.0.1 tags.** |
| GitHub Releases | None. |
| Catalog | Live on Pages. Card flip for trust and cost. Strings in `site-src/i18n/messages.en.json`. |
| CI | `validate` (check.sh --no-build), `Build catalog site`, `e2e`, plus `evals.yml` (dispatch only). |
| Evals | `node scripts/run-evals.mjs`: 7 cases, isolated from `~/.claude`. Last full haiku run 6/7, final-tree negative and spec runs 5/5. |
| Decisions | `docs/architecture-decisions/`. Object-form `^` dependencies (the string form drops the range on CLI 2.1.296). Real guard copies. `skills:` preload. |

Lab brief steps still open: 8 (cost), 9 (release), 10 (install elsewhere, **postponed by Glib**),
11 (1.1.0 + rollback). The follow-ups from the PR #4 review are open too.

## Ground rules for the session

- Node: `export PATH="/opt/homebrew/bin:$PATH"` (the default node is Anaconda v20).
- One branch and one PR per phase: `fix/…`, `feat/…`, `docs/…`. `bash scripts/check.sh` is green before every push.
- Merging: `gh pr merge --admin` is blocked by the auto-mode classifier ("Merge Without Review"). Run the review agents, post their summary on the PR, then ask Glib to merge with `--merge` (never squash a commit that carries a tag).
- Tags and releases are public and permanent. Confirm with Glib before each `claude plugin tag --push` and `gh release create`.
- Dependencies are released first. Tag order: `engineering-paved-path`, `research-tools`, `architecture-review`, `sdd-engineering`.
- Every subagent brief carries a budget: ≤150 tool calls or 45 min.

## Phase 1: review follow-ups (one PR: `fix/review-followups`)

From the review comment on PR #4 (`#issuecomment-6172069258`):

1. `research-tools:researcher` has WebFetch and NotebookLM write tools (`notebook_create`, `source_add`, `note`, `tag`), so it can be prompt-injected into exfiltration. Keep read and query tools and the research flow (`research_start`, `research_status`, `research_import`). Drop `notebook_create`, `source_add`, `note` and `tag`, or move them behind an explicit "write" mode the caller asks for. Bump research-tools to **1.0.1 or 1.1.0** (removing tools is behaviour-narrowing, decide and note it in the CHANGELOG). Done in phase 1: **1.0.1**, as a `### Security` patch (see its CHANGELOG).
2. `scripts/run-evals.mjs` uses `--permission-mode bypassPermissions`. Pass a minimal `env` (no inherited secrets except auth) and try `acceptEdits` plus an allowlist first; if bypass stays, document it in `evals/README.md` and SECURITY.md as a known risk. Clean up the temp dir in a `finally`, and use `lstat` in `snapshotFiles`.
3. Pin GitHub Actions to commit SHAs in `validate.yml`, `pages.yml` and `evals.yml` (keep the tag in a comment).
4. `review-bundle.sh` must refuse an empty out-dir, `/`, or a path outside the repo's `.tmp`/temp before `rm -rf`.
5. `agent-guard.py`: document fail-open on malformed input in the README hooks section; `specs/` at any depth is acceptable but write it down.
6. `check-repo.mjs` fails on an unknown flag or on `--root` with no value.
7. The e2e "a card glows on keyboard focus" test is CI-flaky. Find the cause (likely canvas `webgpu` on Linux headless). Fix the test or the wait; don't add retries.

Gate: `check.sh`, e2e, the security-reviewer agent re-run on the diff. The guard copies must stay byte-identical (check-repo enforces it).

## Phase 2: release what is on main (lab step 9)

1. CHANGELOG review: 1.0.0 and 1.0.1 entries must match what shipped.
2. GitHub Releases for the existing 1.0.0 tags: `gh release create <plugin>--v1.0.0 --title "<plugin>@1.0.0" --notes-file <changelog excerpt>`. Run it in tag order.
3. Tag 1.0.1 for all four plugins (the three guard plugins, and `research-tools` after phase 1 removed its NotebookLM write tools) from a clean `main` checkout, after CI is green, in the tag order above. In each plugin directory run `claude plugin tag --dry-run` and then `--push`. Then create the Releases. Mark 1.0.0 as superseded for security in its release notes.
4. Install check from a temp project (not a real one; step 10 waits):
   `claude plugin marketplace add HlibHav/dev-digest-ai-marketplace --scope project` → `claude plugin install sdd-engineering@dev-digest-ai-marketplace --scope project` → `claude plugin list --json`. Expect no `dependency-unsatisfied`, `range-conflict` or `no-matching-tag`. Uninstall and remove afterwards.

## Phase 3: cost baseline and one optimization (lab step 8, PR `docs/cost-baseline`)

1. Fixed scenario: the "spec and plan for a small feature" cases in `plugins/sdd-engineering/evals/cases.json`, ideally `spec-creator-writes-spec` and `planner-uses-existing-spec`.
2. Baseline: `node scripts/run-evals.mjs --cases spec-creator-writes-spec,planner-uses-existing-spec --model <one model> --repeat 5`. Keep the model fixed; sonnet is closer to real use than haiku, and the budget is about $5 (ask Glib).
3. Fill in `docs/COST-BASELINE.md`, replacing the skeleton: plugin versions and commit SHA, model, input/output/cache tokens, API and tool calls, median cost and latency, pass rate, critical errors. Also add the per-plugin always-loaded cost from the site's cost estimator.
4. One optimization: remove instructions duplicated between agent prompts and the preloaded skills (spec-creator vs `sdd-cascade`/`security`/`mermaid-diagram`; implementer and planner vs `architecture-boundaries`). Change nothing else: not the model, not the routing.
5. Rerun the same command. The optimization passes only if the quality gate stays green, no new critical false negatives appear and cost or latency really drops. If the difference is within noise, write that down; don't invent a saving.
6. A prompt change is a patch bump for the plugins touched, with a CHANGELOG entry.

## Phase 4: 1.1.0 (lab step 11, PR `feat/spec-ac-gate`)

1. `spec-creator` must not finish a spec until every mandatory requirement has an acceptance criterion. Change the agent instruction.
2. Add an eval case where a requirement has no AC: the spec must stay `[NEEDS CLARIFICATION]` or the run returns needs-answers, never a finished spec.
3. Run old and new evals. Add a CHANGELOG `## 1.1.0` entry and bump `sdd-engineering` to **1.1.0** (minor).
4. After merge (Glib), tag `sdd-engineering--v1.1.0` and create its Release.
5. Update check from the temp project: `claude plugin marketplace update dev-digest-ai-marketplace` → `claude plugin update sdd-engineering@dev-digest-ai-marketplace --scope project` → `/reload-plugins` → rerun the scenario. Telemetry shows 1.1.0, and a spec without an AC does not pass.

## Phase 5: stable channel and rollback rehearsal (lab step 11, PR `docs/rollback`)

`docs/RELEASES.md` currently describes rollback as "move forward" plus an emergency pin. The lab also asks for a rehearsed stable channel.

1. The stable channel is the catalog pinned to the last good tag. All four plugins on that commit are 1.0.x:
   `claude plugin marketplace add HlibHav/dev-digest-ai-marketplace#sdd-engineering--v1.0.1 --scope project`.
   Both channels use the same catalog name, so remove the current one first. There is no `plugin rollback` command; don't invent one.
2. Rehearse in a temp project:
   1. Remove the latest channel.
   2. Add the stable channel.
   3. Install `sdd-engineering`.
   4. Run `/reload-plugins`.
   5. Run the smoke eval with `run-evals --cases negative`.
   6. Check that `claude plugin list --json` shows 1.0.x.
   7. Switch back to latest.
   Check that plugin data (`~/.claude/plugins/data/...`) survives. These plugins change no external state; say so.
3. Record the exact command sequence and its output in RELEASES.md: replace "Release channels (optional, not set up)" and tick the Rehearsal checklist.

## Phase 6, later (Glib decides when): install in another project (lab step 10)

Use an existing repo that has its own CLAUDE.md and test commands, and no local copies of SDD agents or skills. Check all 11 points from the brief, among them:
- the spec lands in the documented path;
- `run-plan` dispatches `implementer`;
- `researcher` and `architecture-reviewer` are available;
- `workflow-retro` runs only by hand, with `${CLAUDE_SKILL_DIR}`;
- the project's own instructions are not overridden;
- the project lists its check commands in `.claude/agent-guard.json`.

## End-of-lab checklist (from the brief)

- [ ] Marketplace separate from DevDigest; contribution, security, releases and cost docs filled in
- [ ] Four plugins with their own boundaries, owners and versions; dependencies resolve without errors
- [ ] Pages catalog shows current versions, dependencies and READMEs
- [ ] `architecture-reviewer` free of project-specific paths; `sdd-engineering` uses namespaced dependencies
- [ ] Validation, behaviour evals and negative evals green
- [ ] 1.0.x installs in another existing project (phase 6)
- [ ] Supporting files and scripts survive the plugin cache
- [ ] Cost experiment with baseline, quality gate and an honest result
- [ ] Catalog update and plugin update checked separately
- [ ] 1.1.0 behaviour confirmed by an eval
- [ ] Stable channel returns 1.0.x and the smoke eval passes
