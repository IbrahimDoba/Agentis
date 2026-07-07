"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BASE_CURRENCY,
  COMMON_CURRENCIES,
  computeSummary,
  formatBase,
  formatMoney,
  toBase,
  type FinanceEntryDTO,
  type FinanceKind,
  type RateMap,
} from "@/lib/finance"
import styles from "./FinancesDashboard.module.css"

interface ActualRevenue {
  allTime: { gross: number; net: number }
  thisMonth: { gross: number; net: number }
  subscriptionsNet: number
  creditsNet: number
}

interface Props {
  entries: FinanceEntryDTO[]
  rates: RateMap
  actualRevenue: ActualRevenue
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const blankForm = () => ({ label: "", amount: "", currency: BASE_CURRENCY, recurring: true, note: "", incurredAt: todayISO() })
type FormState = ReturnType<typeof blankForm>

export function FinancesDashboard({ entries, rates, actualRevenue }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [expForm, setExpForm] = useState<FormState>(blankForm())
  const [revForm, setRevForm] = useState<FormState>(blankForm())
  const [rateCode, setRateCode] = useState("USD")
  const [rateVal, setRateVal] = useState("")

  const summary = useMemo(() => computeSummary(entries, rates), [entries, rates])
  const expenses = useMemo(() => entries.filter((e) => e.kind === "expense"), [entries])
  const revenues = useMemo(() => entries.filter((e) => e.kind === "revenue"), [entries])

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(data.error || "Something went wrong"); return false }
      router.refresh()
      return true
    } catch {
      setMsg("Network error")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addEntry(kind: FinanceKind, form: FormState, reset: () => void) {
    const amount = Math.floor(Number(form.amount))
    if (!form.label.trim()) { setMsg("Enter a label / category"); return }
    if (!Number.isFinite(amount) || amount <= 0) { setMsg("Enter a positive amount"); return }
    const ok = await call("/api/admin/finances/entries", "POST", {
      kind,
      label: form.label,
      amount,
      currency: form.currency,
      recurring: form.recurring,
      note: form.note,
      incurredAt: form.incurredAt,
    })
    if (ok) reset()
  }

  const toggleRecurring = (e: FinanceEntryDTO) =>
    call(`/api/admin/finances/entries/${e.id}`, "PATCH", { recurring: !e.recurring })

  const del = (e: FinanceEntryDTO) => {
    if (!confirm(`Delete "${e.label}"?`)) return
    call(`/api/admin/finances/entries/${e.id}`, "DELETE")
  }

  const editEntry = (id: string, patch: Record<string, unknown>) =>
    call(`/api/admin/finances/entries/${id}`, "PATCH", patch)

  async function saveRate() {
    const rate = Number(rateVal)
    if (!rateCode.trim()) { setMsg("Enter a currency code"); return }
    if (!Number.isFinite(rate) || rate <= 0) { setMsg("Enter a positive rate"); return }
    const ok = await call("/api/admin/finances/rates", "PUT", { currency: rateCode, rateToBase: rate })
    if (ok) setRateVal("")
  }

  const profitPos = summary.profitSoFar >= 0
  const recurPos = summary.recurringProfit >= 0

  return (
    <div className={styles.wrap}>
      {/* ── Summary cards ── */}
      <div className={styles.cards}>
        <Card label="Profit so far" value={formatBase(summary.profitSoFar)} tone={profitPos ? "good" : "bad"}
          sub={`${formatBase(summary.totalRevenue)} revenue − ${formatBase(summary.totalExpenses)} expenses`} />
        <Card label="Recurring monthly profit" value={formatBase(summary.recurringProfit)} tone={recurPos ? "good" : "bad"}
          sub={`${formatBase(summary.recurringRevenue)} − ${formatBase(summary.recurringExpenses)} / mo`} />
        <Card label="Monthly expenses" value={formatBase(summary.monthlyExpenses)}
          sub="Recurring + this month's one-offs" />
        <Card label="Total revenue (manual)" value={formatBase(summary.totalRevenue)}
          sub={`${formatBase(summary.recurringRevenue)} recurring`} />
        <Card label="Actual collected · net" value={formatBase(actualRevenue.allTime.net)} tone="muted"
          sub={`${formatBase(actualRevenue.thisMonth.net)} this month · real PAID rows`} />
      </div>

      {summary.unconverted.count > 0 && (
        <div className={styles.warn}>
          {summary.unconverted.count} entr{summary.unconverted.count === 1 ? "y is" : "ies are"} in a currency with no FX rate
          ({summary.unconverted.currencies.join(", ")}) and are excluded from the totals above. Add a rate below.
        </div>
      )}
      {msg && <div className={styles.msg}>{msg}</div>}

      {/* ── Reference: actual revenue ── */}
      <details className={styles.reference}>
        <summary className={styles.refSummary}>Actual revenue collected (from platform billing)</summary>
        <div className={styles.refGrid}>
          <RefStat label="All-time gross" value={formatBase(actualRevenue.allTime.gross)} />
          <RefStat label="All-time net (after fees)" value={formatBase(actualRevenue.allTime.net)} />
          <RefStat label="This month net" value={formatBase(actualRevenue.thisMonth.net)} />
          <RefStat label="Subscriptions (net)" value={formatBase(actualRevenue.subscriptionsNet)} />
          <RefStat label="Credit purchases (net)" value={formatBase(actualRevenue.creditsNet)} />
        </div>
        <p className={styles.refNote}>
          Read-only — summed from PAID SubscriptionCharge + CreditPurchase rows (₦). Reseller pool sales are collected
          off-platform and aren&apos;t captured here; add them as manual revenue if you want them counted.
        </p>
      </details>

      {/* ── Expenses ── */}
      <Section title="Expenses" kind="expense" rows={expenses} rates={rates} busy={busy}
        form={expForm} setForm={setExpForm}
        onAdd={() => addEntry("expense", expForm, () => setExpForm(blankForm()))}
        onToggle={toggleRecurring} onDelete={del} onEdit={editEntry} />

      {/* ── Revenue ── */}
      <Section title="Revenue (manual)" kind="revenue" rows={revenues} rates={rates} busy={busy}
        form={revForm} setForm={setRevForm}
        onAdd={() => addEntry("revenue", revForm, () => setRevForm(blankForm()))}
        onToggle={toggleRecurring} onDelete={del} onEdit={editEntry} />

      {/* ── FX rates ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Exchange rates (→ {BASE_CURRENCY})</div>
        <p className={styles.hint}>Base currency is {BASE_CURRENCY} (rate 1). Set how many {BASE_CURRENCY} equal 1 unit of each other currency.</p>
        <div className={styles.rateList}>
          {Object.keys(rates).length === 0 && <span className={styles.empty}>No rates set yet.</span>}
          {Object.entries(rates).map(([code, r]) => (
            <span key={code} className={styles.ratePill}>1 {code} = {formatBase(r)}</span>
          ))}
        </div>
        <div className={styles.rateForm}>
          <input className={styles.input} style={{ width: 90 }} placeholder="USD" value={rateCode}
            onChange={(e) => setRateCode(e.target.value.toUpperCase())} />
          <span className={styles.eq}>=</span>
          <input className={styles.input} style={{ width: 140 }} type="number" min={0} step="0.000001"
            placeholder={`${BASE_CURRENCY} per unit`} value={rateVal} onChange={(e) => setRateVal(e.target.value)} />
          <button className={styles.btn} onClick={saveRate} disabled={busy}>Save rate</button>
        </div>
      </div>
    </div>
  )
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "muted" }) {
  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={`${styles.cardValue} ${tone === "good" ? styles.good : tone === "bad" ? styles.bad : tone === "muted" ? styles.muted : ""}`}>{value}</span>
      {sub && <span className={styles.cardSub}>{sub}</span>}
    </div>
  )
}

function RefStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.refStat}>
      <span className={styles.refStatLabel}>{label}</span>
      <span className={styles.refStatValue}>{value}</span>
    </div>
  )
}

function Section({ title, kind, rows, rates, busy, form, setForm, onAdd, onToggle, onDelete, onEdit }: {
  title: string
  kind: FinanceKind
  rows: FinanceEntryDTO[]
  rates: RateMap
  busy: boolean
  form: FormState
  setForm: (f: FormState) => void
  onAdd: () => void
  onToggle: (e: FinanceEntryDTO) => void
  onDelete: (e: FinanceEntryDTO) => void
  onEdit: (id: string, patch: Record<string, unknown>) => Promise<boolean>
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v })

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(blankForm())
  const eset = <K extends keyof FormState>(k: K, v: FormState[K]) => setEditForm({ ...editForm, [k]: v })

  const startEdit = (e: FinanceEntryDTO) => {
    setEditId(e.id)
    setEditForm({
      label: e.label,
      amount: String(e.amount),
      currency: e.currency,
      recurring: e.recurring,
      note: e.note ?? "",
      incurredAt: e.incurredAt.slice(0, 10),
    })
  }
  const saveEdit = async (id: string) => {
    const amount = Math.floor(Number(editForm.amount))
    if (!editForm.label.trim() || !Number.isFinite(amount) || amount <= 0) return
    const ok = await onEdit(id, {
      label: editForm.label,
      amount,
      currency: editForm.currency,
      recurring: editForm.recurring,
      note: editForm.note,
      incurredAt: editForm.incurredAt,
    })
    if (ok) setEditId(null)
  }

  // Section total in the NGN base (rows we can't convert are excluded but flagged).
  let sectionTotal = 0
  let anyUnconverted = false
  for (const e of rows) {
    const b = toBase(e.amount, e.currency, rates)
    if (b === null) anyUnconverted = true
    else sectionTotal += b
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{kind === "expense" ? "Category" : "Source"}</th>
              <th className={styles.num}>Amount</th>
              <th className={styles.num}>In {BASE_CURRENCY}</th>
              <th>Recurring</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className={styles.empty}>Nothing yet — add a {kind} below.</td></tr>
            )}
            {rows.map((e) => {
              const base = toBase(e.amount, e.currency, rates)
              if (editId === e.id) {
                return (
                  <tr key={e.id}>
                    <td>
                      <input className={styles.input} style={{ width: "100%" }} value={editForm.label} onChange={(ev) => eset("label", ev.target.value)} />
                      <input className={styles.input} style={{ width: "100%", marginTop: 4 }} placeholder="Note (optional)" value={editForm.note} onChange={(ev) => eset("note", ev.target.value)} />
                    </td>
                    <td className={styles.num}>
                      <input className={styles.input} style={{ width: 90 }} type="number" min={1} step={1} value={editForm.amount} onChange={(ev) => eset("amount", ev.target.value)} />
                      <select className={styles.input} style={{ width: 72, marginTop: 4 }} value={editForm.currency} onChange={(ev) => eset("currency", ev.target.value)}>
                        {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className={styles.num}>—</td>
                    <td>
                      <label className={styles.check}>
                        <input type="checkbox" checked={editForm.recurring} onChange={(ev) => eset("recurring", ev.target.checked)} /> Monthly
                      </label>
                    </td>
                    <td><input className={styles.input} style={{ width: 130 }} type="date" value={editForm.incurredAt} onChange={(ev) => eset("incurredAt", ev.target.value)} /></td>
                    <td className={styles.rowActions}>
                      <button className={styles.btn} style={{ padding: "4px 10px" }} onClick={() => saveEdit(e.id)} disabled={busy}>Save</button>
                      <button className={styles.linkBtn} onClick={() => setEditId(null)} disabled={busy}>Cancel</button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={e.id}>
                  <td>
                    <div className={styles.rowLabel}>{e.label}</div>
                    {e.note && <div className={styles.rowNote}>{e.note}</div>}
                  </td>
                  <td className={styles.num}>{formatMoney(e.amount, e.currency)}</td>
                  <td className={styles.num}>{base === null ? <span className={styles.needRate}>no rate</span> : formatBase(base)}</td>
                  <td>
                    <button className={`${styles.tag} ${e.recurring ? styles.tagOn : styles.tagOff}`} onClick={() => onToggle(e)} disabled={busy} title="Toggle monthly recurring">
                      {e.recurring ? "Monthly" : "One-off"}
                    </button>
                  </td>
                  <td className={styles.date}>{e.incurredAt.slice(0, 10)}</td>
                  <td className={styles.rowActions}>
                    <button className={styles.editBtn} onClick={() => startEdit(e)} disabled={busy} title="Edit">✎</button>
                    <button className={styles.del} onClick={() => onDelete(e)} disabled={busy} title="Delete">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className={styles.totalRow}>
                <td>Total {kind === "expense" ? "expenses" : "revenue"} ({rows.length})</td>
                <td></td>
                <td className={styles.num}>
                  {formatBase(sectionTotal)}
                  {anyUnconverted && <span className={styles.needRate} title="Some rows have no FX rate and are excluded"> *</span>}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className={styles.addRow}>
        <input className={styles.input} style={{ flex: "1 1 160px" }} placeholder={kind === "expense" ? "Category (e.g. Hosting)" : "Source (e.g. Consulting)"}
          value={form.label} onChange={(e) => set("label", e.target.value)} />
        <input className={styles.input} style={{ width: 120 }} type="number" min={1} step={1} placeholder="Amount"
          value={form.amount} onChange={(e) => set("amount", e.target.value)} />
        <select className={styles.input} style={{ width: 90 }} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
          {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className={styles.check}>
          <input type="checkbox" checked={form.recurring} onChange={(e) => set("recurring", e.target.checked)} /> Monthly
        </label>
        <input className={styles.input} style={{ width: 140 }} type="date" value={form.incurredAt} onChange={(e) => set("incurredAt", e.target.value)} />
        <input className={styles.input} style={{ flex: "1 1 120px" }} placeholder="Note (optional)" value={form.note} onChange={(e) => set("note", e.target.value)} />
        <button className={styles.btn} onClick={onAdd} disabled={busy}>Add {kind}</button>
      </div>
    </div>
  )
}
