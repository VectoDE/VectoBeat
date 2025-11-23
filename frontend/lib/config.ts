const FALLBACK_DISCORD_CLIENT_ID = "1435859299028172901"
const FALLBACK_DISCORD_INVITE = "https://discord.com/developers/applications"
const DISCORD_BOT_PERMISSIONS = "8"
const DISCORD_LOGIN_SCOPES = "identify%20guilds%20email"
export const DISCORD_LOGIN_SCOPE_STRING = "identify guilds email"
const DISCORD_BOT_SCOPE = `${DISCORD_LOGIN_SCOPES}%20bot%20applications.commands`

const appUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")
const redirectUri = `${normalizedAppUrl}/api/auth/discord/callback`
export const DEFAULT_DISCORD_REDIRECT_URI = redirectUri

export const DISCORD_CLIENT_ID =
  process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID || FALLBACK_DISCORD_CLIENT_ID

const baseAuthUrl = DISCORD_CLIENT_ID
  ? `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}`
  : FALLBACK_DISCORD_INVITE

export const DISCORD_BOT_INVITE_URL = DISCORD_CLIENT_ID
  ? `${baseAuthUrl}&permissions=${DISCORD_BOT_PERMISSIONS}&scope=${DISCORD_BOT_SCOPE}`
  : FALLBACK_DISCORD_INVITE

const loginEntryPath = "/api/auth/discord/login"

export const buildDiscordLoginUrl = (customRedirectUri?: string) => {
  if (!DISCORD_CLIENT_ID) {
    return FALLBACK_DISCORD_INVITE
  }

  let targetRedirect = redirectUri
  let stateValue: string | null = null

  if (typeof customRedirectUri === "string" && customRedirectUri.trim().length) {
    const trimmed = customRedirectUri.trim()
    if (trimmed.includes("/api/auth/discord/callback")) {
      targetRedirect = trimmed.replace(/\/$/, "")
    } else {
      stateValue = trimmed
    }
  }

  const params = new URLSearchParams({ redirect_uri: targetRedirect })
  if (stateValue) {
    params.set("state", stateValue)
  }
  return `${loginEntryPath}?${params.toString()}`
}

export const BRANDING_CNAME_TARGET =
  process.env.NEXT_PUBLIC_BRANDING_CNAME_TARGET || process.env.BRANDING_CNAME_TARGET || "cname.vectobeat.com"
