import { Command, Args, Flags } from "@oclif/core"
import { Effect } from "effect"
import { ContentService, ContentServiceLive } from "../../services/content.service.js"
import { ContentFetcherLive } from "../../services/content-fetcher.service.js"
import { ContentExtractorLive } from "../../services/content-extractor.service.js"
import { ContentRepoLive } from "../../repositories/content.repo.js"
import { BookmarkRepoLive } from "../../repositories/bookmark.repo.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

export default class BookmarkExtract extends Command {
  static description = "Extract and store the readable content of a bookmarked URL as markdown"
  static args = {
    id: Args.integer({ description: "Bookmark ID", required: true }),
  }
  static flags = {
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing content if already extracted",
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(BookmarkExtract)

    const program = Effect.gen(function* () {
      const svc = yield* ContentService
      return yield* svc.extract(args.id, flags.force)
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(ContentServiceLive),
        Effect.provide(ContentFetcherLive),
        Effect.provide(ContentExtractorLive),
        Effect.provide(ContentRepoLive),
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
