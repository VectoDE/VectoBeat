import crypto from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { DEFAULT_DISCORD_REDIRECT_URI, DISCORD_CLIENT_ID, DISCORD_LOGIN_SCOPE_STRING } from "@/lib/config"

const CODE_VERIFIER_COOKIE = "discord_pkce_verifier"
const REDIRECT_COOKIE = "discord_pkce_redirect"

const base64UrlEncode = (input: Buffer) => {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

const generateCodeVerifier = () => base64UrlEncode(crypto.randomBytes(64))
const generateCodeChallenge = (verifier: string) => base64UrlEncode(crypto.createHash("sha256").update(verifier).digest())

const sanitizeRedirectUri = (value: string | null, fallback: string) => {
  if (!value) {
    return fallback
  }
  try {
    // Validate URL structure; Discord requires absolute URIs.
    const parsed = new URL(value)
    return parsed.toString().replace(/\/$/, "")
  } catch {
    return fallback
  }
}

const encodeState = (payload: Record<string, string>) => {
  const json = JSON.stringify(payload)
  return base64UrlEncode(Buffer.from(json, "utf-8"))
}

const resolvePreferredOrigin = (request: NextRequest) => {
  const envOrigin = process.env.NEXT_PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  const candidates = [envOrigin, request.nextUrl.origin, DEFAULT_DISCORD_REDIRECT_URI.replace(/\/api\/auth\/discord\/callback$/, "")]
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

export async function GET(request: NextRequest) {
  if (!DISCORD_CLIENT_ID) {
    return NextResponse.redirect("https://discord.com/developers/applications")
  }

  const searchParams = request.nextUrl.searchParams
  const fallbackOrigin = resolvePreferredOrigin(request)
  const fallbackRedirect = `${fallbackOrigin.replace(/\/$/, "")}/api/auth/discord/callback`
  const redirectOverride = searchParams.get("redirect_uri")
  const stateParam = searchParams.get("state")
  const redirectUri = sanitizeRedirectUri(redirectOverride, fallbackRedirect)
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const rawState: Record<string, string> = {
    v: codeVerifier,
    r: redirectUri,
  }
  if (stateParam) {
    rawState.u = stateParam
  }
  const encodedState = encodeState(rawState)

  const discordUrl = new URL("https://discord.com/api/oauth2/authorize")
  discordUrl.searchParams.set("client_id", DISCORD_CLIENT_ID)
  discordUrl.searchParams.set("response_type", "code")
  discordUrl.searchParams.set("redirect_uri", redirectUri)
  discordUrl.searchParams.set("scope", DISCORD_LOGIN_SCOPE_STRING)
  discordUrl.searchParams.set("code_challenge", codeChallenge)
  discordUrl.searchParams.set("code_challenge_method", "S256")
  discordUrl.searchParams.set("state", encodedState)

  const response = NextResponse.redirect(discordUrl.toString())
  response.cookies.set({
    name: CODE_VERIFIER_COOKIE,
    value: codeVerifier,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  })
  response.cookies.set({
    name: REDIRECT_COOKIE,
    value: redirectUri,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 5,
    path: "/",
  })
  return response
}
