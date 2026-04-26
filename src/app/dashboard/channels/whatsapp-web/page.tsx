"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Image from "next/image"
import Link from "next/link"
import QRCode from "qrcode"
import styles from "./page.module.css"

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

export default function WhatsAppWebPage() {
  const qc = useQueryClient()
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [sseStatus, setSseStatus] = useState<string | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const [connectMethod, setConnectMethod] = useState<"qr" | "code">("qr")
  const [pairingPhone, setPairingPhone] = useState("")
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<number>(1)

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

  // Clear pairing code only when agent changes or session connects successfully
  useEffect(() => {
    if (!selectedAgentId) setPairingCode(null)
  }, [selectedAgentId])

  useEffect(() => {
    if (session?.status === "CONNECTED") setPairingCode(null)
  }, [session?.status])

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)
  const isConnected = session?.status === "CONNECTED"
  const isConnecting = session?.status === "QR_PENDING" || session?.status === "CONNECTING"
  const isBanned = session?.status === "BANNED"
  const wasConnected = session?.status === "DISCONNECTED" && !!session?.phoneNumber

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
        <span className={styles.disclaimerIcon}>⚠️</span>
        <div>
          <strong>WhatsApp Web integration uses WhatsApp&apos;s Linked Devices feature.</strong>{" "}
          This is not the official WhatsApp Business API. WhatsApp may disconnect or ban numbers
          that use automation. D-Zero AI applies conservative pacing to minimise risk, but we cannot
          guarantee against suspension. If your use case requires production-grade reliability,{" "}
          <a href="/contact" className={styles.disclaimerLink}>contact our team</a> to be onboarded
          onto the WhatsApp Business API tier.
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
              <p className={styles.empty}>No agents found. <a href="/dashboard/agent/create">Create one first.</a></p>
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
                <div className={styles.loadingQr}>Generating QR code…</div>
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
                      <input
                        className={styles.phoneInput}
                        type="tel"
                        placeholder="e.g. 2348012345678"
                        value={pairingPhone}
                        onChange={(e) => setPairingPhone(e.target.value)}
                      />
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
                    <div className={styles.prevConnection}>
                      Previously connected: <strong>+{session!.phoneNumber}</strong>
                    </div>
                    <div className={styles.actionGroup}>
                      <button
                        className={styles.btnSecondary}
                        style={{ flex: 2 }}
                        onClick={() => restart.mutate(selectedAgentId)}
                        disabled={restart.isPending}
                      >
                        {restart.isPending ? "Reconnecting…" : "Reconnect"}
                      </button>
                      <button
                        className={styles.btnDanger}
                        onClick={() => disconnect.mutate(selectedAgentId)}
                        disabled={disconnect.isPending}
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
                          requestPairingCode.mutate({ agentId: selectedAgentId!, phoneNumber: pairingPhone })
                        } catch {
                          // connect.onError already sets actionError
                        }
                      }}
                      disabled={connect.isPending || requestPairingCode.isPending || !pairingPhone}
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
                  <button className={styles.btnDanger} onClick={() => disconnect.mutate(selectedAgentId)}>
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

              {session && isConnected && (() => {
                const maxPerDay = TIER_MAX_PER_DAY[session.warmupTier] ?? 40
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
    </div>
  )
}
