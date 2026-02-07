import { test } from "node:test"
import assert from "node:assert"
import { PDFDocument } from "pdf-lib"
import { PdfGenerator } from "@/lib/pdf-generator"
import path from "path"

// Mock Data
const mockUserData = {
  profile: {
    discordId: "123456789",
    username: "testuser",
    displayName: "Test User",
    lastSeen: new Date(),
    email: "discord_email@example.com", // Fallback email
  },
  contact: null, // Simulate missing contact info
  role: { role: "admin" },
  settings: {
    handle: "test-handle",
    profileName: "Test Profile",
    bio: "This is a test bio that is somewhat long to check truncation logic in the PDF generator.",
    location: "Berlin, Germany",
    website: "https://vectobeat.com",
  },
  privacy: { profilePublic: true, searchVisibility: true, dataSharing: false },
  preferences: {
    preferredLanguage: "de",
    emailUpdates: true,
    productUpdates: false,
    addressStreet: "Musterstr. 1",
    addressCity: "Berlin",
    addressCountry: "Germany",
  },
  security: {
    twoFactorEnabled: true,
    loginAlerts: true,
    backupCodesRemaining: 5,
    lastPasswordChange: new Date(),
  },
  notifications: {
    maintenanceAlerts: true,
    downtimeAlerts: true,
  },
  botSettings: {
    defaultVolume: 80,
    autoJoinVoice: true,
    djMode: false,
  },
  sessions: [
    { ipAddress: "127.0.0.1", location: "Localhost", lastActive: new Date() }
  ],
  loginEvents: [
    { ipAddress: "127.0.0.1", location: "Localhost", createdAt: new Date() }
  ],
  linkedAccounts: [
    { provider: "spotify", handle: "spotify_user", createdAt: new Date() }
  ],
  subscriptions: [
    { tier: "pro", status: "active", monthlyPrice: "9.99", currentPeriodEnd: new Date(), stripeCustomerId: "cus_from_sub" }
  ],
  blogComments: [],
  blogReactionVotes: [],
  supportThreads: [],
  serverSettings: [
    { guildId: "guild_1", createdAt: new Date(), updatedAt: new Date() }
  ],
  userBackupCodes: [],
  successPodRequests: [],
  passwordHistory: [
    { createdAt: new Date(), password: "encrypted_old_password" }
  ]
}

test("PdfGenerator creates a valid PDF with branding", async (t) => {
  const doc = await PDFDocument.create()
  // We point to a non-existent logo to test fallback or try to point to real one if we know path
  const generator = new PdfGenerator(doc, "public/placeholder-logo.png") 
  
  await generator.init()

  // Simulate Route Logic
  generator.drawSectionTitle("User Profile")
  generator.drawKeyValue("Username", mockUserData.profile.username)
  
  // New Contact Logic
  generator.drawSectionTitle("Contact Information")
  
  // @ts-ignore - simulating the route logic which handles potential nulls
  const email = mockUserData.contact?.email ?? mockUserData.profile?.email ?? "-"
  // @ts-ignore
  const phone = mockUserData.contact?.phone ?? mockUserData.profile?.phone ?? "-"
  // @ts-ignore
  const stripeId = mockUserData.contact?.stripeCustomerId ?? 
                   mockUserData.subscriptions?.find((s: any) => s.stripeCustomerId)?.stripeCustomerId ?? 
                   "-"

  generator.drawKeyValue("Email", email)
  generator.drawKeyValue("Phone", phone)
  generator.drawKeyValue("Stripe Customer ID", stripeId)

  // Security & Privacy
  generator.drawSectionTitle("Security & Privacy")
  generator.drawKeyValue("Current Password", "********")
  generator.drawKeyValue("2FA Enabled", mockUserData.security.twoFactorEnabled ? "Yes" : "No")

  // Password History
  if (mockUserData.passwordHistory && mockUserData.passwordHistory.length > 0) {
      generator.drawSectionTitle("Password History")
      const rows = mockUserData.passwordHistory.map((h: any) => [
          h.createdAt.toISOString(),
          h.password
      ])
      generator.drawTable(["Date", "Password"], rows, [150, 300])
  }

  // Check Table Generation
  if (mockUserData.linkedAccounts.length > 0) {
      generator.drawSectionTitle("Linked Accounts")
      const rows = mockUserData.linkedAccounts.map(acc => [
          acc.provider,
          acc.handle,
          new Date().toISOString()
      ])
      generator.drawTable(["Provider", "Handle", "Linked Date"], rows, [100, 250, 140])
  }

  // Legal Page
  generator.addLegalPage()

  const pdfBytes = await doc.save()
  
  assert.ok(pdfBytes instanceof Uint8Array, "Should return Uint8Array")
  assert.ok(pdfBytes.length > 0, "PDF should not be empty")
  
  // Basic PDF Header Check
  const header = Buffer.from(pdfBytes.subarray(0, 5)).toString('utf-8')
  assert.strictEqual(header, "%PDF-", "Should be a valid PDF file")
})
