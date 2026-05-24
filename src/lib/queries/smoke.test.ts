import { describe, it, expect } from "vitest"
import { db } from "@/lib/db"

// Sanity check that the vitest harness can reach the real local dev DB and
// that the Prisma client + path alias resolve correctly. If this fails, no
// other DB-backed test will be meaningful.
describe("test harness", () => {
  it("connects to the local dev database", async () => {
    const count = await db.agent.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})
