import { Context, Effect, Layer } from "effect"
import { CategoryRepo } from "../repositories/category.repo.js"
import type { Category } from "../db/schema.js"
import { ConflictError, DbError, NotFoundError, ValidationError } from "../errors/index.js"

export interface CategoryNode extends Category {
  children: CategoryNode[]
}

export interface CategoryServiceInterface {
  add: (
    path: string,
    parentPath?: string
  ) => Effect.Effect<Category, DbError | ConflictError | NotFoundError | ValidationError>
  listTree: () => Effect.Effect<CategoryNode[], DbError>
  delete: (path: string) => Effect.Effect<void, DbError | NotFoundError | ConflictError>
  findByPath: (path: string) => Effect.Effect<Category, DbError | NotFoundError>
}

export class CategoryService extends Context.Tag("CategoryService")<
  CategoryService,
  CategoryServiceInterface
>() {}

function buildTree(categories: Category[], parentId: number | null = null): CategoryNode[] {
  return categories
    .filter((c) => c.parent_id === parentId)
    .map((c) => ({ ...c, children: buildTree(categories, c.id) }))
}

export const CategoryServiceLive = Layer.effect(
  CategoryService,
  Effect.gen(function* () {
    const repo = yield* CategoryRepo

    return {
      add: (name, parentPath) =>
        Effect.gen(function* () {
          if (!name.trim())
            return yield* Effect.fail(
              new ValidationError({ message: "Category name cannot be empty" })
            )

          let parentId: number | null = null
          if (parentPath) {
            const parts = parentPath.split("/").filter(Boolean)
            const parent = yield* repo.findByPath(parts)
            parentId = parent.id
          }

          return yield* repo.add({ name: name.trim(), parent_id: parentId })
        }),

      listTree: () => repo.list().pipe(Effect.map((categories) => buildTree(categories, null))),

      delete: (path) =>
        Effect.gen(function* () {
          const parts = path.split("/").filter(Boolean)
          const category = yield* repo.findByPath(parts)

          const hasChildren = yield* repo.hasChildren(category.id)
          if (hasChildren)
            return yield* Effect.fail(
              new ConflictError({
                message: `Category '${path}' has subcategories. Delete them first.`,
              })
            )

          const hasBookmarks = yield* repo.hasBookmarks(category.id)
          if (hasBookmarks)
            return yield* Effect.fail(
              new ConflictError({
                message: `Category '${path}' has bookmarks. Move or delete them first.`,
              })
            )

          return yield* repo.delete(category.id)
        }),

      findByPath: (path) => {
        const parts = path.split("/").filter(Boolean)
        return repo.findByPath(parts)
      },
    } satisfies CategoryServiceInterface
  })
)
