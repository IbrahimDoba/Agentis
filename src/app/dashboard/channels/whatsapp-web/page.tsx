"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import QRCode from "qrcode"
import { Modal } from "@/components/ui/Modal"
import Button from "@/components/ui/Button"
import styles from "./page.module.css"

const PAIRING_COUNTRIES = [
  { code: "NG", name: "Nigeria", dialCode: "234" },
  { code: "GH", name: "Ghana", dialCode: "233" },
  { code: "KE", name: "Kenya", dialCode: "254" },
  { code: "ZA", name: "South Africa", dialCode: "27" },
  { code: "UG", name: "Uganda", dialCode: "256" },
  { code: "TZ", name: "Tanzania", dialCode: "255" },
  { code: "RW", name: "Rwanda", dialCode: "250" },
  { code: "GB", name: "United Kingdom", dialCode: "44" },
  { code: "US", name: "United States", dialCode: "1" },
  { code: "CA", name: "Canada", dialCode: "1" },
  { code: "AE", name: "United Arab Emirates", dialCode: "971" },
  { code: "IN", name: "India", dialCode: "91" },
] as const

const DEFAULT_PAIRING_COUNTRY = "NG"
const PAIRING_COUNTRY_STORAGE_KEY = "dzero.pairing-country"

interface Agent {
  id: string
  businessName: string
  elevenlabsAgentId: string | null
  status: string
  transportType: string
}

interface SessionStatus {
  id: string
  agentId: string
  phoneNumber: string | null
  status: "DISCONNECTED" | "QR_PENDING" | "CONNECTING" | "CONNECTED" | "LOGGED_OUT" | "BANNED"
  warmupTier: number
  warmupStartedAt: string | null
  dailyMessageCount: number
  lastConnectedAt: string | null
  lastDisconnectReason: string | null
}

async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch("/api/agents")
  if (!res.ok) throw new Error("Failed to fetch agents")
  const data = await res.json()
  return Array.isArray(data) ? data : (data.agents ?? [])
}

async function fetchSession(agentId: string): Promise<SessionStatus | null> {
  const res = await fetch(`/api/baileys/sessions/${agentId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error("Failed to fetch session")
  return res.json()
}

const TIER_MAX_PER_DAY: Record<number, number> = { 1: 40, 2: 150, 3: 400, 4: 1500 }

function tierLabel(tier: number) {
  const labels: Record<number, string> = { 1: "Warmup", 2: "Starter", 3: "Growth", 4: "Full" }
  return labels[tier] ?? `Tier ${tier}`
}

function tierDaysRemaining(tier: number, startedAt: string | null): number | null {
  if (!startedAt || tier >= 4) return null
  const required = [3, 7, 21][tier - 1] ?? 0
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(required - elapsed))
}

/**
 * True when WhatsApp invalidated the session (401 loggedOut, 440 connectionReplaced).
 * In those cases the worker auto-purges the auth files, so "Reconnect" cannot reuse
 * the old session — a fresh QR scan is required. Used to drive different copy +
 * button label so the user understands why a QR is about to appear.
 */
function isSessionExpired(reason: string | null | undefined): boolean {
  if (!reason) return false
  const lower = reason.toLowerCase()
  return (
    lower.includes("401") ||
    lower.includes("440") ||
    lower.includes("logged out") ||
    lower.includes("loggedout") ||
    lower.includes("connection replaced") ||
    lower.includes("connectionreplaced")
  )
}

export default function WhatsAppWebPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  // Onboarding mode: user landed here from /onboarding's final step. The
  // query string carries the freshly-created agent id; we pre-select it,
  // and on successful link we redirect to /onboarding/auto-configure to
  // continue the auto-configure flow (history sync + LLM draft + review).
  const onboardingMode = searchParams.get("onboarding") === "1"
  const onboardingAgentId = searchParams.get("agentId")
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(onboardingAgentId)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [sseStatus, setSseStatus] = useState<string | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const [connectMethod, setConnectMethod] = useState<"qr" | "code">("qr")
  const [pairingCountryCode, setPairingCountryCode] = useState<string>(DEFAULT_PAIRING_COUNTRY)
  const [pairingPhone, setPairingPhone] = useState("")
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<number>(1)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const selectedPairingCountry = PAIRING_COUNTRIES.find((country) => country.code === pairingCountryCode) ?? PAIRING_COUNTRIES[0]

  function normalizeLocalPhone(value: string) {
    return value.replace(/\D/g, "").replace(/^0+/, "")
  }

  function buildPairingNumber() {
    return `${selectedPairingCountry.dialCode}${normalizeLocalPhone(pairingPhone)}`
  }

  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: fetchAgents })
  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ["baileys-session", selectedAgentId],
    queryFn: () => fetchSession(selectedAgentId!),
    enabled: !!selectedAgentId,
    refetchInterval: 5000,
  })

  const connect = useMutation({
    mutationFn: async ({ agentId, initialTier }: { agentId: string; initialTier: number }) => {
      const res = await fetch("/api/baileys/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, initialTier }),
      })
      if (!res.ok) throw new Error("Failed to start session")
      return res.json()
    },
    onSuccess: () => {
      setActionError(null)
      refetchSession()
      if (connectMethod === "qr") startQrStream(selectedAgentId!)
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const changeTier = useMutation({
    mutationFn: async ({ agentId, tier }: { agentId: string; tier: number }) => {
      const res = await fetch(`/api/baileys/sessions/${agentId}/tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      })
      if (!res.ok) throw new Error("Failed to update tier")
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["baileys-session", selectedAgentId] })
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const requestPairingCode = useMutation({
    mutationFn: async ({ agentId, phoneNumber }: { agentId: string; phoneNumber: string }) => {
      const res = await fetch(`/api/baileys/sessions/${agentId}/pairing-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(err.error ?? err.message ?? `Request failed (${res.status})`)
      }
      return res.json() as Promise<{ code: string }>
    },
    onSuccess: (data) => { setActionError(null); setPairingCode(data.code) },
    onError: (err: Error) => setActionError(err.message),
  })

  const disconnect = useMutation({
    mutationFn: async (agentId: string) => {
      // Disconnect stops the socket but preserves auth files + warmup tier
      const res = await fetch(`/api/baileys/sessions/${agentId}/disconnect`, { method: "POST" })
      if (!res.ok && res.status !== 404) throw new Error(`Worker error ${res.status} — try again`)
    },
    onSuccess: () => {
      setActionError(null)
      stopQrStream()
      setQrDataUrl(null)
      setSseStatus(null)
      setPairingCode(null)
      qc.invalidateQueries({ queryKey: ["baileys-session", selectedAgentId] })
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const remove = useMutation({
    mutationFn: async (agentId: string) => {
      // Full wipe: stops socket, deletes auth files, removes DB record
      const res = await fetch(`/api/baileys/sessions/${agentId}`, { method: "DELETE" })
      if (!res.ok && res.status !== 404) throw new Error(`Worker error ${res.status} — try again`)
    },
    onSuccess: () => {
      setActionError(null)
      setConfirmRemove(false)
      stopQrStream()
      setQrDataUrl(null)
      setSseStatus(null)
      setPairingCode(null)
      setSelectedTier(1)
      qc.invalidateQueries({ queryKey: ["baileys-session", selectedAgentId] })
    },
    onError: (err: Error) => {
      setConfirmRemove(false)
      setActionError(err.message)
    },
  })

  const restart = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await fetch(`/api/baileys/sessions/${agentId}/restart`, { method: "POST" })
      if (!res.ok) throw new Error(`Worker error ${res.status} — try again`)
    },
    onSuccess: () => {
      setActionError(null)
      setPairingCode(null)
      refetchSession()
      if (connectMethod === "qr") startQrStream(selectedAgentId!)
    },
    onError: (err: Error) => setActionError(err.message),
  })

  function stopQrStream() {
    sseRef.current?.close()
    sseRef.current = null
  }

  function startQrStream(agentId: string) {
    stopQrStream()
    const es = new EventSource(`/api/baileys/sessions/${agentId}/qr`)

    es.addEventListener("qr", async (e) => {
      const { qr } = JSON.parse(e.data)
      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 })
        setQrDataUrl(dataUrl)
        setSseStatus("qr")
      }
    })

    es.addEventListener("status", (e) => {
      const { status } = JSON.parse(e.data)
      setSseStatus(status)
      if (status === "connected") {
        setQrDataUrl(null)
        stopQrStream()
        refetchSession()
      }
    })

    es.onerror = () => stopQrStream()
    sseRef.current = es
  }

  useEffect(() => {
    if (session?.status === "QR_PENDING" && selectedAgentId && !sseRef.current && connectMethod === "qr") {
      startQrStream(selectedAgentId)
    }
    if (session?.status === "CONNECTED") {
      stopQrStream()
      setQrDataUrl(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, selectedAgentId, connectMethod])

  useEffect(() => () => stopQrStream(), [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const savedCountry = window.localStorage.getItem(PAIRING_COUNTRY_STORAGE_KEY)
    if (savedCountry && PAIRING_COUNTRIES.some((country) => country.code === savedCountry)) {
      setPairingCountryCode(savedCountry)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(PAIRING_COUNTRY_STORAGE_KEY, pairingCountryCode)
  }, [pairingCountryCode])

  // Clear pairing code only when agent changes or session connects successfully
  useEffect(() => {
    if (!selectedAgentId) setPairingCode(null)
  }, [selectedAgentId])

  useEffect(() => {
    if (session?.status === "CONNECTED") setPairingCode(null)
  }, [session?.status])

  // Onboarding bounce: once WhatsApp links successfully during onboarding, send
  // them to the success screen (confetti + "agent connected"). Small delay so
  // the "Connected" UI flashes before we navigate.
  // NOTE: the old chat-scan auto-configure step is disabled — we no longer
  // bounce to /onboarding/auto-configure. That route + AutoConfigureClient are
  // kept in the repo (dormant) in case we want to revive them.
  useEffect(() => {
    if (!onboardingMode) return
    if (session?.status !== "CONNECTED") return
    if (!selectedAgentId) return
    const id = setTimeout(() => {
      router.push(`/onboarding/connected?agentId=${selectedAgentId}`)
    }, 800)
    return () => clearTimeout(id)
  }, [onboardingMode, session?.status, selectedAgentId, router])

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)
  const isConnected = session?.status === "CONNECTED"
  const isConnecting = session?.status === "QR_PENDING" || session?.status === "CONNECTING"
  const isBanned = session?.status === "BANNED"
  const wasConnected = session?.status === "DISCONNECTED" && !!session?.phoneNumber
  const sessionExpired = wasConnected && isSessionExpired(session?.lastDisconnectReason)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>WhatsApp Web</h1>
          <p className={styles.subtitle}>Connect any WhatsApp number to your AI agent in seconds</p>
        </div>
        <Link href="/dashboard/channels/whatsapp-web/guide" className={styles.guideLink}>
          📖 Guide
        </Link>
      </div>

      {/* Disclaimer */}
      <div className={styles.disclaimer}>
        <div>
          Uses WhatsApp&apos;s Linked Devices feature. For enterprise-grade reliability,{" "}
          <a href="/contact" className={styles.disclaimerLink}>contact us</a> about our WhatsApp Business API tier.
        </div>
      </div>

      <div className={styles.layout}>
        {/* Agent selector */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>Your Agents</div>
          </div>
          <div className={styles.agentList}>
            {agents.length === 0 && (
              <p className={styles.empty}>No agents found. <Link href="/dashboard/agent/create">Create one first.</Link></p>
            )}
            {agents.map((agent) => (
              <button
                key={agent.id}
                className={`${styles.agentRow} ${selectedAgentId === agent.id ? styles.agentRowActive : ""}`}
                onClick={() => setSelectedAgentId(agent.id)}
              >
                <div className={styles.agentAvatar}>
                  {agent.businessName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className={styles.agentName}>{agent.businessName}</div>
                  <div className={styles.agentTransport}>WhatsApp Web</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Connection panel */}
        <div className={styles.card}>
          {!selectedAgentId ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📱</div>
              <div>Select an agent from the left to get started</div>
            </div>
          ) : (
            <>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>{selectedAgent?.businessName}</div>
              </div>
              <div className={styles.cardBody}>
              {/* Status pill */}
              <div style={{ marginBottom: "1.25rem" }}>
                <span className={`${styles.statusPill} ${
                  isBanned ? styles.statusPillBanned
                  : isConnected ? styles.statusPillConnected
                  : isConnecting ? styles.statusPillPending
                  : styles.statusPillOff
                }`}>
                  <span className={`${styles.statusDot} ${
                    isBanned ? styles.statusDotBanned
                    : isConnected ? styles.statusDotConnected
                    : isConnecting ? styles.statusDotPending
                    : styles.statusDotOff
                  }`} />
                  {isBanned ? "Banned"
                    : isConnected ? "Connected"
                    : isConnecting ? "Connecting"
                    : "Not connected"}
                </span>
                {isConnected && session?.phoneNumber && (
                  <div className={styles.statusSubtext}>+{session.phoneNumber}</div>
                )}
                {!isConnected && !isConnecting && session?.lastDisconnectReason && (
                  <div className={styles.statusSubtext}>{session.lastDisconnectReason}</div>
                )}
                {isConnecting && connectMethod === "code" && (
                  <div className={styles.statusSubtext}>Waiting for pairing code entry…</div>
                )}
              </div>

              {connectMethod === "qr" && qrDataUrl && (
                <div className={styles.qrWrap}>
                  <Image src={qrDataUrl} alt="WhatsApp QR Code" width={256} height={256} className={styles.qr} unoptimized />
                  <p className={styles.qrHint}>Open WhatsApp → Linked Devices → Link a device → scan</p>
                </div>
              )}

              {connectMethod === "qr" && isConnecting && !qrDataUrl && (
                <div className={styles.loadingQr}>
                  <div className={styles.loadingQrSpinner} />
                  <div className={styles.loadingQrTitle}>Generating QR code…</div>
                  <div className={styles.loadingQrHint}>This can take 1–3 minutes. Please keep this page open and wait.</div>
                </div>
              )}

              {(!wasConnected && (!session || session.status === "DISCONNECTED" || session.status === "LOGGED_OUT")) && (
                <div className={styles.ageSection}>
                  <div className={styles.ageLabel}>How old is this number?</div>
                  <div className={styles.ageOptions}>
                    {[
                      { tier: 1, title: "New number", desc: "Less than 1 month old" },
                      { tier: 2, title: "Personal number", desc: "1–6 months, some contacts saved" },
                      { tier: 3, title: "Business number", desc: "6+ months, regular usage" },
                      { tier: 4, title: "Established number", desc: "1+ year, heavy usage history" },
                    ].map((opt) => (
                      <button
                        key={opt.tier}
                        className={`${styles.ageOption} ${selectedTier === opt.tier ? styles.ageOptionActive : ""}`}
                        onClick={() => setSelectedTier(opt.tier)}
                      >
                        <span className={styles.ageOptionTier}>T{opt.tier}</span>
                        <span className={styles.ageOptionText}>
                          <span className={styles.ageOptionTitle}>{opt.title}</span>
                          <span className={styles.ageOptionDesc}>{opt.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(!wasConnected && (!session || session.status === "DISCONNECTED" || session.status === "LOGGED_OUT")) && (
                <div className={styles.methodToggle}>
                  <button
                    className={`${styles.methodBtn} ${connectMethod === "qr" ? styles.methodBtnActive : ""}`}
                    onClick={() => setConnectMethod("qr")}
                  >QR Code</button>
                  <button
                    className={`${styles.methodBtn} ${connectMethod === "code" ? styles.methodBtnActive : ""}`}
                    onClick={() => setConnectMethod("code")}
                  >Phone Number</button>
                </div>
              )}

              {!wasConnected && connectMethod === "code" && (
                <div className={styles.pairingWrap}>
                  {pairingCode ? (
                    <div className={styles.pairingCode}>
                      <div className={styles.pairingCodeLabel}>Enter this code in WhatsApp</div>
                      <div className={styles.pairingCodeValue}>{pairingCode}</div>
                      <div className={styles.pairingCodeHint}>
                        WhatsApp → Linked Devices → Link a device → Link with phone number instead
                      </div>
                    </div>
                  ) : (!session || session.status === "DISCONNECTED" || session.status === "LOGGED_OUT") ? (
                    <div className={styles.pairingInput}>
                      <div className={styles.pairingField}>
                        <label className={styles.pairingLabel} htmlFor="pairing-country">
                          Country
                        </label>
                        <select
                          id="pairing-country"
                          className={styles.countrySelect}
                          value={pairingCountryCode}
                          onChange={(e) => setPairingCountryCode(e.target.value)}
                        >
                          {PAIRING_COUNTRIES.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.name} (+{country.dialCode})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.pairingField}>
                        <label className={styles.pairingLabel} htmlFor="pairing-phone">
                          Phone number
                        </label>
                        <div className={styles.phoneInputRow}>
                          <span className={styles.countryCodeBadge}>+{selectedPairingCountry.dialCode}</span>
                          <input
                            id="pairing-phone"
                            className={styles.phoneInput}
                            type="tel"
                            inputMode="numeric"
                            placeholder="8012345678"
                            value={pairingPhone}
                            onChange={(e) => setPairingPhone(normalizeLocalPhone(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {actionError && (
                <div className={styles.errorBanner}>
                  {actionError}
                  <button className={styles.errorDismiss} onClick={() => setActionError(null)}>✕</button>
                </div>
              )}

              <div className={styles.actions}>
                {wasConnected ? (
                  <div>
                    {sessionExpired ? (
                      <div className={styles.prevConnection}>
                        <strong>Session expired by WhatsApp.</strong> Your phone unlinked the device or the session timed out. Scan a fresh QR to relink <strong>+{session!.phoneNumber}</strong>.
                      </div>
                    ) : (
                      <div className={styles.prevConnection}>
                        Previously connected: <strong>+{session!.phoneNumber}</strong>
                      </div>
                    )}
                    <div className={styles.actionGroup}>
                      <button
                        className={styles.btnSecondary}
                        style={{ flex: 2 }}
                        onClick={() => restart.mutate(selectedAgentId)}
                        disabled={restart.isPending}
                      >
                        {restart.isPending
                          ? (sessionExpired ? "Loading QR…" : "Reconnecting…")
                          : (sessionExpired ? "Scan New QR" : "Reconnect")}
                      </button>
                      <button
                        className={styles.btnDanger}
                        onClick={() => setConfirmRemove(true)}
                        disabled={remove.isPending}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : !session || session.status === "DISCONNECTED" || session.status === "LOGGED_OUT" ? (
                  connectMethod === "code" && !pairingCode ? (
                    <button
                      className={styles.btnPrimary}
                      onClick={async () => {
                        try {
                          const needsCreate = !session || session.status === "DISCONNECTED" || session.status === "LOGGED_OUT"
                          if (needsCreate) await connect.mutateAsync({ agentId: selectedAgentId!, initialTier: selectedTier })
                          requestPairingCode.mutate({ agentId: selectedAgentId!, phoneNumber: buildPairingNumber() })
                        } catch {
                          // connect.onError already sets actionError
                        }
                      }}
                      disabled={connect.isPending || requestPairingCode.isPending || !normalizeLocalPhone(pairingPhone)}
                    >
                      {connect.isPending || requestPairingCode.isPending ? "Getting code…" : "Get Pairing Code"}
                    </button>
                  ) : connectMethod === "qr" ? (
                    <button
                      className={styles.btnPrimary}
                      onClick={() => connect.mutate({ agentId: selectedAgentId!, initialTier: selectedTier })}
                      disabled={connect.isPending}
                    >
                      {connect.isPending ? "Starting…" : "Connect WhatsApp"}
                    </button>
                  ) : null
                ) : isBanned ? (
                  <button
                    className={styles.btnDanger}
                    onClick={() => setConfirmRemove(true)}
                    disabled={remove.isPending}
                  >
                    Remove session
                  </button>
                ) : (
                  <div className={styles.actionGroup}>
                    {!isConnected && (
                      <button
                        className={styles.btnSecondary}
                        onClick={() => restart.mutate(selectedAgentId)}
                        disabled={restart.isPending}
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      className={styles.btnDanger}
                      onClick={() => disconnect.mutate(selectedAgentId)}
                      disabled={disconnect.isPending}
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>

              {!isConnected && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "rgba(0, 220, 130, 0.06)",
                    border: "1px solid rgba(0, 220, 130, 0.25)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--text-secondary, #6b7280)",
                  }}
                >
                  🔒 <strong style={{ color: "var(--text, #111111)" }}>Your data is safe.</strong> We connect to your
                  WhatsApp over an encrypted connection and use your conversations <em>only</em> to run your AI agent —
                  never to advertise, never sold, never shared with other businesses. Access is tightly restricted and
                  protected under our{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#00dc82", fontWeight: 600, textDecoration: "none" }}
                  >
                    Privacy Policy
                  </a>
                  .
                </div>
              )}

              {session && isConnected && (() => {
                const maxPerDay = TIER_MAX_PER_DAY[Number(session.warmupTier)] ?? 40
                const used = session.dailyMessageCount
                const pct = Math.min(100, Math.round((used / maxPerDay) * 100))
                const isWarning = pct >= 75 && pct < 100
                const isDanger = pct >= 100
                const daysLeft = tierDaysRemaining(session.warmupTier, session.warmupStartedAt)
                return (
                  <div className={styles.health}>
                    <div className={styles.healthTitle}>Session Health</div>
                    <div className={styles.healthGrid}>
                      <div className={styles.healthItem}>
                        <select
                          className={styles.tierSelect}
                          value={session.warmupTier}
                          onChange={(e) => changeTier.mutate({ agentId: selectedAgentId!, tier: Number(e.target.value) })}
                          disabled={changeTier.isPending}
                        >
                          <option value={1}>Warmup (T1)</option>
                          <option value={2}>Starter (T2)</option>
                          <option value={3}>Growth (T3)</option>
                          <option value={4}>Full (T4)</option>
                        </select>
                        <div className={styles.healthLbl}>Warmup tier</div>
                      </div>
                      <div className={styles.healthItem}>
                        <div className={styles.healthVal}>{daysLeft !== null ? `${daysLeft}d` : "—"}</div>
                        <div className={styles.healthLbl}>To next tier</div>
                      </div>
                      <div className={styles.healthItem}>
                        <div className={styles.healthVal}>
                          {session.lastConnectedAt
                            ? new Date(session.lastConnectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                            : "—"}
                        </div>
                        <div className={styles.healthLbl}>Since</div>
                      </div>
                    </div>

                    <div className={styles.capSection}>
                      <div className={styles.capHeader}>
                        <span className={styles.capLabel}>Messages today</span>
                        <span className={styles.capCount}>{used} / {maxPerDay}</span>
                      </div>
                      <div className={styles.capTrack}>
                        <div
                          className={`${styles.capFill} ${isDanger ? styles.capFillDanger : isWarning ? styles.capFillWarning : styles.capFillNormal}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {isDanger && (
                        <div className={styles.capDanger}>Daily cap reached — messages will resume tomorrow</div>
                      )}
                      {isWarning && (
                        <div className={styles.capWarning}>Approaching daily limit ({maxPerDay - used} remaining)</div>
                      )}
                    </div>
                  </div>
                )
              })()}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={confirmRemove}
        onClose={() => !remove.isPending && setConfirmRemove(false)}
        title="Remove WhatsApp connection?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => selectedAgentId && remove.mutate(selectedAgentId)}
              loading={remove.isPending}
            >
              Remove
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          This will fully unlink{" "}
          <strong style={{ color: "var(--text-primary)" }}>
            {selectedAgent?.businessName}
          </strong>
          {session?.phoneNumber ? <> from <strong style={{ color: "var(--text-primary)" }}>+{session.phoneNumber}</strong></> : ""}.
          Auth data and warmup tier will be wiped — you&apos;ll need to scan the QR code again to reconnect.
        </p>
      </Modal>
    </div>
  )
}
