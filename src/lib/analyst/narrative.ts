import OpenAI from "openai"
import type { AnalystFacts } from "./healthReport"

// Turns computed facts into a friendly, prioritized narrative. The model is
// ONLY allowed to restate the provided facts — analysis and numbers all come
// from healthReport/banRisk, so a model outage or a bad completion can never
// invent an account state (we fall back to a deterministic rendering).

export interface AnalystNarrative {
  summary: string
  doingWell: string[]
  needsAttention: string[]
  actNow: string[]
  source: "ai" | "fallback"
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function buildNarrative(facts: AnalystFacts): Promise<AnalystNarrative> {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are the DailZero AI Analyst — a friendly, plain-spoken advisor for Nigerian SMB owners running WhatsApp AI agents. " +
            "You will receive a FACTS JSON object. Write advice using ONLY those facts — never invent numbers, statuses, or events. " +
            "Keep money in credits (and naira only if present in facts). Short sentences, no jargon, warm but direct. " +
            'Return STRICT JSON: {"summary": string (2-3 sentences), "doingWell": string[], "needsAttention": string[], "actNow": string[]}. ' +
            "actNow is ONLY for urgent items (blocked billing, banned/unlinked WhatsApp, high ban risk). Empty arrays are fine.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ""
    const parsed = JSON.parse(raw) as Partial<AnalystNarrative>
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.doingWell)) throw new Error("bad shape")
    return {
      summary: parsed.summary,
      doingWell: (parsed.doingWell ?? []).filter((s): s is string => typeof s === "string").slice(0, 6),
      needsAttention: (parsed.needsAttention ?? []).filter((s): s is string => typeof s === "string").slice(0, 6),
      actNow: (parsed.actNow ?? []).filter((s): s is string => typeof s === "string").slice(0, 4),
      source: "ai",
    }
  } catch {
    return fallbackNarrative(facts)
  }
}

// Deterministic rendering of the same facts — used when the LLM call fails,
// so the analyst tab always shows something correct.
export function fallbackNarrative(facts: AnalystFacts): AnalystNarrative {
  const doingWell: string[] = []
  const needsAttention: string[] = []
  const actNow: string[] = []

  if (facts.week.aiReplies7d > 0) doingWell.push(`Your AI sent ${facts.week.aiReplies7d.toLocaleString()} replies this week across ${facts.week.activeConversations7d.toLocaleString()} active conversations.`)
  if (facts.week.leads7d > 0) doingWell.push(`${facts.week.leads7d} new leads captured this week.`)
  if (facts.week.aborts7d > 0) doingWell.push(`${facts.week.aborts7d} times the AI stepped back because you answered first — no double replies.`)
  if (facts.banRisk.level === "low" && facts.week.aiReplies7d > 0) doingWell.push("Your sending pattern looks safe — no ban-risk flags.")

  for (const a of facts.agents) {
    if (a.banned) actNow.push(`"${a.name}": this WhatsApp number is banned. Appeal in WhatsApp (Request a review) or link a new number.`)
    else if (a.needsRelink) actNow.push(`"${a.name}": WhatsApp is disconnected — open Channels and relink to resume replies.`)
  }
  if (facts.billing.blockedNow && facts.billing.blockReason) actNow.push(facts.billing.blockReason + " — top up credits or upgrade to resume.")
  if (facts.banRisk.level === "high") actNow.push("Your sending pattern has a HIGH ban risk. Pause broadcasts and review the flagged behaviours.")

  if (facts.banRisk.level === "elevated") needsAttention.push("Ban risk is elevated — review the flagged sending behaviours before your next campaign.")
  for (const r of facts.banRisk.reasons.slice(0, 4)) needsAttention.push(r)
  if (!facts.billing.blockedNow && facts.billing.projectedRunoutDays !== null && facts.billing.projectedRunoutDays <= 7) {
    needsAttention.push(`At your current pace you have about ${facts.billing.projectedRunoutDays} day(s) of credits left.`)
  }
  if (facts.billing.paygActive) needsAttention.push(`You're running on pay-as-you-go credits (${facts.billing.walletBalance.toLocaleString()} left).`)

  const summary = facts.billing.blockedNow
    ? "Your AI is currently paused for billing — see the action items below to get replies flowing again."
    : facts.agents.some((a) => a.banned || a.needsRelink)
      ? "Your account mostly looks fine, but at least one WhatsApp connection needs attention — see the action items."
      : `Things look healthy: ${facts.week.aiReplies7d.toLocaleString()} AI replies and ${facts.week.leads7d} leads this week, ban risk ${facts.banRisk.level}.`

  return { summary, doingWell, needsAttention, actNow, source: "fallback" }
}
