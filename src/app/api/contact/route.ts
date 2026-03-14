import { NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  businessName: z.string().min(2),
  subject: z.string().min(1),
  message: z.string().min(10),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const RESEND_KEY = process.env.RESEND_API_KEY
    const TO = process.env.DEMO_EMAIL!

    if (RESEND_KEY) {
      const { Resend } = await import("resend")
      const resend = new Resend(RESEND_KEY)
      await resend.emails.send({
        from: "Agentis Contact <noreply@agentis.io>",
        to: TO,
        replyTo: data.email,
        subject: `[Contact] ${data.subject} — ${data.businessName}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <table cellpadding="8" style="border-collapse:collapse">
            <tr><td><strong>Name</strong></td><td>${data.name}</td></tr>
            <tr><td><strong>Email</strong></td><td>${data.email}</td></tr>
            <tr><td><strong>Business</strong></td><td>${data.businessName}</td></tr>
            <tr><td><strong>Subject</strong></td><td>${data.subject}</td></tr>
          </table>
          <h3 style="margin-top:16px">Message</h3>
          <p style="white-space:pre-wrap">${data.message}</p>
        `,
      })
    }

    // Always succeed — even without Resend, form works
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}
