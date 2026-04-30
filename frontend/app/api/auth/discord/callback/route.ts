import { type NextRequest, NextResponse } from "next/server"
import { DISCORD_CLIENT_ID, DISCORD_LOGIN_SCOPE_STRING } from "@/lib/config"
import { getUserSecurity, persistUserProfile, recordLoginSession } from "@/lib/db"
import { resolveClientLocation } from "@/lib/request-metadata"
import { hashSessionToken } from "@/lib/session"
import { apiClient } from "@/lib/api-client"
import {
  CODE_VERIFIER_COOKIE,
  REDIRECT_COOKIE,
  clearPkceCookies,
  decodeStatePayload,
  resolvePreferredOrigin,
  sanitizeRedirectUri,
} from "@/lib/discord-auth"

const resolveStateRedirect = (
  request: NextRequest,
  override?: string | null,
  allowFallback: boolean = true,
): URL | null => {

  let stateValue: string | null
  if (override !== undefined) {
    stateValue = override
  } else if (allowFallback) {
    stateValue = request.nextUrl.searchParams.get("state")
  } else {
    stateValue = null
  }
  if (!stateValue) {
    return null
  }

  if (stateValue.startsWith("/")) {
    return new URL(stateValue, resolvePreferredOrigin(request))
  }

  try {
    const parsed = new URL(stateValue)
    const allowedOrigins = new Set<string>()
    const registerOrigin = (value: string | null | undefined) => {
      if (!value) return
      try {
        const normalized = new URL(value.replace(/\/$/, ""))
        allowedOrigins.add(normalized.origin)
      } catch {
        // Ignore invalid entries; helps keep the allowlist robust in prod.
      }
    }

    registerOrigin(request.nextUrl.origin)
    registerOrigin(resolvePreferredOrigin(request))
    registerOrigin(process.env.NEXT_PUBLIC_URL || "")
    registerOrigin(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

    const additionalOrigins =
      process.env.ALLOWED_REDIRECT_ORIGINS || process.env.NEXT_PUBLIC_ALLOWED_REDIRECT_ORIGINS
    if (additionalOrigins) {
      additionalOrigins
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => {
          registerOrigin(/^https?:\/\//i.test(entry) ? entry : `https://${entry}`)
        })
    }

    // Always allow the public production domains and the direct IP for cross-site handshakes.
    ;["https://vectobeat.uplytech.de", "https://bot.vectobeat.uplytech.de", "https://45.84.196.19", "http://45.84.196.19"].forEach(
      (origin) => registerOrigin(origin),
    )

    if (allowedOrigins.has(parsed.origin)) {
      return parsed
    }
  } catch {
    return null
  }

  return null
}



export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const rawStateToken = searchParams.get("state")
  const decodedState = decodeStatePayload(rawStateToken)

  if (!code) {
    const response = NextResponse.redirect(new URL("/?error=no_code", request.url))
    clearPkceCookies(response)
    return response
  }

  try {
    const fallbackOrigin = resolvePreferredOrigin(request)
    const fallbackRedirect = `${fallbackOrigin.replace(/\/$/, "")}/api/auth/discord/callback`
    const redirectCookie = request.cookies.get(REDIRECT_COOKIE)?.value
    const redirectTarget = sanitizeRedirectUri(decodedState?.r || redirectCookie || null, fallbackRedirect)
    const pkceVerifier =
      decodedState?.v ?? request.cookies.get(CODE_VERIFIER_COOKIE)?.value ?? null

    const tokenData = await apiClient<any>("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: (() => {
        const payload = new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET || "",
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectTarget,
          scope: DISCORD_LOGIN_SCOPE_STRING,
        })
        if (pkceVerifier) {
          payload.set("code_verifier", pkceVerifier)
        }
        return payload
      })(),
    })

    const userData = await apiClient<any>("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const guilds = await apiClient<any>("https://discord.com/api/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    // Persist user profile and guilds
    const mappedGuilds = Array.isArray(guilds)
      ? guilds.map((g: any) => {
        const perms = typeof g.permissions === "string" ? Number(g.permissions) : 0
        const isAdmin = Boolean(g.owner) || (Number.isFinite(perms) && ((perms & 0x20) !== 0 || (perms & 0x8) !== 0))
        return {
          id: g.id,
          name: g.name,
          icon: g.icon,
          owner: g.owner,
          permissions: g.permissions,
          isAdmin,
          hasBot: false, // Assume false initially; actual presence checked via bot status/subscriptions
        }
      })
      : []

    await persistUserProfile({
      id: userData.id,
      username: userData.username,
      displayName: userData.global_name || userData.username,
      discriminator: userData.discriminator,
      email: userData.email || null,
      phone: userData.phone || null,
      avatar: userData.avatar,
      avatarUrl: userData.avatar
        ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.${userData.avatar.startsWith("a_") ? "gif" : "png"}`
        : null,
      guilds: mappedGuilds,
    })

    const security = await getUserSecurity(userData.id)
    const redirectPath = security.twoFactorEnabled ? "/two-factor?context=login" : "/control-panel"
    const stateOverride = decodedState ? decodedState.u ?? null : undefined
    const stateRedirect = !security.twoFactorEnabled
      ? resolveStateRedirect(request, stateOverride, decodedState ? false : true)
      : null
    const redirectUrl = stateRedirect ?? new URL(redirectPath, resolvePreferredOrigin(request))
    redirectUrl.searchParams.set("user_id", userData.id)

    const response = NextResponse.redirect(redirectUrl)

    const sessionHash = hashSessionToken(tokenData.access_token)
    const userAgent = request.headers.get("user-agent")
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    const location = resolveClientLocation(request)
    await recordLoginSession({
      discordId: userData.id,
      sessionHash,
      userAgent,
      ipAddress,
      location,
    })

    response.cookies.set("discord_token", tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })

    response.cookies.set("discord_user_id", userData.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })
    // Backwards-compatible cookie names used by some API routes.
    response.cookies.set("discord_id", userData.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })
    response.cookies.set("discordId", userData.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })

    clearPkceCookies(response)
    return response
  } catch (error) {
    console.error("Discord OAuth error:", error)
    const response = NextResponse.redirect(new URL("/?error=auth_failed", request.url))
    clearPkceCookie(response)
    return response
  }
}
