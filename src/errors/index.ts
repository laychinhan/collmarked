import { Data } from "effect"

export class DbError extends Data.TaggedError("DbError")<{
  message: string
  cause?: unknown
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  resource: string
  id: string | number
}> {}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  message: string
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  message: string
}> {}

export class FetchError extends Data.TaggedError("FetchError")<{
  message: string
  cause?: unknown
}> {}

export class ExtractionError extends Data.TaggedError("ExtractionError")<{
  message: string
}> {}

export class LlmError extends Data.TaggedError("LlmError")<{
  message: string
  cause?: unknown
}> {}

export class ContentNotExtractedError extends Data.TaggedError("ContentNotExtractedError")<{
  bookmarkId: number
}> {
  get message() {
    return `No extracted content found for bookmark ${this.bookmarkId}. Run 'bookmark extract ${this.bookmarkId}' first.`
  }
}
