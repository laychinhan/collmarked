import { describe, it, expect } from "vitest"
import { Effect, Layer } from "effect"
import { BookmarkService, BookmarkServiceLive } from "../src/services/bookmark.service.js"
import { BookmarkRepo, type BookmarkWithTags } from "../src/repositories/bookmark.repo.js"
import { TagRepo } from "../src/repositories/tag.repo.js"
import { makeCategoryRepoTest } from "../src/layers/test.layer.js"
import { CategoryRepo } from "../src/repositories/category.repo.js"
import type { Bookmark, Tag } from "../src/db/schema.js"
import { ConflictError, NotFoundError } from "../src/errors/index.js"
import { Effect as Eff } from "effect"

// In-memory bookmark store
function makeBookmarkRepoTest() {
  let store: BookmarkWithTags[] = []
  let nextId = 1
  return Layer.succeed(BookmarkRepo, {
    add: (data) =>
      Effect.gen(function* () {
        const conflict = store.find((b) => b.url === data.url)
        if (conflict) return yield* Effect.fail(new ConflictError({ message: `Bookmark '${data.url}' exists` }))
        const now = new Date().toISOString()
        const bm: BookmarkWithTags = { id: nextId++, url: data.url, title: data.title ?? null, description: data.description ?? null, category_id: data.category_id, created_at: now, updated_at: now, tags: [] }
        store.push(bm)
        return bm
      }),
    findById: (id) => Effect.gen(function* () {
      const bm = store.find((b) => b.id === id)
      if (!bm) return yield* Effect.fail(new NotFoundError({ resource: "Bookmark", id }))
      return bm
    }),
    list: () => Effect.succeed([...store]),
    update: (id, data) => Effect.gen(function* () {
      const idx = store.findIndex((b) => b.id === id)
      if (idx === -1) return yield* Effect.fail(new NotFoundError({ resource: "Bookmark", id }))
      store[idx] = { ...store[idx], ...data, updated_at: new Date().toISOString() }
      return store[idx] as Bookmark
    }),
    delete: (id) => Effect.gen(function* () {
      const idx = store.findIndex((b) => b.id === id)
      if (idx === -1) return yield* Effect.fail(new NotFoundError({ resource: "Bookmark", id }))
      store.splice(idx, 1)
    }),
    getCategorySubtreeIds: (id) => Effect.succeed([id]),
  })
}

// In-memory tag store
function makeTagRepoTest() {
  let tags: Tag[] = []
  let bookmarkTags: { bookmark_id: number; tag_id: number }[] = []
  let nextId = 1
  return Layer.succeed(TagRepo, {
    findOrCreate: (name) => Effect.gen(function* () {
      const n = name.toLowerCase().trim()
      const existing = tags.find((t) => t.name === n)
      if (existing) return existing
      const tag: Tag = { id: nextId++, name: n }
      tags.push(tag)
      return tag
    }),
    listAll: () => Effect.succeed([...tags]),
    findByName: (name) => Effect.succeed(tags.find((t) => t.name === name.toLowerCase().trim())),
    attachToBookmark: (bookmarkId, tagId) => Effect.sync(() => { bookmarkTags.push({ bookmark_id: bookmarkId, tag_id: tagId }) }),
    detachAllFromBookmark: (bookmarkId) => Effect.sync(() => { bookmarkTags = bookmarkTags.filter((bt) => bt.bookmark_id !== bookmarkId) }),
    delete: (name) => Effect.sync(() => { tags = tags.filter((t) => t.name !== name.toLowerCase().trim()) }),
  })
}

function makeTestLayer() {
  const catRepo = makeCategoryRepoTest()
  const bmRepo = makeBookmarkRepoTest()
  const tagRepo = makeTagRepoTest()
  const deps = Layer.mergeAll(bmRepo, tagRepo, catRepo)
  return Layer.mergeAll(
    Layer.provide(BookmarkServiceLive, deps),
    catRepo
  )
}

function run<A>(effect: Effect.Effect<A, unknown, BookmarkService | CategoryRepo>) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(makeTestLayer()))
  )
}

describe("BookmarkService", () => {
  it("adds a bookmark with category and tags", async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* BookmarkService
        const catRepo = yield* CategoryRepo
        yield* catRepo.add({ name: "work", parent_id: null })
        return yield* svc.add({ url: "https://example.com", categoryPath: "work", tags: ["cli", "ts"] })
      })
    )
    expect(result).toMatchObject({ url: "https://example.com", category_id: 1 })
  })

  it("rejects duplicate URL", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const svc = yield* BookmarkService
          const catRepo = yield* CategoryRepo
          yield* catRepo.add({ name: "work", parent_id: null })
          yield* svc.add({ url: "https://dupe.com", categoryPath: "work" })
          return yield* svc.add({ url: "https://dupe.com", categoryPath: "work" })
        })
      )
    ).rejects.toThrow()
  })

  it("rejects when category does not exist", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const svc = yield* BookmarkService
          return yield* svc.add({ url: "https://example.com", categoryPath: "nonexistent" })
        })
      )
    ).rejects.toThrow()
  })

  it("lists all bookmarks", async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* BookmarkService
        const catRepo = yield* CategoryRepo
        yield* catRepo.add({ name: "work", parent_id: null })
        yield* svc.add({ url: "https://a.com", categoryPath: "work" })
        yield* svc.add({ url: "https://b.com", categoryPath: "work" })
        return yield* svc.list()
      })
    ) as BookmarkWithTags[]
    expect(result).toHaveLength(2)
  })
})
