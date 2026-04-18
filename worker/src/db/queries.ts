import { supabase } from "./supabase.js"

export type BaileysStatus =
  | "DISCONNECTED"
  | "QR_PENDING"
  | "CONNECTING"
  | "CONNECTED"
  | "LOGGED_OUT"
  | "BANNED"

export interface BaileysSession {
  id: string
  agentId: string
  phoneNumber: string | null
  status: BaileysStatus
  warmupTier: number
  warmupStartedAt: string | null
  dailyMessageCount: number
  dailyCountResetAt: string
  lastConnectedAt: string | null
  lastDisconnectReason: string | null
  linkedDeviceName: string
  authBackupPath: string | null
  businessHoursStart: string
  businessHoursEnd: string
  timezone: string
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: string
  elevenlabsAgentId: string | null
  transportType: string
  businessHoursStart?: string
  businessHoursEnd?: string
  timezone?: string
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessionByAgentId(agentId: string): Promise<BaileysSession | null> {
  const { data, error } = await supabase
    .from("BaileysSession")
    .select("*")
    .eq("agentId", agentId)
    .single()
  if (error?.code === "PGRST116") return null
  if (error) throw error
  return data
}

export async function upsertSession(
  agentId: string,
  fields: Partial<Omit<BaileysSession, "id" | "agentId" | "createdAt">>
): Promise<BaileysSession> {
  const { data, error } = await supabase
    .from("BaileysSession")
    .upsert(
      { agentId, ...fields, updatedAt: new Date().toISOString() },
      { onConflict: "agentId" }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSessionStatus(
  agentId: string,
  status: BaileysStatus,
  extra?: Partial<BaileysSession>
): Promise<void> {
  const { error } = await supabase
    .from("BaileysSession")
    .update({ status, ...extra, updatedAt: new Date().toISOString() })
    .eq("agentId", agentId)
  if (error) throw error
}

export async function deleteSession(agentId: string): Promise<void> {
  const { error } = await supabase.from("BaileysSession").delete().eq("agentId", agentId)
  if (error) throw error
}

// ── Outbound log ──────────────────────────────────────────────────────────────

export async function logOutbound(entry: {
  sessionId: string
  conversationId?: string
  toJid: string
  messagePreview?: string
  delayAppliedMs?: number
  status: "QUEUED" | "SENT" | "FAILED" | "RATE_LIMITED"
  sentAt?: string
}): Promise<void> {
  const { error } = await supabase.from("BaileysOutboundLog").insert(entry)
  if (error) throw error
}

export async function markOutboundSent(id: string, delayAppliedMs: number): Promise<void> {
  const { error } = await supabase
    .from("BaileysOutboundLog")
    .update({ status: "SENT", sentAt: new Date().toISOString(), delayAppliedMs })
    .eq("id", id)
  if (error) throw error
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export async function getAgent(agentId: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from("Agent")
    .select("id, elevenlabsAgentId, transportType")
    .eq("id", agentId)
    .single()
  if (error?.code === "PGRST116") return null
  if (error) throw error
  return data
}

// ── Customer / conversation lookup ───────────────────────────────────────────

export async function getOrCreateCustomer(phoneNumber: string, agentId: string) {
  const { data: existing } = await supabase
    .from("Customer")
    .select("id, phoneNumber, name, conversationSummary")
    .eq("phoneNumber", phoneNumber)
    .eq("agentId", agentId)
    .single()

  if (existing) {
    await supabase
      .from("Customer")
      .update({ lastSeen: new Date().toISOString() })
      .eq("id", existing.id)
    return existing
  }

  const { data: created, error } = await supabase
    .from("Customer")
    .insert({ phoneNumber, agentId })
    .select("id, phoneNumber, name, conversationSummary")
    .single()
  if (error) throw error
  return created
}

export async function getRecentConversationLogs(phoneNumber: string, agentId: string, limit = 10) {
  const { data, error } = await supabase
    .from("ConversationLog")
    .select("conversationId, summary, durationSecs, startTime, status")
    .eq("phoneNumber", phoneNumber)
    .eq("agentId", agentId)
    .order("startTime", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function upsertConversationLog(entry: {
  conversationId: string
  elevenlabsAgentId: string
  agentId: string
  phoneNumber?: string
  transcript: unknown[]
  summary?: string
  durationSecs?: number
  startTime?: string
  status?: string
  creditsUsed?: number
  rawPayload: unknown
}) {
  const { error } = await supabase
    .from("ConversationLog")
    .upsert(entry, { onConflict: "conversationId" })
  if (error) throw error
}
