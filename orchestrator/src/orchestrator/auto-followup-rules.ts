// Pure rules for the auto follow-up sweep. Deliberately config-free (no db, no
// config import) so it stays unit-testable — importing config at module scope
// would process.exit(1) under vitest without a full env.

// Follow-ups are unsolicited, so the send window is tighter than the broadcast
// quiet hours (23:00-06:00): nothing before 09:00 or after 20:59 Lagos time.
// A candidate outside the window just waits for the next sweep inside it.
const SEND_WINDOW_START_HOUR = 9
const SEND_WINDOW_END_HOUR = 21 // exclusive

export function withinSendWindow(hour: number): boolean {
  return hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR
}

export function hourInLagos(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      hour12: false,
    }).format(now)
  )
}

// Cap candidates per agent per sweep so enabling the feature on an agent with a
// backlog of silent threads drips follow-ups out instead of bursting — bursts
// are exactly the pattern anti-ban pacing exists to avoid.
export function capPerAgent<T extends { agentId: string }>(rows: T[], cap: number): T[] {
  const taken = new Map<string, number>()
  const out: T[] = []
  for (const row of rows) {
    const n = taken.get(row.agentId) ?? 0
    if (n >= cap) continue
    taken.set(row.agentId, n + 1)
    out.push(row)
  }
  return out
}

// The instruction block appended to the agent's normal system prompt. The model
// already has the persona, knowledge and full recent history — this only frames
// the task: one short, personalized nudge, not a re-pitch.
export function buildFollowUpInstruction(hoursSilent: number, instructions: string | null): string {
  const rounded = Math.max(1, Math.round(hoursSilent))
  const lines = [
    "",
    "## Follow-up task",
    `The customer has not replied to your last message for about ${rounded} hour${rounded === 1 ? "" : "s"}.`,
    "Write ONE short, natural follow-up that picks up from where the conversation left off — reference what they asked about, don't summarise the whole chat.",
    "NEVER re-send, re-phrase, or shorten your previous message, and never repeat a link or prices you already shared. The customer already saw all of that.",
    "If you already showed products, prices, or a link, ask a short question instead — whether they're still interested, whether anything caught their eye, or if they have questions.",
    "Do not apologise for following up. Do not pressure them.",
    "One or two sentences, then a light question that makes replying easy.",
    "If there is genuinely nothing useful to say, still send a brief friendly check-in.",
  ]
  if (instructions && instructions.trim()) {
    lines.push("", "Owner guidance for follow-ups:", instructions.trim())
  }
  return lines.join("\n")
}

// The final user-role message that triggers the generation. The conversation
// ends on the model's own message, and models "continue" that pattern far more
// readily than they obey a rule buried at the end of a long system prompt —
// a trailing user turn is what they actually respond to. Never persisted.
export function buildFollowUpTrigger(hoursSilent: number): string {
  const rounded = Math.max(1, Math.round(hoursSilent))
  return `[Automated check-in trigger — this is not from the customer. They have not replied in about ${rounded} hour${rounded === 1 ? "" : "s"}. Write your ONE follow-up message now, following the follow-up task rules. Do not repeat your previous message.]`
}

// Word-set similarity between a draft and the agent's recent outbound messages.
// The model sometimes "continues" by re-sending its own last message, links and
// all, which reads as a bot glitch to the customer. Prompting alone doesn't
// reliably stop it, so catch it deterministically before anything is sent.
export function isNearDuplicate(draft: string, previous: string[]): boolean {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " <url> ")
        .replace(/[^\p{L}\p{N}<>\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
    )
  const a = tokens(draft)
  if (a.size === 0) return true
  for (const prev of previous) {
    const b = tokens(prev)
    if (b.size === 0) continue
    let inter = 0
    for (const t of a) if (b.has(t)) inter++
    const jaccard = inter / (a.size + b.size - inter)
    // Containment catches "same message with a greeting bolted on", which
    // Jaccard alone misses when the draft is longer than the original.
    const containment = inter / Math.min(a.size, b.size)
    if (jaccard >= 0.6 || containment >= 0.85) return true
  }
  return false
}
