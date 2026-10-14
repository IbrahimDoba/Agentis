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
    "Do not repeat information you already sent. Do not apologise for following up. Do not pressure them.",
    "One or two sentences, then a light question that makes replying easy.",
    "If there is genuinely nothing useful to say, still send a brief friendly check-in.",
  ]
  if (instructions && instructions.trim()) {
    lines.push("", "Owner guidance for follow-ups:", instructions.trim())
  }
  return lines.join("\n")
}
