# Mermaid templates

Contents: ER, class, Gantt, subgraphs, notes.

## ER diagram

```mermaid
erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_LINE : contains
  PRODUCT ||--o{ ORDER_LINE : "appears in"
  USER {
    string id PK
    string email
  }
  ORDER {
    string id PK
    string user_id FK
    date created_at
  }
```

Cardinality marks: `||` exactly one, `o|` zero or one, `}o` zero or many, `}|` one or many.

## Class diagram

```mermaid
classDiagram
  class Service {
    +create(input) Result
  }
  class Repository {
    <<interface>>
    +save(entity) void
  }
  Service --> Repository : uses
  SqlRepository ..|> Repository
```

Arrows: `<|--` inheritance, `*--` composition, `o--` aggregation, `-->` association, `..>` dependency, `..|>` implements.

## Gantt

```mermaid
gantt
  dateFormat YYYY-MM-DD
  title Rollout
  section Build
    Spec        :a1, 2026-01-05, 3d
    Implement   :after a1, 7d
  section Release
    Review      :2026-01-17, 2d
```

## Subgraphs for layers

```mermaid
flowchart TB
  subgraph edge[Entry]
    route
  end
  subgraph app[Application]
    service
  end
  subgraph infra[Infrastructure]
    adapter
  end
  route --> service --> adapter
```

## Notes and dashed links

Use `-.->` for optional or indirect relations and `==>` sparingly for the main path. A note in a sequence diagram: `Note right of S: validates input`.
