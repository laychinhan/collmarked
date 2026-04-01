import { type Kysely, sql } from "kysely"
import type { Database } from "../schema.js"

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("bookmark_content")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("bookmark_id", "integer", (col) =>
      col.notNull().unique().references("bookmarks.id").onDelete("cascade")
    )
    .addColumn("markdown", "text", (col) => col.notNull())
    .addColumn("fetched_at", "text", (col) =>
      col.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`)
    )
    .execute()

  await sql`CREATE VIRTUAL TABLE IF NOT EXISTS bookmark_content_fts USING fts5(
    markdown,
    content='bookmark_content',
    content_rowid='id'
  )`.execute(db)

  await sql`INSERT OR IGNORE INTO bookmark_content_fts(rowid, markdown)
    SELECT id, markdown FROM bookmark_content`.execute(db)

  await sql`CREATE TRIGGER IF NOT EXISTS bookmark_content_ai AFTER INSERT ON bookmark_content BEGIN
    INSERT INTO bookmark_content_fts(rowid, markdown) VALUES (new.id, new.markdown);
  END`.execute(db)

  await sql`CREATE TRIGGER IF NOT EXISTS bookmark_content_ad AFTER DELETE ON bookmark_content BEGIN
    INSERT INTO bookmark_content_fts(bookmark_content_fts, rowid, markdown)
    VALUES ('delete', old.id, old.markdown);
  END`.execute(db)

  await sql`CREATE TRIGGER IF NOT EXISTS bookmark_content_au AFTER UPDATE ON bookmark_content BEGIN
    INSERT INTO bookmark_content_fts(bookmark_content_fts, rowid, markdown)
    VALUES ('delete', old.id, old.markdown);
    INSERT INTO bookmark_content_fts(rowid, markdown) VALUES (new.id, new.markdown);
  END`.execute(db)
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS bookmark_content_au`.execute(db)
  await sql`DROP TRIGGER IF EXISTS bookmark_content_ad`.execute(db)
  await sql`DROP TRIGGER IF EXISTS bookmark_content_ai`.execute(db)
  await sql`DROP TABLE IF EXISTS bookmark_content_fts`.execute(db)
  await db.schema.dropTable("bookmark_content").ifExists().execute()
}
