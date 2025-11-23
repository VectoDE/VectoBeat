import nodemailer from "nodemailer"

const smtpHost = process.env.SMTP_HOST
const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587
const smtpSecure = process.env.SMTP_SECURE === "true"
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS
const smtpFrom = process.env.SMTP_FROM || "Tim Hauke <timhauke@uplytech.de>"

const canSendMail = Boolean(smtpHost && smtpUser && smtpPass)

const transporter = canSendMail
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : null

export interface NotificationEmailPayload {
  to: string
  subject: string
  preview?: string
  html: string
  from?: string
}

export const sendNotificationEmail = async (payload: NotificationEmailPayload) => {
  if (!transporter) {
    return { delivered: false, reason: "Transport unavailable" }
  }

  try {
    await transporter.sendMail({
      from: payload.from || smtpFrom,
      to: payload.to,
      subject: payload.subject,
      text: payload.preview || "",
      html: payload.html,
    })

    return { delivered: true }
  } catch (error) {
    console.error("[VectoBeat] Failed to send notification email:", error)
    return { delivered: false, reason: (error as Error).message }
  }
}
