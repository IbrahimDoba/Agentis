import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"

// The worker is a separate service; scheduling a post there is the only thing
// faked. Everything else runs against the real database.
vi.mock("@/lib/baileys-client", () => ({
  baileysClient: { scheduleStatusPost: vi.fn(async () => ({ ok: true, data: { ok: true } })) },
}))

import { db } from "@/lib/db"
import { MAX_POSTS_PER_DAY } from "@/lib/status-post"
import { lagosDayKey, type AutopilotPlan } from "@/lib/status-autopilot"
import { checkAutopilotFailures, planAutopilot, swapUpcoming } from "./status-autopilot-planner"

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const DAY = 86_400_000

describe("status autopilot planner (real DB)", () => {
  let userId: string
  let agentId: string
  const email = `vitest-autopilot-${Date.now()}@example.test`

  async function setPlan(plan: AutopilotPlan, extra: { enabled?: boolean; pausedReason?: string | null } = {}) {
    const fields = { plan, mode: "custom", enabled: extra.enabled ?? true, pausedReason: extra.pausedReason ?? null, resumedAt: new Date() }
    await db.statusAutopilot.upsert({ where: { agentId }, create: { agentId, ...fields }, update: fields })
  }

  const upcoming = () => db.statusPost.findMany({ where: { agentId, source: "autopilot" }, orderBy: { scheduledAt: "asc" } })

  beforeAll(async () => {
    const u = await db.user.create({
      data: { email, name: "autopilot user", businessName: "co", plan: "basic", subscriptionExpiresAt: new Date(Date.now() + 30 * DAY) },
      select: { id: true },
    })
    userId = u.id
    const a = await db.agent.create({
      data: { userId, businessName: "co", businessDescription: "d", productsServices: "p", faqs: "f", operatingHours: "9-5" },
      select: { id: true },
    })
    agentId = a.id
    await db.baileysSession.create({ data: { agentId } })
    for (const [i, tags] of [["ankara"], ["offer"], []].entries()) {
      await db.statusGalleryItem.create({
        data: { agentId, contentKey: `text:test-${i}`, kind: "text", text: `Post ${i}`, backgroundColor: "#0b3d2e", tags },
      })
    }
  })

  afterAll(async () => {
    await db.statusPost.deleteMany({ where: { agentId } })
    await db.agent.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  beforeEach(async () => {
    await db.statusPost.deleteMany({ where: { agentId } })
    await db.statusGalleryItem.updateMany({ where: { agentId }, data: { autopilot: true } })
  })

  it("fills the next week once, and a second run adds nothing", async () => {
    await setPlan({ slots: [{ time: "09:00", days: EVERY_DAY, kinds: [], tags: [], order: "rotate" }], noRepeatDays: 1, skipDates: [] })
    const first = await planAutopilot(agentId)
    expect(first.created).toBeGreaterThanOrEqual(6)
    expect((await planAutopilot(agentId)).created).toBe(0)

    const rows = await upcoming()
    expect(rows).toHaveLength(first.created)
    expect(new Set(rows.map((r) => r.autopilotKey)).size).toBe(rows.length)
    expect(rows.every((r) => r.status === "scheduled" && r.galleryItemId)).toBe(true)
    // No card twice on consecutive days with a 1-day window and 3 cards.
    rows.slice(1).forEach((r, i) => expect(r.galleryItemId).not.toBe(rows[i].galleryItemId))
  })

  it("only picks cards that match the slot and are ticked", async () => {
    const offer = await db.statusGalleryItem.findFirstOrThrow({ where: { agentId, tags: { has: "offer" } } })
    await setPlan({ slots: [{ time: "19:00", days: EVERY_DAY, kinds: [], tags: ["ankara", "offer"], order: "rotate" }], noRepeatDays: 0, skipDates: [] })
    await planAutopilot(agentId)
    expect((await upcoming()).some((r) => r.galleryItemId === offer.id)).toBe(true)

    await db.statusGalleryItem.update({ where: { id: offer.id }, data: { autopilot: false } })
    await planAutopilot(agentId, { replan: true })
    const rows = await upcoming()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((r) => r.galleryItemId === offer.id)).toBe(false)
  })

  it("keeps a skipped slot skipped unless the plan itself changes", async () => {
    await setPlan({ slots: [{ time: "12:00", days: EVERY_DAY, kinds: [], tags: [], order: "rotate" }], noRepeatDays: 0, skipDates: [] })
    await planAutopilot(agentId)
    const [first] = await upcoming()
    await db.statusPost.update({ where: { id: first.id }, data: { status: "cancelled" } })

    await planAutopilot(agentId, { replan: true, keepSkips: true })
    expect((await upcoming()).find((r) => r.autopilotKey === first.autopilotKey)?.status).toBe("cancelled")

    await planAutopilot(agentId, { replan: true })
    expect((await upcoming()).find((r) => r.autopilotKey === first.autopilotKey)?.status).toBe("scheduled")
  })

  it("leaves room in the daily limit for manual posts", async () => {
    const tomorrowNoon = Date.now() + DAY
    const dayKey = lagosDayKey(tomorrowNoon)
    for (let i = 0; i < MAX_POSTS_PER_DAY; i++) {
      await db.statusPost.create({ data: { agentId, kind: "text", text: `manual ${i}`, scheduledAt: new Date(Date.parse(`${dayKey}T10:00:00Z`) + i * 60_000) } })
    }
    await setPlan({ slots: [{ time: "15:00", days: EVERY_DAY, kinds: [], tags: [], order: "rotate" }], noRepeatDays: 0, skipDates: [] })
    await planAutopilot(agentId)
    expect((await upcoming()).some((r) => r.autopilotKey?.startsWith(dayKey))).toBe(false)
  })

  it("swaps an upcoming post for a different card", async () => {
    await setPlan({ slots: [{ time: "09:00", days: EVERY_DAY, kinds: [], tags: [], order: "rotate" }], noRepeatDays: 0, skipDates: [] })
    await planAutopilot(agentId)
    const [first] = await upcoming()
    expect(await swapUpcoming(agentId, first.id)).toEqual({ ok: true })
    const after = await db.statusPost.findUniqueOrThrow({ where: { id: first.id } })
    expect(after.galleryItemId).not.toBe(first.galleryItemId)
    expect(after.text).not.toBe(first.text)
    expect(after.scheduledAt).toEqual(first.scheduledAt)
  })

  it("pauses after 2 failed posts in a row and clears the week", async () => {
    await setPlan({ slots: [{ time: "09:00", days: EVERY_DAY, kinds: [], tags: [], order: "rotate" }], noRepeatDays: 0, skipDates: [] })
    await planAutopilot(agentId)
    for (const ago of [2, 1]) {
      await db.statusPost.create({
        data: { agentId, kind: "text", text: "x", source: "autopilot", status: "failed", error: "Not enough credits to post", scheduledAt: new Date(Date.now() + 60_000 - ago * 1000) },
      })
    }
    // resumedAt is "now" from setPlan; the failures sit just after it.
    await db.statusAutopilot.update({ where: { agentId }, data: { resumedAt: new Date(Date.now() - 10_000) } })
    const res = await checkAutopilotFailures()
    expect(res.paused).toBeGreaterThanOrEqual(1)
    const ap = await db.statusAutopilot.findUniqueOrThrow({ where: { agentId } })
    expect(ap.pausedReason).toMatch(/Not enough credits/)
    expect((await upcoming()).filter((r) => r.status === "scheduled")).toHaveLength(0)
  })

  it("turning it off removes everything still ahead", async () => {
    await setPlan({ slots: [{ time: "09:00", days: EVERY_DAY, kinds: [], tags: [], order: "rotate" }], noRepeatDays: 0, skipDates: [] })
    await planAutopilot(agentId)
    expect((await upcoming()).length).toBeGreaterThan(0)
    await setPlan({ slots: [{ time: "09:00", days: EVERY_DAY, kinds: [], tags: [], order: "rotate" }], noRepeatDays: 0, skipDates: [] }, { enabled: false })
    await planAutopilot(agentId)
    expect(await upcoming()).toHaveLength(0)
  })
})
