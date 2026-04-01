import { Context, Effect, Layer } from "effect"
import { sql } from "kysely"
import { KyselyDb } from "../db/kysely.js"
import type { Bookmark, NewBookmark, Tag } from "../db/schema.js"
import { DbError, NotFoundError, ConflictError } from "../errors/index.js"

export interface BookmarkWithTags extends Bookmark {
  tags: Tag[]
  category_path?: string
  content?: { markdown: string; fetched_at: string } | null
}

export interface BookmarkFilters {
  categoryId?: number
  categoryIds?: number[] // for subtree filtering
  tags?: string[]
  search?: string
}

export interface BookmarkRepoService {
  add: (data: NewBookmark) => Effect.Effect<Bookmark, DbError | ConflictError>
  findById: (id: number) => Effect.Effect<BookmarkWithTags, NotFoundError | DbError>
  list: (filters?: BookmarkFilters) => Effect.Effect<BookmarkWithTags[], DbError>
  update: (
    id: number,
    data: Partial<NewBookmark>
  ) => Effect.Effect<Bookmark, NotFoundError | DbError>
  delete: (id: number) => Effect.Effect<void, NotFoundError | DbError>
  getCategorySubtreeIds: (categoryId: number) => Effect.Effect<number[], DbError>
}

export class BookmarkRepo extends Context.Tag("BookmarkRepo")<
  BookmarkRepo,
  BookmarkRepoService
>() {}

export const BookmarkRepoLive = Layer.effect(
  BookmarkRepo,
  Effect.gen(function* () {
    const db = yield* KyselyDb

    const withTags = async (bookmark: Bookmark): Promise<BookmarkWithTags> => {
      const tags = await db
        .selectFrom("tags")
        .innerJoin("bookmark_tags", "tags.id", "bookmark_tags.tag_id")
        .where("bookmark_tags.bookmark_id", "=", bookmark.id)
        .select(["tags.id", "tags.name"])
        .execute()
      const contentRow = await db
        .selectFrom("bookmark_content")
        .select(["markdown", "fetched_at"])
        .where("bookmark_id", "=", bookmark.id)
        .executeTakeFirst()
      return {
        ...bookmark,
        tags,
        content: contentRow ?? null,
      }
    }

    return {
      add: (data) =>
        Effect.tryPromise({
          try: () =>
            db.insertInto("bookmarks").values(data).returningAll().executeTakeFirstOrThrow(),
          catch: (e: unknown) => {
            const msg = String(e)
            if (msg.includes("UNIQUE"))
              return new ConflictError({
                message: `Bookmark with URL '${data.url}' already exists`,
              })
            return new DbError({ message: "Failed to insert bookmark", cause: e })
          },
        }),

      findById: (id) =>
        Effect.tryPromise({
          try: () => db.selectFrom("bookmarks").selectAll().where("id", "=", id).executeTakeFirst(),
          catch: (e) => new DbError({ message: "Failed to find bookmark", cause: e }),
        }).pipe(
          Effect.flatMap((row) =>
            row
              ? Effect.promise(() => withTags(row))
              : Effect.fail(new NotFoundError({ resource: "Bookmark", id }))
          )
        ),

      list: (filters) =>
        Effect.tryPromise({
          try: async () => {
            let query = db.selectFrom("bookmarks").selectAll()

            if (filters?.categoryIds?.length) {
              query = query.where("category_id", "in", filters.categoryIds)
            }

            if (filters?.tags?.length) {
              for (const tag of filters.tags) {
                query = query.where(
                  "id",
                  "in",
                  db
                    .selectFrom("bookmark_tags")
                    .innerJoin("tags", "tags.id", "bookmark_tags.tag_id")
                    .where("tags.name", "=", tag.toLowerCase().trim())
                    .select("bookmark_tags.bookmark_id")
                )
              }
            }

            if (filters?.search) {
              const [ftsMatches, contentFtsMatches] = await Promise.all([
                sql<{ rowid: number }>`
                  SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ${filters.search}
                `.execute(db),
                sql<{ bookmark_id: number }>`
                  SELECT bc.bookmark_id FROM bookmark_content_fts
                  JOIN bookmark_content bc ON bc.id = bookmark_content_fts.rowid
                  WHERE bookmark_content_fts MATCH ${filters.search}
                `.execute(db),
              ])
              const fromBookmarks = (ftsMatches.rows as { rowid: number }[]).map((r) => r.rowid)
              const fromContent = (contentFtsMatches.rows as { bookmark_id: number }[]).map(
                (r) => r.bookmark_id
              )
              const matchIds = [...new Set([...fromBookmarks, ...fromContent])]
              if (matchIds.length === 0) return []
              query = query.where("id", "in", matchIds)
            }

            const rows = await query.orderBy("created_at", "desc").execute()
            return Promise.all(rows.map(withTags))
          },
          catch: (e) => new DbError({ message: "Failed to list bookmarks", cause: e }),
        }),

      update: (id, data) =>
        Effect.tryPromise({
          try: () =>
            db
              .updateTable("bookmarks")
              .set(data)
              .where("id", "=", id)
              .returningAll()
              .executeTakeFirst(),
          catch: (e) => new DbError({ message: "Failed to update bookmark", cause: e }),
        }).pipe(
          Effect.flatMap((row) =>
            row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ resource: "Bookmark", id }))
          )
        ),

      delete: (id) =>
        Effect.tryPromise({
          try: async () => {
            const result = await db.deleteFrom("bookmarks").where("id", "=", id).executeTakeFirst()
            if (!result || result.numDeletedRows === BigInt(0))
              throw new NotFoundError({ resource: "Bookmark", id })
          },
          catch: (e) => {
            if (e instanceof NotFoundError) return e
            return new DbError({ message: "Failed to delete bookmark", cause: e })
          },
        }),

      getCategorySubtreeIds: (categoryId) =>
        Effect.tryPromise({
          try: async () => {
            const rows = await sql<{ id: number }[]>`
              WITH RECURSIVE subtree(id) AS (
                SELECT ${categoryId}
                UNION ALL
                SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
              )
              SELECT id FROM subtree
            `.execute(db)
            return (rows.rows as unknown as { id: number }[]).map((r) => r.id)
          },
          catch: (e) => new DbError({ message: "Failed to get category subtree", cause: e }),
        }),
    } satisfies BookmarkRepoService
  })
)
