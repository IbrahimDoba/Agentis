import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { getBalance, addCredits, deductFromWallet } from "./creditWallet"
import { CREDIT_EXPIRY_MONTHS } from "./credits"

// Seed a throwaway user per test run; every test resets the wallet state
// before running so concurrent-deduction tests can't interfere with each other.
describe("creditWallet (real DB)", () => {
  let userId: string
  const email = `vitest-wallet-${Date.now()}@example.test`

  beforeAll(async () => {
    const u = await db.user.create({
      data: {
        email,
        name: "vitest wallet user",
        businessName: "vitest co",
      },
      select: { id: true },
    })
    userId = u.id
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: userId } })
  })

  beforeEach(async () => {
    // Reset balance + expiry between tests.
    await db.user.update({
      where: { id: userId },
      data: { creditBalance: 0, creditsExpireAt: null },
    })
  })

  it("getBalance returns 0 for a fresh user", async () => {
    const b = await getBalance(userId)
    expect(b.creditBalance).toBe(0)
    expect(b.creditsExpireAt).toBeNull()
  })

  it("addCredits increments the balance and sets expiry to (now + 12 months)", async () => {
    const before = new Date()
    const b = await addCredits(userId, 5000)
    expect(b.creditBalance).toBe(5000)
    expect(b.creditsExpireAt).not.toBeNull()
    const monthsAhead =
      (b.creditsExpireAt!.getTime() - before.getTime()) / (1000 * 60 * 60 * 24 * 30)
    expect(monthsAhead).toBeGreaterThan(CREDIT_EXPIRY_MONTHS - 1)
    expect(monthsAhead).toBeLessThan(CREDIT_EXPIRY_MONTHS + 1)
  })

  it("addCredits is additive on subsequent calls and refreshes expiry", async () => {
    await addCredits(userId, 1000)
    const firstExpiry = (await getBalance(userId)).creditsExpireAt!
    // Force a small delay so the second expiry is later than the first.
    await new Promise((r) => setTimeout(r, 50))
    await addCredits(userId, 2000)
    const second = await getBalance(userId)
    expect(second.creditBalance).toBe(3000)
    expect(second.creditsExpireAt!.getTime()).toBeGreaterThan(firstExpiry.getTime())
  })

  it("addCredits rejects non-positive amounts", async () => {
    await expect(addCredits(userId, 0)).rejects.toThrow()
    await expect(addCredits(userId, -10)).rejects.toThrow()
  })

  it("deductFromWallet succeeds when balance is sufficient", async () => {
    await addCredits(userId, 1000)
    const r = await deductFromWallet(userId, 300)
    expect(r.ok).toBe(true)
    expect(r.newBalance).toBe(700)
    expect((await getBalance(userId)).creditBalance).toBe(700)
  })

  it("deductFromWallet returns ok=false and does NOT charge when balance is insufficient", async () => {
    await addCredits(userId, 100)
    const r = await deductFromWallet(userId, 500)
    expect(r.ok).toBe(false)
    expect(r.newBalance).toBe(100) // unchanged
    expect((await getBalance(userId)).creditBalance).toBe(100)
  })

  it("deductFromWallet refuses to spend expired credits", async () => {
    // Stamp the user with credits but an expiry in the past (5 minutes ago).
    await db.user.update({
      where: { id: userId },
      data: {
        creditBalance: 5000,
        creditsExpireAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    })
    const r = await deductFromWallet(userId, 100)
    expect(r.ok).toBe(false)

    // getBalance reports 0 spendable even though the raw row has 5000.
    const b = await getBalance(userId)
    expect(b.creditBalance).toBe(0)
    expect(b.rawCreditBalance).toBe(5000)
  })

  it("concurrent deductions never race past zero (atomic SQL)", async () => {
    await addCredits(userId, 100)
    // 20 parallel deductions of 10 each — only 10 can succeed.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => deductFromWallet(userId, 10))
    )
    const successes = results.filter((r) => r.ok).length
    expect(successes).toBe(10)

    const finalBalance = (await getBalance(userId)).creditBalance
    expect(finalBalance).toBe(0)
  })

  it("deductFromWallet treats zero/negative amounts as a no-op", async () => {
    await addCredits(userId, 500)
    const a = await deductFromWallet(userId, 0)
    const b = await deductFromWallet(userId, -100)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect((await getBalance(userId)).creditBalance).toBe(500)
  })

  it("getBalance.rawCreditBalance always returns the stored value (even when expired)", async () => {
    await db.user.update({
      where: { id: userId },
      data: { creditBalance: 1234, creditsExpireAt: new Date(Date.now() - 1000) },
    })
    const b = await getBalance(userId)
    expect(b.rawCreditBalance).toBe(1234)
    expect(b.creditBalance).toBe(0)
  })
})
