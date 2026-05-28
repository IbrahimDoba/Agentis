// Pure reconnect-policy decisions. Kept separate from session-manager.ts so
// they can be unit-tested without dragging in Baileys / native libsignal.

// Hard cap on consecutive reconnect attempts for a single session. An agent
// that can never re-establish (e.g. silently banned by WhatsApp, corrupted
// auth) was previously reconnecting every 2 min forever — each cycle wrote
// 3+ DB rows. After this many attempts we stop trying and leave the session
// DISCONNECTED with a "max_reconnect_attempts_exceeded" reason. Operator
// restarts manually from the dashboard.
export const MAX_RECONNECT_ATTEMPTS = 10

export function shouldRetryReconnect(reconnectAttempt: number): boolean {
  return reconnectAttempt < MAX_RECONNECT_ATTEMPTS
}
