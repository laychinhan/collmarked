import { Command, Args } from "@oclif/core"
import { Effect } from "effect"
import { CategoryService, CategoryServiceLive } from "../../services/category.service.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class CategoryDelete extends Command {
  static description = "Delete a category (only if it has no bookmarks or subcategories)"
  static args = {
    path: Args.string({ description: "Category path (e.g. work/tools)", required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(CategoryDelete)

    const program = Effect.gen(function* () {
      const svc = yield* CategoryService
      yield* svc.delete(args.path)
      return { deleted: args.path }
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
