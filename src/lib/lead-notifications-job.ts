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
import { sendLeadWhatsapp, sendHandoffWhatsapp } from "@/lib/lead-whatsapp"

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

// Paying-customer requirement, shared by the instant channel wheres below.
const payingUserOr: Prisma.UserWhereInput["OR"] = [
  { plan: { not: "free" } },
  { creditBalance: { gt: 0 } },
]

// Instant LEAD alerts fire if EITHER channel is on (email lead alerts OR the
// account-wide WhatsApp toggle). Which channel actually sends is decided
// per-owner inside the loop.
const leadInstantWhere: Prisma.UserWhereInput = {
  AND: [
    { OR: [{ leadNotificationsEnabled: true }, { whatsappNotificationsEnabled: true }] },
    { OR: payingUserOr },
  ],
}

// Instant HANDOFF alerts fire if the handoff-email toggle OR WhatsApp is on.
const handoffInstantWhere: Prisma.UserWhereInput = {
  AND: [
    { OR: [{ handoffEmailsEnabled: true }, { whatsappNotificationsEnabled: true }] },
    { OR: payingUserOr },
  ],
}

// A lead's/handoff's own agent session can WhatsApp the owner only when it's
// connected and the notify number isn't the session's own number (a number
// can't message itself). Falls back to email (if that channel is on) otherwise.
function canWhatsappVia(
  session: { status: string; phoneNumber: string | null } | null | undefined,
  notifyNumber: string,
): boolean {
  if (!session || session.status !== "CONNECTED") return false
  const digits = (v: string) => v.replace(/\D/g, "")
  if (session.phoneNumber && digits(session.phoneNumber) === digits(notifyNumber)) return false
  return true
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
      user: leadInstantWhere,
    },
    select: {
      id: true,
      callerNumber: true,
      summary: true,
      conversationId: true,
      agent: {
        select: {
          id: true,
          businessName: true,
          baileysSession: { select: { status: true, phoneNumber: true } },
        },
      },
      user: {
        select: {
          name: true, email: true, resellerId: true,
          leadNotificationsEnabled: true,
          whatsappNotificationsEnabled: true, notifyWhatsappNumber: true,
        },
      },
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
        const owner = lead.user
        const customerName = nameByConv.get(lead.conversationId) ?? null
        if (owner.leadNotificationsEnabled) {
          await sendQualifiedLeadEmail(
            {
              ownerName: owner.name,
              email: owner.email,
              agentName: lead.agent.businessName,
              customerName,
              customerNumber: lead.callerNumber,
              summary: lead.summary,
            },
            brandFor(owner.resellerId),
          )
        }
        if (owner.whatsappNotificationsEnabled && owner.notifyWhatsappNumber && canWhatsappVia(lead.agent.baileysSession, owner.notifyWhatsappNumber)) {
          await sendLeadWhatsapp({
            agentId: lead.agent.id,
            toNumber: owner.notifyWhatsappNumber,
            agentName: lead.agent.businessName,
            customerName,
            customerNumber: lead.callerNumber,
            summary: lead.summary,
          })
        }
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
      agent: { user: handoffInstantWhere },
    },
    select: {
      id: true,
      contactName: true,
      phoneNumber: true,
      handoffReason: true,
      handoffUrgency: true,
      agent: {
        select: {
          id: true,
          businessName: true,
          baileysSession: { select: { status: true, phoneNumber: true } },
          user: {
            select: {
              name: true, email: true, resellerId: true,
              handoffEmailsEnabled: true,
              whatsappNotificationsEnabled: true, notifyWhatsappNumber: true,
            },
          },
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
        const owner = conv.agent.user
        const reason = conv.handoffReason ?? "A customer needs a human."
        const urgency = conv.handoffUrgency === "high" ? "high" : "normal"
        if (owner.handoffEmailsEnabled) {
          await sendHandoffRequestEmail(
            {
              ownerName: owner.name,
              email: owner.email,
              agentName: conv.agent.businessName,
              customerName: conv.contactName,
              customerNumber: conv.phoneNumber,
              reason,
              urgency,
            },
            brandFor(owner.resellerId),
          )
        }
        if (owner.whatsappNotificationsEnabled && owner.notifyWhatsappNumber && canWhatsappVia(conv.agent.baileysSession, owner.notifyWhatsappNumber)) {
          await sendHandoffWhatsapp({
            agentId: conv.agent.id,
            toNumber: owner.notifyWhatsappNumber,
            agentName: conv.agent.businessName,
            customerName: conv.contactName,
            customerNumber: conv.phoneNumber,
            reason,
            urgency,
          })
        }
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
