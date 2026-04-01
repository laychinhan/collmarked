import { Context, Effect, Layer } from "effect"
import { FetchError } from "../errors/index.js"

export interface ContentFetcherService {
  fetch: (url: string) => Effect.Effect<string, FetchError>
}

export class ContentFetcher extends Context.Tag("ContentFetcher")<
  ContentFetcher,
  ContentFetcherService
>() {}

export const ContentFetcherLive = Layer.succeed(ContentFetcher, {
  fetch: (url) =>
    Effect.tryPromise({
      try: async () => {
        const res = await globalThis.fetch(url)
        if (!res.ok)
          throw new FetchError({
            message: `HTTP ${res.status} ${res.statusText} fetching ${url}`,
          })
        return res.text()
      },
      catch: (e) => {
        if (e instanceof FetchError) return e
        return new FetchError({ message: `Failed to fetch ${url}`, cause: e })
      },
    }),
})
