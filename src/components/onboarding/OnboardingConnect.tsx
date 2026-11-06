"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import QRCode from "qrcode"
import { useBrand } from "@/components/BrandProvider"
import { AUTO_BUILD_WAITING } from "@/lib/autoBuild"
import { PAIRING_COUNTRIES } from "@/lib/pairingCountries"
import flow from "./OnboardingFlow.module.css"
import styles from "./OnboardingConnect.module.css"

// A new number starts on tier 4 so AI replies aren't held back by warmup delays.
// Large broadcasts are limited separately for its first days (see warmup.ts).
const NEW_NUMBER_TIER = 4
const SESSION_POLL_MS = 3_000
const BUILD_POLL_MS = 1_500
const QR_RECONNECT_MS = 3_000

interface Props {
  agentId: string
  autoBuild: boolean
}

async function fetchSessionStatus(agentId: string): Promise<string | null> {
  const res = await fetch(`/api/baileys/sessions/${agentId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error("Failed to fetch session")
  const data = (await res.json()) as { status: string }
  return data.status
}

export function OnboardingConnect({ agentId, autoBuild }: Props) {
  const brand = useBrand()
  const router = useRouter()
  const [method, setMethod] = useState<"qr" | "code">("qr")
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [streamAttempt, setStreamAttempt] = useState(0)
  const [countryCode, setCountryCode] = useState<string>(PAIRING_COUNTRIES[0].code)
  const [phone, setPhone] = useState("")
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<EventSource | null>(null)
  const started = useRef(false)

  const { data: status, isFetched, refetch } = useQuery({
    queryKey: ["onboarding-session", agentId],
    queryFn: () => fetchSessionStatus(agentId),
    refetchInterval: SESSION_POLL_MS,
  })
  const connected = status === "CONNECTED"

  const startSession = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/baileys/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, initialTier: NEW_NUMBER_TIER }),
      })
      if (!res.ok) throw new Error("Couldn't start the connection. Please try again.")
    },
    onSuccess: () => {
      setError(null)
      refetch()
    },
    onError: (err: Error) => {
      started.current = false
      setError(err.message)
    },
  })
  const startSessionNow = startSession.mutate

  // Show the QR straight away, with nothing to click first.
  useEffect(() => {
    if (!isFetched || started.current) return
    if (status && status !== "DISCONNECTED" && status !== "LOGGED_OUT") return
    started.current = true
    startSessionNow()
  }, [isFetched, status, startSessionNow])

  const stopStream = useCallback(() => {
    streamRef.current?.close()
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (status !== "QR_PENDING" || method !== "qr" || streamRef.current) return
    const es = new EventSource(`/api/baileys/sessions/${agentId}/qr`)
    es.addEventListener("qr", async (e) => {
      const { qr } = JSON.parse((e as MessageEvent).data)
      if (qr) setQrDataUrl(await QRCode.toDataURL(qr, { width: 256, margin: 2 }))
    })
    es.onerror = () => {
      stopStream()
      setTimeout(() => setStreamAttempt((n) => n + 1), QR_RECONNECT_MS)
    }
    streamRef.current = es
  }, [status, method, agentId, streamAttempt, stopStream])

  useEffect(() => {
    if (connected) stopStream()
  }, [connected, stopStream])
  useEffect(() => stopStream, [stopStream])

  const requestCode = useMutation({
    mutationFn: async () => {
      const dialCode = PAIRING_COUNTRIES.find((c) => c.code === countryCode)?.dialCode ?? ""
      const local = phone.replace(/\D/g, "").replace(/^0+/, "")
      const res = await fetch(`/api/baileys/sessions/${agentId}/pairing-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: `${dialCode}${local}` }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(err.error ?? err.message ?? "Couldn't get a pairing code. Please try again.")
      }
      return (await res.json()) as { code: string }
    },
    onSuccess: (data) => {
      setError(null)
      setPairingCode(data.code)
    },
    onError: (err: Error) => setError(err.message),
  })

  const manualSetup = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/auto-build/manual`, { method: "POST" })
      if (!res.ok) throw new Error("Couldn't switch to manual setup. Please try again.")
    },
    onSuccess: () => router.push(`/onboarding/manual?agentId=${agentId}`),
    onError: (err: Error) => setError(err.message),
  })

  // Wait for the worker to mark the build as started: until then the dashboard
  // would send them straight back here.
  const { data: buildStatus } = useQuery({
    queryKey: ["onboarding-build", agentId],
    queryFn: async () => {
      const res = await fetch("/api/agents/auto-build")
      if (!res.ok) return AUTO_BUILD_WAITING
      const data = (await res.json()) as { agent: { status: string } | null }
      return data.agent?.status ?? null
    },
    enabled: connected && autoBuild,
    refetchInterval: BUILD_POLL_MS,
  })

  useEffect(() => {
    if (!connected) return
    if (!autoBuild) {
      router.replace(`/onboarding/connected?agentId=${agentId}`)
    } else if (buildStatus !== undefined && buildStatus !== AUTO_BUILD_WAITING) {
      router.replace("/dashboard")
    }
  }, [connected, autoBuild, buildStatus, agentId, router])

  return (
    <div className={flow.root}>
      <div className={flow.brand}>
        <span className={flow.brandDot} />
        {brand.appName}
        <button type="button" className={styles.signOut} onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </button>
      </div>

      <div className={`${flow.card} ${styles.card}`}>
        {connected ? (
          <div className={styles.waiting} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <h1 className={flow.stepTitle}>WhatsApp connected</h1>
            <p className={flow.stepSub}>Taking you to your dashboard…</p>
          </div>
        ) : (
          <>
            <h1 className={flow.stepTitle}>Connect your WhatsApp</h1>
            <p className={flow.stepSub}>
              {autoBuild
                ? "Link your number and we'll create your AI agent automatically from your WhatsApp profile and recent chats."
                : "Link your number and your agent goes live straight away."}
            </p>

            {error && <div className={flow.error}>{error}</div>}
            {startSession.isError && (
              <button type="button" className={flow.btnSecondary} onClick={() => startSession.mutate()}>
                Try again
              </button>
            )}

            {status === "BANNED" ? (
              <div className={flow.error}>WhatsApp has banned this number. Sign out and contact support to use another one.</div>
            ) : method === "qr" ? (
              <div className={styles.qrArea}>
                {qrDataUrl ? (
                  <Image src={qrDataUrl} alt="WhatsApp QR code" width={256} height={256} className={styles.qr} unoptimized />
                ) : !startSession.isError ? (
                  <div className={styles.qrLoading} role="status">
                    <span className={styles.spinner} aria-hidden="true" />
                    Getting your QR code…
                  </div>
                ) : null}
                <p className={styles.hint}>Open WhatsApp, go to Linked Devices, tap Link a device, then scan.</p>
              </div>
            ) : pairingCode ? (
              <div className={styles.qrArea}>
                <div className={styles.code}>{pairingCode}</div>
                <p className={styles.hint}>
                  Open WhatsApp, go to Linked Devices, tap Link a device, choose Link with phone number, then enter this code.
                </p>
              </div>
            ) : (
              <form
                className={styles.phoneForm}
                onSubmit={(e) => {
                  e.preventDefault()
                  requestCode.mutate()
                }}
              >
                <label className={flow.label} htmlFor="onboarding-phone">
                  Your WhatsApp number
                </label>
                <div className={styles.phoneRow}>
                  <select
                    aria-label="Country code"
                    className={flow.select}
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                  >
                    {PAIRING_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        +{c.dialCode} {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    id="onboarding-phone"
                    className={styles.phoneInput}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="803 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className={flow.btnPrimary}
                  disabled={requestCode.isPending || status !== "QR_PENDING" || !phone.replace(/\D/g, "")}
                >
                  {requestCode.isPending ? "Getting code…" : "Get pairing code"}
                </button>
              </form>
            )}

            {status !== "BANNED" && (
              <button
                type="button"
                className={styles.switchMethod}
                onClick={() => {
                  setMethod(method === "qr" ? "code" : "qr")
                  setPairingCode(null)
                  setError(null)
                }}
              >
                {method === "qr" ? "On this phone? Use your phone number instead" : "Use a QR code instead"}
              </button>
            )}

            {autoBuild && (
              <div className={styles.manual}>
                <p className={styles.manualText}>Prefer to set it up yourself? You can always update this later.</p>
                <button
                  type="button"
                  className={flow.btnSecondary}
                  onClick={() => manualSetup.mutate()}
                  disabled={manualSetup.isPending}
                >
                  {manualSetup.isPending ? "Opening…" : "Create my agent manually"}
                </button>
              </div>
            )}

            <p className={styles.privacy}>
              Your conversations are used only to run your AI agent. They are never sold or shared with other businesses.{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
