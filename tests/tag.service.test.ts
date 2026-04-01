import { describe, it, expect } from "vitest"
import { Effect, Layer } from "effect"
import { TagService, TagServiceLive } from "../src/services/tag.service.js"
import { TagRepo } from "../src/repositories/tag.repo.js"
import type { Tag } from "../src/db/schema.js"

function makeTagRepoTest() {
  let tags: Tag[] = []
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
    attachToBookmark: (_bid, _tid) => Effect.void,
    detachAllFromBookmark: (_bid) => Effect.void,
    delete: (name) => Effect.sync(() => { tags = tags.filter((t) => t.name !== name.toLowerCase().trim()) }),
  })
}

function run<A>(effect: Effect.Effect<A, unknown, TagService>) {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.provide(TagServiceLive, makeTagRepoTest()))
    )
  )
}

describe("TagService", () => {
  it("lists all tags", async () => {
    const repoLayer = makeTagRepoTest()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TagRepo
        yield* repo.findOrCreate("cli")
        yield* repo.findOrCreate("typescript")
        const svc = yield* TagService
        return yield* svc.list()
      }).pipe(
        Effect.provide(TagServiceLive),
        Effect.provide(repoLayer)
      )
    ) as Tag[]
    expect(result.map((t) => t.name)).toEqual(expect.arrayContaining(["cli", "typescript"]))
  })

  it("deletes a tag", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TagRepo
        yield* repo.findOrCreate("cli")
        const svc = yield* TagService
        yield* svc.delete("cli")
        return yield* svc.list()
      }).pipe(
        Effect.provide(TagServiceLive),
        Effect.provide(makeTagRepoTest())
      )
    ) as Tag[]
    expect(result).toHaveLength(0)
  })

  it("fails to delete a non-existent tag", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* TagService
          return yield* svc.delete("nonexistent")
        }).pipe(
          Effect.provide(TagServiceLive),
          Effect.provide(makeTagRepoTest())
        )
      )
    ).rejects.toThrow()
  })
})
