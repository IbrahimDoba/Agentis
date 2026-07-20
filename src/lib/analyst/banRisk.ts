// Pure, explainable ban-risk scorer for the AI Analyst. No DB, no LLM — every
// point comes with a human-readable reason, so the narrative can never claim a
// risk the data doesn't show. Heuristics distilled from the July-2026 ban
// forensics (Skavala/Vaya): mass near-identical broadcasts, group-invite links,
// cold first-contact sends, and fresh relinks at high warmup tiers.

export interface BroadcastFact {
  recipients: number
  message: string
  failedRatio: number // failedCount / totalCount (0..1)
  daysAgo: number
}

export interface BanRiskInput {
  broadcasts14d: BroadcastFact[]
  followupSent14d: number
  coldFirstConversations7d: number // conversations WE started (no prior inbound)
  youngestSessionAgeDays: number | null // null = no linked session
  warmupTier: number | null
  disconnects48h: number
  priorBans: number
}

export interface BanRisk {
  score: number
  level: "low" | "elevated" | "high"
  reasons: string[]
}

const INVITE_LINK_RE = /(chat\.whatsapp\.com|wa\.me\/)/i

// Rough near-duplicate check: token-set Jaccard similarity of two messages.
export function messageSimilarity(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().replace(/\{name\}/g, "").split(/\W+/).filter((w) => w.length > 2))
  const A = tok(a), B = tok(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

export function scoreBanRisk(input: BanRiskInput): BanRisk {
  let score = 0
  const reasons: string[] = []

  const totalRecipients = input.broadcasts14d.reduce((s, b) => s + b.recipients, 0)
  if (totalRecipients > 900) {
    score += 3
    reasons.push(`Very high broadcast volume: ${totalRecipients.toLocaleString()} recipients in 14 days`)
  } else if (totalRecipients > 300) {
    score += 2
    reasons.push(`High broadcast volume: ${totalRecipients.toLocaleString()} recipients in 14 days`)
  } else if (totalRecipients > 100) {
    score += 1
    reasons.push(`Moderate broadcast volume: ${totalRecipients.toLocaleString()} recipients in 14 days`)
  }

  if (input.broadcasts14d.some((b) => INVITE_LINK_RE.test(b.message))) {
    score += 3
    reasons.push("Broadcasts contain WhatsApp invite links (chat.whatsapp.com / wa.me) — a common report/ban trigger")
  }

  outer: for (let i = 0; i < input.broadcasts14d.length; i++) {
    for (let j = i + 1; j < input.broadcasts14d.length; j++) {
      if (messageSimilarity(input.broadcasts14d[i].message, input.broadcasts14d[j].message) > 0.8) {
        score += 2
        reasons.push("Multiple broadcasts with near-identical text — vary the message between campaigns")
        break outer
      }
    }
  }

  const avgFailed = input.broadcasts14d.length
    ? input.broadcasts14d.reduce((s, b) => s + b.failedRatio, 0) / input.broadcasts14d.length
    : 0
  if (avgFailed > 0.08) {
    score += 1
    reasons.push(`Elevated broadcast failure rate (${Math.round(avgFailed * 100)}%) — often means recipients blocking the number`)
  }

  if (input.coldFirstConversations7d > 50) {
    score += 2
    reasons.push(`${input.coldFirstConversations7d} conversations started by you (cold) this week — unsolicited first contact is the main ban vector`)
  } else if (input.coldFirstConversations7d > 20) {
    score += 1
    reasons.push(`${input.coldFirstConversations7d} cold first-contact conversations this week`)
  }

  if (
    input.youngestSessionAgeDays !== null &&
    input.youngestSessionAgeDays < 7 &&
    (input.warmupTier ?? 1) >= 3
  ) {
    score += 2
    reasons.push("Freshly linked number running at a high sending speed — new links should warm up slowly")
  }

  if (input.disconnects48h > 12) {
    score += 1
    reasons.push(`Unstable connection (${input.disconnects48h} drops in 48h) — instability correlates with WhatsApp restrictions`)
  }

  if (input.priorBans > 0) {
    score += 2
    reasons.push("This account has had a WhatsApp ban before — WhatsApp watches repeat patterns closely")
  }

  const level: BanRisk["level"] = score >= 6 ? "high" : score >= 3 ? "elevated" : "low"
  return { score, level, reasons }
}
