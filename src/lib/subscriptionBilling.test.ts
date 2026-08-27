import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { db } from "@/lib/db"
import {
  applySubscriptionCharge,
  markSubscriptionChargeFailed,
  cancelSubscription,
  scheduleDowngrade,
  downgradeToFree,
  addOneMonth,
} from "./subscriptionBilling"

// Real DB tests — same rule as the rest of the suite (no mocking). Requires the
// 20260621000000_subscription_billing migration applied to the local dev DB:
//   npx prisma migrate deploy
// Seeds a User + a PENDING SubscriptionCharge per test and verifies the
// idempotent activation, the concurrent-delivery race, and lifecycle moves.

const AUTH = {
  authorization_code: "AUTH_vitest_123",
  last4: "4081",
  exp_month: "12",
  exp_year: "2030",
  brand: "visa",
  reusable: true,
}

describe("subscriptionBilling (real DB)", () => {
  let userId: string
  const email = `vitest-sub-${Date.now()}@example.test`

  beforeAll(async () => {
    const u = await db.user.create({
      data: { email, name: "vitest sub user", businessName: "vitest co" },
      select: { id: true },
    })
    userId = u.id
  })

  afterAll(async () => {
    await db.subscriptionCharge.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  beforeEach(async () => {
    await db.subscriptionCharge.deleteMany({ where: { userId } })
    await db.user.update({
      where: { id: userId },
      data: {
        plan: "free", subscriptionExpiresAt: null, subscriptionStatus: "none",
        autoRenew: false, cancelAtPeriodEnd: false, pendingPlan: null,
        renewalRetryCount: 0, paystackAuthorizationCode: null,
        authorizationReusable: false, cardLast4: null,
      },
    })
  })

  async function seedPending(reference: string, opts?: { plan?: string; kind?: string; amountNaira?: number }) {
    const plan = opts?.plan ?? "starter"
    const amountNaira = opts?.amountNaira ?? 35000
    const periodStart = new Date()
    return db.subscriptionCharge.create({
      data: {
        userId, plan, reference, kind: opts?.kind ?? "initial",
        planNaira: amountNaira, overageNaira: 0, amountNaira, netNaira: amountNaira,
        status: "PENDING", periodStart, periodEnd: addOneMonth(periodStart),
      },
    })
  }

  it("activates: sets plan, expiry, status, stores the card, applies fee", async () => {
    const ref = `t_activate_${Date.now()}`
    await seedPending(ref, { plan: "starter", amountNaira: 35000 })

    const out = await applySubscriptionCharge({ reference: ref, authorization: AUTH, actualFeeNaira: 200 })
    expect(out.result).toBe("activated")

    const u = await db.user.findUnique({ where: { id: userId } })
    expect(u?.plan).toBe("starter")
    expect(u?.subscriptionStatus).toBe("active")
    expect(u?.autoRenew).toBe(true)
    expect(u?.authorizationReusable).toBe(true)
    expect(u?.paystackAuthorizationCode).toBe(AUTH.authorization_code)
    expect(u?.cardLast4).toBe("4081")
    expect(u?.subscriptionExpiresAt).toBeTruthy()

    const charge = await db.subscriptionCharge.findUnique({ where: { reference: ref } })
    expect(charge?.status).toBe("PAID")
    expect(charge?.netNaira).toBe(35000 - 200) // amount minus actual fee
  })

  it("is idempotent — a second delivery doesn't re-extend", async () => {
    const ref = `t_idem_${Date.now()}`
    await seedPending(ref)

    const first = await applySubscriptionCharge({ reference: ref, authorization: AUTH })
    expect(first.result).toBe("activated")
    const expiry1 = (await db.user.findUnique({ where: { id: userId } }))?.subscriptionExpiresAt

    const second = await applySubscriptionCharge({ reference: ref, authorization: AUTH })
    expect(second.result).toBe("already_processed")
    const expiry2 = (await db.user.findUnique({ where: { id: userId } }))?.subscriptionExpiresAt

    expect(expiry2?.getTime()).toBe(expiry1?.getTime()) // not double-extended
  })

  it("concurrent deliveries activate exactly once (race-safe)", async () => {
    const ref = `t_race_${Date.now()}`
    await seedPending(ref)

    const results = await Promise.all(
      Array.from({ length: 5 }, () => applySubscriptionCharge({ reference: ref, authorization: AUTH }))
    )
    expect(results.filter((r) => r.result === "activated").length).toBe(1)

    const charge = await db.subscriptionCharge.findUnique({ where: { reference: ref } })
    expect(charge?.status).toBe("PAID")
  })

  it("unknown reference → unknown_reference", async () => {
    const out = await applySubscriptionCharge({ reference: `nope_${Date.now()}` })
    expect(out.result).toBe("unknown_reference")
  })

  it("non-pending charge is skipped", async () => {
    const ref = `t_failed_${Date.now()}`
    await seedPending(ref)
    await db.subscriptionCharge.update({ where: { reference: ref }, data: { status: "FAILED" } })
    const out = await applySubscriptionCharge({ reference: ref, authorization: AUTH })
    expect(out.result).toBe("non_pending_skipped")
  })

  it("markSubscriptionChargeFailed flips PENDING → FAILED", async () => {
    const ref = `t_mark_${Date.now()}`
    await seedPending(ref)
    await markSubscriptionChargeFailed(ref, "insufficient funds")
    const charge = await db.subscriptionCharge.findUnique({ where: { reference: ref } })
    expect(charge?.status).toBe("FAILED")
    expect(charge?.failureReason).toContain("insufficient")
  })

  it("scheduleDowngrade sets pendingPlan", async () => {
    await scheduleDowngrade(userId, "basic")
    const u = await db.user.findUnique({ where: { id: userId } })
    expect(u?.pendingPlan).toBe("basic")
  })

  it("cancelSubscription turns off auto-renew but keeps the plan", async () => {
    await db.user.update({
      where: { id: userId },
      data: { plan: "pro", subscriptionExpiresAt: addOneMonth(new Date()), autoRenew: true, subscriptionStatus: "active" },
    })
    await cancelSubscription(userId)
    const u = await db.user.findUnique({ where: { id: userId } })
    expect(u?.autoRenew).toBe(false)
    expect(u?.cancelAtPeriodEnd).toBe(true)
    expect(u?.subscriptionStatus).toBe("cancelled")
    expect(u?.plan).toBe("pro") // access retained until period end
  })

  it("downgradeToFree resets to the free plan", async () => {
    await db.user.update({
      where: { id: userId },
      data: { plan: "pro", subscriptionExpiresAt: new Date(), autoRenew: true, subscriptionStatus: "active" },
    })
    await downgradeToFree(userId)
    const u = await db.user.findUnique({ where: { id: userId } })
    expect(u?.plan).toBe("free")
    // Lapsed accounts land on the "choose a plan" wall: expiry is set to a PAST
    // timestamp (trial already expired), not null, and the cycle anchor clears
    // so a re-subscribe starts a fresh window.
    expect(u?.subscriptionExpiresAt).not.toBeNull()
    expect(u!.subscriptionExpiresAt!.getTime()).toBeLessThan(Date.now())
    expect(u?.currentPeriodStart).toBeNull()
    expect(u?.subscriptionStatus).toBe("none")
    expect(u?.autoRenew).toBe(false)
  })
})
