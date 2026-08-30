import { baileysClient } from "@/lib/baileys-client"
import { normalizePhone } from "@/lib/phone"

// Owner WhatsApp alerts for new leads / handoffs / appointment reminders. Sent FROM the relevant agent's
// own Baileys session TO the owner's personal number. `source: "human"` and no
// conversationId so the worker's outbound queue skips the AI-abort check, the
// warmup rate-limit caps, and AI billing (worker/src/queue/outbound-queue.ts).
// Mirrors the email data shapes in src/lib/email.ts.

function who(name?: string | null, number?: string | null): string {
  return name?.trim() || number?.trim() || "A customer"
}

export async function sendLeadWhatsapp(opts: {
  agentId: string
  toNumber: string
  agentName: string
  customerName?: string | null
  customerNumber?: string | null
  summary?: string | null
}): Promise<void> {
  const lines = [
    `🎯 *New qualified lead* — ${opts.agentName}`,
    "",
    `${who(opts.customerName, opts.customerNumber)} looks ready to buy.`,
  ]
  if (opts.summary?.trim()) lines.push("", opts.summary.trim())
  if (opts.customerNumber?.trim()) lines.push("", `📱 ${opts.customerNumber.trim()}`)
  await baileysClient.sendMessage({ agentId: opts.agentId, to: normalizePhone(opts.toNumber), text: lines.join("\n"), source: "human" })
}

export async function sendAppointmentReminderWhatsapp(opts: {
  agentId: string
  toNumber: string
  agentName: string
  title: string
  whenLabel: string
  leadLabel: string
  customerName?: string | null
  customerNumber?: string | null
  notes?: string | null
}): Promise<void> {
  const lines = [
    `📅 *Appointment reminder* — ${opts.agentName}`,
    "",
    `*${opts.title}* — ${opts.leadLabel} (${opts.whenLabel}).`,
  ]
  if (opts.customerName?.trim() || opts.customerNumber?.trim()) {
    lines.push("", `👤 ${who(opts.customerName, opts.customerNumber)}`)
  }
  if (opts.customerNumber?.trim()) lines.push(`📱 ${opts.customerNumber.trim()}`)
  if (opts.notes?.trim()) lines.push("", `📝 ${opts.notes.trim()}`)
  // Time-triggered, so mark it a scheduled reminder — the worker then won't drop
  // it as a live reply an operator may have already answered.
  await baileysClient.sendMessage({
    agentId: opts.agentId,
    to: normalizePhone(opts.toNumber),
    text: lines.join("\n"),
    source: "human",
    scheduledReminder: true,
  })
}

export async function sendHandoffWhatsapp(opts: {
  agentId: string
  toNumber: string
  agentName: string
  customerName?: string | null
  customerNumber?: string | null
  reason: string
  urgency: "normal" | "high"
}): Promise<void> {
  const head = opts.urgency === "high" ? "🚨 *Urgent — chat needs a human*" : "🙋 *Handoff — chat needs a human*"
  const lines = [
    `${head} — ${opts.agentName}`,
    "",
    `${who(opts.customerName, opts.customerNumber)} needs a person to step in.`,
    "",
    `📝 ${opts.reason}`,
  ]
  if (opts.customerNumber?.trim()) lines.push("", `📱 ${opts.customerNumber.trim()}`)
  await baileysClient.sendMessage({ agentId: opts.agentId, to: normalizePhone(opts.toNumber), text: lines.join("\n"), source: "human" })
}
