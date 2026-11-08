import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { isFreeTrialExpired } from "@/lib/trial"
import { MAX_POSTS_PER_DAY, type StatusKind } from "@/lib/status-post"
import {
  AUTOPILOT_HORIZON_DAYS,
  PlanSchema,
  creditsFor,
  expandPlan,
  lagosDayKey,
  normalizePlan,
  pickForOccurrences,
  pickOne,
  planWarnings,
  type AutopilotCandidate,
  type AutopilotPlan,
  type Uses,
} from "@/lib/status-autopilot"

// Server side of Autopilot: turns the saved plan into ordinary scheduled
// StatusPost rows (source "autopilot") up to a week ahead. The worker posts
// them exactly like a manual scheduled post; nothing here talks to WhatsApp.

// A slot this close to now is left alone: the worker may already be on it.
const LEAD_MS = 5 * 60_000
const DAY_MS = 86_400_000
const FAILURES_TO_PAUSE = 2

export interface CardInfo {
  id: string
  kind: StatusKind
  text: string | null
  backgroundColor: string | null
  mediaItemId: string | null
  aiNote: string | null
  tags: string[]
}

// Cards Autopilot may post: in the gallery, not unticked, and with their media
// still in the library. `uses` is when each has gone out or is due to.
export async function loadCandidates(agentId: string): Promise<{ candidates: AutopilotCandidate[]; cards: Map<string, CardInfo>; uses: Uses }> {
  const items = await db.statusGalleryItem.findMany({
    where: { agentId, hiddenAt: null, autopilot: true },
    select: { id: true, kind: true, text: true, backgroundColor: true, mediaItemId: true, aiNote: true, tags: true, createdAt: true },
  })
  const mediaIds = items.map((i) => i.mediaItemId).filter((m): m is string => !!m)
  const live = new Set(
    (await db.mediaItem.findMany({ where: { agentId, id: { in: mediaIds } }, select: { id: true } })).map((m) => m.id),
  )
  const usable = items.filter((i) => i.kind === "text" || (i.mediaItemId && live.has(i.mediaItemId)))
  const posts = await db.statusPost.findMany({
    where: { galleryItemId: { in: usable.map((i) => i.id) }, status: { notIn: ["cancelled", "failed"] } },
    select: { id: true, galleryItemId: true, scheduledAt: true, postedAt: true },
  })
  const funnel = await db.statusView.groupBy({
    by: ["postId"],
    where: { postId: { in: posts.filter((p) => p.postedAt).map((p) => p.id) } },
    _count: { viewedAt: true, repliedAt: true },
  })
  const funnelByPost = new Map(funnel.map((f) => [f.postId, f._count]))

  const uses: Uses = new Map()
  const score = new Map<string, number>()
  for (const p of posts) {
    const id = p.galleryItemId!
    uses.set(id, [...(uses.get(id) ?? []), (p.postedAt ?? p.scheduledAt).getTime()])
    const f = funnelByPost.get(p.id)
    // Replies outrank any number of views: a reply is a customer talking.
    if (f) score.set(id, Math.max(score.get(id) ?? 0, f.repliedAt * 100_000 + f.viewedAt))
  }

  const cards = new Map<string, CardInfo>()
  const candidates = usable.map((i) => {
    cards.set(i.id, { id: i.id, kind: i.kind as StatusKind, text: i.text, backgroundColor: i.backgroundColor, mediaItemId: i.mediaItemId, aiNote: i.aiNote, tags: i.tags })
    return { id: i.id, kind: i.kind as StatusKind, tags: i.tags, createdAt: i.createdAt.getTime(), score: score.get(i.id) ?? 0 }
  })
  return { candidates, cards, uses }
}

export interface PreviewPost {
  key: string
  at: string
  card: CardInfo | null
  repeat: boolean
}

// What a plan would do over the next week, without saving anything. Used for
// the draft preview, the warnings and the credit estimate.
export async function dryRun(agentId: string, input: AutopilotPlan) {
  const { plan, dropped } = normalizePlan(input)
  const { candidates, cards, uses } = await loadCandidates(agentId)
  const now = Date.now()
  const planned = pickForOccurrences(plan, expandPlan(plan, now + LEAD_MS, now + AUTOPILOT_HORIZON_DAYS * DAY_MS), candidates, uses)
  const posts: PreviewPost[] = planned.map((p) => ({ key: p.key, at: new Date(p.at).toISOString(), card: p.itemId ? cards.get(p.itemId)! : null, repeat: p.repeat }))
  const weekCredits = creditsFor(posts.flatMap((p) => (p.card ? [p.card.kind] : [])))
  return { plan, dropped, warnings: planWarnings(plan, candidates, planned), posts, weekCredits, cardCount: candidates.length }
}

// Never-posted Autopilot rows still ahead. Skipped slots (cancelled) go too
// unless keepSkips, so a changed plan starts clean but a retagged card doesn't
// undo the owner's skips.
async function clearUpcoming(agentId: string, keepSkips = false): Promise<void> {
  await db.statusPost.deleteMany({
    where: {
      agentId,
      source: "autopilot",
      status: { in: keepSkips ? ["scheduled"] : ["scheduled", "cancelled"] },
      postedAt: null,
      scheduledAt: { gt: new Date(Date.now() + LEAD_MS) },
    },
  })
}

type AutopilotRow = { id: string; agentId: string; enabled: boolean; pausedReason: string | null; resumedAt: Date | null; createdAt: Date }

async function failureReason(ap: AutopilotRow): Promise<string | null> {
  const last = await db.statusPost.findMany({
    where: { agentId: ap.agentId, source: "autopilot", status: { in: ["posted", "failed"] }, scheduledAt: { gte: ap.resumedAt ?? ap.createdAt } },
    orderBy: { scheduledAt: "desc" },
    take: FAILURES_TO_PAUSE,
    select: { status: true, error: true },
  })
  if (last.length < FAILURES_TO_PAUSE || last.some((p) => p.status !== "failed")) return null
  return `The last ${FAILURES_TO_PAUSE} Autopilot posts failed: ${last[0].error ?? "unknown error"}. Fix that, then turn Autopilot back on.`
}

async function pause(ap: AutopilotRow, reason: string): Promise<void> {
  // Guarded: the owner turning it off or back on in the meantime wins.
  const { count } = await db.statusAutopilot.updateMany({ where: { id: ap.id, enabled: true, pausedReason: null }, data: { pausedReason: reason } })
  if (count > 0) await clearUpcoming(ap.agentId)
}

async function stopReason(ap: AutopilotRow): Promise<string | null> {
  const agent = await db.agent.findUnique({
    where: { id: ap.agentId },
    select: {
      user: { select: { plan: true, resellerId: true, subscriptionExpiresAt: true, creditBalance: true, creditsExpireAt: true } },
      baileysSession: { select: { agentId: true } },
    },
  })
  if (!agent?.baileysSession) return "This agent's WhatsApp number isn't linked by QR code any more. Link it, then turn Autopilot back on."
  if (isFreeTrialExpired(agent.user)) return "Your free trial has ended. Choose a plan, then turn Autopilot back on."
  return failureReason(ap)
}

// Keeps the next week filled. replan clears upcoming posts first (the plan or
// the cards changed). Safe to run any number of times: a slot already in the
// table, posted, skipped or scheduled, is never filled twice.
export async function planAutopilot(agentId: string, opts: { replan?: boolean; keepSkips?: boolean } = {}): Promise<{ created: number; paused?: string }> {
  const ap = await db.statusAutopilot.findUnique({ where: { agentId } })
  if (!ap) return { created: 0 }
  if (!ap.enabled || ap.pausedReason) await clearUpcoming(agentId)
  else if (opts.replan) await clearUpcoming(agentId, opts.keepSkips)
  if (!ap.enabled || ap.pausedReason) return { created: 0 }

  const reason = await stopReason(ap)
  if (reason) {
    await pause(ap, reason)
    return { created: 0, paused: reason }
  }
  const parsed = PlanSchema.safeParse(ap.plan)
  if (!parsed.success) {
    const msg = "Autopilot's plan couldn't be read. Open it, check it and save it again."
    await pause(ap, msg)
    return { created: 0, paused: msg }
  }
  const { plan } = normalizePlan(parsed.data)

  const now = Date.now()
  const from = now + LEAD_MS
  const to = now + AUTOPILOT_HORIZON_DAYS * DAY_MS
  const occurrences = expandPlan(plan, from, to)
  const taken = new Set(
    (await db.statusPost.findMany({
      where: { agentId, autopilotKey: { in: occurrences.map((o) => o.key) } },
      select: { autopilotKey: true },
    })).map((p) => p.autopilotKey),
  )
  const open = occurrences.filter((o) => !taken.has(o.key))

  let created = 0
  if (open.length > 0) {
    const { candidates, cards, uses } = await loadCandidates(agentId)
    // Autopilot shares the daily limit with manual posts, so a busy day of
    // manual posting leaves fewer Autopilot slots, never more than the limit.
    const perDay = new Map<string, number>()
    const sameWeek = await db.statusPost.findMany({
      where: { agentId, scheduledAt: { gte: new Date(from - DAY_MS), lt: new Date(to) }, status: { notIn: ["cancelled", "failed"] } },
      select: { scheduledAt: true },
    })
    for (const p of sameWeek) {
      const k = lagosDayKey(p.scheduledAt.getTime())
      perDay.set(k, (perDay.get(k) ?? 0) + 1)
    }

    const rows = pickForOccurrences(plan, open, candidates, uses).flatMap((p) => {
      const card = p.itemId ? cards.get(p.itemId) : null
      const n = perDay.get(p.dayKey) ?? 0
      if (!card || n >= MAX_POSTS_PER_DAY) return []
      perDay.set(p.dayKey, n + 1)
      return [{
        agentId,
        kind: card.kind,
        text: card.text,
        backgroundColor: card.backgroundColor,
        font: card.kind === "text" ? 1 : null,
        mediaItemId: card.mediaItemId,
        aiNote: card.aiNote,
        galleryItemId: card.id,
        scheduledAt: new Date(p.at),
        source: "autopilot",
        autopilotKey: p.key,
      }]
    })
    // skipDuplicates covers two runs racing on the same slot (unique key).
    if (rows.length) created = (await db.statusPost.createMany({ data: rows, skipDuplicates: true })).count
  }

  await queueUpcoming(agentId)
  return { created }
}

// Re-adding a job is a no-op on the worker (the job id carries the time), so
// every upcoming row is sent each run. That also repairs a slot whose earlier
// schedule call failed.
async function queueUpcoming(agentId: string): Promise<void> {
  const upcoming = await db.statusPost.findMany({
    where: { agentId, source: "autopilot", status: "scheduled", scheduledAt: { gt: new Date() } },
    select: { id: true },
  })
  for (const p of upcoming) {
    const res = await baileysClient.scheduleStatusPost(agentId, p.id).catch(() => ({ ok: false as const }))
    if (!res.ok) {
      console.error("[status-autopilot] couldn't reach the worker to schedule", { agentId, postId: p.id })
      return
    }
  }
}

// Owner's Swap on an upcoming post: the next card that fits the same slot.
export async function swapUpcoming(agentId: string, postId: string): Promise<{ ok: true } | { error: string; status: number }> {
  const [post, ap] = await Promise.all([
    db.statusPost.findFirst({ where: { id: postId, agentId, source: "autopilot", status: "scheduled" } }),
    db.statusAutopilot.findUnique({ where: { agentId }, select: { plan: true } }),
  ])
  if (!post) return { error: "That post isn't coming up any more", status: 404 }
  const parsed = PlanSchema.safeParse(ap?.plan)
  const time = post.autopilotKey?.split(" ")[1]
  const weekday = new Date(`${post.autopilotKey?.split(" ")[0]}T00:00:00Z`).getUTCDay()
  const slot = parsed.success ? parsed.data.slots.find((s) => s.time === time && s.days.includes(weekday)) : undefined
  const { candidates, cards, uses } = await loadCandidates(agentId)
  const pick = pickOne(
    slot ?? { time: time ?? "00:00", days: [weekday], kinds: [], tags: [], order: "rotate" },
    post.scheduledAt.getTime(),
    parsed.success ? parsed.data.noRepeatDays : 0,
    candidates,
    uses,
    new Set(post.galleryItemId ? [post.galleryItemId] : []),
  )
  const card = pick ? cards.get(pick.id) : null
  if (!card) return { error: "Nothing else in your gallery fits this slot", status: 409 }
  const { count } = await db.statusPost.updateMany({
    where: { id: post.id, status: "scheduled" },
    data: {
      kind: card.kind,
      text: card.text,
      backgroundColor: card.backgroundColor,
      font: card.kind === "text" ? 1 : null,
      mediaItemId: card.mediaItemId,
      aiNote: card.aiNote,
      galleryItemId: card.id,
    },
  })
  if (count === 0) return { error: "That post is already going out", status: 409 }
  return { ok: true }
}

// Daily: keep every active plan filled a week ahead. Each agent is separate so
// one bad plan can't stop the rest.
export async function runAutopilotTopUp(): Promise<{ agents: number; created: number; paused: number; errors: number }> {
  const active = await db.statusAutopilot.findMany({ where: { enabled: true, pausedReason: null }, select: { agentId: true } })
  let created = 0
  let paused = 0
  let errors = 0
  for (const { agentId } of active) {
    try {
      const r = await planAutopilot(agentId)
      created += r.created
      if (r.paused) paused++
    } catch (err) {
      errors++
      console.error("[status-autopilot] top-up failed", { agentId }, err)
    }
  }
  return { agents: active.length, created, paused, errors }
}

// Every couple of minutes: pause a plan whose posts keep failing, so a
// disconnected number or an empty wallet doesn't fail a week of posts. Cheap:
// one query per active plan, no worker calls.
export async function checkAutopilotFailures(): Promise<{ checked: number; paused: number }> {
  const active = await db.statusAutopilot.findMany({ where: { enabled: true, pausedReason: null } })
  let paused = 0
  for (const ap of active) {
    const reason = await failureReason(ap)
    if (reason) {
      await pause(ap, reason)
      paused++
    }
  }
  return { checked: active.length, paused }
}

// What the AI and the Autopilot tab are told about the gallery.
export function summarize(candidates: AutopilotCandidate[]) {
  const byKind = { text: 0, image: 0, video: 0 }
  const tagCount = new Map<string, number>()
  for (const c of candidates) {
    byKind[c.kind]++
    for (const t of c.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  }
  const tags = [...tagCount].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  return { total: candidates.length, byKind, tags }
}

// Upcoming Autopilot posts for the tab, skipped ones included so they can be
// shown as skipped.
export async function listUpcoming(agentId: string) {
  const now = Date.now()
  const rows = await db.statusPost.findMany({
    where: {
      agentId,
      source: "autopilot",
      status: { in: ["scheduled", "posting", "cancelled"] },
      scheduledAt: { gte: new Date(now - 30 * 60_000), lt: new Date(now + (AUTOPILOT_HORIZON_DAYS + 1) * DAY_MS) },
    },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, status: true, scheduledAt: true, kind: true, text: true, backgroundColor: true, mediaItemId: true, aiNote: true },
  })
  return rows.map((r) => ({ ...r, kind: r.kind as StatusKind, scheduledAt: r.scheduledAt.toISOString() }))
}

// The tab tops the week up when it's opened, so a missed daily run doesn't
// leave the preview short. Only when the furthest planned post is under 6 days
// out, to keep repeated opens from calling the worker each time.
export async function topUpIfShort(agentId: string): Promise<void> {
  const last = await db.statusPost.findFirst({
    where: { agentId, source: "autopilot", status: { in: ["scheduled", "cancelled"] } },
    orderBy: { scheduledAt: "desc" },
    select: { scheduledAt: true },
  })
  if (!last || last.scheduledAt.getTime() < Date.now() + (AUTOPILOT_HORIZON_DAYS - 1) * DAY_MS) await planAutopilot(agentId)
}
