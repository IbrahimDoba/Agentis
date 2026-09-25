import { describe, it, expect } from "vitest"
import { toTickerCells, formatCount } from "./odometer"

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(12438)).toBe("12,438")
  })

  it("floors fractions rather than rendering a decimal point as a cell", () => {
    expect(formatCount(1200.7)).toBe("1,200")
  })

  it("degrades a bad payload to zero instead of NaN", () => {
    expect(formatCount(Number.NaN)).toBe("0")
    expect(formatCount(-5)).toBe("0")
  })
})

describe("toTickerCells", () => {
  it("gives every digit its own column", () => {
    expect(toTickerCells(407)).toEqual([
      { kind: "digit", value: 4 },
      { kind: "digit", value: 0 },
      { kind: "digit", value: 7 },
    ])
  })

  it("keeps the group separator as a static cell", () => {
    expect(toTickerCells(12438)).toEqual([
      { kind: "digit", value: 1 },
      { kind: "digit", value: 2 },
      { kind: "separator", char: "," },
      { kind: "digit", value: 4 },
      { kind: "digit", value: 3 },
      { kind: "digit", value: 8 },
    ])
  })

  it("renders zero as a single digit cell", () => {
    expect(toTickerCells(0)).toEqual([{ kind: "digit", value: 0 }])
  })

  it("grows a cell when the count crosses a grouping boundary", () => {
    expect(toTickerCells(999)).toHaveLength(3)
    expect(toTickerCells(1000)).toHaveLength(5)
  })
})
