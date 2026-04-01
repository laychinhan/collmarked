import { Effect } from "effect"
import { FileMigrationProvider, Migrator } from "kysely"
import { readdir } from "node:fs/promises"
import * as path from "node:path"
import { KyselyDb } from "./kysely.js"
import { DbError } from "../errors/index.js"
import { getMigrationsDir } from "../utils/config.js"

export const runMigrations = Effect.gen(function* () {
  const db = yield* KyselyDb

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs: { readdir },
      path,
      migrationFolder: getMigrationsDir(),
    }),
  })

  const { error, results } = yield* Effect.tryPromise({
    try: () => migrator.migrateToLatest(),
    catch: (e) => new DbError({ message: "Migration failed", cause: e }),
  })

  if (error) {
    return yield* Effect.fail(new DbError({ message: String(error), cause: error }))
  }

  return results ?? []
})
