import { Context, Effect } from "effect"
import type { LlmError } from "../errors/index.js"

export interface LlmProviderService {
  complete: (opts: {
    system: string
    user: string
    model?: string
  }) => Effect.Effect<string, LlmError>
}

export class LlmProvider extends Context.Tag("LlmProvider")<LlmProvider, LlmProviderService>() {}
