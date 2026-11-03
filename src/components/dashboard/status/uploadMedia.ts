import { needsDirectUpload } from "@/lib/media-limits"

type OnProgress = (percent: number) => void

interface UploadOptions {
  onProgress: OnProgress
  // A key from an earlier attempt: the file is already stored, only the save is left.
  storedKey?: string | null
  onStored?: (r2Key: string) => void
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? "Upload failed")
  return data
}

// XHR because fetch can't report upload progress.
function send(method: string, url: string, body: XMLHttpRequestBodyInit, contentType: string | null, onProgress: OnProgress): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    if (contentType) xhr.setRequestHeader("Content-Type", contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText })
    xhr.onerror = () => reject(new Error("The upload failed. Check your connection and try again."))
    xhr.send(body)
  })
}

async function viaApp(agentId: string, file: File, description: string, onProgress: OnProgress): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  form.append("description", description)
  const { status, text } = await send("POST", `/api/agents/${agentId}/media`, form, null, onProgress)
  let data: { id?: string; error?: string } | null = null
  try { data = JSON.parse(text) } catch { /* a proxy's error page: use the generic message */ }
  if (status < 200 || status >= 300 || !data?.id) throw new Error(data?.error ?? "Upload failed")
  return data.id
}

// Goes straight to storage, so the file never passes through the app's memory.
// Content-Type must match what was signed.
async function direct(agentId: string, file: File, description: string, { onProgress, storedKey, onStored }: UploadOptions): Promise<string> {
  let r2Key = storedKey
  if (!r2Key) {
    const target = await postJson<{ uploadUrl: string; r2Key: string }>(`/api/agents/${agentId}/media/upload-url`, {
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    })
    const { status } = await send("PUT", target.uploadUrl, file, file.type, onProgress)
    if (status < 200 || status >= 300) throw new Error("The upload failed. Check your connection and try again.")
    r2Key = target.r2Key
    onStored?.(r2Key)
  }
  const item = await postJson<{ id: string }>(`/api/agents/${agentId}/media/complete`, { r2Key, filename: file.name, description })
  return item.id
}

export function uploadMedia(agentId: string, file: File, description: string, options: UploadOptions): Promise<string> {
  return needsDirectUpload(file.size, file.type)
    ? direct(agentId, file, description, options)
    : viaApp(agentId, file, description, options.onProgress)
}
