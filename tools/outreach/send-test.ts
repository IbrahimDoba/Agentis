// Seed test for the cold-outreach send path.
//
// Imports the REAL renderOutreachEmail and deliver rather than reproducing
// them, so what lands in the seed inbox is byte-identical to what a prospect
// would receive. Run with Node's type stripping, no build step:
//
//   node --experimental-strip-types tools/outreach/send-test.ts            # dry run
//   node --experimental-strip-types tools/outreach/send-test.ts --send     # actually sends
//
// Dry run by default: seeing the exact bytes before they leave is the point.

import dotenv from "dotenv"
dotenv.config({ path: ".env.local", quiet: true })

const { renderOutreachEmail } = await import("../../src/lib/outreach/render.ts")
const { deliver, transportName } = await import("../../src/lib/outreach/transport.ts")

const TO = process.argv.find((a) => a.includes("@")) ?? "quillstash@gmail.com"
const SEND = process.argv.includes("--send")

// A real prospect from prospects.csv, with only signals verified from their own
// site: the WhatsApp number, the Lagos physical stores, prices in naira.
const SUBJECT = "Question about your WhatsApp enquiries"

// Signals verified from nectarbeautyhub.com itself: a WhatsApp button, a banner
// pointing to Lagos stores, and prices in naira on the product pages.
// In a real send this link is /r/<token>, which records the click, sets the
// attribution cookie, then forwards to exactly this wa.me URL. The seed test has
// no message row behind it, so it points straight at WhatsApp to stay clickable.
const WA_NUMBER = process.env.OUTREACH_WHATSAPP_NUMBER ?? ""
const WA = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
  "Hi Dailzero, I got your email. Can I see how this works?"
)}`

// Pretty-printed so the safety note shows a number a human recognises rather
// than a wall of digits.
const WA_PRETTY = WA_NUMBER.replace(/^(\d{3})(\d{3})(\d{3})(\d{4})$/, "+$1 $2 $3 $4")

const BODY = [
  "Your website sends customers to WhatsApp to ask about stock, shades and delivery. Most of those questions arrive outside working hours, and the ones nobody answers overnight are usually the ones that were ready to buy.",
  "Dailzero puts an AI agent on the WhatsApp number you already use. It answers from your own products and prices in under two seconds, at any hour, and tells you when someone is serious.",
  "Easier to see than to read about. [Message us on WhatsApp](" + WA + ") and our own agent will answer you.",
  `That link opens WhatsApp to ${WA_PRETTY}, our own number. If you would rather not click it, save the number yourself or just reply to this email.`,
  "Setup takes a few minutes and the first 7 days are free, no card.",
  "Found your address on your website footer.",
].join("\n\n")

const rendered = renderOutreachEmail({
  subject: SUBJECT,
  body: BODY,
  signOff: [
    process.env.OUTREACH_SIGNER_NAME ?? "Ibrahim Doba",
    process.env.OUTREACH_SIGNER_TITLE ?? "CEO, Dailzero",
    process.env.OUTREACH_FROM_EMAIL ?? "",
  ].filter(Boolean).join("\n"),
  htmlPart: process.env.OUTREACH_HTML !== "false",
  token: "SEEDTESTTOKEN",
})

console.log("transport :", transportName())
console.log("from      :", `${process.env.OUTREACH_FROM_NAME} <${process.env.OUTREACH_FROM_EMAIL}>`)
console.log("to        :", TO)
console.log("subject   :", rendered.subject)
console.log("\n--- headers ---")
for (const [k, v] of Object.entries(rendered.headers)) console.log(`${k}: ${v}`)
console.log("\n--- text/plain ---")
console.log(rendered.text)

if (!SEND) {
  console.log("\nDry run. Re-run with --send to actually deliver.")
  process.exit(0)
}

const from = process.env.OUTREACH_FROM_EMAIL
if (!from) throw new Error("OUTREACH_FROM_EMAIL is not set")

const id = await deliver({
  from,
  fromName: process.env.OUTREACH_FROM_NAME ?? "Dailzero",
  replyTo: process.env.OUTREACH_REPLY_TO ?? from,
  to: TO,
  email: rendered,
})
console.log(`\nSENT. provider message id: ${id}`)
