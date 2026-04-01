import { Command } from "@oclif/core"
import { Effect } from "effect"
import { TagService, TagServiceLive } from "../../services/tag.service.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class TagList extends Command {
  static description = "List all tags"

  async run(): Promise<void> {
    const program = Effect.gen(function* () {
      const svc = yield* TagService
      return yield* svc.list()
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
