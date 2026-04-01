import { Command, Args, Flags } from "@oclif/core"
import { Effect } from "effect"
import { BookmarkService, BookmarkServiceLive } from "../../services/bookmark.service.js"
import { BookmarkRepoLive } from "../../repositories/bookmark.repo.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class BookmarkAdd extends Command {
  static description = "Add a new bookmark"
  static args = {
    url: Args.string({ description: "URL to bookmark", required: true }),
  }
  static flags = {
    category: Flags.string({
      char: "c",
      description: "Category path (e.g. work/tools)",
      required: true,
    }),
    tag: Flags.string({ char: "t", description: "Tag name (repeatable)", multiple: true }),
    title: Flags.string({ description: "Bookmark title" }),
    description: Flags.string({ char: "d", description: "Bookmark description" }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(BookmarkAdd)

    const program = Effect.gen(function* () {
      const svc = yield* BookmarkService
      return yield* svc.add({
        url: args.url,
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
