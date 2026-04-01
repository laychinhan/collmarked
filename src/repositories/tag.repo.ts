import { Context, Effect, Layer } from "effect"
import { KyselyDb } from "../db/kysely.js"
import type { Tag } from "../db/schema.js"
import { DbError } from "../errors/index.js"

export interface TagRepoService {
  findOrCreate: (name: string) => Effect.Effect<Tag, DbError>
  listAll: () => Effect.Effect<Tag[], DbError>
  findByName: (name: string) => Effect.Effect<Tag | undefined, DbError>
  attachToBookmark: (bookmarkId: number, tagId: number) => Effect.Effect<void, DbError>
  detachAllFromBookmark: (bookmarkId: number) => Effect.Effect<void, DbError>
  delete: (name: string) => Effect.Effect<void, DbError>
}

export class TagRepo extends Context.Tag("TagRepo")<TagRepo, TagRepoService>() {}

export const TagRepoLive = Layer.effect(
  TagRepo,
  Effect.gen(function* () {
    const db = yield* KyselyDb

    return {
      findOrCreate: (name) =>
        Effect.tryPromise({
          try: async () => {
            const normalised = name.toLowerCase().trim()
            const existing = await db
              .selectFrom("tags")
              .selectAll()
              .where("name", "=", normalised)
              .executeTakeFirst()
            if (existing) return existing
            return db
              .insertInto("tags")
              .values({ name: normalised })
              .returningAll()
              .executeTakeFirstOrThrow()
          },
          catch: (e) => new DbError({ message: "Failed to find or create tag", cause: e }),
        }),

      listAll: () =>
        Effect.tryPromise({
          try: () => db.selectFrom("tags").selectAll().orderBy("name", "asc").execute(),
          catch: (e) => new DbError({ message: "Failed to list tags", cause: e }),
        }),

      findByName: (name) =>
        Effect.tryPromise({
          try: () =>
            db
              .selectFrom("tags")
              .selectAll()
              .where("name", "=", name.toLowerCase().trim())
              .executeTakeFirst(),
          catch: (e) => new DbError({ message: "Failed to find tag", cause: e }),
        }),

      attachToBookmark: (bookmarkId, tagId) =>
        Effect.tryPromise({
          try: () =>
            db
              .insertInto("bookmark_tags")
              .values({ bookmark_id: bookmarkId, tag_id: tagId })
              .execute(),
          catch: (e) => new DbError({ message: "Failed to attach tag to bookmark", cause: e }),
        }).pipe(Effect.map(() => undefined)),

      detachAllFromBookmark: (bookmarkId) =>
        Effect.tryPromise({
          try: () => db.deleteFrom("bookmark_tags").where("bookmark_id", "=", bookmarkId).execute(),
          catch: (e) => new DbError({ message: "Failed to detach tags from bookmark", cause: e }),
        }).pipe(Effect.map(() => undefined)),

      delete: (name) =>
        Effect.tryPromise({
          try: () => db.deleteFrom("tags").where("name", "=", name.toLowerCase().trim()).execute(),
          catch: (e) => new DbError({ message: "Failed to delete tag", cause: e }),
        }).pipe(Effect.map(() => undefined)),
    } satisfies TagRepoService
  })
)
