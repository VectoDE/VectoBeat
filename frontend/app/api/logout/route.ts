import { type NextRequest, NextResponse } from "next/server"
import { revokeSessionByHash, revokeUserSession } from "@/lib/db"
import { hashSessionToken } from "@/lib/session"

const parseJsonBody = async (request: NextRequest) => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const payload = await parseJsonBody(request)
  const cookieStore = request.cookies

  const discordId = (() => {
    if (payload && typeof payload.discordId === "string" && payload.discordId.trim().length) {
      return payload.discordId.trim()
    }
    const fromCookie = cookieStore.get("discord_user_id")?.value
    return fromCookie && fromCookie.trim().length ? fromCookie : null
  })()

  const providedSessionId =
    payload && typeof payload.sessionId === "string" && payload.sessionId.trim().length ? payload.sessionId.trim() : null

  let revoked = false
  if (discordId && providedSessionId) {
    revoked = await revokeUserSession(discordId, providedSessionId)
  } else {
    const sessionToken = cookieStore.get("discord_token")?.value
    if (discordId && sessionToken) {
      const sessionHash = hashSessionToken(sessionToken)
      revoked = await revokeSessionByHash(discordId, sessionHash)
    }
  }

  const response = NextResponse.json({ success: true, revoked })
  ;["discord_token", "discord_user_id", "discord_id", "discordId", "discord_pkce_verifier", "discord_pkce_redirect"].forEach(
    (cookieName) => response.cookies.delete(cookieName),
  )
  return response
}
