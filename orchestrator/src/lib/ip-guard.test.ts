import { describe, it, expect } from "vitest"
import { isBlockedIp, validateCrawlUrl } from "./ip-guard.js"

// The most important test file in the crawl feature. Every CIDR gets a boundary
// pair — an address just inside and just outside — because an off-by-one in a
// mask is the realistic way this fails, not a missing range.

describe("isBlockedIp — IPv4", () => {
  const blocked = [
    "0.0.0.0", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255",
    "127.0.0.1", "127.255.255.255", "169.254.169.254", "169.254.0.1",
    "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.5", "192.88.99.1",
    "192.168.0.1", "192.168.255.255", "198.18.0.1", "198.19.255.255",
    "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.255",
    "240.0.0.1", "255.255.255.255",
  ]
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => expect(isBlockedIp(ip)).not.toBeNull())
  }

  // Boundary partners — one address outside each range that must stay allowed.
  const allowed = [
    "8.8.8.8", "1.1.1.1", "9.255.255.255", "11.0.0.1",
    "100.63.255.255", "100.128.0.1",
    "126.255.255.255", "128.0.0.1",
    "169.253.255.255", "169.255.0.1",
    "172.15.255.255", "172.32.0.1",
    "192.167.255.255", "192.169.0.1",
    "198.17.255.255", "198.20.0.1",
    "223.255.255.255",
  ]
  for (const ip of allowed) {
    it(`allows ${ip}`, () => expect(isBlockedIp(ip)).toBeNull())
  }
})

describe("isBlockedIp — IPv6", () => {
  const blocked = [
    "::1", "::", "fc00::1", "fd12:3456:789a::1", "fe80::1", "febf::1",
    "ff02::1", "64:ff9b::7f00:1",
  ]
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => expect(isBlockedIp(ip)).not.toBeNull())
  }

  it("allows a public v6 address", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBeNull()
  })

  it("strips brackets and zone ids", () => {
    expect(isBlockedIp("[::1]")).not.toBeNull()
    expect(isBlockedIp("fe80::1%eth0")).not.toBeNull()
  })

  // A v4 target smuggled inside a v6 address is the classic bypass.
  it("unwraps IPv4-mapped addresses and re-checks them", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toContain("embedded_v4")
    expect(isBlockedIp("::ffff:10.0.0.1")).toContain("embedded_v4")
    expect(isBlockedIp("::ffff:169.254.169.254")).toContain("embedded_v4")
    expect(isBlockedIp("::ffff:8.8.8.8")).toBeNull()
  })

  it("unwraps 6to4 addresses and re-checks them", () => {
    expect(isBlockedIp("2002:7f00:0001::")).toContain("embedded_v4") // 127.0.0.1
    expect(isBlockedIp("2002:0808:0808::")).toBeNull()               // 8.8.8.8
  })

  it("rejects nonsense rather than passing it through", () => {
    expect(isBlockedIp("not-an-ip")).toBe("unparseable_ip")
    expect(isBlockedIp("1:2:3")).toBe("unparseable_ip")
  })
})

describe("validateCrawlUrl", () => {
  it("accepts an ordinary https site", () => {
    const r = validateCrawlUrl("https://www.example.com/pricing")
    expect(r.ok).toBe(true)
    expect(r.ok && r.url.hostname).toBe("www.example.com")
  })

  it("accepts explicit :443 and :80", () => {
    expect(validateCrawlUrl("https://example.com:443/").ok).toBe(true)
    expect(validateCrawlUrl("http://example.com:80/").ok).toBe(true)
  })

  const rejected: [string, string][] = [
    ["file:///etc/passwd", "blocked_scheme"],
    ["ftp://example.com/x", "blocked_scheme"],
    ["gopher://example.com/", "blocked_scheme"],
    ["javascript:alert(1)", "blocked_scheme"],
    ["data:text/html,hi", "blocked_scheme"],
    ["http://user:pass@example.com/", "credentials_in_url"],
    // Our own services on the shared docker network.
    ["http://example.com:6379/", "blocked_port"],
    ["http://example.com:5432/", "blocked_port"],
    ["http://example.com:4100/", "blocked_port"],
    ["http://localhost/", "blocked_hostname"],
    ["http://foo.localhost/", "blocked_hostname"],
    ["http://printer.local/", "blocked_hostname"],
    ["http://svc.internal/", "blocked_hostname"],
    ["http://metadata.google.internal/", "blocked_hostname"],
    // Container names resolve on our own network.
    ["http://postgres/", "hostname_without_dot"],
    ["http://redis/", "hostname_without_dot"],
    ["not a url", "unparseable_url"],
  ]
  for (const [url, reason] of rejected) {
    it(`rejects ${url} (${reason})`, () => {
      const r = validateCrawlUrl(url)
      expect(r.ok).toBe(false)
      expect(!r.ok && r.reason).toBe(reason)
    })
  }

  it("names ::1 loopback rather than an embedded IPv4", () => {
    // ::1 sits inside ::/96, so the IPv4-compatible rule used to claim it and
    // report a 0.0.0.0/8 block. Blocked either way, but the reason must be true.
    expect(isBlockedIp("::1")).toBe("blocked_ipv6_loopback")
    expect(isBlockedIp("::")).toBe("blocked_ipv6_unspecified")
    // A genuine mapped address still reports as one.
    expect(isBlockedIp("::ffff:127.0.0.1")).toMatch(/^embedded_v4_/)
  })

  // The four literals normalizeWebsite() accepts today — the gap this closes.
  const literals = ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/", "http://[::1]/"]
  for (const url of literals) {
    it(`rejects the IP literal ${url}`, () => {
      const r = validateCrawlUrl(url)
      expect(r.ok).toBe(false)
      expect(!r.ok && r.reason).toMatch(/blocked_ipv/)
    })
  }

  it("allows a public IP literal", () => {
    expect(validateCrawlUrl("http://8.8.8.8/").ok).toBe(true)
  })
})
