"use client"

import { useState } from "react"
import styles from "./ProspectImport.module.css"

// Upload panel for the CSV produced by tools/outreach-sourcer.
//
// Posts to the existing /api/admin/outreach/import, which owns normalization,
// dedupe, fit scoring and the three-way suppression check. This is only a way to
// hand it a file, deliberately: a second import path would be a second place for
// the suppression rules to be forgotten.

type ImportResult = {
  rows: number
  imported: number
  duplicate: number
  skipped: number
  details: { email: string; outcome: string }[]
}

export function ProspectImport() {
  const [open, setOpen] = useState(false)
  const [csv, setCsv] = useState("")
  const [vertical, setVertical] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<ImportResult | null>(null)

  async function readFile(file: File) {
    setError("")
    setCsv(await file.text())
  }

  async function submit() {
    if (!csv.trim() || busy) return
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/admin/outreach/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, ...(vertical ? { vertical } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Import failed")
        return
      }
      setResult(data)
    } finally {
      setBusy(false)
    }
  }

  const lineCount = csv.trim() ? csv.trim().split("\n").length - 1 : 0

  return (
    <section className={styles.wrap}>
      <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide" : "Import prospects from CSV"}
      </button>

      {open && (
        <div className={styles.body}>
          <p className={styles.hint}>
            Paste or upload the CSV from <code>tools/outreach-sourcer</code>. Rows are normalised,
            deduped, fit-scored and checked against the suppression list, existing users and
            newsletter subscribers before anything is stored.
          </p>

          <div className={styles.row}>
            <input
              type="file"
              accept=".csv,text/csv"
              className={styles.file}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readFile(file)
              }}
            />
            <input
              className={styles.vertical}
              placeholder="Override vertical (optional)"
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              maxLength={40}
            />
          </div>

          <textarea
            className={styles.textarea}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="businessname,email,sourcelabel,sourceurl,..."
            rows={8}
            spellCheck={false}
          />
          <p className={styles.counter}>{lineCount} data row(s)</p>

          <button type="button" className={styles.submit} onClick={submit} disabled={busy || !csv.trim()}>
            {busy ? "Importing…" : "Import"}
          </button>

          {error && <p className={styles.error}>{error}</p>}

          {result && (
            <div className={styles.result}>
              <p className={styles.summary}>
                {result.imported} imported, {result.duplicate} already known, {result.skipped} skipped,
                from {result.rows} rows.
              </p>
              {result.details.length > 0 && (
                <>
                  {/* Every rejection is shown with its reason. A silent skip is how
                      a list quietly becomes half the size you thought it was. */}
                  <p className={styles.detailsTitle}>Skipped</p>
                  <ul className={styles.details}>
                    {result.details.map((d, i) => (
                      <li key={i}>
                        <span className={styles.detailEmail}>{d.email}</span>
                        <span className={styles.detailReason}>{d.outcome}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
