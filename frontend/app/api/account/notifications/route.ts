import { type NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserContact, getUserNotifications, updateUserNotifications } from "@/lib/db"
import { sendNotificationEmail } from "@/lib/mailer"

const appUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchContact?: typeof getUserContact
  fetchNotifications?: typeof getUserNotifications
  saveNotifications?: typeof updateUserNotifications
  notify?: typeof sendNotificationEmail
}

export const createNotificationHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchContact = deps.fetchContact ?? getUserContact
  const fetchNotifications = deps.fetchNotifications ?? getUserNotifications
  const saveNotifications = deps.saveNotifications ?? updateUserNotifications
  const notify = deps.notify ?? sendNotificationEmail

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    if (!discordId) {
      return NextResponse.json({ error: "discordId is required" }, { status: 400 })
    }

    const auth = await verifyUser(request, discordId)
    if (!auth.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const notifications = await fetchNotifications(discordId)
    return NextResponse.json(notifications)
  }

  const putHandler = async (request: NextRequest) => {
    try {
      const { discordId, ...updates } = await request.json()
      if (!discordId) {
        return NextResponse.json({ error: "discordId is required" }, { status: 400 })
      }

      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }

      const allowedKeys = [
        "maintenanceAlerts",
        "downtimeAlerts",
        "releaseNotes",
        "securityNotifications",
        "betaProgram",
        "communityEvents",
      ]
      const sanitized: Record<string, any> = {}
      for (const key of allowedKeys) {
        if (key in updates) {
          sanitized[key] = updates[key]
        }
      }

      const notifications = await saveNotifications(discordId, sanitized)

      const contact = await fetchContact(discordId)
      if (contact?.email) {
        const summaryRows = Object.entries(notifications)
          .map(
            ([key, value]) => `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #1f2937;background:#0f172a;color:#9ca3af;text-transform:capitalize;">${key.replace(/([A-Z])/g, " $1")}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #1f2937;background:#0f172a;color:#f8fafc;text-align:right;">${
                value ? "Enabled" : "Disabled"
              }</td>
            </tr>`,
          )
          .join("")

        const html = `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#020617;padding:32px;font-family:'Inter','Segoe UI',system-ui, -apple-system, sans-serif;">
          <tr>
            <td style="text-align:center;padding-bottom:24px;">
              <img src="${normalizedAppUrl}/icon.svg" alt="VectoBeat" width="56" height="56" />
              <h1 style="color:#f8fafc;margin:16px 0 0;font-size:20px;">Notification Preferences Updated</h1>
              <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Here is a snapshot of your current alert settings.</p>
            </td>
          </tr>
          <tr>
            <td>
              <table width="100%" cellspacing="0" cellpadding="0" style="border-radius:16px;overflow:hidden;border:1px solid #1f2937;">
                ${summaryRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;text-align:center;color:#64748b;font-size:12px;">
              You can review these settings anytime from your VectoBeat account dashboard.<br/>
              If you did not make this change, please contact support immediately.
            </td>
          </tr>
        </table>
      `

        void notify({
          to: contact.email,
          subject: "Your VectoBeat notification preferences were updated",
          preview: "We saved your latest alert preferences.",
          html,
        })
      }

      return NextResponse.json(notifications)
    } catch (error) {
      console.error("[VectoBeat] Failed to update notifications:", error)
      return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 })
    }
  }

  return { GET: getHandler, PUT: putHandler }
}

const defaultHandlers = createNotificationHandlers()
export const GET = defaultHandlers.GET
export const PUT = defaultHandlers.PUT
