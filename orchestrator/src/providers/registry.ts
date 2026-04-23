import type { LLMProvider } from "./types.js"
import { OpenAIProvider } from "./openai.js"

const providers = new Map<string, LLMProvider>()

function getOrCreate(key: string, factory: () => LLMProvider): LLMProvider {
  let p = providers.get(key)
  if (!p) {
    p = factory()
    providers.set(key, p)
  }
  return p
}

export function resolveProvider(model: string): LLMProvider {
  if (model.startsWith("gpt-") || model.startsWith("text-embedding-")) {
    return getOrCreate("openai", () => new OpenAIProvider())
  }
  throw new Error(`Unknown model "${model}" — no provider registered. Add a provider in registry.ts.`)
}
