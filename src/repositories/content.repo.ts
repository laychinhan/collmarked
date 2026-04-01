import { Context, Effect, Layer } from "effect"
import { sql } from "kysely"
import { KyselyDb } from "../db/kysely.js"
import type { BookmarkContent } from "../db/schema.js"
import { ConflictError, DbError } from "../errors/index.js"

export interface ContentRepoService {
  save: (data: {
    bookmarkId: number
    markdown: string
  }) => Effect.Effect<BookmarkContent, DbError | ConflictError>
  upsert: (data: {
    bookmarkId: number
    markdown: string
  }) => Effect.Effect<BookmarkContent, DbError>
  findByBookmarkId: (bookmarkId: number) => Effect.Effect<BookmarkContent | null, DbError>
}

export class ContentRepo extends Context.Tag("ContentRepo")<ContentRepo, ContentRepoService>() {}

export const ContentRepoLive = Layer.effect(
  ContentRepo,
  Effect.gen(function* () {
    const db = yield* KyselyDb

    return {
      save: (data) =>
        Effect.tryPromise({
          try: () =>
            db
              .insertInto("bookmark_content")
              .values({ bookmark_id: data.bookmarkId, markdown: data.markdown })
              .returningAll()
              .executeTakeFirstOrThrow(),
          catch: (e: unknown) => {
            if (String(e).includes("UNIQUE"))
              return new ConflictError({
                message: `Content for bookmark ${data.bookmarkId} already exists. Use --force to overwrite.`,
              })
            return new DbError({ message: "Failed to save content", cause: e })
          },
        }),

      upsert: (data) =>
        Effect.tryPromise({
          try: () =>
            db
              .insertInto("bookmark_content")
              .values({ bookmark_id: data.bookmarkId, markdown: data.markdown })
              .onConflict((oc) =>
                oc.column("bookmark_id").doUpdateSet({
                  markdown: data.markdown,
                  fetched_at: sql<string>`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
                })
              )
              .returningAll()
              .executeTakeFirstOrThrow(),
          catch: (e) => new DbError({ message: "Failed to upsert content", cause: e }),
        }),

      findByBookmarkId: (bookmarkId) =>
        Effect.tryPromise({
          try: () =>
            db
              .selectFrom("bookmark_content")
              .selectAll()
              .where("bookmark_id", "=", bookmarkId)
              .executeTakeFirst()
              .then((r) => r ?? null),
          catch: (e) => new DbError({ message: "Failed to find content", cause: e }),
        }),
    } satisfies ContentRepoService
  })
)
