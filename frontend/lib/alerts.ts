import { apiClient } from "./api-client"
import { logError } from "./utils/error-handling"

interface SecurityAlertPayload {
  discordId: string
  message: string
  meta?: Record<string, string | number | null | undefined>
}

const SECURITY_ALERT_WEBHOOK_URL = process.env.SECURITY_ALERT_WEBHOOK_URL
const isDiscordWebhook = (url?: string | null) =>
  !!url && /discord(app)?\.com\/api\/webhooks/i.test(url)

export const sendSecurityAlert = async ({ discordId, message, meta }: SecurityAlertPayload) => {
  try {
    if (!SECURITY_ALERT_WEBHOOK_URL) {
      logError("Security alert (Webhook not configured)", { discordId, message, meta })
      return
    }

    const entries = meta && Object.keys(meta).length ? Object.entries(meta) : null
    const discordPayload = {
      embeds: [
        {
          title: `New login for ${discordId}`,
          description: message,
          color: 0xff4c6a,
          fields: entries
            ? entries.map(([key, value]) => ({
              name: key,
              value: String(value ?? "Unknown"),
              inline: true,
            }))
            : undefined,
          timestamp: new Date().toISOString(),
        },
      ],
    }

    const fallbackContent = [
      `🔐 **New login for ${discordId}**`,
      message,
      entries
        ? entries
          .map(([key, value]) => `• ${key}: ${value ?? "Unknown"}`)
          .join("\n")
        : null,
    ]
      .filter(Boolean)
      .join("\n")

    const body = isDiscordWebhook(SECURITY_ALERT_WEBHOOK_URL) ? discordPayload : { content: fallbackContent }

    await apiClient<any>(SECURITY_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch (error) {
    logError("Failed to deliver security alert", error)
  }
}
