import crypto from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { DEFAULT_DISCORD_REDIRECT_URI, getInternalBaseUrl } from "./config"

export const CODE_VERIFIER_COOKIE = "discord_pkce_verifier"
export const REDIRECT_COOKIE = "discord_pkce_redirect"

export type EncodedStatePayload = {
  v?: string
  r?: string
  u?: string
}

export const base64UrlEncode = (input: Buffer) => input.toString("base64url")

export const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, "base64").toString("utf-8")
}

export const generateCodeVerifier = () => base64UrlEncode(crypto.randomBytes(64))

export const generateCodeChallenge = (verifier: string) =>
  base64UrlEncode(crypto.createHash("sha256").update(verifier).digest())

export const encodeState = (payload: Record<string, string>) => {
  const json = JSON.stringify(payload)
  return base64UrlEncode(Buffer.from(json, "utf-8"))
}

export const decodeStatePayload = (value: string | null): EncodedStatePayload | null => {
  if (!value) return null
  try {
    const json = base64UrlDecode(value)
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === "object") return parsed as EncodedStatePayload
  } catch {
    return null
  }
  return null
}

export const resolvePreferredOrigin = (request: NextRequest) => {
  const envOrigin = getInternalBaseUrl()
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

export const sanitizeRedirectUri = (value: string | null, fallback: string) => {
  if (!value) return fallback
  try {
    const parsed = new URL(value)
    return parsed.toString().replace(/\/$/, "")
  } catch {
    return fallback
  }
}

export const clearPkceCookies = (response: NextResponse) => {
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
