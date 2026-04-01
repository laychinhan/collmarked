import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { ContentRepo } from "../src/repositories/content.repo.js"
import { makeContentRepoTest } from "../src/layers/test.layer.js"

function run<A>(effect: Effect.Effect<A, unknown, ContentRepo>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeContentRepoTest())))
}

describe("ContentRepo", () => {
  it("saves content and returns a BookmarkContent record", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* ContentRepo
        return yield* repo.save({ bookmarkId: 1, markdown: "# Hello" })
      })
    )
    expect(result).toMatchObject({ bookmark_id: 1, markdown: "# Hello" })
    expect(result.id).toBeTypeOf("number")
    expect(result.fetched_at).toBeTypeOf("string")
  })

  it("fails with ConflictError when saving content for the same bookmark twice", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const repo = yield* ContentRepo
          yield* repo.save({ bookmarkId: 1, markdown: "# First" })
          return yield* repo.save({ bookmarkId: 1, markdown: "# Second" })
        })
      )
    ).rejects.toThrow("already exists")
  })

  it("upsert overwrites existing content and updates fetched_at", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* ContentRepo
        const first = yield* repo.upsert({ bookmarkId: 1, markdown: "# First" })
        const second = yield* repo.upsert({ bookmarkId: 1, markdown: "# Updated" })
        return { first, second }
      })
    )
    expect(result.first.markdown).toBe("# First")
    expect(result.second.markdown).toBe("# Updated")
    expect(result.second.bookmark_id).toBe(1)
    expect(result.second.fetched_at >= result.first.fetched_at).toBe(true)
  })

  it("findByBookmarkId returns null when no content exists", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* ContentRepo
        return yield* repo.findByBookmarkId(99)
      })
    )
    expect(result).toBeNull()
  })

  it("findByBookmarkId returns stored content", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* ContentRepo
        yield* repo.save({ bookmarkId: 5, markdown: "## Article" })
        return yield* repo.findByBookmarkId(5)
      })
    )
    expect(result).toMatchObject({ bookmark_id: 5, markdown: "## Article" })
  })
})
