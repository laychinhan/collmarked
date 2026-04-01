import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { CategoryService, CategoryServiceLive } from "../src/services/category.service.js"
import { makeCategoryRepoTest } from "../src/layers/test.layer.js"

function runWithTestLayer(effect: Effect.Effect<unknown, unknown, CategoryService>) {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(CategoryServiceLive),
      Effect.provide(makeCategoryRepoTest())
    )
  )
}

describe("CategoryService", () => {
  it("adds a root category", async () => {
    const result = await runWithTestLayer(
      Effect.gen(function* () {
        const svc = yield* CategoryService
        return yield* svc.add("work")
      })
    )
    expect(result).toMatchObject({ name: "work", parent_id: null })
  })

  it("adds a nested category", async () => {
    const result = await runWithTestLayer(
      Effect.gen(function* () {
        const svc = yield* CategoryService
        yield* svc.add("work")
        return yield* svc.add("tools", "work")
      })
    )
    expect(result).toMatchObject({ name: "tools" })
    expect((result as { parent_id: number }).parent_id).toBeGreaterThan(0)
  })

  it("rejects empty category name", async () => {
    await expect(
      runWithTestLayer(
        Effect.gen(function* () {
          const svc = yield* CategoryService
          return yield* svc.add("  ")
        })
      )
    ).rejects.toThrow()
  })

  it("fails to add nested category when parent does not exist", async () => {
    await expect(
      runWithTestLayer(
        Effect.gen(function* () {
          const svc = yield* CategoryService
          return yield* svc.add("tools", "nonexistent")
        })
      )
    ).rejects.toThrow()
  })

  it("lists categories as a tree", async () => {
    const result = await runWithTestLayer(
      Effect.gen(function* () {
        const svc = yield* CategoryService
        yield* svc.add("work")
        yield* svc.add("tools", "work")
        yield* svc.add("personal")
        return yield* svc.listTree()
      })
    ) as Array<{ name: string; children: Array<{ name: string }> }>

    expect(result).toHaveLength(2)
    const work = result.find((c) => c.name === "work")
    expect(work?.children).toHaveLength(1)
    expect(work?.children[0].name).toBe("tools")
  })

  it("deletes a leaf category", async () => {
    const result = await runWithTestLayer(
      Effect.gen(function* () {
        const svc = yield* CategoryService
        yield* svc.add("work")
        yield* svc.delete("work")
        return yield* svc.listTree()
      })
    ) as unknown[]
    expect(result).toHaveLength(0)
  })

  it("rejects deleting a category with children", async () => {
    await expect(
      runWithTestLayer(
        Effect.gen(function* () {
          const svc = yield* CategoryService
          yield* svc.add("work")
          yield* svc.add("tools", "work")
          return yield* svc.delete("work")
        })
      )
    ).rejects.toThrow()
  })
})
