import { NextRequest, NextResponse } from "next/server"
import { verifyRequestForUser } from "@/lib/auth"
import {
  getGuildSubscriptionTier,
  getSuccessPodRequests,
  recordSuccessPodRequest,
  type SuccessPodRequestRecord,
} from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"
import { sendNotificationEmail } from "@/lib/mailer"

const SUCCESS_POD_EMAIL = process.env.SUCCESS_POD_EMAIL || process.env.SMTP_FROM || "timhauke@uplytech.de"

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const sanitize = (value?: string | null, max = 255) => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.slice(0, max)
}

type RouteDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchTier?: typeof getGuildSubscriptionTier
  fetchRequests?: typeof getSuccessPodRequests
  saveRequest?: typeof recordSuccessPodRequest
  mail?: typeof sendNotificationEmail
}

export const createSuccessPodHandlers = (deps: RouteDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchTier = deps.fetchTier ?? getGuildSubscriptionTier
  const fetchRequests = deps.fetchRequests ?? getSuccessPodRequests
  const saveRequest = deps.saveRequest ?? recordSuccessPodRequest
  const mail = deps.mail ?? sendNotificationEmail

  const getHandler = async (request: NextRequest) => {
    try {
      const guildId = sanitize(request.nextUrl.searchParams.get("guildId"), 32)
      const discordId = sanitize(request.nextUrl.searchParams.get("discordId"), 32)
      if (!guildId || !discordId) {
        return NextResponse.json({ error: "guildId_and_discordId_required" }, { status: 400 })
      }
      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }
      const tier = (await fetchTier(guildId)) as MembershipTier
      const plan = getPlanCapabilities(tier)
      if (!plan.features.successPod) {
        return NextResponse.json({ error: "plan_required" }, { status: 403 })
      }
      const requests = await fetchRequests(guildId, 15)
      return NextResponse.json({ requests })
    } catch (error) {
      console.error("[VectoBeat] Failed to load success pod requests:", error)
      return NextResponse.json({ error: "unable_to_load_requests" }, { status: 500 })
    }
  }

  const postHandler = async (request: NextRequest) => {
    try {
      const body = await request.json()
      const guildId = sanitize(body?.guildId, 32)
      const discordId = sanitize(body?.discordId, 32)
      const guildName = sanitize(body?.guildName, 120) || "Unnamed Guild"
      const contact = sanitize(body?.contact, 120)
      const summary = sanitize(body?.summary, 3000)
      if (!guildId || !discordId || !summary) {
        return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
      }
      const auth = await verifyUser(request, discordId)
      if (!auth.valid) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
      }
      const tier = (await fetchTier(guildId)) as MembershipTier
      const plan = getPlanCapabilities(tier)
      if (!plan.features.successPod) {
        return NextResponse.json({ error: "plan_required" }, { status: 403 })
      }
      const requestRecord = await saveRequest({
        guildId,
        guildName,
        contact,
        summary,
        createdBy: discordId,
        source: "control panel",
        tier,
      })
      if (!requestRecord) {
        return NextResponse.json({ error: "unable_to_create_request" }, { status: 500 })
      }

      await notifySuccessPodEmail(requestRecord, { guildName, contact }, mail)

      return NextResponse.json({ request: requestRecord })
    } catch (error) {
      console.error("[VectoBeat] Failed to submit success pod request:", error)
      return NextResponse.json({ error: "server_error" }, { status: 500 })
    }
  }

  return { GET: getHandler, POST: postHandler }
}

const defaultHandlers = createSuccessPodHandlers()
export const GET = defaultHandlers.GET
export const POST = defaultHandlers.POST

const notifySuccessPodEmail = async (
  request: SuccessPodRequestRecord,
  metadata: { guildName: string; contact: string },
  mailer: typeof sendNotificationEmail = sendNotificationEmail,
) => {
  try {
    const html = `
      <p><strong>Guild:</strong> ${metadata.guildName} (${request.guildId})</p>
      <p><strong>Plan:</strong> ${request.tier ?? "scale"}</p>
      <p><strong>Contact:</strong> ${metadata.contact || request.contact || "Not provided"}</p>
      <p><strong>Summary:</strong></p>
      <p>${request.summary.replace(/\n/g, "<br/>")}</p>
    `
    await mailer({
      to: SUCCESS_POD_EMAIL,
      subject: `[Success Pod] ${metadata.guildName} (${request.tier ?? "scale"})`,
      preview: request.summary.slice(0, 120),
      html,
    })
  } catch (error) {
    console.error("[VectoBeat] Failed to send success pod email:", error)
  }
}
