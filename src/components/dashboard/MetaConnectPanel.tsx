"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import styles from "./MetaConnectPanel.module.css"

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
  agentName: string | null
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

// Passed in from the server component rather than read from NEXT_PUBLIC_*
// here: those are inlined at BUILD time, and the production image is built
// without them, so they arrive undefined no matter what the container's
// runtime env says. The page reads process.env at request time instead.
interface MetaConnectPanelProps {
  appId: string | null
  configId: string | null
}

// Fire-and-forget breadcrumb so a failure that never reaches /api/meta/connect
// still shows up in the server logs.
function trace(stage: string, detail?: string) {
  void fetch("/api/meta/connect/debug", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, detail }),
  }).catch(() => {})
}

export function MetaConnectPanel({ appId, configId }: MetaConnectPanelProps) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [agents, setAgents] = useState<Array<{ id: string; businessName: string }>>([])
  // Which agent answers on the number about to be connected. Chosen before
  // launching the flow, because Meta's popup returns straight to the exchange
  // and there is no moment afterwards to ask.
  const [agentId, setAgentId] = useState("")
  const [sdkReady, setSdkReady] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
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
      const list = (data.agents ?? []) as Array<{ id: string; businessName: string }>
      setAgents(list)
      setAgentId((current) => current || list[0]?.id || "")
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
        trace("signup_message", `event=${payload.event}`)
        if (typeof payload.event === "string" && payload.event.startsWith("FINISH")) {
          selectionRef.current = {
            wabaId: payload.data?.waba_id,
            phoneNumberId: payload.data?.phone_number_id,
            businessId: payload.data?.business_id,
          }
          trace("selection_captured", `waba=${payload.data?.waba_id} phone=${payload.data?.phone_number_id}`)
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

  // connect.facebook.net is a common target for content blockers, and a blocked
  // script fails silently — which leaves the button stuck on "Loading…" forever
  // with nothing to act on. Surface the failure instead of hanging.
  useEffect(() => {
    if (!appId) return
    if (window.FB) {
      setSdkReady(true)
      return
    }

    const SCRIPT_ID = "facebook-jssdk"
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version: "v21.0" })
      setSdkReady(true)
    }

    // Effects can re-run (StrictMode, prop changes); appending twice makes the
    // SDK initialise twice.
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement("script")
      script.id = SCRIPT_ID
      script.src = "https://connect.facebook.net/en_US/sdk.js"
      script.async = true
      script.defer = true
      script.crossOrigin = "anonymous"
      script.onerror = () =>
        setSdkError(
          "Couldn't load Facebook's SDK. An ad blocker or privacy extension is most likely blocking connect.facebook.net — disable it for this site, or try a private window."
        )
      document.body.appendChild(script)
    }

    // Blockers that stub the request rather than failing it never fire onerror,
    // so fall back to a deadline.
    const timeout = setTimeout(() => {
      if (!window.FB) {
        setSdkError(
          "Facebook's SDK didn't load within 10 seconds — usually an ad blocker or privacy extension blocking connect.facebook.net."
        )
      }
    }, 10_000)
    return () => clearTimeout(timeout)
  }, [appId])

  const completeConnect = useCallback(
    async (code: string, sel: SignupSelection) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch("/api/meta/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, ...sel, agentId: agentId || null }),
        })
        const data = await res.json()
        trace("exchange_result", res.ok ? "stored" : `failed: ${data.error}`)
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
    [loadConnections, agentId]
  )

  function handleConnect() {
    trace("connect_clicked", `sdkReady=${sdkReady} configId=${configId ? "set" : "missing"}`)
    if (!configId) {
      setError("No Facebook Login for Business configuration is set on the server.")
      return
    }
    setError(null)
    setStatus(null)
    window.FB?.login(
      (res) => {
        const code = res.authResponse?.code
        trace("login_callback", code ? "code received" : "NO code in authResponse")
        if (!code) {
          setError("No code returned — the signup was cancelled or blocked.")
          return
        }
        const selection = selectionRef.current
        if (!selection) {
          trace("no_selection", "code arrived but no WA_EMBEDDED_SIGNUP message was captured")
          setError("Signup finished without returning a WhatsApp account selection.")
          return
        }
        void completeConnect(code, selection)
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        // sessionInfoVersion is what makes Meta emit the WA_EMBEDDED_SIGNUP
        // postMessage carrying the WABA and phone-number IDs. Without it the
        // flow still completes and still returns a code, but the session info
        // never arrives — leaving a code with nothing to attach it to.
        // Matches the "Session Info Version 3" shown on the app's Embedded
        // Signup setup page.
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
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
          {busy ? "Connecting…" : sdkReady ? "Connect your WhatsApp" : "Loading…"}
        </button>
      </h2>

      {/* A disabled button with no explanation is a dead end — say which piece
          is missing rather than leaving it inert. */}
      {!appId && (
        <p className={styles.error}>
          META_APP_ID is not set on the server, so the Facebook SDK can&apos;t load.
        </p>
      )}
      {!configId && (
        <p className={styles.error}>
          META_CONFIG_ID is not set on the server — create a Facebook Login for Business
          configuration and set its ID.
        </p>
      )}
      {agents.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="meta-connect-agent">
            Agent that answers on this number
          </label>
          <select
            id="meta-connect-agent"
            className={styles.input}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.businessName}
              </option>
            ))}
          </select>
          <span className={styles.hint}>
            Pick before connecting — the flow returns straight to us and there is no
            chance to choose afterwards.
          </span>
        </div>
      )}

      {sdkError && <p className={styles.error}>{sdkError}</p>}
      {appId && !sdkReady && !sdkError && (
        <p className={styles.hint}>Loading Facebook&apos;s SDK…</p>
      )}
      {error && <p className={styles.error}>{error}</p>}
      {status && <p className={styles.hint}>{status}</p>}

      {connections.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Number</th>
              <th>Business name</th>
              <th>Answered by</th>
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
                  {c.agentName ?? (
                    <span className={styles.error}>No agent — create one first</span>
                  )}
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
