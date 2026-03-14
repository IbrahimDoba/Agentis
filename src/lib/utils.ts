export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ")
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatTime(unixSecs: number) {
  return new Date(unixSecs * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING: "badge--pending",
    APPROVED: "badge--approved",
    REJECTED: "badge--rejected",
    PENDING_REVIEW: "badge--pending",
    SETTING_UP: "badge--setup",
    ACTIVE: "badge--active",
    INACTIVE: "badge--inactive",
  }
  return map[status] ?? "badge--default"
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: "Pending Approval",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    PENDING_REVIEW: "Pending Review",
    SETTING_UP: "Setting Up",
    ACTIVE: "Active",
    INACTIVE: "Inactive",
  }
  return map[status] ?? status
}
