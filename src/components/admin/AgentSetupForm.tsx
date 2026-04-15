"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useElevenLabsAgents } from "@/hooks/useElevenLabsAgents"
import { useWhatsAppAccounts } from "@/hooks/useWhatsAppAccounts"
import styles from "./AgentSetupForm.module.css"
import { Input } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import type { AgentPublic } from "@/types"

interface AgentSetupFormProps {
  agent: AgentPublic
}

export function AgentSetupForm({ agent }: AgentSetupFormProps) {
  const router = useRouter()
  const [form, setForm] = useState({
    elevenlabsAgentId: agent.elevenlabsAgentId ?? "",
    whatsappPhoneNumberId: (agent as any).whatsappPhoneNumberId ?? "",
    whatsappAgentLink: agent.whatsappAgentLink ?? "",
    whatsappPhoneNumber: agent.whatsappPhoneNumber ?? "",
    qrCodeUrl: agent.qrCodeUrl ?? "",
    status: agent.status,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const { data: elAgents = [], isLoading: elLoading, error: elQueryError } = useElevenLabsAgents()
  const elError = elQueryError ? (elQueryError as Error).message : ""

  const { data: waAccounts = [], isLoading: waLoading, error: waQueryError } = useWhatsAppAccounts()
  const waError = waQueryError ? (waQueryError as Error).message : ""

  // Auto-populate WhatsApp account when accounts load
  useEffect(() => {
    if (!waAccounts.length) return

    // If phone number ID is already stored, ensure phone number field is populated
    if (form.whatsappPhoneNumberId) {
      const match = waAccounts.find((a) => a.phone_number_id === form.whatsappPhoneNumberId)
      if (match && !form.whatsappPhoneNumber) {
        setForm((f) => ({ ...f, whatsappPhoneNumber: match.phone_number }))
      }
      return
    }

    // Otherwise try to find which account is assigned to this ElevenLabs agent
    if (form.elevenlabsAgentId) {
      const match = waAccounts.find((a) => a.assigned_agent_id === form.elevenlabsAgentId)
      if (match) {
        setForm((f) => ({
          ...f,
          whatsappPhoneNumberId: match.phone_number_id,
          whatsappPhoneNumber: f.whatsappPhoneNumber || match.phone_number,
        }))
      }
    }
  }, [waAccounts]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    // When selecting a WhatsApp account, auto-fill phone number if blank
    if (name === "whatsappPhoneNumberId" && value) {
      const account = waAccounts.find((a) => a.phone_number_id === value)
      setForm((f) => ({
        ...f,
        whatsappPhoneNumberId: value,
        whatsappPhoneNumber: f.whatsappPhoneNumber || (account?.phone_number ?? ""),
      }))
      return
    }
    setForm((f) => ({ ...f, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to update agent")
        return
      }

      setSuccess("Agent updated successfully!")
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>ElevenLabs Configuration</div>
        <div className={styles.fields}>
          <div className={styles.selectGroup}>
            <label className={styles.selectLabel}>ElevenLabs Agent</label>
            {elLoading ? (
              <div className={styles.selectLoading}>Loading agents…</div>
            ) : elError ? (
              <div className={styles.selectErr}>{elError}</div>
            ) : (
              <select
                name="elevenlabsAgentId"
                value={form.elevenlabsAgentId}
                onChange={handleChange}
                className={styles.statusSelect}
              >
                <option value="">— Select an agent —</option>
                {elAgents.map((a) => (
                  <option key={a.agent_id} value={a.agent_id}>
                    {a.name} ({a.agent_id})
                  </option>
                ))}
              </select>
            )}
            {form.elevenlabsAgentId && (
              <span className={styles.selectedId}>ID: {form.elevenlabsAgentId}</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>WhatsApp Configuration</div>
        <div className={styles.fields}>
          <div className={styles.selectGroup}>
            <label className={styles.selectLabel}>WhatsApp Account</label>
            {waLoading ? (
              <div className={styles.selectLoading}>Loading WhatsApp accounts…</div>
            ) : waError ? (
              <div className={styles.selectErr}>{waError}</div>
            ) : (
              <select
                name="whatsappPhoneNumberId"
                value={form.whatsappPhoneNumberId}
                onChange={handleChange}
                className={styles.statusSelect}
              >
                <option value="">— Select a WhatsApp account —</option>
                {waAccounts.map((a) => {
                  const assignedToThis = a.assigned_agent_id === form.elevenlabsAgentId
                  const assignedLabel = a.assigned_agent_id
                    ? assignedToThis
                      ? " ✓ assigned to this agent"
                      : ` (assigned to ${a.assigned_agent_id})`
                    : " (unassigned)"
                  return (
                    <option key={a.phone_number_id} value={a.phone_number_id}>
                      {a.phone_number_name} · {a.phone_number}{assignedLabel}
                    </option>
                  )
                })}
              </select>
            )}
            {form.whatsappPhoneNumberId && (
              <span className={styles.selectedId}>ID: {form.whatsappPhoneNumberId}</span>
            )}
          </div>
          <Input
            label="WhatsApp Phone Number"
            name="whatsappPhoneNumber"
            placeholder="+1 555 000 0000"
            value={form.whatsappPhoneNumber}
            onChange={handleChange}
          />
          <Input
            label="WhatsApp Agent Chat Link"
            name="whatsappAgentLink"
            placeholder="https://wa.me/15550000000"
            value={form.whatsappAgentLink}
            onChange={handleChange}
            hint="The direct link customers use to start chatting with the agent"
          />
          <Input
            label="QR Code Image URL"
            name="qrCodeUrl"
            placeholder="https://..."
            value={form.qrCodeUrl}
            onChange={handleChange}
            hint="URL of the WhatsApp QR code image for the agent"
          />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Agent Status</div>
        <div className={styles.fields}>
          <div className={styles.selectGroup}>
            <label className={styles.selectLabel}>Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className={styles.statusSelect}
            >
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="SETTING_UP">Setting Up</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" loading={loading}>
          Save Configuration
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default AgentSetupForm
