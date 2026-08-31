import Anthropic from "@anthropic-ai/sdk"
import { validateCopy, type GeneratedCopy, type ValidationContext } from "./validate"

// One Claude call per prospect. This text is the product's entire first
// impression and there is no second chance at it, so this is the one place in
// the pipeline where we spend on the best model rather than the cheapest: at
// pilot volume the whole run costs a few dollars.

const MODEL = "claude-opus-5"

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export type ProspectPacket = {
  businessName: string
  vertical: string | null
  city: string | null
  website: string | null
  instagram: string | null
  contactName: string | null
  // Where we found the address, spliced verbatim into the disclosure sentence.
  sourceLabel: string
  // Page text we actually fetched, keyed by URL. The model may only make claims
  // traceable to one of these, and validate.ts enforces it.
  fetchedPages: { url: string; text: string }[]
  demoUrl: string
}

export type PersonalizeResult =
  | { ok: true; copy: GeneratedCopy; reason: string; model: string }
  | { ok: false; failures: string[]; copy: GeneratedCopy | null }

// Frozen prefix — brand rules, bans and gold examples. Kept byte-stable and
// cached; only the per-prospect packet varies, so cache hit rate is ~100% after
// the first call of a run.
const SYSTEM_INSTRUCTION = `You write cold outreach emails for Dailzero (also written D-Zero AI), a Nigerian SaaS at dailzero.com.

WHAT DAILZERO IS
A business connects its existing WhatsApp number by scanning a QR code. An AI agent then answers customer messages 24/7 in under two seconds: answering questions, quoting prices from a knowledge base, capturing leads, booking appointments, and handing off to a human when it should. No Meta approval, no new number, setup takes minutes. Plans are 15,000 naira, 35,000 naira and 70,000 naira per month, with a 7-day free trial that needs no card.

WHO YOU ARE WRITING TO
Owner-operators of small Nigerian businesses. They run their business inside WhatsApp DMs. They are busy, they are pitched constantly, and they can smell a mass mailout instantly.

THE OFFER IN THE EMAIL
We have ALREADY BUILT them a working AI agent using only their own public business information. The single call to action is a link to talk to it. Nothing else is being asked for. Never ask for a call, a meeting, or fifteen minutes.

HOW TO OPEN
Open with one concrete thing you actually observed in the supplied page text. A review complaining nobody replied. A WhatsApp number published with no stated hours. An Instagram bio saying "DM to order". A price list. State it plainly and without judgement.

Never open with flattery. Never say you were impressed, that you loved their work, or that you came across them. Never claim anything the supplied pages do not support. If the pages are too thin to say anything specific, set qualified to false and stop.

VOICE
Nigerian English. Direct, warm, unhurried. Sentences a person would actually say out loud. Contractions are fine. No emoji. No exclamation marks. No corporate vocabulary. No em dashes or en dashes, ever; use a comma, a full stop, or a new sentence.

HARD CONSTRAINTS
- Body: 45 to 110 words. Shorter reads as more genuine.
- Subject: lowercase, 2 to 5 words, under 45 characters. It should read like an internal note, not a campaign. Never fake a reply with "Re:".
- Exactly one URL in the body: the demo link, verbatim as supplied.
- Every factual claim about their business must trace to one of the supplied pages, and you must cite that page's URL in observedSignals.
- sourceDisclosure must be a short sentence containing the supplied source label word for word.
- Do not mention pricing in the first email. The demo is the pitch.
- Do not include a sign-off or signature; that is appended separately.
- Do not include an unsubscribe line; that is appended separately.

GOOD (real estate, agency in Lekki):
subject: your whatsapp line
body: Two people mentioned on your Google listing that they never got a reply. Not a dig, that is just what happens when enquiries land at 9pm.

I built you something. It is an AI agent loaded with your listings that answers WhatsApp in under two seconds and tells you when someone is actually serious. Have a conversation with it here and see how it handles your own questions: <DEMO_URL>

BAD (rejected, do not imitate):
subject: Transform Your Customer Experience with AI!
body: I hope this email finds you well. I came across your website and was truly impressed by your beautiful properties. In today's fast-paced world, businesses need to leverage AI to take things to the next level. Would you be open to a quick 15 minute call this week?

Return only the JSON object described by the schema.`

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["qualified", "disqualifyReason", "subject", "body", "sourceDisclosure", "observedSignals", "reason"],
  properties: {
    qualified: {
      type: "boolean",
      description: "False when the supplied pages are too thin to write anything specific and true.",
    },
    disqualifyReason: { type: ["string", "null"] },
    subject: { type: "string" },
    body: { type: "string" },
    sourceDisclosure: { type: "string" },
    observedSignals: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "sourceUrl"],
        properties: {
          claim: { type: "string" },
          sourceUrl: { type: "string" },
        },
      },
    },
    reason: { type: "string", description: "One sentence for the human reviewer on why this angle." },
  },
} as const

export async function personalize(packet: ProspectPacket): Promise<PersonalizeResult> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
    // The prefix above is ~1.5k stable tokens reused across the whole run.
    cache_control: { type: "ephemeral" },
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: "user", content: JSON.stringify(buildUserPayload(packet)) }],
  })

  const text = response.content.find((b) => b.type === "text")
  if (!text || text.type !== "text") {
    return { ok: false, failures: ["model returned no text block"], copy: null }
  }

  let parsed: {
    qualified: boolean
    disqualifyReason: string | null
    subject: string
    body: string
    sourceDisclosure: string
    observedSignals: { claim: string; sourceUrl: string }[]
    reason: string
  }
  try {
    parsed = JSON.parse(text.text)
  } catch {
    return { ok: false, failures: ["model returned unparseable JSON"], copy: null }
  }

  if (!parsed.qualified) {
    return {
      ok: false,
      failures: [`model declined: ${parsed.disqualifyReason ?? "insufficient research"}`],
      copy: null,
    }
  }

  const copy: GeneratedCopy = {
    subject: parsed.subject,
    body: parsed.body,
    sourceDisclosure: parsed.sourceDisclosure,
    observedSignals: parsed.observedSignals,
  }

  const ctx: ValidationContext = {
    fetchedHosts: packet.fetchedPages.map((p) => hostOf(p.url)).filter((h): h is string => h !== null),
    sourceLabel: packet.sourceLabel,
    demoUrl: packet.demoUrl,
  }
  const verdict = validateCopy(copy, ctx)
  if (!verdict.ok) return { ok: false, failures: verdict.failures, copy }

  return { ok: true, copy, reason: parsed.reason, model: MODEL }
}

// Page text is truncated per page rather than in aggregate so a long homepage
// cannot crowd out a short contact page, which is usually where the signal is.
const MAX_CHARS_PER_PAGE = 4000

function buildUserPayload(packet: ProspectPacket) {
  return {
    business: {
      name: packet.businessName,
      vertical: packet.vertical,
      city: packet.city,
      website: packet.website,
      instagram: packet.instagram,
      contactName: packet.contactName,
    },
    sourceLabel: packet.sourceLabel,
    demoUrl: packet.demoUrl,
    pages: packet.fetchedPages.map((p) => ({
      url: p.url,
      text: p.text.slice(0, MAX_CHARS_PER_PAGE),
    })),
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
