import { db } from "@/lib/db"
import type { AgentPersona, HistoryTurn } from "./reply"

// Persistence for the Meta test harness. Everything lives in the isolated
// MetaTestMessage table so the demo never touches Conversation/Message.

export interface StoredMessage {
  id: string
  waId: string
  direction: "inbound" | "outbound"
  text: string
  waMessageId: string | null
  createdAt: string
}

const toDto = (m: {
  id: string
  waId: string
  direction: string
  text: string
  waMessageId: string | null
  createdAt: Date
}): StoredMessage => ({
  id: m.id,
  waId: m.waId,
  direction: m.direction as "inbound" | "outbound",
  text: m.text,
  waMessageId: m.waMessageId,
  createdAt: m.createdAt.toISOString(),
})

export async function appendMessage(input: {
  waId: string
  direction: "inbound" | "outbound"
  text: string
  waMessageId?: string | null
  raw?: unknown
}): Promise<StoredMessage> {
  const row = await db.metaTestMessage.create({
    data: {
      waId: input.waId,
      direction: input.direction,
      text: input.text,
      waMessageId: input.waMessageId ?? null,
      raw: (input.raw as object) ?? undefined,
    },
  })
  return toDto(row)
}

// Meta retries webhooks and can redeliver the same message id after a
// reconnect; skip anything we've already recorded so the AI can't double-reply.
export async function alreadySeen(waMessageId: string): Promise<boolean> {
  const existing = await db.metaTestMessage.findFirst({
    where: { waMessageId },
    select: { id: true },
  })
  return !!existing
}

// Recent turns for one contact, oldest→newest, for reply context.
export async function getHistory(waId: string, limit = 20): Promise<HistoryTurn[]> {
  const rows = await db.metaTestMessage.findMany({
    where: { waId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { direction: true, text: true },
  })
  return rows
    .reverse()
    .map((r) => ({ direction: r.direction as "inbound" | "outbound", text: r.text }))
}

// Latest messages across the harness (the demo has a single recipient), newest
// first — the UI reverses for display. `sinceIso` enables cheap incremental polls.
export async function getRecent(limit = 100, sinceIso?: string): Promise<StoredMessage[]> {
  const rows = await db.metaTestMessage.findMany({
    where: sinceIso ? { createdAt: { gt: new Date(sinceIso) } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return rows.map(toDto)
}

export interface TestPersona extends AgentPersona {
  agentId: string
}

// Which agent's persona the assistant answers as. Pin one with META_TEST_AGENT_ID;
// otherwise fall back to the oldest agent so the harness works out of the box.
// Returns null when the account has no agents yet.
export async function resolveTestPersona(): Promise<TestPersona | null> {
  const pinned = process.env.META_TEST_AGENT_ID
  const agent = await db.agent.findFirst({
    where: pinned ? { id: pinned } : undefined,
    orderBy: pinned ? undefined : { createdAt: "asc" },
    select: {
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
    },
  })
  if (!agent) return null
  return { agentId: agent.id, ...agent }
}
