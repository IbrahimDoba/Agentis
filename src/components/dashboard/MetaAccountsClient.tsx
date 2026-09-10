"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Button from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { DropdownMenu, type DropdownItem } from "@/components/ui/DropdownMenu"
import { MetaConnectPanel } from "@/components/dashboard/MetaConnectPanel"
import styles from "./MetaAccountsClient.module.css"

export interface MetaConnectionRow {
  phoneNumberId: string
  wabaId: string
  businessId: string | null
  displayPhoneNumber: string | null
  verifiedName: string | null
  agentId: string | null
  agentName: string | null
}

interface Props {
  appId: string | null
  configId: string | null
}

// Deep link into Meta's own tooling, for everything we deliberately don't
// reimplement: display name changes, two-step PIN, billing, business verification.
function whatsappManagerUrl(row: MetaConnectionRow): string {
  const params = new URLSearchParams({ waba_id: row.wabaId })
  if (row.businessId) params.set("business_id", row.businessId)
  return `https://business.facebook.com/wa/manage/phone-numbers/?${params}`
}

export function MetaAccountsClient({ appId, configId }: Props) {
  const [rows, setRows] = useState<MetaConnectionRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MetaConnectionRow | null>(null)
  const [pendingDetach, setPendingDetach] = useState<MetaConnectionRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/connect", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load accounts")
      setRows(data.connections ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load accounts")
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Transient confirmation for the copy actions, which otherwise give no sign
  // they did anything.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  const copy = useCallback(async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(`${what} copied`)
    } catch {
      setNotice("Couldn’t copy — your browser blocked clipboard access")
    }
  }, [])

  const detach = useCallback(
    async (row: MetaConnectionRow) => {
      setBusy(true)
      try {
        const res = await fetch(`/api/meta/connections/${row.phoneNumberId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: null }),
        })
        if (!res.ok) throw new Error((await res.json()).error || "Detach failed")
        setPendingDetach(null)
        setNotice("Agent detached — this number will stop being answered")
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Detach failed")
      } finally {
        setBusy(false)
      }
    },
    [load]
  )

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      const res = await fetch(`/api/meta/connections/${pendingDelete.phoneNumberId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      setPendingDelete(null)
      setNotice("Account removed")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }, [pendingDelete, load])

  const menuFor = useMemo(
    () =>
      (row: MetaConnectionRow): DropdownItem[] => [
        {
          label: "Copy business account ID",
          onSelect: () => void copy(row.wabaId, "Business account ID"),
        },
        {
          label: "Copy phone number ID",
          onSelect: () => void copy(row.phoneNumberId, "Phone number ID"),
        },
        {
          label: "Copy phone number",
          onSelect: () =>
            void copy(row.displayPhoneNumber ?? row.phoneNumberId, "Phone number"),
        },
        {
          label: "Detach from agent",
          disabled: !row.agentId || busy,
          onSelect: () => setPendingDetach(row),
        },
        {
          label: "WhatsApp Manager",
          external: true,
          onSelect: () => window.open(whatsappManagerUrl(row), "_blank", "noopener"),
        },
        {
          label: "Delete account",
          destructive: true,
          disabled: busy,
          onSelect: () => setPendingDelete(row),
        },
      ],
    [copy, busy]
  )

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>WhatsApp accounts</h1>
        <Button onClick={() => setConnectOpen(true)}>+ Connect account</Button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {/* Polite: a copy confirmation must not interrupt what a screen reader
          is already reading. */}
      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>

      {rows === null ? (
        <p className={styles.muted}>Loading accounts…</p>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No WhatsApp accounts yet</p>
          <p className={styles.muted}>
            Connect a WhatsApp Business Account to answer its messages with an agent.
          </p>
          <Button onClick={() => setConnectOpen(true)}>+ Connect account</Button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Business account</th>
                <th scope="col">Phone number</th>
                <th scope="col">Assigned agent</th>
                {/* Named for screen readers; the visible header is empty by design. */}
                <th scope="col">
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.phoneNumberId}>
                  <td>
                    {/* The link is on the name rather than the row: a whole-row
                        click target would swallow the menu button's clicks and
                        gives keyboard users nothing to tab to. */}
                    <Link
                      href={`/dashboard/meta/${row.phoneNumberId}`}
                      className={styles.rowLink}
                    >
                      {row.verifiedName ?? "Unnamed account"}
                    </Link>
                  </td>
                  <td>
                    <span className={styles.numberName}>
                      {row.verifiedName ?? "—"}
                    </span>{" "}
                    <span className={styles.muted}>
                      ({row.displayPhoneNumber ?? row.phoneNumberId})
                    </span>
                  </td>
                  <td>
                    {row.agentId ? (
                      <Link href={`/dashboard/agent/${row.agentId}`} className={styles.agentLink}>
                        {row.agentName ?? "Agent"} <span aria-hidden="true">↗</span>
                      </Link>
                    ) : (
                      <span className={styles.unassigned}>Not assigned</span>
                    )}
                  </td>
                  <td className={styles.actionsCell}>
                    <DropdownMenu
                      items={menuFor(row)}
                      label={`Actions for ${row.verifiedName ?? row.phoneNumberId}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={connectOpen}
        onClose={() => {
          setConnectOpen(false)
          void load()
        }}
        title="Connect a WhatsApp account"
      >
        <MetaConnectPanel appId={appId} configId={configId} embedded />
      </Modal>

      <Modal
        open={pendingDetach !== null}
        onClose={() => setPendingDetach(null)}
        title="Detach this agent?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDetach(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => pendingDetach && void detach(pendingDetach)}
              disabled={busy}
            >
              {busy ? "Detaching…" : "Detach agent"}
            </Button>
          </>
        }
      >
        <p>
          <strong>{pendingDetach?.agentName}</strong> will stop answering{" "}
          <strong>{pendingDetach?.displayPhoneNumber ?? pendingDetach?.phoneNumberId}</strong>.
          Messages to it are dropped until you assign another agent.
        </p>
      </Modal>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this account?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={busy}>
              {busy ? "Deleting…" : "Delete account"}
            </Button>
          </>
        }
      >
        <p>
          <strong>{pendingDelete?.verifiedName ?? pendingDelete?.displayPhoneNumber}</strong> will
          stop being answered — incoming messages to it are dropped rather than reaching an agent.
        </p>
        <p className={styles.muted}>
          This only removes the connection here. The number stays registered on the WhatsApp
          Business Platform, keeps its templates, and can be connected again. To release the
          number itself, use WhatsApp Manager.
        </p>
      </Modal>
    </>
  )
}
