# Layering reference

Contents: rings, a minimal module shape, signs a layer is too much, grandfathering, common leaks.

## Rings

Think of concentric rings. Dependencies cross a ring boundary only inward.

1. **Domain.** Pure rules and data. No I/O, no framework, no clock or randomness read directly (pass them in).
2. **Application.** Services that orchestrate domain code and talk to the outside world only through ports.
3. **Infrastructure.** Adapters: persistence, HTTP clients, message queues, file system, vendor SDKs.
4. **Edge.** Entry points and the composition root. These may import from any ring because they connect them.

## A minimal module shape

Names vary; the roles do not.

```
<module>/
  entry          parse, call the service, map the result
  service        use cases; takes ports in its constructor or factory
  data access    queries and persistence for this module only
  wiring         builds the service from adapters; called once by the entry
```

Another module that needs this module's data calls its service (obtained through its wiring), never its data-access files.

## New external dependency checklist

1. Define the port (an interface in terms of your domain, not the vendor's).
2. Implement it in the adapter layer. This is the only file set that imports the SDK.
3. Write a fake that implements the same port for tests.
4. Expose it from the composition root.
5. Give secrets to it from configuration, never from inline environment reads inside the adapter's callers.

## Signs a layer is too much

- A mapper that copies fields one to one between identical shapes.
- An interface with a single implementation and no second use, no test double and no rule behind it.
- A service that only forwards to a repository.
- A DI container introduced to build three objects.

Remove the layer or do not add it. "No extra layer here" is a valid outcome.

## Grandfathering

Existing code that breaks a rule is not a precedent. For a change in an old file, keep that file's shape unless a migration was asked for; for new files, follow the rule. Existing violations that a project has recorded in a baseline are not findings against a new diff, and a new diff must not add to the baseline.

## Common leaks static checks miss

- An adapter reached through a container property inside an entry handler.
- Composition (building services, registering jobs) inside an entry file.
- A service that takes the whole container and builds its own repository.
- A configuration flag read deep inside a service instead of decided at the edge and passed as a value.
- A type-only import of another module's internals.
- A shared contract edited in one package but not in its mirror.
