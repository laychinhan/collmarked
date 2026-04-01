import { Command } from "@oclif/core"
import { Effect } from "effect"
import { CategoryService, CategoryServiceLive } from "../../services/category.service.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class CategoryList extends Command {
  static description = "List all categories as a tree"

  async run(): Promise<void> {
    const program = Effect.gen(function* () {
      const svc = yield* CategoryService
      return yield* svc.listTree()
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(CategoryServiceLive),
        Effect.provide(CategoryRepoLive),
        Effect.provide(KyselyDbLive),
        Effect.catchAll((e) => Effect.die(e))
      )
    ).catch((e) => {
      this.error(JSON.stringify({ error: e._tag ?? "Error", message: e.message ?? String(e) }))
    })

    if (result) this.log(JSON.stringify(result, null, 2))
  }
}
