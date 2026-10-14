# Frontend placement reference

Contents: promotion checklist, folder shapes, what goes in each companion file, import directions.

## Promotion checklist

Promote code to a shared location only when all of these hold:

1. A second consumer exists today (not a plausible future one).
2. The consumers are in different features or routes (two uses inside one feature stay in that feature).
3. The code has no knowledge of either consumer's data shape beyond its own props or arguments.

When promoting, move it whole, keep its internal shape, update imports, and record the second consumer in your report.

## Folder shapes

One consumer, simple component:

```
feature/
  Widget.tsx
```

The component grows a test, helpers or subcomponents:

```
feature/Widget/
  Widget.tsx
  Widget.test.tsx
  helpers.ts        only if it has pure functions
  constants.ts      only if it has constants
  styles.ts         only if the project styles in code
  index.ts          one named re-export
```

Do not create empty placeholder files. Subcomponents nest inside the owning component's folder.

## What goes where

- **constants:** design tokens, column or grid definitions, translation keys. Never user-facing literal text if the project localises.
- **helpers:** pure functions without UI-framework imports, typed against the shared contract, unit-tested.
- **styles:** the style objects or class maps for this component only.
- Anything that fits none of those does not belong beside the component.

## Logic

Derive values during render instead of copying them into state through effects. Server state goes through the project's data-fetching hooks. Only one module talks to the network.

## Import directions

```
app / routes  ->  shared components  ->  shared lib  ->  vendored or generated code
```

Never sideways between features, and never from shared code back into app code. A barrel file belongs at the component-folder level at most; avoid wildcard re-exports and barrels above the component folder, which hide the real import graph.

## Contracts

Domain types come from the shared contract package or generated types. Only view-local types are declared locally. If the client holds a mirror of server types, change the source first.
