# Copilot Instructions for Collmarked

Collmarked is a CLI bookmark manager built with Oclif, Effect.ts, Kysely, and SQLite.

## Commands

```bash
pnpm dev              # Run via tsx (no compile)
pnpm build            # tsc + copy migrations to dist/
pnpm test             # vitest run (full suite)
pnpm test -- -t "name" # Run a single test by name pattern
pnpm lint             # eslint src/
pnpm lint:fix         # eslint src/ --fix
pnpm format           # prettier --write "src/**/*.ts"
```

## Architecture

The codebase has three strict layers wired together via **Effect.ts dependency injection**:

- **`src/commands/`** — Oclif command handlers. Each command builds an Effect program and calls `Effect.runPromise(program.pipe(Effect.provide(...)))`, explicitly providing all service/repo layers.
- **`src/services/`** — Business logic using `Effect.gen`. Services accept/return typed DTOs and fail with typed errors from `src/errors/`.
- **`src/repositories/`** — SQL data access via Kysely. Repos expose `Context.Tag` interfaces; services depend on these interfaces, not concrete implementations.
- **`src/layers/`** — `app.layer.ts` composes all Live layers for production; `test.layer.ts` provides in-memory implementations for tests.
- **`src/db/`** — Kysely setup (`kysely.ts`), schema types (`schema.ts`), and numbered migrations (`migrations/001_init.ts`, `002_fts.ts`).

Data flow: `Command → Service → Repository → Kysely (SQLite)`

## Key Conventions

### Effect.ts patterns

Services and repos are `Context.Tag` classes:
```typescript
export class BookmarkService extends Context.Tag("BookmarkService")<
  BookmarkService,
  BookmarkServiceInterface
>() {}
```

Errors extend `Data.TaggedError`:
```typescript
export class ValidationError extends Data.TaggedError("ValidationError")<{
  message: string
}> {}
```

Business logic uses `Effect.gen`:
```typescript
const program = Effect.gen(function* () {
  const svc = yield* BookmarkService
  return yield* svc.add(...)
})
```

### Testing without mocks

Tests never use `vi.mock`. Instead, `test.layer.ts` provides in-memory `Layer.succeed(...)` implementations. Each test file defines a `makeTestLayer()` and a local `run()` helper:
```typescript
function run<A>(effect: Effect.Effect<A, unknown, BookmarkService | CategoryRepo>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer())))
}
```

### Type-safe SQL

Kysely schema types in `src/db/schema.ts` use `Selectable`/`Insertable`/`Updateable` wrappers. All queries are fully typed — no `any` in SQL calls.

### Migrations

Migrations live in `src/db/migrations/` and are copied to `dist/db/migrations/` by the `postbuild` script. Run them via `pnpm dev db migrate` or `collmarked db migrate`. New migrations must be numbered sequentially (`003_...ts`).

### Categories are hierarchical, tags are flat

Categories use a path-style hierarchy (`work/tools/cli`). Recursive CTEs are used for subtree queries. Tags are flat and many-to-many with bookmarks.

### Authoring Oclif commands

Commands extend `Command` from `@oclif/core`. Use `Args` for positional arguments and `Flags` for named options:

```typescript
static args = {
  url: Args.string({ description: "URL to bookmark", required: true }),
}

static flags = {
  category: Flags.string({ char: "c", description: "Category path", required: true }),
  tag: Flags.string({ char: "t", description: "Tag name", multiple: true }),
}
```

The `run()` method parses input, builds an Effect program, provides all layers, and outputs JSON:

```typescript
async run(): Promise<void> {
  const { args, flags } = await this.parse(BookmarkAdd)

  const program = Effect.gen(function* () {
    const svc = yield* BookmarkService
    return yield* svc.add(args.url, flags)
  })

  const result = await Effect.runPromise(
    program.pipe(
      Effect.provide(BookmarkServiceLive),
      Effect.provide(BookmarkRepoLive),
      Effect.provide(TagRepoLive),
      Effect.provide(CategoryRepoLive),
      Effect.provide(KyselyDbLive),
      Effect.catchAll((e) => Effect.die(e))
    )
  ).catch((e) => {
    this.error(JSON.stringify({ error: e._tag ?? "Error", message: e.message ?? String(e) }))
  })

  if (result) this.log(JSON.stringify(result, null, 2))
}
```

All commands output JSON (success and error). Errors include `_tag` (the `Data.TaggedError` discriminant) and `message`.

### Full-text search (FTS)

FTS is implemented with SQLite's `fts5` module. Migration `002_fts.ts` creates a content-backed virtual table and three triggers to keep it in sync:

```sql
CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
  url, title, description,
  content='bookmarks',
  content_rowid='id'
)
-- Triggers: ai_bookmarks (INSERT), ad_bookmarks (DELETE), au_bookmarks (UPDATE)
```

In the repository, FTS search is applied as a subquery filter using a raw `sql` template tag (Kysely doesn't model virtual tables):

```typescript
const ftsMatches = await sql<{ rowid: number }>`
  SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ${filters.search}
`.execute(db)
const matchIds = ftsMatches.rows.map((r) => r.rowid)
if (matchIds.length === 0) return []
query = query.where("id", "in", matchIds)
```

FTS, category, and tag filters all compose with AND logic. The `sql` template tag is the only place raw SQL is used — all other queries go through Kysely's typed builder.
