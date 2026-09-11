// Pure helpers for the conversation-memory record. Kept in their own module with
// NO config/db imports so they can be unit-tested — importing config.ts runs a
// process.exit(1) env check at module scope.

/** How many messages have aged out of what the model can still see verbatim. */
export function olderThanWindow(totalMessages: number, shortTermWindow: number): number {
  return Math.max(0, totalMessages - Math.max(0, shortTermWindow))
}

/**
 * Whether the record is stale enough to be worth an LLM call. False until
 * `refreshEvery` messages have aged out since the last pass, so a busy chat
 * doesn't pay for a summary every turn.
 */
export function needsRefresh(olderCount: number, alreadyCovered: number, refreshEvery: number): boolean {
  if (olderCount <= 0) return false
  return olderCount - alreadyCovered >= refreshEvery
}

export interface TranscriptLine {
  direction: string
  senderRole: string
  content: string
}

/**
 * Label each line by who actually spoke. The human/agent split matters: an
 * operator's correction ("it's 70k", "that's sold out") is the authoritative
 * version of a fact the agent may have got wrong earlier in the same thread.
 */
export function formatTranscript(messages: TranscriptLine[]): string {
  return messages
    .map((m) => {
      const who =
        m.direction === "inbound" ? "Customer" : m.senderRole === "human" ? "Business (human)" : "Business (agent)"
      return `${who}: ${m.content}`
    })
    .join("\n")
}
