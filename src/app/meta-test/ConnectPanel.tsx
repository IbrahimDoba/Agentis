"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import styles from "./page.module.css"

// Embedded Signup panel — the flow a real customer uses to grant this app
// access to THEIR WhatsApp Business Account. Meta's popup returns two things by
// two different channels: an auth `code` via the FB.login callback, and the
// selected waba_id / phone_number_id via a postMessage event. Both are needed,
// so we stash the message payload and complete the exchange once we have the code.

interface Connection {
  id: string
  wabaId: string
  phoneNumberId: string
  displayPhoneNumber: string | null
  verifiedName: string | null
  registeredAt: string | null
  subscribedAt: string | null
}

interface SignupSelection {
  wabaId: string
  phoneNumberId: string
  businessId?: string
}

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void
      login: (cb: (res: { authResponse?: { code?: string } }) => void, opts: Record<string, unknown>) => void
    }
    fbAsyncInit?: () => void
  }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID

export function ConnectPanel() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [sdkReady, setSdkReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  // Held in a ref, not state: the FB.login callback fires outside React's
  // render cycle and must read the latest selection without a re-render, and
  // reading it inside a state updater would double-fire under StrictMode.
  const selectionRef = useRef<SignupSelection | null>(null)
  const [pin, setPin] = useState("")
  const [activating, setActivating] = useState<string | null>(null)

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/connect", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      setConnections(data.connections as Connection[])
    } catch {
      // Best-effort — the list refreshes after the next action.
    }
  }, [])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  // Meta's popup posts the user's WABA/number selection here. It fires before
  // the FB.login callback, so we hold it until the code arrives.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return
      try {
        const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (payload?.type !== "WA_EMBEDDED_SIGNUP") return
        // Meta has several success events (FINISH, FINISH_ONLY_WABA,
        // FINISH_OBO_MIGRATION, FINISH_GRANT_ONLY_API_ACCESS, …) — match the
        // prefix so a new one doesn't silently drop the selection.
        if (typeof payload.event === "string" && payload.event.startsWith("FINISH")) {
          selectionRef.current = {
            wabaId: payload.data?.waba_id,
            phoneNumberId: payload.data?.phone_number_id,
            businessId: payload.data?.business_id,
          }
        } else if (payload.event === "CANCEL") {
          // data.current_step tells us where they dropped out.
          setStatus(`Signup cancelled at step: ${payload.data?.current_step ?? "unknown"}`)
        } else if (payload.event === "ERROR") {
          setError(payload.data?.error_message ?? "Meta reported an error during signup.")
        }
      } catch {
        // Not a signup message — ignore.
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  useEffect(() => {
    if (!APP_ID || window.FB) {
      if (window.FB) setSdkReady(true)
      return
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: APP_ID, cookie: true, xfbml: false, version: "v21.0" })
      setSdkReady(true)
    }
    const script = document.createElement("script")
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.async = true
    script.defer = true
    document.body.appendChild(script)
  }, [])

  const completeConnect = useCallback(
    async (code: string, sel: SignupSelection) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch("/api/meta/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, ...sel }),
        })
        const data = await res.json()
        if (!res.ok) setError(data.error || "Connect failed")
        else {
          setStatus(`Connected ${data.connection.displayPhoneNumber ?? data.connection.phoneNumberId}`)
          selectionRef.current = null
          loadConnections()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connect failed")
      } finally {
        setBusy(false)
      }
    },
    [loadConnections]
  )

  function handleConnect() {
    if (!CONFIG_ID) {
      setError("NEXT_PUBLIC_META_CONFIG_ID is not set — create a Facebook Login for Business configuration first.")
      return
    }
    setError(null)
    setStatus(null)
    window.FB?.login(
      (res) => {
        const code = res.authResponse?.code
        if (!code) {
          setError("No code returned — the signup was cancelled or blocked.")
          return
        }
        const selection = selectionRef.current
        if (!selection) {
          setError("Signup finished without returning a WhatsApp account selection.")
          return
        }
        void completeConnect(code, selection)
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        // Embedded Signup v4 takes only `setup` here. Older guides also passed
        // featureType/sessionInfoVersion; featureType is for onboarding
        // businesses off the WhatsApp Business *app*, which isn't our flow.
        extras: { setup: {} },
      }
    )
  }

  async function handleActivate(phoneNumberId: string) {
    setActivating(phoneNumberId)
    setError(null)
    try {
      const res = await fetch("/api/meta/connect/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId, pin }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || "Activation failed")
      else {
        setStatus("Number registered and app subscribed to its webhooks.")
        loadConnections()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed")
    } finally {
      setActivating(null)
    }
  }

  return (
    <section className={`${styles.panel} ${styles.businessPanel}`}>
      <h2 className={styles.panelTitle}>
        Connect a WhatsApp account
        <span className={styles.scopeTag}>Embedded Signup</span>
        <button
          type="button"
          className={styles.refresh}
          onClick={handleConnect}
          disabled={!sdkReady || busy}
        >
          {busy ? "Connecting…" : "Connect your WhatsApp"}
        </button>
      </h2>

      {!CONFIG_ID && (
        <p className={styles.hint}>
          Set <code>NEXT_PUBLIC_META_CONFIG_ID</code> to your Facebook Login for Business
          configuration ID to enable the button.
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}
      {status && <p className={styles.hint}>{status}</p>}

      {connections.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Number</th>
              <th>Business name</th>
              <th>WABA</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id}>
                <td>{c.displayPhoneNumber ?? c.phoneNumberId}</td>
                <td>{c.verifiedName ?? "—"}</td>
                <td>
                  <code className={styles.checkValue}>{c.wabaId}</code>
                </td>
                <td>
                  {c.subscribedAt ? "Registered + subscribed" : "Connected, not activated"}
                </td>
                <td>
                  {!c.subscribedAt && (
                    <button
                      type="button"
                      className={styles.refresh}
                      onClick={() => handleActivate(c.phoneNumberId)}
                      disabled={activating === c.phoneNumberId || !/^\d{6}$/.test(pin)}
                    >
                      {activating === c.phoneNumberId ? "Activating…" : "Register + subscribe"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {connections.length === 0 && (
        <p className={styles.hint}>
          No numbers connected yet. The button above opens Meta&apos;s hosted signup — you
          pick your business and WhatsApp number there, so there is nothing to type in here.
        </p>
      )}

      {/* Only relevant once something is connected but not yet activated. */}
      {connections.some((c) => !c.subscribedAt) && (
      <div className={styles.field} style={{ marginTop: "1rem" }}>
        <label className={styles.label}>Two-step PIN for registration</label>
        <input
          className={styles.input}
          placeholder="6 digits"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
        />
        <span className={styles.hint}>
          Registering claims the number for the Cloud API and sets its two-step PIN. Only do
          this for a number you intend to connect.
        </span>
      </div>
      )}
    </section>
  )
}
