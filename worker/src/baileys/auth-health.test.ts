import { describe, it, expect, vi, beforeEach } from "vitest"

// Controllable statfs result — each test sets the volume's free bytes/inodes.
let statfsResult: { bavail: number; bsize: number; files: number; ffree: number }
vi.mock("fs/promises", () => ({
  statfs: vi.fn(async () => statfsResult),
}))
vi.mock("../config.js", () => ({ config: { AUTH_STORAGE_DIR: "/tmp/auth-health-test" } }))
// Stub the logger so mocking config.js doesn't starve pino of LOG_LEVEL.
vi.mock("../lib/logger.js", () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: child() }
})

import {
  assertStorageWritable,
  blockSendReason,
  markAuthUnhealthy,
  clearAuthUnhealthy,
  getStorageStatus,
} from "./auth-health.js"
import { StorageUnwritableError } from "../lib/errors.js"

const healthy = { bavail: 1_000_000, bsize: 4096, files: 2_000_000, ffree: 1_000_000 }
const lowInodes = { bavail: 1_000_000, bsize: 4096, files: 2_000_000, ffree: 100 }
const lowBytes = { bavail: 10, bsize: 4096, files: 2_000_000, ffree: 1_000_000 } // ~40KB

// The statfs read is cached for 5s keyed on Date.now — use fake timers so each
// scenario can bust the cache deterministically by advancing past the TTL.
beforeEach(() => {
  vi.useFakeTimers()
  statfsResult = healthy
})

async function refresh() {
  // Advance past the 5s statfs cache so the next read re-stats.
  vi.advanceTimersByTime(6_000)
  return getStorageStatus()
}

describe("assertStorageWritable", () => {
  it("passes when the volume has ample bytes and inodes", async () => {
    statfsResult = healthy
    await refresh()
    await expect(assertStorageWritable()).resolves.toBeUndefined()
  })

  it("throws StorageUnwritableError when inodes are exhausted", async () => {
    statfsResult = lowInodes
    await refresh()
    await expect(assertStorageWritable()).rejects.toBeInstanceOf(StorageUnwritableError)
  })

  it("throws StorageUnwritableError when bytes are exhausted", async () => {
    statfsResult = lowBytes
    await refresh()
    await expect(assertStorageWritable()).rejects.toBeInstanceOf(StorageUnwritableError)
  })

  it("ignores the inode floor on filesystems that report no inodes (files=0)", async () => {
    statfsResult = { bavail: 1_000_000, bsize: 4096, files: 0, ffree: 0 }
    await refresh()
    await expect(assertStorageWritable()).resolves.toBeUndefined()
  })
})

describe("blockSendReason", () => {
  it("returns null for a healthy agent on a healthy volume", async () => {
    statfsResult = healthy
    await refresh()
    expect(await blockSendReason("agent-1")).toBeNull()
  })

  it("blocks every agent when the volume is below its floor", async () => {
    statfsResult = lowInodes
    await refresh()
    expect(await blockSendReason("agent-1")).toMatch(/inodes low/)
  })

  it("blocks a single agent whose auth write failed, even on a healthy volume", async () => {
    statfsResult = healthy
    await refresh()
    markAuthUnhealthy("agent-2", "keys.set: ENOSPC")
    expect(await blockSendReason("agent-2")).toMatch(/auth-unhealthy/)
    // other agents unaffected
    expect(await blockSendReason("agent-3")).toBeNull()
  })

  it("clears a reactive breaker on a clean reconnect", async () => {
    statfsResult = healthy
    await refresh()
    markAuthUnhealthy("agent-4", "saveCreds: ENOSPC")
    expect(await blockSendReason("agent-4")).toMatch(/auth-unhealthy/)
    clearAuthUnhealthy("agent-4")
    expect(await blockSendReason("agent-4")).toBeNull()
  })

  it("self-clears a stale reactive breaker once the volume is healthy again", async () => {
    statfsResult = healthy
    await refresh()
    markAuthUnhealthy("agent-5", "keys.set: ENOSPC")
    expect(await blockSendReason("agent-5")).toMatch(/auth-unhealthy/)
    // age the mark past the self-clear window on a healthy volume
    vi.advanceTimersByTime(61_000)
    statfsResult = healthy
    await refresh()
    expect(await blockSendReason("agent-5")).toBeNull()
  })
})
