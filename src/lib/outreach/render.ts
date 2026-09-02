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
  // Null for cold outreach. An HTML multipart alongside a List-Unsubscribe
  // header is a strong Gmail Promotions signal, and Promotions is where the
  // first seed test landed. Person-to-person business mail is usually plain
  // text, so sending only text/plain both classifies better and reads more
  // like what it claims to be. Set htmlPart to opt back in.
  html: string | null
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
// Markdown-style [label](url) in the body. HTML gets a real anchor so the email
// reads cleanly; plain text gets "label: url" so the destination stays visible.
// Both matter: a hyperlink hiding its target is the shape of a phishing mail, and
// a cold recipient who cannot see where a link goes does not click it.
const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

export function flattenLinksForText(body: string): string {
  return body.replace(MD_LINK, (_m, label, url) => `${label}: ${url}`)
}

function toParagraphs(text: string, style: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      // Single newlines collapse to spaces so the paragraph reflows to the
      // reader's width. Source copy is wrapped for legibility when writing it,
      // and honouring those breaks as <br> produced ragged half-width lines in
      // the client. Only a blank line starts a new paragraph.
      const escaped = escapeHtml(block.replace(/\s*\n\s*/g, " ").trim())
      // Labelled links first, so the bare-URL pass below cannot chew through the
      // href of an anchor this step just produced.
      const withAnchors = escaped.replace(
        MD_LINK,
        (_m, label, url) => `<a href="${url}" style="color:#0b5fff;font-weight:600;">${label}</a>`
      )
      const linked = withAnchors.replace(
        /(?<!href=")https?:\/\/[^\s<]+/g,
        (url) => `<a href="${url}" style="color:#0b5fff;">${url}</a>`
      )
      return `<p style="${style}">${linked}</p>`
    })
    .join("\n")
}

// Deliberately restrained. The things that make an email look like a campaign to
// a spam classifier — images, a logo, a coloured header bar, a centred card, a
// button-styled call to action, table layout — are not the things that make it
// look professional to a person. This is a business letter: left aligned, system
// font, white background, one ordinary link, and a signature block.
const BODY_STYLE = "margin:0 0 20px;"

const WRAPPER_STYLE = [
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
  "font-size:15px",
  "line-height:1.65",
  "color:#1a1a1a",
].join(";")

// Body copy stays left aligned inside the centred column. Centred paragraphs are
// markedly harder to read at this length.
const CONTENT_STYLE = "text-align:left;"

export const BRAND_NAME = process.env.OUTREACH_BRAND_NAME ?? "Dailzero"

// Served from public/ at the site root, which sits behind Cloudflare, so no
// separate asset host is needed. logo-email.png is a 128px copy of the 500px
// original: a 216KB download for a 44px logo is a slow first paint on a Nigerian
// mobile connection.
const LOGO_URL = process.env.OUTREACH_LOGO_URL ?? `${OUTREACH_APP_URL}/logo-email.png`

// Georgia rather than the body's system sans. Email clients strip @font-face,
// so a real brand font is not an option; a serif wordmark against a sans body is
// the only way to make the name look deliberate using fonts that always render.
function headerHtml(): string {
  return [
    `<div style="text-align:center;padding:4px 0 26px;">`,
    `<a href="${OUTREACH_APP_URL}" style="text-decoration:none;">`,
    // Explicit width/height and alt text so a client with images off still shows
    // the brand rather than a broken-image box.
    `<img src="${LOGO_URL}" width="42" height="42" alt="${escapeHtml(BRAND_NAME)}"`,
    ` style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;">`,
    `<span style="display:inline-block;vertical-align:middle;margin-left:11px;`,
    `font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:700;`,
    `color:#12261c;letter-spacing:-0.2px;">${escapeHtml(BRAND_NAME)}</span>`,
    `</a>`,
    `</div>`,
  ].join("")
}

function signatureHtml(signOff: string): string {
  const lines = signOff.trim().split("\n").filter(Boolean).map(escapeHtml)
  if (lines.length === 0) return ""
  const [name, ...rest] = lines
  const detail = rest
    .map((l) => `<div style="color:#5f6368;">${l}</div>`)
    .join("\n")
  return [
    `<div style="margin:28px 0 0;padding:16px 0 0;border-top:1px solid #e3e5e8;">`,
    `<div style="font-weight:600;color:#1a1a1a;">${name}</div>`,
    detail,
    `</div>`,
  ].join("\n")
}

export function renderOutreachEmail(args: {
  subject: string
  body: string
  signOff: string
  token: string
  htmlPart?: boolean
}): RenderedEmail {
  const unsubUrl = unsubscribeUrl(args.token)

  // A plain sentence alongside the header, because a Nigerian SMB owner trusts
  // a sentence more than a mail-client button. It converts would-be spam
  // complaints into unsubscribes, which is the trade that keeps us under the
  // 0.1% complaint ceiling.
  const footer = `Not interested? ${unsubUrl} and I will not write again.`
  const text = `${flattenLinksForText(args.body.trim())}\n\n${args.signOff.trim()}\n\n${footer}\n`

  // A centring table rather than margin:0 auto, which several clients ignore.
  const html = [
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">`,
    `<tr><td align="center" style="padding:28px 14px;">`,
    `<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">`,
    `<tr><td style="${WRAPPER_STYLE}">`,
    headerHtml(),
    `<div style="${CONTENT_STYLE}">`,
    toParagraphs(args.body, BODY_STYLE),
    signatureHtml(args.signOff),
    `<p style="margin:20px 0 0;font-size:12px;color:#80868b;">Not interested? <a href="${unsubUrl}" style="color:#80868b;">Unsubscribe</a> and we will not write again.</p>`,
    `</div>`,
    `</td></tr></table>`,
    `</td></tr></table>`,
  ].join("\n")

  return {
    subject: args.subject,
    text,
    html: args.htmlPart ? html : null,
    headers: {
      // RFC 8058. Gmail, Yahoo and Apple require both lines for one-click, and
      // the mailto fallback covers clients that will not POST.
      "List-Unsubscribe": `<${unsubUrl}>, <mailto:${OUTREACH_UNSUBSCRIBE_MAILBOX}?subject=${args.token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  }
}
