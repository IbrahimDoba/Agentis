import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import type { Session } from "next-auth"

// Only the session boundary is stubbed, same as the route baseline.
let currentSession: Session | null = null
vi.mock("@/lib/auth", () => ({ auth: async () => currentSession }))

const { withAuth, withAdmin } = await import("./withAuth")

function sessionFor(role: string): Session {
  return {
    user: { id: "u1", role, status: "APPROVED", businessName: "co", resellerId: "platform" },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session
}

const req = () => new NextRequest("http://localhost/api/thing")
const ok = () => NextResponse.json({ ok: true })

beforeEach(() => {
  currentSession = null
})

// These assertions are transcribed from what the routes answer today, recorded
// in src/app/api/__tests__/__snapshots__. If the wrapper cannot reproduce a
// variant byte for byte, no route may adopt it.
describe("withAuth", () => {
  it("returns the exact JSON 401 that 200+ routes return today", async () => {
    const res = await withAuth(async () => ok())(req())
    expect(res.status).toBe(401)
    expect(res.headers.get("content-type")).toBe("application/json")
    expect(await res.text()).toBe('{"error":"Unauthorized"}')
  })

  it("returns the plain-text 401 the SSE routes return today", async () => {
    const res = await withAuth(async () => ok(), { unauthorized: "text" })(req())
    expect(res.status).toBe(401)
    expect(res.headers.get("content-type")).toBe("text/plain;charset=UTF-8")
    expect(await res.text()).toBe("Unauthorized")
  })

  it("runs the handler and hands it the session once signed in", async () => {
    currentSession = sessionFor("USER")
    const res = await withAuth(async (_r, ctx) =>
      NextResponse.json({ id: ctx.session.user.id, role: ctx.session.user.role })
    )(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "u1", role: "USER" })
  })

  it("passes route params straight through", async () => {
    currentSession = sessionFor("USER")
    const handler = withAuth<{ id: string }>(async (_r, ctx) =>
      NextResponse.json({ id: (await ctx.params).id })
    )
    const res = await handler(req(), { params: Promise.resolve({ id: "abc" }) })
    expect(await res.json()).toEqual({ id: "abc" })
  })

  it("gives the handler empty params when the route has none", async () => {
    currentSession = sessionFor("USER")
    const res = await withAuth(async (_r, ctx) =>
      NextResponse.json({ params: await ctx.params })
    )(req())
    expect(await res.json()).toEqual({ params: {} })
  })

  it("does not run the handler at all when signed out", async () => {
    const handler = vi.fn(async () => ok())
    await withAuth(handler)(req())
    expect(handler).not.toHaveBeenCalled()
  })
})

describe("withAdmin", () => {
  it("answers 401 — not 403 — for a signed-in non-admin, as the 26 inline checks do", async () => {
    currentSession = sessionFor("USER")
    const res = await withAdmin(async () => ok())(req())
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('{"error":"Unauthorized"}')
  })

  it("answers the same way signed out, revealing nothing about the role check", async () => {
    const signedOut = await withAdmin(async () => ok())(req())
    currentSession = sessionFor("USER")
    const nonAdmin = await withAdmin(async () => ok())(req())
    expect(signedOut.status).toBe(nonAdmin.status)
    expect(await signedOut.text()).toBe(await nonAdmin.text())
  })

  it("lets an ADMIN through", async () => {
    currentSession = sessionFor("ADMIN")
    const res = await withAdmin(async () => ok())(req())
    expect(res.status).toBe(200)
  })

  it("does not treat RESELLER_ADMIN as ADMIN", async () => {
    currentSession = sessionFor("RESELLER_ADMIN")
    const res = await withAdmin(async () => ok())(req())
    expect(res.status).toBe(401)
  })
})
