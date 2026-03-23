import { Resend } from "resend"

const FROM = "D-Zero AI <noreply@dailzero.com>"
const ADMIN_EMAIL = process.env.DEMO_EMAIL!
const APP_URL = process.env.NEXTAUTH_URL?.startsWith("http://localhost")
  ? "https://www.dailzero.com"
  : (process.env.NEXTAUTH_URL ?? "https://www.dailzero.com")

function resend() {
  return new Resend(process.env.RESEND_API_KEY)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>D-Zero AI</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0a0a0a;padding:28px 40px;text-align:center;">
            <span style="color:#00dc82;font-size:22px;font-weight:700;letter-spacing:-0.5px;">D-Zero AI</span>
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
              © ${new Date().getFullYear()} D-Zero AI &nbsp;·&nbsp;
              <a href="${APP_URL}" style="color:#6b7280;text-decoration:none;">dailzero.com</a>
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">
              You're receiving this because you have an account with D-Zero AI.
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
// 1. Welcome email — sent to user on signup
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(user: { name: string; email: string }) {
  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: "Welcome to D-Zero AI – We're reviewing your account",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Welcome, ${user.name}! 👋</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Thanks for signing up for D-Zero AI. We're excited to help your business respond to
        every WhatsApp message — automatically, 24/7.
      </p>
      ${divider()}
      <h3 style="margin:0 0 12px;font-size:16px;color:#111111;">What happens next?</h3>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:28px;">
            <span style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:12px;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;">1</span>
          </td>
          <td style="padding:10px 0 10px 10px;color:#374151;font-size:14px;">
            Our team reviews your account — usually within <strong>24 hours</strong>.
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:28px;">
            <span style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:12px;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;">2</span>
          </td>
          <td style="padding:10px 0 10px 10px;color:#374151;font-size:14px;">
            Once approved, you'll get an email and can log in to set up your AI agent.
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:28px;">
            <span style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:12px;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;">3</span>
          </td>
          <td style="padding:10px 0 10px 10px;color:#374151;font-size:14px;">
            Your agent goes live on WhatsApp and starts handling customer messages.
          </td>
        </tr>
      </table>
      ${divider()}
      <p style="margin:0;color:#6b7280;font-size:14px;">
        Got questions in the meantime? Reply to this email or visit our
        <a href="${APP_URL}/contact" style="color:#00dc82;text-decoration:none;">contact page</a>.
      </p>
    `),
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
      <p style="margin:0 0 24px;color:#4b5563;">A new business has signed up and is waiting for approval.</p>
      ${divider()}
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow("Name", user.name)}
        ${infoRow("Email", user.email)}
        ${infoRow("Business", user.businessName)}
        ${user.phone ? infoRow("Phone", user.phone) : ""}
      </table>
      ${btn("Review in Admin Panel", `${APP_URL}/admin/users`)}
    `),
  })
}

// ---------------------------------------------------------------------------
// 3. Account approved — sent to user when admin approves them
// ---------------------------------------------------------------------------

export async function sendAccountApprovedEmail(user: { name: string; email: string }) {
  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: "Your D-Zero AI account has been approved!",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">You're approved, ${user.name}! 🎉</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Great news — your D-Zero AI account has been approved. You can now log in and set up
        your AI WhatsApp agent.
      </p>
      ${divider()}
      <h3 style="margin:0 0 12px;font-size:16px;color:#111111;">Get started in minutes</h3>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="padding:8px 0 8px 0;color:#374151;font-size:14px;">
            ✅ &nbsp;Log in to your dashboard
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#374151;font-size:14px;">
            ✅ &nbsp;Fill in your business details and set up your agent
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#374151;font-size:14px;">
            ✅ &nbsp;Our team will configure your WhatsApp integration and get you live
          </td>
        </tr>
      </table>
      ${btn("Go to Dashboard", `${APP_URL}/dashboard`)}
    `),
  })
}

// ---------------------------------------------------------------------------
// 4. Account rejected — sent to user when admin rejects them
// ---------------------------------------------------------------------------

export async function sendAccountRejectedEmail(user: { name: string; email: string }) {
  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: "An update on your D-Zero AI application",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">Hi ${user.name},</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Thank you for your interest in D-Zero AI. After reviewing your application, we're
        unable to move forward at this time.
      </p>
      <p style="margin:0 0 20px;color:#4b5563;">
        This may be because we've reached capacity for our current cohort. We encourage you
        to check back in the future as we expand.
      </p>
      ${divider()}
      <p style="margin:0;color:#4b5563;font-size:14px;">
        If you believe this is a mistake or would like more information, please reach out to
        us at <a href="mailto:support@dailzero.com" style="color:#00dc82;text-decoration:none;">support@dailzero.com</a>.
      </p>
    `),
  })
}

// ---------------------------------------------------------------------------
// 5. Agent approved & live — sent to user when admin sets agent to ACTIVE
// ---------------------------------------------------------------------------

export async function sendAgentApprovedEmail(data: {
  userName: string
  userEmail: string
  businessName: string
  whatsappPhoneNumber?: string | null
  whatsappAgentLink?: string | null
}) {
  await resend().emails.send({
    from: FROM,
    to: data.userEmail,
    subject: "Your AI agent is approved and live on WhatsApp! 🚀",
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111111;">You're live, ${data.userName}! 🚀</h2>
      <p style="margin:0 0 20px;color:#4b5563;">
        Your AI agent for <strong>${data.businessName}</strong> has been approved and is now
        live on WhatsApp — handling customer messages automatically, 24/7.
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
// 6. Agent submitted — sent to admin when user creates their agent
// ---------------------------------------------------------------------------

export async function sendAgentSubmittedNotification(data: {
  userName: string
  userEmail: string
  businessName: string
  agentId: string
}) {
  await resend().emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `Agent ready for setup: ${data.businessName}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#111111;">New Agent Submitted</h2>
      <p style="margin:0 0 24px;color:#4b5563;">
        A business has submitted their agent details and it's ready for you to configure in ElevenLabs.
      </p>
      ${divider()}
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        ${infoRow("Business", data.businessName)}
        ${infoRow("Owner", data.userName)}
        ${infoRow("Email", data.userEmail)}
      </table>
      ${btn("Configure Agent", `${APP_URL}/admin/agents/${data.agentId}`)}
    `),
  })
}

// ---------------------------------------------------------------------------
// 7. Password reset — sent to user when they request a password reset
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(data: { name: string; email: string; resetLink: string }) {
  await resend().emails.send({
    from: FROM,
    to: data.email,
    subject: "Reset your D-Zero AI password",
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
    `),
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
