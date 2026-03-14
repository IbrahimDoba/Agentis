"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./UserTable.module.css"
import { StatusBadge } from "@/components/ui/Badge"
import Button from "@/components/ui/Button"
import { formatDate } from "@/lib/utils"
import type { UserPublic } from "@/types"

interface UserWithAgentCount extends UserPublic {
  _count?: { agents: number }
}

interface UserTableProps {
  users: UserWithAgentCount[]
}

export function UserTable({ users }: UserTableProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const handleStatusChange = async (userId: string, status: "APPROVED" | "REJECTED") => {
    setLoading(`${userId}-${status}`)
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error("Failed to update")
      router.refresh()
    } catch (err) {
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
            <tr key={user.id} className={styles.tr}>
              <td className={styles.td}>
                <div className={styles.name}>{user.name}</div>
                <div className={styles.email}>{user.email}</div>
              </td>
              <td className={styles.td}>
                <div className={styles.business}>{user.businessName}</div>
              </td>
              <td className={styles.td}>
                <div className={styles.business}>{user.phone}</div>
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
              <td className={styles.td}>
                <div className={styles.actions}>
                  {user.status !== "APPROVED" && (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={loading === `${user.id}-APPROVED`}
                      onClick={() => handleStatusChange(user.id, "APPROVED")}
                    >
                      Approve
                    </Button>
                  )}
                  {user.status !== "REJECTED" && (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={loading === `${user.id}-REJECTED`}
                      onClick={() => handleStatusChange(user.id, "REJECTED")}
                    >
                      Reject
                    </Button>
                  )}
                  {user.status === "APPROVED" && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Active</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default UserTable
