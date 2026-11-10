/**
 * Server-side typed client for the dailzero-wa-worker API.
 * Only call from Next.js server components, route handlers, or server actions.
 */

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:4000"
const WORKER_API_KEY = process.env.WORKER_API_KEY ?? ""

function authHeaders() {
  return {
    Authorization: `Bearer ${WORKER_API_KEY}`,
  }
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${WORKER_API_KEY}`,
  }
}

export interface WorkerSessionStatus {
  id: string
  agentId: string
  phoneNumber: string | null
  status: "DISCONNECTED" | "QR_PENDING" | "CONNECTING" | "CONNECTED" | "LOGGED_OUT" | "BANNED"
  warmupTier: number
  warmupStartedAt: string | null
  dailyMessageCount: number
  businessHoursStart: string
  businessHoursEnd: string
  timezone: string
  lastConnectedAt: string | null
  lastDisconnectReason: string | null
  createdAt: string
}

export interface WorkerBroadcastCampaign {
  id: string
  agentId: string
  message: string
  status: "pending" | "running" | "paused" | "completed" | "cancelled" | "failed"
  totalCount: number
  sentCount: number
  failedCount: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface WorkerContactSaveRun {
  id: string
  status: "running" | "paused" | "completed" | "cancelled"
  pauseReason: "no_credits" | "disconnected" | "owner" | "failing" | null
  waitingUntil: string | null
  nameTag: string | null
  totalCount: number
  savedCount: number
  failedCount: number
  creditsUsed: number
  createdAt: string
  completedAt: string | null
}

export interface WorkerContactsSummary {
  addressBook: { total: number; byDailzero: number }
  unsaved: number
  run: WorkerContactSaveRun | null
  syncing: boolean
  dailyCap: number
  creditsPerContact: number
  // null for paying accounts. Optional because an older worker doesn't send it.
  freeLimit?: { limit: number; used: number; left: number } | null
}

export type WorkerReply<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string }

async function workerReply<T>(res: Response): Promise<WorkerReply<T>> {
  const body = await res.json().catch(() => null)
  if (res.ok) return { ok: true, status: res.status, data: body as T }
  return { ok: false, status: res.status, error: body?.error ?? `Worker error: ${res.status}` }
}

export const baileysClient = {
  async createSession(agentId: string, initialTier?: number): Promise<{ agentId: string; status: string }> {
    const res = await fetch(`${WORKER_URL}/v1/sessions`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId, initialTier }),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
    return res.json()
  },

  async updateTier(agentId: string, tier: number): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}/tier`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ tier }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Worker error: ${res.status} ${body}`)
    }
  },

  async getSession(agentId: string): Promise<WorkerSessionStatus | null> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}`, {
      headers: authHeaders(),
      cache: "no-store",
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
    return res.json()
  },

  async disconnectSession(agentId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}/disconnect`, {
      method: "POST",
      headers: authHeaders(),
    })
    if (!res.ok && res.status !== 404) throw new Error(`Worker error: ${res.status}`)
  },

  async deleteSession(agentId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}`, {
      method: "DELETE",
      headers: authHeaders(),
    })
    if (!res.ok && res.status !== 404) throw new Error(`Worker error: ${res.status}`)
  },

  async extractChatsForAgent(agentId: string): Promise<{ candidateCount: number; totalMessages: number; status: string }> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}/extract-chats`, {
      method: "POST",
      headers: authHeaders(),
    })
    if (!res.ok) {
      // Try to surface the worker's actual error message — much more
      // useful than just the HTTP status.
      let detail = ""
      try {
        const body = (await res.json()) as { error?: string }
        detail = body?.error ? `: ${body.error}` : ""
      } catch { /* not JSON */ }
      throw new Error(`Worker error ${res.status}${detail}`)
    }
    return res.json()
  },

  async restartSession(agentId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}/restart`, {
      method: "POST",
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
  },

  async resolvePhones(agentId: string, ids: string[]): Promise<{ resolved: Array<{ id: string; phoneNumber: string }> }> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}/resolve-phones`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      throw new Error(`Worker error: ${res.status}${errorText ? `: ${errorText}` : ""}`)
    }
    return res.json()
  },

  async sendMessage(payload: {
    agentId: string
    to: string
    text: string
    // Media send. The worker fetches mediaUrl and dispatches through the
    // matching paced sender; documents also need a filename and mimetype,
    // because WhatsApp shows the filename to the recipient.
    mediaUrl?: string
    type?: "text" | "image" | "video" | "document"
    mediaMimeType?: string
    mediaFileName?: string
    conversationId?: string
    source?: "ai" | "human" | "api"
    // When the caller has already persisted the outbound Message row, pass its
    // id + token counts so the outbound queue meters on real usage and can
    // delete the row if a human takes over before it sends.
    messageId?: string
    tokensInput?: number
    tokensOutput?: number
    // Time-triggered send (appointment reminder). Tells the worker not to treat
    // it as a live reply that an operator may have already answered.
    scheduledReminder?: boolean
  }): Promise<{ jobId: string; status: string }> {
    const res = await fetch(`${WORKER_URL}/v1/messages/send`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
    return res.json()
  },

  async checkContact(agentId: string, phone: string): Promise<{ exists: boolean; jid: string | null }> {
    const res = await fetch(`${WORKER_URL}/v1/contacts/check`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId, phone }),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
    return res.json()
  },

  async createBroadcast(payload: {
    agentId: string
    message: string
    phoneNumbers: string[]
    spreadHours?: number
    // Cloud API campaigns: the transport, the number to send from, and the
    // approved template to send. Free-form text is not deliverable there.
    channel?: string
    metaPhoneNumberId?: string
    templateName?: string
    templateLanguage?: string
  }): Promise<{
    broadcast: WorkerBroadcastCampaign
    eligibleCount?: number
    trimmed?: number
    skipped?: number
    message?: string
  }> {
    const res = await fetch(`${WORKER_URL}/v1/broadcasts`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(errorText || `Worker error: ${res.status}`)
    }
    return res.json()
  },

  async listBroadcasts(agentId: string): Promise<{ broadcasts: WorkerBroadcastCampaign[] }> {
    const res = await fetch(`${WORKER_URL}/v1/broadcasts?agentId=${agentId}`, {
      headers: authHeaders(),
      cache: "no-store",
    })
    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      throw new Error(`Worker error: ${res.status}${errorText ? `: ${errorText}` : ""}`)
    }
    return res.json()
  },

  async cancelBroadcast(broadcastId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/broadcasts/${broadcastId}/cancel`, {
      method: "POST",
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
  },

  async resumeBroadcast(broadcastId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/broadcasts/${broadcastId}/resume`, {
      method: "POST",
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
  },

  async startFollowUpCampaign(campaignId: string, agentId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/followup-campaigns/${campaignId}/start`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId }),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
  },

  async cancelFollowUpCampaign(campaignId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/followup-campaigns/${campaignId}/cancel`, {
      method: "POST",
      headers: authHeaders(),
    })
    if (!res.ok && res.status !== 404) throw new Error(`Worker error: ${res.status}`)
  },

  async resumeFollowUpCampaign(campaignId: string, agentId: string): Promise<{ requeued: number }> {
    const res = await fetch(`${WORKER_URL}/v1/followup-campaigns/${campaignId}/resume`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Worker error ${res.status}: ${body || "resume failed"}`)
    }
    return res.json() as Promise<{ requeued: number }>
  },

  // Status → Contacts. These return the worker's status and body as-is: its
  // 402/409s ("not enough credits", "run already in progress") are messages the
  // owner should see, not errors to flatten into a 502.
  async contactsSummary(agentId: string): Promise<WorkerReply<WorkerContactsSummary>> {
    return workerReply(await fetch(`${WORKER_URL}/v1/contacts/summary?agentId=${encodeURIComponent(agentId)}`, {
      headers: authHeaders(),
      cache: "no-store",
    }))
  },

  async startContactSaveRun(agentId: string): Promise<WorkerReply<{ run: WorkerContactSaveRun }>> {
    return workerReply(await fetch(`${WORKER_URL}/v1/contacts/runs`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId }),
    }))
  },

  async contactSaveRunAction(agentId: string, runId: string, action: "pause" | "resume" | "cancel"): Promise<WorkerReply<{ run: WorkerContactSaveRun }>> {
    return workerReply(await fetch(`${WORKER_URL}/v1/contacts/runs/${encodeURIComponent(runId)}/${action}`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId }),
    }))
  },

  async invalidateContactSettings(agentId: string): Promise<void> {
    await fetch(`${WORKER_URL}/v1/contacts/settings/invalidate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId }),
    })
  },

  async scheduleStatusPost(agentId: string, postId: string): Promise<WorkerReply<{ ok: true }>> {
    return workerReply(await fetch(`${WORKER_URL}/v1/status/posts/${encodeURIComponent(postId)}/schedule`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId }),
    }))
  },

  async deleteStatusPost(agentId: string, postId: string): Promise<WorkerReply<{ ok: true }>> {
    return workerReply(await fetch(`${WORKER_URL}/v1/status/posts/${encodeURIComponent(postId)}/delete`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentId }),
    }))
  },

  async getHealth(): Promise<{ status: string; redis: string; uptime: number } | null> {
    try {
      const res = await fetch(`${WORKER_URL}/v1/health`, { cache: "no-store" })
      if (!res.ok) return null
      return res.json()
    } catch {
      return null
    }
  },

  /** Returns the full SSE URL for QR streaming — used to proxy from Next.js */
  qrStreamUrl(agentId: string): string {
    return `${WORKER_URL}/v1/sessions/${agentId}/qr`
  },
}
