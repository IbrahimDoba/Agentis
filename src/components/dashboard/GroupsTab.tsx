"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/context/ToastContext"
import styles from "./GroupsTab.module.css"

interface GroupRow {
  id: string
  groupJid: string
  subject: string | null
  replyMode: string
  conversationId: string | null
  joinedAt: string
  lastMessageAt: string | null
}

interface GroupsResponse {
  groupChatEnabled: boolean
  groups: GroupRow[]
}

function relative(iso: string | null): string {
  if (!iso) return "Never"
  return `${formatDistanceToNow(new Date(iso))} ago`
}

export function GroupsTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const { data, isLoading } = useQuery<GroupsResponse>({
    queryKey: ["agent-groups", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/groups`)
      if (!res.ok) throw new Error("Failed to load groups")
      return res.json()
    },
  })

  const setMode = useMutation({
    mutationFn: async ({ groupId, replyMode }: { groupId: string; replyMode: string }) => {
      const res = await fetch(`/api/agents/${agentId}/groups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, replyMode }),
      })
      if (!res.ok) throw new Error("Failed to update group")
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-groups", agentId] }),
    onError: () => showToast("Could not update that group. Please try again.", "error"),
  })

  if (isLoading) return <p className={styles.muted}>Loading groups…</p>

  const groups = data?.groups ?? []

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>WhatsApp Groups</h2>
        <p className={styles.desc}>
          Groups this agent has been added to. It only answers when someone <strong>@mentions</strong> it
          or replies to one of its messages, and it never replies to ordinary group chatter.
        </p>
      </div>

      {!data?.groupChatEnabled && (
        <div className={styles.notice}>
          Group chats are turned off for this agent. Nothing here will reply until you enable
          <strong> Group chats</strong> on the Settings tab.
        </div>
      )}

      {groups.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No groups yet</p>
          <p className={styles.muted}>
            Add this agent&apos;s WhatsApp number to a group from your phone. It appears here the first
            time someone posts in that group.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Group</th>
                <th>Last activity</th>
                <th>Replies</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>
                    <span className={styles.subject}>{g.subject ?? "Unnamed group"}</span>
                  </td>
                  <td className={styles.muted}>{relative(g.lastMessageAt)}</td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={g.replyMode === "mention"}
                      aria-label={`Replies for ${g.subject ?? "this group"}`}
                      disabled={setMode.isPending}
                      className={`${styles.switch} ${g.replyMode === "mention" ? styles.switchOn : ""}`}
                      onClick={() =>
                        setMode.mutate({
                          groupId: g.id,
                          replyMode: g.replyMode === "mention" ? "off" : "mention",
                        })
                      }
                    >
                      <span className={styles.switchKnob} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
