import { describe, it, expect } from "vitest"
import { safeFetch, MAX_REDIRECTS } from "./safe-fetch.js"

// No network. `lookup`, `makeDispatcher` and `fetchImpl` are injected, so every
// hostile case below is expressed as data rather than needing a real server.

const PUBLIC = [{ address: "93.184.216.34", family: 4 }]

/** Records which IP the dispatcher was pinned to — the pinning regression guard. */
function harness(responses: Array<Response | (() => Response)>, addresses = PUBLIC) {
  const pinnedIps: string[] = []
  const requested: string[] = []
  let i = 0
  return {
    pinnedIps,
    requested,
    deps: {
      lookup: async () => addresses,
      makeDispatcher: (ip: string) => {
        pinnedIps.push(ip)
        return { close: async () => {} } as never
      },
      fetchImpl: (async (url: string) => {
        requested.push(String(url))
        const r = responses[Math.min(i, responses.length - 1)]
        i++
        return typeof r === "function" ? r() : r
      }) as never,
    },
  }
}

function html(body = "<html><body>hi</body></html>", headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } })
}

function redirectTo(location: string, status = 302) {
  return new Response(null, { status, headers: { location } })
}

describe("safeFetch — happy path", () => {
  it("fetches a public page and returns the decoded body", async () => {
    const h = harness([html("<html><body>Hello</body></html>")])
    const res = await safeFetch("https://example.com/", {}, h.deps)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.body).toContain("Hello")
      expect(res.contentType).toBe("text/html")
      expect(res.status).toBe(200)
    }
  })

  // If this regresses, DNS rebinding is live again.
  it("connects to the RESOLVED IP, not the hostname", async () => {
    const h = harness([html()])
    await safeFetch("https://example.com/", {}, h.deps)
    expect(h.pinnedIps).toEqual(["93.184.216.34"])
  })
})

describe("safeFetch — DNS answers", () => {
  it("rejects when ANY resolved address is private, even alongside a public one", async () => {
    const mixed = [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]
    const h = harness([html()], mixed)
    const res = await safeFetch("https://example.com/", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toContain("blocked_ipv4")
    // And we never opened a connection.
    expect(h.pinnedIps).toEqual([])
  })

  it("rejects a host that resolves only to the cloud metadata address", async () => {
    const h = harness([html()], [{ address: "169.254.169.254", family: 4 }])
    const res = await safeFetch("https://totally-normal.com/", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toContain("169.254")
  })

  it("reports an empty DNS answer", async () => {
    const h = harness([html()], [])
    const res = await safeFetch("https://example.com/", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("dns_no_answer")
  })
})

describe("safeFetch — redirects", () => {
  it("follows a redirect and revalidates the new hop", async () => {
    const h = harness([redirectTo("https://example.com/final"), html("<html>final</html>")])
    const res = await safeFetch("https://example.com/start", {}, h.deps)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.url).toBe("https://example.com/final")
  })

  // The attack a naive redirect:"follow" would walk straight into.
  it("blocks a public page redirecting to the metadata endpoint", async () => {
    const h = harness([redirectTo("http://169.254.169.254/latest/meta-data/"), html()])
    const res = await safeFetch("https://example.com/", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toContain("169.254")
  })

  it("blocks a redirect that changes scheme to file:", async () => {
    const h = harness([redirectTo("file:///etc/passwd"), html()])
    const res = await safeFetch("https://example.com/", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("blocked_scheme")
  })

  it("resolves a relative Location against the current hop", async () => {
    const h = harness([redirectTo("/deeper/page"), html()])
    await safeFetch("https://example.com/a/b", {}, h.deps)
    expect(h.requested[1]).toBe("https://example.com/deeper/page")
  })

  it("breaks a redirect loop", async () => {
    const h = harness([redirectTo("https://example.com/a"), redirectTo("https://example.com/a")])
    const res = await safeFetch("https://example.com/a", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("redirect_loop")
  })

  it("gives up after the hop limit", async () => {
    let n = 0
    const h = harness([() => redirectTo(`https://example.com/hop-${n++}`)])
    const res = await safeFetch("https://example.com/start", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("too_many_redirects")
    expect(h.requested.length).toBeLessThanOrEqual(MAX_REDIRECTS + 1)
  })

  it("reports a 3xx with no Location", async () => {
    const h = harness([new Response(null, { status: 302 })])
    const res = await safeFetch("https://example.com/", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("redirect_without_location")
  })
})

describe("safeFetch — content type and size", () => {
  it("refuses a PDF without reading the body", async () => {
    // A real ReadableStream fills its queue at construction, so start()/pull()
    // both fire before safeFetch sees it. getReader() is the honest signal:
    // it is called only by the code that actually consumes the body.
    let consumed = false
    const fakeResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      body: { getReader: () => { consumed = true; throw new Error("must not read") } },
    }
    const res = await safeFetch(
      "https://example.com/f.pdf", {},
      harness([fakeResponse as never]).deps
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("unsupported_content_type")
    expect(consumed).toBe(false)
  })

  it("rejects on a declared content-length over the cap", async () => {
    const h = harness([html("x", { "content-length": "99999999" })])
    const res = await safeFetch("https://example.com/", { maxBytes: 1024 }, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("body_too_large")
  })

  // A lying content-length must not get past the streaming cap.
  it("aborts a stream that exceeds the cap despite no content-length", async () => {
    const chunk = new Uint8Array(1024)
    const body = new ReadableStream<Uint8Array>({
      pull(c) { c.enqueue(chunk) },
    })
    const h = harness([new Response(body, { status: 200, headers: { "content-type": "text/html" } })])
    const res = await safeFetch("https://example.com/", { maxBytes: 4096 }, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("body_too_large")
  })

  it("accepts text/plain and xhtml", async () => {
    for (const ct of ["text/plain", "application/xhtml+xml"]) {
      const h = harness([new Response("ok", { status: 200, headers: { "content-type": ct } })])
      const res = await safeFetch("https://example.com/", {}, h.deps)
      expect(res.ok).toBe(true)
    }
  })
})

describe("safeFetch — failures", () => {
  it("reports a non-2xx as an http error with its status", async () => {
    const h = harness([new Response("nope", { status: 404, headers: { "content-type": "text/html" } })])
    const res = await safeFetch("https://example.com/", {}, h.deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(404)
  })

  it("surfaces a timeout distinctly from other failures", async () => {
    const deps = {
      lookup: async () => PUBLIC,
      makeDispatcher: () => ({ close: async () => {} }) as never,
      fetchImpl: (async () => {
        const e = new Error("aborted")
        e.name = "TimeoutError"
        throw e
      }) as never,
    }
    const res = await safeFetch("https://example.com/", {}, deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("timeout")
  })

  it("rejects a blocked URL before any DNS lookup", async () => {
    let looked = false
    const deps = {
      lookup: async () => { looked = true; return PUBLIC },
      makeDispatcher: () => ({ close: async () => {} }) as never,
      fetchImpl: (async () => html()) as never,
    }
    const res = await safeFetch("http://169.254.169.254/latest/meta-data/", {}, deps)
    expect(res.ok).toBe(false)
    expect(looked).toBe(false)
  })
})
