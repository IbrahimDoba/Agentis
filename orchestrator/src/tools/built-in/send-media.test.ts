import { describe, it, expect } from "vitest"
import { mediaKindFromMime } from "./send-image.js"

describe("mediaKindFromMime", () => {
    it("classifies images", () => {
        expect(mediaKindFromMime("image/jpeg")).toBe("image")
        expect(mediaKindFromMime("image/png")).toBe("image")
        expect(mediaKindFromMime("image/webp")).toBe("image")
    })
    it("classifies videos", () => {
        expect(mediaKindFromMime("video/mp4")).toBe("video")
        expect(mediaKindFromMime("video/quicktime")).toBe("video")
    })
    it("treats everything else as a document", () => {
        expect(mediaKindFromMime("application/pdf")).toBe("document")
        expect(mediaKindFromMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("document")
        expect(mediaKindFromMime("text/csv")).toBe("document")
        expect(mediaKindFromMime("application/octet-stream")).toBe("document")
    })
})
