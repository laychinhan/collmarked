# PRD: Bookmark Content Extraction

## Problem Statement

Users who save bookmarks via Collmarked often want to retain the content of those pages for offline reading, search, or reference — even if the URL later becomes unavailable. Currently, Collmarked only stores metadata (URL, title, description) and organizational data (categories, tags), making it impossible to read or search through the actual content of a bookmarked page without visiting it again.

## Solution

Add an on-demand `bookmark extract` command that fetches a saved bookmark's URL, extracts its main readable content (stripping navigation, ads, and boilerplate), converts it to clean markdown, and stores it in the database. The extracted content will be included when viewing a bookmark's details and will become searchable via the existing `--search` filter.

## User Stories

1. As a CLI user, I want to extract the content of a saved bookmark by its ID, so that I can read it offline later.
2. As a CLI user, I want extracted content stored in markdown format, so that it is readable and portable.
3. As a CLI user, I want extracted content stored in the database, so that I don't have to manage separate files.
4. As a CLI user, I want to re-extract content from a bookmark by passing `--force`, so that I can refresh stale or outdated content.
5. As a CLI user, I want the system to error (not silently overwrite) if content already exists and I haven't passed `--force`, so that I don't accidentally lose anything.
6. As a CLI user, I want to see extracted markdown content when I run `collmarked bookmark show <id>`, so that a single command gives me everything about a bookmark.
7. As a CLI user, I want to search through extracted content using `collmarked bookmark list --search <query>`, so that I can find bookmarks by what they say, not just their title or description.
8. As a CLI user, I want the command to fail with a clear error if the bookmark ID doesn't exist, so that I get useful feedback.
9. As a CLI user, I want the command to fail with a clear error if the HTTP request fails (e.g., 404, network timeout), so that I understand why content wasn't extracted.
10. As a CLI user, I want the command to fail gracefully if the page has no extractable readable content (e.g., a login page, empty body), so that I get a meaningful error rather than storing empty markdown.
11. As a CLI user, I want to see a timestamp for when content was last fetched, so that I can judge how fresh it is.
12. As a CLI user, I want the output of `bookmark extract` to be JSON (consistent with other commands), so that scripts can parse and consume it.

## Implementation Decisions

### New Command

- `collmarked bookmark extract <id>` — `<id>` is the numeric bookmark ID.
- `--force` flag: if content already exists for this bookmark and `--force` is not passed, the command exits with a `ConflictError`; with `--force`, existing content is overwritten.

### New Modules

**ContentFetcher** (`Context.Tag`)
- Wraps Node's built-in `fetch` in an Effect.
- Accepts a URL string, returns raw HTML string.
- Fails with a new `FetchError` (`Data.TaggedError`) on network errors, non-2xx responses, or timeout.

**ContentExtractor** (`Context.Tag`)
- Uses `@mozilla/readability` (with `linkedom` for DOM parsing — lighter than jsdom) to extract the main article content from raw HTML.
- Accepts `{ html: string; url: string }` — the URL is required by Readability for relative link resolution.
- Returns `{ title: string; content: string }` where `content` is the readable HTML fragment.
- Fails with a new `ExtractionError` if no readable content can be extracted.

**MarkdownConverter** (plain function, no Effect wrapper)
- Uses `turndown` to convert readable HTML → markdown string.
- Stateless and synchronous — does not need to be a `Context.Tag`.

**ContentRepo** (`Context.Tag`)
- Methods:
  - `save(data: { bookmarkId: number; markdown: string }): Effect<BookmarkContent, DbError | ConflictError>`
  - `upsert(data: { bookmarkId: number; markdown: string }): Effect<BookmarkContent, DbError>` — used when `--force` is passed.
  - `findByBookmarkId(bookmarkId: number): Effect<BookmarkContent | null, DbError>`

**ContentService** (`Context.Tag`)
- Orchestrates the full pipeline: look up bookmark → fetch HTML → extract readable content → convert to markdown → store.
- Method: `extract(bookmarkId: number, force: boolean): Effect<BookmarkContent, NotFoundError | FetchError | ExtractionError | ConflictError | DbError>`
- Dependencies injected: `BookmarkRepo`, `ContentRepo`, `ContentFetcher`, `ContentExtractor`.

### Schema Changes (Migration 003)

New table: `bookmark_content`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `bookmark_id` INTEGER NOT NULL UNIQUE — FK to `bookmarks(id)` ON DELETE CASCADE
- `markdown` TEXT NOT NULL
- `fetched_at` TEXT NOT NULL DEFAULT `(datetime('now'))` — UTC ISO 8601, consistent with existing timestamps

New FTS5 virtual table: `bookmark_content_fts`
- Content-backed on `bookmark_content`, indexing the `markdown` column.
- Three triggers to keep it in sync on INSERT, UPDATE, DELETE — same pattern as `002_fts.ts`.

### FTS Search Integration

`BookmarkRepo.list()` currently applies an FTS subquery against `bookmarks_fts`. When `filters.search` is provided, the search will also query `bookmark_content_fts` and union the matching bookmark IDs with those from `bookmarks_fts`. The combined, deduplicated set of IDs is used to filter results.

### Updated `findById` / Show

`BookmarkRepo.findById` (or `BookmarkService.findById`) will be extended to LEFT JOIN `bookmark_content` and include the content if it exists. The `BookmarkWithTags` type gains an optional field:

```
content?: { markdown: string; fetched_at: string } | null
```

### New Errors

- `FetchError` — HTTP fetch failed (network error, non-2xx status, timeout)
- `ExtractionError` — no readable content could be extracted from the page

## Testing Decisions

**What makes a good test:** Tests validate external behavior (inputs and outputs of a service or repo method) without depending on implementation details. No `vi.mock` — instead, provide in-memory `Layer.succeed(...)` implementations per the existing pattern in `test.layer.ts` and `bookmark.service.test.ts`.

**ContentRepo tests** (using an in-memory SQLite or in-memory store layer):
- Saving content for a bookmark returns a `BookmarkContent` record.
- Saving twice without force returns a `ConflictError`.
- Upserting overwrites existing content and updates `fetched_at`.
- `findByBookmarkId` returns `null` when no content exists.
- `findByBookmarkId` returns the stored content when it exists.
- Prior art: follow the `Layer.succeed` + in-memory store pattern from `makeBookmarkRepoTest()`.

**ContentService tests** (mock `ContentFetcher` and `ContentExtractor` via `Layer.succeed`):
- Extracting content for a valid bookmark stores markdown and returns `BookmarkContent`.
- Extracting when content already exists (no force) fails with `ConflictError`.
- Extracting with `--force` overwrites and returns updated `BookmarkContent`.
- Extracting for a non-existent bookmark ID fails with `NotFoundError`.
- A failing HTTP fetch (`FetchError` from mock `ContentFetcher`) propagates correctly.
- A failing extraction (`ExtractionError` from mock `ContentExtractor`) propagates correctly.
- Prior art: follow the `makeTestLayer()` + `run()` pattern from `bookmark.service.test.ts`.

## Out of Scope

- Automatically fetching content when a bookmark is added (always on-demand).
- Rendering markdown to the terminal (raw markdown is returned as a JSON field).
- Support for JavaScript-rendered pages (only static HTML is fetched).
- Authentication or cookies for paywalled pages.
- Rate limiting or robots.txt compliance.
- Scheduling periodic re-fetches.
- Exporting content to files on disk.
- Editing or annotating extracted content.

## Further Notes

- `@mozilla/readability` requires a DOM environment. In Node.js, `linkedom` is used as a lightweight companion to parse HTML into a DOM object before passing it to Readability. This is preferable to `jsdom` due to significantly smaller install size.
- The markdown content can be arbitrarily large for long articles. SQLite TEXT columns have no enforced length limit.
- The `fetched_at` timestamp is stored in UTC ISO 8601 format, consistent with `created_at` and `updated_at` on the bookmarks table.
