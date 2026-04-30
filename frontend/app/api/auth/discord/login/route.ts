import { type NextRequest, NextResponse } from "next/server"
import { DISCORD_CLIENT_ID, DISCORD_LOGIN_SCOPE_STRING } from "@/lib/config"
import {
  CODE_VERIFIER_COOKIE,
  REDIRECT_COOKIE,
  generateCodeVerifier,
  generateCodeChallenge,
  encodeState,
  resolvePreferredOrigin,
  sanitizeRedirectUri,
} from "@/lib/discord-auth"

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
