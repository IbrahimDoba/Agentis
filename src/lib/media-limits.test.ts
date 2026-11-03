import { describe, it, expect } from "vitest"
import { mediaSizeError, mediaSizeLimit, needsDirectUpload, statusMediaSizeError, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "./media-limits"

const MB = 1024 * 1024

describe("mediaSizeLimit", () => {
  it("picks the limit by type and treats anything else as a document", () => {
    expect(mediaSizeLimit("image/png")).toBe(MAX_IMAGE_BYTES)
    expect(mediaSizeLimit("video/mp4")).toBe(MAX_VIDEO_BYTES)
    expect(mediaSizeLimit("application/pdf")).toBe(MAX_DOCUMENT_BYTES)
    expect(mediaSizeLimit("")).toBe(MAX_DOCUMENT_BYTES)
  })
})

describe("mediaSizeError", () => {
  it("allows a file exactly at the limit", () => {
    expect(mediaSizeError(16 * MB, "video/mp4")).toBeNull()
  })

  it("names the file's size and the limit", () => {
    expect(mediaSizeError(48 * MB, "video/mp4")).toBe("This video is 48MB. The limit is 16MB.")
    expect(mediaSizeError(6 * MB, "image/jpeg")).toBe("This image is 6MB. The limit is 5MB.")
    expect(mediaSizeError(30 * MB, "application/pdf")).toBe("This file is 30MB. The limit is 25MB.")
  })

  it("rounds up so a file just over the limit doesn't read as equal to it", () => {
    expect(mediaSizeError(16 * MB + 1, "video/mp4")).toBe("This video is 17MB. The limit is 16MB.")
  })
})

describe("statusMediaSizeError", () => {
  it("gives videos the bigger limit and leaves images alone", () => {
    expect(statusMediaSizeError(100 * MB, "video/mp4")).toBeNull()
    expect(statusMediaSizeError(101 * MB, "video/mp4")).toBe("This video is 101MB. The limit is 100MB.")
    expect(statusMediaSizeError(6 * MB, "image/jpeg")).toBe("This image is 6MB. The limit is 5MB.")
  })
})

describe("needsDirectUpload", () => {
  it("only sends videos past the chat limit down the direct route", () => {
    expect(needsDirectUpload(16 * MB, "video/mp4")).toBe(false)
    expect(needsDirectUpload(16 * MB + 1, "video/mp4")).toBe(true)
    expect(needsDirectUpload(30 * MB, "application/pdf")).toBe(false)
  })
})
