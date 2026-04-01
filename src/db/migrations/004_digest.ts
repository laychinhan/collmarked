import { type Kysely, sql } from "kysely"
import type { Database } from "../schema.js"

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("bookmark_digest")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("bookmark_id", "integer", (col) =>
      col.notNull().unique().references("bookmarks.id").onDelete("cascade")
    )
    .addColumn("data", "text", (col) => col.notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("model", "text", (col) => col.notNull())
    .addColumn("generated_at", "text", (col) =>
      col.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`)
    )
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("bookmark_digest").ifExists().execute()
}
