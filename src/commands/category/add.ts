import { Command, Args, Flags } from "@oclif/core"
import { Effect } from "effect"
import { CategoryService, CategoryServiceLive } from "../../services/category.service.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class CategoryAdd extends Command {
  static description = "Add a new category"
  static args = {
    name: Args.string({ description: "Category name", required: true }),
  }
  static flags = {
    parent: Flags.string({ char: "p", description: "Parent category path (e.g. work/tools)" }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CategoryAdd)

    const program = Effect.gen(function* () {
      const svc = yield* CategoryService
      return yield* svc.add(args.name, flags.parent)
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
