import { Context, Effect, Layer } from "effect"
import { sql } from "kysely"
import { KyselyDb } from "../db/kysely.js"
import type { BookmarkDigest } from "../db/schema.js"
import { ConflictError, DbError } from "../errors/index.js"

export interface DigestRepoService {
  save: (data: {
    bookmarkId: number
    data: string
    provider: string
    model: string
  }) => Effect.Effect<BookmarkDigest, DbError | ConflictError>
  upsert: (data: {
    bookmarkId: number
    data: string
    provider: string
    model: string
  }) => Effect.Effect<BookmarkDigest, DbError>
  findByBookmarkId: (bookmarkId: number) => Effect.Effect<BookmarkDigest | null, DbError>
}

export class DigestRepo extends Context.Tag("DigestRepo")<DigestRepo, DigestRepoService>() {}

export const DigestRepoLive = Layer.effect(
  DigestRepo,
  Effect.gen(function* () {
    const db = yield* KyselyDb

    return {
      save: (data) =>
        Effect.tryPromise({
          try: () =>
            db
              .insertInto("bookmark_digest")
              .values({
                bookmark_id: data.bookmarkId,
                data: data.data,
                provider: data.provider,
                model: data.model,
              })
              .returningAll()
              .executeTakeFirstOrThrow(),
          catch: (e: unknown) => {
            if (String(e).includes("UNIQUE"))
              return new ConflictError({
                message: `Digest for bookmark ${data.bookmarkId} already exists. Use --force to regenerate.`,
              })
            return new DbError({ message: "Failed to save digest", cause: e })
          },
        }),

      upsert: (data) =>
        Effect.tryPromise({
          try: () =>
            db
              .insertInto("bookmark_digest")
              .values({
                bookmark_id: data.bookmarkId,
                data: data.data,
                provider: data.provider,
                model: data.model,
              })
              .onConflict((oc) =>
                oc.column("bookmark_id").doUpdateSet({
                  data: data.data,
                  provider: data.provider,
                  model: data.model,
                  generated_at: sql<string>`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
                })
              )
              .returningAll()
              .executeTakeFirstOrThrow(),
          catch: (e) => new DbError({ message: "Failed to upsert digest", cause: e }),
        }),

      findByBookmarkId: (bookmarkId) =>
        Effect.tryPromise({
          try: () =>
            db
              .selectFrom("bookmark_digest")
              .selectAll()
              .where("bookmark_id", "=", bookmarkId)
              .executeTakeFirst()
              .then((r) => r ?? null),
          catch: (e) => new DbError({ message: "Failed to find digest", cause: e }),
        }),
    } satisfies DigestRepoService
  })
)
