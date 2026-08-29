"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Button from "@/components/ui/Button"
import { useToast } from "@/context/ToastContext"
import { DiffView, type DiffHunkView } from "./DiffView"
import styles from "./PromptEditPanel.module.css"

interface Proposal {
  status: "ok" | "ambiguous" | "not_found" | "refused"
  reason: string | null
  ops: unknown[]
  hunks: DiffHunkView[]
  beforeHash?: string
  model?: string
  promptTokens?: number
  outputTokens?: number
  occurrences?: string[]
  sectioned?: boolean
  searchedRegions?: number
  totalRegions?: number
}

interface Props {
  agentId: string
  /** Blocks proposing while the operator has unsaved textarea edits. */
  formDirty: boolean
  /** Push the applied value back into the form's state AND its saved baseline. */
  onApplied: (value: string) => void
}

const EXAMPLES = [
  "Change the closing time on Saturdays to 7pm",
  "Be more straightforward when replying to customers",
  "Always mention that delivery is free above ₦50,000",
]

export function PromptEditPanel({ agentId, formDirty, onApplied }: Props) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [instruction, setInstruction] = useState("")
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [proposing, setProposing] = useState(false)
  const [applying, setApplying] = useState(false)

  const propose = async () => {
    if (!instruction.trim()) return
    setProposing(true)
    setProposal(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/prompt-edit/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? "Could not draft that edit.", "error")
        return
      }
      setProposal(data)
    } catch {
      showToast("Could not draft that edit.", "error")
    } finally {
      setProposing(false)
    }
  }

  const apply = async () => {
    if (!proposal || proposal.status !== "ok") return
    setApplying(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/prompt-edit/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          ops: proposal.ops,
          beforeHash: proposal.beforeHash,
          model: proposal.model,
          promptTokens: proposal.promptTokens,
          outputTokens: proposal.outputTokens,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? "Could not save that edit.", "error")
        return
      }
      onApplied(data.value)
      setProposal(null)
      setInstruction("")
      queryClient.invalidateQueries({ queryKey: ["prompt-edits", agentId] })
      showToast("Prompt updated.")
    } catch {
      showToast("Could not save that edit.", "error")
    } finally {
      setApplying(false)
    }
  }

  const failed = proposal && proposal.status !== "ok"

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Edit with AI</span>
        <span className={styles.subtitle}>
          Describe the change in your own words. You&apos;ll see exactly what changes before anything is saved.
        </span>
      </div>

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !proposing && !formDirty) propose()
          }}
          placeholder="e.g. change the closing time on Saturdays to 7pm"
          disabled={formDirty || proposing}
          maxLength={2000}
          aria-label="Describe the change you want"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={propose}
          loading={proposing}
          disabled={formDirty || !instruction.trim()}
        >
          Draft change
        </Button>
      </div>

      {formDirty && (
        <p className={styles.note}>Save your manual changes first, then edit with AI.</p>
      )}

      {!proposal && !formDirty && (
        <div className={styles.examples}>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className={styles.example} onClick={() => setInstruction(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {failed && (
        <div className={styles.failure}>
          <p className={styles.failureText}>{proposal.reason ?? "Couldn't find that in your prompt."}</p>
          {proposal.occurrences && proposal.occurrences.length > 0 && (
            <>
              <p className={styles.note}>It appears in {proposal.occurrences.length} places:</p>
              <ul className={styles.occurrences}>
                {proposal.occurrences.map((o, i) => (
                  <li key={i}><code>{o}</code></li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.note}>Nothing was changed.</p>
        </div>
      )}

      {proposal?.status === "ok" && (
        <div className={styles.review}>
          {proposal.sectioned && (
            <p className={styles.note}>
              Your prompt is large — searched {proposal.searchedRegions} of {proposal.totalRegions} sections.
            </p>
          )}
          <DiffView hunks={proposal.hunks} />
          <div className={styles.actions}>
            <Button type="button" onClick={apply} loading={applying}>
              Apply change
            </Button>
            <Button type="button" variant="secondary" onClick={() => setProposal(null)} disabled={applying}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
