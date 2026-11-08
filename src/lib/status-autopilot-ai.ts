import OpenAI from "openai"
import { z } from "zod"
import {
  AUTOPILOT_MAX_PER_DAY,
  AUTOPILOT_MAX_SLOTS,
  NO_REPEAT_MAX_DAYS,
  ORDERS,
  SlotSchema,
  TAGS_PER_ITEM,
  lagosDayKey,
  normalizePlan,
  normalizeTags,
  restoreOneOffDays,
  type AutopilotPlan,
} from "@/lib/status-autopilot"

// The AI only writes a plan for the owner to check; it never schedules
// anything itself. gpt-4o, not mini: mini put "2 a day, morning and night" on
// Mon-Sat and asked questions it was told not to. One plan costs a few naira.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const PLAN_MODEL = "gpt-4o"
const TAG_MODEL = "gpt-4o-mini"

// The model gets weekday names, not 0-6: with numbers it put "Friday" on
// Thursday. Converted back before anything else sees the plan.
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

// Strict json_schema mode needs every property listed in `required` and
// forbids pattern/min/max, so limits are enforced by PlanSchema afterwards.
const SLOT_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["time", "days", "kinds", "tags", "order"],
  properties: {
    time: { type: "string" },
    days: { type: "array", items: { type: "string", enum: [...DAY_NAMES] } },
    kinds: { type: "array", items: { type: "string", enum: ["text", "image", "video"] } },
    tags: { type: "array", items: { type: "string" } },
    order: { type: "string", enum: [...ORDERS] },
  },
}

const PLAN_RESPONSE = {
  type: "object",
  additionalProperties: false,
  required: ["status", "question", "unsupported", "plan"],
  properties: {
    status: { type: "string", enum: ["ok", "unclear"] },
    question: { type: ["string", "null"] },
    unsupported: { type: "array", items: { type: "string" } },
    plan: {
      type: "object",
      additionalProperties: false,
      required: ["slots", "noRepeatDays", "skipDates"],
      properties: {
        slots: { type: "array", items: SLOT_JSON },
        noRepeatDays: { type: "integer" },
        skipDates: { type: "array", items: { type: "string" } },
      },
    },
  },
}

const ModelSlot = SlotSchema.extend({ days: z.array(z.enum(DAY_NAMES)).min(1) })

const PlanReply = z.object({
  status: z.enum(["ok", "unclear"]),
  question: z.string().nullable(),
  unsupported: z.array(z.string()),
  // Looser than PlanSchema on purpose: an empty or oversized plan is cleaned
  // up below instead of failing the whole answer.
  plan: z.object({ slots: z.array(ModelSlot).max(50), noRepeatDays: z.number().int(), skipDates: z.array(z.string()) }),
})

const toModelPlan = (plan: AutopilotPlan) => ({ ...plan, slots: plan.slots.map((s) => ({ ...s, days: s.days.map((d) => DAY_NAMES[d]) })) })

export interface GallerySummary {
  total: number
  byKind: { text: number; image: number; video: number }
  tags: Array<{ tag: string; count: number }>
}

function planSystemPrompt(gallery: GallerySummary, today: string, weekday: string): string {
  const tagList = gallery.tags.length ? gallery.tags.map((t) => `"${t.tag}" (${t.count})`).join(", ") : "none yet"
  return `You turn a business owner's instructions into a posting plan for their WhatsApp Status Autopilot.

Autopilot can ONLY do this: at set times on set days (Lagos time), post one item from the owner's gallery of saved posts. Each time slot chooses which gallery items it may use (by type and/or tag) and in what order:
- "rotate": take turns, the one posted longest ago first (the default)
- "newest": newest gallery items first
- "best": items with the most replies and views first
Captions are posted exactly as saved. Autopilot cannot write new captions, create new images or videos, post in groups, send messages to customers, or post anything that isn't already in the gallery.

The owner's gallery: ${gallery.total} items (${gallery.byKind.video} videos, ${gallery.byKind.image} images, ${gallery.byKind.text} text posts). Tags in use: ${tagList}.

Rules for the plan:
- time: 24-hour "HH:MM" with two-digit hours. days: weekday names ("sun" ... "sat").
- If the owner doesn't name days, use every day. "Never on Sunday" or "no Sundays" removes "sun" from every slot.
- Vague times get sensible defaults, never a question: morning 09:00, midday/afternoon 13:00, evening 19:00, night 20:00. "2 a day, morning and night" is a complete plan: 09:00 and 20:00 every day.
- kinds: [] means any type; only list kinds the owner actually names ("videos", "pictures"), never because of what the gallery happens to hold. tags: [] means any tag. Only use tags from the list above, spelled exactly. If the owner names a group of posts that has no tag, still create the slot with tags [] and add to unsupported: "No posts are tagged 'shoes' yet, so any post goes out at that time. Add the tag to those posts in your Gallery and Autopilot will use only them."
- At most ${AUTOPILOT_MAX_PER_DAY} posts a day and at least 2 hours between any two slots on the same day, at most ${AUTOPILOT_MAX_SLOTS} slots. Never put two slots on the same day less than 2 hours apart: give an extra request (like "best sellers once a week") its own time at least 2 hours from the others. Several days with the same time and the same choice are ONE slot with several days.
- "Best sellers" / "best performing" means order "best". "Newest" / "new arrivals first" means order "newest".
- noRepeatDays: days before the same item may be posted again, 0 to ${NO_REPEAT_MAX_DAYS}. Use 3 if the owner doesn't say.
- skipDates: "YYYY-MM-DD" dates with no posts at all. Today is ${weekday} ${today}. A single occasion ("this Sunday", "tomorrow", "next Friday", "on the 25th") goes in skipDates ONLY and leaves every slot's days exactly as they were. Only "never", "no ... anymore" or "every Sunday" changes days.
- If a current plan is given, change only what the instructions ask and copy everything else exactly.
- Only set status "unclear" if there is nothing at all to plan from (no times, no frequency, no days); then ask ONE short question. Otherwise status "ok" with a full plan.

unsupported: each thing the owner asked for that Autopilot can't do, in one plain sentence each. Empty if none.`
}

async function askModel(model: string, system: string, user: string) {
  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name: "AutopilotPlan", strict: true, schema: PLAN_RESPONSE } },
    temperature: 0,
    max_tokens: 2000,
  })
  return PlanReply.safeParse(JSON.parse(completion.choices[0]?.message?.content ?? "null"))
}

export interface InterpretResult {
  status: "ok" | "unclear"
  question: string | null
  unsupported: string[]
  // What was changed or left out to fit the limits or the gallery.
  notes: string[]
  plan: AutopilotPlan
}

export async function interpretInstructions(args: {
  instructions: string
  gallery: GallerySummary
  currentPlan?: AutopilotPlan | null
}): Promise<InterpretResult> {
  const now = Date.now()
  const today = lagosDayKey(now)
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })
  const system = planSystemPrompt(args.gallery, today, weekday)
  const user = args.currentPlan
    ? `Current plan:\n${JSON.stringify(toModelPlan(args.currentPlan))}\n\nChange it like this:\n${args.instructions}`
    : args.instructions

  let reply = await askModel(PLAN_MODEL, system, user).catch(() => null)
  if (!reply?.success) reply = await askModel(PLAN_MODEL, system, user)
  if (!reply.success) throw new Error("The AI returned a plan that couldn't be read")

  // The model is told to use known tags only; anything else is dropped rather
  // than saved as a slot that can never match.
  const known = new Set(args.gallery.tags.map((t) => t.tag))
  const notes: string[] = []
  const slots = reply.data.plan.slots.map((s) => {
    const days = [...new Set(s.days.map((d) => DAY_NAMES.indexOf(d)))]
    const tags = normalizeTags(s.tags)
    const unknown = tags.filter((t) => !known.has(t))
    if (unknown.length) notes.push(`No posts are tagged ${unknown.map((t) => `"${t}"`).join(" or ")} yet, so that time uses any post.`)
    return { ...s, days, tags: tags.filter((t) => known.has(t)) }
  })
  const skipDates = reply.data.plan.skipDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today)
  const noRepeatDays = Math.min(NO_REPEAT_MAX_DAYS, Math.max(0, reply.data.plan.noRepeatDays))
  const proposed = { slots, noRepeatDays, skipDates }
  const { plan, dropped } = normalizePlan(args.currentPlan ? restoreOneOffDays(args.currentPlan, proposed, args.instructions) : proposed)
  plan.slots = plan.slots.slice(0, AUTOPILOT_MAX_SLOTS)
  notes.push(...dropped.map((d) => `Left out ${d}.`))
  const empty = plan.slots.length === 0

  return {
    status: empty ? "unclear" : reply.data.status,
    question: empty ? (reply.data.question ?? "What times and days would you like Autopilot to post?") : reply.data.question,
    unsupported: reply.data.unsupported,
    notes,
    plan,
  }
}

const TAGS_RESPONSE = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "tags"],
        properties: { id: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
      },
    },
  },
}

const TagsReply = z.object({ items: z.array(z.object({ id: z.string(), tags: z.array(z.string()) })) })

// Short labels for gallery cards from their caption and AI note, reusing the
// owner's existing tags where they fit so one product doesn't end up under
// three spellings. Cards with neither (a captionless video) get nothing.
export async function suggestTags(
  items: Array<{ id: string; kind: string; text: string | null; aiNote: string | null }>,
  vocabulary: string[],
): Promise<Array<{ id: string; tags: string[] }>> {
  const described = items.filter((i) => (i.text ?? "").trim() || (i.aiNote ?? "").trim())
  if (!described.length) return []
  const system = `You label a shop's WhatsApp status posts so they can be grouped. For each post give 1-3 short lowercase tags: what the product or topic is (e.g. "ankara", "sneakers", "jollof") and, when clear, what kind of post it is ("offer", "new arrival", "review", "price list"). Reuse these existing tags when they fit: ${vocabulary.length ? vocabulary.join(", ") : "none yet"}. Tags are 1-3 words, no # and no punctuation.`
  const user = JSON.stringify(described.map((i) => ({ id: i.id, type: i.kind, caption: i.text ?? "", note: i.aiNote ?? "" })))
  const completion = await openai.chat.completions.create({
    model: TAG_MODEL,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name: "GalleryTags", strict: true, schema: TAGS_RESPONSE } },
    temperature: 0,
    max_tokens: 2000,
  })
  const parsed = TagsReply.safeParse(JSON.parse(completion.choices[0]?.message?.content ?? "null"))
  if (!parsed.success) throw new Error("The AI returned tags that couldn't be read")
  const ids = new Set(described.map((i) => i.id))
  return parsed.data.items
    .filter((i) => ids.has(i.id))
    .map((i) => ({ id: i.id, tags: normalizeTags(i.tags).slice(0, Math.min(3, TAGS_PER_ITEM)) }))
    .filter((i) => i.tags.length > 0)
}
