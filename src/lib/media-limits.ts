// Upload limits shared by the media route and the upload forms, so no
// server-only imports here. Mirrors MAX_SIZE in orchestrator/src/routes/media.ts,
// which sets them to fit WhatsApp's send limits.
const MB = 1024 * 1024

export const MAX_IMAGE_BYTES = 5 * MB
export const MAX_VIDEO_BYTES = 16 * MB
export const MAX_DOCUMENT_BYTES = 25 * MB
// Status videos skip the chat limit: the worker re-encodes them and keeps 60
// seconds. Mirrors STATUS_VIDEO_MAX_BYTES in orchestrator/src/lib/media-upload.ts.
export const MAX_STATUS_VIDEO_BYTES = 100 * MB

export function mediaSizeLimit(mimeType: string | null | undefined): number {
  if (mimeType?.startsWith("image/")) return MAX_IMAGE_BYTES
  if (mimeType?.startsWith("video/")) return MAX_VIDEO_BYTES
  return MAX_DOCUMENT_BYTES
}

export function formatMb(bytes: number): string {
  return `${Math.ceil(bytes / MB)}MB`
}

export function mediaSizeError(sizeBytes: number, mimeType: string | null | undefined, limit = mediaSizeLimit(mimeType)): string | null {
  if (sizeBytes <= limit) return null
  const what = mimeType?.startsWith("image/") ? "image" : mimeType?.startsWith("video/") ? "video" : "file"
  return `This ${what} is ${formatMb(sizeBytes)}. The limit is ${formatMb(limit)}.`
}

export function statusMediaSizeError(sizeBytes: number, mimeType: string | null | undefined): string | null {
  return mediaSizeError(sizeBytes, mimeType, mimeType?.startsWith("video/") ? MAX_STATUS_VIDEO_BYTES : undefined)
}

// Up to the chat limit a video takes the normal upload route; past it, direct.
export function needsDirectUpload(sizeBytes: number, mimeType: string | null | undefined): boolean {
  return !!mimeType?.startsWith("video/") && sizeBytes > MAX_VIDEO_BYTES
}
