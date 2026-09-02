import { Resend } from "resend"
import nodemailer, { type Transporter } from "nodemailer"
import type { RenderedEmail } from "./render"

// Provider-agnostic send. Two implementations behind one function so switching
// providers is an env var rather than a rewrite — which matters because the
// realistic recovery path if Zoho throttles the mailbox is "move to Resend on a
// separate domain today", not "spend a week refactoring".

export type TransportName = "resend" | "zoho-smtp"

export function transportName(): TransportName {
  return process.env.OUTREACH_TRANSPORT === "zoho-smtp" ? "zoho-smtp" : "resend"
}

export type SendArgs = {
  from: string
  fromName: string
  replyTo: string
  to: string
  email: RenderedEmail
}

let cachedSmtp: Transporter | null = null

function smtpTransport(): Transporter {
  if (cachedSmtp) return cachedSmtp

  const host = process.env.OUTREACH_SMTP_HOST
  const user = process.env.OUTREACH_SMTP_USER
  const pass = process.env.OUTREACH_SMTP_PASSWORD
  if (!host || !user || !pass) {
    throw new Error(
      "OUTREACH_SMTP_HOST, OUTREACH_SMTP_USER and OUTREACH_SMTP_PASSWORD are required for the zoho-smtp transport"
    )
  }

  const port = Number(process.env.OUTREACH_SMTP_PORT ?? 587)
  cachedSmtp = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: port === 465,
    auth: { user, pass },
    // One connection reused across a slice. Reconnecting per message reads as
    // burst behaviour to the provider, which is exactly what we are pacing to
    // avoid.
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  })
  return cachedSmtp
}

/**
 * Sends one already-rendered email. Returns the provider's message id, which is
 * what bounce and reply matching later joins on.
 */
export async function deliver(args: SendArgs): Promise<string> {
  if (transportName() === "zoho-smtp") {
    const info = await smtpTransport().sendMail({
      from: `${args.fromName} <${args.from}>`,
      to: args.to,
      replyTo: args.replyTo,
      subject: args.email.subject,
      text: args.email.text,
      // Omitted entirely when null, so nodemailer sends a single text/plain
      // part rather than an empty multipart/alternative.
      ...(args.email.html ? { html: args.email.html } : {}),
      headers: args.email.headers,
    })
    // nodemailer returns the Message-ID wrapped in angle brackets; strip them so
    // it matches the bare form that arrives in a reply's In-Reply-To header.
    return (info.messageId ?? "").replace(/^<|>$/g, "")
  }

  const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: `${args.fromName} <${args.from}>`,
    to: args.to,
    replyTo: args.replyTo,
    subject: args.email.subject,
    text: args.email.text,
    ...(args.email.html ? { html: args.email.html } : {}),
    headers: args.email.headers,
  })

  // The Resend SDK returns { error } rather than throwing, so a bare send drops
  // mail silently — the same trap sendEmail() in email.ts guards against.
  if (error) throw new Error(error.message ?? JSON.stringify(error))
  return data?.id ?? ""
}

/** Verifies SMTP credentials without sending. Used by the config check. */
export async function verifyTransport(): Promise<void> {
  if (transportName() === "zoho-smtp") await smtpTransport().verify()
}
