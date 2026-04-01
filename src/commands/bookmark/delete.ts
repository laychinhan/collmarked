import { Command, Args } from "@oclif/core"
import { Effect } from "effect"
import { BookmarkService, BookmarkServiceLive } from "../../services/bookmark.service.js"
import { BookmarkRepoLive } from "../../repositories/bookmark.repo.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class BookmarkDelete extends Command {
  static description = "Delete a bookmark"
  static args = {
    id: Args.integer({ description: "Bookmark ID", required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(BookmarkDelete)

    const program = Effect.gen(function* () {
      const svc = yield* BookmarkService
      yield* svc.delete(args.id)
      return { deleted: args.id }
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(BookmarkServiceLive),
        Effect.provide(BookmarkRepoLive),
        Effect.provide(TagRepoLive),
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
