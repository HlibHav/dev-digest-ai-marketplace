---
name: verify-done
description: The done gate. Before saying a task is finished, fixed, working or ready to merge, find the project's own check commands, run the ones the change touches, and quote each command with its result line. Use before any "done", "fixed", "works" or "ready" claim, before a commit or PR, when asked "is it done?", "did you check?", "can we merge?", and whenever a check turns red. Use it even for small changes; a claim from reading a diff is not a verification.
---

# verify-done

"Done" is a claim about behaviour, and a diff only shows intent. The gate exists so the claim rests on a command that ran, not on how the code looks.

## 1. Find the checks

Never guess a command. Look, in this order:

1. The check or test section of `CLAUDE.md` / `AGENTS.md` (root, then the touched package's).
2. `package.json` scripts, `Makefile` or `justfile` targets, `pyproject.toml` tool config, CI workflow steps.
3. `.claude/agent-guard.json` `checkCommands`, if present: the project's declared list.

Nothing found: say the checks are unknown, ask which to run, and do not report done.

## 2. Run what the change touches

Pick the commands for the packages and file types you changed: typecheck, lint, unit tests, and any integration or e2e suite the change can break. Run them from the directory the project says. Skip a command only when it clearly cannot be affected, and name the skip.

## 3. Quote the evidence

For each command give the command and its result line, copied from the output:

```
npm test  ->  Tests: 42 passed, 42 total
npm run typecheck  ->  exit 0, no errors
```

Red, flaky, or not run is a result too; report it as is. A red result means not done: fix it and rerun, or report it as the blocker. Do not weaken, skip or delete a test to turn it green.

## 4. Done means a test that flipped

For a behaviour change, done is a test that failed before the change and passes after it. Write it first, watch it fail for the right reason, then implement. A bug fix without such a test is a guess that the bug is gone. A pure refactor needs the existing suite green and no new test.

## 5. Hold the scope

Do what was asked. When you notice something worth doing beyond it, list it under "left out" in the report instead of doing it. Extras make the diff harder to verify and are the usual cause of "done, but".

## Report shape

One short block: what changed, each command with its result line, anything not run and why, anything left out. No claim without a line above it.

## Note for read-only subagents

Read-only subagents guarded by agent-guard run only commands listed in `.claude/agent-guard.json` under `checkCommands`. List the project's check commands there so a verifier can run them.
