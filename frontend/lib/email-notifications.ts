import { sendNotificationEmail } from "@/lib/mailer"
import { renderMarkdownEmail } from "@/lib/email-templates"

const appUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")

export const sendWelcomeEmail = async ({
  to,
  name,
}: {
  to: string
  name: string
}) => {
  const markdown = `
**Welcome aboard, ${name}!**

You now have access to:

- **Control Panel:** configure VectoBeat across every guild you manage.
- **Support Desk:** open incidents, attach diagnostics, and follow real-time replies.
- **Automation Library:** prebuilt flows for onboarding, escalations, and monetization.

Need inspiration? Visit our [success stories](${normalizedAppUrl}/success-stories) to explore real-world playbooks.

If you ever get stuck, reply to this email or ping us from the Support Desk—we're online every day.
`

  const html = renderMarkdownEmail({
    title: "Welcome to VectoBeat",
    intro: "We're excited to help you automate community ops with confidence.",
    markdown,
  })

  return sendNotificationEmail({
    to,
    subject: "You’re in! Explore your new VectoBeat workspace",
    preview: "A quick tour of what you can do on day one.",
    html,
  })
}

export const sendSecurityAlertEmail = async ({
  to,
  location,
  ipAddress,
  userAgent,
}: {
  to: string
  location?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}) => {
  const markdown = `
A new login was detected on your account.

| Detail | Value |
| --- | --- |
| Location | ${location || "Unknown"} |
| IP Address | ${ipAddress || "Unknown"} |
| Device | ${userAgent || "Unavailable"} |

If this was you, no further action is required. Otherwise, revoke the session immediately from **Account → Security** and reset your Discord password.
`

  const html = renderMarkdownEmail({
    title: "New VectoBeat login detected",
    markdown,
  })

  return sendNotificationEmail({
    to,
    subject: "Security alert: new login detected",
    preview: "We spotted a new login on your VectoBeat account.",
    html,
  })
}

type TicketEvent = "created" | "response" | "status"

export const sendTicketEventEmail = async ({
  to,
  customerName,
  ticketId,
  subject,
  status,
  event,
  responder,
  messagePreview,
}: {
  to: string
  customerName: string
  ticketId: string
  subject?: string | null
  status: string
  event: TicketEvent
  responder?: string | null
  messagePreview?: string | null
}) => {
  const ticketUrl = `${normalizedAppUrl}/support-desk`
  const normalizedSubject = subject || "Support Ticket"

  let heading: string
  let markdown: string
  let preview: string

  if (event === "created") {
    heading = "We received your ticket"
    markdown = `
**Thanks for reaching out, ${customerName}!**

Your ticket **${normalizedSubject}** (${ticketId}) is now open. A specialist will respond shortly.

You can attach additional context anytime from the Support Desk:
${ticketUrl}
`
    preview = "Ticket received—our team will respond shortly."
  } else if (event === "response") {
    heading = responder ? `${responder} replied to your ticket` : "New reply on your ticket"
    markdown = `
**${heading}**

> ${messagePreview || "The latest reply is available in your Support Desk inbox."}

Check the full conversation, upload more evidence, or close the request when you're satisfied:
${ticketUrl}
`
    preview = "Someone replied to your VectoBeat ticket."
  } else {
    heading = `Ticket status updated: ${status}`
    markdown = `
Your ticket **${normalizedSubject}** (${ticketId}) is now marked as **${status}**.

Visit the Support Desk if you'd like to reopen the conversation or add final notes:
${ticketUrl}
`
    preview = `Ticket status changed to ${status}.`
  }

  const html = renderMarkdownEmail({
    title: heading,
    markdown,
  })

  return sendNotificationEmail({
    to,
    subject: `[VectoBeat Support] ${normalizedSubject}`,
    preview,
    html,
  })
}

const summarizeMarkdown = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[_>*`#-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140)

export const sendNewsletterEmail = async ({
  to,
  subject,
  markdown,
  sample = false,
}: {
  to: string
  subject: string
  markdown: string
  sample?: boolean
}) => {
  const preview = summarizeMarkdown(markdown)
  const html = renderMarkdownEmail({
    title: subject,
    intro: sample ? "Sample preview — this copy is what subscribers will receive." : undefined,
    markdown,
    footer:
      "You are receiving this because you subscribed to VectoBeat updates. Manage your preferences from Account → Privacy or unsubscribe via support.",
  })

  return sendNotificationEmail({
    to,
    subject: sample ? `[Sample] ${subject}` : subject,
    preview,
    html,
  })
}
