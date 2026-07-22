import { db } from "@/lib/db"
import type { Prisma } from "@/generated/prisma/client"
import { mapWithConcurrency } from "@/lib/concurrency"
import { emailBrandOf } from "@/lib/tenant"
import {
  sendQualifiedLeadEmail,
  sendHandoffRequestEmail,
  sendActivityDigestEmail,
  type EmailBrand,
} from "@/lib/email"

// The instant poller only looks back this far, so a first run (or a run after
// downtime) can never blast a backlog of old leads/handoffs as if they were
// fresh — anything older than this is left for the daily/weekly digest instead.
const INSTANT_LOOKBACK_MS = 60 * 60 * 1000 // 1h
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
// Cap per run so one scan can't fan out to an unbounded email burst.
const MAX_PER_RUN = 200
const EMAIL_CONCURRENCY = 5
const DIGEST_TOP_LEADS = 5

export type DigestPeriod = "day" | "week"

// Who is eligible for notification emails: opted in AND a paying customer —
// either on a paid plan (reseller tenants included, since their plan is
// "reseller", not "free") OR holding a funded pay-as-you-go wallet. Free users
// are excluded so we only email people who pay us. Shared by every query below
// so the rule lives in exactly one place.
const notifiableUserWhere: Prisma.UserWhereInput = {
  leadNotificationsEnabled: true,
  OR: [
    { plan: { not: "free" } },
    { creditBalance: { gt: 0 } },
  ],
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in lead-notifications-job.test.ts)
// ---------------------------------------------------------------------------

// Start of a digest window, counting back from `now`.
export function digestWindowStart(period: DigestPeriod, now: Date): Date {
  return new Date(now.getTime() - (period === "day" ? DAY_MS : WEEK_MS))
}

// The label for a customer in an alert: their saved name, else their number,
// else a neutral fallback. Never leaks an empty string into the email.
export function displayWho(name: string | null | undefined, number: string | null | undefined): string {
  return (name?.trim() || number?.trim() || "A customer")
}

// ---------------------------------------------------------------------------
// Brand resolution — one lookup per run, shared across every email it sends.
// ---------------------------------------------------------------------------

// Resolves each user's reseller into an EmailBrand (undefined for the platform
// tenant → Dailzero defaults). Batches the reseller read so the per-email loop
// stays query-free.
async function loadBrandResolver(resellerIds: string[]): Promise<(id: string) => EmailBrand | undefined> {
  const ids = [...new Set(resellerIds)]
  if (ids.length === 0) return () => undefined
  const resellers = await db.reseller.findMany({ where: { id: { in: ids } } })
  const byId = new Map(resellers.map((r) => [r.id, r]))
  return (id: string) => emailBrandOf(byId.get(id) ?? null)
}

// ---------------------------------------------------------------------------
// Instant alerts — new qualified leads + new handoff requests
// ---------------------------------------------------------------------------

export interface InstantSummary {
  leadsSent: number
  handoffsSent: number
  errors: Array<{ kind: "lead" | "handoff"; id: string; message: string }>
}

export async function runInstantNotifications(now: Date = new Date()): Promise<InstantSummary> {
  const since = new Date(now.getTime() - INSTANT_LOOKBACK_MS)
  const summary: InstantSummary = { leadsSent: 0, handoffsSent: 0, errors: [] }

  // --- Qualified leads: high-intent inline captures only (aiDetected = false),
  //     not yet notified, recent, and the owner hasn't opted out. ---
  const leads = await db.lead.findMany({
    where: {
      aiDetected: false,
      notifiedAt: null,
      createdAt: { gte: since },
      user: notifiableUserWhere,
    },
    select: {
      id: true,
      callerNumber: true,
      summary: true,
      conversationId: true,
      agent: { select: { businessName: true } },
      user: { select: { name: true, email: true, resellerId: true } },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_PER_RUN,
  })

  if (leads.length > 0) {
    // The customer's display name lives on the Conversation, not the Lead —
    // batch it in so the per-lead loop stays query-free.
    const convIds = [...new Set(leads.map((l) => l.conversationId))]
    const convs = await db.conversation.findMany({
      where: { id: { in: convIds } },
      select: { id: true, contactName: true },
    })
    const nameByConv = new Map(convs.map((c) => [c.id, c.contactName]))
    const brandFor = await loadBrandResolver(leads.map((l) => l.user.resellerId))

    await mapWithConcurrency(leads, EMAIL_CONCURRENCY, async (lead) => {
      try {
        await sendQualifiedLeadEmail(
          {
            ownerName: lead.user.name,
            email: lead.user.email,
            agentName: lead.agent.businessName,
            customerName: nameByConv.get(lead.conversationId) ?? null,
            customerNumber: lead.callerNumber,
            summary: lead.summary,
          },
          brandFor(lead.user.resellerId),
        )
        await db.lead.update({ where: { id: lead.id }, data: { notifiedAt: now } })
        summary.leadsSent++
      } catch (err) {
        summary.errors.push({ kind: "lead", id: lead.id, message: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  // --- Handoff requests: any conversation with a fresh handoff not yet
  //     notified. request_human_handoff resets handoffNotifiedAt to NULL, so a
  //     repeat handoff on the same conversation re-arms this alert. ---
  const handoffs = await db.conversation.findMany({
    where: {
      handoffAt: { gte: since },
      handoffNotifiedAt: null,
      agent: { user: notifiableUserWhere },
    },
    select: {
      id: true,
      contactName: true,
      phoneNumber: true,
      handoffReason: true,
      handoffUrgency: true,
      agent: {
        select: {
          businessName: true,
          user: { select: { name: true, email: true, resellerId: true } },
        },
      },
    },
    orderBy: { handoffAt: "asc" },
    take: MAX_PER_RUN,
  })

  if (handoffs.length > 0) {
    const brandFor = await loadBrandResolver(handoffs.map((c) => c.agent.user.resellerId))

    await mapWithConcurrency(handoffs, EMAIL_CONCURRENCY, async (conv) => {
      try {
        await sendHandoffRequestEmail(
          {
            ownerName: conv.agent.user.name,
            email: conv.agent.user.email,
            agentName: conv.agent.businessName,
            customerName: conv.contactName,
            customerNumber: conv.phoneNumber,
            reason: conv.handoffReason ?? "A customer needs a human.",
            urgency: conv.handoffUrgency === "high" ? "high" : "normal",
          },
          brandFor(conv.agent.user.resellerId),
        )
        await db.conversation.update({ where: { id: conv.id }, data: { handoffNotifiedAt: now } })
        summary.handoffsSent++
      } catch (err) {
        summary.errors.push({ kind: "handoff", id: conv.id, message: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  return summary
}

// ---------------------------------------------------------------------------
// Digests — daily / weekly per-account summary
// ---------------------------------------------------------------------------

export interface DigestSummary {
  period: DigestPeriod
  sent: number
  skippedNoActivity: number
  errors: Array<{ userId: string; message: string }>
}

export async function runActivityDigest(period: DigestPeriod, now: Date = new Date()): Promise<DigestSummary> {
  const start = digestWindowStart(period, now)
  const summary: DigestSummary = { period, sent: 0, skippedNoActivity: 0, errors: [] }

  // Qualified leads in the window, owner opted-in. Newest first so each user's
  // "recent leads" slice is the most recent ones.
  const leads = await db.lead.findMany({
    where: {
      aiDetected: false,
      createdAt: { gte: start },
      user: notifiableUserWhere,
    },
    select: {
      userId: true,
      callerNumber: true,
      summary: true,
      agent: { select: { businessName: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // Handoffs in the window, owner opted-in. Only need the count per owner.
  const handoffConvs = await db.conversation.findMany({
    where: {
      handoffAt: { gte: start },
      agent: { user: notifiableUserWhere },
    },
    select: { agent: { select: { userId: true } } },
  })

  // Aggregate per owner.
  const leadsByUser = new Map<string, typeof leads>()
  for (const lead of leads) {
    const arr = leadsByUser.get(lead.userId) ?? []
    arr.push(lead)
    leadsByUser.set(lead.userId, arr)
  }
  const handoffsByUser = new Map<string, number>()
  for (const conv of handoffConvs) {
    const uid = conv.agent.userId
    handoffsByUser.set(uid, (handoffsByUser.get(uid) ?? 0) + 1)
  }

  const userIds = [...new Set([...leadsByUser.keys(), ...handoffsByUser.keys()])]
  if (userIds.length === 0) return summary

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, resellerId: true },
  })
  const brandFor = await loadBrandResolver(users.map((u) => u.resellerId))

  await mapWithConcurrency(users, EMAIL_CONCURRENCY, async (user) => {
    const userLeads = leadsByUser.get(user.id) ?? []
    const handoffCount = handoffsByUser.get(user.id) ?? 0
    // Never send an empty "0 leads today" email.
    if (userLeads.length === 0 && handoffCount === 0) {
      summary.skippedNoActivity++
      return
    }
    try {
      await sendActivityDigestEmail(
        {
          ownerName: user.name,
          email: user.email,
          period,
          qualifiedLeads: userLeads.length,
          handoffs: handoffCount,
          topLeads: userLeads.slice(0, DIGEST_TOP_LEADS).map((l) => ({
            agentName: l.agent.businessName,
            who: displayWho(null, l.callerNumber),
            summary: l.summary,
          })),
        },
        brandFor(user.resellerId),
      )
      summary.sent++
    } catch (err) {
      summary.errors.push({ userId: user.id, message: err instanceof Error ? err.message : String(err) })
    }
  })

  return summary
}
