import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "@/lib/db"
import { creditsForTokens } from "@/lib/credits"
import {
  routeMessageCharge,
  allowsOverage,
  chargeApiTurn,
  getRemainingCredits,
  preflightApiCharge,
  type AgentBillingContext,
} from "./apiBilling"

describe("apiBilling — routeMessageCharge (pure truth table)", () => {
  it("bills to plan when it fits", () => {
    expect(routeMessageCharge({ creditsToCharge: 10, planLimit: 100, used: 50, overageAllowed: false })).toEqual({
      billedTo: "plan",
      needsWalletDeduction: false,
    })
  })

  it("bills to plan for unlimited (enterprise)", () => {
    expect(routeMessageCharge({ creditsToCharge: 999999, planLimit: -1, used: 0, overageAllowed: false })).toEqual({
      billedTo: "plan",
      needsWalletDeduction: false,
    })
  })

  it("bills overflow to plan when overage is allowed (starter/pro)", () => {
    expect(routeMessageCharge({ creditsToCharge: 60, planLimit: 100, used: 80, overageAllowed: true })).toEqual({
      billedTo: "plan",
      needsWalletDeduction: false,
    })
  })

  it("bills overflow to wallet when overage is NOT allowed (free/basic)", () => {
    expect(routeMessageCharge({ creditsToCharge: 60, planLimit: 100, used: 80, overageAllowed: false })).toEqual({
      billedTo: "wallet",
      needsWalletDeduction: true,
    })
  })

  it("exact-fit at the boundary stays on plan", () => {
    expect(routeMessageCharge({ creditsToCharge: 20, planLimit: 100, used: 80, overageAllowed: false })).toEqual({
      billedTo: "plan",
      needsWalletDeduction: false,
    })
  })
})

describe("apiBilling — allowsOverage", () => {
  it("no plan allows overage — every plan falls back to PAYG then stops", () => {
    expect(allowsOverage("starter")).toBe(false)
    expect(allowsOverage("pro")).toBe(false)
    expect(allowsOverage("free")).toBe(false)
    expect(allowsOverage("basic")).toBe(false)
  })
})

describe("apiBilling — chargeApiTurn / remaining (real DB)", () => {
  let userId: string
  let agentId: string
  const email = `vitest-apibilling-${Date.now()}@example.test`

  async function makeAgent(): Promise<string> {
    const a = await db.agent.create({
      data: {
        userId,
        businessName: "co",
        businessDescription: "d",
        productsServices: "p",
        faqs: "f",
        operatingHours: "9-5",
      },
      select: { id: true },
    })
    return a.id
  }

  beforeAll(async () => {
    const u = await db.user.create({
      data: { email, name: "billing user", businessName: "co", plan: "free" },
      select: { id: true },
    })
    userId = u.id
    agentId = await makeAgent()
  })

  afterAll(async () => {
    await db.creditUsage.deleteMany({ where: { agentId } })
    await db.agent.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  const ctx = (): AgentBillingContext => ({ userId, plan: "free", subscriptionExpiresAt: null, currentPeriodStart: null, carryoverCredits: 0, carryoverExpiresAt: null })

  it("records a CreditUsage row with source='api' billed to plan when it fits", async () => {
    const inputTokens = 100
    const outputTokens = 20
    const expected = creditsForTokens(inputTokens, outputTokens)

    const res = await chargeApiTurn({ agentId, conversationId: null, ctx: ctx(), inputTokens, outputTokens })
    expect(res.credits).toBe(expected)
    expect(res.billedTo).toBe("plan")

    const row = await db.creditUsage.findFirst({
      where: { agentId, source: "api" },
      orderBy: { createdAt: "desc" },
    })
    expect(row?.source).toBe("api")
    expect(row?.creditsUsed).toBe(expected)
    expect(row?.tokensInput).toBe(inputTokens)
    expect(row?.tokensOutput).toBe(outputTokens)
    expect(row?.billedTo).toBe("plan")
  })

  it("falls back to the wallet once the free plan is exhausted", async () => {
    // Dedicated agent + a future subscription window so the seeded usage counts.
    const walletAgentId = await makeAgent()
    const future = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    const walletCtx: AgentBillingContext = { userId, plan: "free", subscriptionExpiresAt: future, currentPeriodStart: null, carryoverCredits: 0, carryoverExpiresAt: null }

    // Exhaust the free plan (limit 1000) within the billing window.
    await db.creditUsage.create({
      data: { agentId: walletAgentId, messageType: "text", source: "ai", creditsUsed: 1000, billedTo: "plan" },
    })
    // Fund the wallet.
    await db.user.update({
      where: { id: userId },
      data: { creditBalance: 100, creditsExpireAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    })

    const res = await chargeApiTurn({
      agentId: walletAgentId,
      conversationId: null,
      ctx: walletCtx,
      inputTokens: 100,
      outputTokens: 10,
    })
    expect(res.billedTo).toBe("wallet")

    const user = await db.user.findUnique({ where: { id: userId }, select: { creditBalance: true } })
    expect(user?.creditBalance).toBe(100 - res.credits)

    await db.creditUsage.deleteMany({ where: { agentId: walletAgentId } })
    await db.agent.deleteMany({ where: { id: walletAgentId } })
  })

  it("preflight blocks an expired subscription", async () => {
    const past = new Date(Date.now() - 1000)
    const res = await preflightApiCharge({ userId, plan: "free", subscriptionExpiresAt: past, currentPeriodStart: null, carryoverCredits: 0, carryoverExpiresAt: null })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe("SUBSCRIPTION_EXPIRED")
  })

  it("getRemainingCredits sums account-wide plan room + wallet", async () => {
    // Per-account: clear ALL the user's usage so the full plan allowance is free,
    // then set a known wallet balance.
    const userAgents = await db.agent.findMany({ where: { userId }, select: { id: true } })
    await db.creditUsage.deleteMany({ where: { agentId: { in: userAgents.map((a) => a.id) } } })
    await db.user.update({ where: { id: userId }, data: { creditBalance: 50, creditsExpireAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) } })
    const remaining = await getRemainingCredits({ userId, plan: "free", subscriptionExpiresAt: null, currentPeriodStart: null, carryoverCredits: 0, carryoverExpiresAt: null })
    // free plan limit 1000, no usage + 50 wallet
    expect(remaining).toBe(1000 + 50)
  })
})
