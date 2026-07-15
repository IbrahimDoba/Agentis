// Lead-detection batching. The detect-leads route used to concatenate EVERY
// conversation into one gpt-4o-mini request, which overflowed the model's 128k
// context (seen in prod at 195k tokens → 400). We now truncate each summary and
// split the conversations into token-budgeted batches. Pure + unit-tested.

export interface LeadConvEntry {
  conversationId: string
  /** Pre-rendered prompt line for this conversation (already truncated). */
  text: string
}

/** Cheap token estimate (~4 chars/token) — deliberately conservative. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Split entries into batches whose combined estimated tokens stay at or under
 * `budgetTokens`. Order is preserved. A single entry larger than the budget
 * still forms its own batch (it was already truncated upstream), so no entry is
 * ever dropped.
 */
export function batchByTokenBudget(entries: LeadConvEntry[], budgetTokens: number): LeadConvEntry[][] {
  const batches: LeadConvEntry[][] = []
  let current: LeadConvEntry[] = []
  let currentTokens = 0

  for (const entry of entries) {
    const tokens = estimateTokens(entry.text)
    if (current.length > 0 && currentTokens + tokens > budgetTokens) {
      batches.push(current)
      current = []
      currentTokens = 0
    }
    current.push(entry)
    currentTokens += tokens
  }
  if (current.length > 0) batches.push(current)
  return batches
}
