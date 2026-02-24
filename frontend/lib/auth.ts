import { NextRequest } from "next/server"
import { validateSessionHash, getStoredUserProfile, verifyUserApiKey, type StoredUserProfile } from "./db"
import { hashSessionToken } from "./session"
import { resolveClientIp, resolveClientLocation } from "./request-metadata"

export const authBypassEnabled = () => {
  return (
    process.env.DISABLE_API_AUTH === "1" ||
    process.env.ALLOW_UNAUTHENTICATED === "1" ||
    process.env.SKIP_API_AUTH === "1"
  )
}

export const extractBearerToken = (request: NextRequest) => {
  const header = request.headers.get("authorization")
  if (header?.startsWith("Bearer ")) {
    return header.substring(7)
  }

  const cookieToken = request.cookies.get("discord_token")?.value
  if (cookieToken) {
    return cookieToken
  }

  return null
}

type VerifyDeps = {
  validate?: typeof validateSessionHash
  loadProfile?: (_discordId: string) => Promise<StoredUserProfile | null>
}

export const verifyRequestForUser = async (
  request: NextRequest,
  discordId: string,
  deps: VerifyDeps = {},
) => {
  if (authBypassEnabled()) {
    const profile = await (deps.loadProfile ?? getStoredUserProfile)(discordId).catch(() => null)
    return { valid: true, token: null, sessionHash: null, user: profile }
  }
  const validate = deps.validate ?? validateSessionHash
  const loadProfile = deps.loadProfile ?? getStoredUserProfile
  const token = extractBearerToken(request)
  if (!token) {
    return { valid: false, token: null, sessionHash: null, user: null }
  }

  if (verifyUserApiKey(token, discordId)) {
    const profile = await loadProfile(discordId)
    return { valid: true, token, sessionHash: null, user: profile }
  }

  const sessionHash = hashSessionToken(token)

  // Resolve session metadata
  const ipAddress = resolveClientIp(request)
  const userAgent = request.headers.get("user-agent")
  const location = resolveClientLocation(request)

  const isValid = await validate(discordId, sessionHash, { ipAddress, userAgent, location })
  if (!isValid) {
    return { valid: false, token: null, sessionHash: null, user: null }
  }

  const profile = await loadProfile(discordId)
  return {
    valid: true,
    token,
    sessionHash,
    user: profile,
  }
}
