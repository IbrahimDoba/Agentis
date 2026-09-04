import { NextResponse, type NextRequest } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/lib/auth"

// The session preamble is copy-pasted across the API in nine syntactic variants.
// This removes the boilerplate; it does NOT unify the responses. Three routes
// answer 401 in plain text and the rest in JSON, and admin routes answer 401
// rather than 403 for a signed-in non-admin — both are odd, both are what
// clients see today, and changing either is a client-visible change that
// belongs in its own commit with its own diff in the route baseline.
//
// Modelled on getResellerAdminContext (src/lib/resellerAdmin.ts), the one guard
// in this codebase with full adoption.

/** How a route renders "not signed in". Matches what each route does today. */
export type UnauthorizedStyle = "json" | "text"

function unauthorized(style: UnauthorizedStyle): Response {
  return style === "text"
    ? new Response("Unauthorized", { status: 401 })
    : NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

export type AuthedContext<P> = {
  params: Promise<P>
  session: Session
}

type Handler<P> = (req: NextRequest, ctx: AuthedContext<P>) => Promise<Response> | Response
type RouteArgs<P> = [NextRequest, { params: Promise<P> }?]

type Options = {
  /** Defaults to "json" — the shape 200+ routes already return. */
  unauthorized?: UnauthorizedStyle
}

/**
 * Require a signed-in user. The handler receives the session, so it never has
 * to re-read it or re-check for null.
 */
export function withAuth<P = Record<string, never>>(handler: Handler<P>, opts: Options = {}) {
  return async (...[req, ctx]: RouteArgs<P>): Promise<Response> => {
    const session = await auth()
    if (!session?.user?.id) return unauthorized(opts.unauthorized ?? "json")
    return handler(req, {
      params: ctx?.params ?? (Promise.resolve({}) as Promise<P>),
      session,
    })
  }
}

/**
 * Require a signed-in ADMIN.
 *
 * A signed-in non-admin gets 401, not 403. That is what all 26 inline admin
 * checks do today (`!session || session.user.role !== "ADMIN"` → 401), and
 * "correcting" it to 403 inside a refactor would change what the admin UI and
 * any script sees without anyone deciding to.
 */
export function withAdmin<P = Record<string, never>>(handler: Handler<P>, opts: Options = {}) {
  return async (...[req, ctx]: RouteArgs<P>): Promise<Response> => {
    const session = await auth()
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return unauthorized(opts.unauthorized ?? "json")
    }
    return handler(req, {
      params: ctx?.params ?? (Promise.resolve({}) as Promise<P>),
      session,
    })
  }
}
