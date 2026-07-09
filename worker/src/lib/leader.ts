import { randomUUID } from "node:crypto"
import { getRedis } from "../queue/redis.js"
import { logger } from "./logger.js"

// Single-leader election for the worker.
//
// The worker holds every agent's WhatsApp socket IN MEMORY, so exactly ONE
// instance may run the session subsystem. If two instances each connect the same
// account, WhatsApp repeatedly terminates the older connection ("Connection
// Terminated" / 428). The lost delivery-acks during that churn make WhatsApp
// RETRANSMIT outgoing messages, so a customer receives the same reply 2–3× even
// though the app sent it once. This lock guarantees only the leader connects
// sessions and processes send jobs; other instances stand by (health only) and
// take over if the leader exits or dies.
//
// FAIL-OPEN: if Redis is unavailable we act as leader rather than block the only
// worker from ever starting — worst case is today's behaviour, never worse.

const LOCK_KEY = "worker:session-leader"
const LEASE_MS = 30_000 // lock lease; a dead leader is replaceable after this
const RENEW_MS = 10_000 // heartbeat — must be well under LEASE_MS
const RETRY_MS = 5_000 // how often a standby retries to take over

const instanceId = `${process.pid}-${randomUUID()}`
let isLeaderFlag = false
let renewTimer: ReturnType<typeof setInterval> | null = null

// Renew/release only if WE still own the key (compare-and-act), so we never
// stomp a lock a different instance has since taken.
const RENEW_LUA = `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('pexpire',KEYS[1],ARGV[2]) else return 0 end`
const RELEASE_LUA = `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** True once THIS instance holds session leadership. Cheap synchronous check. */
export function isLeader(): boolean {
  return isLeaderFlag
}

/**
 * Block until this instance is the session leader. Returns immediately for the
 * sole/first instance; a standby resolves only after it wins the lease (the
 * previous leader shut down or its lease expired).
 */
export async function becomeLeader(): Promise<void> {
  const redis = getRedis()
  for (;;) {
    let acquired = false
    try {
      acquired = (await redis.set(LOCK_KEY, instanceId, "PX", LEASE_MS, "NX")) === "OK"
    } catch (err) {
      // Redis unreachable — don't strand the only worker. Proceed as leader.
      logger.warn({ err }, "[leader] Redis unavailable — proceeding as leader (fail-open)")
      isLeaderFlag = true
      startRenew()
      return
    }
    if (acquired) {
      isLeaderFlag = true
      logger.info({ instanceId }, "[leader] Acquired session leadership")
      startRenew()
      return
    }
    logger.info("[leader] Another worker holds session leadership — standing by (health only)")
    await sleep(RETRY_MS)
  }
}

function startRenew(): void {
  if (renewTimer) return
  const redis = getRedis()
  renewTimer = setInterval(async () => {
    try {
      const ok = await redis.eval(RENEW_LUA, 1, LOCK_KEY, instanceId, String(LEASE_MS))
      // ok === 0 means we lost the lease (a Redis blip longer than LEASE_MS let
      // another instance take over). Re-assert: if nobody holds it, take it back;
      // otherwise yield leadership so we stop touching sessions.
      if (ok === 0) {
        const retook = (await redis.set(LOCK_KEY, instanceId, "PX", LEASE_MS, "NX")) === "OK"
        if (!retook) {
          logger.error("[leader] Lost session leadership to another instance — yielding")
          isLeaderFlag = false
        }
      }
    } catch (err) {
      // Transient Redis error — keep leadership (fail-open) and retry next tick.
      logger.warn({ err }, "[leader] Lease renew failed (keeping leadership, will retry)")
    }
  }, RENEW_MS)
  renewTimer.unref?.()
}

/** Release leadership on graceful shutdown so a standby takes over immediately. */
export async function releaseLeadership(): Promise<void> {
  if (renewTimer) {
    clearInterval(renewTimer)
    renewTimer = null
  }
  if (!isLeaderFlag) return
  isLeaderFlag = false
  try {
    await getRedis().eval(RELEASE_LUA, 1, LOCK_KEY, instanceId)
    logger.info("[leader] Released session leadership")
  } catch (err) {
    logger.warn({ err }, "[leader] Failed to release leadership (lease will expire)")
  }
}
