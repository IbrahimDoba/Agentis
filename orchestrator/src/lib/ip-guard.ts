// URL and IP validation for fetching operator-supplied websites.
//
// Pure — no network, no DNS, no I/O — so every rule below is unit-testable.
// This is the first server-side guard on a user-supplied URL in this repo, and
// it matters more here than it would elsewhere: in production the orchestrator
// shares a docker network with Postgres, Redis and the WhatsApp worker, so an
// unguarded fetcher reaches straight into them.

export interface UrlCheck {
  ok: boolean
  /** Machine-readable reason, used in tests and logs. */
  reason?: string
  url?: URL
}

/** Only these two. Blocks file:, gopher:, data:, javascript: and friends. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])

/**
 * Belt to the IP check's braces. Even if an address check were somehow bypassed,
 * the interesting targets on our own network all listen elsewhere: 4100
 * (orchestrator), 4000 (worker), 6379 (Redis), 5432 (Postgres).
 */
const ALLOWED_PORTS = new Set(["", "80", "443"])

/** Hostnames that never point anywhere we want to go. */
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".onion", ".home.arpa"]
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"])

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

// [network, prefix length] pairs, all rejected.
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],        // "this network"
  ["10.0.0.0", 8],       // private
  ["100.64.0.0", 10],    // CGNAT
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local — includes 169.254.169.254, the cloud metadata endpoint
  ["172.16.0.0", 12],    // private
  ["192.0.0.0", 24],     // IETF protocol assignments
  ["192.0.2.0", 24],     // TEST-NET-1
  ["192.88.99.0", 24],   // 6to4 relay anycast
  ["192.168.0.0", 16],   // private
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // TEST-NET-2
  ["203.0.113.0", 24],   // TEST-NET-3
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved, includes 255.255.255.255
]

function inV4Cidr(ipInt: number, network: string, bits: number): boolean {
  const net = ipv4ToInt(network)
  if (net === null) return false
  // >>> 0 keeps the mask unsigned; a /0 would shift by 32 which is a no-op in JS.
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0
  return (ipInt & mask) >>> 0 === (net & mask) >>> 0
}

function expandIpv6(ip: string): string[] | null {
  let clean = ip.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase()
  if (!clean.includes(":")) return null

  // ::ffff:127.0.0.1 writes its last 32 bits as a dotted quad. Fold it into two
  // hex groups first, or the ":" split below yields "127.0.0.1" as a group and
  // parseInt gives silently wrong bytes.
  const dotted = clean.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) {
    const v4 = ipv4ToInt(dotted[2])
    if (v4 === null) return null
    const hi = ((v4 >>> 16) & 0xffff).toString(16)
    const lo = (v4 & 0xffff).toString(16)
    clean = `${dotted[1]}${hi}:${lo}`
  }

  const halves = clean.split("::")
  if (halves.length > 2) return null

  const toGroups = (s: string) => (s === "" ? [] : s.split(":"))
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []

  const groups = halves.length === 2
    ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail]
    : head

  if (groups.length !== 8) return null
  return groups.map((g) => (g === "" ? "0" : g))
}

/**
 * An IPv4 address embedded in IPv6 — ::ffff:127.0.0.1 (mapped) and 2002::/16
 * (6to4) both smuggle a v4 target past a naive v6-only check.
 */
function embeddedV4(groups: string[]): string | null {
  const isMapped = groups.slice(0, 5).every((g) => parseInt(g, 16) === 0) && parseInt(groups[5], 16) === 0xffff
  const isCompat = groups.slice(0, 6).every((g) => parseInt(g, 16) === 0)
  if (isMapped || isCompat) {
    const a = parseInt(groups[6], 16)
    const b = parseInt(groups[7], 16)
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    return `${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`
  }
  if (parseInt(groups[0], 16) === 0x2002) {
    const a = parseInt(groups[1], 16)
    const b = parseInt(groups[2], 16)
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    return `${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`
  }
  return null
}

/**
 * Is this address one we must never connect to? Returns a reason string when
 * blocked, or null when the address is safe to use.
 */
export function isBlockedIp(ip: string): string | null {
  const raw = ip.replace(/^\[|\]$/g, "").split("%")[0]

  const asV4 = ipv4ToInt(raw)
  if (asV4 !== null) {
    for (const [net, bits] of BLOCKED_V4) {
      if (inV4Cidr(asV4, net, bits)) return `blocked_ipv4_${net}/${bits}`
    }
    return null
  }

  const groups = expandIpv6(raw)
  if (!groups) return "unparseable_ip"

  const v4 = embeddedV4(groups)
  if (v4) {
    const nested = isBlockedIp(v4)
    return nested ? `embedded_v4_${nested}` : null
  }

  const first = parseInt(groups[0], 16)
  if (groups.every((g) => parseInt(g, 16) === 0)) return "blocked_ipv6_unspecified"
  if (groups.slice(0, 7).every((g) => parseInt(g, 16) === 0) && parseInt(groups[7], 16) === 1) {
    return "blocked_ipv6_loopback"
  }
  if ((first & 0xfe00) === 0xfc00) return "blocked_ipv6_ula"        // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return "blocked_ipv6_link_local" // fe80::/10
  if ((first & 0xff00) === 0xff00) return "blocked_ipv6_multicast"  // ff00::/8
  // 64:ff9b::/96 NAT64 — carries an embedded v4 destination.
  if (first === 0x64 && parseInt(groups[1], 16) === 0xff9b) return "blocked_ipv6_nat64"

  return null
}

/**
 * Validate a URL before we resolve or fetch it. Rejects on scheme, embedded
 * credentials, port, hostname shape, and — when the host is a literal address —
 * the address itself.
 */
export function validateCrawlUrl(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: "unparseable_url" }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: "blocked_scheme" }
  // http://user:pass@evil.example/ — credentials in a URL are only ever an attempt
  // to confuse a parser or a human reading a log.
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" }
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, reason: "blocked_port" }

  // "localhost." and "metadata.google.internal." are valid FQDN spellings that
  // resolve identically; without stripping the dot they match neither list.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  if (!host) return { ok: false, reason: "empty_host" }
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: "blocked_hostname" }
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "blocked_hostname" }

  const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")
  if (looksLikeIp) {
    const blocked = isBlockedIp(host)
    if (blocked) return { ok: false, reason: blocked }
    return { ok: true, url }
  }

  // A hostname with no dot is either a container name on our own network
  // ("postgres", "redis") or a search-domain lookup. Neither is a real website.
  if (!host.includes(".")) return { ok: false, reason: "hostname_without_dot" }

  return { ok: true, url }
}
