import { Resend } from "resend"

export async function sendDemoRequest(data: {
  name: string
  email: string
  businessName: string
  preferredDate: string
  preferredTime: string
  message?: string
}) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: "Agentis <noreply@agentis.io>",
    to: process.env.DEMO_EMAIL!,
    subject: `Demo Request from ${data.businessName}`,
    html: `
      <h2>New Demo Request</h2>
      <p><strong>Name:</strong> ${data.name}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Business:</strong> ${data.businessName}</p>
      <p><strong>Preferred Date:</strong> ${data.preferredDate}</p>
      <p><strong>Preferred Time:</strong> ${data.preferredTime}</p>
      ${data.message ? `<p><strong>Message:</strong> ${data.message}</p>` : ""}
    `,
  })
}
