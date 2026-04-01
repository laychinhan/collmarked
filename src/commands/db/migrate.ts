import { Command } from "@oclif/core"
import { Effect } from "effect"
import { runMigrations } from "../../db/migrate.js"
import { AppLayer } from "../../layers/app.layer.js"

export default class DbMigrate extends Command {
  static description = "Run database migrations"

  async run(): Promise<void> {
    const program = Effect.gen(function* () {
      const results = yield* runMigrations

      if (results.length === 0) {
        return { message: "No pending migrations" }
      }

      const applied = results.filter((r) => r.status === "Success").map((r) => r.migrationName)

      return { applied, message: `Applied ${applied.length} migration(s)` }
    })

    const result = await Effect.runPromise(program.pipe(Effect.provide(AppLayer)))

    this.log(JSON.stringify(result, null, 2))
  }
}
