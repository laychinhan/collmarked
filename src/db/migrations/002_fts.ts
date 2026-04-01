import { type Kysely, sql } from "kysely"
import type { Database } from "../schema.js"

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
    url,
    title,
    description,
    content='bookmarks',
    content_rowid='id'
  )`.execute(db)

  await sql`INSERT OR IGNORE INTO bookmarks_fts(rowid, url, title, description)
    SELECT id, url, coalesce(title, ''), coalesce(description, '') FROM bookmarks`.execute(db)

  await sql`CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(rowid, url, title, description)
    VALUES (new.id, new.url, coalesce(new.title,''), coalesce(new.description,''));
  END`.execute(db)

  await sql`CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, url, title, description)
    VALUES ('delete', old.id, old.url, coalesce(old.title,''), coalesce(old.description,''));
  END`.execute(db)

  await sql`CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, url, title, description)
    VALUES ('delete', old.id, old.url, coalesce(old.title,''), coalesce(old.description,''));
    INSERT INTO bookmarks_fts(rowid, url, title, description)
    VALUES (new.id, new.url, coalesce(new.title,''), coalesce(new.description,''));
  END`.execute(db)
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS bookmarks_au`.execute(db)
  await sql`DROP TRIGGER IF EXISTS bookmarks_ad`.execute(db)
  await sql`DROP TRIGGER IF EXISTS bookmarks_ai`.execute(db)
  await sql`DROP TABLE IF EXISTS bookmarks_fts`.execute(db)
}
