"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/context/ToastContext"
import Button from "@/components/ui/Button"
import { NAME_TAG_MAX, normalizeNameTag, previewSavedName } from "@/lib/contact-name-tag"
import type { WorkerContactsSummary, WorkerContactSaveRun } from "@/lib/baileys-client"
import styles from "./ContactsTab.module.css"

type Summary = WorkerContactsSummary & {
  settings: { autoSaveContacts: boolean; contactNameTag: string | null }
}

const SAMPLE_NAME = "Adaeze Okafor"
// Average gap between saves in the worker (3-6s) plus the save itself.
const SECONDS_PER_SAVE = 5.5

const PAUSE_REASONS: Record<string, string> = {
  no_credits: "Paused: you've run out of credits. Top up, then resume.",
  disconnected: "Paused: WhatsApp disconnected. Reconnect your number, then resume.",
  owner: "Paused.",
  failing: "Paused after several saves failed in a row. Check the connection, then resume.",
  free_limit: "Paused: you've reached the free plan's contact limit. Subscribe or top up, then resume.",
}

async function fetchSummary(agentId: string): Promise<Summary> {
  const res = await fetch(`/api/agents/${agentId}/status-contacts`)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? "Couldn't load contacts")
  return data
}

function duration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60))
  if (mins < 60) return `about ${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `about ${hours} h ${rest} min` : `about ${hours} h`
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })
}

export function ContactsTab({ agentId, isConnected }: { agentId: string; isConnected: boolean }) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [customTag, setCustomTag] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["status-contacts", agentId],
    queryFn: () => fetchSummary(agentId),
    refetchInterval: (q) => (q.state.data?.run?.status === "running" || q.state.data?.syncing ? 4000 : 20000),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["status-contacts", agentId] })

  async function call(url: string, init: RequestInit, success?: string): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(body?.error ?? "Something went wrong. Please try again.", "error")
        return false
      }
      if (success) showToast(success)
      return true
    } catch {
      showToast("Something went wrong. Please try again.", "error")
      return false
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const saveSettings = (patch: { autoSaveContacts?: boolean; contactNameTag?: string | null }, success: string) =>
    call(`/api/agents/${agentId}/status-contacts`, { method: "PATCH", body: JSON.stringify(patch) }, success)

  const startRun = async () => {
    const ok = await call(`/api/agents/${agentId}/status-contacts/runs`, { method: "POST" }, "Saving your chats to contacts.")
    if (ok) setConfirming(false)
  }

  const runAction = (run: WorkerContactSaveRun, action: "pause" | "resume" | "cancel") =>
    call(`/api/agents/${agentId}/status-contacts/runs/${run.id}`, { method: "POST", body: JSON.stringify({ action }) })

  if (isLoading) return <div className={styles.empty}>Loading contacts…</div>
  if (error || !data) return <div className={styles.empty}>{(error as Error)?.message ?? "Couldn't load contacts."}</div>

  const { addressBook, unsaved, run, settings, syncing, dailyCap, creditsPerContact } = data
  const free = data.freeLimit ?? null
  const toSave = free ? Math.min(unsaved, free.left) : unsaved
  const activeRun = run && (run.status === "running" || run.status === "paused") ? run : null
  const tag = settings.contactNameTag
  const draft = customTag ?? tag ?? ""
  const draftCheck = normalizeNameTag(draft)
  const draftPreview = previewSavedName(SAMPLE_NAME, draftCheck.ok ? draftCheck.tag : null)

  return (
    <div className={styles.wrap}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{addressBook.total.toLocaleString()}</div>
          <div className={styles.statLabel}>In your phone&apos;s contacts</div>
          {free ? (
            <div className={styles.statHint}>{free.used.toLocaleString()} of {free.limit} free saves used</div>
          ) : addressBook.byDailzero > 0 && (
            <div className={styles.statHint}>{addressBook.byDailzero.toLocaleString()} saved from here</div>
          )}
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{unsaved.toLocaleString()}</div>
          <div className={styles.statLabel}>Chats not saved yet</div>
        </div>
      </div>

      <p className={styles.lead}>
        Your WhatsApp status only reaches people saved in your phone. Save your chats to grow who sees it.
        {syncing && <span className={styles.muted}> Reading your phone&apos;s contacts…</span>}
      </p>

      {!isConnected && (
        <div className={styles.warn}>Your WhatsApp number isn&apos;t connected. Reconnect it to save contacts.</div>
      )}

      {activeRun ? (
        <RunCard run={activeRun} busy={busy} onAction={(a) => void runAction(activeRun, a)} />
      ) : free && free.left === 0 && unsaved > 0 ? (
        <section className={styles.card}>
          <div className={styles.cardRow}>
            <div>
              <div className={styles.cardTitle}>You&apos;ve used all {free.limit} free contact saves</div>
              <div className={styles.cardDesc}>
                Subscribe to a plan or top up credits to save your other {unsaved.toLocaleString()} chats.
              </div>
            </div>
            <Link href="/dashboard/billing" className={styles.link}>See plans</Link>
          </div>
        </section>
      ) : unsaved > 0 ? (
        <section className={styles.card}>
          {!confirming ? (
            <div className={styles.cardRow}>
              <div>
                <div className={styles.cardTitle}>Save {toSave.toLocaleString()} chats to your contacts</div>
                <div className={styles.cardDesc}>
                  {(toSave * creditsPerContact).toLocaleString()} credits · {duration(toSave * SECONDS_PER_SAVE)}
                </div>
              </div>
              <Button type="button" disabled={!isConnected} onClick={() => setConfirming(true)}>
                Save all chats
              </Button>
            </div>
          ) : (
            <div>
              <div className={styles.cardTitle}>Save {toSave.toLocaleString()} chats?</div>
              <ul className={styles.facts}>
                {free && toSave < unsaved && (
                  <li>
                    The free plan saves up to {free.limit} contacts, so {toSave.toLocaleString()} of your{" "}
                    {unsaved.toLocaleString()} chats will be saved. Subscribe or top up to save the rest.
                  </li>
                )}
                <li>
                  Costs <strong>{(toSave * creditsPerContact).toLocaleString()} credits</strong> ({creditsPerContact} per contact
                  saved). Failed saves are free.
                </li>
                <li>Saved one at a time for safety, {duration(toSave * SECONDS_PER_SAVE)}. Up to {dailyCap} a day; the rest continue tomorrow.</li>
                <li>
                  Names look like <strong>{previewSavedName(SAMPLE_NAME, tag)}</strong>. Contacts already in your phone are never renamed.
                </li>
              </ul>
              <div className={styles.actions}>
                <Button type="button" loading={busy} onClick={() => void startRun()}>
                  Save {toSave.toLocaleString()} contacts
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className={styles.card}>
          <div className={styles.cardTitle}>All your chats are saved</div>
          <div className={styles.cardDesc}>Every chat with a name is already in your phone&apos;s contacts.</div>
        </section>
      )}

      {run && !activeRun && run.status === "completed" && (
        <p className={styles.muted}>
          Last run: {run.savedCount.toLocaleString()} saved
          {run.failedCount > 0 ? `, ${run.failedCount.toLocaleString()} failed` : ""} · {run.creditsUsed.toLocaleString()} credits
        </p>
      )}

      <section className={styles.card}>
        <div className={styles.cardTitle}>Name tag (optional)</div>
        <div className={styles.cardDesc}>
          A short word added to the end of every contact saved from here, so you can tell them apart in your phone. Use
          anything that means something to you, like your shop name or &quot;Customer&quot;. Later, search that word in your
          contacts to find them all.
        </div>
        <div className={styles.tagOptions} role="radiogroup" aria-label="Name tag">
          <label className={`${styles.tagOption} ${tag === null ? styles.tagOptionOn : ""}`}>
            <input
              type="radio"
              name="name-tag"
              checked={tag === null}
              disabled={busy}
              onChange={() => {
                setCustomTag(null)
                void saveSettings({ contactNameTag: null }, "New contacts will be saved with their plain name.")
              }}
            />
            <span className={styles.tagLabel}>No tag</span>
            <span className={styles.tagPreview}>{SAMPLE_NAME}</span>
          </label>
          <div className={`${styles.tagOption} ${tag !== null ? styles.tagOptionOn : ""}`}>
            <span className={styles.tagLabel}>Your tag</span>
            <input
              className={styles.input}
              value={draft}
              maxLength={NAME_TAG_MAX}
              placeholder="Type a word"
              aria-label="Your name tag"
              onChange={(e) => setCustomTag(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || !draft.trim() || !draftCheck.ok || draftCheck.tag === tag}
              onClick={() => {
                if (!draftCheck.ok) return
                void saveSettings({ contactNameTag: draftCheck.tag }, `New contacts will be saved as "${draftPreview}".`)
                  .then((ok) => { if (ok) setCustomTag(null) })
              }}
            >
              Save tag
            </Button>
            {draft.trim() && draftCheck.ok && <span className={styles.tagPreview}>Saves as {draftPreview}</span>}
          </div>
          {!draftCheck.ok && <p className={styles.error}>{draftCheck.error}</p>}
        </div>
        <p className={styles.muted}>Up to {NAME_TAG_MAX} characters. Changing it only affects contacts saved from now on.</p>
      </section>

      <section className={styles.card}>
        <div className={styles.switchRow}>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoSaveContacts}
            aria-label="Auto-save new chats"
            disabled={busy}
            className={`${styles.switch} ${settings.autoSaveContacts ? styles.switchOn : ""}`}
            onClick={() => void saveSettings(
              { autoSaveContacts: !settings.autoSaveContacts },
              settings.autoSaveContacts ? "Auto-save is off." : "New chats will be saved to your contacts automatically.",
            )}
          >
            <span className={styles.switchKnob} />
          </button>
          <div>
            <div className={styles.cardTitle}>Auto-save new chats</div>
            <div className={styles.cardDesc}>
              When someone messages you and isn&apos;t in your contacts yet, save them automatically.{" "}
              {creditsPerContact} credit each.{free && ` Counts toward the free plan's ${free.limit}.`} Off by default.
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function RunCard({ run, busy, onAction }: { run: WorkerContactSaveRun; busy: boolean; onAction: (a: "pause" | "resume" | "cancel") => void }) {
  const done = run.savedCount + run.failedCount
  const pct = run.totalCount > 0 ? Math.min(100, Math.round((done / run.totalCount) * 100)) : 0
  const remaining = Math.max(0, run.totalCount - done)

  const status = run.status === "paused"
    ? PAUSE_REASONS[run.pauseReason ?? "owner"] ?? "Paused."
    : run.waitingUntil
      ? `Daily limit reached. Continues ${timeOfDay(run.waitingUntil)}.`
      : `Saving… ${duration(remaining * SECONDS_PER_SAVE)} left. You can leave this page.`

  return (
    <section className={styles.card}>
      <div className={styles.cardRow}>
        <div className={styles.cardTitle}>
          Saving chats to contacts: {run.savedCount.toLocaleString()} / {run.totalCount.toLocaleString()}
        </div>
        <div className={styles.actions}>
          {run.status === "running" ? (
            <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => onAction("pause")}>Pause</Button>
          ) : (
            <Button type="button" size="sm" loading={busy} onClick={() => onAction("resume")}>Resume</Button>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAction("cancel")}>Stop</Button>
        </div>
      </div>
      <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={styles.progressFill} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <div className={styles.cardDesc}>
        {status}
        {run.failedCount > 0 && ` ${run.failedCount.toLocaleString()} couldn't be saved (not charged).`}
        {run.creditsUsed > 0 && ` ${run.creditsUsed.toLocaleString()} credits used.`}
      </div>
    </section>
  )
}
