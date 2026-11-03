import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createServer, type Server } from "http"
import type { AddressInfo } from "net"
import { mkdtemp, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { downloadSource } from "./video-transcode.js"

const BODY = Buffer.alloc(1024 * 1024, 7)

describe("downloadSource", () => {
  let server: Server
  let base: string
  let dir: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/missing") { res.statusCode = 403; return res.end() }
      if (req.url === "/declared") res.setHeader("content-length", BODY.length)
      // Without a declared length this is sent chunked, so only the count catches it.
      res.end(BODY)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    dir = await mkdtemp(path.join(tmpdir(), "download-source-"))
  })

  afterAll(async () => {
    server.close()
    await rm(dir, { recursive: true, force: true })
  })

  it("writes the file to disk", async () => {
    const file = path.join(dir, "ok")
    await downloadSource(`${base}/declared`, file)
    expect((await readFile(file)).equals(BODY)).toBe(true)
  })

  it("refuses a declared size over the limit", async () => {
    await expect(downloadSource(`${base}/declared`, path.join(dir, "big"), 1024)).rejects.toThrow("larger than 100MB")
  })

  it("stops a body that runs past the limit without declaring its size", async () => {
    await expect(downloadSource(`${base}/chunked`, path.join(dir, "chunked"), 1024)).rejects.toThrow("larger than 100MB")
  })

  it("reports a failed download", async () => {
    await expect(downloadSource(`${base}/missing`, path.join(dir, "no"))).rejects.toThrow("Couldn't download the video (403)")
  })
})
