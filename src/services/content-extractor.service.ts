import { Context, Effect, Layer } from "effect"
import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import { ExtractionError } from "../errors/index.js"

export interface ExtractedContent {
  title: string
  content: string
}

export interface ContentExtractorService {
  extract: (input: { html: string; url: string }) => Effect.Effect<ExtractedContent, ExtractionError>
}

export class ContentExtractor extends Context.Tag("ContentExtractor")<
  ContentExtractor,
  ContentExtractorService
>() {}

export const ContentExtractorLive = Layer.succeed(ContentExtractor, {
  extract: ({ html, url }) =>
    Effect.try({
      try: () => {
        const { document } = parseHTML(html)
        const reader = new Readability(document as unknown as Document)
        const article = reader.parse()
        const content = article?.content
        if (!content || !content.trim())
          throw new ExtractionError({ message: `No readable content found at ${url}` })
        return { title: article.title ?? "", content }
      },
      catch: (e) => {
        if (e instanceof ExtractionError) return e
        return new ExtractionError({ message: `Failed to extract content: ${String(e)}` })
      },
    }),
})
