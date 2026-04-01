# PRD: Bookmark Digest (LLM Summary & Key Takeaways)

## Problem Statement

After extracting the readable content of a bookmarked page (via `bookmark extract`), users have raw markdown stored locally but no quick way to understand what the page is about. Reading through potentially long markdown is time-consuming. This feature adds an on-demand `bookmark digest` command that sends the stored markdown to an LLM and returns a concise summary and key takeaways.

## Solution

Add `collmarked bookmark digest <id> [--force] [--provider] [--model] [--takeaways]` that reads the previously extracted markdown for a bookmark, sends it to a configured LLM provider, parses the structured JSON response, stores it in the database, and prints it to stdout. The LLM provider is interchangeable via dependency injection — initially only Copilot is implemented, but the architecture supports OpenAI, Gemini, and Anthropic without structural changes.

## User Stories

1. As a CLI user, I want to run `bookmark digest <id>` to get an AI-generated summary and key takeaways of an extracted bookmark's content.
2. As a CLI user, I want the digest stored in the database so I don't have to call the LLM repeatedly.
3. As a CLI user, I want a clear error if I try to digest a bookmark whose content hasn't been extracted yet, so I know to run `bookmark extract` first.
4. As a CLI user, I want a `--force` flag to regenerate an existing digest, overwriting the previous one.
5. As a CLI user, I want to control how many key takeaways are generated via `--takeaways <n>` (default: 5).
6. As a CLI user, I want to select the LLM provider via `--provider` or `COLLMARKED_LLM_PROVIDER` env var.
7. As a CLI user, I want to select the model via `--model` or `COLLMARKED_MODEL` env var, with a sensible per-provider default.
8. As a CLI user, I want the command to output the full result as JSON (summary + takeaways + metadata), consistent with other commands.
9. As a CLI user, I want the command to fail with a clear error if the LLM call fails (network issue, auth failure, quota exceeded).
10. As a CLI user, I want the stored digest to record which provider and model generated it, so I can track provenance.

## Implementation Decisions

### Command

```
collmarked bookmark digest <id> [--force] [--provider copilot|openai|gemini|anthropic] [--model <name>] [--takeaways <n>]
```

- `<id>` — required, numeric bookmark ID.
- `--force` / `-f` — overwrite existing digest.
- `--provider` — LLM provider; overrides `COLLMARKED_LLM_PROVIDER` env var (default: `copilot`).
- `--model` — model name; overrides `COLLMARKED_MODEL` env var (provider-specific default if not set).
- `--takeaways` — number of key takeaways to generate (default: 5).

### Preconditions

If no row exists in `bookmark_content` for the given bookmark ID, the command fails immediately with a descriptive `NotFoundError` (or a dedicated `ContentNotExtractedError`) and instructs the user to run `bookmark extract <id>` first. It does **not** auto-extract.

### DB Schema (Migration 004)

New table: `bookmark_digest`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `bookmark_id` INTEGER NOT NULL UNIQUE — FK to `bookmarks(id)` ON DELETE CASCADE
- `data` TEXT NOT NULL — JSON string: `{ "summary": "...", "takeaways": ["...", "..."] }`
- `provider` TEXT NOT NULL — e.g. `"copilot"`, `"openai"`
- `model` TEXT NOT NULL — e.g. `"gpt-5"`, `"claude-sonnet-4.5"`
- `generated_at` TEXT NOT NULL DEFAULT `(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`

No FTS on digest content (not in scope).

### LLM Provider Architecture

**`LlmProvider` Context.Tag** — the single interchangeable interface:

```typescript
interface LlmProviderService {
  complete(input: {
    system: string
    user: string
    model?: string
  }): Effect.Effect<string, LlmError>
}

class LlmProvider extends Context.Tag("LlmProvider")<LlmProvider, LlmProviderService>() {}
```

**Implementations (only Copilot built now):**
- `CopilotLlmProviderLive` — uses `@github/copilot-sdk`. Spawns `CopilotClient`, creates a session, sends the prompt via `sendAndWait()`, returns the assistant message content.
- `OpenAiLlmProviderLive` *(stub / future)*
- `GeminiLlmProviderLive` *(stub / future)*
- `AnthropicLlmProviderLive` *(stub / future)*

**Provider selection at command time:**
```
COLLMARKED_LLM_PROVIDER=copilot  (env default)
--provider copilot               (flag override)
```
The command reads the resolved provider name and provides the correct `Layer` before running the Effect program.

**Model selection:**
```
COLLMARKED_MODEL=gpt-5           (env var)
--model claude-sonnet-4.5        (flag override)
```
If neither is set, a hardcoded default is used per provider (e.g. `gpt-5` for Copilot).

**Authentication (env vars, not stored):**
| Provider | Env var(s) |
|---|---|
| Copilot | `GITHUB_TOKEN`, `GH_TOKEN`, or `COPILOT_GITHUB_TOKEN` |
| OpenAI | `OPENAI_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |

The Copilot SDK also falls back to the logged-in `copilot` CLI user if no token env var is set.

### Prompt Design

**System message:**
```
You are a precise summarizer. Given the markdown content of a web page, respond with ONLY a valid JSON object — no markdown fences, no prose — in this exact shape:
{"summary":"<one paragraph>","takeaways":["<point>","<point>",...]}
Use exactly <n> items in the takeaways array. Be concise and factual.
```

**User message:**
```
<raw markdown from bookmark_content.markdown>
```

The service parses the LLM's string response as JSON. If parsing fails, it fails with `LlmError`.

### New Modules

**`LlmError`** — new `Data.TaggedError` in `src/errors/index.ts`:
```typescript
export class LlmError extends Data.TaggedError("LlmError")<{ message: string; cause?: unknown }> {}
```

**`ContentNotExtractedError`** — new `Data.TaggedError`:
```typescript
export class ContentNotExtractedError extends Data.TaggedError("ContentNotExtractedError")<{ bookmarkId: number }> {}
```

**`DigestRepo`** (`Context.Tag`):
- `save(data): Effect<BookmarkDigest, DbError | ConflictError>`
- `upsert(data): Effect<BookmarkDigest, DbError>`
- `findByBookmarkId(id): Effect<BookmarkDigest | null, DbError>`

**`LlmProvider`** (`Context.Tag`) — as described above.

**`CopilotLlmProviderLive`** (`Layer`) — concrete implementation using `@github/copilot-sdk`:
- Creates `CopilotClient` (reads `GITHUB_TOKEN`/`GH_TOKEN`/`COPILOT_GITHUB_TOKEN`)
- On each `complete()` call: `client.start()` → `createSession()` → `sendAndWait()` → `client.stop()`
- Alternatively, client lifecycle can be managed at the Layer level (start once, stop on layer teardown)
- Parses response from `AssistantMessageEvent.data.content`

**`DigestService`** (`Context.Tag`):
- `digest(bookmarkId, force, opts: { model?, takeaways? }): Effect<BookmarkDigest, NotFoundError | ContentNotExtractedError | LlmError | ConflictError | DbError>`
- Pipeline:
  1. `BookmarkRepo.findById(bookmarkId)` → `NotFoundError` if missing
  2. `ContentRepo.findByBookmarkId(bookmarkId)` → `ContentNotExtractedError` if null
  3. Build system + user prompt with `opts.takeaways` (default 5)
  4. `LlmProvider.complete({ system, user, model: opts.model })`
  5. Parse JSON response → `LlmError` if invalid JSON
  6. `force ? DigestRepo.upsert(...) : DigestRepo.save(...)` — `ConflictError` if exists and no force
- Dependencies: `BookmarkRepo`, `ContentRepo`, `DigestRepo`, `LlmProvider`

**`bookmark digest` command** (`src/commands/bookmark/digest.ts`):
- Reads flags; resolves provider name and model
- Selects the correct `LlmProvider` layer based on resolved provider
- Provides all layers and runs the Effect program
- Outputs `JSON.stringify(result, null, 2)` on success
- `this.error(JSON.stringify({ error, message }))` on failure

### `BookmarkWithTags` extension

`BookmarkWithTags` gains an optional field (populated in Phase 4 if needed):
```typescript
digest?: { summary: string; takeaways: string[]; provider: string; model: string; generated_at: string } | null
```
*(Lower priority — not part of the initial implementation scope.)*

## Testing Decisions

**No `vi.mock`.** All tests use `Layer.succeed(...)` in-memory implementations.

**`DigestRepo` tests** (`tests/digest.repo.test.ts`):
- `save` returns a `BookmarkDigest` record.
- `save` twice without force → `ConflictError`.
- `upsert` overwrites existing content and updates `generated_at`.
- `findByBookmarkId` returns `null` when no digest exists.
- `findByBookmarkId` returns the stored digest.

**`DigestService` tests** (`tests/digest.service.test.ts`) — mock `LlmProvider` via `Layer.succeed`:
- Success: returns stored `BookmarkDigest` with parsed summary and takeaways.
- Fails with `ContentNotExtractedError` when no content in DB.
- Fails with `NotFoundError` when bookmark doesn't exist.
- Fails with `ConflictError` when digest exists and `force = false`.
- Overwrites when `force = true`.
- Fails with `LlmError` when LLM returns invalid JSON.
- Fails with `LlmError` when LLM provider itself fails.

## Out of Scope

- Streaming LLM responses to terminal.
- Searching through digest content via `--search`.
- Surfacing digest in `bookmark show` / `findById` output.
- Implementing OpenAI, Gemini, or Anthropic providers (architecture only).
- Caching or batching LLM calls.
- Configuring the LLM prompt via flags or config file.
- Rate limiting or retry logic.

## Further Notes

- The Copilot SDK (`@github/copilot-sdk`) is in **technical preview** and may have breaking changes.
- The SDK requires the `copilot` CLI to be installed separately and available in `PATH` (or `COPILOT_CLI_PATH` env var). This is a runtime prerequisite, not a Node.js dependency.
- The Copilot SDK manages the CLI process lifecycle. For a short-lived CLI command (not a long-running server), `client.start()` / `client.stop()` will be called per command invocation.
- The `data` column stores the raw JSON string. The service layer parses/serialises it; the repo stores and retrieves it as a string. The `BookmarkDigest` type exposes a `data` string field; the service deserialises it into `{ summary, takeaways }`.
- Provider selection is resolved in the command layer (not the service layer), keeping the service provider-agnostic.
