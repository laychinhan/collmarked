# Collmarked

A command-line bookmark manager with hierarchical categories and multi-tag support.

## Features

- Store bookmarks via CLI with a URL, a category, and one or more tags
- **Categories** — hierarchical (e.g. `work/tools/cli`), each bookmark belongs to exactly one
- **Tags** — flat, no hierarchy, each bookmark can have multiple

---

## Architecture Decision Record

### Technology Stack

| Concern | Decision | Rationale |
|---|---|---|
| Language | TypeScript | Type safety across the data model and query layer |
| Runtime | Node.js | Familiar ecosystem, rich library support |
| CLI Framework | Oclif | Structured command organisation, plugin-ready, first-class binary packaging |
| Effect library | Effect.ts | Typed errors, Layer-based dependency injection, testability without mocking frameworks |
| Query builder | Kysely + `better-sqlite3` | Type-safe SQL, synchronous dialect pairs naturally with Effect.sync |
| Storage | SQLite | Relational model suits hierarchical categories and many-to-many tag relations |
| Testing | Vitest + Effect Layers | Swap real DB layers with in-memory test layers — no jest.mock, no sinon |
| Distribution | `oclif pack` | Produces self-contained platform binaries (no Node runtime required on target) |
| Package manager | pnpm | Fast installs, efficient disk usage |

---

### Architectural Layers

```
Command (Oclif)
  └─ Effect.runPromise(program.pipe(Effect.provide(AppLayer)))
       ▼
  Service  —  business logic in Effect.gen, typed errors
       ▼
  Repository  —  Context.Tag interface (decoupled from implementation)
       ▼
  Live: Kysely + better-sqlite3   OR   Test: in-memory Layer
```

Each layer has a single responsibility:

- **Commands** — parse flags/args, call a service, render output. No business logic.
- **Services** — own domain rules (e.g. validate parent category exists before insert).
- **Repositories** — own all SQL queries. Defined as a `Context.Tag` interface so implementations are swappable.
- **Layers** — wire implementations together. `AppLayer` for production, `TestLayer` for tests.

---

### Project Structure

```
src/
├── commands/               # Oclif commands — one file per command
│   ├── bookmark/
│   │   ├── add.ts          # bookmark add <url> --category --tag
│   │   ├── list.ts
│   │   ├── delete.ts
│   │   └── open.ts
│   ├── category/
│   │   ├── add.ts          # category add <name> --parent
│   │   ├── list.ts         # renders as a tree
│   │   └── delete.ts
│   └── tag/
│       ├── add.ts
│       ├── list.ts
│       └── delete.ts
├── db/
│   ├── kysely.ts           # KyselyDb Context.Tag + Live Layer
│   ├── schema.ts           # Kysely database type definitions
│   └── migrations/         # Kysely migration files (numbered, sequential)
│       └── 001_init.ts
├── repositories/           # Context.Tag interfaces + Live and Test Layer implementations
│   ├── bookmark.repo.ts
│   ├── category.repo.ts
│   └── tag.repo.ts
├── services/               # Business logic composed with Effect.gen
│   ├── bookmark.service.ts
│   ├── category.service.ts
│   └── tag.service.ts
├── layers/
│   ├── app.layer.ts        # AppLayer — all Live layers composed for production
│   └── test.layer.ts       # TestLayer — all in-memory layers composed for tests
└── errors/                 # Typed domain error classes
    ├── db.error.ts
    └── domain.error.ts
```

---

### Effect.ts Integration

Repositories are defined as `Context.Tag` interfaces. The service layer consumes them via `Effect.gen` with full typed errors. Oclif commands act as the imperative boundary, running the Effect program via `Effect.runPromise`.

```
BookmarkService (Effect.gen)
  └─ requires BookmarkRepo (Context.Tag)
       ├─ BookmarkRepoLive  →  Kysely + SQLite  (production)
       └─ BookmarkRepoTest  →  in-memory array  (tests)
```

This means tests never touch the filesystem or a real database — they simply provide `TestLayer` instead of `AppLayer`.

---

### Data Model

```
bookmarks
  id, url, title, category_id, created_at

categories
  id, name, parent_id (self-referencing → tree structure)

tags
  id, name

bookmark_tags
  bookmark_id, tag_id  (many-to-many join table)
```

- A bookmark belongs to **one** category (required)
- A category may have a **parent** category (optional, enables hierarchy)
- A bookmark may have **many** tags via the join table

---

### CLI UX Style

Pure command flags — no interactive prompts. Designed to be scriptable and composable with other shell tools.

```sh
# Add a bookmark
collmarked bookmark add https://example.com --category work/tools --tag cli --tag typescript

# List bookmarks filtered by tag
collmarked bookmark list --tag cli

# List categories as a tree
collmarked category list

# Add a sub-category
collmarked category add tools --parent work
```
