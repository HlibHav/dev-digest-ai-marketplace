---
name: architecture-boundaries
description: Decides which layer a piece of code belongs in and which way imports may point, for any backend or frontend codebase. Covers layering (entry point to service to domain), ports and adapters at the edge, inward-only imports, no adapter call inside an entry handler, and frontend placement (colocate first, promote to shared on the second consumer, downhill imports only). The project's own declared rules always override these defaults. Use before adding or moving code - a new endpoint, module, service, integration, background job, component, hook or shared folder - when deciding where something goes, when a file outgrows its folder, when reviewing a diff's structure, and on "where does this go", "which layer", "ports and adapters", "hexagonal", "onion", "clean architecture", "import direction", "circular dependency", "promote to shared".
---

# architecture-boundaries

Good boundaries make code testable without its infrastructure and keep a change local to one place. This skill gives defaults for deciding where code goes. It is a fallback: **what the project itself has declared wins**, so look for that first.

## 1. Find the project's own rules first

Read, in this order, and note the file of every rule you will rely on:

1. `CLAUDE.md` / `AGENTS.md` at the root and in the package you touch.
2. `.claude/rules/` and any architecture or layering skill in `.claude/skills/`.
3. Decision records (`docs/architecture-decisions/`, `decisions/`, `adr/`): grep for the area you touch.
4. A boundary lint config, if the project has one (for example an import-linter, ESLint boundaries or ArchUnit config). Its rules are the ground truth for what it covers.
5. A neighbouring module that already solves the same problem. Copy its shape.

Where a project rule and a default below disagree, follow the project rule and say which file it came from. Where the project has no rule, use the defaults and label them as defaults when you report. A project may also record violations it has not fixed yet (a baseline, a "known violations" or "grandfathered" list). That code binds nobody: do not copy it and do not migrate it unless asked.

## 2. Name the layer before writing code

Describe in one line which layer the change belongs to. The usual shape, with names varying by project:

| Layer | Holds | May depend on |
|---|---|---|
| Entry (route, controller, CLI command, job handler, UI page) | parse input, call one service, map the result to a response | services, contracts |
| Service (application) | use cases, orchestration, transactions | domain, ports |
| Domain | rules, calculations, entities, pure functions | nothing outside itself |
| Ports | interfaces the application needs from the outside world | domain types |
| Adapters (infrastructure) | database, HTTP clients, queues, file system, vendor SDKs | ports, domain |
| Composition root | builds adapters and services and wires them together | everything |

If the project uses other names, map them onto this table rather than renaming anything.

## 3. Defaults

1. **Imports point inward.** Entry and adapters depend on services and domain; domain depends on nothing outer. No framework, ORM or SDK import in domain code.
2. **An entry handler parses, calls a service and maps the result.** It runs no query and calls no adapter directly, neither as an import nor through a container, helper or re-export. Anything more cannot be reused by a job or tested without the web framework.
3. **New I/O is port, adapter, test double.** The interface lives where the application can see it, the implementation in the adapter layer (the only place a vendor SDK is imported), and a fake for tests. An adapter without a fake is unfinished. Secrets and configuration come through the composition root, not from scattered environment reads.
4. **A service receives the ports it uses, not the whole container.** Needing a cast to fake it in a test means a seam is missing.
5. **Composition lives in one place.** Entry files do not construct services, repositories or schedulers.
6. **Modules do not reach into each other's internals.** Use the other module's public service or exported interface. Type-only imports of another module's data-access code count.
7. **Jobs and streams are edges.** A background job calls a service the way a route does; a module does not start its own timer or queue.
8. **A write spanning two repositories is the service's transaction.** Give it a transaction port instead of leaking the ORM handle into signatures.
9. **Add no layer the change does not need.** Entry, service, data access is a fine floor for a small module. A mapper, entity class or DI library earns its place only by protecting a rule that is actually at risk.
10. **Shared contracts have one source.** If a type is mirrored in two packages, change the source and the mirror together.

## 4. Frontend placement

1. **Colocate first.** A new component, helper, constant or style starts next to its only consumer. Create a shared location only when a second consumer exists, not in anticipation of one.
2. **Promote on the second consumer.** When another route or feature needs it, move it to the shared location and keep its internal shape. Say in your report what the second consumer is.
3. **Entry files stay thin.** A page or route file wires data to a named view and renders it; screen logic lives in the feature folder.
4. **One file until it needs a companion.** A component becomes a folder when it gains a test, helpers, constants, styles or subcomponents, and only with the files it actually uses.
5. **Imports go downhill.** App or route code, then shared components, then shared libraries, then vendored or generated code. Nothing imports sideways across features and nothing in shared code imports from an app or route.
6. **Server calls go through one client layer.** Components do not call `fetch` or open streams themselves; business logic leaves the component body.

See [references/frontend-placement.md](references/frontend-placement.md) for example folder shapes and the promotion checklist.

## 5. How to check

Run only the boundary commands the project lists: in its `CLAUDE.md` / `AGENTS.md`, its CI configuration, or `.claude/agent-guard.json` under `checkCommands`. If none is listed, do not invent one; say that no check is declared and review the imports by reading them. A lint passing does not prove the rules in section 3 that a static import graph cannot see (calls reached through a container, composition in the wrong file, a shared contract changed in one copy), so read the diff for those as well.

Fix the code, never the lint config, its baseline or its allowlist, to make a check pass.

## 6. Report

Finish with one line: the layer, the imports you added and their direction, the project rule or default that placed the code, and the check result or "no check declared". If two rules conflict or a case is not covered, stop and ask instead of inventing a third location.

For worked layouts and the signs a layer is too much, read [references/layering.md](references/layering.md).
