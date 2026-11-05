import { describe, it, expect } from "vitest"
import { autoBuildStepIndex, isAutoBuildInProgress } from "./autoBuild"

describe("isAutoBuildInProgress", () => {
  it("is true only while a build is running", () => {
    expect(isAutoBuildInProgress("auto_creating")).toBe(true)
    expect(isAutoBuildInProgress("auto_waiting")).toBe(false)
    expect(isAutoBuildInProgress("auto_done")).toBe(false)
    // Old auto-configure values on existing agents must not read as a build.
    expect(isAutoBuildInProgress("analyzing")).toBe(false)
    expect(isAutoBuildInProgress(null)).toBe(false)
  })
})

describe("autoBuildStepIndex", () => {
  it("maps each stage to a step", () => {
    expect(autoBuildStepIndex("auto_profile")).toBe(0)
    expect(autoBuildStepIndex("auto_chats")).toBe(1)
    expect(autoBuildStepIndex("auto_ready")).toBe(2)
    expect(autoBuildStepIndex("auto_creating")).toBe(2)
  })
})
