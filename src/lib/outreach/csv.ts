// Minimal RFC 4180 parser for the VA-built prospect spreadsheet.
//
// A dependency would be overkill for one admin-only import, but a naive
// split(",") is not: Nigerian business names and addresses are full of commas
// ("Ovie Fabrics, Ikeja", "12 Awolowo Road, Ikoyi, Lagos"), so quoted fields
// have to work or the columns silently shift.

export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  // Strip a UTF-8 BOM; Excel on Windows writes one and it corrupts the first
  // header cell, which then never matches a column name.
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n")

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += char
  }

  // A file not ending in a newline still has a final row to flush.
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

/**
 * Parses to objects keyed by header. Headers are lowercased with non-alphanumerics
 * stripped, so "Business Name", "business_name" and "BusinessName" all land on
 * the same key — VAs do not produce consistent headers.
 */
export function parseCsvRows(input: string): Record<string, string>[] {
  const rows = parseCsv(input)
  if (rows.length < 2) return []

  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""))
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      if (header) record[header] = (cells[index] ?? "").trim()
    })
    return record
  })
}
