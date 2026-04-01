import { Context, Effect, Layer } from "effect"
import { sql } from "kysely"
import { KyselyDb } from "../db/kysely.js"
import type { Category, NewCategory } from "../db/schema.js"
import { DbError, NotFoundError, ConflictError } from "../errors/index.js"

export interface CategoryRepoService {
  add: (data: NewCategory) => Effect.Effect<Category, DbError | ConflictError>
  findById: (id: number) => Effect.Effect<Category, NotFoundError | DbError>
  findByPath: (parts: string[]) => Effect.Effect<Category, NotFoundError | DbError>
  list: () => Effect.Effect<Category[], DbError>
  hasChildren: (id: number) => Effect.Effect<boolean, DbError>
  hasBookmarks: (id: number) => Effect.Effect<boolean, DbError>
  delete: (id: number) => Effect.Effect<void, NotFoundError | DbError>
}

export class CategoryRepo extends Context.Tag("CategoryRepo")<
  CategoryRepo,
  CategoryRepoService
>() {}

export const CategoryRepoLive = Layer.effect(
  CategoryRepo,
  Effect.gen(function* () {
    const db = yield* KyselyDb

    return {
      add: (data) =>
        Effect.tryPromise({
          try: () =>
            db.insertInto("categories").values(data).returningAll().executeTakeFirstOrThrow(),
          catch: (e: unknown) => {
            const msg = String(e)
            if (msg.includes("UNIQUE"))
              return new ConflictError({
                message: `Category '${data.name}' already exists under this parent`,
              })
            return new DbError({ message: "Failed to insert category", cause: e })
          },
        }),

      findById: (id) =>
        Effect.tryPromise({
          try: () =>
            db.selectFrom("categories").selectAll().where("id", "=", id).executeTakeFirst(),
          catch: (e) => new DbError({ message: "Failed to find category", cause: e }),
        }).pipe(
          Effect.flatMap((row) =>
            row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ resource: "Category", id }))
          )
        ),

      findByPath: (parts) =>
        Effect.gen(function* () {
          let parentId: number | null = null
          let category: Category | undefined

          for (const part of parts) {
            const row = yield* Effect.tryPromise({
              try: () =>
                db
                  .selectFrom("categories")
                  .selectAll()
                  .where("name", "=", part)
                  .where("parent_id", parentId === null ? "is" : "=", parentId as never)
                  .executeTakeFirst(),
              catch: (e) => new DbError({ message: "Failed to find category", cause: e }),
            })
            if (!row)
              return yield* Effect.fail(
                new NotFoundError({ resource: "Category", id: parts.join("/") })
              )
            category = row
            parentId = row.id
          }

          if (!category)
            return yield* Effect.fail(
              new NotFoundError({ resource: "Category", id: parts.join("/") })
            )
          return category
        }),

      list: () =>
        Effect.tryPromise({
          try: () =>
            db
              .selectFrom("categories")
              .selectAll()
              .orderBy("parent_id", "asc")
              .orderBy("name", "asc")
              .execute(),
          catch: (e) => new DbError({ message: "Failed to list categories", cause: e }),
        }),

      hasChildren: (id) =>
        Effect.tryPromise({
          try: async () => {
            const row = await db
              .selectFrom("categories")
              .select(sql<number>`count(*)`.as("count"))
              .where("parent_id", "=", id)
              .executeTakeFirst()
            return (row?.count ?? 0) > 0
          },
          catch: (e) => new DbError({ message: "Failed to check children", cause: e }),
        }),

      hasBookmarks: (id) =>
        Effect.tryPromise({
          try: async () => {
            const row = await db
              .selectFrom("bookmarks")
              .select(sql<number>`count(*)`.as("count"))
              .where("category_id", "=", id)
              .executeTakeFirst()
            return (row?.count ?? 0) > 0
          },
          catch: (e) => new DbError({ message: "Failed to check bookmarks", cause: e }),
        }),

      delete: (id) =>
        Effect.tryPromise({
          try: async () => {
            const result = await db.deleteFrom("categories").where("id", "=", id).executeTakeFirst()
            if (!result || result.numDeletedRows === BigInt(0))
              throw new NotFoundError({ resource: "Category", id })
          },
          catch: (e) => {
            if (e instanceof NotFoundError) return e
            return new DbError({ message: "Failed to delete category", cause: e })
          },
        }),
    } satisfies CategoryRepoService
  })
)
