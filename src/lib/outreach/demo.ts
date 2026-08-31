import { randomBytes } from "node:crypto"
import { db } from "@/lib/db"
import { demoSlug } from "./normalize"

// The mirror demo: a real, working Dailzero agent seeded with the prospect's
// own business information, reachable at /demo/<slug>.
//
// It is the entire pitch. Rather than describing what the product would do for
// them, the email hands them a link to the thing already doing it. That also
// makes this the one component where a bug is worse than doing nothing at all,
// so a demo that cannot be seeded well is never published.

// Every demo agent hangs off one hidden account so a single userId filter
// excludes them from every dashboard, billing and analytics query.
export const DEMO_OWNER_EMAIL = process.env.OUTREACH_DEMO_OWNER_EMAIL ?? "demo-owner@dailzero.com"

// Long enough for a four-touch sequence to finish, short enough that the
// breakup email's "your demo closes on Friday" is literally true rather than
// manufactured urgency.
export const DEMO_TTL_DAYS = 21

export type DemoSeed = {
  businessName: string
  businessDescription: string
  productsServices: string
  faqs: { question: string; answer: string }[]
  operatingHours: string
  city: string | null
  website: string | null
}

export type ProvisionResult =
  | { ok: true; agentId: string; slug: string; publicKey: string; expiresAt: Date }
  | { ok: false; reason: string }

// A demo that answers "I don't have that information" to the first three
// questions is worse than no email, so refuse to publish a thin seed.
function seedIsUsable(seed: DemoSeed): string | null {
  if (seed.businessDescription.trim().length < 60) return "business description too thin"
  if (seed.productsServices.trim().length < 40) return "no products or services found"
  if (seed.faqs.length < 3) return `only ${seed.faqs.length} FAQs, need 3`
  return null
}

async function demoOwnerId(): Promise<string> {
  const owner = await db.user.findFirst({
    where: { email: DEMO_OWNER_EMAIL },
    select: { id: true },
  })
  if (!owner) {
    throw new Error(
      `demo owner ${DEMO_OWNER_EMAIL} does not exist — run scripts/seed-outreach-demo-owner.ts first`
    )
  }
  return owner.id
}

// The slug is public and shown to the prospect, so it reads as their business.
// Collisions are resolved against the unique index rather than by salting every
// slug, which would make the URL look machine-generated to the one person we
// most need to trust it.
async function uniqueSlug(businessName: string): Promise<string> {
  const base = demoSlug(businessName)
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : demoSlug(businessName, String(attempt + 1))
    const taken = await db.outreachProspect.findUnique({
      where: { demoSlug: candidate },
      select: { id: true },
    })
    if (!taken) return candidate
  }
  return demoSlug(businessName, randomBytes(3).toString("hex"))
}

export async function provisionDemo(prospectId: string, seed: DemoSeed): Promise<ProvisionResult> {
  const thin = seedIsUsable(seed)
  if (thin) return { ok: false, reason: thin }

  const prospect = await db.outreachProspect.findUnique({
    where: { id: prospectId },
    select: { id: true, demoAgentId: true, demoSlug: true },
  })
  if (!prospect) return { ok: false, reason: "prospect not found" }
  if (prospect.demoAgentId) return { ok: false, reason: "demo already provisioned" }

  const userId = await demoOwnerId()
  const slug = await uniqueSlug(seed.businessName)
  const expiresAt = new Date(Date.now() + DEMO_TTL_DAYS * 24 * 60 * 60 * 1000)

  const agent = await db.agent.create({
    data: {
      userId,
      businessName: seed.businessName,
      businessDescription: seed.businessDescription,
      productsServices: seed.productsServices,
      faqs: seed.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n"),
      operatingHours: seed.operatingHours,
      websiteLinks: seed.website,
      address: seed.city,
      agentRuntime: "orchestrator",
      // A demo agent must never be able to reach WhatsApp. There is no session
      // to attach and no consent to message anyone; web chat only.
      transportType: "embed",
      messagingEnabled: false,
      aiRepliesEnabled: true,
      status: "ACTIVE",
      responseGuidelines: [
        `You are the AI assistant for ${seed.businessName}. Answer as their business would.`,
        "Only use the business information you were given. If you do not know something, say so plainly and offer to take the customer's details.",
        "Keep replies short, warm and direct. Nigerian English. No emoji.",
      ].join("\n"),
    },
    select: { id: true },
  })

  const publicKey = `pk_demo_${randomBytes(16).toString("hex")}`
  await db.embedSite.create({
    data: {
      agentId: agent.id,
      publicKey,
      allowedOrigins: ["https://www.dailzero.com", "https://dailzero.com"],
      isActive: true,
    },
  })

  await db.outreachProspect.update({
    where: { id: prospectId },
    data: { demoAgentId: agent.id, demoSlug: slug, demoExpiresAt: expiresAt },
  })

  return { ok: true, agentId: agent.id, slug, publicKey, expiresAt }
}

/**
 * Deactivates expired demos. Flips EmbedSite.isActive rather than deleting, so
 * a prospect who clicks a stale link gets a real "this demo has closed" page
 * instead of a 404, and the conversation history stays readable.
 */
export async function expireStaleDemos(now = new Date()): Promise<number> {
  const stale = await db.outreachProspect.findMany({
    where: { demoAgentId: { not: null }, demoExpiresAt: { lt: now } },
    select: { demoAgentId: true },
  })
  const agentIds = stale.map((p) => p.demoAgentId).filter((id): id is string => id !== null)
  if (agentIds.length === 0) return 0

  await db.embedSite.updateMany({
    where: { agentId: { in: agentIds }, isActive: true },
    data: { isActive: false },
  })
  return agentIds.length
}
