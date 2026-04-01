import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { DigestRepo } from "../src/repositories/digest.repo.js"
import { makeDigestRepoTest } from "../src/layers/test.layer.js"

function run<A>(effect: Effect.Effect<A, unknown, DigestRepo>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeDigestRepoTest())))
}

const sampleData = '{"summary":"Test summary","takeaways":["Point A","Point B"]}'

describe("DigestRepo", () => {
  it("saves a digest and returns a BookmarkDigest record", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* DigestRepo
        return yield* repo.save({ bookmarkId: 1, data: sampleData, provider: "copilot", model: "gpt-5" })
      })
    )
    expect(result).toMatchObject({ bookmark_id: 1, data: sampleData, provider: "copilot", model: "gpt-5" })
    expect(result.id).toBeTypeOf("number")
    expect(result.generated_at).toBeTypeOf("string")
  })

  it("fails with ConflictError when saving a digest for the same bookmark twice", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const repo = yield* DigestRepo
          yield* repo.save({ bookmarkId: 1, data: sampleData, provider: "copilot", model: "gpt-5" })
          return yield* repo.save({ bookmarkId: 1, data: sampleData, provider: "copilot", model: "gpt-5" })
        })
      )
    ).rejects.toThrow("already exists")
  })

  it("upsert overwrites existing digest", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* DigestRepo
        const first = yield* repo.upsert({ bookmarkId: 1, data: sampleData, provider: "copilot", model: "gpt-5" })
        const updated = '{"summary":"Updated","takeaways":["X"]}'
        const second = yield* repo.upsert({ bookmarkId: 1, data: updated, provider: "copilot", model: "gpt-5-turbo" })
        return { first, second }
      })
    )
    expect(result.first.data).toBe(sampleData)
    expect(result.second.data).toBe('{"summary":"Updated","takeaways":["X"]}')
    expect(result.second.model).toBe("gpt-5-turbo")
    expect(result.second.bookmark_id).toBe(1)
  })

  it("findByBookmarkId returns null when no digest exists", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* DigestRepo
        return yield* repo.findByBookmarkId(99)
      })
    )
    expect(result).toBeNull()
  })

  it("findByBookmarkId returns stored digest", async () => {
    const result = await run(
      Effect.gen(function* () {
        const repo = yield* DigestRepo
        yield* repo.save({ bookmarkId: 5, data: sampleData, provider: "copilot", model: "gpt-5" })
        return yield* repo.findByBookmarkId(5)
      })
    )
    expect(result).toMatchObject({ bookmark_id: 5, data: sampleData })
  })
})
