import { randomInt } from 'crypto'

export const normalizeInput = (value?: string | null, maxLength = 255) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength)
  }
  return trimmed
}

export const normalizeWebsite = (url?: string | null) => {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  const prefixed = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(prefixed)
    return parsed.toString()
  } catch {
    return null
  }
}

export const sanitizeHandle = (input: string) => {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  
  let result = ''
  let prevWasDash = false
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    const code = char.charCodeAt(0)
    
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      result += char
      prevWasDash = false
    } else if (!prevWasDash) {
      result += '-'
      prevWasDash = true
    }
  }
  
  let start = 0
  while (start < result.length && result[start] === '-') {
    start++
  }
  
  let end = result.length - 1
  while (end >= start && result[end] === '-') {
    end--
  }
  
  return result.substring(start, end + 1).slice(0, 32)
}

export const generateFallbackHandle = (base?: string, discordId?: string) => {
  const candidateBase = sanitizeHandle(base || "") || (discordId ? `member-${discordId.slice(-4)}` : "member")
  return candidateBase.length >= 3 ? candidateBase : `${candidateBase}-${randomInt(100, 999)}`
}

export const normalizeApiKeyType = (value: string) => value.trim().toLowerCase()

export const normalizeRole = (role?: string | null): 'member' | 'partner' | 'supporter' | 'operator' | 'admin' => {
  const normalized = role?.trim().toLowerCase()
  return normalized === "admin" || normalized === "operator" || normalized === "partner" || normalized === "supporter"
    ? normalized
    : "member"
}

export const normalizeUsageValue = (value: number | null | undefined) => {
  if (value === null || value === undefined || isNaN(value) || value < 0) {
    return 0
  }
  return Math.floor(value)
}

export const normalizeSlug = (slug: string) => slug.trim().toLowerCase()

export const normalizePath = (path: string, maxLength = 191) => path.slice(0, maxLength)

export const normalizeReferrer = (referrer?: string | null, maxLength = 190) => 
  referrer ? referrer.slice(0, maxLength) : null

export const normalizeStringWithLength = (value: string, maxLength: number) => 
  value.slice(0, maxLength)

export const normalizeOptionalString = (value?: string | null, maxLength?: number) => 
  value ? (maxLength ? value.slice(0, maxLength) : value) : null

export const normalizeStringArray = (items: string[] | null | undefined, normalizer: (item: string) => string) => {
  if (!items || !Array.isArray(items)) return []
  return Array.from(new Set(items.map(normalizer).filter(Boolean)))
}
