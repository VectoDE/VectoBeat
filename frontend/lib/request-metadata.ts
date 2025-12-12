import type { NextRequest } from "next/server"

const sanitizeHeaderValue = (value?: string | null) =>
  value && value !== "undefined" && value !== "null" ? value : null

export const resolveClientIp = (request: NextRequest & { ip?: string | null }) => {
  const headers = request.headers
  const forwardedFor = headers.get("x-forwarded-for")
  const chain = forwardedFor?.split(",")[0]?.trim()
  const candidates = [
    request.ip,
    headers.get("x-real-ip"),
    chain,
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
    headers.get("fastly-client-ip"),
    headers.get("x-vercel-ip"),
  ]
  return candidates.map(sanitizeHeaderValue).find(Boolean) || null
}

export const resolveClientLocation = (request: NextRequest & { geo?: { city?: string | null; region?: string | null; country?: string | null } }) => {
  const headers = request.headers
  const geo = request.geo
  const city = sanitizeHeaderValue(
    geo?.city ||
      headers.get("x-vercel-ip-city") ||
      headers.get("cf-ipcity") ||
      headers.get("x-geo-city") ||
      headers.get("x-appengine-city"),
  )
  const region = sanitizeHeaderValue(
    geo?.region ||
      headers.get("x-vercel-ip-country-region") ||
      headers.get("cf-region") ||
      headers.get("x-geo-region") ||
      headers.get("x-appengine-region"),
  )
  const country = sanitizeHeaderValue(
    geo?.country ||
      headers.get("x-vercel-ip-country") ||
      headers.get("cf-ipcountry") ||
      headers.get("cloudfront-viewer-country") ||
      headers.get("x-geo-country") ||
      headers.get("x-appengine-country"),
  )

  // Prioritise country code for analytics grouping, with fallbacks to region/city.
  return country || region || city || null
}
