import { describe, it, expect } from "vitest"
import {
  AUTOPILOT_PRESETS,
  PlanSchema,
  describeSlot,
  expandPlan,
  normalizePlan,
  normalizeTag,
  pickForOccurrences,
  pickOne,
  planWarnings,
  restoreOneOffDays,
  suggestPlan,
  type AutopilotCandidate,
  type AutopilotPlan,
  type AutopilotSlot,
  type Uses,
} from "./status-autopilot"

const slot = (time: string, days: number[], over: Partial<AutopilotSlot> = {}): AutopilotSlot => ({ time, days, kinds: [], tags: [], order: "rotate", ...over })
const plan = (slots: AutopilotSlot[], noRepeatDays = 0): AutopilotPlan => ({ slots, noRepeatDays, skipDates: [] })
const card = (id: string, over: Partial<AutopilotCandidate> = {}): AutopilotCandidate => ({ id, kind: "image", tags: [], createdAt: 0, score: 0, ...over })
const DAY = 86_400_000
// Monday 2026-11-09 00:00 in Lagos.
const MON = Date.parse("2026-11-08T23:00:00Z")

describe("normalizeTag", () => {
  it("lowercases, trims and drops a leading #", () => {
    expect(normalizeTag("  #New  Arrivals ")).toBe("new arrivals")
    expect(normalizeTag("")).toBeNull()
    expect(normalizeTag("a".repeat(30))).toBeNull()
    expect(normalizeTag("price!")).toBeNull()
  })
})

describe("normalizePlan", () => {
  it("drops a time less than 2 hours after another on the same day", () => {
    const { plan: out, dropped } = normalizePlan(plan([slot("09:00", [1, 2]), slot("10:00", [1])]))
    expect(out.slots).toEqual([slot("09:00", [1, 2])])
    expect(dropped).toEqual(["10:00am on Mon: less than 2 hours after another post"])
  })

  it("keeps at most 6 a day", () => {
    const times = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]
    const { plan: out, dropped } = normalizePlan(plan(times.map((t) => slot(t, [3]))))
    expect(out.slots.map((s) => s.time)).toEqual(times.slice(0, 6))
    expect(dropped).toHaveLength(2)
  })

  it("sorts slots and cleans days and tags", () => {
    const { plan: out } = normalizePlan(plan([slot("19:00", [3, 1, 1], { tags: ["Offer", "#offer"] }), slot("09:00", [1])]))
    expect(out.slots.map((s) => s.time)).toEqual(["09:00", "19:00"])
    expect(out.slots[1].days).toEqual([1, 3])
    expect(out.slots[1].tags).toEqual(["offer"])
  })

  it("leaves every preset untouched and valid", () => {
    for (const p of AUTOPILOT_PRESETS) {
      expect(PlanSchema.safeParse(p.plan).success).toBe(true)
      expect(normalizePlan(p.plan).dropped).toEqual([])
    }
  })
})

describe("expandPlan", () => {
  it("lists each slot on its days in Lagos time, earliest first", () => {
    const out = expandPlan(plan([slot("19:00", [1]), slot("09:00", [1, 2])]), MON, MON + 2 * DAY)
    expect(out.map((o) => o.key)).toEqual(["2026-11-09 09:00", "2026-11-09 19:00", "2026-11-10 09:00"])
    // 09:00 Lagos is 08:00 UTC, plus up to 10 minutes.
    const first = out[0].at - Date.parse("2026-11-09T08:00:00Z")
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(10 * 60_000)
  })

  it("gives the same time when planned twice", () => {
    const p = plan([slot("09:00", [1, 2, 3])])
    expect(expandPlan(p, MON, MON + 3 * DAY)).toEqual(expandPlan(p, MON, MON + 3 * DAY))
  })

  it("leaves out skipped dates and times already past", () => {
    const p: AutopilotPlan = { ...plan([slot("09:00", [1, 2])]), skipDates: ["2026-11-10"] }
    expect(expandPlan(p, MON, MON + 2 * DAY).map((o) => o.dayKey)).toEqual(["2026-11-09"])
    expect(expandPlan(p, MON + 12 * 3_600_000, MON + 2 * DAY)).toEqual([])
  })
})

describe("pickOne", () => {
  const s = slot("09:00", [1])

  it("takes turns: never-posted first, then the one posted longest ago", () => {
    const uses: Uses = new Map([["a", [MON - 2 * DAY]], ["b", [MON - 5 * DAY]]])
    expect(pickOne(s, MON, 0, [card("a"), card("b"), card("c", { createdAt: 5 })], uses)?.id).toBe("c")
    expect(pickOne(s, MON + DAY, 0, [card("a"), card("b")], uses)?.id).toBe("b")
  })

  it("respects the no-repeat window and says when it has to repeat", () => {
    const uses: Uses = new Map([["a", [MON - DAY]]])
    expect(pickOne(s, MON, 3, [card("a"), card("b")], uses)).toEqual({ id: "b", repeat: false })
    expect(pickOne(s, MON, 3, [card("a")], new Map([["a", [MON - DAY]]]))).toEqual({ id: "a", repeat: true })
  })

  it("filters by type and tag", () => {
    const cards = [card("img", { tags: ["ankara"] }), card("vid", { kind: "video", tags: ["ankara"] }), card("vid2", { kind: "video" })]
    expect(pickOne(slot("09:00", [1], { kinds: ["video"], tags: ["ankara"] }), MON, 0, cards, new Map())?.id).toBe("vid")
    expect(pickOne(slot("09:00", [1], { tags: ["offer"] }), MON, 0, cards, new Map())).toBeNull()
  })

  it("orders by newest or by results when asked", () => {
    const cards = [card("old", { createdAt: 1, score: 9 }), card("new", { createdAt: 2 })]
    expect(pickOne(slot("09:00", [1], { order: "newest" }), MON, 0, cards, new Map())?.id).toBe("new")
    expect(pickOne(slot("09:00", [1], { order: "best" }), MON, 0, cards, new Map())?.id).toBe("old")
  })
})

describe("pickForOccurrences", () => {
  it("spreads a week across the gallery without repeating inside the window", () => {
    const p = plan([slot("09:00", [1, 2, 3, 4, 5, 6])], 2)
    const planned = pickForOccurrences(p, expandPlan(p, MON, MON + 6 * DAY), [card("a"), card("b"), card("c")], new Map())
    expect(planned.map((x) => x.itemId)).toEqual(["a", "b", "c", "a", "b", "c"])
    expect(planned.some((x) => x.repeat)).toBe(false)
  })
})

describe("planWarnings", () => {
  it("flags an empty gallery, a slot nothing fits and repeats", () => {
    const p = plan([slot("09:00", [1, 2, 3], { tags: ["offer"] }), slot("19:00", [1, 2, 3])], 3)
    expect(planWarnings(p, [], [])[0]).toMatch(/nothing Autopilot can post/)
    const cards = [card("a")]
    const planned = pickForOccurrences(p, expandPlan(p, MON, MON + 3 * DAY), cards, new Map())
    const warnings = planWarnings(p, cards, planned)
    expect(warnings[0]).toMatch(/Nothing in your gallery fits/)
    expect(warnings[1]).toBe('Only 1 post fits "Mon-Wed at 7:00pm: any post, taking turns", so it comes back sooner than 3 days. Tag more posts for it, or post less often.')
  })
})

describe("suggestPlan", () => {
  it("posts less often for a small gallery", () => {
    expect(suggestPlan([card("a"), card("b")]).slots).toHaveLength(1)
    expect(suggestPlan(Array.from({ length: 8 }, (_, i) => card(`${i}`))).slots).toHaveLength(2)
    expect(suggestPlan(Array.from({ length: 20 }, (_, i) => card(`${i}`))).slots).toHaveLength(3)
  })

  it("keeps the no-repeat window short enough that something is always fresh", () => {
    const cards = Array.from({ length: 6 }, (_, i) => card(`${i}`))
    const p = suggestPlan(cards)
    const planned = pickForOccurrences(p, expandPlan(p, MON, MON + 7 * DAY), cards, new Map())
    expect(planned.some((x) => x.repeat)).toBe(false)
  })
})

describe("restoreOneOffDays", () => {
  const before = plan([slot("10:00", [0, 1, 2, 3, 4, 5, 6])])
  // 2026-11-08 is a Sunday.
  const after: AutopilotPlan = { ...plan([slot("10:00", [1, 2, 3, 4, 5, 6])]), skipDates: ["2026-11-08"] }

  it("gives Sunday back when the change was one Sunday", () => {
    expect(restoreOneOffDays(before, after, "no posts this Sunday").slots[0].days).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it("leaves it off when the owner means every Sunday", () => {
    expect(restoreOneOffDays(before, after, "never post on Sunday").slots[0].days).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe("describeSlot", () => {
  it("reads as plain words with a hyphen range", () => {
    expect(describeSlot(slot("09:00", [1, 2, 3, 4, 5, 6], { kinds: ["video"], tags: ["ankara"], order: "newest" })))
      .toBe("Mon-Sat at 9:00am: video tagged ankara, newest first")
    expect(describeSlot(slot("19:30", [0, 1, 2, 3, 4, 5, 6]))).toBe("Every day at 7:30pm: any post, taking turns")
  })
})
