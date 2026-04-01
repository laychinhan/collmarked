# Collmarked CLI Commands Reference

Complete reference guide for all available Collmarked commands with descriptions, options, and examples.

---

## Bookmark Management

### `collmarked bookmark add`

Add a new bookmark with metadata and tags.

**Syntax:**
```bash
collmarked bookmark add <url> --category <path> [--tag <name>...] [--title <title>] [--description <desc>]
```

**Arguments:**
- `<url>` — **Required**. The URL to bookmark

**Flags:**
- `--category <path>` / `-c <path>` — **Required**. Category path using `/` as separator (e.g., `work/tools`)
- `--tag <name>` / `-t <name>` — Optional, repeatable. Assign tags to the bookmark
- `--title <title>` — Optional. Custom title for the bookmark (auto-detected if omitted)
- `--description <desc>` / `-d <desc>` — Optional. Description or notes about the bookmark

**Output:** JSON object with bookmark metadata and assigned ID

**Examples:**

```bash
# Basic bookmark with category only
collmarked bookmark add https://github.com/oclif/oclif \
  --category "dev/tools"

# Bookmark with title, description, and multiple tags
collmarked bookmark add https://kubernetes.io/docs/concepts/services-networking/ \
  --category "tech/kubernetes" \
  --tag distributed-systems \
  --tag infrastructure \
  --title "Kubernetes Services Guide" \
  --description "Comprehensive guide to Kubernetes service networking"

# Minimal with short flags
collmarked bookmark add https://example.com \
  -c "personal/articles" \
  -t reading \
  -t reference
```

---

### `collmarked bookmark list`

List bookmarks with optional filtering by category, tags, or full-text search.

**Syntax:**
```bash
collmarked bookmark list [--category <path>] [--tag <name>...] [--search <query>]
```

**Flags:**
- `--category <path>` / `-c <path>` — Optional. Filter by category path (includes subcategories)
- `--tag <name>` / `-t <name>` — Optional, repeatable. Filter by tag(s) using AND logic (must have all specified tags)
- `--search <query>` / `-s <query>` — Optional. Full-text search across bookmark URL, title, description, and extracted content

**Output:** JSON array of bookmarks with tags and metadata

**Examples:**

```bash
# List all bookmarks
collmarked bookmark list

# Filter by category
collmarked bookmark list --category "tech"

# Filter by category and tags (AND logic)
collmarked bookmark list \
  --category "tech/kubernetes" \
  --tag infrastructure \
  --tag networking

# Full-text search
collmarked bookmark list --search "microservices"

# Combined filters
collmarked bookmark list \
  -c "tech" \
  -s "performance" \
  -t optimization

# Short flag syntax
collmarked bookmark list -c tech -t kubernetes -s "pod networking"
```

---

### `collmarked bookmark edit`

Update a bookmark's metadata, category, tags, title, or description.

**Syntax:**
```bash
collmarked bookmark edit <id> [--category <path>] [--tag <name>...] [--title <title>] [--description <desc>]
```

**Arguments:**
- `<id>` — **Required**. Numeric bookmark ID

**Flags:**
- `--category <path>` / `-c <path>` — Optional. New category path
- `--tag <name>` / `-t <name>` — Optional, repeatable. Replace all tags (omit to keep existing)
- `--title <title>` — Optional. New title
- `--description <desc>` / `-d <desc>` — Optional. New description

**Output:** JSON object with updated bookmark

**Notes:**
- Tag flags replace all existing tags; omit `--tag` to preserve tags
- If `--category` is omitted, category remains unchanged

**Examples:**

```bash
# Update category
collmarked bookmark edit 42 --category "reference/articles"

# Replace all tags
collmarked bookmark edit 42 \
  --tag "updated" \
  --tag "important"

# Update title and description
collmarked bookmark edit 42 \
  --title "New Article Title" \
  --description "Updated notes"

# Move to new category and add tags
collmarked bookmark edit 42 \
  -c "tech/kubernetes" \
  -t "advanced" \
  -t "networking"
```

---

### `collmarked bookmark delete`

Delete a bookmark and all associated data (content, digest).

**Syntax:**
```bash
collmarked bookmark delete <id>
```

**Arguments:**
- `<id>` — **Required**. Numeric bookmark ID

**Output:** JSON confirmation with deleted ID

**Notes:**
- Deletion cascades to extracted content and generated digests
- No confirmation prompt; use with caution

**Examples:**

```bash
# Delete bookmark
collmarked bookmark delete 42

# Check result
collmarked bookmark list  # Verify bookmark is gone
```

---

### `collmarked bookmark extract`

Extract readable markdown content from a bookmarked URL and store it in the database.

**Syntax:**
```bash
collmarked bookmark extract <id> [--force]
```

**Arguments:**
- `<id>` — **Required**. Numeric bookmark ID

**Flags:**
- `--force` / `-f` — Optional. Overwrite existing content if already extracted

**Output:** JSON object with extracted content metadata

**Behavior:**
- Fetches the bookmark's URL
- Extracts readable article content using `@mozilla/readability`
- Converts HTML to markdown using `turndown`
- Stores in database with `fetched_at` timestamp
- Fails with `ConflictError` if content exists and `--force` not provided

**Examples:**

```bash
# Extract content for bookmark ID 42
collmarked bookmark extract 42

# Re-extract and overwrite existing content
collmarked bookmark extract 42 --force

# Extract with short flag
collmarked bookmark extract 1 -f
```

**Output Example:**
```json
{
  "id": 1,
  "bookmarkId": 42,
  "markdown": "# Article Title\n\nArticle content...",
  "fetchedAt": "2026-04-01T10:30:00Z"
}
```

---

### `collmarked bookmark digest`

Generate an AI-powered summary and key takeaways from extracted bookmark content.

**Syntax:**
```bash
collmarked bookmark digest <id> [--force] [--provider copilot] [--model <name>] [--takeaways <n>]
```

**Arguments:**
- `<id>` — **Required**. Numeric bookmark ID

**Flags:**
- `--force` / `-f` — Optional. Regenerate existing digest
- `--provider <name>` / `-p <name>` — Optional. LLM provider (default: `copilot`)
  - Currently supported: `copilot`
  - Overridable by `COLLMARKED_LLM_PROVIDER` env var
- `--model <name>` / `-m <name>` — Optional. Model name (provider-specific default if omitted)
  - Overridable by `COLLMARKED_MODEL` env var
  - Copilot default: `gpt-5`
- `--takeaways <n>` / `-n <n>` — Optional. Number of key takeaways (default: 5)

**Preconditions:**
- Bookmark must exist
- Content must be extracted (run `bookmark extract` first)

**Output:** JSON object with summary and key takeaways

**Examples:**

```bash
# Generate digest with defaults (5 takeaways)
collmarked bookmark digest 42

# Generate with custom takeaway count
collmarked bookmark digest 42 --takeaways 3

# Regenerate existing digest
collmarked bookmark digest 42 --force

# Use custom model
collmarked bookmark digest 42 --model "claude-sonnet-4.5"

# Regenerate with fewer takeaways
collmarked bookmark digest 42 \
  --force \
  --takeaways 7

# Use environment variables
COLLMARKED_LLM_PROVIDER=copilot \
COLLMARKED_MODEL=gpt-5 \
collmarked bookmark digest 42 --takeaways 5

# Short flag syntax
collmarked bookmark digest 1 -f -p copilot -m gpt-5 -n 5
```

**Output Example:**
```json
{
  "id": 1,
  "bookmarkId": 42,
  "data": {
    "summary": "This article explains Kubernetes service networking and load balancing strategies...",
    "takeaways": [
      "Services provide stable IP and DNS for pod discovery",
      "ClusterIP is default; NodePort and LoadBalancer for external traffic",
      "Ingress controls external access with advanced routing",
      "Network policies restrict pod-to-pod communication",
      "DNS suffix enables cross-namespace service discovery"
    ]
  },
  "provider": "copilot",
  "model": "gpt-5",
  "generatedAt": "2026-04-01T10:35:00Z"
}
```

---

## Category Management

### `collmarked category add`

Create a new category or subcategory.

**Syntax:**
```bash
collmarked category add <name> [--parent <path>]
```

**Arguments:**
- `<name>` — **Required**. Name of the new category

**Flags:**
- `--parent <path>` / `-p <path>` — Optional. Parent category path for creating subcategories

**Output:** JSON object with category details

**Notes:**
- Categories use hierarchical paths with `/` separator
- A category can only be created if its parent exists

**Examples:**

```bash
# Create top-level category
collmarked category add "tech"

# Create subcategory
collmarked category add "kubernetes" --parent "tech"

# Create nested subcategory
collmarked category add "networking" --parent "tech/kubernetes"

# Short flag
collmarked category add "articles" -p "tech"
```

---

### `collmarked category list`

Display all categories as a hierarchical tree.

**Syntax:**
```bash
collmarked category list
```

**Flags:** None

**Output:** JSON tree structure showing category hierarchy

**Examples:**

```bash
# List all categories
collmarked category list
```

**Output Example:**
```json
{
  "id": 1,
  "name": "tech",
  "path": "tech",
  "children": [
    {
      "id": 2,
      "name": "kubernetes",
      "path": "tech/kubernetes",
      "children": [
        {
          "id": 3,
          "name": "networking",
          "path": "tech/kubernetes/networking",
          "children": []
        }
      ]
    },
    {
      "id": 4,
      "name": "databases",
      "path": "tech/databases",
      "children": []
    }
  ]
}
```

---

### `collmarked category delete`

Delete a category. Parent path must be provided to identify which category to delete.

**Syntax:**
```bash
collmarked category delete <path>
```

**Arguments:**
- `<path>` — **Required**. Full path to the category (e.g., `tech/kubernetes`)

**Output:** JSON confirmation with deleted category path

**Notes:**
- Deletion cascades to all bookmarks in that category and subcategories
- Subcategories are also deleted
- Use with caution

**Examples:**

```bash
# Delete a top-level category
collmarked category delete "tech"

# Delete a subcategory
collmarked category delete "tech/kubernetes"

# Delete deeply nested category
collmarked category delete "tech/kubernetes/networking"
```

---

## Tag Management

### `collmarked tag list`

Display all tags used in the system.

**Syntax:**
```bash
collmarked tag list
```

**Flags:** None

**Output:** JSON array of all tags

**Examples:**

```bash
# List all tags
collmarked tag list
```

**Output Example:**
```json
{
  "tags": [
    {
      "name": "kubernetes",
      "count": 12
    },
    {
      "name": "distributed-systems",
      "count": 8
    },
    {
      "name": "infrastructure",
      "count": 15
    },
    {
      "name": "reading",
      "count": 3
    }
  ]
}
```

---

### `collmarked tag delete`

Delete a tag from the system. The tag is removed from all bookmarks.

**Syntax:**
```bash
collmarked tag delete <name>
```

**Arguments:**
- `<name>` — **Required**. Tag name to delete

**Output:** JSON confirmation with deleted tag name

**Notes:**
- Removal cascades to all bookmarks tagged with this tag
- Use with caution

**Examples:**

```bash
# Delete a tag
collmarked tag delete "reading"

# Delete another tag
collmarked tag delete "kubernetes"
```

---

## Database Management

### `collmarked db migrate`

Run pending database migrations to initialize or upgrade the schema.

**Syntax:**
```bash
collmarked db migrate
```

**Flags:** None

**Output:** JSON with list of applied migrations and status message

**Notes:**
- Safe to run multiple times; already-applied migrations are skipped
- Creates necessary tables and indexes on first run
- Must be run before first use of the application

**Examples:**

```bash
# Run all pending migrations
collmarked db migrate

# Output on first run
{
  "applied": [
    "001_init",
    "002_fts",
    "003_bookmark_content",
    "004_bookmark_digest"
  ],
  "message": "Applied 4 migration(s)"
}

# Output on subsequent runs (if no pending migrations)
{
  "message": "No pending migrations"
}
```

---

## Command Patterns

### Common Flag Combinations

**Search with category filter:**
```bash
collmarked bookmark list --category "tech" --search "performance"
```

**Multiple tags (AND logic):**
```bash
collmarked bookmark list --tag "kubernetes" --tag "networking"
# Returns bookmarks tagged with BOTH "kubernetes" AND "networking"
```

**Extract and digest in sequence:**
```bash
collmarked bookmark extract 42
collmarked bookmark digest 42 --takeaways 5
```

**Bulk category operations:**
```bash
# Create category hierarchy
collmarked category add "tech"
collmarked category add "kubernetes" --parent "tech"
collmarked category add "networking" --parent "tech/kubernetes"

# Add bookmarks to nested category
collmarked bookmark add https://example.com \
  --category "tech/kubernetes/networking" \
  --tag "distributed-systems"
```

### Error Handling

All commands output errors as JSON with error type and message:

```json
{
  "error": "NotFoundError",
  "message": "Bookmark with ID 999 not found"
}
```

Common errors:
- `NotFoundError` — Bookmark, category, or tag not found
- `ConflictError` — Resource already exists or content already extracted
- `ValidationError` — Invalid input or missing required category
- `FetchError` — URL fetch failed (network, timeout, 404)
- `ExtractionError` — No readable content in URL
- `LlmError` — LLM provider error or invalid response

---

## Global Options

**JSON Output:**
- All commands output JSON for machine readability
- Use tools like `jq` for parsing and filtering

**Example with jq:**
```bash
# Extract bookmark ID from add response
collmarked bookmark add https://example.com -c tech | jq '.id'

# Filter bookmarks by tag count
collmarked tag list | jq '.tags[] | select(.count > 5)'
```

---

## Full Workflow Example

```bash
# 1. Initialize database
collmarked db migrate

# 2. Create category hierarchy
collmarked category add "tech"
collmarked category add "kubernetes" --parent "tech"

# 3. Add a bookmark
BOOKMARK=$(collmarked bookmark add https://kubernetes.io/docs \
  --category "tech/kubernetes" \
  --tag "infrastructure" \
  --title "Kubernetes Documentation")
BOOKMARK_ID=$(echo $BOOKMARK | jq '.id')

# 4. Extract content
collmarked bookmark extract $BOOKMARK_ID

# 5. Generate digest
collmarked bookmark digest $BOOKMARK_ID --takeaways 5

# 6. List bookmarks in category
collmarked bookmark list --category "tech/kubernetes"

# 7. Search across all bookmarks
collmarked bookmark list --search "pod networking"

# 8. Update bookmark
collmarked bookmark edit $BOOKMARK_ID --tag "distributed-systems"

# 9. List all categories
collmarked category list

# 10. List all tags
collmarked tag list
```

---

## Troubleshooting

### Content Extraction Failures
- **Issue**: `FetchError` — URL is unreachable or returns error
  - **Solution**: Verify URL is accessible and returns 2xx status
- **Issue**: `ExtractionError` — No readable content
  - **Solution**: Ensure page has article/content body; login pages fail

### Digest Generation Failures
- **Issue**: `ContentNotExtractedError` — Need to extract first
  - **Solution**: Run `collmarked bookmark extract <id>` before digest
- **Issue**: `LlmError` — LLM provider error
  - **Solution**: Verify authentication (check `GITHUB_TOKEN`, `COPILOT_CLI_PATH`)
- **Issue**: Model not found
  - **Solution**: Verify model name is correct for selected provider

### Category Issues
- **Issue**: `ValidationError` — Parent category doesn't exist
  - **Solution**: Create parent first with `category add`
- **Issue**: `ConflictError` — Category already exists
  - **Solution**: Use existing category or choose different name

---

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `COLLMARKED_LLM_PROVIDER` | Default LLM provider | `copilot` |
| `COLLMARKED_MODEL` | Default model name | `gpt-5` |
| `GITHUB_TOKEN` | GitHub/Copilot authentication | (token string) |
| `COPILOT_CLI_PATH` | Path to Copilot CLI | `/usr/local/bin/copilot` |

