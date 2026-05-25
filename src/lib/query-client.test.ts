import { describe, it, expect } from "vitest"
import { makeQueryClient } from "./query-client"

// Guards the Phase 0 idle-polling fix: if someone flips these defaults back on,
// every dashboard tab resumes hammering the DB while hidden / on refocus.
describe("makeQueryClient defaults", () => {
  it("does not refetch on window focus", () => {
    const opts = makeQueryClient().getDefaultOptions()
    expect(opts.queries?.refetchOnWindowFocus).toBe(false)
  })

  it("does not run refetch intervals while the tab is backgrounded", () => {
    const opts = makeQueryClient().getDefaultOptions()
    expect(opts.queries?.refetchIntervalInBackground).toBe(false)
  })

  it("keeps a non-zero staleTime so mounts reuse cache", () => {
    const opts = makeQueryClient().getDefaultOptions()
    expect(opts.queries?.staleTime).toBeGreaterThan(0)
  })
})
