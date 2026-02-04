import test from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { sanitizeDomain, sanitizeUrl, sanitizeEmail, createDomainBrandingHandlers } from "../app/api/control-panel/domain-branding/route"
import type { MembershipTier } from "@/lib/memberships"
import { defaultServerFeatureSettings, type ServerFeatureSettings } from "@/lib/server-settings"

const buildRequest = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init))

test("sanitizeDomain normalizes input correctly", () => {
  // Basic happy paths
  assert.equal(sanitizeDomain("status.living-bots.net"), "status.living-bots.net")
  assert.equal(sanitizeDomain("living-bots.net"), "living-bots.net")
  
  // Protocol stripping
  assert.equal(sanitizeDomain("https://status.living-bots.net"), "status.living-bots.net")
  assert.equal(sanitizeDomain("http://status.living-bots.net"), "status.living-bots.net")
  
  // Path stripping
  assert.equal(sanitizeDomain("status.living-bots.net/dashboard"), "status.living-bots.net")
  assert.equal(sanitizeDomain("https://living-bots.net/"), "living-bots.net")
  
  // Invalid chars
  assert.equal(sanitizeDomain("status.living bots.net"), "")
  assert.equal(sanitizeDomain("status_living-bots.net"), "") // underscore not allowed in hostnames usually, logic allows a-z0-9.-
  
  // Truncation (basic check)
  const longDomain = "a".repeat(160) + ".com"
  assert.equal(sanitizeDomain(longDomain).length, 150)
})

test("sanitizeUrl enforces https and valid structure", () => {
  assert.equal(sanitizeUrl("https://assets.example.com/logo.png"), "https://assets.example.com/logo.png")
  assert.equal(sanitizeUrl("assets.example.com/logo.png"), "https://assets.example.com/logo.png")
  assert.equal(sanitizeUrl("http://insecure.com/image.jpg"), "http://insecure.com/image.jpg")
  
  // Invalid URLs
  assert.equal(sanitizeUrl("not a url"), "")
})

test("sanitizeEmail validates format and allowed characters", () => {
  assert.equal(sanitizeEmail("noreply@living-bots.net"), "noreply@living-bots.net")
  assert.equal(sanitizeEmail("support.team@sub.domain.com"), "support.team@sub.domain.com")
  
  // Invalid formats
  assert.equal(sanitizeEmail("noreply"), "")
  assert.equal(sanitizeEmail("@domain.com"), "")
  assert.equal(sanitizeEmail("user@"), "")
  assert.equal(sanitizeEmail("user@domain"), "")
  assert.equal(sanitizeEmail("user@.com"), "")
  assert.equal(sanitizeEmail("user@domain."), "")
  
  // Invalid chars
  assert.equal(sanitizeEmail("user name@domain.com"), "")
})

// Mock dependencies
const mockAccess = (ok: boolean, tier: MembershipTier = "free") => async () => 
  ok ? { ok: true as const, tier, subscription: {} as any, user: null } : { ok: false as const, status: 403, code: "guild_not_accessible" as const }

const mockSettings = (settings: Partial<ServerFeatureSettings> = {}) => async () => ({ ...defaultServerFeatureSettings, ...settings })

const mockSave = async (guildId: string, discordId: string, settings: Partial<ServerFeatureSettings>) => ({ ...defaultServerFeatureSettings, ...settings })

test("POST enforces authentication", async () => {
  const { POST } = createDomainBrandingHandlers({
    verifyAccess: async () => ({ ok: false, status: 401, code: "unauthorized" }),
  })

  const response = await POST(buildRequest("https://api/test", {
    method: "POST",
    body: JSON.stringify({ guildId: "g1", discordId: "u1" })
  }))

  assert.equal(response.status, 401)
})

test("POST enforces plan requirements", async () => {
  const { POST } = createDomainBrandingHandlers({
    verifyAccess: mockAccess(true, "free"), // Free tier has no apiTokens feature usually
    fetchSettings: mockSettings(),
  })

  const response = await POST(buildRequest("https://api/test", {
    method: "POST",
    body: JSON.stringify({ guildId: "g1", discordId: "u1" })
  }))

  assert.equal(response.status, 403)
  const body = await response.json()
  assert.equal(body.error, "plan_required")
})

test("POST saves valid branding settings", async () => {
  const { POST } = createDomainBrandingHandlers({
    verifyAccess: mockAccess(true, "growth"), // Growth usually has apiTokens
    fetchSettings: mockSettings(),
    saveSettings: mockSave,
  })

  const response = await POST(buildRequest("https://api/test", {
    method: "POST",
    body: JSON.stringify({
      guildId: "g1",
      discordId: "u1",
      customDomain: "docs.living-bots.net",
      assetPackUrl: "https://assets.living-bots.net/pack.zip",
      mailFromAddress: "support@living-bots.net"
    })
  }))

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.settings.customDomain, "docs.living-bots.net")
  assert.equal(body.settings.customDomainStatus, "pending_dns")
  assert.equal(body.settings.assetPackUrl, "https://assets.living-bots.net/pack.zip")
  assert.equal(body.settings.mailFromAddress, "support@living-bots.net")
})

test("POST handles mark_active action", async () => {
  const { POST } = createDomainBrandingHandlers({
    verifyAccess: mockAccess(true, "growth"),
    fetchSettings: mockSettings({ customDomain: "status.living-bots.net" }),
    saveSettings: mockSave,
  })

  const response = await POST(buildRequest("https://api/test", {
    method: "POST",
    body: JSON.stringify({
      guildId: "g1",
      discordId: "u1",
      action: "mark_active"
    })
  }))

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.settings.customDomainStatus, "verified")
  assert.equal(body.settings.customDomainTlsStatus, "active")
  assert.ok(body.settings.customDomainVerifiedAt)
})

test("POST handles reset action", async () => {
  const { POST } = createDomainBrandingHandlers({
    verifyAccess: mockAccess(true, "growth"),
    fetchSettings: mockSettings({
      customDomain: "status.living-bots.net",
      customDomainStatus: "verified"
    }),
    saveSettings: mockSave,
  })

  const response = await POST(buildRequest("https://api/test", {
    method: "POST",
    body: JSON.stringify({
      guildId: "g1",
      discordId: "u1",
      action: "reset"
    })
  }))

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.settings.customDomain, "")
  assert.equal(body.settings.customDomainStatus, "unconfigured")
  assert.equal(body.settings.customDomainDnsRecord, "")
  assert.equal(body.settings.customDomainTlsStatus, "pending")
  assert.equal(body.settings.customDomainVerifiedAt, null)
})
