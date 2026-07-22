import { Resend } from "resend"

const FROM_ADDRESS = "noreply@dailzero.com"
const FROM = `D-Zero AI <${FROM_ADDRESS}>`
const ADMIN_EMAIL = process.env.DEMO_EMAIL!
const APP_URL = process.env.NEXTAUTH_URL?.startsWith("http://localhost")
  ? "https://www.dailzero.com"
  : (process.env.NEXTAUTH_URL ?? "https://www.dailzero.com")

function resend() {
  return new Resend(process.env.RESEND_API_KEY)
}

// Co-branding for white-label (reseller) tenants. Resend only sends from our
// VERIFIED domain, so the FROM *address* is always noreply@dailzero.com — only
// the display name, subject and email body are branded with the reseller's
// appName + domain. Pass `undefined` (the default) for the platform brand.
export type EmailBrand = { appName: string; appUrl?: string }

function senderFrom(brand?: EmailBrand): string {
  return brand ? `${brand.appName} <${FROM_ADDRESS}>` : FROM
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function baseTemplate(content: string, brand?: EmailBrand): string {
  const appName = brand?.appName ?? "D-Zero AI"
  const appUrl = brand?.appUrl ?? APP_URL
  const appHost = appUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${appName}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
            <span style="color:#00dc82;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${appName}</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;color:#111111;font-size:15px;line-height:1.6;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f4f4f5;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#6b7280;">
              © ${new Date().getFullYear()} ${appName} &nbsp;·&nbsp;
              <a href="${appUrl}" style="color:#6b7280;text-decoration:none;">${appHost}</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">
              You're receiving this because you have an account with ${appName}.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function btn(text: string, href: string): string {
  return `<div style="margin:28px 0 0;">
    <a href="${href}" style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:14px;text-decoration:none;padding:13px 30px;border-radius:8px;">${text}</a>
  </div>`
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">`
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;color:#111111;font-size:14px;font-weight:600;">${value}</td>
  </tr>`
}

// ---------------------------------------------------------------------------
// 0. Email verification code — sent immediately on signup
// ---------------------------------------------------------------------------

export async function sendVerificationCode(data: { name: string; email: string; code: string }, brand?: EmailBrand) {
  const appName = brand?.appName ?? "D-Zero AI"
  await resend().emails.send({
    from: senderFrom(brand),
    to: data.email,
    subject: `${data.code} is your ${appName} verification code`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Verify your email</h2>
      <p style="margin:0 0 24px;color:#4b5563;">
        Hi ${data.name}, enter the code below to verify your email address and activate your account.
        This code expires in <strong>10 minutes</strong>.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <div style="display:inline-block;background:#f4f4f5;border-radius:12px;padding:20px 40px;">
          <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0a0a0a;font-family:monospace;">${data.code}</span>
        </div>
      </div>
      ${divider()}
      <p style="margin:0;color:#6b7280;font-size:13px;">
        If you didn't create a ${appName} account, you can safely ignore this email.
      </p>
    `, brand),
  })
}

// ---------------------------------------------------------------------------
// 1. Welcome email — sent to user after email is verified
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(user: { name: string; email: string }, brand?: EmailBrand) {
  const appName = brand?.appName ?? "D-Zero AI"
  await resend().emails.send({
    from: senderFrom(brand),
    to: user.email,
    subject: `Welcome to ${appName} 🎉`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Welcome, ${user.name}! 👋</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Thanks for signing up for ${appName}. You're all set — let's get your AI agent
        responding to every WhatsApp message, automatically, 24/7.
      </p>
      ${divider()}
      <h3 style="margin:0 0 12px;font-size:16px;color:#111111;">Get started in 3 steps</h3>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:28px;">
            <span style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:12px;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;">1</span>
          </td>
          <td style="padding:10px 0 10px 10px;color:#374151;font-size:14px;">
            Log in and set up your agent — add your business details, knowledge and products.
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:28px;">
            <span style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:12px;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;">2</span>
          </td>
          <td style="padding:10px 0 10px 10px;color:#374151;font-size:14px;">
            Connect your WhatsApp number in a couple of taps.
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:28px;">
            <span style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:12px;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;">3</span>
          </td>
          <td style="padding:10px 0 10px 10px;color:#374151;font-size:14px;">
            Your agent goes live and starts handling customer messages 24/7.
          </td>
        </tr>
      </table>
      ${btn("Go to dashboard", `${brand?.appUrl ?? APP_URL}/dashboard`)}
      ${divider()}
      <p style="margin:0;color:#6b7280;font-size:14px;">
        Got questions in the meantime? Reply to this email or visit our
        <a href="${brand?.appUrl ?? APP_URL}/contact" style="color:#00dc82;text-decoration:none;">contact page</a>.
      </p>
    `, brand),
  })
}

// ---------------------------------------------------------------------------
// 2. New signup notification — sent to admin when a user signs up
// ---------------------------------------------------------------------------

export async function sendNewSignupNotification(user: {
  name: string
  email: string
  businessName: string
  phone?: string
}) {
  await resend().emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New signup: ${user.businessName}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#111111;">New Account Signup</h2>
      <p style="margin:0 0 24px;color:#4b5563;">A new business just signed up.</p>
      ${divider()}
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow("Name", user.name)}
        ${infoRow("Email", user.email)}
        ${infoRow("Business", user.businessName)}
        ${user.phone ? infoRow("Phone", user.phone) : ""}
      </table>
      ${btn("View in Admin Panel", `${APP_URL}/admin/users`)}
    `),
  })
}

// ---------------------------------------------------------------------------
// 3. Agent live — sent to the user when their agent goes active on WhatsApp
// ---------------------------------------------------------------------------

export async function sendAgentLiveEmail(data: {
  userName: string
  userEmail: string
  businessName: string
  whatsappPhoneNumber?: string | null
  whatsappAgentLink?: string | null
}) {
  await resend().emails.send({
    from: FROM,
    to: data.userEmail,
    subject: "Your AI agent is live on WhatsApp! 🚀",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">You're live, ${data.userName}! 🚀</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Your AI agent for <strong>${data.businessName}</strong> is now live on WhatsApp —
        handling customer messages automatically, 24/7.
      </p>
      ${divider()}
      ${data.whatsappPhoneNumber || data.whatsappAgentLink ? `
        <h3 style="margin:0 0 12px;font-size:16px;color:#111111;">Your WhatsApp details</h3>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          ${data.whatsappPhoneNumber ? infoRow("Phone number", data.whatsappPhoneNumber) : ""}
          ${data.whatsappAgentLink ? infoRow("Agent link", `<a href="${data.whatsappAgentLink}" style="color:#00dc82;text-decoration:none;">${data.whatsappAgentLink}</a>`) : ""}
        </table>
        ${divider()}
      ` : ""}
      <h3 style="margin:0 0 12px;font-size:16px;color:#111111;">What to do now</h3>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="padding:8px 0;color:#374151;font-size:14px;">
            💬 &nbsp;Share your WhatsApp number or link with your customers
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#374151;font-size:14px;">
            📊 &nbsp;Monitor conversations from your dashboard
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#374151;font-size:14px;">
            ✏️ &nbsp;Update your agent's knowledge anytime from the Agent tab
          </td>
        </tr>
      </table>
      ${btn("Go to Dashboard", `${APP_URL}/dashboard`)}
    `),
  })
}

// ---------------------------------------------------------------------------
// 4. Account suspended — sent to user when admin suspends them
// ---------------------------------------------------------------------------

export async function sendAccountSuspendedEmail(user: { name: string; email: string }) {
  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: "Your D-Zero AI account has been suspended",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Account Suspended</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Hi ${user.name}, your D-Zero AI account has been temporarily suspended.
        You will not be able to access the platform until the suspension is lifted.
      </p>
      ${divider()}
      <p style="margin:0 0 16px;color:#4b5563;font-size:14px;">
        If you believe this is a mistake or would like more information, please contact our support team:
      </p>
      <p style="margin:0;color:#4b5563;font-size:14px;">
        <a href="mailto:support@dailzero.com" style="color:#00dc82;text-decoration:none;font-weight:600;">support@dailzero.com</a>
      </p>
    `),
  })
}

// ---------------------------------------------------------------------------
// 7. Password reset — sent to user when they request a password reset
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(data: { name: string; email: string; resetLink: string }, brand?: EmailBrand) {
  const appName = brand?.appName ?? "D-Zero AI"
  await resend().emails.send({
    from: senderFrom(brand),
    to: data.email,
    subject: `Reset your ${appName} password`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Password reset request</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Hi ${data.name}, we received a request to reset your password. Click the button below
        to choose a new one. This link expires in <strong>1 hour</strong>.
      </p>
      ${btn("Reset Password", data.resetLink)}
      ${divider()}
      <p style="margin:0;color:#6b7280;font-size:13px;">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
    `, brand),
  })
}

// ---------------------------------------------------------------------------
// 9. Demo request — existing function kept intact
// ---------------------------------------------------------------------------

export async function sendDemoRequest(data: {
  name: string
  email: string
  businessName: string
  preferredDate: string
  preferredTime: string
  message?: string
}) {
  await resend().emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `Demo Request from ${data.businessName}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#111111;">New Demo Request</h2>
      <p style="margin:0 0 24px;color:#4b5563;">Someone has requested a product demo.</p>
      ${divider()}
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow("Name", data.name)}
        ${infoRow("Email", data.email)}
        ${infoRow("Business", data.businessName)}
        ${infoRow("Preferred date", data.preferredDate)}
        ${infoRow("Preferred time", data.preferredTime)}
        ${data.message ? infoRow("Message", data.message) : ""}
      </table>
    `),
  })
}

// ---------------------------------------------------------------------------
// 10. Data deletion request — sent to admin + confirmation to user
// ---------------------------------------------------------------------------

const REQUEST_TYPE_LABELS: Record<string, string> = {
  full_account: "Delete entire account and all associated data",
  conversation_data: "Delete WhatsApp conversation data only",
  business_data: "Delete business configuration and profile data",
  all_personal: "Delete all personal data (retain anonymised analytics)",
}

export async function sendDataDeletionRequest(data: {
  fullName: string
  email: string
  phone?: string
  requestType: string
  additionalInfo?: string
  ref: string
}) {
  const requestLabel = REQUEST_TYPE_LABELS[data.requestType] ?? data.requestType

  // Notify admin
  await resend().emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `Data Deletion Request [${data.ref}] — ${data.fullName}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#111111;">Data Deletion Request</h2>
      <p style="margin:0 0 24px;color:#4b5563;">
        A user has submitted a data deletion request. Please verify their identity and process within <strong>30 days</strong>.
      </p>
      ${divider()}
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow("Reference", `<strong>${data.ref}</strong>`)}
        ${infoRow("Name", data.fullName)}
        ${infoRow("Email", data.email)}
        ${data.phone ? infoRow("Phone", data.phone) : ""}
        ${infoRow("Request type", requestLabel)}
        ${data.additionalInfo ? infoRow("Additional info", data.additionalInfo) : ""}
      </table>
      ${divider()}
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Reply to this email to contact the requester directly at ${data.email}.
      </p>
    `),
    replyTo: data.email,
  })

  // Send confirmation to the requester
  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Data Deletion Request Received [${data.ref}]`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Request Received</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Hi ${data.fullName}, we have received your data deletion request and will process it within <strong>30 days</strong>.
        We may contact you to verify your identity before proceeding.
      </p>
      ${divider()}
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow("Reference number", `<strong style="font-family:monospace;font-size:16px;">${data.ref}</strong>`)}
        ${infoRow("Request type", requestLabel)}
        ${infoRow("Processing time", "Up to 30 days")}
      </table>
      ${divider()}
      <p style="margin:0;color:#4b5563;font-size:14px;">
        Keep your reference number safe — you can use it to follow up on your request by emailing
        <a href="mailto:support@dailzero.com" style="color:#00dc82;text-decoration:none;">support@dailzero.com</a>
        with the subject line <em>"Data Deletion Follow-up [${data.ref}]"</em>.
      </p>
      <p style="margin:12px 0 0;color:#6b7280;font-size:13px;">
        Note: Data held by Meta/WhatsApp must be requested separately via
        <a href="https://www.facebook.com/help/contact/540977946302970" style="color:#00dc82;text-decoration:none;">Meta's privacy portal</a>.
      </p>
    `),
  })
}

// ---------------------------------------------------------------------------
// Newsletter broadcast
// ---------------------------------------------------------------------------

export async function sendNewsletter(data: {
  email: string
  subject: string
  title: string
  body: string
  ctaText?: string
  ctaUrl?: string
}) {
  const ctaBlock = data.ctaText && data.ctaUrl
    ? `<div style="margin:32px 0;">
        <a href="${data.ctaUrl}" style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:-0.2px;">${data.ctaText} →</a>
       </div>`
    : ""

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${data.subject}</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:48px 0 64px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <!-- Logo bar -->
        <tr>
          <td style="padding:0 0 28px;">
            <span style="color:#00dc82;font-size:18px;font-weight:800;letter-spacing:-0.5px;">D-Zero AI</span>
          </td>
        </tr>

        <!-- Hero card -->
        <tr>
          <td style="background:#0f1e15;border:1px solid #1e3a26;border-radius:16px;overflow:hidden;">

            <!-- Accent top bar -->
            <tr>
              <td style="background:linear-gradient(90deg,#00dc82,#00a862);height:4px;display:block;line-height:4px;font-size:4px;">&nbsp;</td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:40px 44px 44px;">
                <h1 style="margin:0 0 20px;font-size:26px;font-weight:800;color:#e8fdf0;line-height:1.25;letter-spacing:-0.5px;">${data.title}</h1>
                <div style="color:#8ab89a;font-size:15px;line-height:1.75;">${data.body.replace(/\n/g, "<br>")}</div>
                ${ctaBlock}
              </td>
            </tr>

          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="height:32px;"></td></tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #1e3a26;padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#4a6b56;line-height:1.6;">
              You're receiving this from <strong style="color:#8ab89a;">D-Zero AI</strong> because you subscribed or have an account with us.
              &nbsp;·&nbsp;
              <a href="${APP_URL}" style="color:#4a6b56;text-decoration:underline;">dailzero.com</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#2d4a38;">
              © ${new Date().getFullYear()} D-Zero AI. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`

  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: data.subject,
    html,
  })
}

export async function sendWorkspaceInviteEmail(data: {
  inviteeEmail: string
  ownerName: string
  ownerBusiness: string
  role: string
  inviteLink: string
  isExistingUser: boolean
}) {
  const roleLabel = data.role === "ADMIN" ? "Admin" : "Member"
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111111;">You've been invited to join a workspace</h2>
    <p style="margin:0 0 24px;color:#555555;">
      <strong>${data.ownerName}</strong> has invited you to join their <strong>${data.ownerBusiness}</strong> workspace on D-Zero AI as a <strong>${roleLabel}</strong>.
    </p>
    ${divider()}
    <p style="margin:20px 0 8px;color:#555555;">As a ${roleLabel}, you'll be able to:</p>
    <ul style="margin:0 0 24px;padding-left:20px;color:#555555;line-height:1.8;">
      <li>View all conversations and transcripts</li>
      <li>Generate and send follow-up messages</li>
      <li>Manage leads and add notes</li>
      ${data.role === "ADMIN" ? "<li>Manage team members</li>" : ""}
    </ul>
    ${divider()}
    <p style="margin:20px 0 8px;color:#555555;">
      ${data.isExistingUser
        ? "Since you already have a D-Zero AI account, just click below to accept:"
        : "Click below to accept the invite and create your account — it only takes a moment:"}
    </p>
    ${btn("Accept Invite", data.inviteLink)}
    <p style="margin:24px 0 0;font-size:13px;color:#888888;">
      This invite link expires in 7 days. If you didn't expect this, you can safely ignore this email.
    </p>
  `)

  await resend().emails.send({
    from: FROM,
    to: data.inviteeEmail,
    subject: `${data.ownerName} invited you to ${data.ownerBusiness} on D-Zero AI`,
    html,
  })
}

// ---------------------------------------------------------------------------
// 13. Subscription expiring soon — sent ~7 days before subscriptionExpiresAt
// ---------------------------------------------------------------------------

export async function sendSubscriptionExpiringSoonEmail(data: {
  name: string
  email: string
  planLabel: string
  daysRemaining: number
  expiresAt: Date
}) {
  const dayWord = data.daysRemaining === 1 ? "day" : "days"
  const expiryStr = data.expiresAt.toLocaleString("en-NG", { dateStyle: "long", timeStyle: "short" })
  const renewUrl = `${APP_URL}/dashboard/billing`

  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Your D-Zero AI ${data.planLabel} subscription expires in ${data.daysRemaining} ${dayWord}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Heads up — your subscription expires soon</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Hi ${data.name}, your <strong>${data.planLabel}</strong> plan ends in <strong>${data.daysRemaining} ${dayWord}</strong> on <strong>${expiryStr}</strong>.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        After it expires, your AI agents will stop replying to customer messages until you renew. Your conversations, contacts, and configuration are kept safe.
      </p>
      ${btn("Renew Subscription", renewUrl)}
      ${divider()}
      <p style="margin:0;color:#6b7280;font-size:13px;">
        Already renewed? You can ignore this email — we'll update automatically once the payment is confirmed.
      </p>
    `),
  })
}

// ---------------------------------------------------------------------------
// 14. Subscription expired — sent on or just after subscriptionExpiresAt
// ---------------------------------------------------------------------------

export async function sendSubscriptionExpiredEmail(data: {
  name: string
  email: string
  planLabel: string
  expiresAt: Date
}) {
  const expiryStr = data.expiresAt.toLocaleString("en-NG", { dateStyle: "long" })
  const renewUrl = `${APP_URL}/dashboard/billing`

  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Your D-Zero AI subscription has expired`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Your subscription has expired</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Hi ${data.name}, your <strong>${data.planLabel}</strong> plan expired on <strong>${expiryStr}</strong>. Your AI agents have stopped replying to incoming WhatsApp messages.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Everything you set up — agents, conversations, contacts, knowledge base, templates — is safely preserved. Renewing brings the AI back online instantly.
      </p>
      ${btn("Renew Subscription", renewUrl)}
      ${divider()}
      <p style="margin:0;color:#6b7280;font-size:13px;">
        Questions about renewing? Reply to this email or reach <a href="mailto:support@dailzero.com" style="color:#00dc82;text-decoration:none;font-weight:600;">support@dailzero.com</a>.
      </p>
    `),
  })
}

// ---------------------------------------------------------------------------
// Credit-purchase receipt — sent after a successful Paystack PAYG top-up
// ---------------------------------------------------------------------------

export async function sendCreditPurchaseReceipt(data: {
  name: string
  email: string
  amountNaira: number
  credits: number
  reference: string
  expiresAt: Date
}) {
  const naira = `₦${data.amountNaira.toLocaleString("en-NG")}`
  const credits = data.credits.toLocaleString("en-NG")
  const expires = data.expiresAt.toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Receipt — ${credits} credits added`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Credits added 🎉</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Hi ${data.name}, your payment was received and your credits are ready to use.
      </p>
      <div style="background:#f4f4f5;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
          ${infoRow("Amount paid", naira)}
          ${infoRow("Credits added", credits)}
          ${infoRow("Reference", data.reference)}
          ${infoRow("Use by", expires)}
        </table>
      </div>
      <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">
        Credits don't expire as long as you keep using D-Zero — every top-up
        extends your wallet's expiry by 12 months.
      </p>
      ${btn("Go to dashboard", `${APP_URL}/dashboard`)}
      ${divider()}
      <p style="margin:0;color:#6b7280;font-size:13px;">
        Questions? Reply to this email or reach
        <a href="mailto:support@dailzero.com" style="color:#00dc82;text-decoration:none;font-weight:600;">support@dailzero.com</a>.
      </p>
    `),
  })
}

// ---------------------------------------------------------------------------
// Subscription billing (Paystack recurring) — activation / renewal / failure / cancel
// ---------------------------------------------------------------------------

export async function sendSubscriptionActivatedEmail(data: {
  name: string
  email: string
  planLabel: string
  amountNaira: number
  reference: string
  nextChargeAt: Date
}) {
  const naira = `₦${data.amountNaira.toLocaleString("en-NG")}`
  const next = data.nextChargeAt.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Your D-Zero AI ${data.planLabel} plan is active`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">You're on ${data.planLabel} 🎉</h2>
      <p style="margin:0 0 20px;color:#4b5563;">Hi ${data.name}, your subscription is active and your AI agents are live.</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
          ${infoRow("Plan", data.planLabel)}
          ${infoRow("Amount paid", naira)}
          ${infoRow("Reference", data.reference)}
          ${infoRow("Auto-renews on", next)}
        </table>
      </div>
      <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">We'll automatically renew with your saved card each month. You can turn off auto-renew or change your card anytime in billing.</p>
      ${btn("Manage subscription", `${APP_URL}/dashboard/subscription`)}
    `),
  })
}

export async function sendSubscriptionRenewedEmail(data: {
  name: string
  email: string
  planLabel: string
  amountNaira: number
  reference: string
  nextChargeAt: Date
}) {
  const naira = `₦${data.amountNaira.toLocaleString("en-NG")}`
  const next = data.nextChargeAt.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Receipt — D-Zero AI ${data.planLabel} renewed`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Subscription renewed</h2>
      <p style="margin:0 0 20px;color:#4b5563;">Hi ${data.name}, your ${data.planLabel} plan renewed successfully.</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
          ${infoRow("Plan", data.planLabel)}
          ${infoRow("Amount charged", naira)}
          ${infoRow("Reference", data.reference)}
          ${infoRow("Next renewal", next)}
        </table>
      </div>
      ${btn("View billing", `${APP_URL}/dashboard/subscription`)}
    `),
  })
}

export async function sendSubscriptionPaymentFailedEmail(data: {
  name: string
  email: string
  planLabel: string
  attempt: number
  maxAttempts: number
  graceEndsAt: Date
}) {
  const graceStr = data.graceEndsAt.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Action needed — your D-Zero AI ${data.planLabel} payment failed`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">We couldn't renew your subscription</h2>
      <p style="margin:0 0 16px;color:#4b5563;">
        Hi ${data.name}, we tried to charge your saved card for your <strong>${data.planLabel}</strong> plan but it didn't go through (attempt ${data.attempt} of ${data.maxAttempts}).
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        We'll keep trying, but if it isn't sorted by <strong>${graceStr}</strong> your plan will move to Free and your AI agents will pause. Update your card to keep things running.
      </p>
      ${btn("Update payment method", `${APP_URL}/dashboard/subscription`)}
      ${divider()}
      <p style="margin:0;color:#6b7280;font-size:13px;">Already fixed it? You can ignore this — we update automatically once a charge succeeds.</p>
    `),
  })
}

export async function sendSubscriptionCancelledEmail(data: {
  name: string
  email: string
  planLabel: string
  accessUntil: Date
}) {
  const untilStr = data.accessUntil.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Your D-Zero AI subscription is cancelled`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Auto-renew turned off</h2>
      <p style="margin:0 0 16px;color:#4b5563;">
        Hi ${data.name}, your <strong>${data.planLabel}</strong> plan won't renew. You keep full access until <strong>${untilStr}</strong>, after which your account moves to the Free plan.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">Changed your mind? You can re-enable auto-renew anytime before then.</p>
      ${btn("Manage subscription", `${APP_URL}/dashboard/subscription`)}
    `),
  })
}

// ---------------------------------------------------------------------------
// Lead & handoff notifications — sent to the account owner (see
// src/lib/lead-notifications-job.ts). White-label aware via `brand`.
// ---------------------------------------------------------------------------

// Escape user-authored strings (customer names, AI summaries, handoff reasons)
// before dropping them into the HTML template — they come from live chats.
function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// A new high-intent lead (the AI's mark_qualified_lead — confirmed product +
// budget/quantity/timeline). Deliberately NOT sent for background-scan leads.
export async function sendQualifiedLeadEmail(data: {
  ownerName: string
  email: string
  agentName: string
  customerName?: string | null
  customerNumber?: string | null
  summary?: string | null
}, brand?: EmailBrand) {
  const appUrl = brand?.appUrl ?? APP_URL
  const who = esc(data.customerName) || esc(data.customerNumber) || "A customer"
  await resend().emails.send({
    from: senderFrom(brand),
    to: data.email,
    subject: `🔥 New qualified lead — ${who}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">You've got a qualified lead</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Hi ${esc(data.ownerName)}, your <strong>${esc(data.agentName)}</strong> agent just flagged a
        customer with real buying intent. Reach out while it's hot.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow("Customer", who)}
        ${data.customerNumber ? infoRow("WhatsApp", esc(data.customerNumber)) : ""}
        ${data.summary ? infoRow("What they want", esc(data.summary)) : ""}
        ${infoRow("Agent", esc(data.agentName))}
      </table>
      ${btn("View lead", `${appUrl}/dashboard/leads`)}
    `, brand),
  })
}

// A human-handoff request the AI raised (any urgency). The customer is waiting.
export async function sendHandoffRequestEmail(data: {
  ownerName: string
  email: string
  agentName: string
  customerName?: string | null
  customerNumber?: string | null
  reason: string
  urgency: "normal" | "high"
}, brand?: EmailBrand) {
  const appUrl = brand?.appUrl ?? APP_URL
  const who = esc(data.customerName) || esc(data.customerNumber) || "A customer"
  const urgent = data.urgency === "high"
  await resend().emails.send({
    from: senderFrom(brand),
    to: data.email,
    subject: `${urgent ? "🚨 Urgent" : "🙋 "} Handoff needed — ${who}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">A customer needs a human</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Hi ${esc(data.ownerName)}, your <strong>${esc(data.agentName)}</strong> agent handed a
        conversation over for a person to take.${urgent ? " It's marked <strong>high urgency</strong>." : ""}
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow("Customer", who)}
        ${data.customerNumber ? infoRow("WhatsApp", esc(data.customerNumber)) : ""}
        ${infoRow("Reason", esc(data.reason))}
        ${infoRow("Urgency", urgent ? "High" : "Normal")}
        ${infoRow("Agent", esc(data.agentName))}
      </table>
      ${btn("Open conversation", `${appUrl}/dashboard/chats`)}
    `, brand),
  })
}

// Daily / weekly activity digest. One `period` label drives both; only sent to
// owners who had activity in the window (the job filters empty digests out).
export async function sendActivityDigestEmail(data: {
  ownerName: string
  email: string
  period: "day" | "week"
  qualifiedLeads: number
  handoffs: number
  topLeads: Array<{ agentName: string; who: string; summary?: string | null }>
}, brand?: EmailBrand) {
  const appUrl = brand?.appUrl ?? APP_URL
  const window = data.period === "day" ? "today" : "this week"
  const title = data.period === "day" ? "Your daily summary" : "Your weekly summary"
  const leadRows = data.topLeads.map((l) => `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #e5e7eb;">
        <div style="color:#111111;font-size:14px;font-weight:600;">${esc(l.who)}</div>
        ${l.summary ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">${esc(l.summary)}</div>` : ""}
        <div style="color:#9ca3af;font-size:12px;margin-top:2px;">via ${esc(l.agentName)}</div>
      </td>
    </tr>`).join("")
  await resend().emails.send({
    from: senderFrom(brand),
    to: data.email,
    subject: `${title} — ${data.qualifiedLeads} qualified lead${data.qualifiedLeads === 1 ? "" : "s"}, ${data.handoffs} handoff${data.handoffs === 1 ? "" : "s"}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">${title}</h2>
      <p style="margin:0 0 24px;color:#4b5563;">
        Hi ${esc(data.ownerName)}, here's what your AI agents brought in ${window}.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 8px;">
        <tr>
          <td style="width:50%;background:#f4f4f5;border-radius:12px;padding:20px;text-align:center;">
            <div style="font-size:34px;font-weight:800;color:#00a862;">${data.qualifiedLeads}</div>
            <div style="font-size:13px;color:#6b7280;margin-top:2px;">Qualified leads</div>
          </td>
          <td style="width:12px;"></td>
          <td style="width:50%;background:#f4f4f5;border-radius:12px;padding:20px;text-align:center;">
            <div style="font-size:34px;font-weight:800;color:#111111;">${data.handoffs}</div>
            <div style="font-size:13px;color:#6b7280;margin-top:2px;">Handoffs</div>
          </td>
        </tr>
      </table>
      ${data.topLeads.length > 0 ? `
        ${divider()}
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111111;text-transform:uppercase;letter-spacing:0.5px;">Recent qualified leads</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">${leadRows}</table>
      ` : ""}
      ${btn("Open dashboard", `${appUrl}/dashboard/leads`)}
    `, brand),
  })
}
