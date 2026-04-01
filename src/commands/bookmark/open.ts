import { Command, Args } from "@oclif/core"
import { Effect } from "effect"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import { BookmarkService, BookmarkServiceLive } from "../../services/bookmark.service.js"
import { BookmarkRepoLive } from "../../repositories/bookmark.repo.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

const execAsync = promisify(exec)

async function openUrl(url: string): Promise<void> {
  const platform = process.platform
  if (platform === "darwin") await execAsync(`open "${url}"`)
  else if (platform === "win32") await execAsync(`start "" "${url}"`)
  else await execAsync(`xdg-open "${url}"`)
}

export default class BookmarkOpen extends Command {
  static description = "Open a bookmark URL in the default browser"
  static args = {
    id: Args.integer({ description: "Bookmark ID", required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(BookmarkOpen)

    const program = Effect.gen(function* () {
      const svc = yield* BookmarkService
      return yield* svc.findById(args.id)
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

    if (result) {
      await openUrl(result.url)
      this.log(JSON.stringify({ opened: result.url }, null, 2))
    }
  }
}
