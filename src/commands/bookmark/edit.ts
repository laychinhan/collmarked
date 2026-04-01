import { Command, Args, Flags } from "@oclif/core"
import { Effect } from "effect"
import { BookmarkService, BookmarkServiceLive } from "../../services/bookmark.service.js"
import { BookmarkRepoLive } from "../../repositories/bookmark.repo.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class BookmarkEdit extends Command {
  static description = "Edit a bookmark"
  static args = {
    id: Args.integer({ description: "Bookmark ID", required: true }),
  }
  static flags = {
    category: Flags.string({ char: "c", description: "New category path" }),
    tag: Flags.string({ char: "t", description: "Replace all tags (repeatable)", multiple: true }),
    title: Flags.string({ description: "New title" }),
    description: Flags.string({ char: "d", description: "New description" }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(BookmarkEdit)

    const program = Effect.gen(function* () {
      const svc = yield* BookmarkService
      return yield* svc.edit(args.id, {
        categoryPath: flags.category,
        tags: flags.tag,
        title: flags.title,
        description: flags.description,
      })
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
