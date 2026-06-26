"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

// Reseller manually adds/deducts a customer's credits. "Add" draws from her
// pool; "Deduct" consumes from the customer's wallet (e.g. paying for an
// off-platform service in credits).
export default function CreditAdjuster({ userId }: { userId: string }) {
  const router = useRouter()
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState<"add" | "deduct" | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const submit = async (action: "add" | "deduct") => {
    const amt = Math.floor(Number(amount))
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg({ text: "Enter a positive amount of credits", ok: false })
      return
    }
    setBusy(action)
    setMsg(null)
    try {
      const res = await fetch(`/api/reseller/users/${userId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amount: amt }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({
          text: `${action === "add" ? "Added" : "Deducted"} ${amt.toLocaleString()} credits — new balance ${data.newBalance.toLocaleString()}.`,
          ok: true,
        })
        setAmount("")
        router.refresh()
      } else {
        setMsg({ text: data.error || "Couldn't adjust credits", ok: false })
      }
    } catch {
      setMsg({ text: "Couldn't adjust credits", ok: false })
    } finally {
      setBusy(null)
    }
  }

  const card: React.CSSProperties = { border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 18, background: "var(--bg-secondary, #fff)" }
  const input: React.CSSProperties = { border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "9px 11px", fontSize: 14, width: 160 }
  const btn = (bg: string): React.CSSProperties => ({ border: "none", background: bg, color: "#fff", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" })

  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Adjust credits</div>
      <p style={{ color: "var(--text-secondary, #71717a)", fontSize: 13, margin: "0 0 12px" }}>
        Add credits (drawn from your pool) or deduct them — e.g. to charge for an off-platform service like a logo design.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={input}
        />
        <button type="button" disabled={busy !== null} onClick={() => submit("add")} style={{ ...btn("var(--accent, #16a34a)"), opacity: busy ? 0.7 : 1 }}>
          {busy === "add" ? "Adding…" : "Add"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => submit("deduct")} style={{ ...btn("#b91c1c"), opacity: busy ? 0.7 : 1 }}>
          {busy === "deduct" ? "Deducting…" : "Deduct"}
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, padding: "9px 13px", borderRadius: 10, color: msg.ok ? "#166534" : "#991b1b", background: msg.ok ? "#dcfce7" : "#fee2e2" }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
