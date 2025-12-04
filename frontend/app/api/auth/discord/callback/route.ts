import { type NextRequest, NextResponse } from "next/server"
import { DEFAULT_DISCORD_REDIRECT_URI, DISCORD_CLIENT_ID, DISCORD_LOGIN_SCOPE_STRING } from "@/lib/config"
import { getUserSecurity } from "@/lib/db"

const CODE_VERIFIER_COOKIE = "discord_pkce_verifier"
const REDIRECT_COOKIE = "discord_pkce_redirect"

type EncodedStatePayload = {
  v?: string
  r?: string
  u?: string
}

const clearPkceCookie = (response: NextResponse) => {
  response.cookies.set(CODE_VERIFIER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  })
  response.cookies.set(REDIRECT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  })
}

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, "base64").toString("utf-8")
}

const decodeStatePayload = (value: string | null): EncodedStatePayload | null => {
  if (!value) {
    return null
  }
  try {
    const json = base64UrlDecode(value)
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === "object") {
      return parsed as EncodedStatePayload
    }
  } catch {
    return null
  }
  return null
}

const resolvePreferredOrigin = (request: NextRequest) => {
  const envOrigin =
    process.env.NEXT_PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  const candidates = [
    envOrigin,
    request.nextUrl.origin,
    DEFAULT_DISCORD_REDIRECT_URI.replace(/\/api\/auth\/discord\/callback$/, ""),
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const normalized = new URL(candidate.replace(/\/$/, ""))
      return normalized.origin
    } catch {
      continue
    }
  }
  return request.nextUrl.origin
}

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

const sanitizeRedirect = (value: string | null | undefined, fallback: string) => {
  if (!value) {
    return fallback
  }
  try {
    const parsed = new URL(value)
    return parsed.toString().replace(/\/$/, "")
  } catch {
    return fallback
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const rawStateToken = searchParams.get("state")
  const decodedState = decodeStatePayload(rawStateToken)

  if (!code) {
    const response = NextResponse.redirect(new URL("/?error=no_code", request.url))
    clearPkceCookie(response)
    return response
  }

  try {
    const fallbackOrigin = resolvePreferredOrigin(request)
    const fallbackRedirect = `${fallbackOrigin.replace(/\/$/, "")}/api/auth/discord/callback`
    const redirectCookie = request.cookies.get(REDIRECT_COOKIE)?.value
    const redirectTarget = sanitizeRedirect(decodedState?.r || redirectCookie, fallbackRedirect)
    const pkceVerifier =
      decodedState?.v ?? request.cookies.get(CODE_VERIFIER_COOKIE)?.value ?? null

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
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

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error("Token exchange error:", error)
      const response = NextResponse.redirect(new URL("/?error=token_exchange_failed", request.url))
      clearPkceCookie(response)
      return response
    }

    const tokenData = await tokenResponse.json()

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      const response = NextResponse.redirect(new URL("/?error=user_fetch_failed", request.url))
      clearPkceCookie(response)
      return response
    }

    const userData = await userResponse.json()

    const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const guilds = await guildsResponse.json()

    const security = await getUserSecurity(userData.id)
    const redirectPath = security.twoFactorEnabled ? "/two-factor?context=login" : "/control-panel"
    const stateOverride = decodedState ? decodedState.u ?? null : undefined
    const stateRedirect = !security.twoFactorEnabled
      ? resolveStateRedirect(request, stateOverride, decodedState ? false : true)
      : null
    const redirectUrl = stateRedirect ?? new URL(redirectPath, resolvePreferredOrigin(request))
    redirectUrl.searchParams.set("token", tokenData.access_token)
    redirectUrl.searchParams.set("user_id", userData.id)
    redirectUrl.searchParams.set("username", userData.username)
    redirectUrl.searchParams.set("avatar", userData.avatar || "")
    redirectUrl.searchParams.set("email", userData.email || "")
    if (userData.phone) {
      redirectUrl.searchParams.set("phone", userData.phone)
    }

    const response = NextResponse.redirect(redirectUrl)

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

    clearPkceCookie(response)
    return response
  } catch (error) {
    console.error("Discord OAuth error:", error)
    const response = NextResponse.redirect(new URL("/?error=auth_failed", request.url))
    clearPkceCookie(response)
    return response
  }
}
