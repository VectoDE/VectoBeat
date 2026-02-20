import { randomBytes, randomUUID, createHash } from "crypto"
import { NextResponse, type NextRequest } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { getServerSettings, updateServerSettings, recordApiTokenEvent } from "@/lib/db"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { DEFAULT_API_SCOPES, sanitizeScopes } from "@/lib/api-scopes"
import { sendNotificationEmail } from "@/lib/mailer"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"
import { getApiKeySecrets } from "@/lib/api-keys"

const AUTH_TOKEN_TYPES = ["control_panel", "server_settings", "status_api", "status_events"]

const isAuthorizedByToken = async (request: NextRequest) => {
  const secrets = await getApiKeySecrets(AUTH_TOKEN_TYPES, { includeEnv: false })
  return secrets.length > 0
    ? authorizeRequest(request, secrets, {
        allowLocalhost: true,
        headerKeys: ["authorization", "x-api-key", "x-server-settings-key", "x-status-key", "x-analytics-key"],
      })
    : false
}

type StoredToken = {
  id: string
  label: string
  hash: string
  lastFour: string
  createdAt: string
  rotatedAt?: string | null
  lastUsedAt?: string | null
  scopes: string[]
  createdBy?: string | null
  status: "active" | "disabled"
  expiresAt?: string | null
  leakDetected?: boolean
}

const sanitizeLabel = (value: unknown) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 48)
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

const normalizeScopes = (token: StoredToken) =>
  Array.isArray(token.scopes) && token.scopes.length ? token.scopes : [...DEFAULT_API_SCOPES]

const toMaskedToken = (token: StoredToken) => ({
  id: token.id,
  label: token.label,
  lastFour: token.lastFour,
  createdAt: token.createdAt,
  rotatedAt: token.rotatedAt ?? null,
  lastUsedAt: token.lastUsedAt ?? null,
  scopes: normalizeScopes(token),
  status: token.status === "disabled" ? "disabled" : ("active" as const),
  expiresAt: token.expiresAt ?? null,
  leakDetected: Boolean(token.leakDetected),
})

const ensureApiAccess = (tier: MembershipTier) => getPlanCapabilities(tier).features.apiTokens

const notify = async (email: string | undefined | null, subject: string, html: string) => {
  if (!email) return
  await sendNotificationEmail({ to: email, subject, html, preview: subject })
}

const disableExpiredTokens = async (
  guildId: string,
  discordId: string,
  tokens: StoredToken[],
  email?: string | null,
) => {
  const now = Date.now()
  const needsUpdate = tokens.some(
    (token) =>
      token.status !== "disabled" &&
      token.expiresAt &&
      !Number.isNaN(Date.parse(token.expiresAt)) &&
      new Date(token.expiresAt).getTime() <= now,
  )
  if (!needsUpdate) {
    return tokens
  }
  const nextTokens = tokens.map((token) => {
    if (
      token.status !== "disabled" &&
      token.expiresAt &&
      !Number.isNaN(Date.parse(token.expiresAt)) &&
      new Date(token.expiresAt).getTime() <= now
    ) {
      return { ...token, status: "disabled" as const }
    }
    return token
  })
  await updateServerSettings(guildId, discordId, { apiTokens: nextTokens })
  const expired = nextTokens.filter((token) => token.status === "disabled" && token.expiresAt)
  await Promise.all(
    expired.map((token) =>
      recordApiTokenEvent({
        guildId,
        tokenId: token.id,
        action: "expired",
        actorId: null,
        actorName: "expiration",
        metadata: { label: token.label, expiresAt: token.expiresAt },
      }),
    ),
  )
  await notify(
    email,
    "VectoBeat API token expired",
    "<p>Your API token was automatically disabled after reaching its expiration date.</p>",
  )
  return nextTokens
}

type RouteDeps = {
  verifyAccess?: typeof verifyControlPanelGuildAccess
  fetchSettings?: typeof getServerSettings
  saveSettings?: typeof updateServerSettings
  recordEvent?: typeof recordApiTokenEvent
  email?: typeof sendNotificationEmail
}

export const createApiTokenHandlers = (deps: RouteDeps = {}) => {
  const verifyAccess = deps.verifyAccess ?? verifyControlPanelGuildAccess
  const fetchSettings = deps.fetchSettings ?? getServerSettings
  const saveSettings = deps.saveSettings ?? updateServerSettings
  const recordEvent = deps.recordEvent ?? recordApiTokenEvent
  const email = deps.email ?? sendNotificationEmail

  const getHandler = async (request: NextRequest) => {
    const guildId = request.nextUrl.searchParams.get("guildId")
    const discordId = request.nextUrl.searchParams.get("discordId")
    const tokenAuthorized = await isAuthorizedByToken(request)
    if (!guildId || (!discordId && !tokenAuthorized)) {
      return NextResponse.json({ error: "guild_required" }, { status: 400 })
    }
    let tier: MembershipTier | undefined
    if (!tokenAuthorized) {
      const access = await verifyAccess(request, discordId!, guildId)
      if (!access.ok) {
        return NextResponse.json({ error: access.code }, { status: access.status })
      }

      if (!ensureApiAccess(access.tier)) {
        return NextResponse.json({ error: "plan_required" }, { status: 403 })
      }
      tier = access.tier
    }

    const settings = await fetchSettings(guildId)
    const tokens = Array.isArray((settings as any)?.apiTokens) ? ((settings as any).apiTokens as StoredToken[]) : []
    const updatedTokens = await disableExpiredTokens(guildId, discordId || "system", tokens, undefined)
    return NextResponse.json({ tokens: updatedTokens.map((token) => toMaskedToken(token)), tier: tier ?? "enterprise" })
  }

  const postHandler = async (request: NextRequest) => {
    const body = await request.json().catch(() => null)
    const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : ""
    const discordId = typeof body?.discordId === "string" ? body.discordId.trim() : ""
    const label = sanitizeLabel(body?.label)
    const requestedScopes = sanitizeScopes(body?.scopes)
    const tokenAuthorized = await isAuthorizedByToken(request)
    if (!guildId || !label || (!discordId && !tokenAuthorized)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    }
    let tier: MembershipTier | undefined
    const actorDiscordId = discordId || "system"
    let actorName = actorDiscordId
    let actorId = actorDiscordId
    if (!tokenAuthorized) {
      const access = await verifyAccess(request, discordId!, guildId)
      if (!access.ok) {
        return NextResponse.json({ error: access.code }, { status: access.status })
      }
      if (!ensureApiAccess(access.tier)) {
        return NextResponse.json({ error: "plan_required" }, { status: 403 })
      }
      tier = access.tier
      actorName = access.user?.username || access.user?.email || actorDiscordId
      actorId = access.user?.id || actorDiscordId
    }

    const settings = await fetchSettings(guildId)
    const existing = Array.isArray((settings as any)?.apiTokens) ? ((settings as any).apiTokens as StoredToken[]) : []
    if (existing.length >= 10) {
      return NextResponse.json({ error: "token_limit" }, { status: 400 })
    }

    const rawToken = `vb_${randomBytes(24).toString("hex")}`
    const ttlDays = typeof (settings as any)?.apiTokenTtlDays === "number" ? (settings as any).apiTokenTtlDays : 0
    const expiresAt = ttlDays > 0 ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString() : null
    const record: StoredToken = {
      id: randomUUID(),
      label,
      hash: hashToken(rawToken),
      lastFour: rawToken.slice(-4),
      createdAt: new Date().toISOString(),
      rotatedAt: null,
      lastUsedAt: null,
      scopes: requestedScopes,
      createdBy: discordId,
      status: "active",
      expiresAt,
      leakDetected: false,
    }

    const nextTokens = [...existing, record]
    await saveSettings(guildId, actorDiscordId, { apiTokens: nextTokens })

    await recordEvent({
      guildId,
      tokenId: record.id,
      action: "created",
      actorId,
      actorName,
      metadata: { label, scopes: requestedScopes, expiresAt },
    })

    return NextResponse.json({
      token: rawToken,
      record: toMaskedToken(record),
    })
  }

  const deleteHandler = async (request: NextRequest) => {
    const body = await request.json().catch(() => null)
    const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : ""
    const discordId = typeof body?.discordId === "string" ? body.discordId.trim() : ""
    const tokenId = typeof body?.tokenId === "string" ? body.tokenId.trim() : ""
    const tokenAuthorized = await isAuthorizedByToken(request)
    if (!guildId || !tokenId || (!discordId && !tokenAuthorized)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    }
    let actorName = discordId || "system"
    let actorId = discordId || "system"
    if (!tokenAuthorized) {
      const access = await verifyAccess(request, discordId!, guildId)
      if (!access.ok) {
        return NextResponse.json({ error: access.code }, { status: access.status })
      }
      if (!ensureApiAccess(access.tier)) {
        return NextResponse.json({ error: "plan_required" }, { status: 403 })
      }
      actorName = access.user?.username || access.user?.email || actorName
      actorId = access.user?.id || actorId
    }

    const settings = await fetchSettings(guildId)
    const existing = Array.isArray((settings as any)?.apiTokens) ? ((settings as any).apiTokens as StoredToken[]) : []
    const target = existing.find((token) => token.id === tokenId)
    const nextTokens = existing.filter((token) => token.id !== tokenId)
    await saveSettings(guildId, discordId || "system", { apiTokens: nextTokens })
    if (target) {
      await recordEvent({
        guildId,
        tokenId: tokenId,
        action: "revoked",
        actorId,
        actorName,
        metadata: { label: target.label },
      })
      await notify(
        undefined,
        "VectoBeat API token revoked",
        `<p>The token <strong>${target.label}</strong> was revoked.</p>`,
      )
    }
    return NextResponse.json({ ok: true })
  }

  const patchHandler = async (request: NextRequest) => {
    const body = await request.json().catch(() => null)
    const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : ""
    const discordId = typeof body?.discordId === "string" ? body.discordId.trim() : ""
    const tokenId = typeof body?.tokenId === "string" ? body.tokenId.trim() : ""
    const action = typeof body?.action === "string" ? body.action : "rotate"
    const tokenAuthorized = await isAuthorizedByToken(request)
    if (!guildId || !tokenId || (!discordId && !tokenAuthorized)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
    }
    let actorName = discordId || "system"
    let actorId = discordId || "system"
    if (!tokenAuthorized) {
      const access = await verifyAccess(request, discordId!, guildId)
      if (!access.ok) {
        return NextResponse.json({ error: access.code }, { status: access.status })
      }
      if (!ensureApiAccess(access.tier)) {
        return NextResponse.json({ error: "plan_required" }, { status: 403 })
      }
      actorName = access.user?.username || access.user?.email || actorName
      actorId = access.user?.id || actorId
    }
    const settings = await fetchSettings(guildId)
    const existing = Array.isArray((settings as any)?.apiTokens) ? ((settings as any).apiTokens as StoredToken[]) : []
    const target = existing.find((token) => token.id === tokenId)
    if (!target) {
      return NextResponse.json({ error: "unknown_token" }, { status: 404 })
    }

    const applyUpdate = (updater: (token: StoredToken) => StoredToken) =>
      existing.map((token) => (token.id === tokenId ? updater(token) : token))

    let nextTokens = existing
    let secret: string | null = null
    if (action === "rotate") {
      const rotatedAt = new Date().toISOString()
      const rawToken = `vb_${randomBytes(24).toString("hex")}`
      nextTokens = applyUpdate((token) => ({
        ...token,
        hash: hashToken(rawToken),
        lastFour: rawToken.slice(-4),
        rotatedAt,
      }))
      secret = rawToken
      await recordEvent({
        guildId,
        tokenId,
        action: "rotated",
        actorId,
        actorName,
        metadata: { label: target.label },
      })
    } else if (action === "disable" || action === "enable") {
      const nextStatus = action === "disable" ? "disabled" : "active"
      nextTokens = applyUpdate((token) => ({ ...token, status: nextStatus }))
      await recordEvent({
        guildId,
        tokenId,
        action,
        actorId,
        actorName,
        metadata: { label: target.label },
      })
      await notify(
        undefined,
        `API token ${action}`,
        `<p>The token <strong>${target.label}</strong> was ${action}.</p>`,
      )
    } else if (action === "mark_leak" || action === "clear_leak") {
      const leakDetected = action === "mark_leak"
      nextTokens = applyUpdate((token) => ({
        ...token,
        leakDetected,
        status: leakDetected ? "disabled" : token.status,
      }))
      await recordEvent({
        guildId,
        tokenId,
        action,
        actorId,
        actorName,
        metadata: { label: target.label },
      })
      await notify(
        undefined,
        leakDetected ? "API token leak reported" : "API token leak cleared",
        `<p>The token <strong>${target.label}</strong> was ${leakDetected ? "marked as leaked" : "cleared"}.</p>`,
      )
    } else if (action === "set_expiry") {
      const expiresAt = typeof body?.expiresAt === "string" ? body.expiresAt : null
      nextTokens = applyUpdate((token) => ({ ...token, expiresAt }))
      await recordEvent({
        guildId,
        tokenId,
        action,
        actorId,
        actorName,
        metadata: { label: target.label, expiresAt },
      })
    } else {
      return NextResponse.json({ error: "unsupported_action" }, { status: 400 })
    }

    await saveSettings(guildId, discordId || "system", { apiTokens: nextTokens })
    const record = nextTokens.find((token) => token.id === tokenId)!
    return NextResponse.json({
      token: secret,
      record: toMaskedToken(record),
    })
  }

  return { GET: getHandler, POST: postHandler, DELETE: deleteHandler, PATCH: patchHandler }
}

const defaultHandlers = createApiTokenHandlers()
export const GET = defaultHandlers.GET
export const POST = defaultHandlers.POST
export const DELETE = defaultHandlers.DELETE
export const PATCH = defaultHandlers.PATCH
