/**
 * Returns the base system prompt stored in OrchestratorAgent.systemPrompt.
 * This is the static foundation — context-builder.ts adds media library,
 * RAG chunks, conversation memory, and current time on top of this at runtime.
 *
 * Products, documents, and tools are all handled live, so the base prompt
 * is simply the user-authored system prompt (responseGuidelines).
 */
export function buildOrchestratorSystemPrompt(responseGuidelines?: string | null): string {
  return responseGuidelines?.trim() || "You are a helpful WhatsApp assistant."
}
