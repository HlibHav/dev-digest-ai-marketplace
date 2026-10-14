---
status: accepted
date: 2026-10-14
decision-makers: [Glib]
scope: harness
---

# Protect `main` with a code-owner ruleset that admins can bypass

## Context and Problem Statement

The lab requires `CODEOWNERS` plus a ruleset that demands review by the owning team. The repo has
one owner, and GitHub does not let a PR author approve their own PR, so a strict code-owner rule
would block every change the owner makes.

## Considered Options

1. Ruleset on `main`: PR required, code-owner review required, `validate` check required; repository admins may bypass.
2. Add the course mentor as a collaborator and require their review with no bypass.
3. Ruleset in evaluate mode (reports violations, blocks nothing).

## Decision Outcome

Chosen option: 1, because it enforces the rule for every other author today, keeps the owner
unblocked, and becomes a real two-person rule as soon as a second owner is added to `CODEOWNERS`.

### Consequences

- Good: outside contributions cannot merge without owner review and a green `validate`.
- Bad: the owner's own merges are self-reviewed; the bypass is visible in the PR timeline only.

### Confirmation

`gh api repos/HlibHav/dev-digest-ai-marketplace/rulesets` shows the ruleset as active with the
code-owner rule, the `validate` status check and an admin bypass actor.

## More Information

- Research: `docs/temp/2026-10-14_marketplace-repo-structure.md` (section 9)
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
