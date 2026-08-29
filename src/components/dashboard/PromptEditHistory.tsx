"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/context/ToastContext"
import styles from "./PromptEditHistory.module.css"

interface EditRow {
  id: string
  instruction: string
  snapshotTruncated: boolean
  model: string
  revertedAt: string | null
  createdAt: string
}

interface HistoryResponse {
  revertableId: string | null
  edits: EditRow[]
}

export function PromptEditHistory({
  agentId,
  onReverted,
}: {
  agentId: string
  onReverted: (value: string) => void
}) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["prompt-edits", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/prompt-edits`)
      if (!res.ok) throw new Error("Failed to load history")
      return res.json()
    },
  })

  const revert = useMutation({
    mutationFn: async (editId: string) => {
      const res = await fetch(`/api/agents/${agentId}/prompt-edits/${editId}/revert`, { method: "POST" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Could not undo that edit.")
      return body as { value: string }
    },
    onSuccess: (body) => {
      onReverted(body.value)
      queryClient.invalidateQueries({ queryKey: ["prompt-edits", agentId] })
      showToast("Edit undone.")
    },
    onError: (err: Error) => showToast(err.message, "error"),
  })

  if (isLoading || !data || data.edits.length === 0) return null

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Recent AI edits</div>
      <ul className={styles.list}>
        {data.edits.map((e) => (
          <li key={e.id} className={styles.row}>
            <div className={styles.main}>
              <span className={styles.instruction}>{e.instruction}</span>
              <span className={styles.meta}>
                {formatDistanceToNow(new Date(e.createdAt))} ago
                {e.revertedAt ? " · undone" : ""}
                {e.snapshotTruncated ? " · too large to undo" : ""}
              </span>
            </div>
            {/* Only the newest non-reverted edit can be undone — rolling back an
                older one would silently discard everything applied after it. */}
            {data.revertableId === e.id && !e.snapshotTruncated && (
              <button
                type="button"
                className={styles.undo}
                onClick={() => revert.mutate(e.id)}
                disabled={revert.isPending}
              >
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
