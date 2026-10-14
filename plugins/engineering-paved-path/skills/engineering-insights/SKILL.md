---
name: engineering-insights
description: Reads and records module-local lessons in INSIGHTS.md files that sit next to the code. Use at the start of any task that touches a package or module, to read its INSIGHTS.md before working; at the end of any non-trivial task, to record what was learned; and mid-task when something non-obvious surfaces (a user correction, an abandoned approach, a surprising tool behavior). Also use on "insights", "wrap up", "what did we learn", "record this", even if the user does not name the file.
---

# engineering-insights

An `INSIGHTS.md` is a short, dated log of things a future session cannot see by reading the code. It lives in the root of the package or module it describes. Reading it first saves re-learning a dead end; recording into it keeps the lesson for the next session.

## Steps

1. **Discover, then read.** Once the request is known and before any work, find the module the task touches and its `INSIGHTS.md`: walk up from the touched code to the nearest ancestor directory that has one ([reference.md](reference.md), *Finding the file*). Read it in full, then state which file you read plus up to 3 entries that bear on the task, or "nothing relevant". No file found: read nothing and move on.
2. **Collect as you go.** When something non-obvious surfaces (a user correction, a failed approach, a repeated error, a surprising tool behavior, an undocumented convention), note it as a candidate. Record only what the session confirmed; an unconfirmed hunch goes to `Open Questions`.
3. **Gate at the end.** Drop a candidate that is obvious to anyone reading the code, too generic to act on cold, or already in `CLAUDE.md`, `.claude/rules/` or `docs/`. Nothing left: say "nothing worth recording" and stop.
4. **Re-read, then compare.** Read the file again right before writing; it may have changed since step 1. A candidate already covered adds nothing, unless this session refined, contradicted, or confirmed that entry with new evidence: then comment under it with a dated sub-bullet. "Still true" alone is not a comment.
5. **Insert, never overwrite.** Existing text stays byte-for-byte: no edit, delete, reorder, or new heading. Follow *Writing safely* in [reference.md](reference.md): one-line Edit anchors, never Write or a shell command on the file, and a before/after diff that proves no line was lost.
6. **Cap:** at most 3 entries or comments per session, plus one `Session Notes` line when you added any. Every line you write, the `Session Notes` line included, carries a date and `Evidence: path:line`.
7. **Report** one line per entry written or skipped, then stop.

## No INSIGHTS.md yet

If the task touched a package and a lesson passed the gate in step 3, offer to create `INSIGHTS.md` in that package's root with the sections from [reference.md](reference.md), and wait for a yes. Create it only on that yes; never create one unprompted and never at the repo root for a task that concerns one package.
