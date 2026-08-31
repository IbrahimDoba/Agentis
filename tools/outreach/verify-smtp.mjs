// Proves the Zoho app-specific password authenticates, without sending anything.
//
// Run:  node tools/outreach/verify-smtp.mjs
//
// nodemailer's verify() opens a connection and completes the SMTP AUTH
// handshake, then hangs up. Nothing leaves the server, so this is safe to run
// against the real mailbox as many times as you like.

import dotenv from "dotenv"
import nodemailer from "nodemailer"

// Next.js loads .env.local automatically; a plain node script does not, and
// dotenv defaults to .env — which this repo does not use.
dotenv.config({ path: ".env.local", quiet: true })

const required = ["OUTREACH_SMTP_HOST", "OUTREACH_SMTP_USER", "OUTREACH_SMTP_PASSWORD"]
const missing = required.filter((key) => !process.env[key])
if (missing.length > 0) {
  console.error(`Missing: ${missing.join(", ")}`)
  process.exit(1)
}
if (process.env.OUTREACH_SMTP_PASSWORD.startsWith("FILL_ME")) {
  console.error("OUTREACH_SMTP_PASSWORD is still the placeholder — paste the app-specific password first.")
  process.exit(1)
}

const host = process.env.OUTREACH_SMTP_HOST
const port = Number(process.env.OUTREACH_SMTP_PORT ?? 587)
const user = process.env.OUTREACH_SMTP_USER

console.log(`Connecting to ${host}:${port} as ${user} ...`)

try {
  await nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: process.env.OUTREACH_SMTP_PASSWORD },
  }).verify()
  console.log("OK — credentials accepted, SMTP is ready.")
} catch (err) {
  console.error(`FAILED: ${err.message}`)
  // The three failures worth naming, because the message alone is cryptic.
  if (/auth|535|credential/i.test(err.message)) {
    console.error("\nAuth rejected. Usually one of:")
    console.error("  - a normal account password instead of an app-specific one")
    console.error("  - the app password was copied with a trailing space")
    console.error(`  - OUTREACH_SMTP_USER is not the mailbox the password belongs to`)
  } else if (/ENOTFOUND|EAI_AGAIN/i.test(err.message)) {
    console.error(`\n${host} did not resolve. Paid custom-domain Zoho accounts use smtppro.zoho.com,`)
    console.error("and the suffix is region-specific: .com (US), .eu, .in, .com.au")
  } else if (/ETIMEDOUT|ECONNREFUSED/i.test(err.message)) {
    console.error("\nConnection blocked. Try port 587 if you used 465, or check outbound firewall rules.")
  }
  process.exit(1)
}
