import { Context, Effect, Layer } from "effect"
import { BookmarkRepo, type BookmarkWithTags } from "../repositories/bookmark.repo.js"
import { TagRepo } from "../repositories/tag.repo.js"
import { CategoryRepo } from "../repositories/category.repo.js"
import { ConflictError, DbError, NotFoundError, ValidationError } from "../errors/index.js"

export interface AddBookmarkInput {
  url: string
  categoryPath: string
  tags?: string[]
  title?: string
  description?: string
}

export interface EditBookmarkInput {
  categoryPath?: string
  tags?: string[]
  title?: string
  description?: string
}

export interface BookmarkFilters {
  categoryPath?: string
  tags?: string[]
  search?: string
}

export interface BookmarkServiceInterface {
  add: (
    input: AddBookmarkInput
  ) => Effect.Effect<BookmarkWithTags, DbError | ConflictError | NotFoundError | ValidationError>
  list: (filters?: BookmarkFilters) => Effect.Effect<BookmarkWithTags[], DbError | NotFoundError>
  edit: (
    id: number,
    input: EditBookmarkInput
  ) => Effect.Effect<BookmarkWithTags, DbError | NotFoundError | ValidationError>
  delete: (id: number) => Effect.Effect<void, DbError | NotFoundError>
  findById: (id: number) => Effect.Effect<BookmarkWithTags, DbError | NotFoundError>
}

export class BookmarkService extends Context.Tag("BookmarkService")<
  BookmarkService,
  BookmarkServiceInterface
>() {}

export const BookmarkServiceLive = Layer.effect(
  BookmarkService,
  Effect.gen(function* () {
    const bookmarkRepo = yield* BookmarkRepo
    const tagRepo = yield* TagRepo
    const categoryRepo = yield* CategoryRepo

    const resolveCategoryId = (path: string) => {
      const parts = path.split("/").filter(Boolean)
      return categoryRepo.findByPath(parts).pipe(Effect.map((c) => c.id))
    }

    const applyTags = (bookmarkId: number, tags: string[]) =>
      Effect.gen(function* () {
        yield* tagRepo.detachAllFromBookmark(bookmarkId)
        for (const name of tags) {
          const tag = yield* tagRepo.findOrCreate(name)
          yield* tagRepo.attachToBookmark(bookmarkId, tag.id)
        }
      })

    return {
      add: (input) =>
        Effect.gen(function* () {
          if (!input.url.trim())
            return yield* Effect.fail(new ValidationError({ message: "URL cannot be empty" }))
          if (!input.categoryPath.trim())
            return yield* Effect.fail(
              new ValidationError({ message: "Category path cannot be empty" })
            )

          const categoryId = yield* resolveCategoryId(input.categoryPath)
          const bookmark = yield* bookmarkRepo.add({
            url: input.url.trim(),
            title: input.title ?? null,
            description: input.description ?? null,
            category_id: categoryId,
          })

          if (input.tags?.length) yield* applyTags(bookmark.id, input.tags)

          return yield* bookmarkRepo.findById(bookmark.id)
        }),

      list: (filters) =>
        Effect.gen(function* () {
          let categoryIds: number[] | undefined
          if (filters?.categoryPath) {
            const parts = filters.categoryPath.split("/").filter(Boolean)
            const cat = yield* categoryRepo.findByPath(parts)
            categoryIds = yield* bookmarkRepo.getCategorySubtreeIds(cat.id)
          }
          return yield* bookmarkRepo.list({
            categoryIds,
            tags: filters?.tags,
            search: filters?.search,
          })
        }),

      edit: (id, input) =>
        Effect.gen(function* () {
          const updates: Record<string, unknown> = {}
          if (input.categoryPath !== undefined)
            updates["category_id"] = yield* resolveCategoryId(input.categoryPath)
          if (input.title !== undefined) updates["title"] = input.title
          if (input.description !== undefined) updates["description"] = input.description

          if (Object.keys(updates).length > 0) yield* bookmarkRepo.update(id, updates)
          if (input.tags !== undefined) yield* applyTags(id, input.tags)

          return yield* bookmarkRepo.findById(id)
        }),

      delete: (id) => bookmarkRepo.delete(id),

      findById: (id) => bookmarkRepo.findById(id),
    } satisfies BookmarkServiceInterface
  })
)
