// Builds the wire format for a cold email.
//
// Deliberately NOT baseTemplate() from src/lib/email.ts. That template's dark
// header, brand wordmark and 560px card are right for a receipt and fatal for
// cold outreach: it reads as a newsletter, lands in Promotions, and undoes the
// personalization it is wrapping. A cold email should look like a person typed
// it, so the payload is plain text and the HTML part is the same text in
// paragraphs with one link and nothing else.

export const OUTREACH_APP_URL = process.env.NEXTAUTH_URL?.startsWith("http://localhost")
  ? "https://www.dailzero.com"
  : (process.env.NEXTAUTH_URL ?? "https://www.dailzero.com")

export const OUTREACH_UNSUBSCRIBE_MAILBOX =
  process.env.OUTREACH_UNSUBSCRIBE_EMAIL ?? "unsubscribe@dailzero.com"

export function clickUrl(token: string): string {
  return `${OUTREACH_APP_URL}/r/${token}`
}

// Unsubscribe lives on the primary domain on purpose. It is a real, long-lived,
// HTTPS host, which makes the link a deliverability asset; pointing it at a
// brand-new cold domain would be the opposite.
export function unsubscribeUrl(token: string): string {
  return `${OUTREACH_APP_URL}/u/${token}`
}

export type RenderedEmail = {
  subject: string
  text: string
  html: string
  headers: Record<string, string>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Linkifies bare URLs only. The body is model-generated, so nothing in it is
// trusted as markup.
function toParagraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const escaped = escapeHtml(block).replace(/\n/g, "<br>")
      const linked = escaped.replace(
        /https?:\/\/[^\s<]+/g,
        (url) => `<a href="${url}" style="color:#0a58ca;">${url}</a>`
      )
      return `<p style="margin:0 0 16px;">${linked}</p>`
    })
    .join("\n")
}

export function renderOutreachEmail(args: {
  subject: string
  body: string
  signOff: string
  token: string
}): RenderedEmail {
  const unsubUrl = unsubscribeUrl(args.token)

  // A plain sentence alongside the header, because a Nigerian SMB owner trusts
  // a sentence more than a mail-client button. It converts would-be spam
  // complaints into unsubscribes, which is the trade that keeps us under the
  // 0.1% complaint ceiling.
  const footer = `Not interested? ${unsubUrl} and I will not write again.`
  const text = `${args.body.trim()}\n\n${args.signOff.trim()}\n\n${footer}\n`

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;">`,
    toParagraphs(args.body),
    toParagraphs(args.signOff),
    `<p style="margin:24px 0 0;font-size:12px;color:#6b7280;">Not interested? <a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a> and I will not write again.</p>`,
    `</div>`,
  ].join("\n")

  return {
    subject: args.subject,
    text,
    html,
    headers: {
      // RFC 8058. Gmail, Yahoo and Apple require both lines for one-click, and
      // the mailto fallback covers clients that will not POST.
      "List-Unsubscribe": `<${unsubUrl}>, <mailto:${OUTREACH_UNSUBSCRIBE_MAILBOX}?subject=${args.token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  }
}
