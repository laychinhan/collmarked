import { Command, Args } from "@oclif/core"
import { Effect } from "effect"
import { TagService, TagServiceLive } from "../../services/tag.service.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class TagDelete extends Command {
  static description = "Delete a tag (removes it from all bookmarks)"
  static args = {
    name: Args.string({ description: "Tag name", required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(TagDelete)

    const program = Effect.gen(function* () {
      const svc = yield* TagService
      yield* svc.delete(args.name)
      return { deleted: args.name }
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(TagServiceLive),
        Effect.provide(TagRepoLive),
        Effect.provide(KyselyDbLive),
        Effect.catchAll((e) => Effect.die(e))
      )
    ).catch((e) => {
      this.error(JSON.stringify({ error: e._tag ?? "Error", message: e.message ?? String(e) }))
    })

    if (result) this.log(JSON.stringify(result, null, 2))
  }
}
