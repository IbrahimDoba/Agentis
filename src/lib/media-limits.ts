// Upload limits shared by the media route and the upload forms, so no
// server-only imports here. Mirrors MAX_SIZE in orchestrator/src/routes/media.ts,
// which sets them to fit WhatsApp's send limits.
const MB = 1024 * 1024

export const MAX_IMAGE_BYTES = 5 * MB
export const MAX_VIDEO_BYTES = 16 * MB
export const MAX_DOCUMENT_BYTES = 25 * MB

export function mediaSizeLimit(mimeType: string | null | undefined): number {
  if (mimeType?.startsWith("image/")) return MAX_IMAGE_BYTES
  if (mimeType?.startsWith("video/")) return MAX_VIDEO_BYTES
  return MAX_DOCUMENT_BYTES
}

export function formatMb(bytes: number): string {
  return `${Math.ceil(bytes / MB)}MB`
}

export function mediaSizeError(sizeBytes: number, mimeType: string | null | undefined): string | null {
  const limit = mediaSizeLimit(mimeType)
  if (sizeBytes <= limit) return null
  const what = mimeType?.startsWith("image/") ? "image" : mimeType?.startsWith("video/") ? "video" : "file"
  return `This ${what} is ${formatMb(sizeBytes)}. The limit is ${formatMb(limit)}.`
}
