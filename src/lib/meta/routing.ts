import { db } from "@/lib/db"
import { decryptToken } from "./crypto"
import type { AgentPersona } from "./reply"

// Resolves an inbound webhook to the number it arrived on, and from there to
// the credentials to reply with and the agent that should answer.
//
// Two kinds of number exist:
//   1. Connected numbers — onboarded through Embedded Signup. Each has a
//      MetaTestConnection row carrying that business's own token and the agent
//      chosen when they connected.
//   2. The env-configured number — our original Cloud API number, which has no
//      connection row. It keeps working off META_TEST_* so the existing
//      dashboard and App Review demo are unaffected.

export interface NumberContext {
  phoneNumberId: string
  accessToken: string
  persona: AgentPersona & { agentId: string }
  /** Null for the env-configured number, which nobody owns. */
  userId: string | null
}

const PERSONA_FIELDS = {
  id: true,
  businessName: true,
  businessDescription: true,
  productsServices: true,
  faqs: true,
  operatingHours: true,
  contactEmail: true,
  contactPhone: true,
  websiteLinks: true,
  responseGuidelines: true,
} as const

type AgentRow = {
  id: string
  businessName: string
  businessDescription: string
  productsServices: string
  faqs: string
  operatingHours: string
  contactEmail: string | null
  contactPhone: string | null
  websiteLinks: string | null
  responseGuidelines: string | null
}

function toPersona(a: AgentRow): AgentPersona & { agentId: string } {
  return { ...a, agentId: a.id }
}

// The env number's agent: pinned by META_TEST_AGENT_ID, else the oldest agent.
async function envPersona(): Promise<(AgentPersona & { agentId: string }) | null> {
  const pinned = process.env.META_TEST_AGENT_ID
  const agent = await db.agent.findFirst({
    where: pinned ? { id: pinned } : undefined,
    orderBy: pinned ? undefined : { createdAt: "asc" },
    select: PERSONA_FIELDS,
  })
  return agent ? toPersona(agent) : null
}

export async function resolveNumberContext(
  phoneNumberId: string
): Promise<NumberContext | null> {
  const connection = await db.metaTestConnection.findUnique({
    where: { phoneNumberId },
    select: {
      phoneNumberId: true,
      accessToken: true,
      userId: true,
      agent: { select: PERSONA_FIELDS },
    },
  })

  if (connection) {
    // A connection with no agent can't answer — the owner connected the number
    // but hasn't chosen which agent handles it.
    if (!connection.agent) return null
    return {
      phoneNumberId: connection.phoneNumberId,
      accessToken: decryptToken(connection.accessToken),
      persona: toPersona(connection.agent),
      userId: connection.userId,
    }
  }

  // Fall back to the env-configured number, but only for that number — an
  // unknown phone_number_id must not be answered with our own credentials.
  const envPhoneNumberId = process.env.META_TEST_PHONE_NUMBER_ID
  const envToken = process.env.META_TEST_ACCESS_TOKEN
  if (!envPhoneNumberId || !envToken || phoneNumberId !== envPhoneNumberId) return null

  const persona = await envPersona()
  return persona
    ? { phoneNumberId: envPhoneNumberId, accessToken: envToken, persona, userId: null }
    : null
}

export interface WabaContext {
  wabaId: string
  accessToken: string
  phoneNumberId: string
  displayPhoneNumber: string | null
}

// The WABA an operator manages templates on. Scoped to connections they own, so
// one customer can never read or write another's templates. Falls back to the
// env-configured WABA for platform admins, who have no connection row of their
// own but do own the original Cloud API number.
export async function resolveWabaContext(
  userId: string,
  role: string,
  phoneNumberId?: string | null
): Promise<WabaContext | null> {
  const connection = await db.metaTestConnection.findFirst({
    where: { userId, ...(phoneNumberId ? { phoneNumberId } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      wabaId: true,
      accessToken: true,
      phoneNumberId: true,
      displayPhoneNumber: true,
    },
  })

  if (connection) {
    return {
      wabaId: connection.wabaId,
      accessToken: decryptToken(connection.accessToken),
      phoneNumberId: connection.phoneNumberId,
      displayPhoneNumber: connection.displayPhoneNumber,
    }
  }

  if (role !== "ADMIN") return null
  const envWaba = process.env.META_TEST_WABA_ID
  const envToken = process.env.META_TEST_ACCESS_TOKEN
  const envPhone = process.env.META_TEST_PHONE_NUMBER_ID
  if (!envWaba || !envToken || !envPhone) return null
  return {
    wabaId: envWaba,
    accessToken: envToken,
    phoneNumberId: envPhone,
    displayPhoneNumber: process.env.META_TEST_DISPLAY_NUMBER ?? null,
  }
}
