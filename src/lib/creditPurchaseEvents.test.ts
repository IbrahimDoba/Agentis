import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { applyChargeSuccess } from "./creditPurchaseEvents"
import { getBalance } from "./creditWallet"
import { nextCreditExpiry } from "./credits"

// Real DB tests of the Paystack webhook side-effect. Seeds a User + a PENDING
// CreditPurchase per test; verifies the idempotent transition and exact
// credit grant. No mocking — same rule as the rest of the suite.
describe("applyChargeSuccess (real DB)", () => {
  let userId: string
  const email = `vitest-payg-${Date.now()}@example.test`

  beforeAll(async () => {
    const u = await db.user.create({
      data: { email, name: "vitest payg user", businessName: "vitest co" },
      select: { id: true },
    })
    userId = u.id
  })

  afterAll(async () => {
    await db.creditPurchase.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  beforeEach(async () => {
    await db.creditPurchase.deleteMany({ where: { userId } })
    await db.user.update({
      where: { id: userId },
      data: { creditBalance: 0, creditsExpireAt: null },
    })
  })

  async function seedPending(reference: string, creditsAdded = 13000, amountNaira = 20000) {
    return db.creditPurchase.create({
      data: {
        userId,
        reference,
        amountNaira,
        netNaira: amountNaira - 400, // pre-fee estimate
        creditsAdded,
        unitRateNGN: 1.54,
        status: "PENDING",
        expiresAt: nextCreditExpiry(),
      },
    })
  }

  it("transitions PENDING → PAID and grants credits", async () => {
    const ref = `vitest-grant-${Date.now()}`
    await seedPending(ref, 13000, 20000)

    const out = await applyChargeSuccess({ reference: ref, actualFeeNaira: 400 })

    expect(out.result).toBe("granted")
    if (out.result === "granted") expect(out.creditsAdded).toBe(13000)

    const row = await db.creditPurchase.findUnique({ where: { reference: ref } })
    expect(row?.status).toBe("PAID")
    expect(row?.completedAt).toBeTruthy()
    expect(row?.netNaira).toBe(19600) // 20000 - 400 actual fee

    const wallet = await getBalance(userId)
    expect(wallet.creditBalance).toBe(13000)
    expect(wallet.creditsExpireAt).not.toBeNull()
  })

  it("is idempotent — replay of the same event is a no-op", async () => {
    const ref = `vitest-idem-${Date.now()}`
    await seedPending(ref, 5000)

    await applyChargeSuccess({ reference: ref })
    const second = await applyChargeSuccess({ reference: ref })

    expect(second.result).toBe("already_processed")
    const wallet = await getBalance(userId)
    expect(wallet.creditBalance).toBe(5000) // NOT 10000
  })

  it("returns unknown_reference and does NOT credit when the row is missing", async () => {
    const out = await applyChargeSuccess({ reference: "never-existed-ref-" + Date.now() })
    expect(out.result).toBe("unknown_reference")
    expect((await getBalance(userId)).creditBalance).toBe(0)
  })

  it("refuses to retro-complete a non-pending row (e.g. CANCELLED)", async () => {
    const ref = `vitest-cancelled-${Date.now()}`
    await seedPending(ref, 1000)
    await db.creditPurchase.update({
      where: { reference: ref },
      data: { status: "CANCELLED" },
    })

    const out = await applyChargeSuccess({ reference: ref })
    expect(out.result).toBe("non_pending_skipped")
    if (out.result === "non_pending_skipped") expect(out.status).toBe("CANCELLED")
    expect((await getBalance(userId)).creditBalance).toBe(0)
  })

  it("concurrent deliveries credit ONCE (race-safe)", async () => {
    const ref = `vitest-race-${Date.now()}`
    await seedPending(ref, 7777)

    // Fire 5 concurrent webhook applications for the SAME reference.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => applyChargeSuccess({ reference: ref }))
    )

    const granted = results.filter((r) => r.result === "granted").length
    expect(granted).toBe(1)
    // The other 4 should be either already_processed or race_lost.
    for (const r of results) {
      expect(["granted", "already_processed", "race_lost"]).toContain(r.result)
    }

    const wallet = await getBalance(userId)
    expect(wallet.creditBalance).toBe(7777) // NOT 38885 (= 5 × 7777)
  })

  it("preserves the pre-fee netNaira estimate when actualFeeNaira is omitted", async () => {
    const ref = `vitest-no-fee-${Date.now()}`
    await seedPending(ref, 1000, 5000)
    // pre-fee estimate from seedPending was 5000 - 400 = 4600

    await applyChargeSuccess({ reference: ref })
    const row = await db.creditPurchase.findUnique({ where: { reference: ref } })
    expect(row?.netNaira).toBe(4600) // unchanged
  })
})
