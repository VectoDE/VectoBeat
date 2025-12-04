import { type NextRequest, NextResponse } from "next/server"
import {
  persistUserProfile,
  getUserContact,
  upsertUserContact,
  getUserSecurity,
  recordLoginSession,
  recordLoginEvent,
  validateSessionHash,
  getUserRole,
  hasWelcomeEmailBeenSent,
  markWelcomeEmailSent,
  getUserApiKey,
  hasSeenLoginIp,
} from "@/lib/db"
import { ensureStripeCustomerForUser } from "@/lib/stripe-customers"
import { getBotGuildPresence } from "@/lib/bot-status"
import { hashSessionToken } from "@/lib/session"
import { sendSecurityAlert } from "@/lib/alerts"
import { sendSecurityAlertEmail, sendWelcomeEmail } from "@/lib/email-notifications"
import { resolveClientIp, resolveClientLocation } from "@/lib/request-metadata"

const unauthenticatedResponse = (message: string) =>
  NextResponse.json(
    {
      authenticated: false,
      error: message,
    },
    { status: 200 },
  )

interface DiscordFetchResult {
  ok: boolean
  unauthorized: boolean
  status: number
  body: any
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type ExtendedNextRequest = NextRequest & {
  ip?: string | null
  geo?: {
    city?: string | null
    region?: string | null
    country?: string | null
  } | null
}

const sessionCache = new Map<
  string,
  {
    data: any
    expires: number
  }
>()

const buildAvatarUrl = (user: { id: string; avatar?: string | null; discriminator?: string | null }) => {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
  }

  const discriminator = user.discriminator ? parseInt(user.discriminator, 10) : 0
  const fallbackIndex = Number.isNaN(discriminator) ? 0 : discriminator % 5
  return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`
}

const hasAdminPermissions = (permissions?: string | number | null) => {
  if (typeof permissions === "number") {
    return (permissions & 0x8) === 0x8
  }

  if (typeof permissions === "string") {
    try {
      return (BigInt(permissions) & BigInt(0x8)) === BigInt(0x8)
    } catch {
      return false
    }
  }

  return false
}


const discordFetch = async (path: string, token: string, attempt = 1): Promise<DiscordFetchResult> => {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "VectoBeat/2.0.0-LTS",
    },
  })

  const contentType = response.headers.get("content-type") || ""
  let body: any = null

  if (contentType.includes("application/json")) {
    try {
      body = await response.json()
    } catch {
      body = null
    }
  } else {
    try {
      body = await response.text()
    } catch {
      body = null
    }
  }

  if (response.status === 429 && attempt < 3) {
    const retryAfterHeader = Number(response.headers.get("Retry-After")) || 0
    const retryAfterBody =
      typeof body === "object" && body !== null && "retry_after" in body ? Number(body.retry_after) : 0
    const retryAfterMs = Math.max(retryAfterHeader, retryAfterBody) * 1000 || 500
    await sleep(Math.min(Math.max(retryAfterMs, 300), 3000))
    return discordFetch(path, token, attempt + 1)
  }

  return {
    ok: response.ok,
    unauthorized: response.status === 401 || response.status === 403,
    body,
    status: response.status,
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    let token: string | undefined

    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7)
    }

    if (!token) {
      const cookieToken = request.cookies.get("discord_token")
      if (cookieToken?.value) {
        token = cookieToken.value
      }
    }

    if (!token) {
      return unauthenticatedResponse("Missing authentication token")
    }

    const userAgent = request.headers.get("user-agent") || null
    const extendedRequest = request as ExtendedNextRequest
    const resolverRequest = {
      headers: request.headers,
      ip: extendedRequest.ip ?? null,
      geo: extendedRequest.geo ?? undefined,
    } as NextRequest & { ip?: string | null; geo?: { city?: string | null; region?: string | null; country?: string | null } }
    const ipAddress = resolveClientIp(resolverRequest)
    const location = resolveClientLocation(resolverRequest)

    // Validate token format (Discord tokens are alphanumeric)
    if (!/^[A-Za-z0-9._-]+$/.test(token)) {
      return unauthenticatedResponse("Invalid token format")
    }

    const sessionHash = hashSessionToken(token)
    const cached = sessionCache.get(token)
    const now = Date.now()
    if (cached && cached.expires > now) {
      const stillValid = await validateSessionHash(cached.data.id, sessionHash)
      if (stillValid) {
        return NextResponse.json(cached.data, { status: 200 })
      }
      sessionCache.delete(token)
    }

    const userResult = await discordFetch("/users/@me", token)
    if (!userResult.ok) {
      if (userResult.unauthorized) {
        return unauthenticatedResponse("Invalid or expired token")
      }

      console.error("[VectoBeat] Discord user fetch failed:", userResult.status, userResult.body)
      return unauthenticatedResponse("Discord API unavailable. Please try again.")
    }

    const userData = userResult.body as Record<string, any>

    // Validate user data
    if (!userData.id || !userData.username) {
      throw new Error("Invalid user data from Discord")
    }

    const fetchGuilds = async () => {
      const first = await discordFetch("/users/@me/guilds", token)
      if (first.ok || first.unauthorized || first.status !== 429) {
        return first
      }
      const retryAfterMs = Math.max(0, Math.floor((first.body?.retry_after ?? 0) * 1000))
      if (retryAfterMs > 0 && retryAfterMs < 2_000) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
        return discordFetch("/users/@me/guilds", token)
      }
      return first
    }

    const guildsResult = await fetchGuilds()
    let guilds: any[] = []

    if (guildsResult.ok && Array.isArray(guildsResult.body)) {
      guilds = guildsResult.body
    } else if (!guildsResult.ok && !guildsResult.unauthorized) {
      if (guildsResult.status !== 429) {
        console.error("[VectoBeat] Discord guild fetch failed:", guildsResult.status, guildsResult.body)
      }
    }

    const botGuildIds = await getBotGuildPresence()
    const fallbackHasBot = false
    const simplifiedGuilds = guilds.map((g: any) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      owner: g.owner || false,
      permissions: g.permissions || "0",
      isAdmin: hasAdminPermissions(g.permissions),
      hasBot: botGuildIds.has(g.id) || fallbackHasBot,
    }))
    const membershipGuilds = simplifiedGuilds
    const adminGuilds = membershipGuilds.filter((guild: any) => guild.isAdmin)
    const botGuildCount =
      botGuildIds.size > 0 ? botGuildIds.size : membershipGuilds.filter((guild: any) => guild.hasBot).length

    const avatarUrl = buildAvatarUrl({
      id: userData.id,
      avatar: userData.avatar,
      discriminator: userData.discriminator,
    })

    await persistUserProfile({
      id: userData.id,
      username: userData.username,
      displayName: userData.global_name || userData.username,
      discriminator: userData.discriminator,
      email: userData.email,
      phone: userData.phone,
      avatar: userData.avatar,
      avatarUrl,
      guilds: simplifiedGuilds,
    })

    await upsertUserContact({
      discordId: userData.id,
      email: userData.email,
      phone: userData.phone,
    })

    // Ensure the user has a persisted API key for authenticated API usage.
    await getUserApiKey(userData.id)

    const contact = await getUserContact(userData.id)
    const stripeCustomerId =
      (contact && "stripeCustomerId" in contact && contact.stripeCustomerId) ||
      (await ensureStripeCustomerForUser({
        discordId: userData.id,
        email: contact?.email ?? userData.email ?? null,
        phone: contact?.phone ?? userData.phone ?? null,
        name: userData.global_name || userData.display_name || userData.username,
        contact,
      }))
    if (contact?.email) {
      void (async () => {
        const alreadySent = await hasWelcomeEmailBeenSent(userData.id)
        if (alreadySent) return
        const result = await sendWelcomeEmail({
          to: contact.email!,
          name: userData.global_name || userData.display_name || userData.username,
        })
        if (result.delivered) {
          await markWelcomeEmailSent(userData.id)
        }
      })()
    }
    const security = await getUserSecurity(userData.id)
    const role = await getUserRole(userData.id)
    const sessionInfo = await recordLoginSession({
      discordId: userData.id,
      sessionHash,
      userAgent,
      ipAddress,
      location,
    })
    const isFirstTimeFromIp = ipAddress ? !(await hasSeenLoginIp(userData.id, ipAddress)) : false

    if (!sessionInfo.allowed) {
      sessionCache.delete(token)
      return unauthenticatedResponse("Session revoked. Please sign in again.")
    }

    if (sessionInfo.isNew && sessionInfo.sessionId) {
      await recordLoginEvent({
        discordId: userData.id,
        sessionId: sessionInfo.sessionId,
        ipAddress,
        userAgent,
        location,
        notified: security.loginAlerts && isFirstTimeFromIp,
      })

      if (security.loginAlerts && isFirstTimeFromIp) {
        await sendSecurityAlert({
          discordId: userData.id,
          message: "New login detected",
          meta: {
            Location: location || "Unknown",
            "IP Address": ipAddress || "Unknown",
            "User Agent": userAgent || "Unavailable",
          },
        })
        if (contact?.email) {
          void sendSecurityAlertEmail({
            to: contact.email,
            location,
            ipAddress,
            userAgent,
          })
        }
      }
    }

    const responsePayload = {
      authenticated: true,
      id: userData.id,
      email: contact.email || userData.email || null,
      phone: contact.phone || userData.phone || null,
      username: userData.username,
      avatar: userData.avatar || null,
      avatarUrl,
      displayName: userData.global_name || userData.username,
      discriminator: userData.discriminator,
      createdAt: new Date().toISOString(),
      hasBotInServer: adminGuilds.some((guild: any) => guild.hasBot),
      membershipCount: membershipGuilds.length,
      adminGuildCount: adminGuilds.length,
      botGuildCount,
      guildCount: membershipGuilds.length,
      guilds: adminGuilds,
      membershipGuilds,
      adminGuilds,
      requiresTwoFactor: Boolean(security.twoFactorEnabled),
      role,
      currentSessionId: sessionInfo.sessionId,
      stripeCustomerId: stripeCustomerId ?? null,
    }

    sessionCache.set(token, {
      data: responsePayload,
      expires: Date.now() + 30 * 1000,
    })

    return NextResponse.json(responsePayload, { status: 200 })
  } catch (error) {
    console.error("[VectoBeat] Session verification error:", error)
    return NextResponse.json({ error: "Failed to verify session" }, { status: 500 })
  }
}
