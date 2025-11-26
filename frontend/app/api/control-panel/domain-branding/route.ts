import { NextResponse, type NextRequest } from "next/server"
import { getServerSettings, updateServerSettings } from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import type { MembershipTier } from "@/lib/memberships"
import { defaultServerFeatureSettings, type ServerFeatureSettings } from "@/lib/server-settings"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const DOMAIN_TARGET =
  process.env.BRANDING_CNAME_TARGET || process.env.NEXT_PUBLIC_BRANDING_CNAME_TARGET || "cname.vectobeat.uplytech.de"

const sanitizeDomain = (value?: string | null) => {
  if (typeof value !== "string") return ""
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ""
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  if (!/^[a-z0-9.-]+$/.test(withoutProtocol)) {
    return ""
  }
  return withoutProtocol.slice(0, 150)
}

const sanitizeUrl = (value?: string | null) => {
  if (!value) return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  const prefixed = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(prefixed)
    return url.toString().slice(0, 500)
  } catch {
    return ""
  }
}

const sanitizeEmail = (value?: string | null) => {
  if (!value) return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return ""
  }
  return trimmed.slice(0, 120)
}

const ensureAccess = (tier: MembershipTier) => getPlanCapabilities(tier).features.apiTokens

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : ""
  const discordId = typeof body?.discordId === "string" ? body.discordId.trim() : ""
  const action = typeof body?.action === "string" ? body.action : "save"
  if (!guildId || !discordId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  const access = await verifyControlPanelGuildAccess(request, discordId, guildId)
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status })
  }

  if (!ensureAccess(access.tier)) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  const current = (await getServerSettings(guildId)) as ServerFeatureSettings
  const updates: Partial<ServerFeatureSettings> = {}

  if (action === "save") {
    const domain = sanitizeDomain(body?.customDomain)
    const assetPackUrl = sanitizeUrl(body?.assetPackUrl)
    const mailFromAddress = sanitizeEmail(body?.mailFromAddress)
    const embedAccentColor =
      typeof body?.embedAccentColor === "string" && body.embedAccentColor.trim()
        ? body.embedAccentColor.trim()
        : ""
    const embedLogoUrl = sanitizeUrl(body?.embedLogoUrl)
    const embedCtaLabel =
      typeof body?.embedCtaLabel === "string" ? body.embedCtaLabel.trim().slice(0, 80) : ""
    const embedCtaUrl = sanitizeUrl(body?.embedCtaUrl)
    updates.customDomain = domain
    updates.assetPackUrl = assetPackUrl
    updates.mailFromAddress = mailFromAddress
    updates.embedAccentColor = embedAccentColor
    updates.embedLogoUrl = embedLogoUrl
    updates.embedCtaLabel = embedCtaLabel
    updates.embedCtaUrl = embedCtaUrl
    updates.customDomainDnsRecord = domain ? DOMAIN_TARGET : ""
    updates.customDomainStatus = domain ? "pending_dns" : "unconfigured"
    updates.customDomainTlsStatus = domain ? "pending" : "pending"
    updates.customDomainVerifiedAt = null
  } else if (action === "mark_active") {
    if (!(current.customDomain || "").trim()) {
      return NextResponse.json({ error: "domain_required" }, { status: 400 })
    }
    updates.customDomainStatus = "verified"
    updates.customDomainTlsStatus = "active"
    updates.customDomainVerifiedAt = new Date().toISOString()
  } else if (action === "reset") {
    updates.customDomain = ""
    updates.customDomainStatus = "unconfigured"
    updates.customDomainDnsRecord = ""
    updates.customDomainTlsStatus = "pending"
    updates.customDomainVerifiedAt = null
    updates.assetPackUrl = ""
    updates.mailFromAddress = ""
  } else {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
  }

  const merged = await updateServerSettings(guildId, discordId, {
    ...current,
    ...updates,
  })

  return NextResponse.json({ settings: merged ?? defaultServerFeatureSettings })
}
