"use client"

import { useState } from "react"
import styles from "./OutreachSettings.module.css"

// Campaign controls. These used to be environment variables, which meant
// slowing sending down required a redeploy — the wrong shape, since the usual
// reason to slow down is that something looks wrong right now.
//
// Secrets are deliberately not here. The SMTP password, the mailbox we
// authenticate as, and the root-domain safety flag stay in env.

export type Settings = {
  dailyCap: number
  hourlyCap: number
  sliceSize: number
  warmupEnabled: boolean
  warmupStartedAt: string | null
  whatsappNumber: string | null
  fromName: string
  signerName: string
  signerTitle: string
  htmlEnabled: boolean
  logoUrl: string | null
  sendingEnabled: boolean
}

export function OutreachSettingsPanel({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((prev) => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  async function save() {
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/admin/outreach/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyCap: s.dailyCap,
          hourlyCap: s.hourlyCap,
          sliceSize: s.sliceSize,
          warmupEnabled: s.warmupEnabled,
          warmupStartedAt: s.warmupStartedAt || "",
          whatsappNumber: s.whatsappNumber ?? "",
          fromName: s.fromName,
          signerName: s.signerName,
          signerTitle: s.signerTitle,
          htmlEnabled: s.htmlEnabled,
          logoUrl: s.logoUrl ?? "",
          sendingEnabled: s.sendingEnabled,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(Object.entries(data.errors ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "Could not save")
        return
      }
      setS({ ...data.settings, warmupStartedAt: data.settings.warmupStartedAt?.slice(0, 10) ?? null })
      setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.bar}>
        <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide settings" : "Campaign settings"}
        </button>
        {!s.sendingEnabled && <span className={styles.paused}>Sending is paused</span>}
      </div>

      {open && (
        <div className={styles.panel}>
          <div className={styles.grid}>
            <Field label="Daily cap" hint="Ceiling per day. The warmup ramp still applies on top.">
              <input type="number" min={0} max={500} value={s.dailyCap} className={styles.input}
                onChange={(e) => set("dailyCap", Number(e.target.value))} />
            </Field>

            <Field label="Hourly cap" hint="Rolling hour, matching how the provider measures it.">
              <input type="number" min={0} max={100} value={s.hourlyCap} className={styles.input}
                onChange={(e) => set("hourlyCap", Number(e.target.value))} />
            </Field>

            <Field label="Per tick" hint="Released each cron run, 30-90s apart.">
              <input type="number" min={1} max={50} value={s.sliceSize} className={styles.input}
                onChange={(e) => set("sliceSize", Number(e.target.value))} />
            </Field>

            <Field label="Warmup started" hint={s.warmupEnabled ? "Empty holds sending at the day-one value." : "Ignored while warmup is off."}>
              <input type="date" value={s.warmupStartedAt ?? ""} className={styles.input}
                disabled={!s.warmupEnabled}
                onChange={(e) => set("warmupStartedAt", e.target.value || null)} />
            </Field>

            <Field label="WhatsApp number" hint="Where a click lands. Digits, country code first.">
              <input value={s.whatsappNumber ?? ""} placeholder="2348163807158" className={styles.input}
                onChange={(e) => set("whatsappNumber", e.target.value)} />
            </Field>

            <Field label="From name" hint="The brand, shown as the sender.">
              <input value={s.fromName} className={styles.input}
                onChange={(e) => set("fromName", e.target.value)} />
            </Field>

            <Field label="Signed by" hint="The person in the signature block.">
              <input value={s.signerName} className={styles.input}
                onChange={(e) => set("signerName", e.target.value)} />
            </Field>

            <Field label="Title" hint="Shown under the name.">
              <input value={s.signerTitle} className={styles.input}
                onChange={(e) => set("signerTitle", e.target.value)} />
            </Field>

            <Field label="Logo URL" hint="Blank uses the default asset.">
              <input value={s.logoUrl ?? ""} placeholder="https://www.dailzero.com/logo-email.png"
                className={styles.input} onChange={(e) => set("logoUrl", e.target.value)} />
            </Field>
          </div>

          <div className={styles.toggles}>
            <label className={styles.check}>
              <input type="checkbox" checked={s.htmlEnabled}
                onChange={(e) => set("htmlEnabled", e.target.checked)} />
              <span>
                Branded HTML email
                <em>Off sends plain text, which classifies better in Gmail but looks plainer.</em>
              </span>
            </label>

            <label className={styles.check}>
              <input type="checkbox" checked={s.warmupEnabled}
                onChange={(e) => set("warmupEnabled", e.target.checked)} />
              <span>
                Warmup ramp
                <em>
                  Ramps 5 a day to your cap over three weeks. Off sends at the full cap
                  immediately, which is the pattern providers flag on a mailbox with no
                  bulk history.
                </em>
              </span>
            </label>

            <label className={styles.check}>
              <input type="checkbox" checked={s.sendingEnabled}
                onChange={(e) => set("sendingEnabled", e.target.checked)} />
              <span>
                Sending enabled
                <em>Unchecking stops every send path at once, including the cron.</em>
              </span>
            </label>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.save} onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </button>
            {saved && <span className={styles.ok}>Saved. Takes effect within 30 seconds.</span>}
            {error && <span className={styles.err}>{error}</span>}
          </div>
        </div>
      )}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
      <span className={styles.hint}>{hint}</span>
    </div>
  )
}
