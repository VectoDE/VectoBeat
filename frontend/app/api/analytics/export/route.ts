import { NextResponse, type NextRequest } from "next/server"
import path from "node:path"
import { promises as fs } from "node:fs"
import { verifyRequestForUser } from "@/lib/auth"
import { getUserSubscriptions } from "@/lib/db"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
const EXPORT_ROOT =
  process.env.ANALYTICS_EXPORT_PATH || path.resolve(process.cwd(), "..", "bot", "data", "analytics_exports")

type ExportDeps = {
  verifyUser?: typeof verifyRequestForUser
  fetchSubscriptions?: typeof getUserSubscriptions
  readFile?: typeof fs.readFile
}

export const createAnalyticsExportHandlers = (deps: ExportDeps = {}) => {
  const verifyUser = deps.verifyUser ?? verifyRequestForUser
  const fetchSubscriptions = deps.fetchSubscriptions ?? getUserSubscriptions
  const readFile = deps.readFile ?? fs.readFile

  const getHandler = async (request: NextRequest) => {
    const discordId = request.nextUrl.searchParams.get("discordId")
    const guildId = request.nextUrl.searchParams.get("guildId")
    if (!discordId || !guildId) {
      return NextResponse.json({ error: "discordId_and_guildId_required" }, { status: 400 })
    }

    const verification = await verifyUser(request, discordId)
    if (!verification.valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const subscriptions = await fetchSubscriptions(discordId)
    const membership = subscriptions.find((sub) => sub.discordServerId === guildId && sub.status === "active")
    if (!membership) {
      return NextResponse.json({ error: "guild_not_found" }, { status: 404 })
    }
    const plan = getPlanCapabilities(membership.tier as MembershipTier)
    const hasPredictive = plan.serverSettings.maxAnalyticsMode === "predictive"
    if (!plan.serverSettings.exportWebhooks || !hasPredictive) {
      return NextResponse.json({ error: "growth_required" }, { status: 403 })
    }

    const safeFile = path.basename(guildId).replace(/[^a-zA-Z0-9_-]/g, "")
    const resolved = path.resolve(EXPORT_ROOT, `${safeFile}.jsonl`)
    if (!resolved.startsWith(path.resolve(EXPORT_ROOT))) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 })
    }

    try {
      const contents = await readFile(resolved)
      const response = new NextResponse(contents, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFile}-analytics.jsonl"`,
          "Cache-Control": "no-store",
        },
      })
      return response
    } catch (error: any) {
      if (error && error.code === "ENOENT") {
        // Gracefully return an empty payload when no export exists yet instead of 404.
        return new NextResponse("", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeFile}-analytics.jsonl"`,
            "Cache-Control": "no-store",
          },
        })
      }
      console.error("[VectoBeat] Failed to load analytics export:", error)
      return NextResponse.json({ error: "export_unavailable" }, { status: 500 })
    }
  }

  return { GET: getHandler }
}

const defaultHandlers = createAnalyticsExportHandlers()
export const GET = defaultHandlers.GET
