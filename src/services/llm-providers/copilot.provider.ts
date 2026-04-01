import { Effect, Layer } from "effect"
import { CopilotClient, approveAll } from "@github/copilot-sdk"
import { LlmError } from "../../errors/index.js"
import { LlmProvider } from "../llm-provider.service.js"

const DEFAULT_MODEL = "gpt-5"

export const CopilotLlmProviderLive = Layer.succeed(LlmProvider, {
  complete: (opts) =>
    Effect.tryPromise({
      try: async () => {
        const client = new CopilotClient()
        try {
          await client.start()
          const session = await client.createSession({
            onPermissionRequest: approveAll,
            model: opts.model ?? DEFAULT_MODEL,
            systemMessage: { mode: "replace", content: opts.system },
          })
          const response = await session.sendAndWait({ prompt: opts.user })
          await session.disconnect()
          const content = response?.data?.content
          if (!content) throw new Error("Empty response from Copilot")
          return content
        } finally {
          await client.stop()
        }
      },
      catch: (e) =>
        new LlmError({
          message: e instanceof Error ? e.message : String(e),
          cause: e,
        }),
    }),
})
