"use client"

import { Fragment, useCallback, useEffect, useState } from "react"

interface WorkerEvent {
  id: string
  level: string
  category: string
  agentId: string | null
  agentName?: string | null
  ownerName?: string | null
  ownerBusiness?: string | null
  ownerEmail?: string | null
  message: string
  detail: unknown
  createdAt: string
}
interface Cat { category: string; count: number }

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export function AdminEventsClient() {
  const [events, setEvents] = useState<WorkerEvent[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [category, setCategory] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = category ? `?category=${encodeURIComponent(category)}` : ""
      const res = await fetch(`/api/admin/events${qs}`)
      const data = await res.json()
      setEvents(data.events ?? [])
      setCategories(data.categories ?? [])
    } finally {
      setLoading(false)
    }
  }, [category])
  useEffect(() => { load() }, [load])

  const chip = (active: boolean): React.CSSProperties => ({
    border: "1px solid var(--border, #d4d4d8)", borderRadius: 999, padding: "5px 12px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", background: active ? "var(--accent, #16a34a)" : "transparent",
    color: active ? "#fff" : "inherit",
  })
  const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "var(--text-secondary, #71717a)", fontWeight: 600, borderBottom: "1px solid var(--border, #e4e4e7)" }
  const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid var(--border, #f0f0f0)", verticalAlign: "top" }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Events</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>
          Worker failures — connection issues, send failures — from the last 7 days. High-signal only.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button style={chip(category === "")} onClick={() => setCategory("")}>All</button>
        {categories.map((c) => (
          <button key={c.category} style={chip(category === c.category)} onClick={() => setCategory(c.category)}>
            {c.category} <span style={{ opacity: 0.7 }}>· {c.count}</span>
          </button>
        ))}
        <button style={{ ...chip(false), marginLeft: "auto" }} onClick={load}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-secondary, #71717a)", fontSize: 14 }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ color: "var(--text-secondary, #71717a)", fontSize: 14, padding: "24px 0", textAlign: "center" }}>
          No events{category ? ` for "${category}"` : ""}. 🎉
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-secondary, #fff)", border: "1px solid var(--border, #e4e4e7)", borderRadius: 12, overflow: "hidden" }}>
          <thead>
            <tr>
              <th style={th}>When</th>
              <th style={th}>Level</th>
              <th style={th}>Category</th>
              <th style={th}>Agent</th>
              <th style={th}>Message</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <Fragment key={e.id}>
                <tr style={{ cursor: "pointer" }} onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmt(e.createdAt)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, color: e.level === "error" ? "#991b1b" : "#92610a", background: e.level === "error" ? "#fee2e2" : "#fef3c7" }}>
                      {e.level}
                    </span>
                  </td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>{e.category}</td>
                  <td style={td}>
                    {e.agentId ? (
                      <div>
                        <div style={{ fontWeight: 600 }}>{e.agentName ?? "(unknown agent)"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary, #71717a)" }}>
                          {[e.ownerName ?? e.ownerBusiness, e.ownerEmail].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-secondary, #71717a)" }}>—</span>
                    )}
                  </td>
                  <td style={td}>{e.message}</td>
                  <td style={{ ...td, color: "var(--text-secondary, #71717a)" }}>{e.detail ? (open === e.id ? "▲" : "▼") : ""}</td>
                </tr>
                {open === e.id && e.detail != null && (
                  <tr>
                    <td style={{ ...td, background: "var(--bg-primary, #fafafa)" }} colSpan={6}>
                      <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {JSON.stringify({ agentId: e.agentId, ...(e.detail as object) }, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
