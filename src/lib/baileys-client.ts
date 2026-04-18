/**
 * Server-side typed client for the dailzero-wa-worker API.
 * Only call from Next.js server components, route handlers, or server actions.
 */

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:4000"
const WORKER_API_KEY = process.env.WORKER_API_KEY ?? ""

function headers() {
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

export const baileysClient = {
  async createSession(agentId: string): Promise<{ agentId: string; status: string }> {
    const res = await fetch(`${WORKER_URL}/v1/sessions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ agentId }),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
    return res.json()
  },

  async getSession(agentId: string): Promise<WorkerSessionStatus | null> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}`, {
      headers: headers(),
      cache: "no-store",
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
    return res.json()
  },

  async deleteSession(agentId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}`, {
      method: "DELETE",
      headers: headers(),
    })
    if (!res.ok && res.status !== 404) throw new Error(`Worker error: ${res.status}`)
  },

  async restartSession(agentId: string): Promise<void> {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${agentId}/restart`, {
      method: "POST",
      headers: headers(),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
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
      headers: headers(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Worker error: ${res.status}`)
    return res.json()
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
