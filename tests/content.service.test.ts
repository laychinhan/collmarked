import { describe, it, expect } from "vitest"
import { Effect, Layer } from "effect"
import { ContentService, ContentServiceLive } from "../src/services/content.service.js"
import { ContentFetcher } from "../src/services/content-fetcher.service.js"
import { ContentExtractor } from "../src/services/content-extractor.service.js"
import { BookmarkRepo, type BookmarkWithTags } from "../src/repositories/bookmark.repo.js"
import { ContentRepo } from "../src/repositories/content.repo.js"
import { makeContentRepoTest } from "../src/layers/test.layer.js"
import { ConflictError, FetchError, ExtractionError, NotFoundError } from "../src/errors/index.js"
import type { Tag } from "../src/db/schema.js"

const MOCK_HTML = "<html><body><article><h1>Title</h1><p>Body text here.</p></article></body></html>"
const MOCK_MARKDOWN = "# Title\n\nBody text here."

function makeFetcherMock(html = MOCK_HTML) {
  return Layer.succeed(ContentFetcher, { fetch: () => Effect.succeed(html) })
}

function makeFailingFetcherMock() {
  return Layer.succeed(ContentFetcher, {
    fetch: () => Effect.fail(new FetchError({ message: "Network error" })),
  })
}

function makeExtractorMock(markdown = MOCK_MARKDOWN) {
  return Layer.succeed(ContentExtractor, {
    extract: () => Effect.succeed({ title: "Title", content: `<p>${markdown}</p>` }),
  })
}

function makeFailingExtractorMock() {
  return Layer.succeed(ContentExtractor, {
    extract: () => Effect.fail(new ExtractionError({ message: "No readable content" })),
  })
}

function makeBookmarkRepoMock(exists = true) {
  const bookmark: BookmarkWithTags = {
    id: 1,
    url: "https://example.com",
    title: "Example",
    description: null,
    category_id: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tags: [] as Tag[],
  }
  return Layer.succeed(BookmarkRepo, {
    findById: (id) =>
      exists
        ? Effect.succeed(bookmark)
        : Effect.fail(new NotFoundError({ resource: "Bookmark", id })),
    add: () => Effect.die("not implemented"),
    list: () => Effect.succeed([]),
    update: () => Effect.die("not implemented"),
    delete: () => Effect.die("not implemented"),
    getCategorySubtreeIds: (id) => Effect.succeed([id]),
  })
}

function makeTestLayer(
  opts: {
    fetcherFails?: boolean
    extractorFails?: boolean
    bookmarkExists?: boolean
  } = {}
) {
  const fetcher = opts.fetcherFails ? makeFailingFetcherMock() : makeFetcherMock()
  const extractor = opts.extractorFails ? makeFailingExtractorMock() : makeExtractorMock()
  const bmRepo = makeBookmarkRepoMock(opts.bookmarkExists ?? true)
  const contentRepo = makeContentRepoTest()
  const deps = Layer.mergeAll(fetcher, extractor, bmRepo, contentRepo)
  return Layer.provide(ContentServiceLive, deps)
}

function run<A>(effect: Effect.Effect<A, unknown, ContentService>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer())))
}

describe("ContentService", () => {
  it("extracts content and stores markdown for a valid bookmark", async () => {
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* ContentService
        return yield* svc.extract(1, false)
      })
    )
    expect(result).toMatchObject({ bookmark_id: 1 })
    expect(result.markdown).toBeTypeOf("string")
    expect(result.markdown.length).toBeGreaterThan(0)
    expect(result.fetched_at).toBeTypeOf("string")
  })

  it("fails with ConflictError when content already exists and force is false", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* ContentService
          yield* svc.extract(1, false)
          return yield* svc.extract(1, false)
        }).pipe(Effect.provide(makeTestLayer()))
      )
    ).rejects.toThrow("already exists")
  })

  it("overwrites existing content when force is true", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ContentService
        yield* svc.extract(1, false)
        return yield* svc.extract(1, true)
      }).pipe(Effect.provide(makeTestLayer()))
    )
    expect(result).toMatchObject({ bookmark_id: 1 })
  })

  it("fails with NotFoundError when bookmark does not exist", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* ContentService
          return yield* svc.extract(99, false)
        }).pipe(Effect.provide(makeTestLayer({ bookmarkExists: false })))
      )
    ).rejects.toThrow()
  })

  it("propagates FetchError when HTTP fetch fails", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* ContentService
          return yield* svc.extract(1, false)
        }).pipe(Effect.provide(makeTestLayer({ fetcherFails: true })))
      )
    ).rejects.toThrow("Network error")
  })

  it("propagates ExtractionError when no readable content found", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* ContentService
          return yield* svc.extract(1, false)
        }).pipe(Effect.provide(makeTestLayer({ extractorFails: true })))
      )
    ).rejects.toThrow("No readable content")
  })
})
