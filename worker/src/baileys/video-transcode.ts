import { spawn } from "child_process"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { transcodeArgs, MAX_STATUS_VIDEO_SECONDS } from "./status-post.js"

const MAX_SOURCE_BYTES = 64 * 1024 * 1024

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

// `nice -n 19` + one thread: this shares a 4-core box with every agent's
// replies, so a status video waits for spare CPU instead of competing for it.
export async function transcodeStatusVideo(url: string): Promise<{ buffer: Buffer; seconds: number }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn't download the video (${res.status})`)
  const declared = Number(res.headers.get("content-length") ?? 0)
  if (declared > MAX_SOURCE_BYTES) throw new Error("Video is larger than 64MB")
  const source = Buffer.from(await res.arrayBuffer())
  if (source.length > MAX_SOURCE_BYTES) throw new Error("Video is larger than 64MB")

  const dir = await mkdtemp(path.join(tmpdir(), "status-video-"))
  try {
    const input = path.join(dir, "in")
    const output = path.join(dir, "out.mp4")
    await writeFile(input, source)
    await run("nice", ["-n", "19", "ffmpeg", ...transcodeArgs(input, output)], 5 * 60_000)
    const probed = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], 30_000)
    const seconds = Math.min(MAX_STATUS_VIDEO_SECONDS, Math.max(1, Math.round(Number(probed.trim()) || 0)))
    return { buffer: await readFile(output), seconds }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
