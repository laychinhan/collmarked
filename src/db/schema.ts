import type { Generated, Selectable, Insertable, Updateable } from "kysely"

export interface CategoryTable {
  id: Generated<number>
  name: string
  parent_id: number | null
  created_at: Generated<string>
}

export interface BookmarkTable {
  id: Generated<number>
  url: string
  title: string | null
  description: string | null
  category_id: number
  created_at: Generated<string>
  updated_at: Generated<string>
}

export interface TagTable {
  id: Generated<number>
  name: string
}

export interface BookmarkTagTable {
  bookmark_id: number
  tag_id: number
}

export interface BookmarkContentTable {
  id: Generated<number>
  bookmark_id: number
  markdown: string
  fetched_at: Generated<string>
}

export interface BookmarkDigestTable {
  id: Generated<number>
  bookmark_id: number
  data: string
  provider: string
  model: string
  generated_at: Generated<string>
}

export interface Database {
  bookmarks: BookmarkTable
  categories: CategoryTable
  tags: TagTable
  bookmark_tags: BookmarkTagTable
  bookmark_content: BookmarkContentTable
  bookmark_digest: BookmarkDigestTable
}

export type Category = Selectable<CategoryTable>
export type NewCategory = Insertable<CategoryTable>
export type CategoryUpdate = Updateable<CategoryTable>

export type Bookmark = Selectable<BookmarkTable>
export type NewBookmark = Insertable<BookmarkTable>
export type BookmarkUpdate = Updateable<BookmarkTable>

export type Tag = Selectable<TagTable>
export type NewTag = Insertable<TagTable>

export type BookmarkTag = Selectable<BookmarkTagTable>

export type BookmarkContent = Selectable<BookmarkContentTable>
export type NewBookmarkContent = Insertable<BookmarkContentTable>
export type BookmarkContentUpdate = Updateable<BookmarkContentTable>

export type BookmarkDigest = Selectable<BookmarkDigestTable>
export type NewBookmarkDigest = Insertable<BookmarkDigestTable>
export type BookmarkDigestUpdate = Updateable<BookmarkDigestTable>
