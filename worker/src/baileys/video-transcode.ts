import { spawn } from "child_process"
import { createWriteStream } from "fs"
import { mkdtemp, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { Readable } from "stream"
import { pipeline } from "stream/promises"
import type { ReadableStream as WebReadableStream } from "stream/web"
import { transcodeArgs, MAX_STATUS_VIDEO_SECONDS } from "./status-post.js"

// Mirrors STATUS_VIDEO_MAX_BYTES in orchestrator/src/lib/media-upload.ts.
const MAX_SOURCE_BYTES = 100 * 1024 * 1024
const TOO_LARGE = "Video is larger than 100MB"

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    child.stdout.on("data", (d) => { out += d })
    child.stderr.on("data", (d) => { err += d })
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs)
    child.on("error", (e) => { clearTimeout(timer); reject(e) })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 300)}`))
    })
  })
}

// Streamed to disk: this process holds every live WhatsApp socket, so a source
// video shouldn't sit in its memory. The running count covers a missing or wrong
// Content-Length.
export async function downloadSource(url: string, file: string, maxBytes = MAX_SOURCE_BYTES): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Couldn't download the video (${res.status})`)
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new Error(TOO_LARGE)
  await pipeline(
    Readable.fromWeb(res.body as WebReadableStream),
    async function* (source: AsyncIterable<Buffer>) {
      let total = 0
      for await (const chunk of source) {
        total += chunk.length
        if (total > maxBytes) throw new Error(TOO_LARGE)
        yield chunk
      }
    },
    createWriteStream(file),
  )
}

// `nice -n 19` + one thread: this shares a 4-core box with every agent's
// replies, so a status video waits for spare CPU instead of competing for it.
export async function transcodeStatusVideo(url: string): Promise<{ buffer: Buffer; seconds: number }> {
  const dir = await mkdtemp(path.join(tmpdir(), "status-video-"))
  try {
    const input = path.join(dir, "in")
    const output = path.join(dir, "out.mp4")
    await downloadSource(url, input)
    await run("nice", ["-n", "19", "ffmpeg", ...transcodeArgs(input, output)], 5 * 60_000)
    const probed = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], 30_000)
    const seconds = Math.min(MAX_STATUS_VIDEO_SECONDS, Math.max(1, Math.round(Number(probed.trim()) || 0)))
    return { buffer: await readFile(output), seconds }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
