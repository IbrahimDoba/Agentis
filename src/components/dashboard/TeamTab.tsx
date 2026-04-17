"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { TrashIcon, PencilIcon, CheckIcon, XMarkIcon, EnvelopeIcon } from "@heroicons/react/24/outline"
import { PLAN_SEAT_LIMITS } from "@/lib/plans"
import styles from "./TeamTab.module.css"

interface Member {
  id: string
  email: string
  role: "ADMIN" | "MEMBER" | "OWNER"
  status: "PENDING" | "ACCEPTED" | "REVOKED"
  invitedAt: string
  joinedAt: string | null
  user: { name: string; id: string } | null
  isOwner?: boolean
}

interface Props {
  plan: string
  isOwner?: boolean
}

async function fetchMembers(): Promise<{ members: Member[] }> {
  const res = await fetch("/api/workspace/members")
  if (!res.ok) throw new Error("Failed to load members")
  return res.json()
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Invite sent",
  ACCEPTED: "Active",
  REVOKED: "Revoked",
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
}

export function TeamTab({ plan, isOwner = true }: Props) {
  const qc = useQueryClient()
  const seatLimit = PLAN_SEAT_LIMITS[plan] ?? 0
  const isTeamEnabled = seatLimit !== 0

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER")
  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<"ADMIN" | "MEMBER">("MEMBER")

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-members"],
    queryFn: fetchMembers,
    enabled: isTeamEnabled,
  })

  const activeMembers = data?.members.filter((m) => m.status !== "REVOKED") ?? []
  // Seat count excludes the owner row
  const seatsFilled = activeMembers.filter((m) => !m.isOwner).length
  const seatsLeft = seatLimit === -1 ? null : Math.max(0, seatLimit - seatsFilled)

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/workspace/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send invite")
      return data
    },
    onSuccess: () => {
      setInviteSuccess(`Invite sent to ${inviteEmail}`)
      setInviteEmail("")
      setInviteError("")
      qc.invalidateQueries({ queryKey: ["workspace-members"] })
      setTimeout(() => setInviteSuccess(""), 4000)
    },
    onError: (err: Error) => setInviteError(err.message),
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const res = await fetch(`/api/workspace/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error("Failed to update role")
    },
    onSuccess: () => {
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ["workspace-members"] })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`/api/workspace/members/${memberId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to remove member")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-members"] }),
  })

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError("")
    setInviteSuccess("")
    if (!inviteEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      setInviteError("Enter a valid email address")
      return
    }
    inviteMutation.mutate()
  }

  if (!isTeamEnabled && isOwner) {
    return (
      <div className={styles.upgradeCard}>
        <div className={styles.upgradeIcon}>👥</div>
        <h3 className={styles.upgradeTitle}>Team Members</h3>
        <p className={styles.upgradeDesc}>
          Invite team members to help manage conversations, leads, and follow-ups.
          Available on Starter and Pro plans.
        </p>
        <a href="/dashboard/billing" className={styles.upgradeBtn}>Upgrade Plan</a>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {/* Invite form — owners only */}
      {isOwner && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Invite a team member</div>
              <div className={styles.sectionDesc}>
                They&apos;ll receive an email with a link to join your workspace.
                {seatLimit !== -1 && (
                  <span className={styles.seats}>
                    {" "}{seatsFilled}/{seatLimit} seats used
                  </span>
                )}
              </div>
            </div>
          </div>

          <form className={styles.inviteForm} onSubmit={handleInvite}>
            <input
              className={styles.emailInput}
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <select
              className={styles.roleSelect}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "ADMIN" | "MEMBER")}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button
              type="submit"
              className={styles.inviteBtn}
              disabled={inviteMutation.isPending || (seatsLeft !== null && seatsLeft <= 0)}
            >
              {inviteMutation.isPending ? "Sending..." : "Send Invite"}
            </button>
          </form>

          {inviteError && <div className={styles.inviteError}>{inviteError}</div>}
          {inviteSuccess && <div className={styles.inviteSuccess}>✓ {inviteSuccess}</div>}

          {seatsLeft !== null && seatsLeft <= 0 && (
            <div className={styles.seatWarning}>
              You&apos;ve reached your seat limit.{" "}
              <a href="/dashboard/billing" className={styles.upgradeLink}>Upgrade to add more members.</a>
            </div>
          )}
        </div>
      )}

      {/* Role descriptions */}
      <div className={styles.rolesInfo}>
        <div className={styles.roleCard}>
          <span className={styles.roleCardBadge}>Admin</span>
          <span className={styles.roleCardDesc}>View chats, follow-ups, leads, contacts. Can manage team members.</span>
        </div>
        <div className={styles.roleCard}>
          <span className={styles.roleCardBadge}>Member</span>
          <span className={styles.roleCardDesc}>View chats, send follow-ups, manage leads and add notes.</span>
        </div>
      </div>

      {/* Members list */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Team members</div>

        {isLoading ? (
          <div className={styles.empty}>Loading members...</div>
        ) : activeMembers.length === 0 ? (
          <div className={styles.empty}>
            <EnvelopeIcon width={24} height={24} style={{ opacity: 0.4 }} />
            <span>No team members yet. Send your first invite above.</span>
          </div>
        ) : (
          <div className={styles.memberList}>
            {activeMembers.map((m) => (
              <div key={m.id} className={styles.memberRow}>
                <div className={styles.memberInfo}>
                  <div className={styles.memberAvatar}>
                    {(m.user?.name || m.email)[0].toUpperCase()}
                  </div>
                  <div className={styles.memberDetails}>
                    <div className={styles.memberName}>{m.user?.name ?? "—"}</div>
                    <div className={styles.memberEmail}>{m.email}</div>
                  </div>
                </div>

                <div className={styles.memberMeta}>
                  <span className={`${styles.statusBadge} ${styles[`status${m.status}`]}`}>
                    {STATUS_LABELS[m.status]}
                  </span>

                  {isOwner && editingId === m.id ? (
                    <div className={styles.roleEdit}>
                      <select
                        className={styles.roleSelectInline}
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as "ADMIN" | "MEMBER")}
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <button
                        className={styles.iconBtn}
                        onClick={() => updateRoleMutation.mutate({ memberId: m.id, role: editRole })}
                        disabled={updateRoleMutation.isPending}
                        aria-label="Save"
                      >
                        <CheckIcon width={14} height={14} />
                      </button>
                      <button
                        className={styles.iconBtn}
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel"
                      >
                        <XMarkIcon width={14} height={14} />
                      </button>
                    </div>
                  ) : (
                    <span className={styles.rolePill}>{ROLE_LABELS[m.role]}</span>
                  )}

                  {isOwner && !m.isOwner && (
                    <div className={styles.memberActions}>
                      {editingId !== m.id && (
                        <button
                          className={styles.iconBtn}
                          onClick={() => { setEditingId(m.id); setEditRole(m.role as "ADMIN" | "MEMBER") }}
                          aria-label="Edit role"
                          title="Edit role"
                        >
                          <PencilIcon width={14} height={14} />
                        </button>
                      )}
                      <button
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={() => revokeMutation.mutate(m.id)}
                        aria-label="Remove member"
                        title="Remove from workspace"
                      >
                        <TrashIcon width={14} height={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
