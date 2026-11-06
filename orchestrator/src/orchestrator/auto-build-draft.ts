// The pure half of building an agent from WhatsApp: prompt in, validated draft
// out, and the guidelines text we store. No config or DB imports, so it stays
// testable (see the config.ts landmine in CLAUDE.md).

export interface AutoBuildProfile {
  businessName: string
  description: string | null
  category: string | null
  address: string | null
  contactEmail: string | null
  websiteLinks: string | null
}

export interface AutoBuildChat {
  messages: { fromBusiness: boolean; text: string }[]
}

export interface AutoBuildDraft {
  description: string
  instructions: string
  products: { name: string; price: string; notes: string }[]
  faqs: { question: string; answer: string }[]
}

export const AUTO_BUILD_SYSTEM_PROMPT = `You set up WhatsApp customer service agents for businesses. You get the business's WhatsApp profile and some of its most recent chats. Write the configuration for an agent that will answer this business's customers in its voice.

Return ONLY a JSON object with these keys:
- "description": 1-2 sentences on what the business does.
- "instructions": 100-300 words of instructions addressed to the agent ("You are the assistant for..."). Cover what the business sells, how the owner talks (tone, language, Pidgin or Hausa if they use it), and any delivery, payment or opening-hours details you saw. Do not put prices in here.
- "products": what the business sells, as {"name", "price", "notes"}. "price" is the amount the owner actually stated, or "" if they didn't state one.
- "faqs": up to 8 questions customers really ask with the owner's actual answers, as {"question", "answer"}.

Rules:
- BUSINESS lines are the owner, CUSTOMER lines are the other person.
- Ignore chats with friends and family, and chats where the owner is the one buying something. Learn only from chats about this business.
- Never invent a product, price or policy. Leave it out if you didn't see it. Use an empty list when there is nothing to report, and only include a question if you saw the owner answer it.
- Write generally: no customer names or phone numbers.`

export function buildAutoBuildUserPrompt(profile: AutoBuildProfile, chats: AutoBuildChat[]): string {
  const profileLines = [
    `Business name: ${profile.businessName}`,
    profile.category && `Category: ${profile.category}`,
    profile.description && `Description: ${profile.description}`,
    profile.address && `Address: ${profile.address}`,
    profile.contactEmail && `Email: ${profile.contactEmail}`,
    profile.websiteLinks && `Website: ${profile.websiteLinks.replace(/\n/g, ", ")}`,
  ].filter(Boolean)

  const chatBlocks = chats.map((chat, i) => {
    const lines = chat.messages.map((m) => `${m.fromBusiness ? "BUSINESS" : "CUSTOMER"}: ${m.text.replace(/\s+/g, " ")}`)
    return `## Chat ${i + 1}\n${lines.join("\n")}`
  })

  return `# WhatsApp profile\n${profileLines.join("\n")}\n\n# Recent chats (${chats.length})\n\n${chatBlocks.join("\n\n")}`
}

const PLACEHOLDER = /^(\[\s*\]|\{\s*\}|-+|n\/?a|none|null|unknown|not (stated|mentioned|provided)\.?)$/i

export function parseAutoBuildDraft(raw: string | null): AutoBuildDraft | null {
  if (!raw) return null
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }

  // The model sometimes fills a field it has nothing for with "[]" or "N/A"
  // instead of leaving it out, which would reach customers as a real answer.
  const text = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : ""
    return PLACEHOLDER.test(s) ? "" : s
  }
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []

  const instructions = text(parsed.instructions)
  if (!instructions) return null
  return {
    description: text(parsed.description),
    instructions,
    products: list(parsed.products)
      .map((p) => ({ name: text(p.name), price: text(p.price), notes: text(p.notes) }))
      .filter((p) => p.name),
    faqs: list(parsed.faqs)
      .map((f) => ({ question: text(f.question), answer: text(f.answer) }))
      .filter((f) => f.question && f.answer),
  }
}

const AMOUNT = /(?:₦|\bNGN\s?|\bN(?=\d))\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?\b|\b\d[\d,]*(?:\.\d+)?\s?[kK]\b/g
const BARE_NUMBER = /\b\d[\d,]{2,}\b/g

function toAmount(match: string): number {
  const multiplier = /k\s*$/i.test(match) ? 1_000 : /m\s*$/i.test(match) ? 1_000_000 : 1
  const digits = match.replace(/[^\d.]/g, "")
  return Math.round(Number(digits) * multiplier)
}

function amountsIn(text: string): number[] {
  return (text.match(AMOUNT) ?? []).map(toAmount)
}

// The model is told not to invent prices, but a wrong price sent to a real
// customer is the one mistake here that costs the owner money, so check in code.
// "15k" in a chat vouches for "₦15,000" in the draft.
export function removeUnseenPrices(draft: AutoBuildDraft, chats: AutoBuildChat[]): AutoBuildDraft {
  const seen = new Set<number>()
  for (const chat of chats) {
    for (const m of chat.messages) {
      // A customer's "I go pay 5k" is an offer, not the business's price.
      if (!m.fromBusiness) continue
      for (const a of amountsIn(m.text)) seen.add(a)
      for (const bare of m.text.match(BARE_NUMBER) ?? []) seen.add(toAmount(bare))
    }
  }
  const allSeen = (text: string) => amountsIn(text).every((a) => seen.has(a))

  return {
    description: draft.description.split("\n").filter(allSeen).join("\n"),
    instructions: draft.instructions.split("\n").filter(allSeen).join("\n"),
    products: draft.products.map((p) => {
      // A bare "15000" is still a price in this field, unlike in free text.
      const stated = (p.price.match(/\d[\d,.]*\s?[kKmM]?/g) ?? []).map(toAmount)
      return { ...p, price: stated.length > 0 && stated.every((a) => seen.has(a)) ? p.price : "", notes: allSeen(p.notes) ? p.notes : "" }
    }),
    faqs: draft.faqs.filter((f) => allSeen(f.answer)),
  }
}

const GROUND_RULES = `## Rules
- Reply in the language the customer writes in, and keep replies short.
- Only state products, prices and policies written in these instructions.
- If you don't know something, say you'll check with the team. Never guess a price or make up a policy.`

function profileFacts(profile: AutoBuildProfile): string {
  const facts = [
    profile.category && `- Category: ${profile.category}`,
    profile.address && `- Address: ${profile.address}`,
    profile.contactEmail && `- Email: ${profile.contactEmail}`,
    profile.websiteLinks && `- Website: ${profile.websiteLinks.replace(/\n/g, ", ")}`,
  ].filter(Boolean)
  return facts.length > 0 ? `\n\n## Business details\n${facts.join("\n")}` : ""
}

export function composeDraftGuidelines(profile: AutoBuildProfile, draft: AutoBuildDraft): string {
  const products = draft.products.length
    ? `\n\n## Products and services\n${draft.products
        .map((p) => `- ${p.name}${p.price ? `: ${p.price}` : ""}${p.notes ? ` (${p.notes})` : ""}`)
        .join("\n")}`
    : ""
  const faqs = draft.faqs.length
    ? `\n\n## Common questions\n${draft.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")}`
    : ""
  return `${draft.instructions}${profileFacts(profile)}${products}${faqs}\n\n${GROUND_RULES}`
}

// Used when there are no usable chats or the model fails: the build must always
// end with a live agent, never a stuck banner or an error.
export function composeProfileOnlyGuidelines(profile: AutoBuildProfile): string {
  const about = profile.description ? `\n\nAbout the business: ${profile.description}` : ""
  return `You are the customer service assistant for ${profile.businessName}. Be warm and helpful. Answer what you can, and take the customer's request so the team can follow up.${about}${profileFacts(profile)}\n\n${GROUND_RULES}`
}
