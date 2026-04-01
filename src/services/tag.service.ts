import { Context, Effect, Layer } from "effect"
import { TagRepo } from "../repositories/tag.repo.js"
import type { Tag } from "../db/schema.js"
import { DbError, NotFoundError } from "../errors/index.js"

export interface TagServiceInterface {
  list: () => Effect.Effect<Tag[], DbError>
  delete: (name: string) => Effect.Effect<void, DbError | NotFoundError>
}

export class TagService extends Context.Tag("TagService")<TagService, TagServiceInterface>() {}

export const TagServiceLive = Layer.effect(
  TagService,
  Effect.gen(function* () {
    const repo = yield* TagRepo

    return {
      list: () => repo.listAll(),

      delete: (name) =>
        Effect.gen(function* () {
          const tag = yield* repo.findByName(name)
          if (!tag) return yield* Effect.fail(new NotFoundError({ resource: "Tag", id: name }))
          yield* repo.delete(name)
        }),
    } satisfies TagServiceInterface
  })
)
