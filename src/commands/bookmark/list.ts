import { Command, Flags } from "@oclif/core"
import { Effect } from "effect"
import { BookmarkService, BookmarkServiceLive } from "../../services/bookmark.service.js"
import { BookmarkRepoLive } from "../../repositories/bookmark.repo.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class BookmarkList extends Command {
  static description = "List bookmarks with optional filters"
  static flags = {
    category: Flags.string({
      char: "c",
      description: "Filter by category path (includes subcategories)",
    }),
    tag: Flags.string({
      char: "t",
      description: "Filter by tag (repeatable, AND logic)",
      multiple: true,
    }),
    search: Flags.string({ char: "s", description: "Full-text search on URL and title" }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(BookmarkList)

    const program = Effect.gen(function* () {
      const svc = yield* BookmarkService
      return yield* svc.list({
        categoryPath: flags.category,
        tags: flags.tag,
        search: flags.search,
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
