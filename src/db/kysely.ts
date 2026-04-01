import { Context, Effect, Layer } from "effect"
import Database from "better-sqlite3"
import { Kysely, SqliteDialect } from "kysely"
import type { Database as DB } from "./schema.js"
import { getDbPath } from "../utils/config.js"
import { DbError } from "../errors/index.js"

export class KyselyDb extends Context.Tag("KyselyDb")<KyselyDb, Kysely<DB>>() {}

export const KyselyDbLive = Layer.scoped(
  KyselyDb,
  Effect.acquireRelease(
    Effect.try({
      try: () => {
        const dbPath = getDbPath()
        const sqlite = new Database(dbPath)
        sqlite.pragma("journal_mode = WAL")
        sqlite.pragma("foreign_keys = ON")
        return new Kysely<DB>({
          dialect: new SqliteDialect({ database: sqlite }),
        })
      },
      catch: (e) => new DbError({ message: "Failed to open database", cause: e }),
    }),
    (db) => Effect.promise(() => db.destroy())
  )
)
