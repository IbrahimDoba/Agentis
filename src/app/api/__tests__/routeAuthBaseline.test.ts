import { describe, it, expect, vi } from "vitest"
import { readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { NextRequest } from "next/server"

// The session boundary is the ONE thing stubbed here. Everything else — the
// route module, its imports, its response construction — runs for real. The
// project rule is no DB mocking, and this keeps to it: an unauthenticated
// request returns before any route reaches the database.
// Mirrors the real export shape of @/lib/auth — auth() answering "no session",
// and the NextAuth handlers the catch-all route re-exports. A partial mock made
// that route fail to load, which showed up in the table as a fake finding.
vi.mock("@/lib/auth", () => ({
  auth: async () => null,
  handlers: { GET: async () => new Response(null, { status: 405 }), POST: async () => new Response(null, { status: 405 }) },
  signIn: async () => undefined,
  signOut: async () => undefined,
}))

// A byte-for-byte record of what every session-guarded API route answers to an
// unauthenticated request, today, quirks included.
//
// It is NOT a statement that these responses are good. They are inconsistent on
// purpose of nobody's: some are JSON and some plain text, some 401 and some 403,
// the /v1 surface uses a different envelope. The point is that the shared route
// wrapper must reproduce them exactly, and only a recorded baseline can prove
// that. Read a diff here as "a client-visible response changed" and decide
// whether you meant it.
const API_ROOT = join(process.cwd(), "src", "app", "api")
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === "route.ts") out.push(full)
  }
  return out
}

// Dynamic segments (`[id]`, `[...slug]`) become params the handler awaits.
function paramsFor(routePath: string): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {}
  for (const seg of relative(API_ROOT, routePath).split(sep)) {
    const m = /^\[(\.\.\.)?(.+)\]$/.exec(seg)
    if (m) params[m[2]] = m[1] ? ["baseline"] : "baseline"
  }
  return params
}

function urlFor(routePath: string): string {
  const rel = relative(API_ROOT, routePath).replace(/\/route\.ts$/, "").split(sep)
  return "http://localhost/api/" + rel.map((s) => s.replace(/^\[(\.\.\.)?(.+)\]$/, "baseline")).join("/")
}

// The /v1 envelope carries a fresh request_id per call, and some routes echo a
// timestamp. Both would make this table differ on every run and train people to
// re-record it without reading the diff, which is the one thing it must not do.
// The shape is what is being pinned, so the volatile parts are masked.
function stable(body: string): string {
  return body
    .replace(/req_[0-9a-f]{16,}/g, "req_<id>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<timestamp>")
}

async function describeResponse(res: Response) {
  const body = stable(await res.text())
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    // Truncated: some routes stream or return long payloads, and the guard
    // response is what this baseline is about.
    body: body.length > 200 ? body.slice(0, 200) + "…" : body,
  }
}

// EVERY route, with no filter. An earlier version selected files containing the
// literal `await auth()`, which quietly dropped a route the moment its guard was
// factored into a helper — routes disappearing from the table exactly when they
// are refactored is the opposite of what this is for. Webhook, /v1 and embed
// routes are in here too: their unauthenticated answers are part of the surface.
const files = routeFiles(API_ROOT).sort()

describe("unauthenticated response baseline", () => {
  it("covers every API route", () => {
    expect(files.length).toBeGreaterThan(160)
  })

  it("matches the recorded responses", async () => {
    const table: Record<string, unknown> = {}

    for (const file of files) {
      const key = relative(API_ROOT, file).replace(/\/route\.ts$/, "").split(sep).join("/")
      let mod: Record<string, unknown>
      try {
        mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>
      } catch (err) {
        // Recorded rather than thrown: a module that cannot even load is itself
        // a fact about this surface, and hiding it would make the table lie.
        table[key] = { moduleLoadError: (err as Error).message.split("\n")[0].slice(0, 120) }
        continue
      }

      const perMethod: Record<string, unknown> = {}
      for (const method of METHODS) {
        if (typeof mod[method] !== "function") continue
        // NextRequest, not Request: handlers reach for req.nextUrl.searchParams,
        // which a plain Request does not have. With one, those routes recorded a
        // TypeError instead of their real answer.
        const req = new NextRequest(urlFor(file), {
          method,
          ...(method === "GET" || method === "DELETE"
            ? {}
            : { headers: { "content-type": "application/json" }, body: "{}" }),
        })
        try {
          const res = await (mod[method] as (r: NextRequest, c: unknown) => Promise<Response>)(
            req,
            { params: Promise.resolve(paramsFor(file)) }
          )
          perMethod[method] = await describeResponse(res)
        } catch (err) {
          // A throw is also a client-visible outcome (Next turns it into a 500).
          perMethod[method] = { threw: (err as Error).message.split("\n")[0].slice(0, 120) }
        }
      }
      table[key] = perMethod
    }

    expect(table).toMatchSnapshot()
  })
})
