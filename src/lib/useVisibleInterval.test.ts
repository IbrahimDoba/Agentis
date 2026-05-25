// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useVisibleInterval } from "./useVisibleInterval"

// Drive document.visibilityState + the visibilitychange event by hand.
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

describe("useVisibleInterval", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility("visible")
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("fires the callback on the interval while visible", () => {
    const cb = vi.fn()
    renderHook(() => useVisibleInterval(cb, 1000))
    expect(cb).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(3000)
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it("pauses while the tab is hidden and resumes when visible again", () => {
    const cb = vi.fn()
    renderHook(() => useVisibleInterval(cb, 1000))

    vi.advanceTimersByTime(2000)
    expect(cb).toHaveBeenCalledTimes(2)

    setVisibility("hidden")
    vi.advanceTimersByTime(5000) // hidden — no ticks
    expect(cb).toHaveBeenCalledTimes(2)

    setVisibility("visible")
    vi.advanceTimersByTime(2000) // resumed
    expect(cb).toHaveBeenCalledTimes(4)
  })

  it("does not start when disabled", () => {
    const cb = vi.fn()
    renderHook(() => useVisibleInterval(cb, 1000, false))
    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(0)
  })

  it("does not start when the tab is already hidden on mount", () => {
    setVisibility("hidden")
    const cb = vi.fn()
    renderHook(() => useVisibleInterval(cb, 1000))
    vi.advanceTimersByTime(3000)
    expect(cb).toHaveBeenCalledTimes(0)
  })

  it("stops firing after unmount", () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useVisibleInterval(cb, 1000))
    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    unmount()
    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it("calls the latest callback without restarting the interval", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => useVisibleInterval(fn, 1000), {
      initialProps: { fn: first },
    })
    vi.advanceTimersByTime(1000)
    expect(first).toHaveBeenCalledTimes(1)

    rerender({ fn: second })
    vi.advanceTimersByTime(1000)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(1) // not called again
  })
})
