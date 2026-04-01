import { Context, Effect, Layer } from "effect"
import { BookmarkRepo } from "../repositories/bookmark.repo.js"
import { ContentRepo } from "../repositories/content.repo.js"
import { ContentFetcher } from "./content-fetcher.service.js"
import { ContentExtractor } from "./content-extractor.service.js"
import { toMarkdown } from "./markdown-converter.js"
import type { BookmarkContent } from "../db/schema.js"
import type { DbError, NotFoundError, ConflictError, FetchError, ExtractionError } from "../errors/index.js"

export interface ContentServiceInterface {
  extract: (
    bookmarkId: number,
    force: boolean
  ) => Effect.Effect<
    BookmarkContent,
    NotFoundError | FetchError | ExtractionError | ConflictError | DbError
  >
}

export class ContentService extends Context.Tag("ContentService")<
  ContentService,
  ContentServiceInterface
>() {}

export const ContentServiceLive = Layer.effect(
  ContentService,
  Effect.gen(function* () {
    const bookmarkRepo = yield* BookmarkRepo
    const contentRepo = yield* ContentRepo
    const fetcher = yield* ContentFetcher
    const extractor = yield* ContentExtractor

    return {
      extract: (bookmarkId, force) =>
        Effect.gen(function* () {
          const bookmark = yield* bookmarkRepo.findById(bookmarkId)
          const html = yield* fetcher.fetch(bookmark.url)
          const { content } = yield* extractor.extract({ html, url: bookmark.url })
          const markdown = toMarkdown(content)

          if (force) {
            return yield* contentRepo.upsert({ bookmarkId, markdown })
          }
          return yield* contentRepo.save({ bookmarkId, markdown })
        }),
    } satisfies ContentServiceInterface
  })
)
