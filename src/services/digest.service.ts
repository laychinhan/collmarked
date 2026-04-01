import { Context, Effect, Layer } from "effect"
import { BookmarkRepo } from "../repositories/bookmark.repo.js"
import { ContentRepo } from "../repositories/content.repo.js"
import { DigestRepo } from "../repositories/digest.repo.js"
import { LlmProvider } from "./llm-provider.service.js"
import type { BookmarkDigest } from "../db/schema.js"
import {
  type DbError,
  type NotFoundError,
  type ConflictError,
  LlmError,
  ContentNotExtractedError,
} from "../errors/index.js"

export interface DigestServiceInterface {
  digest: (
    bookmarkId: number,
    force: boolean,
    opts?: { model?: string; takeaways?: number; provider?: string }
  ) => Effect.Effect<
    BookmarkDigest,
    NotFoundError | ContentNotExtractedError | LlmError | ConflictError | DbError
  >
}

export class DigestService extends Context.Tag("DigestService")<
  DigestService,
  DigestServiceInterface
>() {}

const buildSystemPrompt = (takeaways: number) =>
  `You are a concise content analyst. Given article content, produce a JSON object with exactly two keys:
- "summary": a 2-4 sentence summary of the article.
- "takeaways": an array of exactly ${takeaways} key takeaways as short strings.

Respond ONLY with valid JSON. No markdown fences, no extra text.`

const buildUserPrompt = (markdown: string) =>
  `Here is the article content in markdown:\n\n${markdown}`

export const DigestServiceLive = Layer.effect(
  DigestService,
  Effect.gen(function* () {
    const bookmarkRepo = yield* BookmarkRepo
    const contentRepo = yield* ContentRepo
    const digestRepo = yield* DigestRepo
    const llm = yield* LlmProvider

    return {
      digest: (bookmarkId, force, opts = {}) =>
        Effect.gen(function* () {
          const takeaways = opts.takeaways ?? 5
          const provider = opts.provider ?? "copilot"
          const model = opts.model

          yield* bookmarkRepo.findById(bookmarkId)

          const content = yield* contentRepo.findByBookmarkId(bookmarkId)
          if (!content) {
            return yield* Effect.fail(new ContentNotExtractedError({ bookmarkId }))
          }

          const rawResponse = yield* llm.complete({
            system: buildSystemPrompt(takeaways),
            user: buildUserPrompt(content.markdown),
            model,
          })

          const data = yield* Effect.try({
            try: () => {
              const parsed = JSON.parse(rawResponse) as unknown
              if (
                typeof parsed !== "object" ||
                parsed === null ||
                !("summary" in parsed) ||
                !("takeaways" in parsed)
              ) {
                throw new Error("Response missing required fields")
              }
              return JSON.stringify(parsed)
            },
            catch: (e) =>
              new LlmError({
                message: `LLM returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
                cause: e,
              }),
          })

          if (force) {
            return yield* digestRepo.upsert({ bookmarkId, data, provider, model: model ?? "gpt-5" })
          }
          return yield* digestRepo.save({ bookmarkId, data, provider, model: model ?? "gpt-5" })
        }),
    } satisfies DigestServiceInterface
  })
)
