import { describe, it, expect } from "vitest"
import { parseCsv, parseCsvRows } from "./csv"

describe("parseCsv", () => {
  it("parses a plain grid", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]])
  })

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('name,city\n"Ovie Fabrics, Ltd",Lagos')).toEqual([
      ["name", "city"],
      ["Ovie Fabrics, Ltd", "Lagos"],
    ])
  })

  it("handles escaped quotes and embedded newlines", () => {
    expect(parseCsv('a\n"He said ""hi""\nthen left"')).toEqual([["a"], ['He said "hi"\nthen left']])
  })

  it("normalises CRLF and strips the Excel BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2")).toEqual([["a", "b"], ["1", "2"]])
  })

  it("flushes a final row with no trailing newline", () => {
    expect(parseCsv("a\n1")).toEqual([["a"], ["1"]])
  })

  it("drops blank lines rather than emitting empty rows", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]])
  })
})

describe("parseCsvRows", () => {
  it("keys rows by normalised header", () => {
    const rows = parseCsvRows("Business Name,E-Mail\nOvie Fabrics, info@ovie.ng ")
    expect(rows).toEqual([{ businessname: "Ovie Fabrics", email: "info@ovie.ng" }])
  })

  it("tolerates ragged rows", () => {
    expect(parseCsvRows("a,b,c\n1,2")).toEqual([{ a: "1", b: "2", c: "" }])
  })

  it("returns nothing when there is only a header", () => {
    expect(parseCsvRows("a,b")).toEqual([])
  })
})
