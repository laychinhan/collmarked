import { describe, it, expect } from "vitest"
import { Effect, Layer } from "effect"
import { DigestService, DigestServiceLive } from "../src/services/digest.service.js"
import { LlmProvider } from "../src/services/llm-provider.service.js"
import { BookmarkRepo, type BookmarkWithTags } from "../src/repositories/bookmark.repo.js"
import { ContentRepo } from "../src/repositories/content.repo.js"
import { DigestRepo } from "../src/repositories/digest.repo.js"
import { makeContentRepoTest, makeDigestRepoTest } from "../src/layers/test.layer.js"
import { LlmError, NotFoundError } from "../src/errors/index.js"
import type { Tag } from "../src/db/schema.js"

const VALID_RESPONSE = '{"summary":"A great article","takeaways":["Point 1","Point 2","Point 3","Point 4","Point 5"]}'

function makeLlmMock(response = VALID_RESPONSE) {
  return Layer.succeed(LlmProvider, {
    complete: () => Effect.succeed(response),
  })
}

function makeFailingLlmMock() {
  return Layer.succeed(LlmProvider, {
    complete: () => Effect.fail(new LlmError({ message: "API error" })),
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

interface TestContext {
  serviceLayer: Layer.Layer<DigestService>
  contentRepoLayer: Layer.Layer<ContentRepo>
}

function makeTestContext(
  opts: {
    bookmarkExists?: boolean
    llmFails?: boolean
    llmResponse?: string
  } = {}
): TestContext {
  const bmRepo = makeBookmarkRepoMock(opts.bookmarkExists ?? true)
  const digestRepoLayer = makeDigestRepoTest()
  const contentRepoLayer = makeContentRepoTest()
  const llm = opts.llmFails
    ? makeFailingLlmMock()
    : makeLlmMock(opts.llmResponse ?? VALID_RESPONSE)

  const deps = Layer.mergeAll(bmRepo, contentRepoLayer, digestRepoLayer, llm)
  const serviceLayer = Layer.provide(DigestServiceLive, deps)

  return { serviceLayer, contentRepoLayer }
}

async function seedContent(contentRepoLayer: Layer.Layer<ContentRepo>) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ContentRepo
      yield* repo.save({ bookmarkId: 1, markdown: "# Hello\n\nSome article content here." })
    }).pipe(Effect.provide(contentRepoLayer))
  )
}

describe("DigestService", () => {
  it("generates and stores a digest for a bookmark with extracted content", async () => {
    const { serviceLayer, contentRepoLayer } = makeTestContext()
    await seedContent(contentRepoLayer)
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* DigestService
        return yield* svc.digest(1, false)
      }).pipe(Effect.provide(serviceLayer))
    )
    expect(result).toMatchObject({ bookmark_id: 1, provider: "copilot" })
    expect(result.data).toBeTypeOf("string")
    const parsed = JSON.parse(result.data) as { summary: string; takeaways: string[] }
    expect(parsed.summary).toBeTypeOf("string")
    expect(Array.isArray(parsed.takeaways)).toBe(true)
  })

  it("fails with ContentNotExtractedError when no content has been extracted", async () => {
    const { serviceLayer } = makeTestContext()
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* DigestService
          return yield* svc.digest(1, false)
        }).pipe(Effect.provide(serviceLayer))
      )
    ).rejects.toThrow("bookmark extract")
  })

  it("fails with NotFoundError when bookmark does not exist", async () => {
    const { serviceLayer } = makeTestContext({ bookmarkExists: false })
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* DigestService
          return yield* svc.digest(99, false)
        }).pipe(Effect.provide(serviceLayer))
      )
    ).rejects.toThrow()
  })

  it("fails with ConflictError when digest already exists and force is false", async () => {
    const { serviceLayer, contentRepoLayer } = makeTestContext()
    await seedContent(contentRepoLayer)
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* DigestService
          yield* svc.digest(1, false)
          return yield* svc.digest(1, false)
        }).pipe(Effect.provide(serviceLayer))
      )
    ).rejects.toThrow("already exists")
  })

  it("overwrites existing digest when force is true", async () => {
    const { serviceLayer, contentRepoLayer } = makeTestContext()
    await seedContent(contentRepoLayer)
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* DigestService
        yield* svc.digest(1, false)
        return yield* svc.digest(1, true)
      }).pipe(Effect.provide(serviceLayer))
    )
    expect(result).toMatchObject({ bookmark_id: 1 })
  })

  it("propagates LlmError when the LLM provider fails", async () => {
    const { serviceLayer, contentRepoLayer } = makeTestContext({ llmFails: true })
    await seedContent(contentRepoLayer)
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* DigestService
          return yield* svc.digest(1, false)
        }).pipe(Effect.provide(serviceLayer))
      )
    ).rejects.toThrow("API error")
  })

  it("fails with LlmError when LLM returns invalid JSON", async () => {
    const { serviceLayer, contentRepoLayer } = makeTestContext({ llmResponse: "not valid json at all" })
    await seedContent(contentRepoLayer)
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* DigestService
          return yield* svc.digest(1, false)
        }).pipe(Effect.provide(serviceLayer))
      )
    ).rejects.toThrow("invalid JSON")
  })
})
