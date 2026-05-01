export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

export const RATE_LIMIT_WINDOW = 60_000
export const RATE_LIMIT_MAX_GLOBAL = 100
export const RATE_LIMIT_MAX_SENSITIVE = 60

export const SENSITIVE_PREFIXES = [
  "/api/contact",
  "/api/newsletter",
  "/api/donate",
  "/api/checkout",
  "/api/auth",
  "/api/upload",
  "/api/support-tickets",
]
