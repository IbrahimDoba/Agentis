// Pure rules for direct-to-R2 uploads. No config import, so this stays testable
// (see the config.ts landmine in CLAUDE.md).

const MB = 1024 * 1024

// WhatsApp's limit for a video sent in a chat. Keep in sync with MAX_SIZE
// in routes/media.ts.
export const CHAT_VIDEO_MAX_BYTES = 16 * MB
// The worker re-encodes status videos and keeps 60 seconds, so the source can be
// far bigger than what gets posted. Mirrors the worker's MAX_SOURCE_BYTES.
export const STATUS_VIDEO_MAX_BYTES = 100 * MB

// On a library item too big to send in a chat: the AI must not be offered it.
export const STATUS_ONLY_TAG = "status_only"

export function sendableInChat(item: { tags?: string[] | null }): boolean {
  return !item.tags?.includes(STATUS_ONLY_TAG)
}

export function tagsForVideo(sizeBytes: number): string[] {
  return sizeBytes > CHAT_VIDEO_MAX_BYTES ? [STATUS_ONLY_TAG] : []
}

// The filename comes from the browser and goes into an object key.
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ""
  const clean = base.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "").slice(-120)
  return clean || "video"
}

// The key comes back from the browser after upload, so it has to be proved to
// be this agent's before a library row points at it.
export function isAgentMediaKey(key: string, agentId: string): boolean {
  return key.startsWith(`media/${agentId}/`) && !key.includes("..")
}
