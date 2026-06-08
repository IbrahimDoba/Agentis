import { NextResponse } from "next/server"
import { randomUUID } from "crypto"

// Standard error envelope for the External Developer API.
//
// Every error response is { error: { code, message, request_id } }. `code` is a
// stable string developers branch on; `message` is human-readable and may
// change; `request_id` lets support correlate a failed call with our logs.
//
// Keep the code list stable — it is part of the public contract.
export const API_ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  INSUFFICIENT_CREDITS: 402,
  DAILY_CAP_HIT: 402,
  FORBIDDEN_SCOPE: 403,
  AGENT_NOT_FOUND: 404,
  AGENT_NOT_CONNECTED: 409,
  RATE_LIMITED: 429,
  KEY_REVOKED: 401,
  INTERNAL: 500,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS

// Generate a request id to thread through logs and the error envelope.
export function newRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "")}`
}

// Build a uniform API error response. Optional headers let callers attach e.g.
// Retry-After on RATE_LIMITED.
export function apiError(
  code: ApiErrorCode,
  message: string,
  opts?: { requestId?: string; headers?: Record<string, string> }
): NextResponse {
  return NextResponse.json(
    { error: { code, message, request_id: opts?.requestId ?? null } },
    { status: API_ERROR_STATUS[code], headers: opts?.headers }
  )
}
