---
name: run-plan
description: Runs the implementation half of a spec-driven chain from an approved Implementation Plan. It starts implementer lanes level by level with a package gate, then plan-verifier, then architecture-review:architecture-reviewer, a conditional security review and /code-review in parallel, then a triaged fix loop of up to three rounds, then insights and close. spec-creator and implementation-planner are run by hand beforehand; this skill never writes a spec or a plan. Invoked only as `/sdd-engineering:run-plan <plan-path> [--prompt "…"] [--design <path>…] [--mode multi|single]`.
argument-hint: "<plan-path> [--prompt \"…\"] [--design <path>…] [--mode multi|single]"
disable-model-invocation: true
---

# /sdd-engineering:run-plan

You, the main session, run the chain. The agents (`sdd-engineering:implementer`,
`sdd-engineering:plan-verifier`, `architecture-review:architecture-reviewer`) are flat: none
starts another agent and none can ask the user, so you write every brief, relay every question
and keep the state. When this file and an agent's own definition disagree, the agent definition
wins and this file should be fixed.

**Out of scope.** `sdd-engineering:spec-creator` and `sdd-engineering:implementation-planner`
are run by hand, before this skill. It starts from a saved plan and never writes or rewrites a
spec, an acceptance criterion or a plan. When the chain finds that one of them is wrong, it
stops and says which agent to run, with what.

Each implementer writes its lane's red-first tests itself, test-first, under
`Red-first: implementer-owned`. No separate test-writer agent runs in this chain.

Three habits, each paid for by a real run:
- **Pass artifacts verbatim.** A subagent sees none of this conversation. A plan slice, a report
  or a finding goes into the brief as written, because a summary drops the line the agent needed.
- **Never paste a diff.** Reviewers read a bundle made by `/engineering-paved-path:review-bundle`.
- **Relay, don't answer.** An agent's question is the user's. Ask it with AskUserQuestion,
  carrying the agent's options and recommendation, and pass the answer back word for word.

## Step 0 — Inputs and gate

Parse `$ARGUMENTS`:

| Argument | Meaning | Check |
|---|---|---|
| `<plan-path>` (required) | `docs/plans/YYYY-MM-DD-<feature>.md` | exists, `Status: ready`; the spec it names is `approved` with no open `[NEEDS CLARIFICATION]` (a Direct change's no-spec intent is fine) |
| `--prompt "…"` | extra requirements or guidance from the user | classify it, below |
| `--design <path>…` | screenshots or exported frames | each path exists locally; a Figma or web URL means ask for an export, the agents read only the disk |
| `--mode multi\|single` | execution mode | must match the mode the plan was shaped for; the plan's mode is the default |

Stop and tell the user what to run instead when:
- the argument is a spec, an idea or a missing file: "run `sdd-engineering:implementation-planner`
  on the approved spec first" (or `sdd-engineering:spec-creator` when there is no approved spec);
- the plan is `needs-answers`, or its spec is still `draft`;
- `--mode` differs from the plan's shape: the planner re-plans in that mode.

**Check the read-only agents can run the plan's checks.** `plan-verifier` and
`architecture-review:architecture-reviewer` are read-only: their guard hook allows only read-only git and the
commands listed under `checkCommands` in the project's `.claude/agent-guard.json`. Read that
file and compare it with every check command the plan assigns to those two agents. For each one
that is not listed, tell the user which commands to add to `checkCommands` and wait; without
them the reviewers can only report those checks as unverifiable. Do this before Step 2 (at the
latest), and ideally now.

**Classify `--prompt`.** Guidance on *how* (naming, a library already in the plan, an order of
work, which design frame a UI step follows) goes into the briefs of the lanes it concerns.
Anything that changes *what* (a new or changed acceptance criterion, a new surface, contract or
endpoint) stops the chain: say "this changes the spec; run `sdd-engineering:spec-creator` in
update mode with this text, then the planner" and quote the part that does. Unsure: ask the user
which it is. Code that satisfies a requirement no spec states can't be verified, and that is how
scope drifts in unseen.

**Resume.** If `docs/plans/*-<feature>.state.md` exists, trust its stage after checking its head
sha against `git log`, and continue from there. Tell the user in one sentence where you resume.

**Branch.** The work belongs on the feature's own branch or worktree, named after the feature
(`feat/<feature-slug>`). If the current branch isn't the feature's, create one; ask the user for
the base, since the spec and plan may not be on the default branch yet.

Create the state file (template at the end) before Step 1.

## Step 1 — Implement

**Multi-agent.** Walk the plan's lane DAG level by level: a level is every lane whose `after:`
lanes are done.
1. Start one `sdd-engineering:implementer` per lane of the level, all in one message. Each brief
   holds: `Mode: lane <n>`, `Red-first: implementer-owned`, the plan's saved path, and the lane's
   slice copied verbatim: the header, *Constraints*, *Skills for the implementer*, the lane's
   *Lanes* row, its steps, the *Red-first* rows those steps turn green and the *Contracts & data*
   items they touch, plus the text of every `AC-N` those steps trace to, copied from the plan's
   *Acceptance criteria* section, never just the ids: an implementer given `AC-14` and nothing
   else builds from the step title and misses what the criterion actually says. Not the whole
   plan: a full plan is large and gets re-sent on every request of a lane.
   The lane's owned paths include the test files its *Red-first* rows name, even when the
   plan's *Lanes* row doesn't list them. Say so in the brief.
   Add the `--prompt` guidance and `--design` paths only to the lanes they concern (designs to
   the UI lanes that build the screens).
2. Read each report. `blocked` because the plan or the code disagrees: stop and tell the user to
   re-run the planner (or `spec-creator` in update mode) with the blocker quoted; don't patch
   around it. After each lane, run `git status` and compare the changed files with the lane's
   owned paths: a write outside them is a finding even when the report says `done`. A Red-first
   row with no failing run in the report's **Tests** table was not written test-first; send it
   back once. Read the report's **Skills applied**: a skill under "named by the plan but not
   invoked", or one the plan names that is missing from "invoked through Skill", with no line
   under **Deviations from plan**, makes the lane `partial`, so send it back in `Mode: fix`
   before the gate. The rule in the agent definition alone didn't hold: in several runs lanes
   claimed to apply skills "from the plan" without loading them.
3. **Package gate**, once the level is done: for each touched package, run its typecheck and
   unit suite as the project's CLAUDE.md or AGENTS.md lists them. If a package's change feeds
   another package (shared code, a contract), run the consumer's checks too. Architecture
   checks belong to the architecture reviewer, not to this gate.
   - **Expected red:** tests a *later* level turns green, and a consumer's typecheck after
     lane 0, each failing for the reason the plan gives. Record them in the state file.
   - **Any other red:** the owning lane (by owned paths) in `Mode: fix`. A failure in a file no
     lane owns is a plan gap: stop, planner.
   - **Green:** commit only the level's owned paths and the state file (not `git add -A`), and
     record each command, sha and result line under *Checks already run*.

**Single-agent.** Start one `sdd-engineering:implementer` with `Mode: whole plan`,
`Red-first: implementer-owned`, the plan's saved path and the whole plan verbatim (a
single-agent plan is short), plus the `--design` paths. Read its report as in step 2 above, then
run the package gate, commit and record it yourself. Don't execute the steps in the main
session: by Step 1 its context already holds the spec, the plan and every report, so each edit
re-reads all of it (one measured run spent three quarters of its tokens in the main session),
and nothing checks that the plan-named skills were loaded.

**Read the integration tests.** Before review, Read every integration test the implementers
added or changed. If the project's integration suite needs services the read-only reviewers
cannot start, plan-verifier cannot run it either; its brief may say "the main session has read
every integration test the implementers added or changed" only when that is true. Implementers
don't run such suites, so a `red-first integration` row has no red run; it is proven by a green
run alone, and you record that as an accepted gap.

## Step 2 — Review

1. Bundle once per head with `/engineering-paved-path:review-bundle`, base from
   `git merge-base HEAD origin/HEAD`, head `HEAD`, written to the scratchpad as
   `bundle-<sha>`.
2. **plan-verifier first** (`sdd-engineering:plan-verifier`). Brief: target range and head sha,
   bundle path, *Checks already run*, the full plan, every Implementation Report in full (the
   file text, never your summary of it), `Red-first: implementer-owned`, and the
   integration-test sentence (only if true). A condensed report drops the red-run rows, and the
   verifier then marks each affected criterion `partial` (one run produced 18 false `partial`
   verdicts this way). `gaps` go to the fix loop before any other review: an architecture review
   of unfinished code is wasted.
3. **Then in parallel**, one message:
   - `architecture-review:architecture-reviewer` with target, head sha, bundle path and
     *Checks already run*;
   - a security review, **only when** the diff touches a security surface: the project's
     `security-reviewer` agent if `.claude/agents/` has one, otherwise `/security-review`. Same
     inputs as the architecture reviewer;
   - `/code-review` on the same range, run by you, for correctness bugs.

   Security surfaces: request parsing and route handlers, queries and repositories, adapters to
   external services, secrets handling, prompt assembly for LLMs, rendering untrusted text,
   agent hooks, auth or tenancy scoping. Docs, styles and copy-only diffs skip the security
   review; record "security review: skipped — <why>" in the state file so the skip is visible.

## Step 3 — Fix loop

Give every finding a stable id that survives rounds (`PV-n` plan-verifier, `AR-n` architecture,
`SR-n` security, `CR-n` code-review) and put it in the state file's ledger. **Must close:**
`critical` and `major` findings, plan-verifier `not met` and `partial`, and `/code-review` bugs.
`minor` findings are fixed only when they sit in a lane already being fixed; the rest go to the
user at Step 4 as a list to accept or defer.

**Triage each finding before routing it**, because architecture findings often don't fit one lane:

| Kind | How you recognise it | Route |
|---|---|---|
| Local fix | the fix stays inside one lane's owned paths | that lane's implementer, `Mode: fix`, with `path:line` and its plan slice |
| Structural move | code must move between layers or files of different lanes, or a new port, adapter and test double is needed | one implementer in `Mode: fix` for the whole move, run alone, owning the union of the touched lanes' paths; findings listed in the order to apply them |
| Plan is wrong | the fix needs a step, file or contract the plan doesn't have | stop; the user re-runs the planner with the finding quoted |
| Spec is wrong | the finding contradicts or exposes a gap in an acceptance criterion | stop; the user re-runs `spec-creator` in update mode, then the planner |
| Accepted deviation | the user decides to keep it | an ADR in the project's ADR folder (default `docs/architecture-decisions/`), then the id is `accepted` in the ledger |

Fixes from different lanes run in parallel only when their paths don't overlap; a structural
move never runs beside another fix.

**After each round:** package gate, commit, then a delta bundle with
`/engineering-paved-path:review-bundle` over `<previous-head>...<new-head>` (not the
full-branch bundle, or the reviewer re-reviews everything), then re-review:
- the reviewer whose findings were fixed, with its previous findings by id and the delta range.
  It reports each id `closed` / `open` and reviews the delta for regressions; it does not
  re-review the whole branch;
- plan-verifier again when a structural move or any `PV-n` fix changed code, because moved code
  can break a plan item that was `met`;
- the security review when the round's changes touched a security surface, even if it had no
  findings before.

**Rounds and stopping.** At most **three** rounds. Stop early, and put the open ids to the user
with a recommendation for each, when:
- a round doesn't lower the number of open must-close findings, or
- an id marked `closed` comes back `open` (the fixes are oscillating).

## Step 4 — Close

- Run e2e when the plan lists it, with the project's e2e command; mind anything that rebuilds
  output a running dev server needs. `browser` criteria are yours to check, against the
  `--design` frames when given.
- Fill the spec's `## Traceability` step, test and commit columns. Offer the user
  `Status: implemented`; don't set it unasked.
- Open `minor` findings: one AskUserQuestion with fix now, defer (listed in the PR body) or accept.
- Collect every **Insight candidates** section and record them once through
  `/engineering-paved-path:engineering-insights`; no agent writes `INSIGHTS.md`.
- Push and open the PR only on the user's word.

## The state file

`docs/plans/YYYY-MM-DD-<feature>.state.md`, updated after every step, so a fresh chat resumes
with `/sdd-engineering:run-plan <plan-path>`:

```
# State: <feature>
Stage: <1 Implement | 2 Review | 3 Fix round n | 4 Close> · next: <the next action>
Spec: <path> (SPEC-…) · Plan: <path> · Mode: multi-agent | single-agent
Inputs: prompt <none | quoted guidance> · designs <paths | none>
Red-first: implementer-owned
Levels: <level → lanes → done | running | blocked>
Expected red: <test — level that turns it green>

## Checks already run
| check | command | head sha | result line |

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status (open / closed / accepted / deferred) | round closed |

## Log
- <date> — <what ran, its status>
```

## When something breaks

- Two artifacts disagree about the same head (the state file says a suite passed, a report says
  a test fails): settle it with one targeted run, and strike the wrong row from *Checks already
  run* so no reviewer is handed it as evidence.
- A report has no `Status:` or ignores its template: treat it as `partial`, re-run once with the
  template quoted back; a second failure goes to the user.
- An agent hits its budget (`partial`): re-run it with its report as the starting point.
- The user changes a requirement mid-chain: stop; it goes through `spec-creator` and the planner
  by hand, then `/sdd-engineering:run-plan` resumes from the state file.
