import { type Kysely, sql } from "kysely"
import type { Database } from "../schema.js"

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("categories")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("parent_id", "integer", (col) =>
      col.references("categories.id").onDelete("restrict")
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`)
    )
    .execute()

  await db.schema
    .createTable("bookmarks")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("url", "text", (col) => col.notNull().unique())
    .addColumn("title", "text")
    .addColumn("description", "text")
    .addColumn("category_id", "integer", (col) =>
      col.notNull().references("categories.id").onDelete("restrict")
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`)
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`)
    )
    .execute()

  await db.schema
    .createTable("tags")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("name", "text", (col) => col.notNull().unique())
    .execute()

  await db.schema
    .createTable("bookmark_tags")
    .ifNotExists()
    .addColumn("bookmark_id", "integer", (col) =>
      col.notNull().references("bookmarks.id").onDelete("cascade")
    )
    .addColumn("tag_id", "integer", (col) =>
      col.notNull().references("tags.id").onDelete("cascade")
    )
    .addPrimaryKeyConstraint("pk_bookmark_tags", ["bookmark_id", "tag_id"])
    .execute()

  // Unique constraint: sibling category names must be unique
  await db.schema
    .createIndex("idx_categories_name_parent")
    .ifNotExists()
    .on("categories")
    .columns(["name", "parent_id"])
    .unique()
    .execute()

  await db.schema
    .createIndex("idx_bookmarks_category")
    .ifNotExists()
    .on("bookmarks")
    .column("category_id")
    .execute()

  await db.schema
    .createIndex("idx_categories_parent")
    .ifNotExists()
    .on("categories")
    .column("parent_id")
    .execute()

  await db.schema
    .createIndex("idx_bookmark_tags_tag")
    .ifNotExists()
    .on("bookmark_tags")
    .column("tag_id")
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("idx_bookmark_tags_tag").ifExists().execute()
  await db.schema.dropIndex("idx_categories_parent").ifExists().execute()
  await db.schema.dropIndex("idx_bookmarks_category").ifExists().execute()
  await db.schema.dropIndex("idx_categories_name_parent").ifExists().execute()
  await db.schema.dropTable("bookmark_tags").ifExists().execute()
  await db.schema.dropTable("tags").ifExists().execute()
  await db.schema.dropTable("bookmarks").ifExists().execute()
  await db.schema.dropTable("categories").ifExists().execute()
}
