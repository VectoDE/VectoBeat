import { type NextRequest, NextResponse } from "next/server"
import { PDFDocument } from "pdf-lib"
import path from "path"
import { getFullUserData, getStoredUserProfile } from "@/lib/db"
import { ensureStripeCustomerForUser } from "@/lib/stripe-customers"
import { verifyRequestForUser } from "@/lib/auth"
import { PdfGenerator } from "@/lib/pdf-generator"

// Helper to format dates for the report
const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "-"
  try {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "-"
  }
}

export async function GET(request: NextRequest) {
  const discordId = request.nextUrl.searchParams.get("discordId")
  if (!discordId) {
    return NextResponse.json({ error: "discordId is required" }, { status: 400 })
  }

  const auth = await verifyRequestForUser(request, discordId)
  if (!auth.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [userData, storedProfile] = await Promise.all([
    getFullUserData(discordId),
    getStoredUserProfile(discordId)
  ])

  if (!userData) {
    return NextResponse.json({ error: "Failed to fetch user data" }, { status: 500 })
  }

  // --- Generate PDF ---
  const doc = await PDFDocument.create()
  
  // Attempt to resolve logo path
  const logoPath = path.join(process.cwd(), "public", "logo.png")
  
  const gen = new PdfGenerator(doc, logoPath)
  await gen.init()

  // 1. User Profile
  gen.drawSectionTitle("User Profile")
  gen.drawKeyValue("Discord ID", userData.profile?.discordId)
  gen.drawKeyValue("Username", userData.profile?.username)
  gen.drawKeyValue("Display Name", userData.profile?.displayName)
  gen.drawKeyValue("Role", userData.role?.role)
  gen.drawKeyValue("Joined", formatDate(userData.profile?.lastSeen)) // Using lastSeen as proxy if createdAt missing
  gen.drawKeyValue("Last Seen", formatDate(userData.profile?.lastSeen))
  gen.drawKeyValue("Avatar URL", userData.profile?.avatarUrl ?? storedProfile?.avatarUrl ?? "-")
  gen.drawKeyValue("Guild Count", userData.profile?.guildCount?.toString() ?? "0")
  gen.drawKeyValue("Welcome Email Sent", userData.profile?.welcomeSentAt ? formatDate(userData.profile.welcomeSentAt) : "No")

  // 1b. Discord Guilds
  if (storedProfile?.guilds && storedProfile.guilds.length > 0) {
    gen.drawSectionTitle("Discord Guilds (Cached)")
    const rows = storedProfile.guilds.map(g => [
      g.name.substring(0, 30) + (g.name.length > 30 ? "..." : ""),
      g.id,
      g.isAdmin ? "Admin" : "Member",
      g.hasBot ? "Yes" : "No"
    ])
    gen.drawTable(["Name", "ID", "Role", "Bot Present"], rows, [200, 150, 100, 80])
  }

  // 2. Contact Information
  gen.drawSectionTitle("Contact Information")
  
  const email = storedProfile?.email ?? userData.contact?.email ?? "-"
  const phone = storedProfile?.phone ?? userData.contact?.phone ?? "-"
  
  let stripeId = userData.contact?.stripeCustomerId ?? 
                   userData.subscriptions?.find((s: any) => s.stripeCustomerId)?.stripeCustomerId ?? 
                   "-"

  // Attempt to resolve Stripe ID if missing but we have an email
  if ((stripeId === "-" || !stripeId) && email !== "-") {
    try {
      const resolvedId = await ensureStripeCustomerForUser({
        discordId,
        email,
        phone: phone !== "-" ? phone : undefined,
      })
      if (resolvedId) {
        stripeId = resolvedId
      }
    } catch (err) {
      console.error("Failed to resolve Stripe ID during export:", err)
    }
  }

  gen.drawKeyValue("Email", email)
  gen.drawKeyValue("Phone", phone)
  gen.drawKeyValue("Stripe Customer ID", stripeId)

  // 2b. Address (from Preferences)
  if (userData.preferences && (userData.preferences.addressStreet || userData.preferences.addressCountry)) {
    gen.drawSectionTitle("Address")
    const street = [userData.preferences.addressStreet, userData.preferences.addressHouseNumber].filter(Boolean).join(" ")
    const city = [userData.preferences.addressPostalCode, userData.preferences.addressCity].filter(Boolean).join(" ")
    
    gen.drawKeyValue("Street", street)
    gen.drawKeyValue("City", city)
    gen.drawKeyValue("State", userData.preferences.addressState)
    gen.drawKeyValue("Country", userData.preferences.addressCountry)
  }

  // 3. Profile Details
  if (userData.settings) {
    gen.drawSectionTitle("Profile Settings")
    gen.drawKeyValue("Handle", userData.settings.handle)
    gen.drawKeyValue("Profile Name", userData.settings.profileName)
    gen.drawKeyValue("Headline", userData.settings.headline)
    gen.drawKeyValue("Location", userData.settings.location)
    gen.drawKeyValue("Website", userData.settings.website)
    
    if (userData.settings.bio) {
        gen.checkPageBreak(40)
        gen.drawKeyValue("Bio", userData.settings.bio.substring(0, 100) + (userData.settings.bio.length > 100 ? "..." : ""))
    }
  }

  // 4. Linked Accounts
  if (userData.linkedAccounts.length > 0) {
    gen.drawSectionTitle("Linked Accounts")
    const rows = userData.linkedAccounts.map(acc => [
      acc.provider,
      acc.handle,
      formatDate(acc.createdAt)
    ])
    gen.drawTable(["Provider", "Handle", "Linked Date"], rows, [100, 250, 140])
  }

  // 5. Subscriptions
  if (userData.subscriptions.length > 0) {
    gen.drawSectionTitle("Subscriptions")
    const rows = userData.subscriptions.map(sub => [
      sub.tier,
      sub.status,
      sub.monthlyPrice.toString(),
      formatDate(sub.currentPeriodEnd)
    ])
    gen.drawTable(["Plan", "Status", "Price", "Renews/Expires"], rows, [100, 100, 100, 190])
  }

  // 6. Security & Privacy
  gen.drawSectionTitle("Security & Privacy")
  gen.drawKeyValue("Current Password", "********")
  gen.drawKeyValue("2FA Enabled", userData.security?.twoFactorEnabled ? "Yes" : "No")
  gen.drawKeyValue("Login Alerts", userData.security?.loginAlerts ? "Enabled" : "Disabled")
  gen.drawKeyValue("Backup Codes Remaining", userData.security?.backupCodesRemaining?.toString() ?? "0")
  gen.drawKeyValue("Last Password Change", formatDate(userData.security?.lastPasswordChange))
  gen.drawKeyValue("Public Profile", userData.privacy?.profilePublic ? "Yes" : "No")
  gen.drawKeyValue("Search Visibility", userData.privacy?.searchVisibility ? "Yes" : "No")
  gen.drawKeyValue("Data Sharing", userData.privacy?.dataSharing ? "Yes" : "No")
  gen.drawKeyValue("Analytics Opt-In", userData.privacy?.analyticsOptIn ? "Yes" : "No")

  if (userData.userBackupCodes && userData.userBackupCodes.length > 0) {
      gen.checkPageBreak(40)
      
      const rows = userData.userBackupCodes.map(code => [
          "****" + code.id.slice(-4), // Mask ID
          formatDate(code.createdAt),
          code.usedAt ? formatDate(code.usedAt) : "Unused"
      ])
      gen.drawTable(["Backup Code (Masked)", "Created", "Status"], rows, [150, 150, 150])
  }

  // 6b. Password History
  if (userData.passwordHistory && userData.passwordHistory.length > 0) {
      gen.checkPageBreak(40)
      gen.drawSectionTitle("Password History")
      const rows = userData.passwordHistory.map((h: any) => [
          formatDate(h.createdAt),
          h.password
      ])
      gen.drawTable(["Date", "Password (Hash/Encrypted)"], rows, [150, 300])
  }

  // 7. Preferences
  if (userData.preferences) {
    gen.drawSectionTitle("Preferences")
    gen.drawKeyValue("Full Name", userData.preferences.fullName)
    gen.drawKeyValue("Birth Date", userData.preferences.birthDate)
    gen.drawKeyValue("Language", userData.preferences.preferredLanguage)
    gen.drawKeyValue("Email Updates", userData.preferences.emailUpdates ? "Yes" : "No")
    gen.drawKeyValue("Product Updates", userData.preferences.productUpdates ? "Yes" : "No")
    gen.drawKeyValue("Weekly Digest", userData.preferences.weeklyDigest ? "Yes" : "No")
    gen.drawKeyValue("SMS Alerts", userData.preferences.smsAlerts ? "Yes" : "No")
  }

  // 8. Notification Settings
  if (userData.notifications) {
    gen.drawSectionTitle("Notification Settings")
    gen.drawKeyValue("Maintenance Alerts", userData.notifications.maintenanceAlerts ? "On" : "Off")
    gen.drawKeyValue("Downtime Alerts", userData.notifications.downtimeAlerts ? "On" : "Off")
    gen.drawKeyValue("Release Notes", userData.notifications.releaseNotes ? "On" : "Off")
    gen.drawKeyValue("Security Alerts", userData.notifications.securityNotifications ? "On" : "Off")
    gen.drawKeyValue("Beta Program", userData.notifications.betaProgram ? "Joined" : "Not Joined")
    gen.drawKeyValue("Community Events", userData.notifications.communityEvents ? "On" : "Off")
  }

  // 9. Bot Settings
  if (userData.botSettings) {
    gen.drawSectionTitle("Bot Settings")
    gen.drawKeyValue("Default Volume", userData.botSettings.defaultVolume?.toString())
    gen.drawKeyValue("Auto Join Voice", userData.botSettings.autoJoinVoice ? "Yes" : "No")
    gen.drawKeyValue("DJ Mode", userData.botSettings.djMode ? "Yes" : "No")
    gen.drawKeyValue("Normalize Volume", userData.botSettings.normalizeVolume ? "Yes" : "No")
    gen.drawKeyValue("Announce Tracks", userData.botSettings.announceTracks ? "Yes" : "No")
  }

  // 10. Owned Servers
  if (userData.serverSettings && userData.serverSettings.length > 0) {
    gen.drawSectionTitle("Owned Servers (Settings)")
    const rows = userData.serverSettings.map(s => [
      s.guildId,
      formatDate(s.createdAt),
      formatDate(s.updatedAt)
    ])
    gen.drawTable(["Guild ID", "Created At", "Last Updated"], rows, [150, 170, 170])
  }

  // 11. Recent Sessions
  if (userData.sessions.length > 0) {
    gen.drawSectionTitle("Active Sessions")
    const rows = userData.sessions.map(s => [
      s.ipAddress || "-",
      s.location || "-",
      formatDate(s.lastActive)
    ])
    gen.drawTable(["IP Address", "Location", "Last Active"], rows, [150, 200, 140])
  }

  // 12. Login History
  if (userData.loginEvents.length > 0) {
    gen.drawSectionTitle("Recent Login History (Last 50)")
    const rows = userData.loginEvents.map(e => [
      e.ipAddress || "-",
      e.location || "-",
      formatDate(e.createdAt)
    ])
    gen.drawTable(["IP Address", "Location", "Date"], rows, [150, 200, 140])
  }

  // 13. Blog Comments
  if (userData.blogComments.length > 0) {
    gen.drawSectionTitle("Blog Comments")
    const rows = userData.blogComments.map(c => [
      c.postIdentifier,
      c.body.substring(0, 50) + (c.body.length > 50 ? "..." : ""),
      formatDate(c.createdAt)
    ])
    gen.drawTable(["Post ID", "Comment", "Date"], rows, [150, 200, 140])
  }

  // 14. Blog Reactions
  if (userData.blogReactionVotes.length > 0) {
    gen.drawSectionTitle("Blog Reactions")
    const rows = userData.blogReactionVotes.map(r => [
      r.postIdentifier,
      r.reaction,
      formatDate(r.createdAt)
    ])
    gen.drawTable(["Post ID", "Reaction", "Date"], rows, [200, 100, 190])
  }

  // 15. Support Messages
  if (userData.supportThreads.length > 0) {
    gen.drawSectionTitle("Support Messages")
    const rows = userData.supportThreads.map(t => [
      t.ticketId,
      t.body.substring(0, 50) + (t.body.length > 50 ? "..." : ""),
      formatDate(t.createdAt)
    ])
    gen.drawTable(["Ticket ID", "Message", "Date"], rows, [150, 200, 140])
  }

  // 16. Success Pod Requests
  if (userData.successPodRequests && userData.successPodRequests.length > 0) {
    gen.drawSectionTitle("Success Pod Requests")
    const rows = userData.successPodRequests.map(req => [
      req.summary.substring(0, 50) + (req.summary.length > 50 ? "..." : ""),
      req.status,
      formatDate(req.submittedAt)
    ])
    gen.drawTable(["Summary", "Status", "Submitted"], rows, [200, 100, 190])
  }

  // 17. Legal Information Page
  gen.addLegalPage()

  const pdfBytes = await doc.save()

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vectobeat-data-${discordId}.pdf"`,
    },
  })
}
