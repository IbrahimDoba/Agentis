"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useElevenLabsAgents } from "@/hooks/useElevenLabsAgents"
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
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
