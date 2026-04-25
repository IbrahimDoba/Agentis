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
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
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
    conversationId?: string
    source?: "ai" | "human"
  }): Promise<{ jobId: string; status: string }> {
    const res = await fetch(`${WORKER_URL}/v1/messages/send`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
    return res.json()
  },

  async createBroadcast(payload: {
    agentId: string
    message: string
    phoneNumbers: string[]
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
