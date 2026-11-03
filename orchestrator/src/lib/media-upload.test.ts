import { describe, it, expect } from "vitest"
import { CHAT_VIDEO_MAX_BYTES, STATUS_ONLY_TAG, isAgentMediaKey, safeFilename, sendableInChat, tagsForVideo } from "./media-upload.js"

describe("tagsForVideo / sendableInChat", () => {
  it("keeps a video WhatsApp can send in a chat available to the AI", () => {
    expect(tagsForVideo(CHAT_VIDEO_MAX_BYTES)).toEqual([])
    expect(sendableInChat({ tags: tagsForVideo(CHAT_VIDEO_MAX_BYTES) })).toBe(true)
  })

  it("hides anything bigger from the AI", () => {
    expect(tagsForVideo(CHAT_VIDEO_MAX_BYTES + 1)).toEqual([STATUS_ONLY_TAG])
    expect(sendableInChat({ tags: [STATUS_ONLY_TAG] })).toBe(false)
  })

  it("treats older rows without tags as sendable", () => {
    expect(sendableInChat({ tags: null })).toBe(true)
    expect(sendableInChat({})).toBe(true)
  })
})

describe("safeFilename", () => {
  it("strips paths and unsafe characters", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd")
    expect(safeFilename("C:\\videos\\my clip (1).mp4")).toBe("my_clip_1_.mp4")
    expect(safeFilename("...hidden.mov")).toBe("hidden.mov")
  })

  it("falls back when nothing is left, and keeps the extension on long names", () => {
    expect(safeFilename("///")).toBe("video")
    expect(safeFilename(`${"a".repeat(300)}.mp4`).endsWith(".mp4")).toBe(true)
    expect(safeFilename(`${"a".repeat(300)}.mp4`).length).toBe(120)
  })
})

describe("isAgentMediaKey", () => {
  it("accepts only this agent's media keys", () => {
    expect(isAgentMediaKey("media/agent-1/id/v.mp4", "agent-1")).toBe(true)
    expect(isAgentMediaKey("media/agent-2/id/v.mp4", "agent-1")).toBe(false)
    expect(isAgentMediaKey("documents/agent-1/id/v.mp4", "agent-1")).toBe(false)
    expect(isAgentMediaKey("media/agent-1/../agent-2/v.mp4", "agent-1")).toBe(false)
  })
})
