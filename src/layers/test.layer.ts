import { Layer } from "effect"
import { CategoryRepo } from "../repositories/category.repo.js"
import { ContentRepo } from "../repositories/content.repo.js"
import { DigestRepo } from "../repositories/digest.repo.js"
import type { Category, BookmarkContent, BookmarkDigest } from "../db/schema.js"
import { ConflictError, NotFoundError } from "../errors/index.js"
import { Effect } from "effect"

export function makeCategoryRepoTest(initial: Category[] = []) {
  let store: Category[] = [...initial]
  let nextId = initial.length + 1

  return Layer.succeed(CategoryRepo, {
    add: (data) =>
      Effect.gen(function* () {
        const conflict = store.find(
          (c) => c.name === data.name && c.parent_id === (data.parent_id ?? null)
        )
        if (conflict)
          return yield* Effect.fail(
            new ConflictError({ message: `Category '${data.name}' already exists` })
          )
        const now = new Date().toISOString()
        const cat: Category = {
          id: nextId++,
          name: data.name,
          parent_id: data.parent_id ?? null,
          created_at: now,
        }
        store.push(cat)
        return cat
      }),

    findById: (id) =>
      Effect.gen(function* () {
        const cat = store.find((c) => c.id === id)
        if (!cat) return yield* Effect.fail(new NotFoundError({ resource: "Category", id }))
        return cat
      }),

    findByPath: (parts) =>
      Effect.gen(function* () {
        let parentId: number | null = null
        let found: Category | undefined
        for (const part of parts) {
          found = store.find((c) => c.name === part && c.parent_id === parentId)
          if (!found)
            return yield* Effect.fail(
              new NotFoundError({ resource: "Category", id: parts.join("/") })
            )
          parentId = found.id
        }
        if (!found)
          return yield* Effect.fail(
            new NotFoundError({ resource: "Category", id: parts.join("/") })
          )
        return found
      }),

    list: () => Effect.succeed([...store]),

    hasChildren: (id) => Effect.succeed(store.some((c) => c.parent_id === id)),

    hasBookmarks: (_id) => Effect.succeed(false),

    delete: (id) =>
      Effect.gen(function* () {
        const idx = store.findIndex((c) => c.id === id)
        if (idx === -1) return yield* Effect.fail(new NotFoundError({ resource: "Category", id }))
        store.splice(idx, 1)
      }),
  })
}

export function makeContentRepoTest() {
  let store: BookmarkContent[] = []
  let nextId = 1

  return Layer.succeed(ContentRepo, {
    save: (data) =>
      Effect.gen(function* () {
        const existing = store.find((c) => c.bookmark_id === data.bookmarkId)
        if (existing)
          return yield* Effect.fail(
            new ConflictError({
              message: `Content for bookmark ${data.bookmarkId} already exists. Use --force to overwrite.`,
            })
          )
        const now = new Date().toISOString()
        const content: BookmarkContent = {
          id: nextId++,
          bookmark_id: data.bookmarkId,
          markdown: data.markdown,
          fetched_at: now,
        }
        store.push(content)
        return content
      }),

    upsert: (data) =>
      Effect.sync(() => {
        const idx = store.findIndex((c) => c.bookmark_id === data.bookmarkId)
        const now = new Date().toISOString()
        if (idx !== -1) {
          store[idx] = { ...store[idx], markdown: data.markdown, fetched_at: now }
          return store[idx]
        }
        const content: BookmarkContent = {
          id: nextId++,
          bookmark_id: data.bookmarkId,
          markdown: data.markdown,
          fetched_at: now,
        }
        store.push(content)
        return content
      }),

    findByBookmarkId: (bookmarkId) =>
      Effect.succeed(store.find((c) => c.bookmark_id === bookmarkId) ?? null),
  })
}

export function makeDigestRepoTest() {
  let store: BookmarkDigest[] = []
  let nextId = 1

  return Layer.succeed(DigestRepo, {
    save: (data) =>
      Effect.gen(function* () {
        const existing = store.find((d) => d.bookmark_id === data.bookmarkId)
        if (existing)
          return yield* Effect.fail(
            new ConflictError({
              message: `Digest for bookmark ${data.bookmarkId} already exists. Use --force to regenerate.`,
            })
          )
        const now = new Date().toISOString()
        const digest: BookmarkDigest = {
          id: nextId++,
          bookmark_id: data.bookmarkId,
          data: data.data,
          provider: data.provider,
          model: data.model,
          generated_at: now,
        }
        store.push(digest)
        return digest
      }),

    upsert: (data) =>
      Effect.sync(() => {
        const idx = store.findIndex((d) => d.bookmark_id === data.bookmarkId)
        const now = new Date().toISOString()
        if (idx !== -1) {
          store[idx] = {
            ...store[idx],
            data: data.data,
            provider: data.provider,
            model: data.model,
            generated_at: now,
          }
          return store[idx]
        }
        const digest: BookmarkDigest = {
          id: nextId++,
          bookmark_id: data.bookmarkId,
          data: data.data,
          provider: data.provider,
          model: data.model,
          generated_at: now,
        }
        store.push(digest)
        return digest
      }),

    findByBookmarkId: (bookmarkId) =>
      Effect.succeed(store.find((d) => d.bookmark_id === bookmarkId) ?? null),
  })
}
