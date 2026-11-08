"use client"

import { useEffect, useState } from "react"
import styles from "./UserInsightsPanels.module.css"
import { formatDate } from "@/lib/utils"

function useInsights<T>(userId: string, section: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/users/${userId}/insights?section=${section}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: T) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [userId, section])

  return { data, error }
}

function Loading({ data, error, children }: { data: unknown; error: boolean; children: () => React.ReactNode }) {
  if (error) return <div className={styles.note}>Couldn&apos;t load this section.</div>
  if (!data) return <div className={styles.note} aria-live="polite">Loading…</div>
  return <>{children()}</>
}

function Stat({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{typeof value === "number" ? value.toLocaleString() : value}</span>
      <span className={styles.statLabel}>{label}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  )
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-"
}

function Pill({ tone, children }: { tone: "good" | "bad" | "warn" | "neutral"; children: React.ReactNode }) {
  return <span className={styles.pill} data-tone={tone}>{children}</span>
}

// ── Status ──────────────────────────────────────────────────────────────────

interface StatusData {
  byStatus: Array<{ status: string; count: number }>
  creditsUsed: number
  last30d: { posts: number; reach: number; delivered: number; viewed: number; liked: number; replied: number }
  contacts: number
  savedByUs: number
  galleryCount: number
  latestRun: { status: string; pauseReason: string | null; totalCount: number; savedCount: number; failedCount: number; creditsUsed: number; createdAt: string; completedAt: string | null } | null
  recent: Array<{ id: string; kind: string; text: string | null; status: string; scheduledAt: string; postedAt: string | null; recipientCount: number; creditsUsed: number; error: string | null; views: number }>
}

const POST_TONE: Record<string, "good" | "bad" | "warn" | "neutral"> = {
  posted: "good",
  failed: "bad",
  scheduled: "warn",
  posting: "warn",
}

export function UserStatusPanel({ userId }: { userId: string }) {
  const { data, error } = useInsights<StatusData>(userId, "status")
  return (
    <Loading data={data} error={error}>
      {() => {
        const d = data!
        const total = d.byStatus.reduce((s, g) => s + g.count, 0)
        if (total === 0 && d.contacts === 0) {
          return <div className={styles.note}>This user hasn&apos;t used Status yet.</div>
        }
        const count = (s: string) => d.byStatus.find((g) => g.status === s)?.count ?? 0
        const l = d.last30d
        return (
          <>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Last 30 days</h3>
              <div className={styles.statGrid}>
                <Stat value={l.posts} label="Posted" />
                <Stat value={l.reach} label="Sent to" />
                <Stat value={l.viewed} label="Viewed" sub={`${pct(l.viewed, l.reach)} view rate`} />
                <Stat value={l.liked} label="Liked" />
                <Stat value={l.replied} label="Replied" />
              </div>
              <p className={styles.hint}>Views are undercounted when viewers have read receipts off.</p>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>All time</h3>
              <div className={styles.statGrid}>
                <Stat value={total} label="Posts" />
                <Stat value={count("scheduled")} label="Scheduled" />
                <Stat value={count("failed")} label="Failed" />
                <Stat value={d.galleryCount} label="In gallery" />
                <Stat value={d.creditsUsed} label="Credits" />
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Audience</h3>
              <div className={styles.statGrid}>
                <Stat value={d.contacts} label="Contacts" />
                <Stat value={d.savedByUs} label="Saved by Dailzero" />
              </div>
              {d.latestRun && (
                <div className={styles.runLine}>
                  Latest contact save: <Pill tone={d.latestRun.status === "completed" ? "good" : d.latestRun.status === "paused" ? "warn" : "neutral"}>{d.latestRun.status}</Pill>
                  {" "}{d.latestRun.savedCount.toLocaleString()} of {d.latestRun.totalCount.toLocaleString()} saved
                  {d.latestRun.failedCount > 0 && `, ${d.latestRun.failedCount.toLocaleString()} failed`}
                  {d.latestRun.pauseReason && ` · paused: ${d.latestRun.pauseReason.replace("_", " ")}`}
                  {` · started ${formatDate(d.latestRun.createdAt)}`}
                </div>
              )}
            </section>

            {d.recent.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Recent posts</h3>
                <div className={styles.list}>
                  {d.recent.map((p) => (
                    <div key={p.id} className={styles.listRow}>
                      <div className={styles.listMain}>
                        <span className={styles.listTitle}>{p.text || `${p.kind.charAt(0).toUpperCase()}${p.kind.slice(1)} post`}</span>
                        <span className={styles.listMeta}>
                          {formatDate(p.postedAt ?? p.scheduledAt)} · {p.kind}
                          {p.error && <span className={styles.errorText}> · {p.error}</span>}
                        </span>
                      </div>
                      <div className={styles.listSide}>
                        <Pill tone={POST_TONE[p.status] ?? "neutral"}>{p.status}</Pill>
                        {p.status === "posted" && (
                          <span className={styles.listNum}>{p.views.toLocaleString()} / {p.recipientCount.toLocaleString()} viewed</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )
      }}
    </Loading>
  )
}

// ── WhatsApp ────────────────────────────────────────────────────────────────

interface WhatsAppData {
  sessions: Array<{
    agentId: string
    businessName: string
    transportType: string
    session: { phoneNumber: string | null; status: string; lastConnectedAt: string | null; lastDisconnectReason: string | null; warmupTier: number; dailyMessageCount: number } | null
  }>
  metaNumbers: Array<{ id: string; displayPhoneNumber: string | null; verifiedName: string | null; registered: boolean; subscribed: boolean; aiRepliesEnabled: boolean; agentName: string | null }>
}

const SESSION_TONE: Record<string, "good" | "bad" | "warn" | "neutral"> = {
  CONNECTED: "good",
  CONNECTING: "warn",
  QR_PENDING: "warn",
  DISCONNECTED: "neutral",
  LOGGED_OUT: "bad",
  BANNED: "bad",
}

export function UserWhatsAppPanel({ userId }: { userId: string }) {
  const { data, error } = useInsights<WhatsAppData>(userId, "whatsapp")
  return (
    <Loading data={data} error={error}>
      {() => {
        const d = data!
        const linked = d.sessions.filter((s) => s.session)
        return (
          <>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>WhatsApp Web (QR linked)</h3>
              {linked.length === 0 ? (
                <div className={styles.note}>No QR-linked numbers.</div>
              ) : (
                <div className={styles.list}>
                  {linked.map(({ agentId, businessName, session: s }) => (
                    <div key={agentId} className={styles.listRow}>
                      <div className={styles.listMain}>
                        <span className={styles.listTitle}>{s!.phoneNumber ?? "No number yet"}</span>
                        <span className={styles.listMeta}>
                          {businessName} · warmup tier {s!.warmupTier} · {s!.dailyMessageCount.toLocaleString()} sent today
                          {s!.lastConnectedAt && ` · last connected ${formatDate(s!.lastConnectedAt)}`}
                          {s!.status !== "CONNECTED" && s!.lastDisconnectReason && <span className={styles.errorText}> · {s!.lastDisconnectReason}</span>}
                        </span>
                      </div>
                      <div className={styles.listSide}>
                        <Pill tone={SESSION_TONE[s!.status] ?? "neutral"}>{s!.status.replace("_", " ").toLowerCase()}</Pill>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Meta Cloud API numbers</h3>
              {d.metaNumbers.length === 0 ? (
                <div className={styles.note}>No Meta numbers connected.</div>
              ) : (
                <div className={styles.list}>
                  {d.metaNumbers.map((m) => (
                    <div key={m.id} className={styles.listRow}>
                      <div className={styles.listMain}>
                        <span className={styles.listTitle}>{m.displayPhoneNumber ?? "Unknown number"}</span>
                        <span className={styles.listMeta}>
                          {m.verifiedName ?? "No verified name"}{m.agentName && ` · ${m.agentName}`} · AI replies {m.aiRepliesEnabled ? "on" : "off"}
                        </span>
                      </div>
                      <div className={styles.listSide}>
                        <Pill tone={m.registered && m.subscribed ? "good" : "warn"}>
                          {m.registered && m.subscribed ? "live" : !m.registered ? "not registered" : "not subscribed"}
                        </Pill>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )
      }}
    </Loading>
  )
}

// ── Activity ────────────────────────────────────────────────────────────────

interface ActivityData {
  conversations: { total: number; active30d: number; humanMode: number; withMemory: number; lastActiveAt: string | null }
  leads: { total: number; last30d: number }
  appointments: { byStatus: Array<{ status: string; count: number }>; upcoming: number }
  broadcasts: Array<{ id: string; message: string; status: string; channel: string; totalCount: number; sentCount: number; failedCount: number; createdAt: string }>
  apiKeys: Array<{ id: string; name: string; prefix: string; status: string; scopes: string[]; lastUsedAt: string | null; dailySpentCredits: number }>
}

export function UserActivityPanel({ userId }: { userId: string }) {
  const { data, error } = useInsights<ActivityData>(userId, "activity")
  return (
    <Loading data={data} error={error}>
      {() => {
        const d = data!
        const appts = d.appointments.byStatus.reduce((s, g) => s + g.count, 0)
        const activeKeys = d.apiKeys.filter((k) => k.status === "active")
        return (
          <>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Conversations</h3>
              <div className={styles.statGrid}>
                <Stat value={d.conversations.total} label="Total" />
                <Stat value={d.conversations.active30d} label="Active, 30 days" />
                <Stat value={d.conversations.humanMode} label="In human mode" />
                <Stat value={d.conversations.withMemory} label="With memory" />
              </div>
              <p className={styles.hint}>
                {d.conversations.lastActiveAt ? `Last conversation activity ${formatDate(d.conversations.lastActiveAt)}.` : "No conversation activity yet."}
              </p>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Leads and appointments</h3>
              <div className={styles.statGrid}>
                <Stat value={d.leads.total} label="Leads" sub={`${d.leads.last30d.toLocaleString()} in 30 days`} />
                <Stat value={appts} label="Appointments" />
                <Stat value={d.appointments.upcoming} label="Upcoming" />
                {d.appointments.byStatus.filter((g) => g.status !== "SCHEDULED").map((g) => (
                  <Stat key={g.status} value={g.count} label={g.status.replace("_", " ").toLowerCase()} />
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Recent broadcasts</h3>
              {d.broadcasts.length === 0 ? (
                <div className={styles.note}>No broadcasts sent.</div>
              ) : (
                <div className={styles.list}>
                  {d.broadcasts.map((b) => (
                    <div key={b.id} className={styles.listRow}>
                      <div className={styles.listMain}>
                        <span className={styles.listTitle}>{b.message}</span>
                        <span className={styles.listMeta}>{formatDate(b.createdAt)} · {b.channel === "meta" ? "Cloud API" : "WhatsApp Web"}</span>
                      </div>
                      <div className={styles.listSide}>
                        <Pill tone={b.status === "completed" ? "good" : b.status === "failed" ? "bad" : "neutral"}>{b.status}</Pill>
                        <span className={styles.listNum}>
                          {b.sentCount.toLocaleString()} / {b.totalCount.toLocaleString()} sent{b.failedCount > 0 && `, ${b.failedCount.toLocaleString()} failed`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Developer API</h3>
              {d.apiKeys.length === 0 ? (
                <div className={styles.note}>No API keys.</div>
              ) : (
                <div className={styles.list}>
                  {d.apiKeys.map((k) => (
                    <div key={k.id} className={styles.listRow}>
                      <div className={styles.listMain}>
                        <span className={styles.listTitle}>{k.name}</span>
                        <span className={styles.listMeta}>
                          <code>{k.prefix}</code> · {k.scopes.join(", ") || "no scopes"} · {k.lastUsedAt ? `last used ${formatDate(k.lastUsedAt)}` : "never used"}
                        </span>
                      </div>
                      <div className={styles.listSide}>
                        <Pill tone={k.status === "active" ? "good" : "neutral"}>{k.status}</Pill>
                        {k.status === "active" && <span className={styles.listNum}>{k.dailySpentCredits.toLocaleString()} credits today</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeKeys.length > 0 && <p className={styles.hint}>{activeKeys.length} active key{activeKeys.length === 1 ? "" : "s"}.</p>}
            </section>
          </>
        )
      }}
    </Loading>
  )
}

// ── Team ────────────────────────────────────────────────────────────────────

interface TeamData {
  members: Array<{ id: string; email: string; name: string | null; role: string; status: string; invitedAt: string; joinedAt: string | null }>
}

export function UserTeamPanel({ userId }: { userId: string }) {
  const { data, error } = useInsights<TeamData>(userId, "team")
  return (
    <Loading data={data} error={error}>
      {() => {
        const d = data!
        if (d.members.length === 0) return <div className={styles.note}>No team members invited.</div>
        return (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Workspace members</h3>
            <div className={styles.list}>
              {d.members.map((m) => (
                <div key={m.id} className={styles.listRow}>
                  <div className={styles.listMain}>
                    <span className={styles.listTitle}>{m.name ?? m.email}</span>
                    <span className={styles.listMeta}>
                      {m.name && `${m.email} · `}{m.role.toLowerCase()} · {m.joinedAt ? `joined ${formatDate(m.joinedAt)}` : `invited ${formatDate(m.invitedAt)}`}
                    </span>
                  </div>
                  <div className={styles.listSide}>
                    <Pill tone={m.status === "ACCEPTED" ? "good" : m.status === "REVOKED" ? "neutral" : "warn"}>{m.status.toLowerCase()}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      }}
    </Loading>
  )
}
