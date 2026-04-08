"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./UserTable.module.css"
import { StatusBadge } from "@/components/ui/Badge"
import Button from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { formatDate } from "@/lib/utils"
import type { UserPublic } from "@/types"

interface UserWithAgentCount extends UserPublic {
  _count?: { agents: number }
}

interface UserTableProps {
  users: UserWithAgentCount[]
}

function UserDetailModal({ user, onClose, onStatusChange, loading }: {
  user: UserWithAgentCount
  onClose: () => void
  onStatusChange: (userId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED") => void
  loading: string | null
}) {
  const router = useRouter()
  const [maxAgents, setMaxAgents] = useState<number>(user.maxAgents ?? 1)
  const [savingMaxAgents, setSavingMaxAgents] = useState(false)
  const [maxAgentsSaved, setMaxAgentsSaved] = useState(false)

  const handleSaveMaxAgents = async () => {
    setSavingMaxAgents(true)
    setMaxAgentsSaved(false)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxAgents }),
      })
      if (!res.ok) throw new Error("Failed to update")
      setMaxAgentsSaved(true)
      router.refresh()
      setTimeout(() => setMaxAgentsSaved(false), 2000)
    } catch {
      alert("Failed to update agent limit")
    } finally {
      setSavingMaxAgents(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={user.name}
      footer={
        <div className={styles.modalActions}>
          {user.status !== "APPROVED" && (
            <Button
              size="sm"
              variant="primary"
              loading={loading === `${user.id}-APPROVED`}
              onClick={() => onStatusChange(user.id, "APPROVED")}
            >
              Approve
            </Button>
          )}
          {user.status === "APPROVED" && (
            <Button
              size="sm"
              variant="danger"
              loading={loading === `${user.id}-SUSPENDED`}
              onClick={() => onStatusChange(user.id, "SUSPENDED")}
            >
              Suspend
            </Button>
          )}
          {user.status === "SUSPENDED" && (
            <Button
              size="sm"
              variant="primary"
              loading={loading === `${user.id}-APPROVED`}
              onClick={() => onStatusChange(user.id, "APPROVED")}
            >
              Unsuspend
            </Button>
          )}
          {user.status !== "REJECTED" && user.status !== "SUSPENDED" && (
            <Button
              size="sm"
              variant="danger"
              loading={loading === `${user.id}-REJECTED`}
              onClick={() => onStatusChange(user.id, "REJECTED")}
            >
              Reject
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className={styles.modalBody}>
        <div className={styles.modalSection}>
          <div className={styles.modalSectionTitle}>Personal</div>
          <div className={styles.modalGrid}>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Email</span>
              <span className={styles.modalValue}>{user.email}</span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Phone</span>
              <span className={styles.modalValue}>{user.phone ?? <span className={styles.empty}>—</span>}</span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Status</span>
              <span className={styles.modalValue}><StatusBadge status={user.status} /></span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Role</span>
              <span className={styles.modalValue}>{user.role}</span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Joined</span>
              <span className={styles.modalValue}>{formatDate(user.createdAt)}</span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Agents</span>
              <span className={styles.modalValue}>{user._count?.agents ?? 0} / {user.maxAgents ?? 1}</span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Onboarding</span>
              <span className={styles.modalValue}>
                {user.onboardingCompleted ? "✓ Completed" : "Not completed"}
              </span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Agent Limit</span>
              <span className={styles.modalValue}>
                <div className={styles.agentLimitRow}>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxAgents}
                    onChange={(e) => setMaxAgents(Math.max(1, Math.min(20, Number(e.target.value))))}
                    className={styles.agentLimitInput}
                  />
                  <button
                    className={styles.agentLimitSaveBtn}
                    onClick={handleSaveMaxAgents}
                    disabled={savingMaxAgents || maxAgents === (user.maxAgents ?? 1)}
                  >
                    {savingMaxAgents ? "Saving…" : maxAgentsSaved ? "Saved ✓" : "Save"}
                  </button>
                </div>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.modalSection}>
          <div className={styles.modalSectionTitle}>Business</div>
          <div className={styles.modalGrid}>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Name</span>
              <span className={styles.modalValue}>{user.businessName}</span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Category</span>
              <span className={styles.modalValue}>{user.businessCategory ?? <span className={styles.empty}>—</span>}</span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Email</span>
              <span className={styles.modalValue}>{user.businessEmail ?? <span className={styles.empty}>—</span>}</span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Website</span>
              <span className={styles.modalValue}>
                {user.businessWebsite
                  ? <a href={user.businessWebsite} target="_blank" rel="noreferrer" className={styles.link}>{user.businessWebsite}</a>
                  : <span className={styles.empty}>—</span>
                }
              </span>
            </div>
            <div className={styles.modalRow}>
              <span className={styles.modalLabel}>Address</span>
              <span className={styles.modalValue}>{user.businessAddress ?? <span className={styles.empty}>—</span>}</span>
            </div>
            {user.businessDescription && (
              <div className={styles.modalRowFull}>
                <span className={styles.modalLabel}>Description</span>
                <p className={styles.modalDesc}>{user.businessDescription}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function UserTable({ users }: UserTableProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserWithAgentCount | null>(null)

  const handleStatusChange = async (userId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED") => {
    setLoading(`${userId}-${status}`)
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error("Failed to update")
      router.refresh()
      setSelectedUser(null)
    } catch {
      alert("Failed to update user status")
    } finally {
      setLoading(null)
    }
  }

  if (users.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>No users found</div>
      </div>
    )
  }

  return (
    <>
      <div className={styles.wrapper}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>User</th>
              <th className={styles.th}>Business</th>
              <th className={styles.th}>Phone</th>
              <th className={styles.th}>Agents</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Joined</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className={styles.tr}
                onClick={() => setSelectedUser(user)}
                style={{ cursor: "pointer" }}
              >
                <td className={styles.td}>
                  <div className={styles.name}>
                    {user.name}
                    {!user.onboardingCompleted && (
                      <span title="Onboarding not completed" style={{ marginLeft: "0.4rem", fontSize: "10px", background: "var(--warning-light)", color: "var(--warning)", borderRadius: "4px", padding: "1px 5px", fontWeight: 600, verticalAlign: "middle" }}>
                        onboarding
                      </span>
                    )}
                  </div>
                  <div className={styles.email}>{user.email}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.business}>{user.businessName}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.business}>{user.phone ?? "—"}</div>
                </td>
                <td className={styles.td}>
                  {(user as any)._count?.agents ?? 0}
                </td>
                <td className={styles.td}>
                  <StatusBadge status={user.status} />
                </td>
                <td className={styles.td}>
                  {formatDate(user.createdAt)}
                </td>
                <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.actions}>
                    {(user.status === "PENDING" || user.status === "REJECTED" || user.status === "SUSPENDED") && (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={loading === `${user.id}-APPROVED`}
                        onClick={() => handleStatusChange(user.id, "APPROVED")}
                      >
                        {user.status === "SUSPENDED" ? "Unsuspend" : "Approve"}
                      </Button>
                    )}
                    {user.status === "APPROVED" && (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={loading === `${user.id}-SUSPENDED`}
                        onClick={() => handleStatusChange(user.id, "SUSPENDED")}
                      >
                        Suspend
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onStatusChange={handleStatusChange}
          loading={loading}
        />
      )}
    </>
  )
}

export default UserTable
