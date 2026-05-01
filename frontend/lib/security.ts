// Production-grade security utilities for VectoBeat

/**
 * Added comprehensive security module with CSRF protection,
 * rate limiting, input validation, and security headers
 */

import crypto from "crypto"
import { SECURITY_HEADERS } from "./constants"
export { SECURITY_HEADERS }

// CSRF Token Management
export const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString("hex")
}

export const validateCSRFToken = (token: string, sessionToken: string): boolean => {
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(sessionToken))
}

// Rate Limiting
interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

export const checkRateLimit = (identifier: string, maxRequests = 100, windowMs = 60000): boolean => {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}

// Input Validation & Sanitization
export const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>]/g, "")
    .replace(/script/gi, "")
    .trim()
    .substring(0, 1000)
}

export const sanitizeField = (value: unknown, maxLen = 1000): string => {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLen)
}

export const validateEmail = (email: string): boolean => {
  if (email.length > 254) {
    return false
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const validateDiscordId = (id: string): boolean => {
  return /^\d{15,20}$/.test(id)
}

// Security Headers
export const getSecurityHeaders = () => ({
  ...SECURITY_HEADERS,
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
})

// Password Hashing (OWASP-recommended PBKDF2 parameters)
export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.randomBytes(32).toString("hex")
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 64, "sha512").toString("hex")
  return `${salt}:${hash}`
}

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [salt, originalHash] = storedHash.split(":")
  if (!salt || !originalHash) return false
  const newHash = crypto.pbkdf2Sync(password, salt, 310000, 64, "sha512").toString("hex")
  if (newHash.length !== originalHash.length) return false
  return crypto.timingSafeEqual(Buffer.from(newHash, "hex"), Buffer.from(originalHash, "hex"))
}

// Session Management
export const generateSessionId = (): string => {
  return crypto.randomBytes(32).toString("hex")
}

export const validateSessionExpiry = (createdAt: number, maxAge = 86400000): boolean => {
  return Date.now() - createdAt < maxAge
}
