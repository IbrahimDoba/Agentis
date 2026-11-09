import { z } from "zod"
import { STATUS_CREDITS, type StatusKind } from "@/lib/status-post"

// Status → Autopilot rules, shared by the Autopilot tab, its API routes and the
// planner, so no server-only imports here. A plan is the one shape every way in
// produces (suggested, preset, the owner's own words); the planner only ever
// follows a plan, it never decides on its own what or when to post.

export const AUTOPILOT_MAX_PER_DAY = 6
export const AUTOPILOT_MIN_GAP_MINUTES = 120
export const AUTOPILOT_HORIZON_DAYS = 7
export const AUTOPILOT_MAX_SLOTS = 12
export const NO_REPEAT_MAX_DAYS = 30
export const TAG_MAX = 24
export const TAGS_PER_ITEM = 5
// Posts go out a few minutes after the set time, never on the dot every day.
const JITTER_MINUTES = 10
const DAY_MS = 86_400_000
const LAGOS_OFFSET_MS = 60 * 60 * 1000

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
export const ORDERS = ["rotate", "best", "newest"] as const
export type AutopilotOrder = (typeof ORDERS)[number]
export const ORDER_LABEL: Record<AutopilotOrder, string> = {
  rotate: "taking turns",
  best: "best results first",
  newest: "newest first",
}

export const SlotSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00"),
  days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day").max(7),
  kinds: z.array(z.enum(["text", "image", "video"])).max(3),
  tags: z.array(z.string().max(TAG_MAX)).max(10),
  order: z.enum(ORDERS),
})

export const PlanSchema = z.object({
  slots: z.array(SlotSchema).min(1, "Add at least one posting time").max(AUTOPILOT_MAX_SLOTS),
  noRepeatDays: z.number().int().min(0).max(NO_REPEAT_MAX_DAYS),
  skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
})

export type AutopilotSlot = z.infer<typeof SlotSchema>
export type AutopilotPlan = z.infer<typeof PlanSchema>

export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase()
  if (!tag || tag.length > TAG_MAX || !/^[\p{L}\p{N} _-]+$/u.test(tag)) return null
  return tag
}

export function normalizeTags(raw: string[]): string[] {
  return [...new Set(raw.map(normalizeTag).filter((t): t is string => !!t))]
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function timeLabel(time: string): string {
  const mins = minutesOf(time)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`
}

// Cleans a plan and enforces the limits whatever the plan says: at most 6 posts
// a day, 2 hours apart. Later times on a crowded day are dropped, and each drop
// is reported so the owner sees what was left out instead of it vanishing.
export function normalizePlan(input: AutopilotPlan): { plan: AutopilotPlan; dropped: string[] } {
  const slots = input.slots
    .map((s) => ({
      ...s,
      days: [...new Set(s.days)].sort((a, b) => a - b),
      kinds: [...new Set(s.kinds)],
      tags: normalizeTags(s.tags),
    }))
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time))

  const reasons = new Map<number, { tooClose: number[]; tooMany: number[] }>()
  for (let day = 0; day < 7; day++) {
    let kept = 0
    let last = -Infinity
    slots.forEach((slot, i) => {
      if (!slot.days.includes(day)) return
      const at = minutesOf(slot.time)
      const r = reasons.get(i) ?? { tooClose: [], tooMany: [] }
      if (kept >= AUTOPILOT_MAX_PER_DAY) r.tooMany.push(day)
      else if (at - last < AUTOPILOT_MIN_GAP_MINUTES) r.tooClose.push(day)
      else {
        kept++
        last = at
        return
      }
      reasons.set(i, r)
    })
  }

  const dropped: string[] = []
  const kept = slots.flatMap((slot, i) => {
    const r = reasons.get(i)
    if (!r) return [slot]
    if (r.tooClose.length) dropped.push(`${timeLabel(slot.time)} on ${daysLabel(r.tooClose)}: less than 2 hours after another post`)
    if (r.tooMany.length) dropped.push(`${timeLabel(slot.time)} on ${daysLabel(r.tooMany)}: more than ${AUTOPILOT_MAX_PER_DAY} posts that day`)
    const days = slot.days.filter((d) => !r.tooClose.includes(d) && !r.tooMany.includes(d))
    return days.length ? [{ ...slot, days }] : []
  })

  return {
    plan: { slots: kept, noRepeatDays: input.noRepeatDays, skipDates: [...new Set(input.skipDates)].sort() },
    dropped,
  }
}

export function lagosDayKey(ms: number): string {
  return new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 10)
}

function lagosMidnight(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00Z`) - LAGOS_OFFSET_MS
}

// Stable per slot, so planning the same week twice gives the same times.
function jitterMinutes(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 0) % JITTER_MINUTES
}

export interface Occurrence {
  key: string
  slotIndex: number
  dayKey: string
  at: number
}

// Every slot time between from and to, in Lagos days, earliest first. The key
// is what makes a slot unique in the database.
export function expandPlan(plan: AutopilotPlan, fromMs: number, toMs: number): Occurrence[] {
  const out: Occurrence[] = []
  const skip = new Set(plan.skipDates)
  for (let midnight = lagosMidnight(lagosDayKey(fromMs)); midnight < toMs; midnight += DAY_MS) {
    const dayKey = lagosDayKey(midnight)
    if (skip.has(dayKey)) continue
    const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay()
    plan.slots.forEach((slot, slotIndex) => {
      if (!slot.days.includes(weekday)) return
      const key = `${dayKey} ${slot.time}`
      const at = midnight + (minutesOf(slot.time) + jitterMinutes(key)) * 60_000
      if (at >= fromMs && at < toMs) out.push({ key, slotIndex, dayKey, at })
    })
  }
  return out.sort((a, b) => a.at - b.at)
}

export interface AutopilotCandidate {
  id: string
  kind: StatusKind
  tags: string[]
  createdAt: number
  // Best single post's replies, then views: what "best results first" ranks by.
  score: number
}

export function slotMatches(slot: AutopilotSlot, c: AutopilotCandidate): boolean {
  if (slot.kinds.length && !slot.kinds.includes(c.kind)) return false
  return !slot.tags.length || c.tags.some((t) => slot.tags.includes(t))
}

// When each card has gone out or is due to, including picks made earlier in the
// same planning run. Mutated by pickOne.
export type Uses = Map<string, number[]>

export function pickOne(
  slot: AutopilotSlot,
  at: number,
  noRepeatDays: number,
  candidates: AutopilotCandidate[],
  uses: Uses,
  exclude: Set<string> = new Set(),
): { id: string; repeat: boolean } | null {
  const matching = candidates.filter((c) => !exclude.has(c.id) && slotMatches(slot, c))
  if (!matching.length) return null
  const window = noRepeatDays * DAY_MS
  const fresh = matching.filter((c) => (uses.get(c.id) ?? []).every((u) => Math.abs(at - u) >= window))
  const pool = fresh.length ? fresh : matching
  const lastUse = (c: AutopilotCandidate) => Math.max(-Infinity, ...(uses.get(c.id) ?? []).filter((u) => u <= at))
  const byRotation = (a: AutopilotCandidate, b: AutopilotCandidate) => lastUse(a) - lastUse(b) || a.createdAt - b.createdAt

  const order = fresh.length ? slot.order : "rotate"
  const sorted = [...pool].sort(
    order === "newest" ? (a, b) => b.createdAt - a.createdAt
      : order === "best" ? (a, b) => b.score - a.score || byRotation(a, b)
        : byRotation,
  )
  const pick = sorted[0]
  uses.set(pick.id, [...(uses.get(pick.id) ?? []), at])
  return { id: pick.id, repeat: !fresh.length }
}

export interface PlannedPost extends Occurrence {
  itemId: string | null
  repeat: boolean
}

export function pickForOccurrences(
  plan: AutopilotPlan,
  occurrences: Occurrence[],
  candidates: AutopilotCandidate[],
  uses: Uses,
): PlannedPost[] {
  return occurrences.map((occ) => {
    const pick = pickOne(plan.slots[occ.slotIndex], occ.at, plan.noRepeatDays, candidates, uses)
    return { ...occ, itemId: pick?.id ?? null, repeat: pick?.repeat ?? false }
  })
}

function daysLabel(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 7) return "every day"
  const contiguous = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  return contiguous ? `${DAY_LABELS[sorted[0]]}-${DAY_LABELS[sorted[sorted.length - 1]]}` : sorted.map((d) => DAY_LABELS[d]).join(", ")
}

const KIND_WORD: Record<StatusKind, string> = { text: "text", image: "image", video: "video" }

export function describeSlot(slot: AutopilotSlot): string {
  const what = slot.kinds.length === 0 || slot.kinds.length === 3
    ? "any post"
    : slot.kinds.map((k) => KIND_WORD[k]).join(" or ")
  const tags = slot.tags.length ? ` tagged ${slot.tags.join(" or ")}` : ""
  const days = daysLabel(slot.days)
  return `${days.charAt(0).toUpperCase()}${days.slice(1)} at ${timeLabel(slot.time)}: ${what}${tags}, ${ORDER_LABEL[slot.order]}`
}

export function describePlan(plan: AutopilotPlan): string[] {
  const lines = plan.slots.map(describeSlot)
  lines.push(plan.noRepeatDays > 0 ? `The same post doesn't come back within ${plan.noRepeatDays} ${plan.noRepeatDays === 1 ? "day" : "days"}` : "Posts can repeat any day")
  if (plan.skipDates.length) lines.push(`Skips ${plan.skipDates.join(", ")}`)
  return lines
}

// "No posts this Sunday" is one date, but the model sometimes also takes
// Sunday off every slot. When a change adds a skip date and drops that same
// weekday, the weekday comes back, unless the owner said it's for good.
export function restoreOneOffDays(current: AutopilotPlan, next: AutopilotPlan, instructions: string): AutopilotPlan {
  if (/\b(never|every|always|anymore|any more|no more|stop)\b/i.test(instructions)) return next
  const skippedWeekdays = new Set(
    next.skipDates.filter((d) => !current.skipDates.includes(d)).map((d) => new Date(`${d}T00:00:00Z`).getUTCDay()),
  )
  if (!skippedWeekdays.size) return next
  return {
    ...next,
    slots: next.slots.map((slot) => {
      const before = current.slots.find((c) => c.time === slot.time)
      const lost = (before?.days ?? []).filter((d) => skippedWeekdays.has(d) && !slot.days.includes(d))
      return lost.length ? { ...slot, days: [...slot.days, ...lost].sort((a, b) => a - b) } : slot
    }),
  }
}

export function postsPerWeek(plan: AutopilotPlan): number {
  return plan.slots.reduce((n, s) => n + s.days.length, 0)
}

// What the owner should know before turning it on, worst first.
export function planWarnings(plan: AutopilotPlan, candidates: AutopilotCandidate[], planned: PlannedPost[]): string[] {
  if (candidates.length === 0) return ["Your gallery has nothing Autopilot can post yet. Post something or save it to your gallery first."]
  const warnings: string[] = []
  plan.slots.forEach((slot) => {
    if (!candidates.some((c) => slotMatches(slot, c))) warnings.push(`Nothing in your gallery fits "${describeSlot(slot)}", so it's skipped.`)
  })
  // Named per slot: "6 posts for 8 slots" hid that one tag had a single post.
  const repeatingSlots = new Set(planned.filter((p) => p.repeat).map((p) => p.slotIndex))
  for (const i of repeatingSlots) {
    const slot = plan.slots[i]
    const n = candidates.filter((c) => slotMatches(slot, c)).length
    warnings.push(
      `Only ${n} ${n === 1 ? "post fits" : "posts fit"} "${describeSlot(slot)}", so ${n === 1 ? "it comes" : "they come"} back sooner than ${plan.noRepeatDays} days. Tag more posts for it, or post less often.`,
    )
  }
  return warnings
}

export function creditsFor(kinds: StatusKind[]): number {
  return kinds.reduce((n, k) => n + STATUS_CREDITS[k], 0)
}

const MON_SAT = [1, 2, 3, 4, 5, 6]
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const anyPost = (time: string, days: number[], order: AutopilotOrder = "rotate"): AutopilotSlot => ({ time, days, kinds: [], tags: [], order })

export interface AutopilotPreset {
  id: string
  name: string
  description: string
  plan: AutopilotPlan
}

export const AUTOPILOT_PRESETS: AutopilotPreset[] = [
  {
    id: "daily",
    name: "Daily seller",
    description: "3 posts a day, Monday to Saturday, taking turns through your gallery.",
    plan: { slots: [anyPost("09:00", MON_SAT), anyPost("13:00", MON_SAT), anyPost("19:00", MON_SAT)], noRepeatDays: 3, skipDates: [] },
  },
  {
    id: "gentle",
    name: "Gentle",
    description: "1 post every evening.",
    plan: { slots: [anyPost("19:00", EVERY_DAY)], noRepeatDays: 5, skipDates: [] },
  },
  {
    id: "new-arrivals",
    name: "New arrivals first",
    description: "2 posts a day, your newest posts first.",
    plan: { slots: [anyPost("10:00", EVERY_DAY, "newest"), anyPost("18:00", EVERY_DAY, "newest")], noRepeatDays: 2, skipDates: [] },
  },
  {
    id: "weekend",
    name: "Weekend push",
    description: "1 post each evening, and 3 a day from Friday to Sunday.",
    plan: {
      slots: [anyPost("10:00", [0, 5, 6]), anyPost("14:00", [0, 5, 6]), anyPost("19:00", EVERY_DAY)],
      noRepeatDays: 2,
      skipDates: [],
    },
  },
]

// Sized to the gallery so a small one doesn't repeat every day: 1 a day up to 4
// posts, 2 up to 10, then 3. Monday to Saturday, taking turns.
export function suggestPlan(candidates: AutopilotCandidate[]): AutopilotPlan {
  const n = candidates.length
  const perDay = n <= 4 ? 1 : n <= 10 ? 2 : 3
  const times = perDay === 1 ? ["19:00"] : perDay === 2 ? ["10:00", "19:00"] : ["09:00", "13:00", "19:00"]
  // Each card can go out about every n / (posts a day) posting days; the window
  // sits just under that so there's always something fresh to pick.
  const noRepeatDays = Math.max(0, Math.min(7, Math.floor(((n / perDay) * 7) / 6) - 1))
  return { slots: times.map((t) => anyPost(t, MON_SAT)), noRepeatDays, skipDates: [] }
}
