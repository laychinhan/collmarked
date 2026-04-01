import { Command, Args, Flags } from "@oclif/core"
import { Effect, Layer } from "effect"
import { DigestService, DigestServiceLive } from "../../services/digest.service.js"
import { LlmProvider } from "../../services/llm-provider.service.js"
import { CopilotLlmProviderLive } from "../../services/llm-providers/copilot.provider.js"
import { DigestRepoLive } from "../../repositories/digest.repo.js"
import { ContentRepoLive } from "../../repositories/content.repo.js"
import { BookmarkRepoLive } from "../../repositories/bookmark.repo.js"
import { TagRepoLive } from "../../repositories/tag.repo.js"
import { CategoryRepoLive } from "../../repositories/category.repo.js"
import { KyselyDbLive } from "../../db/kysely.js"

const SUPPORTED_PROVIDERS = ["copilot"] as const
type Provider = (typeof SUPPORTED_PROVIDERS)[number]

function resolveLlmProvider(provider: Provider): Layer.Layer<LlmProvider> {
  switch (provider) {
    case "copilot":
      return CopilotLlmProviderLive
  }
}

export default class BookmarkDigest extends Command {
  static description = "Generate a summary and key takeaways from a bookmark's extracted content using an LLM"

  static args = {
    id: Args.integer({ description: "Bookmark ID", required: true }),
  }

  static flags = {
    force: Flags.boolean({
      char: "f",
      description: "Regenerate digest even if one already exists",
      default: false,
    }),
    provider: Flags.string({
      char: "p",
      description: `LLM provider to use (${SUPPORTED_PROVIDERS.join(", ")})`,
      default: "copilot",
      required: false,
    }),
    model: Flags.string({
      char: "m",
      description: "Model name to use (provider-specific)",
      required: false,
    }),
    takeaways: Flags.integer({
      char: "n",
      description: "Number of key takeaways to generate",
      default: 5,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(BookmarkDigest)

    const providerName = (process.env.COLLMARKED_LLM_PROVIDER ?? flags.provider) as Provider
    if (!SUPPORTED_PROVIDERS.includes(providerName)) {
      this.error(
        JSON.stringify({
          error: "ValidationError",
          message: `Unsupported provider '${providerName}'. Supported: ${SUPPORTED_PROVIDERS.join(", ")}`,
        })
      )
    }
    const model = flags.model ?? process.env.COLLMARKED_MODEL
    const llmLayer = resolveLlmProvider(providerName)

    const program = Effect.gen(function* () {
      const svc = yield* DigestService
      return yield* svc.digest(args.id, flags.force, {
        model,
        takeaways: flags.takeaways,
        provider: providerName,
      })
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(DigestServiceLive),
        Effect.provide(llmLayer),
        Effect.provide(DigestRepoLive),
        Effect.provide(ContentRepoLive),
        Effect.provide(BookmarkRepoLive),
        Effect.provide(TagRepoLive),
        Effect.provide(CategoryRepoLive),
        Effect.provide(KyselyDbLive),
        Effect.catchAll((e) => Effect.die(e))
      )
    ).catch((e) => {
      this.error(JSON.stringify({ error: e._tag ?? "Error", message: e.message ?? String(e) }))
    })

    if (result) this.log(JSON.stringify(result, null, 2))
  }
}
