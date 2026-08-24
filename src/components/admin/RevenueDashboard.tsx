"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { formatNaira } from "@/lib/plans"
import styles from "./RevenueDashboard.module.css"

interface MonthBucket {
  key: string
  label: string
  subscriptions: number
  credits: number
  manual: number
  total: number
}

interface Props {
  totals: {
    totalGross: number
    totalNet: number
    monthGross: number
    txnCount: number
    subsGross: number
    creditsGross: number
    manualTotal: number
  }
  monthly: MonthBucket[]
  planData: { plan: string; label: string; amount: number }[]
  manualEntries: { id: string; label: string; amountNaira: number; currency: string; note: string | null; at: string; converted: boolean }[]
  manualUnconverted: number
  plans: { plan: string; label: string; price: number }[]
  generatedAt: string
}

const tooltipStyle = {
  backgroundColor: "#0f1e15",
  border: "1px solid #1e3a26",
  borderRadius: "10px",
  color: "#e8fdf0",
  fontSize: "13px",
}

// Compact naira for axis ticks: ₦1.2M / ₦850k / ₦0.
function compactNaira(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`
  return `₦${n}`
}

const SVG_W = 1200
const SVG_H = 630

export function RevenueDashboard({ totals, monthly, planData, manualEntries, manualUnconverted, plans, generatedAt }: Props) {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement>(null)

  const [amount, setAmount] = useState("")
  const [label, setLabel] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const asOf = new Date(generatedAt).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })

  async function addRevenue(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = Math.floor(Number(amount))
    if (!label.trim()) return setError("Enter a label / source")
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a positive whole amount")
    setBusy(true)
    try {
      const res = await fetch("/api/admin/finances/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "revenue",
          label: label.trim(),
          amount: amt,
          currency: "NGN",
          recurring: false,
          incurredAt: date ? new Date(date + "T12:00:00.000Z").toISOString() : undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? "Failed to add revenue")
      }
      setAmount("")
      setLabel("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add revenue")
    } finally {
      setBusy(false)
    }
  }

  // Rasterize the shareable SVG card to a PNG download (no external libs — the
  // card is a self-contained SVG, so it converts cleanly via canvas).
  function downloadPng() {
    const svg = svgRef.current
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml)
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement("canvas")
      canvas.width = SVG_W * scale
      canvas.height = SVG_H * scale
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, SVG_W, SVG_H)
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `dzero-revenue-${new Date().toISOString().slice(0, 10)}.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }, "image/png")
    }
    img.src = src
  }

  // ── Export-card bar geometry ───────────────────────────────────────────
  const chartLeft = 70, chartRight = 1130, chartBottom = 545, chartTop = 375
  const slot = (chartRight - chartLeft) / monthly.length
  const barW = Math.min(58, slot * 0.55)
  const maxTotal = Math.max(...monthly.map((m) => m.total), 1)

  return (
    <div className={styles.wrap}>
      {/* ── Headline stats ─────────────────────────────────────────── */}
      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <p className={styles.statLabel}>Total Revenue</p>
          <div className={`${styles.statValue} ${styles.accent}`}>{formatNaira(totals.totalGross)}</div>
          <div className={styles.statSub}>gross collected · all-time</div>
        </div>
        <div className={styles.stat}>
          <p className={styles.statLabel}>This Month</p>
          <div className={styles.statValue}>{formatNaira(totals.monthGross)}</div>
          <div className={styles.statSub}>{asOf}</div>
        </div>
        <div className={styles.stat}>
          <p className={styles.statLabel}>Net (after fees)</p>
          <div className={styles.statValue}>{formatNaira(totals.totalNet)}</div>
          <div className={styles.statSub}>after Paystack fees</div>
        </div>
        <div className={styles.stat}>
          <p className={styles.statLabel}>Payments</p>
          <div className={styles.statValue}>{totals.txnCount.toLocaleString()}</div>
          <div className={styles.statSub}>successful Paystack charges</div>
        </div>
      </div>

      {/* ── Shareable card + export ────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Shareable revenue card</h2>
            <p className={styles.sectionNote}>Download a branded image for social posts.</p>
          </div>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={downloadPng}>
            Download PNG
          </button>
        </div>
        <div className={styles.shareRow}>
          <svg
            ref={svgRef}
            className={styles.shareCard}
            xmlns="http://www.w3.org/2000/svg"
            width={SVG_W}
            height={SVG_H}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
          >
            <defs>
              <linearGradient id="rvbg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0a1712" />
                <stop offset="1" stopColor="#08120d" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="url(#rvbg)" />
            <rect x="8" y="8" width={SVG_W - 16} height={SVG_H - 16} rx="22" fill="none" stroke="#173024" strokeWidth="2" />

            {/* Brand */}
            <circle cx="72" cy="78" r="13" fill="#00dc82" />
            <text x="98" y="85" fill="#e8fdf0" fontSize="26" fontWeight="700">D-Zero AI</text>
            <text x={SVG_W - 72} y="85" fill="#4a6b56" fontSize="18" textAnchor="end">as of {asOf}</text>

            {/* Headline */}
            <text x="72" y="185" fill="#4a6b56" fontSize="22" fontWeight="600" letterSpacing="2">TOTAL REVENUE</text>
            <text x="72" y="292" fill="#00dc82" fontSize="96" fontWeight="800">{formatNaira(totals.totalGross)}</text>
            <text x="72" y="336" fill="#7a9b86" fontSize="22">
              across {totals.txnCount.toLocaleString()} payments · {formatNaira(totals.totalNet)} net after fees
            </text>

            {/* Monthly bars */}
            {monthly.map((m, i) => {
              const h = Math.round((m.total / maxTotal) * (chartBottom - chartTop))
              const x = chartLeft + i * slot + (slot - barW) / 2
              return (
                <g key={m.key}>
                  <rect x={x} y={chartBottom - h} width={barW} height={Math.max(h, 2)} rx="4" fill={m.total > 0 ? "#00dc82" : "#173024"} />
                  <text x={x + barW / 2} y={chartBottom + 24} fill="#4a6b56" fontSize="15" textAnchor="middle">{m.label}</text>
                </g>
              )
            })}
            <line x1={chartLeft} y1={chartBottom} x2={chartRight} y2={chartBottom} stroke="#173024" strokeWidth="1.5" />
            <text x="72" y={SVG_H - 34} fill="#3c5a48" fontSize="17">Monthly revenue · WhatsApp AI automation for growing businesses</text>
          </svg>
        </div>
      </div>

      {/* ── Monthly chart ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Revenue over time (12 months)</h2>
            <p className={styles.sectionNote}>
              Subscriptions {formatNaira(totals.subsGross)} · Credits {formatNaira(totals.creditsGross)} · Manual {formatNaira(totals.manualTotal)}
            </p>
          </div>
        </div>
        <div className={styles.chartWrap}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a26" />
              <XAxis dataKey="label" tick={{ fill: "#4a6b56", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#4a6b56", fontSize: 12 }} axisLine={false} tickLine={false} width={64} tickFormatter={compactNaira} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => formatNaira(Number(value))}
                cursor={{ fill: "#00dc8214" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#7a9b86" }} />
              <Bar dataKey="subscriptions" stackId="rev" fill="#00a862" name="Subscriptions" />
              <Bar dataKey="credits" stackId="rev" fill="#00dc82" name="Credit purchases" />
              <Bar dataKey="manual" stackId="rev" fill="#7c3aed" name="Manual" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Add manual revenue ─────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Add manual revenue</h2>
            <p className={styles.sectionNote}>Record revenue not captured by Paystack (cash, transfers, off-platform).</p>
          </div>
        </div>
        <form className={styles.form} onSubmit={addRevenue}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Source / label</label>
            <input className={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Reseller pool top-up" />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Amount (₦)</label>
            <input className={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50000" />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Date</label>
            <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
            {busy ? "Adding…" : "Add revenue"}
          </button>
        </form>
        {error && <div className={styles.formError}>{error}</div>}

        {(manualEntries.length > 0 || manualUnconverted > 0) && (
          <div style={{ marginTop: "1.1rem" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Amount (₦)</th>
                </tr>
              </thead>
              <tbody>
                {manualEntries.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.label}
                      {m.currency !== "NGN" && <span className={styles.tag} style={{ marginLeft: 8 }}>{m.currency}</span>}
                      {!m.converted && <span className={styles.tag} style={{ marginLeft: 8, color: "#f87171", borderColor: "#5b1d1d" }}>no FX rate</span>}
                    </td>
                    <td>{new Date(m.at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</td>
                    <td className={styles.num}>{m.converted ? formatNaira(m.amountNaira) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {manualUnconverted > 0 && (
              <p className={styles.sectionNote} style={{ marginTop: "0.6rem" }}>
                {manualUnconverted} manual entr{manualUnconverted === 1 ? "y is" : "ies are"} in a currency with no FX rate — set one on the Finances tab to include them.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Revenue by plan + plan prices ──────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Revenue by plan</h2>
            <p className={styles.sectionNote}>Collected subscription revenue per plan (gross), and current plan prices.</p>
          </div>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Price / mo</th>
              <th style={{ textAlign: "right" }}>Collected (all-time)</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const collected = planData.find((d) => d.plan === p.plan)?.amount ?? 0
              return (
                <tr key={p.plan}>
                  <td>{p.label}</td>
                  <td>{p.price > 0 ? formatNaira(p.price) : "Custom"}</td>
                  <td className={styles.num}>{formatNaira(collected)}</td>
                </tr>
              )
            })}
            {/* any plans that have revenue but aren't in the standard price list */}
            {planData.filter((d) => !plans.some((p) => p.plan === d.plan)).map((d) => (
              <tr key={d.plan}>
                <td>{d.label}</td>
                <td>—</td>
                <td className={styles.num}>{formatNaira(d.amount)}</td>
              </tr>
            ))}
            {planData.length === 0 && (
              <tr><td colSpan={3} className={styles.empty}>No subscription revenue recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
