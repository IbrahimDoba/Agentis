// Agent.autoConfigStatus values for building an agent from WhatsApp. The worker
// and orchestrator move a row through these; this file is the dashboard's view.
// Pure, so the client banner can import it.

export const AUTO_BUILD_WAITING = "auto_waiting" // created, QR not scanned yet
export const AUTO_BUILD_DONE = "auto_done" // live, banner still showing
export const AUTO_BUILD_DISMISSED = "auto_dismissed"
export const AUTO_BUILD_MANUAL = "manual" // owner chose the manual steps instead

const IN_PROGRESS = ["auto_profile", "auto_chats", "auto_ready", "auto_creating"]

// Everything the banner has to know about. Excludes the dismissed state so a
// finished agent stops being looked up the moment the owner closes the banner.
export const AUTO_BUILD_BANNER_STATUSES = [AUTO_BUILD_WAITING, ...IN_PROGRESS, AUTO_BUILD_DONE]

export function isAutoBuildInProgress(status: string | null | undefined): boolean {
  return !!status && IN_PROGRESS.includes(status)
}

export const AUTO_BUILD_STEPS = ["Reading your profile", "Reading recent chats", "Creating your agent"] as const

export function autoBuildStepIndex(status: string): number {
  if (status === "auto_profile") return 0
  if (status === "auto_chats") return 1
  return 2
}
