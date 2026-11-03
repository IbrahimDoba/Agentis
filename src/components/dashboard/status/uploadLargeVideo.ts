async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? "Upload failed")
  return data
}

// XHR because fetch can't report upload progress, and a big video on a slow
// connection needs to show it's moving. Content-Type must match what was signed.
function putFile(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = () => reject(new Error("The upload failed. Check your connection and try again."))
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : failed())
    xhr.onerror = failed
    xhr.send(file)
  })
}

// Goes straight to storage, so the file never passes through the app's memory.
export async function uploadLargeVideo(agentId: string, file: File, description: string, onProgress: (percent: number) => void): Promise<string> {
  const { uploadUrl, r2Key } = await postJson<{ uploadUrl: string; r2Key: string }>(`/api/agents/${agentId}/media/upload-url`, {
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  })
  await putFile(uploadUrl, file, onProgress)
  const item = await postJson<{ id: string }>(`/api/agents/${agentId}/media/complete`, { r2Key, filename: file.name, description })
  return item.id
}
