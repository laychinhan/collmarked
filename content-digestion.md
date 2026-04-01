# Content Digestion Implementation Guide

This document explains the implementation of two interconnected features added to Collmarked: **Content Extraction** and **Bookmark Digest**.

## Overview

The content digestion system enables users to:
1. Extract readable markdown content from bookmarked URLs
2. Generate AI-powered summaries and key takeaways from that content

Together, these features transform bookmarks from simple metadata references into rich, searchable, and summarizable knowledge artifacts.

---

## Phase 1: Bookmark Content Extraction

### Problem Statement

Users need a way to preserve the actual content of bookmarked pages for offline reading, searching, and reference — without relying on the URL remaining available.

### Solution Architecture

The extraction pipeline consists of three specialized modules working in tandem:

```
URL → ContentFetcher → HTML → ContentExtractor → Readable HTML → MarkdownConverter → Markdown
```

#### 1. **ContentFetcher Service**
- **Purpose**: Safely fetch raw HTML from a URL
- **Implementation**: Wraps Node's built-in `fetch` in an Effect
- **Errors**: Fails with `FetchError` on network errors, non-2xx responses, or timeouts
- **Dependencies**: None (pure HTTP)

#### 2. **ContentExtractor Service**
- **Purpose**: Extract main article content from noisy HTML
- **Technology**: Uses `@mozilla/readability` with `linkedom` for DOM parsing
- **Implementation**: Takes raw HTML + URL, returns cleaned article content
- **Errors**: Fails with `ExtractionError` if no readable content found
- **Why linkedom?**: Lightweight alternative to jsdom (smaller install size, faster)

#### 3. **MarkdownConverter Function**
- **Purpose**: Convert HTML article to markdown
- **Technology**: Uses `turndown` library
- **Implementation**: Stateless, synchronous function (not a Context.Tag)
- **Output**: Clean, portable markdown string

#### 4. **ContentService**
- **Purpose**: Orchestrate the full extraction pipeline
- **Flow**:
  1. Lookup bookmark by ID (fail with `NotFoundError` if missing)
  2. Fetch HTML from bookmark URL
  3. Extract readable content
  4. Convert to markdown
  5. Store in database
- **Conflict handling**: By default, fails with `ConflictError` if content already exists; `--force` overwrites

### Database Schema

New table: `bookmark_content`
```sql
CREATE TABLE bookmark_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bookmark_id INTEGER NOT NULL UNIQUE,  -- FK to bookmarks(id) ON DELETE CASCADE
  markdown TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))  -- ISO 8601 UTC
)
```

### Full-Text Search Integration

- New FTS5 virtual table: `bookmark_content_fts`
- Content-backed on `bookmark_content`, indexing the `markdown` column
- Three triggers (INSERT, UPDATE, DELETE) keep it in sync
- When searching with `--search`, results include both title/URL and content matches

### Command Interface

```bash
collmarked bookmark extract <id> [--force]
```

**Flags:**
- `--force` / `-f`: Overwrite existing content

**Output**: JSON containing the extracted `BookmarkContent`:
```json
{
  "id": 1,
  "bookmarkId": 42,
  "markdown": "# Article Title\n\nArticle content in markdown...",
  "fetchedAt": "2026-04-01T10:30:00Z"
}
```

### Testing Strategy

**No mocks** — all tests use `Layer.succeed(...)` in-memory implementations:

- **ContentRepo tests**: Save, upsert, conflict detection, find by bookmark ID
- **ContentService tests**: 
  - Happy path with mocked fetcher/extractor
  - Conflict detection
  - Error propagation (FetchError, ExtractionError, NotFoundError)

---

## Phase 2: Bookmark Digest (LLM Summary)

### Problem Statement

After extracting content, users still face a time-consuming read. An AI-powered digest that generates a summary and key takeaways dramatically reduces cognitive load.

### Solution Architecture

The digest pipeline leverages an interchangeable LLM provider abstraction:

```
Markdown Content → LlmProvider.complete() → JSON Response → Parse → Store Digest
```

#### 1. **LlmProvider Interface** (Context.Tag)
- **Purpose**: Abstraction layer for any LLM service
- **Method**: `complete(input: { system: string; user: string; model?: string }): Effect<string, LlmError>`
- **Design**: Provider-agnostic; enables pluggable implementations

#### 2. **CopilotLlmProviderLive** (Current Implementation)
- **Uses**: `@github/copilot-sdk`
- **Lifecycle**: 
  - `client.start()` — starts the Copilot CLI process
  - `client.createSession()` — creates an LLM session
  - `session.sendAndWait()` — sends prompt and waits for response
  - `client.stop()` — stops the CLI process
- **Authentication**: Reads `GITHUB_TOKEN`, `GH_TOKEN`, or `COPILOT_GITHUB_TOKEN` env vars
- **Note**: Copilot CLI must be installed separately and in PATH

#### 3. **DigestService**
- **Purpose**: Orchestrate digest generation
- **Flow**:
  1. Verify bookmark exists (fail: `NotFoundError`)
  2. Verify content was extracted (fail: `ContentNotExtractedError`)
  3. Build system prompt with takeaway count and user prompt with markdown
  4. Call LLM provider
  5. Parse JSON response
  6. Store digest in database (with provider/model metadata)
- **Conflict handling**: Similar to extraction — `--force` overwrites

#### 4. **DigestRepo**
- **Methods**: `save()`, `upsert()`, `findByBookmarkId()`
- **Follows**: Same pattern as ContentRepo

### Prompt Design

**System Message** (instructs LLM):
```
You are a precise summarizer. Given the markdown content of a web page, respond with ONLY a valid JSON object — no markdown fences, no prose — in this exact shape:
{"summary":"<one paragraph>","takeaways":["<point>","<point>",...]}
Use exactly <n> items in the takeaways array. Be concise and factual.
```

**User Message**: The raw markdown from `bookmark_content.markdown`

**Response**: Parsed JSON with structure:
```json
{
  "summary": "One-paragraph summary of the content",
  "takeaways": [
    "Key point 1",
    "Key point 2",
    "Key point 3"
  ]
}
```

### Database Schema

New table: `bookmark_digest`
```sql
CREATE TABLE bookmark_digest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bookmark_id INTEGER NOT NULL UNIQUE,  -- FK to bookmarks(id) ON DELETE CASCADE
  data TEXT NOT NULL,                   -- JSON: { "summary": "...", "takeaways": [...] }
  provider TEXT NOT NULL,               -- e.g., "copilot"
  model TEXT NOT NULL,                  -- e.g., "gpt-5"
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
)
```

### Command Interface

```bash
collmarked bookmark digest <id> [--force] [--provider copilot] [--model gpt-5] [--takeaways 5]
```

**Flags:**
- `--force` / `-f`: Regenerate existing digest
- `--provider` / `-p`: LLM provider (default: `copilot`); overridable by `COLLMARKED_LLM_PROVIDER` env var
- `--model` / `-m`: Model name; overridable by `COLLMARKED_MODEL` env var
- `--takeaways` / `-n`: Number of key takeaways (default: 5)

**Output**: JSON containing the digest:
```json
{
  "id": 1,
  "bookmarkId": 42,
  "data": {
    "summary": "A concise one-paragraph summary...",
    "takeaways": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"]
  },
  "provider": "copilot",
  "model": "gpt-5",
  "generatedAt": "2026-04-01T10:35:00Z"
}
```

### Provider Selection

**Priority** (highest to lowest):
1. `--provider` command-line flag
2. `COLLMARKED_LLM_PROVIDER` environment variable
3. Default: `copilot`

**Model Selection**:
1. `--model` command-line flag
2. `COLLMARKED_MODEL` environment variable
3. Provider-specific default (e.g., `gpt-5` for Copilot)

### Testing Strategy

**No mocks** — all tests use `Layer.succeed(...)`:

- **DigestRepo tests**: Save, upsert, find by bookmark ID
- **DigestService tests**:
  - Happy path with mocked LLM provider
  - Precondition failures (bookmark not found, content not extracted)
  - Conflict detection with and without `--force`
  - Invalid JSON response from LLM
  - LLM provider errors

### Future Provider Support

The architecture supports pluggable providers without structural changes:

- `OpenAiLlmProviderLive` — uses OpenAI API (auth: `OPENAI_API_KEY`)
- `GeminiLlmProviderLive` — uses Google Gemini (auth: `GEMINI_API_KEY`)
- `AnthropicLlmProviderLive` — uses Anthropic Claude (auth: `ANTHROPIC_API_KEY`)

---

## Integration Points

### 1. `bookmark list` Enhancement

When using `--search`, results now include matches from:
- Bookmark URL and title (existing)
- **Extracted content (new)**

Example:
```bash
collmarked bookmark list --search "kubernetes"
# Returns bookmarks where "kubernetes" appears in URL, title, OR extracted markdown
```

### 2. `bookmark show` Enhancement (Future)

Currently, `bookmark show` would display bookmark metadata. Future enhancement could include extracted content and digest.

### 3. Error Handling

New errors introduced:
- `FetchError` — HTTP fetch failed
- `ExtractionError` — no readable content in HTML
- `ContentNotExtractedError` — digest requested but content not extracted
- `LlmError` — LLM provider error or invalid response

All propagate through the Effect system with clear error tags and messages.

---

## Workflow Example

```bash
# Step 1: Add a bookmark
collmarked bookmark add https://example.com/article \
  --category tech/articles \
  --tag kubernetes \
  --title "K8s Best Practices"

# Step 2: Extract content (makes HTTP request, stores markdown)
collmarked bookmark extract 42

# Step 3: Generate digest (calls LLM, stores summary + takeaways)
collmarked bookmark digest 42 --takeaways 5

# Step 4: Search across bookmarks and content
collmarked bookmark list --search "kubernetes clustering"
# Returns bookmarks where term appears in URL, title, or extracted content
```

---

## Out of Scope

### Content Extraction
- Automatically extracting when bookmark is added (always on-demand)
- Rendering markdown to terminal (raw markdown returned as JSON)
- JavaScript-rendered pages (only static HTML)
- Authentication for paywalled content
- Rate limiting or robots.txt compliance
- Scheduling periodic re-fetches

### Bookmark Digest
- Streaming LLM responses
- Searching through digest content
- Surfacing digest in `bookmark show`
- Multiple LLM provider implementations (architecture only)
- Caching or batching LLM calls
- Configurable prompts via flags/config

---

## Technical Decisions

### Why Effect.ts?

The extraction and digest services use Effect for:
- **Composability**: Orchestrate multiple services (fetch → extract → convert → store)
- **Error handling**: Typed, exhaustive error matching
- **Dependency injection**: Swap implementations (e.g., test layers)
- **Consistency**: Aligns with existing Collmarked architecture

### Why linkedom + @mozilla/readability?

- **linkedom**: Lightweight DOM parser (vs jsdom) — reduces install size and startup time
- **@mozilla/readability**: Battle-tested content extraction from real websites

### Why Content + Digest are separate commands?

- **Decoupling**: Extract large amounts of content without incurring LLM costs
- **Incremental adoption**: Users can use extraction without digest (or vice versa)
- **Flexibility**: Re-extract content or re-generate digest independently with `--force`

### Why JSON responses only?

- Consistency with other CLI commands
- Enables scripting and tool integration
- Digest and content are potentially large; JSON is portable and parseable

---

## Migration Steps

### Running Migrations

```bash
collmarked db migrate
# Applies 003_bookmark_content and 004_bookmark_digest (or later)
```

### Recovery/Rollback

- Content and digest tables include `ON DELETE CASCADE` to bookmarks
- Deleting a bookmark cascades to content and digest
- No automatic data cleanup — use `DELETE FROM bookmark_content WHERE ...` if needed

---

## Conclusion

The content digestion system transforms Collmarked from a metadata-only bookmark manager into a **knowledge management tool**. Users can now extract, search, and summarize web content directly from the CLI, with LLM-powered insights that turn content into actionable takeaways.
