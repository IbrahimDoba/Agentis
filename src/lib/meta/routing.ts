import { db } from "@/lib/db"
import { decryptToken } from "./crypto"

// Resolves an inbound webhook to the number it arrived on, and from there to
// the credentials to reply with and the agent that should answer.
//
// Every number is a business's own, onboarded through Embedded Signup and
// carrying its own token. There is deliberately no env-configured fallback: a
// hardcoded number in env was a single-tenant assumption from the App Review
// harness, and an unknown phone_number_id must never be answered with someone
// else's credentials.

export interface NumberContext {
  phoneNumberId: string
  accessToken: string
  agentId: string
  userId: string
}

export async function resolveNumberContext(
  phoneNumberId: string
): Promise<NumberContext | null> {
  const connection = await db.metaTestConnection.findUnique({
    where: { phoneNumberId },
    select: { phoneNumberId: true, accessToken: true, userId: true, agentId: true },
  })

  // A connection with no agent can't answer — the number is connected but
  // nobody has said which agent handles it.
  if (!connection?.agentId || !connection.userId) return null

  return {
    phoneNumberId: connection.phoneNumberId,
    accessToken: decryptToken(connection.accessToken),
    agentId: connection.agentId,
    userId: connection.userId,
  }
}

export interface WabaContext {
  wabaId: string
  accessToken: string
  phoneNumberId: string
  displayPhoneNumber: string | null
}

// The WABA an operator manages templates on. Scoped to connections they own, so
// one customer can never read or write another's templates.
export async function resolveWabaContext(
  userId: string,
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
  if (!connection) return null

  return {
    wabaId: connection.wabaId,
    accessToken: decryptToken(connection.accessToken),
    phoneNumberId: connection.phoneNumberId,
    displayPhoneNumber: connection.displayPhoneNumber,
  }
}
