"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useToast } from "@/context/ToastContext"
import { PAYG_TIERS } from "@/lib/credits"
import { formatNaira } from "@/lib/plans"
import { useBrand } from "@/components/BrandProvider"
import styles from "./page.module.css"

interface BalanceResp {
  creditBalance: number
  creditsExpireAt: string | null
}

interface Purchase {
  id: string
  amountNaira: number
  creditsAdded: number
  reference: string
  status: "PENDING" | "PAID" | "CANCELLED"
  createdAt: string
  completedAt: string | null
  expiresAt: string
}

function formatCredits(n: number): string {
  return n.toLocaleString("en-NG")
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "No top-ups yet"
  const d = new Date(iso)
  return d.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
}

function CreditsPageInner() {
  const brand = useBrand()
  const params = useSearchParams()
  const router = useRouter()
  const { showToast } = useToast()
  const [balance, setBalance] = useState<BalanceResp | null>(null)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [pickedAmount, setPickedAmount] = useState<number | null>(20000) // headline tier preselected
  const [buying, setBuying] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      const [bRes, hRes] = await Promise.all([
        fetch("/api/credits/balance", { cache: "no-store" }),
        fetch("/api/credits/history", { cache: "no-store" }),
      ])
      if (bRes.ok) setBalance(await bRes.json())
      if (hRes.ok) setPurchases((await hRes.json()).purchases ?? [])
    } catch {
      /* shown via toast on the buy flow; idle fetch failures are silent */
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // After returning from Paystack: ?ref=... is on the URL. Show a feedback
  // toast based on the purchase status (the webhook may have already
  // transitioned the row). Poll briefly so a delayed webhook still surfaces.
  useEffect(() => {
    const ref = params.get("ref")
    if (!ref) return
    let cancelled = false
    let attempts = 0
    const poll = async () => {
      attempts++
      const res = await fetch("/api/credits/history", { cache: "no-store" })
      if (!res.ok || cancelled) return
      const list = (await res.json()).purchases as Purchase[] | undefined
      const match = list?.find((p) => p.reference === ref)
      if (match?.status === "PAID") {
        showToast(`${formatCredits(match.creditsAdded)} credits added to your wallet 🎉`)
        loadAll()
        router.replace("/dashboard/credits")
        return
      }
      if (attempts < 6 && !cancelled) {
        // ~12s of polling for the webhook to land
        setTimeout(poll, 2000)
      } else {
        // No PAID transition after the window — likely cancelled / failed.
        showToast("Payment didn't complete. Try again or contact support.", "error")
        router.replace("/dashboard/credits")
      }
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [params, router, showToast, loadAll])

  const handleBuy = async () => {
    if (!pickedAmount) return
    setBuying(true)
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountNaira: pickedAmount }),
      })
      const data = await res.json()
      if (!res.ok || !data.authorizationUrl) {
        showToast(data.error ?? "Could not start payment. Please try again.", "error")
        setBuying(false)
        return
      }
      window.location.href = data.authorizationUrl
    } catch {
      showToast("Network error. Please try again.", "error")
      setBuying(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Credits</h1>
        <p className={styles.subtitle}>
          Top up your wallet for AI usage. Credits drain only after your monthly plan allowance is exhausted —
          and never expire as long as you keep using {brand.appName} (top-up extends the wallet by 12 months).
        </p>
      </header>

      <section className={styles.balanceCard}>
        <div className={styles.balanceLabel}>Wallet balance</div>
        <div className={styles.balanceValue}>
          {balance ? formatCredits(balance.creditBalance) : "—"}
          <span className={styles.balanceUnit}>credits</span>
        </div>
        <div className={styles.balanceExpiry}>
          {balance?.creditsExpireAt
            ? `Valid until ${formatExpiry(balance.creditsExpireAt)}`
            : "Add credits to start your 12-month wallet window"}
        </div>
      </section>

      <section className={styles.tierSection}>
        <h2 className={styles.sectionTitle}>Choose a pack</h2>
        <div className={styles.tierGrid}>
          {PAYG_TIERS.map((t) => {
            const picked = pickedAmount === t.amountNaira
            return (
              <button
                key={t.amountNaira}
                type="button"
                className={`${styles.tier} ${picked ? styles.tierPicked : ""}`}
                onClick={() => setPickedAmount(t.amountNaira)}
              >
                <div className={styles.tierAmount}>{formatNaira(t.amountNaira)}</div>
                <div className={styles.tierCredits}>{formatCredits(t.credits)} credits</div>
                <div className={styles.tierRate}>₦{t.ngnPerCredit.toFixed(2)} / credit</div>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={styles.buyBtn}
          onClick={handleBuy}
          disabled={buying || !pickedAmount}
        >
          {buying ? "Redirecting to Paystack…" : `Pay ${formatNaira(pickedAmount ?? 0)}`}
        </button>
        <p className={styles.payNote}>
          Secure checkout via Paystack. You'll be redirected and brought back automatically when payment completes.
        </p>
      </section>

      <section className={styles.historySection}>
        <h2 className={styles.sectionTitle}>Receipts</h2>
        {purchases.length === 0 ? (
          <p className={styles.empty}>No top-ups yet.</p>
        ) : (
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Credits</th>
                <th>Status</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.createdAt).toLocaleString("en-NG")}</td>
                  <td>{formatNaira(p.amountNaira)}</td>
                  <td>{formatCredits(p.creditsAdded)}</td>
                  <td>
                    <span className={`${styles.statusPill} ${styles[`status_${p.status}`]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className={styles.refCell}>{p.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<div className={styles.page}>Loading…</div>}>
      <CreditsPageInner />
    </Suspense>
  )
}
