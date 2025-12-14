import crypto from "crypto"
import { Prisma } from "@prisma/client"
import type { ScaleAccountContact } from "@prisma/client"
import { decryptJson, decryptText, encryptJson, encryptText, isEncryptionAvailable } from "./encryption"
import { defaultServerFeatureSettings, type ServerFeatureSettings } from "./server-settings"
import { getPlanCapabilities } from "./plan-capabilities"
import { getPrismaClient, handlePrismaError } from "./prisma"
import { normalizeTierId, type MembershipTier } from "./memberships"
import type { AnalyticsOverview, HomeMetrics } from "./metrics"
import type { QueueSnapshot } from "@/types/queue-sync"

const getPool = () => getPrismaClient()

const logDbError = (message: string, error: unknown) => {
  handlePrismaError(error)
  console.error(message, error)
}

const asJsonObject = <T>(value: Prisma.JsonValue | null | undefined): T | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as T
}

const PROFILE_HANDLE_MAX = 32
const PROFILE_HANDLE_MIN = 3

export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "pending"] as const
export const provisionDefaultsForTier = (
  existing: ServerFeatureSettings | null,
  tier: MembershipTier,
): ServerFeatureSettings => {
  const current = existing ? { ...existing } : { ...defaultServerFeatureSettings }
  const plan = getPlanCapabilities(tier)
  current.multiSourceStreaming = plan.serverSettings.multiSourceStreaming
  current.sourceAccessLevel = plan.serverSettings.maxSourceAccessLevel
  const cap = plan.limits.queue
  const desiredQueueLimit = cap !== null ? cap : 50_000
  current.queueLimit = Math.max(current.queueLimit, desiredQueueLimit)
  current.playlistSync = plan.serverSettings.playlistSync
  current.playbackQuality = plan.serverSettings.maxPlaybackQuality
  current.aiRecommendations = plan.serverSettings.aiRecommendations
  current.exportWebhooks = plan.serverSettings.exportWebhooks
  current.automationLevel = plan.serverSettings.maxAutomationLevel
  return current
}

const sanitizeHandle = (input: string) =>
  input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROFILE_HANDLE_MAX)

const generateFallbackHandle = (base?: string, discordId?: string) => {
  const candidateBase = sanitizeHandle(base || "") || (discordId ? `member-${discordId.slice(-4)}` : "member")
  return candidateBase.length >= PROFILE_HANDLE_MIN ? candidateBase : `${candidateBase}-${Math.floor(Math.random() * 999)}`
}

const normalizeInput = (value?: string | null, maxLength = 255) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength)
  }
  return trimmed
}

const normalizeWebsite = (url?: string | null) => {
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

const USER_API_KEY_SECRET =
  process.env.DATA_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || process.env.SECRET_KEY || "vectobeat"
const USER_API_KEY_PREFIX = "vbk_"

const deriveUserApiKey = (discordId: string) => {
  const hmac = crypto.createHmac("sha256", USER_API_KEY_SECRET)
  hmac.update(`user:${discordId}`)
  const digest = hmac.digest("hex").slice(0, 24)
  return `${USER_API_KEY_PREFIX}${discordId}_${digest}`
}

const parseUserApiKey = (apiKey: string | null | undefined) => {
  if (!apiKey || !apiKey.startsWith(USER_API_KEY_PREFIX)) return null
  const [, rest] = apiKey.split(USER_API_KEY_PREFIX)
  if (!rest) return null
  const [discordId, signature] = rest.split("_")
  if (!discordId || !signature) return null
  return { discordId, signature }
}

export const verifyUserApiKey = (apiKey: string | null | undefined, expectedDiscordId: string) => {
  const parsed = parseUserApiKey(apiKey)
  if (!parsed || parsed.discordId !== expectedDiscordId) return false
  const expected = deriveUserApiKey(expectedDiscordId)
  return expected === apiKey
}

const normalizeApiKeyType = (value: string) => value.trim().toLowerCase()
const hashSecretValue = (value: string) => crypto.createHash("sha256").update(value).digest("hex")
const API_CREDENTIAL_ACTIVE = "active" as const
const API_CREDENTIAL_DISABLED = "disabled" as const

const packSecretValue = (value: string) => {
  const encrypted = encryptText(value)
  if (encrypted) {
    return { encryptedValue: encrypted.payload, iv: encrypted.iv, authTag: encrypted.tag, valueHash: hashSecretValue(value) }
  }
  const fallback = Buffer.from(value, "utf8").toString("base64")
  // Flag the IV/tag so we can decode later even when encryption is unavailable.
  return { encryptedValue: fallback, iv: "__plain__", authTag: "__plain__", valueHash: hashSecretValue(value) }
}

const unpackSecretValue = (record: { encryptedValue: string; iv: string; authTag: string }) => {
  if (record.iv === "__plain__" && record.authTag === "__plain__") {
    try {
      return Buffer.from(record.encryptedValue, "base64").toString("utf8")
    } catch {
      return null
    }
  }
  return decryptText({ payload: record.encryptedValue, iv: record.iv, tag: record.authTag })
}

const parseReferrerForStorage = (value?: string | null) => {
  if (!value) {
    return { host: null as string | null, path: null as string | null }
  }

  const sanitizePath = (input: string | null) => {
    if (!input) return null
    return input.length > 255 ? input.slice(0, 255) : input
  }

  const sanitizeHost = (input: string | null) => {
    if (!input) return null
    return input.length > 128 ? input.slice(0, 128) : input
  }

  try {
    const parsed = new URL(value)
    const host = sanitizeHost(parsed.hostname || null)
    const path = sanitizePath(parsed.pathname || "/")
    return { host, path }
  } catch {
    const sanitized = value.replace(/^[a-z]+:\/\//i, "")
    const [hostPart, ...rest] = sanitized.split("/")
    const host = sanitizeHost(hostPart || null)
    const path = sanitizePath(rest.length ? `/${rest.join("/")}` : "/")
    return { host, path }
  }
}

interface UserProfilePayload {
  id: string
  username: string
  displayName?: string | null
  discriminator?: string
  email?: string | null
  phone?: string | null
  avatar?: string | null
  avatarUrl?: string | null
  guilds?: Array<{
    id: string
    name: string
    icon?: string | null
    owner?: boolean
    permissions?: string
    isAdmin?: boolean
    hasBot?: boolean
  }>
  apiKey?: string
}

export type UserRole = "member" | "admin" | "operator" | "partner"
const DEFAULT_ROLE: UserRole = "member"
export type AdminUserSummary = {
  id: string
  username: string | null
  displayName: string | null
  email: string | null
  phone: string | null
  avatarUrl: string | null
  guildCount: number
  lastSeen: string
  role: UserRole
  twoFactorEnabled: boolean
  handle: string | null
  profileName: string | null
  headline: string | null
  bio: string | null
  location: string | null
  website: string | null
  profilePublic: boolean
  profileCreatedAt?: string | null
  profileUpdatedAt?: string | null
  welcomeSentAt?: string | null
  contactCreatedAt?: string | null
  contactUpdatedAt?: string | null
  stripeCustomerId?: string | null
  preferences?: {
    emailUpdates: boolean
    productUpdates: boolean
    weeklyDigest: boolean
    smsAlerts: boolean
    preferredLanguage: string
    createdAt?: string | null
    updatedAt?: string | null
  }
  notifications?: {
    maintenanceAlerts: boolean
    downtimeAlerts: boolean
    releaseNotes: boolean
    securityNotifications: boolean
    betaProgram: boolean
    communityEvents: boolean
    createdAt?: string | null
    updatedAt?: string | null
  }
  privacy?: {
    profilePublic: boolean
    searchVisibility: boolean
    analyticsOptIn: boolean
    dataSharing: boolean
    createdAt?: string | null
    updatedAt?: string | null
  }
  security?: {
    twoFactorEnabled: boolean
    loginAlerts: boolean
    backupCodesRemaining: number
    activeSessions: number
    lastPasswordChange?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  }
  botSettings?: {
    autoJoinVoice: boolean
    announceTracks: boolean
    djMode: boolean
    normalizeVolume: boolean
    defaultVolume: number
    createdAt?: string | null
    updatedAt?: string | null
  }
  roleCreatedAt?: string | null
  roleUpdatedAt?: string | null
  sessionInfo?: {
    count: number
    lastActive?: string | null
    lastLocation?: string | null
    lastUserAgent?: string | null
    lastIp?: string | null
  }
  lastLogin?: {
    createdAt: string
    ipAddress?: string | null
    userAgent?: string | null
    location?: string | null
    notified: boolean
  } | null
  linkedAccounts?: Array<{ provider: string; handle: string; createdAt: string }>
}

export const persistUserProfile = async (payload: UserProfilePayload) => {
  try {
    const db = getPool()
    if (!db || !isEncryptionAvailable) {
      return
    }

    const existingPayload = await getDecryptedProfilePayload(payload.id)
    const apiKey = existingPayload?.apiKey || deriveUserApiKey(payload.id)
    const nextPayload: UserProfilePayload = { ...payload, apiKey }

    const encrypted = encryptJson(nextPayload)
    if (!encrypted) {
      return
    }

    await db.userProfile.upsert({
      where: { discordId: payload.id },
      update: {
        encryptedPayload: encrypted.payload,
        iv: encrypted.iv,
        authTag: encrypted.tag,
        guildCount: payload.guilds?.length ?? 0,
        lastSeen: new Date(),
        username: payload.username?.toLowerCase() ?? undefined,
        displayName: payload.displayName ?? payload.username ?? undefined,
        avatarUrl: payload.avatarUrl ?? undefined,
      },
      create: {
        discordId: payload.id,
        encryptedPayload: encrypted.payload,
        iv: encrypted.iv,
        authTag: encrypted.tag,
        guildCount: payload.guilds?.length ?? 0,
        lastSeen: new Date(),
        welcomeSentAt: null,
        username: payload.username?.toLowerCase() ?? null,
        displayName: payload.displayName ?? payload.username ?? null,
        avatarUrl: payload.avatarUrl ?? null,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to persist user profile:", error)
  }
}

export const hasWelcomeEmailBeenSent = async (discordId: string) => {
  try {
    const db = getPool()
    if (!db) return false

    const record = await db.userProfile.findUnique({
      where: { discordId },
      select: { welcomeSentAt: true },
    })

    return Boolean(record?.welcomeSentAt)
  } catch (error) {
    logDbError("[VectoBeat] Failed to load welcome email state:", error)
    return false
  }
}

export const markWelcomeEmailSent = async (discordId: string) => {
  try {
    const db = getPool()
    if (!db) return

    await db.userProfile.update({
      where: { discordId },
      data: { welcomeSentAt: new Date() },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to mark welcome email sent:", error)
  }
}

export type StoredUserProfile = {
  id: string
  username: string | null
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  createdAt: string | null
  lastSeen: string | null
  guilds: Array<{ id: string; name: string; hasBot?: boolean; isAdmin?: boolean }>
}

export const getStoredUserProfile = async (discordId: string): Promise<StoredUserProfile | null> => {
  try {
    const payload = await getDecryptedProfilePayload(discordId)
    const contact = await getUserContact(discordId)
    const profileRow = await getPrismaClient()
      ?.userProfile.findUnique({
        where: { discordId },
        select: { username: true, displayName: true, avatarUrl: true, lastSeen: true },
      })
      .catch(() => null)
    const guilds = Array.isArray(payload?.guilds) ? payload.guilds : []
    const normalizedGuilds = guilds
      .map((guild) => {
        if (!guild || typeof guild.id !== "string" || typeof guild.name !== "string") return null
        return {
          id: guild.id,
          name: guild.name,
          hasBot: Boolean(guild.hasBot),
          isAdmin: Boolean(guild.isAdmin),
        }
      })
      .filter((guild): guild is { id: string; name: string; hasBot: boolean; isAdmin: boolean } => Boolean(guild))

    if (!payload && !contact) {
      return null
    }

    return {
      id: discordId,
      username: profileRow?.username ?? payload?.username ?? null,
      displayName: profileRow?.displayName ?? payload?.displayName ?? payload?.username ?? null,
      email: contact?.email ?? payload?.email ?? null,
      avatarUrl: profileRow?.avatarUrl ?? (payload as any)?.avatarUrl ?? null,
      createdAt: null,
      lastSeen: profileRow?.lastSeen ? profileRow.lastSeen.toISOString() : null,
      guilds: normalizedGuilds,
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load stored user profile:", error)
    return null
  }
}

export const getUserApiKey = async (discordId: string): Promise<string | null> => {
  try {
    const payload = await getDecryptedProfilePayload(discordId)
    const key = payload?.apiKey || deriveUserApiKey(discordId)
    if (!payload?.apiKey && key) {
      // Persist the derived key back to the profile for consistency.
      await persistUserProfile({ ...(payload || { id: discordId, username: discordId }), apiKey: key })
    }
    return key
  } catch (error) {
    logDbError("[VectoBeat] Failed to resolve user api key:", error)
    return null
  }
}

export const recordAnalyticsSnapshot = async (payload: AnalyticsOverview | HomeMetrics) => {
  try {
    const db = getPool()
    if (!db) return
    await db.analyticsSnapshot.create({
      data: { payload },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to persist analytics snapshot:", error)
  }
}

const getDecryptedProfilePayload = async (discordId: string) => {
  try {
    const db = getPool()
    if (!db || !isEncryptionAvailable) return null

    const record = await db.userProfile.findUnique({
      where: { discordId },
      select: { encryptedPayload: true, iv: true, authTag: true },
    })
    if (!record) return null

    return decryptJson<UserProfilePayload>({
      payload: record.encryptedPayload,
      iv: record.iv,
      tag: record.authTag,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to decrypt profile payload:", error)
    return null
  }
}

const allowedRoles: UserRole[] = ["member", "admin", "operator", "partner"]

const normalizeRole = (role?: string | null): UserRole => {
  if (!role) return DEFAULT_ROLE
  const normalized = role.trim().toLowerCase()
  return allowedRoles.includes(normalized as UserRole) ? (normalized as UserRole) : DEFAULT_ROLE
}

export const getUserRole = async (discordId: string): Promise<UserRole> => {
  try {
    const db = getPool()
    if (!db) {
      return DEFAULT_ROLE
    }

    const roleRecord = await db.userRole.upsert({
      where: { discordId },
      update: {},
      create: {
        discordId,
        role: DEFAULT_ROLE,
      },
    })

    return normalizeRole(roleRecord.role)
  } catch (error) {
    logDbError("[VectoBeat] Failed to load user role:", error)
    return DEFAULT_ROLE
  }
}

export const setUserRole = async (discordId: string, role: UserRole) => {
  try {
    const db = getPool()
    if (!db) return DEFAULT_ROLE

    const normalizedRole = normalizeRole(role)

    const record = await db.userRole.upsert({
      where: { discordId },
      update: { role: normalizedRole },
      create: { discordId, role: normalizedRole },
    })

    return normalizeRole(record.role)
  } catch (error) {
    logDbError("[VectoBeat] Failed to update user role:", error)
    return DEFAULT_ROLE
  }
}

export const listAdminUsers = async (): Promise<AdminUserSummary[]> => {
  try {
    const db = getPool()
    if (!db) return []

    const profiles = await db.userProfile.findMany({
      take: 200,
      orderBy: { lastSeen: "desc" },
      select: {
        discordId: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        guildCount: true,
        lastSeen: true,
        welcomeSentAt: true,
        profileSettings: {
          select: {
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })

    if (!profiles.length) return []

    const ids = profiles.map((profile) => profile.discordId)

    const [contacts, roles, security, settings, privacy, preferences, notifications, botSettings, sessions, loginEvents, linkedAccounts] = await Promise.all([
      db.userContact.findMany({
        where: { discordId: { in: ids } },
        select: { discordId: true, email: true, phone: true, stripeCustomerId: true, createdAt: true, updatedAt: true },
      }),
      db.userRole.findMany({
        where: { discordId: { in: ids } },
        select: { discordId: true, role: true, createdAt: true, updatedAt: true },
      }),
      db.userSecurity.findMany({
        where: { discordId: { in: ids } },
        select: {
          discordId: true,
          twoFactorEnabled: true,
          loginAlerts: true,
          backupCodesRemaining: true,
          activeSessions: true,
          lastPasswordChange: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.userProfileSetting.findMany({
        where: { discordId: { in: ids } },
        select: {
          discordId: true,
          handle: true,
          profileName: true,
          headline: true,
          bio: true,
          location: true,
          website: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.userPrivacy.findMany({
        where: { discordId: { in: ids } },
        select: {
          discordId: true,
          profilePublic: true,
          searchVisibility: true,
          analyticsOptIn: true,
          dataSharing: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.userPreference.findMany({
        where: { discordId: { in: ids } },
        select: {
          discordId: true,
          emailUpdates: true,
          productUpdates: true,
          weeklyDigest: true,
          smsAlerts: true,
          preferredLanguage: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.userNotification.findMany({
        where: { discordId: { in: ids } },
        select: {
          discordId: true,
          maintenanceAlerts: true,
          downtimeAlerts: true,
          releaseNotes: true,
          securityNotifications: true,
          betaProgram: true,
          communityEvents: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.userBotSetting.findMany({
        where: { discordId: { in: ids } },
        select: {
          discordId: true,
          autoJoinVoice: true,
          announceTracks: true,
          djMode: true,
          normalizeVolume: true,
          defaultVolume: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.userSession.findMany({
        where: { discordId: { in: ids } },
        orderBy: { lastActive: "desc" },
        select: {
          discordId: true,
          userAgent: true,
          ipAddress: true,
          location: true,
          createdAt: true,
          lastActive: true,
        },
      }),
      db.userLoginEvent.findMany({
        where: { discordId: { in: ids } },
        orderBy: { createdAt: "desc" },
        select: {
          discordId: true,
          ipAddress: true,
          userAgent: true,
          location: true,
          notified: true,
          createdAt: true,
        },
      }),
      db.userLinkedAccount.findMany({
        where: { discordId: { in: ids } },
        select: { discordId: true, provider: true, handle: true, createdAt: true },
      }),
    ])

    const contactMap = new Map(contacts.map((contact) => [contact.discordId, contact]))
    const roleMap = new Map(roles.map((role) => [role.discordId, role.role as UserRole]))
    const securityMap = new Map(security.map((record) => [record.discordId, record]))
    const settingsMap = new Map(settings.map((row) => [row.discordId, row]))
    const privacyMap = new Map(privacy.map((row) => [row.discordId, row]))
    const preferenceMap = new Map(preferences.map((row) => [row.discordId, row]))
    const notificationMap = new Map(notifications.map((row) => [row.discordId, row]))
    const botSettingsMap = new Map(botSettings.map((row) => [row.discordId, row]))
    const sessionMap = new Map<string, { count: number; last?: (typeof sessions)[number] }>()
    sessions.forEach((session) => {
      const existing = sessionMap.get(session.discordId)
      if (!existing) {
        sessionMap.set(session.discordId, { count: 1, last: session })
      } else {
        sessionMap.set(session.discordId, { count: existing.count + 1, last: existing.last ?? session })
      }
    })
    const loginEventMap = new Map<string, (typeof loginEvents)[number] | undefined>()
    loginEvents.forEach((event) => {
      if (!loginEventMap.has(event.discordId)) {
        loginEventMap.set(event.discordId, event)
      }
    })
    const linkedAccountMap = new Map<string, Array<{ provider: string; handle: string; createdAt: Date }>>()
    linkedAccounts.forEach((row) => {
      const current = linkedAccountMap.get(row.discordId) ?? []
      current.push({ provider: row.provider, handle: row.handle, createdAt: row.createdAt })
      linkedAccountMap.set(row.discordId, current)
    })

    return profiles.map((profile) => ({
      id: profile.discordId,
      username: profile.username ?? null,
      displayName: profile.displayName ?? null,
      email: contactMap.get(profile.discordId)?.email ?? null,
      phone: contactMap.get(profile.discordId)?.phone ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      guildCount: profile.guildCount,
      lastSeen: profile.lastSeen.toISOString(),
      role: roleMap.get(profile.discordId) ?? DEFAULT_ROLE,
      roleCreatedAt: roles.find((r) => r.discordId === profile.discordId)?.createdAt?.toISOString() ?? null,
      roleUpdatedAt: roles.find((r) => r.discordId === profile.discordId)?.updatedAt?.toISOString() ?? null,
      twoFactorEnabled: Boolean(securityMap.get(profile.discordId)?.twoFactorEnabled),
      handle: settingsMap.get(profile.discordId)?.handle ?? null,
      profileName: settingsMap.get(profile.discordId)?.profileName ?? null,
      headline: settingsMap.get(profile.discordId)?.headline ?? null,
      bio: settingsMap.get(profile.discordId)?.bio ?? null,
      location: settingsMap.get(profile.discordId)?.location ?? null,
      website: settingsMap.get(profile.discordId)?.website ?? null,
      profilePublic: Boolean(privacyMap.get(profile.discordId)?.profilePublic),
      profileCreatedAt: settingsMap.get(profile.discordId)?.createdAt?.toISOString() ?? null,
      profileUpdatedAt: settingsMap.get(profile.discordId)?.updatedAt?.toISOString() ?? null,
      welcomeSentAt: profile.welcomeSentAt ? profile.welcomeSentAt.toISOString() : null,
      contactCreatedAt: contactMap.get(profile.discordId)?.createdAt?.toISOString() ?? null,
      contactUpdatedAt: contactMap.get(profile.discordId)?.updatedAt?.toISOString() ?? null,
      stripeCustomerId: contactMap.get(profile.discordId)?.stripeCustomerId ?? null,
      preferences: (() => {
        const pref = preferenceMap.get(profile.discordId)
        if (!pref) return undefined
        return {
          emailUpdates: pref.emailUpdates,
          productUpdates: pref.productUpdates,
          weeklyDigest: pref.weeklyDigest,
          smsAlerts: pref.smsAlerts,
          preferredLanguage: pref.preferredLanguage,
          createdAt: pref.createdAt?.toISOString() ?? null,
          updatedAt: pref.updatedAt?.toISOString() ?? null,
        }
      })(),
      notifications: (() => {
        const note = notificationMap.get(profile.discordId)
        if (!note) return undefined
        return {
          maintenanceAlerts: note.maintenanceAlerts,
          downtimeAlerts: note.downtimeAlerts,
          releaseNotes: note.releaseNotes,
          securityNotifications: note.securityNotifications,
          betaProgram: note.betaProgram,
          communityEvents: note.communityEvents,
          createdAt: note.createdAt?.toISOString() ?? null,
          updatedAt: note.updatedAt?.toISOString() ?? null,
        }
      })(),
      privacy: (() => {
        const priv = privacyMap.get(profile.discordId)
        if (!priv) return undefined
        return {
          profilePublic: priv.profilePublic,
          searchVisibility: priv.searchVisibility,
          analyticsOptIn: priv.analyticsOptIn,
          dataSharing: priv.dataSharing,
          createdAt: priv.createdAt?.toISOString() ?? null,
          updatedAt: priv.updatedAt?.toISOString() ?? null,
        }
      })(),
      security: (() => {
        const sec = securityMap.get(profile.discordId)
        if (!sec) return undefined
        return {
          twoFactorEnabled: sec.twoFactorEnabled,
          loginAlerts: sec.loginAlerts,
          backupCodesRemaining: sec.backupCodesRemaining,
          activeSessions: sec.activeSessions,
          lastPasswordChange: sec.lastPasswordChange?.toISOString() ?? null,
          createdAt: sec.createdAt?.toISOString() ?? null,
          updatedAt: sec.updatedAt?.toISOString() ?? null,
        }
      })(),
      botSettings: (() => {
        const bot = botSettingsMap.get(profile.discordId)
        if (!bot) return undefined
        return {
          autoJoinVoice: bot.autoJoinVoice,
          announceTracks: bot.announceTracks,
          djMode: bot.djMode,
          normalizeVolume: bot.normalizeVolume,
          defaultVolume: bot.defaultVolume,
          createdAt: bot.createdAt?.toISOString() ?? null,
          updatedAt: bot.updatedAt?.toISOString() ?? null,
        }
      })(),
      sessionInfo: (() => {
        const session = sessionMap.get(profile.discordId)
        if (!session) return undefined
        return {
          count: session.count,
          lastActive: session.last?.lastActive?.toISOString() ?? null,
          lastLocation: session.last?.location ?? null,
          lastUserAgent: session.last?.userAgent ?? null,
          lastIp: session.last?.ipAddress ?? null,
        }
      })(),
      lastLogin: (() => {
        const event = loginEventMap.get(profile.discordId)
        if (!event) return null
        return {
          createdAt: event.createdAt.toISOString(),
          ipAddress: event.ipAddress ?? null,
          userAgent: event.userAgent ?? null,
          location: event.location ?? null,
          notified: event.notified,
        }
      })(),
      linkedAccounts:
        linkedAccountMap
          .get(profile.discordId)
          ?.map((row) => ({ provider: row.provider, handle: row.handle, createdAt: row.createdAt.toISOString() })) ??
        [],
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list admin users:", error)
    return []
  }
}

type SubscriptionRecord = {
  id: string
  discordId: string
  guildId: string
  guildName: string | null
  stripeCustomerId: string | null
  tier: string
  status: string
  monthlyPrice: Prisma.Decimal | number
  currentPeriodStart: Date
  currentPeriodEnd: Date
}

const mapSubscription = (row: SubscriptionRecord) => ({
  id: row.id,
  discordId: row.discordId,
  discordServerId: row.guildId,
  name: row.guildName || "Unknown Server",
  tier: normalizeTierId(row.tier),
  status: row.status,
  stripeCustomerId: row.stripeCustomerId,
  pricePerMonth: Number(row.monthlyPrice),
  currentPeriodStart: row.currentPeriodStart.toISOString(),
  currentPeriodEnd: row.currentPeriodEnd.toISOString(),
})

export type SubscriptionSummary = ReturnType<typeof mapSubscription>

export const getUserSubscriptions = async (discordId: string) => {
  try {
    const db = getPool()
    if (!db) {
      return []
    }

    const subscriptions = await db.subscription.findMany({
      where: { discordId },
      orderBy: { createdAt: "desc" },
    })

    const seenActive = new Set<string>()
    const filtered = subscriptions.filter((row) => {
      if (row.status !== "active") return true
      if (seenActive.has(row.guildId)) {
        return false
      }
      seenActive.add(row.guildId)
      return true
    })

    return filtered.map((row) =>
      mapSubscription({
        id: row.id,
        discordId: row.discordId,
        guildId: row.guildId,
        guildName: row.guildName,
        stripeCustomerId: row.stripeCustomerId,
        tier: row.tier,
        status: row.status,
        monthlyPrice: row.monthlyPrice,
        currentPeriodStart: row.currentPeriodStart,
        currentPeriodEnd: row.currentPeriodEnd,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load subscriptions:", error)
    return []
  }
}

export const listAllSubscriptions = async () => {
  try {
    const db = getPool()
    if (!db) return []

    const records = await db.subscription.findMany({
      orderBy: { createdAt: "desc" },
    })

    return records.map((row) =>
      mapSubscription({
        id: row.id,
        discordId: row.discordId,
        guildId: row.guildId,
        guildName: row.guildName,
        stripeCustomerId: row.stripeCustomerId,
        tier: row.tier,
        status: row.status,
        monthlyPrice: row.monthlyPrice,
        currentPeriodStart: row.currentPeriodStart,
        currentPeriodEnd: row.currentPeriodEnd,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to list subscriptions:", error)
    return []
  }
}

interface UpsertSubscriptionPayload {
  id: string
  discordId: string
  guildId: string
  guildName?: string | null
  stripeCustomerId?: string | null
  tier: string
  status: string
  monthlyPrice: number
  currentPeriodStart: Date
  currentPeriodEnd: Date
}

export const upsertSubscription = async (payload: UpsertSubscriptionPayload) => {
  try {
    const db = getPool()
    if (!db) {
      return null
    }

    const normalizedTier = normalizeTierId(payload.tier)

    const record = await db.subscription.upsert({
      where: { id: payload.id },
      update: {
        discordId: payload.discordId,
        guildId: payload.guildId,
        guildName: payload.guildName || null,
        stripeCustomerId: payload.stripeCustomerId ?? null,
        tier: normalizedTier,
        status: payload.status,
        monthlyPrice: payload.monthlyPrice,
        currentPeriodStart: payload.currentPeriodStart,
        currentPeriodEnd: payload.currentPeriodEnd,
      },
      create: {
        id: payload.id,
        discordId: payload.discordId,
        guildId: payload.guildId,
        guildName: payload.guildName || null,
        stripeCustomerId: payload.stripeCustomerId ?? null,
        tier: normalizedTier,
        status: payload.status,
        monthlyPrice: payload.monthlyPrice,
        currentPeriodStart: payload.currentPeriodStart,
        currentPeriodEnd: payload.currentPeriodEnd,
      },
    })

    if (payload.status === "active") {
      await db.subscription.updateMany({
        where: {
          guildId: payload.guildId,
          id: { not: payload.id },
          status: "active",
        },
        data: { status: "canceled" },
      })
    }

    if (payload.status === "active") {
      const settings = await getServerSettings(payload.guildId)
      const provisioned = provisionDefaultsForTier(settings, normalizedTier)
      await updateServerSettings(payload.guildId, payload.discordId, provisioned)
    }

    return mapSubscription({
      id: record.id,
      discordId: record.discordId,
      guildId: record.guildId,
      guildName: record.guildName,
      stripeCustomerId: record.stripeCustomerId,
      tier: record.tier,
      status: record.status,
      monthlyPrice: record.monthlyPrice,
      currentPeriodStart: record.currentPeriodStart,
      currentPeriodEnd: record.currentPeriodEnd,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to upsert subscription:", error)
    return null
  }
}

export const getSubscriptionById = async (id: string) => {
  try {
    const db = getPool()
    if (!db) {
      return null
    }

    const record = await db.subscription.findUnique({
      where: { id },
    })

    if (!record) {
      return null
    }

    return mapSubscription({
      id: record.id,
      discordId: record.discordId,
      guildId: record.guildId,
      guildName: record.guildName,
      stripeCustomerId: record.stripeCustomerId,
      tier: record.tier,
      status: record.status,
      monthlyPrice: record.monthlyPrice,
      currentPeriodStart: record.currentPeriodStart,
      currentPeriodEnd: record.currentPeriodEnd,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to load subscription:", error)
    return null
  }
}

interface UpdateSubscriptionPayload {
  tier?: string
  status?: string
  monthlyPrice?: number
  guildName?: string | null
  guildId?: string
  currentPeriodStart?: Date
  currentPeriodEnd?: Date
}

export const updateSubscriptionById = async (id: string, updates: UpdateSubscriptionPayload) => {
  try {
    const db = getPool()
    if (!db) {
      return null
    }

    const data: Prisma.SubscriptionUpdateInput = {}

    if (typeof updates.tier === "string") {
      data.tier = normalizeTierId(updates.tier)
    }
    if (typeof updates.status === "string") {
      data.status = updates.status
    }
    if (typeof updates.monthlyPrice === "number" && Number.isFinite(updates.monthlyPrice)) {
      data.monthlyPrice = updates.monthlyPrice
    }
    if (typeof updates.guildName === "string" || updates.guildName === null) {
      data.guildName = updates.guildName ?? null
    }
    if (typeof updates.guildId === "string") {
      data.guildId = updates.guildId
    }
    if (updates.currentPeriodStart instanceof Date) {
      data.currentPeriodStart = updates.currentPeriodStart
    }
    if (updates.currentPeriodEnd instanceof Date) {
      data.currentPeriodEnd = updates.currentPeriodEnd
    }

    if (Object.keys(data).length === 0) {
      return getSubscriptionById(id)
    }

    const record = await db.subscription.update({
      where: { id },
      data,
    })

    return mapSubscription({
      id: record.id,
      discordId: record.discordId,
      guildId: record.guildId,
      guildName: record.guildName,
      stripeCustomerId: record.stripeCustomerId,
      tier: record.tier,
      status: record.status,
      monthlyPrice: record.monthlyPrice,
      currentPeriodStart: record.currentPeriodStart,
      currentPeriodEnd: record.currentPeriodEnd,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null
    }

    logDbError("[VectoBeat] Failed to update subscription:", error)
    return null
  }
}

export const deleteSubscriptionById = async (id: string) => {
  try {
    const db = getPool()
    if (!db) return false

    await db.subscription.delete({
      where: { id },
    })
    return true
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return false
    }
    logDbError("[VectoBeat] Failed to delete subscription:", error)
    return false
  }
}

export const getGuildSubscriptionTier = async (guildId: string): Promise<MembershipTier> => {
  try {
    const db = getPool()
    if (!db) return "free"

    const record = await db.subscription.findFirst({
      where: {
        guildId,
        status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
      },
      orderBy: { updatedAt: "desc" },
    })

    return normalizeTierId(record?.tier)
  } catch (error) {
    logDbError("[VectoBeat] Failed to resolve guild membership tier:", error)
    return "free"
  }
}

type BotCommandRecord = {
  id: string
  name: string
  description: string | null
  category: string
  usage: string | null
  createdAt: Date
  updatedAt: Date
}

export type StoredBotCommand = {
  id: string
  name: string
  description: string | null
  category: string
  usage: string | null
  createdAt: string
  updatedAt: string
}

const mapBotCommand = (row: BotCommandRecord): StoredBotCommand => ({
  id: row.id,
  name: row.name,
  description: row.description,
  category: row.category,
  usage: row.usage,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export const getStoredBotCommands = async (): Promise<StoredBotCommand[]> => {
  try {
    const db = getPool()
    if (!db) {
      return []
    }

    const commands = await db.botCommand.findMany({
      orderBy: [
        { category: "asc" },
        { name: "asc" },
      ],
    })

    return commands.map((command) =>
      mapBotCommand({
        id: command.id,
        name: command.name,
        description: command.description,
        category: command.category,
        usage: command.usage,
        createdAt: command.createdAt,
        updatedAt: command.updatedAt,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load bot commands:", error)
    return []
  }
}

interface SessionRecord {
  id: string
  sessionHash: string
  userAgent: string | null
  ipAddress: string | null
  location: string | null
  createdAt: Date
  lastActive: Date
  revokedAt: Date | null
}

export interface ActiveSession {
  id: string
  ipAddress: string | null
  userAgent: string | null
  location: string | null
  createdAt: string
  lastActive: string
  revoked: boolean
}

const mapSessionRow = (row: SessionRecord): ActiveSession => ({
  id: row.id,
  ipAddress: row.ipAddress,
  userAgent: row.userAgent,
  location: row.location,
  createdAt: row.createdAt.toISOString(),
  lastActive: row.lastActive.toISOString(),
  revoked: Boolean(row.revokedAt),
})

interface RecordSessionParams {
  discordId: string
  sessionHash: string
  userAgent?: string | null
  ipAddress?: string | null
  location?: string | null
}

interface RecordSessionResult {
  allowed: boolean
  isNew: boolean
  sessionId: string | null
}

export const recordLoginSession = async (params: RecordSessionParams): Promise<RecordSessionResult> => {
  try {
    const db = getPool()
    if (!db) {
      return { allowed: true, isNew: false, sessionId: null }
    }

    const uniqueWhere: Prisma.UserSessionWhereUniqueInput = {
      user_sessions_discord_id_session_hash_key: {
        discordId: params.discordId,
        sessionHash: params.sessionHash,
      },
    }

    const existing = await db.userSession.findUnique({
      where: uniqueWhere,
      select: { id: true, revokedAt: true },
    })

    if (existing) {
      if (existing.revokedAt) {
        return { allowed: false, isNew: false, sessionId: existing.id }
      }

      await db.userSession.update({
        where: uniqueWhere,
        data: {
          userAgent: params.userAgent || null,
          ipAddress: params.ipAddress || null,
          location: params.location || null,
          lastActive: new Date(),
        },
      })

      return { allowed: true, isNew: false, sessionId: existing.id }
    }

    const inserted = await db.userSession.create({
      data: {
        discordId: params.discordId,
        sessionHash: params.sessionHash,
        userAgent: params.userAgent || null,
        ipAddress: params.ipAddress || null,
        location: params.location || null,
      },
      select: { id: true },
    })

    return { allowed: true, isNew: true, sessionId: inserted.id }
  } catch (error) {
    logDbError("[VectoBeat] Failed to record login session:", error)
    return { allowed: true, isNew: false, sessionId: null }
  }
}

export const getActiveSessions = async (discordId: string): Promise<ActiveSession[]> => {
  try {
    const db = getPool()
    if (!db) return []

    const sessions = await db.userSession.findMany({
      where: { discordId, revokedAt: null },
      orderBy: { lastActive: "desc" },
    })

    return sessions.map((session) =>
      mapSessionRow({
        id: session.id,
        sessionHash: session.sessionHash,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        location: session.location,
        createdAt: session.createdAt,
        lastActive: session.lastActive,
        revokedAt: session.revokedAt,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load active sessions:", error)
    return []
  }
}

export const countActiveSessions = async (discordId: string) => {
  try {
    const db = getPool()
    if (!db) return 0

    return db.userSession.count({
      where: { discordId, revokedAt: null },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to count active sessions:", error)
    return 0
  }
}

export const revokeUserSession = async (discordId: string, sessionId: string) => {
  try {
    const db = getPool()
    if (!db) return false

    const result = await db.userSession.updateMany({
      where: { discordId, id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    return result.count > 0
  } catch (error) {
    logDbError("[VectoBeat] Failed to revoke session:", error)
    return false
  }
}

export const revokeSessionByHash = async (discordId: string, sessionHash: string) => {
  try {
    const db = getPool()
    if (!db) return false

    const result = await db.userSession.updateMany({
      where: { discordId, sessionHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    return result.count > 0
  } catch (error) {
    logDbError("[VectoBeat] Failed to revoke session by hash:", error)
    return false
  }
}

export const validateSessionHash = async (discordId: string, sessionHash: string) => {
  try {
    const db = getPool()
    if (!db) return true

    const count = await db.userSession.count({
      where: {
        discordId,
        sessionHash,
        revokedAt: null,
      },
    })

    return count > 0
  } catch (error) {
    logDbError("[VectoBeat] Failed to validate session hash:", error)
    return false
  }
}

interface LoginEventParams {
  discordId: string
  sessionId: string | null
  ipAddress?: string | null
  userAgent?: string | null
  location?: string | null
  notified?: boolean
}

export const hasSeenLoginIp = async (discordId: string, ipAddress?: string | null) => {
  if (!ipAddress) return true
  try {
    const db = getPool()
    if (!db) return true

    const count = await db.userLoginEvent.count({
      where: {
        discordId,
        ipAddress,
      },
    })
    return count > 0
  } catch (error) {
    logDbError("[VectoBeat] Failed to check known login IP:", error)
    return true
  }
}

export const recordLoginEvent = async (params: LoginEventParams) => {
  try {
    const db = getPool()
    if (!db) return

    await db.userLoginEvent.create({
      data: {
        discordId: params.discordId,
        sessionId: params.sessionId,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        location: params.location || null,
        notified: params.notified ?? false,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to record login event:", error)
  }
}

export interface UserPreferences {
  emailUpdates: boolean
  productUpdates: boolean
  weeklyDigest: boolean
  smsAlerts: boolean
  preferredLanguage: string
  fullName?: string | null
  birthDate?: string | null
  addressCountry?: string | null
  addressState?: string | null
  addressCity?: string | null
  addressStreet?: string | null
  addressHouseNumber?: string | null
  addressPostalCode?: string | null
}

const mapPreferences = (row: any): UserPreferences => ({
  emailUpdates: row.emailUpdates ?? true,
  productUpdates: row.productUpdates ?? true,
  weeklyDigest: row.weeklyDigest ?? false,
  smsAlerts: row.smsAlerts ?? false,
  preferredLanguage: row.preferredLanguage || "en",
  fullName: row.fullName ?? row.full_name ?? null,
  birthDate: row.birthDate ?? row.birth_date ?? null,
  addressCountry: row.addressCountry ?? row.address_country ?? null,
  addressState: row.addressState ?? row.address_state ?? null,
  addressCity: row.addressCity ?? row.address_city ?? null,
  addressStreet: row.addressStreet ?? row.address_street ?? null,
  addressHouseNumber: row.addressHouseNumber ?? row.address_house_number ?? null,
  addressPostalCode: row.addressPostalCode ?? row.address_postal_code ?? null,
})

export const getUserPreferences = async (discordId: string): Promise<UserPreferences> => {
  const defaults: UserPreferences = {
    emailUpdates: true,
    productUpdates: true,
    weeklyDigest: false,
    smsAlerts: false,
    preferredLanguage: "en",
    fullName: null,
    birthDate: null,
    addressCountry: null,
    addressState: null,
    addressCity: null,
    addressStreet: null,
    addressHouseNumber: null,
    addressPostalCode: null,
  }

  try {
    const db = getPool()
    if (!db) {
      return defaults
    }

    const record = await db.userPreference.findUnique({
      where: { discordId },
    })

    if (!record) {
      return defaults
    }

    return mapPreferences(record)
  } catch (error) {
    logDbError("[VectoBeat] Failed to load preferences:", error)
    return defaults
  }
}

export const updateUserPreferences = async (
  discordId: string,
  updates: Partial<UserPreferences>,
): Promise<UserPreferences> => {
  const merged = { ...(await getUserPreferences(discordId)), ...updates }

  try {
    const db = getPool()
    if (!db) {
      return merged
    }

    await db.userPreference.upsert({
      where: { discordId },
      update: {
        emailUpdates: merged.emailUpdates,
        productUpdates: merged.productUpdates,
        weeklyDigest: merged.weeklyDigest,
        smsAlerts: merged.smsAlerts,
        preferredLanguage: merged.preferredLanguage,
        fullName: merged.fullName,
        birthDate: merged.birthDate,
        addressCountry: merged.addressCountry,
        addressState: merged.addressState,
        addressCity: merged.addressCity,
        addressStreet: merged.addressStreet,
        addressHouseNumber: merged.addressHouseNumber,
        addressPostalCode: merged.addressPostalCode,
      },
      create: {
        discordId,
        emailUpdates: merged.emailUpdates,
        productUpdates: merged.productUpdates,
        weeklyDigest: merged.weeklyDigest,
        smsAlerts: merged.smsAlerts,
        preferredLanguage: merged.preferredLanguage,
        fullName: merged.fullName,
        birthDate: merged.birthDate,
        addressCountry: merged.addressCountry,
        addressState: merged.addressState,
        addressCity: merged.addressCity,
        addressStreet: merged.addressStreet,
        addressHouseNumber: merged.addressHouseNumber,
        addressPostalCode: merged.addressPostalCode,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to update preferences:", error)
  }

  return merged
}

interface UserContactRecord {
  discordId: string
  email: string | null
  phone: string | null
  stripeCustomerId: string | null
}

const mapContact = (row: UserContactRecord | null) => {
  if (!row) {
    return { email: null, phone: null, stripeCustomerId: null }
  }
  return {
    email: row.email,
    phone: row.phone,
    stripeCustomerId: row.stripeCustomerId,
  }
}

export const getUserContact = async (discordId: string) => {
  try {
    const db = getPool()
    if (!db) {
      return { email: null, phone: null }
    }

    const record = await db.userContact.findUnique({
      where: { discordId },
      select: { discordId: true, email: true, phone: true, stripeCustomerId: true },
    })

    return mapContact(record as UserContactRecord | null)
  } catch (error) {
    logDbError("[VectoBeat] Failed to load user contact:", error)
    return { email: null, phone: null }
  }
}

export const upsertUserContact = async (payload: {
  discordId: string
  email?: string | null
  phone?: string | null
  stripeCustomerId?: string | null
}) => {
  try {
    const db = getPool()
    if (!db) {
      return
    }

    await db.userContact.upsert({
      where: { discordId: payload.discordId },
      update: {
        email: payload.email ?? undefined,
        phone: payload.phone ?? undefined,
        stripeCustomerId: payload.stripeCustomerId ?? undefined,
      },
      create: {
        discordId: payload.discordId,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        stripeCustomerId: payload.stripeCustomerId ?? null,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to upsert user contact:", error)
  }
}

export const findDiscordIdByStripeCustomerId = async (customerId: string | null | undefined) => {
  if (!customerId) return null
  try {
    const db = getPool()
    if (!db) return null
    const record = await db.userContact.findFirst({
      where: { stripeCustomerId: customerId },
      select: { discordId: true },
    })
    return record?.discordId ?? null
  } catch (error) {
    logDbError("[VectoBeat] Failed to resolve discordId by stripe customer:", error)
    return null
  }
}

const BACKUP_CODE_TOTAL = 10

export interface LinkedAccount {
  id: string
  provider: string
  handle: string
  metadata: Record<string, any> | null
  createdAt: string
}

export const getLinkedAccounts = async (discordId: string): Promise<LinkedAccount[]> => {
  try {
    const db = getPool()
    if (!db) {
      return []
    }

    const accounts = await db.userLinkedAccount.findMany({
      where: { discordId },
      orderBy: { createdAt: "desc" },
    })

    return accounts.map((row) => ({
      id: row.id,
      provider: row.provider,
      handle: row.handle,
      metadata: (asJsonObject<Record<string, any>>(row.metadata) as Record<string, any>) || {},
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to load linked accounts:", error)
    return []
  }
}

export const addLinkedAccount = async (
  discordId: string,
  provider: string,
  handle: string,
  metadata?: Record<string, any>,
): Promise<void> => {
  try {
    const db = getPool()
    if (!db) {
      return
    }

    await db.userLinkedAccount.create({
      data: {
        discordId,
        provider,
        handle,
        metadata: metadata ?? {},
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to add linked account:", error)
  }
}

export const removeLinkedAccount = async (discordId: string, accountId: string): Promise<void> => {
  try {
    const db = getPool()
    if (!db) {
      return
    }

    await db.userLinkedAccount.deleteMany({
      where: { discordId, id: accountId },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to remove linked account:", error)
  }
}

interface BackupCodeRow {
  id: string
  encryptedCode: string
  iv: string
  authTag: string
  usedAt: Date | null
  createdAt: Date
}

const generateBackupCode = () => {
  return crypto.randomBytes(5).toString("hex").toUpperCase()
}

const decryptBackupCode = (row: BackupCodeRow) =>
  decryptText({ payload: row.encryptedCode, iv: row.iv, tag: row.authTag })

export const listBackupCodes = async (discordId: string): Promise<string[]> => {
  try {
    const db = getPool()
    if (!db || !isEncryptionAvailable) {
      return []
    }

    const rows = await db.userBackupCode.findMany({
      where: { discordId, usedAt: null },
      orderBy: { createdAt: "asc" },
    })

    return rows
      .map((row) => decryptBackupCode(row))
      .filter((code): code is string => Boolean(code))
  } catch (error) {
    logDbError("[VectoBeat] Failed to load backup codes:", error)
    return []
  }
}

export const countBackupCodes = async (discordId: string) => {
  try {
    const db = getPool()
    if (!db) return 0

    return db.userBackupCode.count({
      where: { discordId, usedAt: null },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to count backup codes:", error)
    return 0
  }
}

export const regenerateBackupCodes = async (discordId: string): Promise<string[]> => {
  if (!isEncryptionAvailable) {
    throw new Error("Encryption key not configured")
  }

  try {
    const db = getPool()
    if (!db) {
      return []
    }

    const codes: string[] = []
    await db.$transaction(async (tx) => {
      await tx.userBackupCode.deleteMany({ where: { discordId } })

      for (let i = 0; i < BACKUP_CODE_TOTAL; i++) {
        const code = generateBackupCode()
        const encrypted = encryptText(code)
        if (!encrypted) {
          continue
        }

        await tx.userBackupCode.create({
          data: {
            discordId,
            encryptedCode: encrypted.payload,
            iv: encrypted.iv,
            authTag: encrypted.tag,
          },
        })
        codes.push(code)
      }
    })

    return codes
  } catch (error) {
    logDbError("[VectoBeat] Failed to regenerate backup codes:", error)
    return []
  }
}

interface UserNotificationSettings {
  maintenanceAlerts: boolean
  downtimeAlerts: boolean
  releaseNotes: boolean
  securityNotifications: boolean
  betaProgram: boolean
  communityEvents: boolean
}

const notificationDefaults: UserNotificationSettings = {
  maintenanceAlerts: true,
  downtimeAlerts: true,
  releaseNotes: true,
  securityNotifications: true,
  betaProgram: false,
  communityEvents: false,
}

export const getUserNotifications = async (discordId: string): Promise<UserNotificationSettings> => {
  try {
    const db = getPool()
    if (!db) {
      return notificationDefaults
    }

    const row = await db.userNotification.findUnique({
      where: { discordId },
    })

    if (!row) {
      return notificationDefaults
    }

    return {
      maintenanceAlerts: row.maintenanceAlerts ?? notificationDefaults.maintenanceAlerts,
      downtimeAlerts: row.downtimeAlerts ?? notificationDefaults.downtimeAlerts,
      releaseNotes: row.releaseNotes ?? notificationDefaults.releaseNotes,
      securityNotifications: row.securityNotifications ?? notificationDefaults.securityNotifications,
      betaProgram: row.betaProgram ?? notificationDefaults.betaProgram,
      communityEvents: row.communityEvents ?? notificationDefaults.communityEvents,
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load notifications:", error)
    return notificationDefaults
  }
}

export const updateUserNotifications = async (
  discordId: string,
  updates: Partial<UserNotificationSettings>,
): Promise<UserNotificationSettings> => {
  const merged = { ...(await getUserNotifications(discordId)), ...updates }

  try {
    const db = getPool()
    if (!db) {
      return merged
    }

    await db.userNotification.upsert({
      where: { discordId },
      update: {
        maintenanceAlerts: merged.maintenanceAlerts,
        downtimeAlerts: merged.downtimeAlerts,
        releaseNotes: merged.releaseNotes,
        securityNotifications: merged.securityNotifications,
        betaProgram: merged.betaProgram,
        communityEvents: merged.communityEvents,
      },
      create: {
        discordId,
        maintenanceAlerts: merged.maintenanceAlerts,
        downtimeAlerts: merged.downtimeAlerts,
        releaseNotes: merged.releaseNotes,
        securityNotifications: merged.securityNotifications,
        betaProgram: merged.betaProgram,
        communityEvents: merged.communityEvents,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to update notifications:", error)
  }

  return merged
}

interface UserPrivacySettings {
  profilePublic: boolean
  searchVisibility: boolean
  analyticsOptIn: boolean
  dataSharing: boolean
}

const privacyDefaults: UserPrivacySettings = {
  profilePublic: false,
  searchVisibility: true,
  analyticsOptIn: false,
  dataSharing: false,
}

export const getUserPrivacy = async (discordId: string): Promise<UserPrivacySettings> => {
  try {
    const db = getPool()
    if (!db) {
      return privacyDefaults
    }

    const row = await db.userPrivacy.findUnique({
      where: { discordId },
    })

    if (!row) {
      return privacyDefaults
    }

    return {
      profilePublic: row.profilePublic ?? privacyDefaults.profilePublic,
      searchVisibility: row.searchVisibility ?? privacyDefaults.searchVisibility,
      analyticsOptIn: row.analyticsOptIn ?? privacyDefaults.analyticsOptIn,
      dataSharing: row.dataSharing ?? privacyDefaults.dataSharing,
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load privacy settings:", error)
    return privacyDefaults
  }
}

export const updateUserPrivacy = async (
  discordId: string,
  updates: Partial<UserPrivacySettings>,
): Promise<UserPrivacySettings> => {
  const merged = { ...(await getUserPrivacy(discordId)), ...updates }

  try {
    const db = getPool()
    if (!db) {
      return merged
    }

    await db.userPrivacy.upsert({
      where: { discordId },
      update: {
        profilePublic: merged.profilePublic,
        searchVisibility: merged.searchVisibility,
        analyticsOptIn: merged.analyticsOptIn,
        dataSharing: merged.dataSharing,
      },
      create: {
        discordId,
        profilePublic: merged.profilePublic,
        searchVisibility: merged.searchVisibility,
        analyticsOptIn: merged.analyticsOptIn,
        dataSharing: merged.dataSharing,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to update privacy settings:", error)
  }

  return merged
}

interface UserProfileSettingRecord {
  discordId: string
  handle: string
  profileName: string | null
  headline: string | null
  bio: string | null
  location: string | null
  website: string | null
  createdAt: Date
  updatedAt: Date
}

const mapProfileSettings = (row: UserProfileSettingRecord) => ({
  discordId: row.discordId,
  handle: row.handle,
  profileName: row.profileName ?? null,
  headline: row.headline ?? "",
  bio: row.bio ?? "",
  location: row.location ?? "",
  website: row.website ?? "",
})

const profileSettingsDefaults = {
  handle: "",
  profileName: null as string | null,
  headline: "",
  bio: "",
  location: "",
  website: "",
}

const ensureProfileSettings = async (discordId: string, usernameHint?: string | null) => {
  const db = getPool()
  if (!db) {
    return { ...profileSettingsDefaults, discordId }
  }

  const existing = await db.userProfileSetting.findUnique({
    where: { discordId },
  })
  if (existing) {
    return mapProfileSettings(existing as UserProfileSettingRecord)
  }

  let baseHandle = generateFallbackHandle(usernameHint ?? undefined, discordId)
  while (baseHandle.length < PROFILE_HANDLE_MIN) {
    baseHandle = `${baseHandle}-${Math.floor(Math.random() * 1000)}`
  }

  let candidate = baseHandle
  let attempts = 0
  while (attempts < 5) {
    const conflict = await db.userProfileSetting.findUnique({ where: { handle: candidate } })
    if (!conflict) {
      break
    }
    candidate = `${baseHandle}-${Math.floor(Math.random() * 999)}`
    attempts++
  }

  const created = await db.userProfileSetting.create({
    data: {
      discordId,
      handle: candidate,
    },
  })

  return mapProfileSettings(created as UserProfileSettingRecord)
}

const getProfileBase = async (discordId: string) => {
  const db = getPool()
  if (!db) {
    return { username: null, displayName: null, avatarUrl: null, guildCount: 0 }
  }

  const record = await db.userProfile.findUnique({
    where: { discordId },
    select: {
      username: true,
      displayName: true,
      avatarUrl: true,
      guildCount: true,
    },
  })

  return {
    username: record?.username ?? null,
    displayName: record?.displayName ?? null,
    avatarUrl: record?.avatarUrl ?? null,
    guildCount: record?.guildCount ?? 0,
  }
}

export const getAccountProfileSettings = async (discordId: string) => {
  const base = await getProfileBase(discordId)
  const settings = await ensureProfileSettings(discordId, base.username ?? undefined)

  return {
    discordId,
    handle: settings.handle,
    username: base.username,
    avatarUrl: base.avatarUrl,
    displayName: settings.profileName || base.displayName || base.username || "Community Member",
    headline: settings.headline,
    bio: settings.bio,
    location: settings.location,
    website: settings.website,
  }
}

const handleExists = async (handle: string, discordId?: string) => {
  const db = getPool()
  if (!db) return false
  const existing = await db.userProfileSetting.findUnique({
    where: { handle },
    select: { discordId: true },
  })
  if (!existing) return false
  if (discordId && existing.discordId === discordId) {
    return false
  }
  return true
}

const resolveHandleForUpdate = async (handle: string | undefined, discordId: string) => {
  if (!handle) return undefined
  const sanitized = sanitizeHandle(handle)
  if (sanitized.length < PROFILE_HANDLE_MIN) {
    throw new Error("Profile handle must contain at least 3 alphanumeric characters.")
  }
  if (await handleExists(sanitized, discordId)) {
    throw new Error("This profile handle is already in use.")
  }
  return sanitized
}

export const updateAccountProfileSettings = async (
  discordId: string,
  updates: {
    displayName?: string | null
    headline?: string | null
    bio?: string | null
    location?: string | null
    website?: string | null
    handle?: string | null
  },
) => {
  const db = getPool()
  if (!db) {
    return getAccountProfileSettings(discordId)
  }

  const base = await getProfileBase(discordId)
  const existing = await ensureProfileSettings(discordId, base.username ?? undefined)

  const nextHandle =
    updates.handle !== undefined && updates.handle !== null
      ? await resolveHandleForUpdate(updates.handle, discordId)
      : undefined

  const payload: Prisma.UserProfileSettingUpdateInput = {
    profileName:
      updates.displayName === undefined ? (existing.profileName || null) : normalizeInput(updates.displayName, 80),
    headline: updates.headline === undefined ? (existing.headline || null) : normalizeInput(updates.headline, 120),
    bio: updates.bio === undefined ? (existing.bio || null) : normalizeInput(updates.bio, 2000),
    location: updates.location === undefined ? (existing.location || null) : normalizeInput(updates.location, 120),
    website:
      updates.website === undefined ? (existing.website || null) : normalizeWebsite(updates.website) || null,
  }

  if (nextHandle) {
    payload.handle = nextHandle
  }

  await db.userProfileSetting.update({
    where: { discordId },
    data: payload,
  })

  if (updates.displayName) {
    await db.userProfile.update({
      where: { discordId },
      data: { displayName: updates.displayName },
    })
  }

  return getAccountProfileSettings(discordId)
}

export const getPublicProfileBySlug = async (slug: string) => {
  const db = getPool()
  if (!db) return null
  const normalized = slug.trim().toLowerCase()
  if (!normalized) return null

  let targetDiscordId: string | null = null

  const handleMatch = await db.userProfileSetting.findUnique({
    where: { handle: normalized },
  })

  if (handleMatch) {
    targetDiscordId = handleMatch.discordId
  } else {
    const profileMatch = await db.userProfile.findFirst({
      where: {
        OR: [{ discordId: slug }, { username: normalized }],
      },
      select: { discordId: true },
    })
    if (profileMatch) {
      targetDiscordId = profileMatch.discordId
      await ensureProfileSettings(profileMatch.discordId, normalized)
    }
  }

  if (!targetDiscordId) {
    return null
  }

  const privacy = await getUserPrivacy(targetDiscordId)
  if (!privacy.profilePublic) {
    return { restricted: true }
  }

  const base = await getProfileBase(targetDiscordId)
  const settings = await ensureProfileSettings(targetDiscordId, base.username ?? undefined)
  const decrypted = await getDecryptedProfilePayload(targetDiscordId)
  const guilds = Array.isArray(decrypted?.guilds) ? decrypted.guilds : []
  const adminFull = guilds.filter((guild): guild is { id: string; name: string; hasBot: boolean; isAdmin: boolean } => Boolean(guild?.isAdmin && guild?.id && guild?.name))
  const memberOnly = guilds.filter((guild): guild is { id: string; name: string; hasBot: boolean; isAdmin: boolean } => Boolean(guild && !guild.isAdmin && guild.id && guild.name))
  const activeBotGuilds = guilds.filter(
    (guild): guild is { id: string; name: string; hasBot: boolean; isAdmin: boolean } =>
      Boolean(guild?.id && guild?.name && guild?.hasBot !== false),
  )
  const membershipCount = guilds.length || base.guildCount || 0
  const botGuildCount = activeBotGuilds.length
  const totalGuildCount = membershipCount
  const formatGuild = (guild: { id: string; name: string; hasBot?: boolean; isAdmin?: boolean }) => ({
    id: guild.id,
    name: guild.name,
    hasBot: guild.hasBot === false ? false : true,
    isAdmin: Boolean(guild.isAdmin),
  })
  const linkedAccounts = await getLinkedAccounts(targetDiscordId)

  return {
    discordId: targetDiscordId,
    handle: settings.handle,
    role: await getUserRole(targetDiscordId),
    username: base.username,
    displayName: settings.profileName || base.displayName || base.username || "Community Member",
    headline: settings.headline,
    bio: settings.bio,
    location: settings.location,
    website: settings.website,
    avatarUrl: base.avatarUrl,
    membershipCount,
    totalGuildCount,
    adminGuildCount: adminFull.length,
    botGuildCount,
    activeGuildCount: botGuildCount,
    activeGuilds: activeBotGuilds.slice(0, 12).map(formatGuild),
    adminGuilds: adminFull.slice(0, 12).map(formatGuild),
    memberGuilds: memberOnly.slice(0, 12).map(formatGuild),
    totalGuildSamples: guilds.slice(0, 12).map(formatGuild),
    linkedAccounts,
  }
}

export const listPublicProfileSlugs = async (): Promise<Array<{ slug: string; updatedAt: Date }>> => {
  try {
    const db = getPool()
    if (!db) return []

    const privacy = await db.userPrivacy.findMany({
      where: { profilePublic: true, searchVisibility: true },
      select: { discordId: true, updatedAt: true },
    })
    if (!privacy.length) return []

    const privacyUpdatedMap = new Map(privacy.map((row) => [row.discordId, row.updatedAt]))

    const settings = await db.userProfileSetting.findMany({
      where: { discordId: { in: privacy.map((row) => row.discordId) } },
      select: { discordId: true, handle: true, updatedAt: true },
    })

    return settings
      .filter((setting) => Boolean(setting.handle))
      .map((setting) => ({
        slug: setting.handle,
        updatedAt: privacyUpdatedMap.get(setting.discordId) ?? setting.updatedAt ?? new Date(),
      }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list public profile slugs:", error)
    return []
  }
}

export const recordSitePageView = async ({
  path,
  referrer,
  userAgent,
  country,
  ip,
}: {
  path: string
  referrer?: string | null
  userAgent?: string | null
  country?: string | null
  ip?: string | null
}) => {
  try {
    const db = getPool()
    if (!db) return
    const { host: referrerHost, path: referrerPath } = parseReferrerForStorage(referrer)
    const normalizedPath = path.slice(0, 191)
    const normalizedReferrer = referrer ? referrer.slice(0, 190) : null
    const normalizedReferrerPath = referrerPath ? referrerPath.slice(0, 191) : null

    await db.sitePageView.create({
      data: {
        path: normalizedPath,
        referrer: normalizedReferrer,
        referrerHost,
        referrerPath: normalizedReferrerPath,
        userAgent: userAgent ? userAgent.slice(0, 500) : null,
        country: country ? country.slice(0, 8) : null,
        ipHash: ip ? crypto.createHash("sha256").update(ip).digest("hex") : null,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to record page view:", error)
  }
}

interface BotMetricSnapshotInput {
  guildCount: number
  activeListeners: number
  totalStreams: number
  uptimePercent: number
  avgResponseMs: number
  voiceConnections: number
  incidents24h: number
  commands24h: number
  shardsOnline: number
  shardsTotal: number
}

export const BOT_SNAPSHOT_INTERVAL_MS = 60 * 1000

export const recordBotMetricSnapshot = async (payload: BotMetricSnapshotInput) => {
  try {
    const db = getPool()
    if (!db) return

    const lastSnapshot = await db.botMetricSnapshot.findFirst({
      orderBy: { recordedAt: "desc" },
      select: { recordedAt: true },
    })

    if (lastSnapshot && Date.now() - lastSnapshot.recordedAt.getTime() < BOT_SNAPSHOT_INTERVAL_MS) {
      return
    }

    await db.botMetricSnapshot.create({
      data: {
        guildCount: payload.guildCount,
        activeListeners: payload.activeListeners,
        totalStreams: payload.totalStreams,
        uptimePercent: payload.uptimePercent,
        avgResponseMs: payload.avgResponseMs,
        voiceConnections: payload.voiceConnections,
        incidents24h: payload.incidents24h,
        commands24h: payload.commands24h,
        shardsOnline: payload.shardsOnline,
        shardsTotal: payload.shardsTotal,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to record bot snapshot:", error)
  }
}

export const getLatestBotMetricSnapshot = async () => {
  try {
    const db = getPool()
    if (!db) return null
    const snapshot = await db.botMetricSnapshot.findFirst({
      orderBy: { recordedAt: "desc" },
    })
    return snapshot
  } catch (error) {
    logDbError("[VectoBeat] Failed to load latest bot snapshot:", error)
    return null
  }
}

export type BotUsageTotalsRecord = {
  totalStreams: number
  commandsTotal: number
  incidentsTotal: number
  updatedAt: string | null
}

type BotUsageTotalsInput = {
  totalStreams?: number | null
  commandsTotal?: number | null
  incidentsTotal?: number | null
}

const USAGE_TOTALS_KEY = "usage_totals"

const mapUsageTotals = (record: any): BotUsageTotalsRecord => ({
  totalStreams: record?.totalStreams ?? 0,
  commandsTotal: record?.commandsTotal ?? 0,
  incidentsTotal: record?.incidentsTotal ?? 0,
  updatedAt: record?.updatedAt?.toISOString?.() ?? null,
})

const normalizeUsageValue = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  if (value < 0) {
    return 0
  }
  return Math.trunc(value)
}

export const getBotUsageTotals = async (): Promise<BotUsageTotalsRecord> => {
  try {
    const db = getPool()
    if (!db) {
      return mapUsageTotals(null)
    }
    const record = await db.botUsageTotals.findUnique({ where: { key: USAGE_TOTALS_KEY } })
    return mapUsageTotals(record)
  } catch (error) {
    logDbError("[VectoBeat] Failed to load bot usage totals:", error)
    return mapUsageTotals(null)
  }
}

export const upsertBotUsageTotals = async (input: BotUsageTotalsInput): Promise<BotUsageTotalsRecord> => {
  try {
    const db = getPool()
    if (!db) {
      return mapUsageTotals(null)
    }

    const desiredStreams = normalizeUsageValue(input.totalStreams ?? null)
    const desiredCommands = normalizeUsageValue(input.commandsTotal ?? null)
    const desiredIncidents = normalizeUsageValue(input.incidentsTotal ?? null)

    if (desiredStreams === null && desiredCommands === null && desiredIncidents === null) {
      const existing = await db.botUsageTotals.findUnique({ where: { key: USAGE_TOTALS_KEY } })
      return mapUsageTotals(existing)
    }

    const updateData: Prisma.BotUsageTotalsUpdateInput = {}
    if (desiredStreams !== null) {
      updateData.totalStreams = desiredStreams
    }
    if (desiredCommands !== null) {
      updateData.commandsTotal = desiredCommands
    }
    if (desiredIncidents !== null) {
      updateData.incidentsTotal = desiredIncidents
    }

    const record = await db.botUsageTotals.upsert({
      where: { key: USAGE_TOTALS_KEY },
      update: updateData,
      create: {
        key: USAGE_TOTALS_KEY,
        totalStreams: desiredStreams ?? 0,
        commandsTotal: desiredCommands ?? 0,
        incidentsTotal: desiredIncidents ?? 0,
      },
    })

    return mapUsageTotals(record)
  } catch (error) {
    logDbError("[VectoBeat] Failed to upsert bot usage totals:", error)
    return mapUsageTotals(null)
  }
}

type BotActivityEventInput = {
  type: string
  name?: string | null
  guildId?: string | null
  success?: boolean | null
  metadata?: Record<string, unknown> | null
  createdAt?: Date
}

export const recordBotActivityEvent = async (event: BotActivityEventInput) => {
  try {
    const db = getPool()
    if (!db) return
    await db.botActivityEvent.create({
      data: {
        type: event.type,
        name: event.name ?? null,
        guildId: event.guildId ?? null,
        success: event.success ?? null,
        metadata: event.metadata as Prisma.InputJsonValue,
        createdAt: event.createdAt ?? new Date(),
      },
    })
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2024") {
      console.warn("[VectoBeat] Skipping bot activity event due to pool exhaustion")
      return
    }
    logDbError("[VectoBeat] Failed to record bot activity event:", error)
  }
}

export type BotActivityEventSummary = {
  id: string
  type: string
  name: string | null
  guildId: string | null
  success: boolean | null
  metadata: Record<string, any> | null
  createdAt: string
}

export const listBotActivityEvents = async (limit = 200): Promise<BotActivityEventSummary[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.botActivityEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name ?? null,
      guildId: row.guildId ?? null,
      success: row.success ?? null,
      metadata: (row.metadata as Record<string, any> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list bot activity events:", error)
    return []
  }
}

type AutomationActionInput = {
  guildId: string
  action: string
  category?: string | null
  description?: string | null
  shardId?: number | null
  tier?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: Date
}

export const recordAutomationAction = async (action: AutomationActionInput) => {
  try {
    const db = getPool()
    if (!db) return
    await db.automationAction.create({
      data: {
        guildId: action.guildId,
        action: action.action,
        category: action.category ?? null,
        description: action.description ?? null,
        shardId: action.shardId ?? null,
        tier: action.tier ?? null,
        metadata: (action.metadata ?? null) as Prisma.InputJsonValue,
        createdAt: action.createdAt ?? new Date(),
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to record automation action:", error)
  }
}

export type AutomationActionRecord = {
  id: string
  guildId: string
  action: string
  category: string | null
  description: string | null
  tier: string | null
  shardId: number | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export const getAutomationActionsForGuild = async (
  guildId: string,
  limit = 50,
): Promise<AutomationActionRecord[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const safeLimit = Math.max(1, Math.min(200, limit))
    const entries = await db.automationAction.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: safeLimit,
    })
    return entries.map((entry) => ({
      id: entry.id,
      guildId: entry.guildId,
      action: entry.action,
      category: entry.category ?? null,
      description: entry.description ?? null,
      tier: entry.tier ?? null,
      shardId: entry.shardId ?? null,
      metadata: (entry.metadata as Record<string, unknown> | null) ?? null,
      createdAt: entry.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to load automation actions:", error)
    return []
  }
}

type ConciergeRequestInput = {
  guildId: string
  tier?: string | null
  contact?: string | null
  summary: string
  hours?: number
  slaMinutes?: number | null
  createdAt?: Date
  resolvedBy?: string | null
  resolvedById?: string | null
  resolutionNote?: string | null
}

export const recordConciergeRequest = async (payload: ConciergeRequestInput) => {
  try {
    const db = getPool()
    if (!db) return null
    const record = await db.conciergeRequest.create({
      data: {
        guildId: payload.guildId,
        tier: payload.tier ?? null,
        contact: payload.contact ?? null,
        summary: payload.summary,
        hours: Math.max(1, Math.min(8, Number(payload.hours ?? 1))),
        slaMinutes: payload.slaMinutes ?? null,
        createdAt: payload.createdAt ?? new Date(),
        resolvedBy: payload.resolvedBy ?? null,
        resolvedById: payload.resolvedById ?? null,
        resolutionNote: payload.resolutionNote ?? null,
      },
    })
    return record
  } catch (error) {
    logDbError("[VectoBeat] Failed to create concierge request:", error)
    return null
  }
}

export const resolveConciergeRequest = async (payload: {
  requestId: string
  guildId: string
  actor?: string | null
  actorId?: string | null
  note?: string | null
}) => {
  try {
    const db = getPool()
    if (!db) return false
    const now = new Date()
    const result = await db.conciergeRequest.updateMany({
      where: { id: payload.requestId, guildId: payload.guildId },
      data: {
        status: "resolved",
        respondedAt: now,
        resolvedAt: now,
        resolvedBy: payload.actor ?? null,
        resolvedById: payload.actorId ?? null,
        resolutionNote: payload.note ?? null,
      },
    })
    return result.count > 0
  } catch (error) {
    logDbError("[VectoBeat] Failed to resolve concierge request:", error)
    return false
  }
}

type QueueSnapshotRecord = {
  guildId: string
  tier: string | null
  payload: Prisma.JsonValue
  expiresAt: Date | null
  updatedAt: Date
}

const asQueueSnapshot = (record: QueueSnapshotRecord | null): { snapshot: QueueSnapshot; expiresAt: Date | null } | null => {
  if (!record) return null
  const snapshot = asJsonObject<QueueSnapshot>(record.payload)
  if (!snapshot) return null
  return { snapshot, expiresAt: record.expiresAt }
}

export const saveQueueSnapshot = async (snapshot: QueueSnapshot, tier: MembershipTier, expiresAt: Date | null) => {
  try {
    const db = getPool()
    if (!db) return null
    const incomingUpdatedAt = snapshot.updatedAt ? new Date(snapshot.updatedAt) : new Date()
    const existing = await db.queueSnapshot.findUnique({ where: { guildId: snapshot.guildId } })
    if (existing && existing.updatedAt && existing.updatedAt > incomingUpdatedAt) {
      return asQueueSnapshot(existing as unknown as QueueSnapshotRecord)
    }
    const record = await db.queueSnapshot.upsert({
      where: { guildId: snapshot.guildId },
      update: {
        tier,
        payload: snapshot as unknown as Prisma.InputJsonValue,
        expiresAt,
        updatedAt: incomingUpdatedAt,
      },
      create: {
        guildId: snapshot.guildId,
        tier,
        payload: snapshot as unknown as Prisma.InputJsonValue,
        expiresAt,
        updatedAt: incomingUpdatedAt,
      },
    })
    return asQueueSnapshot(record as unknown as QueueSnapshotRecord)
  } catch (error) {
    logDbError("[VectoBeat] Failed to persist queue snapshot:", error)
    return null
  }
}

export const loadQueueSnapshot = async (guildId: string) => {
  try {
    const db = getPool()
    if (!db) return null
    const record = await db.queueSnapshot.findUnique({
      where: { guildId },
    })
    return asQueueSnapshot(record as unknown as QueueSnapshotRecord)
  } catch (error) {
    logDbError("[VectoBeat] Failed to load queue snapshot:", error)
    return null
  }
}

export const purgeExpiredQueueSnapshots = async (now = new Date()) => {
  try {
    const db = getPool()
    if (!db) return 0
    const result = await db.queueSnapshot.deleteMany({
      where: { expiresAt: { lt: now } },
    })
    return result.count
  } catch (error) {
    logDbError("[VectoBeat] Failed to purge queue snapshots:", error)
    return 0
  }
}

export const getConciergeUsage = async (
  guildId: string,
  windowDays = 30,
  totalHoursOverride: number | null = 2,
): Promise<{ remaining: number | null; total: number | null; used: number }> => {
  try {
    const db = getPool()
    if (!db) {
      return { remaining: 0, total: 0, used: 0 }
    }
    const since = new Date(Date.now() - Math.abs(windowDays) * 24 * 60 * 60 * 1000)
    const totalHours = typeof totalHoursOverride === "number" ? Math.max(0, totalHoursOverride) : null
    const entries = await db.conciergeRequest.findMany({
      where: { guildId, createdAt: { gte: since } },
      select: { hours: true },
    })
    const used = entries.reduce((sum, entry) => sum + (entry.hours ?? 0), 0)
    const remaining = totalHours === null ? null : Math.max(0, totalHours - used)
    return { remaining, total: totalHours, used }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load concierge usage:", error)
    return { remaining: 0, total: 0, used: 0 }
  }
}

type PrismaSuccessPodEvent = {
  id: string
  requestId: string
  kind: string
  note: string | null
  actor: string | null
  actorId: string | null
  createdAt: Date
}

type PrismaSuccessPodRequest = {
  id: string
  guildId: string
  guildName: string | null
  tier: string | null
  contact: string | null
  summary: string
  status: string
  assignedTo: string | null
  assignedContact: string | null
  submittedAt: Date
  acknowledgedAt: Date | null
  scheduledAt: Date | null
  scheduledFor: Date | null
  resolvedAt: Date | null
  resolutionNote: string | null
  createdBy: string | null
  updatedAt: Date
  timelineEntries: PrismaSuccessPodEvent[]
}

export type SuccessPodTimelineEntry = {
  id: string
  requestId: string
  kind: string
  note: string | null
  actor: string | null
  actorId: string | null
  createdAt: string
}

export type SuccessPodRequestRecord = {
  id: string
  guildId: string
  guildName: string | null
  tier: string | null
  contact: string | null
  summary: string
  status: string
  assignedTo: string | null
  assignedContact: string | null
  submittedAt: string
  acknowledgedAt: string | null
  scheduledAt: string | null
  scheduledFor: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  createdBy: string | null
  timeline: SuccessPodTimelineEntry[]
}

const mapSuccessPodEvent = (entry: PrismaSuccessPodEvent): SuccessPodTimelineEntry => ({
  id: entry.id,
  requestId: entry.requestId,
  kind: entry.kind,
  note: entry.note,
  actor: entry.actor,
  actorId: entry.actorId,
  createdAt: entry.createdAt.toISOString(),
})

const mapSuccessPodRequest = (row: PrismaSuccessPodRequest): SuccessPodRequestRecord => ({
  id: row.id,
  guildId: row.guildId,
  guildName: row.guildName,
  tier: row.tier,
  contact: row.contact,
  summary: row.summary,
  status: row.status,
  assignedTo: row.assignedTo,
  assignedContact: row.assignedContact,
  submittedAt: row.submittedAt.toISOString(),
  acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
  scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
  scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
  resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  resolutionNote: row.resolutionNote,
  createdBy: row.createdBy,
  timeline: row.timelineEntries
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(mapSuccessPodEvent),
})

type SuccessPodRequestInput = {
  guildId: string
  guildName?: string | null
  contact?: string | null
  summary: string
  tier?: string | null
  createdBy?: string | null
  source?: string | null
}

export const recordSuccessPodRequest = async (
  payload: SuccessPodRequestInput,
): Promise<SuccessPodRequestRecord | null> => {
  try {
    const db = getPool()
    if (!db) return null
    const entryNote = payload.source
      ? `Request submitted via ${payload.source}.`
      : "Request submitted by customer."
    const record = await db.successPodRequest.create({
      data: {
        guildId: payload.guildId,
        guildName: payload.guildName ?? null,
        tier: payload.tier ?? null,
        contact: payload.contact ?? null,
        summary: payload.summary,
        status: "submitted",
        createdBy: payload.createdBy ?? null,
        timelineEntries: {
          create: {
            kind: "submitted",
            note: entryNote,
            actor: payload.createdBy ?? null,
          },
        },
      },
      include: {
        timelineEntries: true,
      },
    })
    return mapSuccessPodRequest(record)
  } catch (error) {
    logDbError("[VectoBeat] Failed to create success pod request:", error)
    return null
  }
}

export const getSuccessPodRequests = async (
  guildId: string,
  limit = 10,
): Promise<SuccessPodRequestRecord[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const safeLimit = Math.max(1, Math.min(25, limit))
    const records = await db.successPodRequest.findMany({
      where: { guildId },
      orderBy: { submittedAt: "desc" },
      take: safeLimit,
      include: { timelineEntries: true },
    })
    return records.map(mapSuccessPodRequest)
  } catch (error) {
    logDbError("[VectoBeat] Failed to load success pod requests:", error)
    return []
  }
}

type SuccessPodActionInput = {
  requestId: string
  guildId?: string
  action: "acknowledged" | "scheduled" | "resolved"
  actor?: string | null
  actorId?: string | null
  note?: string | null
  assignedTo?: string | null
  assignedContact?: string | null
  scheduledFor?: Date | null
  resolutionNote?: string | null
}

export const progressSuccessPodRequest = async (
  payload: SuccessPodActionInput,
): Promise<SuccessPodRequestRecord | null> => {
  try {
    const db = getPool()
    if (!db) return null
    const existing = await db.successPodRequest.findUnique({
      where: { id: payload.requestId },
      include: { timelineEntries: true },
    })
    if (!existing) {
      return null
    }
    if (payload.guildId && existing.guildId !== payload.guildId) {
      return null
    }
    const now = new Date()
    const data: Prisma.SuccessPodRequestUpdateInput = {}
    let kind: string = payload.action
    let note = payload.note ?? ""
    switch (payload.action) {
      case "acknowledged": {
        data.status = "acknowledged"
        data.acknowledgedAt = existing.acknowledgedAt ?? now
        if (payload.assignedTo !== undefined) {
          data.assignedTo = payload.assignedTo
        }
        if (payload.assignedContact !== undefined) {
          data.assignedContact = payload.assignedContact
        }
        if (!note) {
          note = "Request acknowledged by success pod."
        }
        break
      }
      case "scheduled": {
        data.status = "scheduled"
        data.scheduledAt = now
        data.scheduledFor = payload.scheduledFor ?? now
        data.acknowledgedAt = existing.acknowledgedAt ?? now
        if (payload.assignedTo !== undefined) {
          data.assignedTo = payload.assignedTo
        }
        if (payload.assignedContact !== undefined) {
          data.assignedContact = payload.assignedContact
        }
        if (!note) {
          note = "Session scheduled with success pod."
        }
        break
      }
      case "resolved": {
        data.status = "resolved"
        data.resolvedAt = now
        data.acknowledgedAt = existing.acknowledgedAt ?? now
        data.resolutionNote = payload.resolutionNote ?? payload.note ?? existing.resolutionNote ?? null
        if (!note) {
          note = "Request resolved."
        }
        break
      }
      default:
        return null
    }

    const updated = await db.successPodRequest.update({
      where: { id: existing.id },
      data: {
        ...data,
        timelineEntries: {
          create: {
            kind,
            note,
            actor: payload.actor ?? null,
            actorId: payload.actorId ?? null,
          },
        },
      },
      include: { timelineEntries: true },
    })
    return mapSuccessPodRequest(updated)
  } catch (error) {
    logDbError("[VectoBeat] Failed to progress success pod request:", error)
    return null
  }
}

type ScaleAccountContactRecord = {
  id: string
  guildId: string
  managerName: string | null
  managerEmail: string | null
  managerDiscord: string | null
  escalationChannel: string | null
  escalationNotes: string | null
  updatedAt: string
  createdAt: string
}

const mapScaleContact = (row: ScaleAccountContact): ScaleAccountContactRecord => ({
  id: row.id,
  guildId: row.guildId,
  managerName: row.managerName,
  managerEmail: row.managerEmail,
  managerDiscord: row.managerDiscord,
  escalationChannel: row.escalationChannel,
  escalationNotes: row.escalationNotes,
  updatedAt: row.updatedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
})

export const getScaleAccountContact = async (guildId: string): Promise<ScaleAccountContactRecord | null> => {
  try {
    const db = getPool()
    if (!db) return null
    const record = await db.scaleAccountContact.findUnique({ where: { guildId } })
    return record ? mapScaleContact(record) : null
  } catch (error) {
    logDbError("[VectoBeat] Failed to load Scale account contact:", error)
    return null
  }
}

type ScaleAccountContactInput = {
  managerName?: string | null
  managerEmail?: string | null
  managerDiscord?: string | null
  escalationChannel?: string | null
  escalationNotes?: string | null
}

export const upsertScaleAccountContact = async (
  guildId: string,
  input: ScaleAccountContactInput,
): Promise<ScaleAccountContactRecord | null> => {
  try {
    const db = getPool()
    if (!db) return null
    const payload: Prisma.ScaleAccountContactUncheckedCreateInput = {
      guildId,
      managerName: input.managerName ?? null,
      managerEmail: input.managerEmail ?? null,
      managerDiscord: input.managerDiscord ?? null,
      escalationChannel: input.escalationChannel ?? null,
      escalationNotes: input.escalationNotes ?? null,
    }
    const record = await db.scaleAccountContact.upsert({
      where: { guildId },
      create: payload,
      update: {
        managerName: payload.managerName,
        managerEmail: payload.managerEmail,
        managerDiscord: payload.managerDiscord,
        escalationChannel: payload.escalationChannel,
        escalationNotes: payload.escalationNotes,
      },
    })
    return mapScaleContact(record)
  } catch (error) {
    logDbError("[VectoBeat] Failed to upsert Scale account contact:", error)
    return null
  }
}

export type BotMetricHistoryEntry = {
  recordedAt: string
  guildCount: number
  activeListeners: number
  totalStreams: number
  uptimePercent: number
  avgResponseMs: number
  voiceConnections: number
  incidents24h: number
  commands24h: number
  shardsOnline: number
  shardsTotal: number
}

export const getBotMetricHistory = async (limit = 60): Promise<BotMetricHistoryEntry[]> => {
  try {
    const db = getPool()
    if (!db) return []

    const snapshots = await db.botMetricSnapshot.findMany({
      orderBy: { recordedAt: "desc" },
      take: limit,
    })

    return snapshots
      .map((snapshot) => ({
        recordedAt: snapshot.recordedAt.toISOString(),
        guildCount: snapshot.guildCount,
        activeListeners: snapshot.activeListeners,
        totalStreams: snapshot.totalStreams,
        uptimePercent: snapshot.uptimePercent,
        avgResponseMs: snapshot.avgResponseMs,
        voiceConnections: snapshot.voiceConnections,
        incidents24h: snapshot.incidents24h,
        commands24h: snapshot.commands24h,
        shardsOnline: snapshot.shardsOnline,
        shardsTotal: snapshot.shardsTotal,
      }))
      .reverse()
  } catch (error) {
    logDbError("[VectoBeat] Failed to load bot metric history:", error)
    return []
  }
}

export const getSiteTrafficSummary = async (days = 30) => {
  try {
    const db = getPool()
    if (!db) {
      return {
        totalViews: 0,
        uniquePaths: 0,
        uniqueVisitors: 0,
        last24hViews: 0,
      last24hVisitors: 0,
      topPages: [],
      referrers: [],
      referrerHosts: [],
      referrerPaths: [],
      geo: [],
      dailySeries: [],
      monthlySeries: [],
    }
    }

    const sinceDaily = new Date(Date.now() - Math.max(days, 1) * 24 * 60 * 60 * 1000)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
      totalViews,
      last24hViews,
      topPages,
      referrers,
      geo,
      uniquePathGroups,
      uniqueVisitorGroups,
      last24hVisitorGroups,
      referrerHostGroups,
      referrerPathGroups,
    ] = await Promise.all([
      db.sitePageView.count(),
      db.sitePageView.count({ where: { createdAt: { gte: since24h } } }),
      db.sitePageView.groupBy({
        by: ["path"],
        _count: { path: true },
        orderBy: { _count: { path: "desc" } },
        take: 8,
      }),
      db.sitePageView.groupBy({
        by: ["referrer"],
        _count: { referrer: true },
        orderBy: { _count: { referrer: "desc" } },
        take: 8,
      }),
      db.sitePageView.groupBy({
        by: ["country"],
        _count: { country: true },
        orderBy: { _count: { country: "desc" } },
        take: 8,
      }),
      db.sitePageView.groupBy({
        by: ["path"],
        _count: { _all: true },
      }),
      db.sitePageView.groupBy({
        by: ["ipHash"],
        where: { ipHash: { not: null } },
        _count: { _all: true },
      }),
      db.sitePageView.groupBy({
        by: ["ipHash"],
        where: { ipHash: { not: null }, createdAt: { gte: since24h } },
        _count: { _all: true },
      }),
      db.sitePageView.groupBy({
        by: ["referrerHost"],
        _count: { referrerHost: true },
        orderBy: { _count: { referrerHost: "desc" } },
        take: 8,
      }),
      db.sitePageView.groupBy({
        by: ["referrerHost", "referrerPath"],
        _count: { referrerHost: true },
        orderBy: { _count: { referrerHost: "desc" } },
        take: 12,
      }),
    ])
    const uniquePaths = uniquePathGroups.length
    const uniqueVisitors = uniqueVisitorGroups.length
    const last24hVisitors = last24hVisitorGroups.length

    const dailyRows = await db.$queryRaw<
      Array<{
        bucket: Date
        views: bigint
        visitors: bigint
      }>
    >`
      SELECT
        DATE(created_at) AS bucket,
        COUNT(*) AS views,
        COUNT(DISTINCT ip_hash) AS visitors
      FROM site_page_views
      WHERE created_at >= ${sinceDaily}
      GROUP BY DATE(created_at)
      ORDER BY bucket ASC
    `

    const monthlyRows = await db.$queryRaw<
      Array<{
        bucket: string
        views: bigint
        visitors: bigint
      }>
    >`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m-01') AS bucket,
        COUNT(*) AS views,
        COUNT(DISTINCT ip_hash) AS visitors
      FROM site_page_views
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-01')
      ORDER BY bucket ASC
    `

    return {
      totalViews,
      uniquePaths,
      uniqueVisitors,
      last24hViews,
      last24hVisitors,
      topPages: topPages.map((row) => ({
        path: row.path,
        views: Number(row._count.path),
      })),
      referrers: referrers.map((row) => ({
        referrer: row.referrer || "Direct",
        views: Number(row._count.referrer),
      })),
      referrerHosts: referrerHostGroups
        .filter((row) => row.referrerHost)
        .map((row) => ({
          host: row.referrerHost || "direct",
          views: Number(row._count.referrerHost),
        })),
      referrerPaths: referrerPathGroups
        .filter((row) => row.referrerHost)
        .map((row) => ({
          host: row.referrerHost || "direct",
          path: row.referrerPath || "/",
          views: Number(row._count.referrerHost),
        })),
      geo: geo
        .filter((row) => row.country)
        .map((row) => ({
          country: row.country!,
          views: Number(row._count.country),
        })),
      dailySeries: dailyRows.map((row) => ({
        date: row.bucket,
        views: Number(row.views),
        visitors: Number(row.visitors),
      })),
      monthlySeries: monthlyRows.map((row) => ({
        date: row.bucket,
        views: Number(row.views),
        visitors: Number(row.visitors),
      })),
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load site traffic summary:", error)
    return {
      totalViews: 0,
      uniquePaths: 0,
      uniqueVisitors: 0,
      last24hViews: 0,
      last24hVisitors: 0,
      topPages: [],
      referrers: [],
      geo: [],
      dailySeries: [],
      monthlySeries: [],
    }
  }
}

interface UserSecuritySettings {
  twoFactorEnabled: boolean
  twoFactorSecret: string | null
  loginAlerts: boolean
  backupCodesRemaining: number
  activeSessions: number
  lastPasswordChange: string | null
}

const securityDefaults: UserSecuritySettings = {
  twoFactorEnabled: false,
  twoFactorSecret: null,
  loginAlerts: true,
  backupCodesRemaining: 0,
  activeSessions: 0,
  lastPasswordChange: null,
}

export const getUserSecurity = async (discordId: string): Promise<UserSecuritySettings> => {
  try {
    const db = getPool()
    if (!db) {
      return securityDefaults
    }

    const [backupCount, sessionCount] = await Promise.all([countBackupCodes(discordId), countActiveSessions(discordId)])

    const row = await db.userSecurity.findUnique({
      where: { discordId },
    })

    return {
      twoFactorEnabled: row?.twoFactorEnabled ?? securityDefaults.twoFactorEnabled,
      twoFactorSecret: row?.twoFactorSecret ?? securityDefaults.twoFactorSecret,
      loginAlerts: row?.loginAlerts ?? securityDefaults.loginAlerts,
      backupCodesRemaining: backupCount,
      activeSessions: sessionCount,
      lastPasswordChange: row?.lastPasswordChange ? row.lastPasswordChange.toISOString() : null,
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load security settings:", error)
    return securityDefaults
  }
}

export const updateUserSecurity = async (
  discordId: string,
  updates: Partial<UserSecuritySettings>,
): Promise<UserSecuritySettings> => {
  const current = await getUserSecurity(discordId)
  const nextValues = {
    twoFactorEnabled: updates.twoFactorEnabled ?? current.twoFactorEnabled,
    twoFactorSecret: "twoFactorSecret" in updates ? updates.twoFactorSecret ?? null : current.twoFactorSecret,
    loginAlerts: updates.loginAlerts ?? current.loginAlerts,
    lastPasswordChange: updates.lastPasswordChange ?? current.lastPasswordChange,
  }
  const [backupCount, sessionCount] = await Promise.all([countBackupCodes(discordId), countActiveSessions(discordId)])

  try {
    const db = getPool()
    if (!db) {
      return {
        ...current,
        ...nextValues,
        backupCodesRemaining: backupCount,
        activeSessions: sessionCount,
      }
    }

    await db.userSecurity.upsert({
      where: { discordId },
      update: {
        twoFactorEnabled: nextValues.twoFactorEnabled,
        twoFactorSecret: nextValues.twoFactorSecret,
        loginAlerts: nextValues.loginAlerts,
        backupCodesRemaining: backupCount,
        activeSessions: sessionCount,
        lastPasswordChange: nextValues.lastPasswordChange ? new Date(nextValues.lastPasswordChange) : null,
      },
      create: {
        discordId,
        twoFactorEnabled: nextValues.twoFactorEnabled,
        twoFactorSecret: nextValues.twoFactorSecret,
        loginAlerts: nextValues.loginAlerts,
        backupCodesRemaining: backupCount,
        activeSessions: sessionCount,
        lastPasswordChange: nextValues.lastPasswordChange ? new Date(nextValues.lastPasswordChange) : null,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to update security settings:", error)
  }

  return {
    twoFactorEnabled: nextValues.twoFactorEnabled,
    twoFactorSecret: nextValues.twoFactorSecret,
    loginAlerts: nextValues.loginAlerts,
    backupCodesRemaining: backupCount,
    activeSessions: sessionCount,
    lastPasswordChange: nextValues.lastPasswordChange,
  }
}

interface BotSettings {
  autoJoinVoice: boolean
  announceTracks: boolean
  djMode: boolean
  normalizeVolume: boolean
  defaultVolume: number
}

const botSettingsDefaults: BotSettings = {
  autoJoinVoice: true,
  announceTracks: true,
  djMode: false,
  normalizeVolume: true,
  defaultVolume: 70,
}

export const getBotSettings = async (discordId: string): Promise<BotSettings> => {
  try {
    const db = getPool()
    if (!db) {
      return botSettingsDefaults
    }

    const row = await db.userBotSetting.findUnique({
      where: { discordId },
    })

    if (!row) {
      return botSettingsDefaults
    }

    return {
      autoJoinVoice: row.autoJoinVoice ?? botSettingsDefaults.autoJoinVoice,
      announceTracks: row.announceTracks ?? botSettingsDefaults.announceTracks,
      djMode: row.djMode ?? botSettingsDefaults.djMode,
      normalizeVolume: row.normalizeVolume ?? botSettingsDefaults.normalizeVolume,
      defaultVolume: row.defaultVolume ?? botSettingsDefaults.defaultVolume,
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load bot settings:", error)
    return botSettingsDefaults
  }
}

export const updateBotSettings = async (discordId: string, updates: Partial<BotSettings>): Promise<BotSettings> => {
  const merged = { ...(await getBotSettings(discordId)), ...updates }

  try {
    const db = getPool()
    if (!db) {
      return merged
    }

    await db.userBotSetting.upsert({
      where: { discordId },
      update: {
        autoJoinVoice: merged.autoJoinVoice,
        announceTracks: merged.announceTracks,
        djMode: merged.djMode,
        normalizeVolume: merged.normalizeVolume,
        defaultVolume: merged.defaultVolume,
      },
      create: {
        discordId,
        autoJoinVoice: merged.autoJoinVoice,
        announceTracks: merged.announceTracks,
        djMode: merged.djMode,
        normalizeVolume: merged.normalizeVolume,
        defaultVolume: merged.defaultVolume,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to update bot settings:", error)
  }

  return merged
}

export const getServerSettings = async (guildId: string): Promise<ServerFeatureSettings> => {
  try {
    const db = getPool()
    if (!db) {
      return { ...defaultServerFeatureSettings }
    }

    const record = await db.serverSetting.findUnique({
      where: { guildId },
    })

    if (!record) {
      return { ...defaultServerFeatureSettings }
    }

    const settings = asJsonObject<ServerFeatureSettings>(record.settings) || {}
    return { ...defaultServerFeatureSettings, ...settings }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load server settings:", error)
    return { ...defaultServerFeatureSettings }
  }
}

export type GuildServerSettingsRecord = {
  guildId: string
  discordId: string
  updatedAt: string
  settings: ServerFeatureSettings
}

export const listGuildServerSettings = async (): Promise<GuildServerSettingsRecord[]> => {
  try {
    const db = getPool()
    if (!db) {
      return []
    }

    const records = await db.serverSetting.findMany({
      select: {
        guildId: true,
        discordId: true,
        settings: true,
        updatedAt: true,
      },
    })

    return records.map((record) => ({
      guildId: record.guildId,
      discordId: record.discordId,
      updatedAt: record.updatedAt.toISOString(),
      settings: {
        ...defaultServerFeatureSettings,
        ...(asJsonObject<ServerFeatureSettings>(record.settings) || {}),
      },
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list server settings:", error)
    return []
  }
}

export const listActiveSubscriptionTiers = async (): Promise<Map<string, MembershipTier>> => {
  const result = new Map<string, MembershipTier>()
  try {
    const db = getPool()
    if (!db) {
      return result
    }
    const records = await db.subscription.findMany({
      where: { status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
      select: { guildId: true, tier: true },
    })
    records.forEach((record) => {
      result.set(record.guildId, normalizeTierId(record.tier))
    })
    return result
  } catch (error) {
    logDbError("[VectoBeat] Failed to list active subscription tiers:", error)
    return result
  }
}

export const updateServerSettings = async (
  guildId: string,
  discordId: string,
  updates: Partial<ServerFeatureSettings>,
): Promise<ServerFeatureSettings> => {
  const merged = { ...(await getServerSettings(guildId)), ...updates }

  try {
    const db = getPool()
    if (!db) {
      return merged
    }

    await db.serverSetting.upsert({
      where: { guildId },
      update: {
        discordId,
        settings: merged as unknown as Prisma.JsonObject,
      },
      create: {
        guildId,
        discordId,
        settings: merged as unknown as Prisma.JsonObject,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to update server settings:", error)
  }

  return merged
}

export type ApiCredentialRecord = {
  id: string
  type: string
  label: string | null
  status: "active" | "disabled"
  createdBy: string | null
  metadata?: Record<string, any> | null
  createdAt: string
  deactivatedAt: string | null
  value?: string | null
}

export const getApiCredentialsByType = async (types: string[]): Promise<ApiCredentialRecord[]> => {
  const normalized = Array.from(new Set(types.map(normalizeApiKeyType).filter(Boolean)))
  if (!normalized.length) return []

  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.apiCredential.findMany({
      where: { type: { in: normalized } },
      orderBy: { createdAt: "desc" },
    })
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      label: row.label ?? null,
      status: row.status === "disabled" ? "disabled" : ("active" as const),
      createdBy: row.createdBy ?? null,
      metadata: (row.metadata as Record<string, any> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
      deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
      value: unpackSecretValue({ encryptedValue: row.encryptedValue, iv: row.iv, authTag: row.authTag }),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to load API credentials:", error)
    return []
  }
}

export const getActiveApiCredentialValue = async (type: string): Promise<string | null> => {
  const records = await getApiCredentialsByType([type])
  const active = records.find((record) => record.status === "active")
  return active?.value ?? null
}

export const isApiCredentialActive = async (value: string, types?: string[]): Promise<boolean> => {
  const normalized = types?.map(normalizeApiKeyType).filter(Boolean)
  try {
    const db = getPool()
    if (!db) return false
    const hash = hashSecretValue(value)
    const row = await db.apiCredential.findFirst({
      where: {
        valueHash: hash,
        status: API_CREDENTIAL_ACTIVE,
        ...(normalized && normalized.length ? { type: { in: normalized } } : {}),
      },
    })
    return Boolean(row)
  } catch (error) {
    logDbError("[VectoBeat] Failed to validate API credential:", error)
    return false
  }
}

export const rotateApiCredential = async (payload: {
  type: string
  value: string
  label?: string | null
  createdBy?: string | null
  metadata?: Record<string, any> | null
}): Promise<ApiCredentialRecord | null> => {
  const type = normalizeApiKeyType(payload.type)
  if (!type || !payload.value) {
    return null
  }

  const packed = packSecretValue(payload.value)
  if (!packed) return null

  try {
    const db = getPool()
    if (!db) return null

    const record = await db.$transaction(async (tx) => {
      await tx.apiCredential.updateMany({
        where: { type, status: API_CREDENTIAL_ACTIVE },
        data: { status: API_CREDENTIAL_DISABLED, deactivatedAt: new Date() },
      })
      return tx.apiCredential.create({
        data: {
          type,
          label: payload.label ?? null,
          valueHash: packed.valueHash,
          encryptedValue: packed.encryptedValue,
          iv: packed.iv,
          authTag: packed.authTag,
          status: API_CREDENTIAL_ACTIVE,
          createdBy: payload.createdBy ?? null,
          metadata: payload.metadata as Prisma.JsonObject | undefined,
        },
      })
    })

    return {
      id: record.id,
      type: record.type,
      label: record.label ?? null,
      status: record.status === "disabled" ? "disabled" : ("active" as const),
      createdBy: record.createdBy ?? null,
      metadata: (record.metadata as Record<string, any> | null) ?? null,
      createdAt: record.createdAt.toISOString(),
      deactivatedAt: record.deactivatedAt ? record.deactivatedAt.toISOString() : null,
      value: payload.value,
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to rotate API credential:", error)
    return null
  }
}

export type IncidentMirrorRecord = {
  id: string
  sourceGuildId: string
  targetLabel: string
  tier: string | null
  createdBy: string | null
  createdAt: string
  settings: ServerFeatureSettings
}

export const createIncidentMirror = async (payload: {
  sourceGuildId: string
  targetLabel?: string
  settings: ServerFeatureSettings
  tier?: string | null
  createdBy?: string | null
}): Promise<IncidentMirrorRecord | null> => {
  const targetLabel = (payload.targetLabel || "staging").trim().toLowerCase() || "staging"
  try {
    const db = getPool()
    if (!db) return null
    const record = await db.incidentMirror.create({
      data: {
        sourceGuildId: payload.sourceGuildId,
        targetLabel,
        tier: payload.tier ?? null,
        createdBy: payload.createdBy ?? null,
        settings: payload.settings as unknown as Prisma.JsonObject,
      },
    })
    return {
      id: record.id,
      sourceGuildId: record.sourceGuildId,
      targetLabel: record.targetLabel,
      tier: record.tier,
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
      settings: (record.settings as ServerFeatureSettings) ?? defaultServerFeatureSettings,
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to create incident mirror:", error)
    return null
  }
}

export const getLatestIncidentMirror = async (sourceGuildId: string, targetLabel = "staging") => {
  try {
    const db = getPool()
    if (!db) return null
    const record = await db.incidentMirror.findFirst({
      where: { sourceGuildId, targetLabel },
      orderBy: { createdAt: "desc" },
    })
    if (!record) return null
    return {
      id: record.id,
      sourceGuildId: record.sourceGuildId,
      targetLabel: record.targetLabel,
      tier: record.tier,
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
      settings: (record.settings as ServerFeatureSettings) ?? defaultServerFeatureSettings,
    } satisfies IncidentMirrorRecord
  } catch (error) {
    logDbError("[VectoBeat] Failed to load incident mirror:", error)
    return null
  }
}

export type ApiTokenEventRecord = {
  id: string
  guildId: string
  tokenId: string
  action: string
  actorId: string | null
  actorName: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

export type ApiTokenEventInput = {
  guildId: string
  tokenId: string
  action: string
  actorId: string | null
  actorName: string | null
  metadata?: Record<string, any> | null
}

export const recordApiTokenEvent = async (payload: ApiTokenEventInput): Promise<void> => {
  try {
    const db = getPool()
    if (!db) return
    await db.apiTokenEvent.create({
      data: {
        guildId: payload.guildId,
        tokenId: payload.tokenId,
        action: payload.action,
        actorId: payload.actorId,
        actorName: payload.actorName,
        metadata: payload.metadata as Prisma.JsonObject | undefined,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to record API token event:", error)
  }
}

export const listApiTokenEvents = async (guildId: string, limit = 15): Promise<ApiTokenEventRecord[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.apiTokenEvent.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return rows.map((row) => ({
      id: row.id,
      guildId: row.guildId,
      tokenId: row.tokenId,
      action: row.action,
      actorId: row.actorId,
      actorName: row.actorName,
      metadata: (row.metadata as Record<string, any> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list API token events:", error)
    return []
  }
}

export type SecurityAuditEventRecord = {
  id: string
  type: "command" | "api" | "admin"
  source: string
  actorId: string | null
  actorName: string | null
  description: string | null
  createdAt: string
  metadata: Record<string, any> | null
}

type SecurityAuditOptions = {
  limit?: number
  from?: Date | null
  to?: Date | null
  actor?: string | null
  type?: "command" | "api" | "admin"
}

export const listSecurityAuditEvents = async (
  guildId: string,
  options: SecurityAuditOptions = {},
): Promise<SecurityAuditEventRecord[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const limit = Math.max(25, Math.min(500, options.limit ?? 100))
    const fetchSpan = Math.min(400, limit * 2)
    const actorFilter = options.actor?.toLowerCase().trim() || null

    const automationWhere: Prisma.AutomationActionWhereInput = { guildId }
    if (options.from || options.to) {
      automationWhere.createdAt = {}
      if (options.from) {
        automationWhere.createdAt.gte = options.from
      }
      if (options.to) {
        automationWhere.createdAt.lte = options.to
      }
    }

    const apiWhere: Prisma.ApiTokenEventWhereInput = { guildId }
    if (options.from || options.to) {
      apiWhere.createdAt = {}
      if (options.from) {
        apiWhere.createdAt.gte = options.from
      }
      if (options.to) {
        apiWhere.createdAt.lte = options.to
      }
    }
    if (actorFilter) {
      apiWhere.OR = [
        { actorName: { contains: actorFilter } },
        { actorId: { contains: actorFilter } },
      ]
    }

    const [automationRows, apiRows] = await Promise.all([
      db.automationAction.findMany({
        where: automationWhere,
        orderBy: { createdAt: "desc" },
        take: fetchSpan,
      }),
      db.apiTokenEvent.findMany({
        where: apiWhere,
        orderBy: { createdAt: "desc" },
        take: fetchSpan,
      }),
    ])

    const automationEvents: SecurityAuditEventRecord[] = automationRows.map((row) => {
      const metadata = asJsonObject<Record<string, any>>(row.metadata) ?? null
      const actorName = typeof metadata?.actorName === "string" ? metadata.actorName : null
      const actorFromMeta =
        actorName ??
        (typeof metadata?.actor === "string" ? metadata.actor : null) ??
        (typeof metadata?.user === "string" ? metadata.user : null)
      const actorId =
        typeof metadata?.actorId === "string"
          ? metadata.actorId
          : typeof metadata?.userId === "string"
            ? metadata.userId
            : null
      return {
        id: `automation-${row.id}`,
        type: row.category === "throttle" ? "command" : "admin",
        source: row.action,
        actorId,
        actorName: actorFromMeta,
        description: row.description ?? null,
        createdAt: row.createdAt.toISOString(),
        metadata,
      }
    })

    const apiEvents: SecurityAuditEventRecord[] = apiRows.map((row) => {
      const metadata = asJsonObject<Record<string, any>>(row.metadata) ?? null
      const label = typeof metadata?.label === "string" ? metadata.label : null
      const description = label ? `Token ${label} ${row.action}` : `Token ${row.action}`
      return {
        id: `api-${row.id}`,
        type: "api",
        source: row.action,
        actorId: row.actorId ?? null,
        actorName: row.actorName ?? null,
        description,
        createdAt: row.createdAt.toISOString(),
        metadata,
      }
    })

    const matchesActor = (event: SecurityAuditEventRecord) => {
      if (!actorFilter) return true
      const values = [
        event.actorName,
        event.actorId,
        typeof event.metadata?.actor === "string" ? event.metadata.actor : null,
        typeof event.metadata?.actorId === "string" ? event.metadata.actorId : null,
        typeof event.metadata?.user === "string" ? event.metadata.user : null,
        typeof event.metadata?.userId === "string" ? event.metadata.userId : null,
      ]
      return values.some((value) => value?.toLowerCase().includes(actorFilter))
    }

    const combined = [...automationEvents, ...apiEvents]
      .filter((event) => (!options.type ? true : event.type === options.type))
      .filter(matchesActor)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
    return combined
  } catch (error) {
    logDbError("[VectoBeat] Failed to gather security audit events:", error)
    return []
  }
}

export type SecurityAccessLogRecord = {
  id: string
  type: "panel_login" | "api_token"
  actorId: string | null
  actorName: string | null
  source: string
  description: string | null
  ipAddress: string | null
  location: string | null
  userAgent: string | null
  createdAt: string
}

type SecurityAccessOptions = {
  limit?: number
  from?: Date | null
  to?: Date | null
  actor?: string | null
  includeDiscordId?: string | null
}

export const listSecurityAccessLogs = async (
  guildId: string,
  options: SecurityAccessOptions = {},
): Promise<SecurityAccessLogRecord[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const limit = Math.max(25, Math.min(500, options.limit ?? 100))
    const fetchSpan = Math.min(400, limit * 2)
    const actorFilter = options.actor?.toLowerCase().trim() || null

    const ownerRows = await db.subscription.findMany({
      where: { guildId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
      select: { discordId: true },
      distinct: ["discordId"],
    })
    const ownerIds = new Set<string>()
    ownerRows.forEach((row) => ownerIds.add(row.discordId))
    if (options.includeDiscordId) {
      ownerIds.add(options.includeDiscordId)
    }
    const ownerIdArray = Array.from(ownerIds)

    const loginWhere: Prisma.UserLoginEventWhereInput | null = ownerIdArray.length
      ? {
          discordId: { in: ownerIdArray },
          ...(options.from || options.to
            ? {
                createdAt: {
                  ...(options.from ? { gte: options.from } : {}),
                  ...(options.to ? { lte: options.to } : {}),
                },
              }
            : {}),
        }
      : null

    const loginRows = loginWhere
      ? await db.userLoginEvent.findMany({
          where: loginWhere,
          orderBy: { createdAt: "desc" },
          take: fetchSpan,
        })
      : []

    const profileMap = new Map<string, string>()
    if (ownerIdArray.length) {
      const profiles = await db.userProfile.findMany({
        where: { discordId: { in: ownerIdArray } },
        select: { discordId: true, displayName: true, username: true },
      })
      profiles.forEach((profile) => {
        const name = profile.displayName || profile.username || profile.discordId
        profileMap.set(profile.discordId, name)
      })
    }

    const loginEvents: SecurityAccessLogRecord[] = loginRows.map((row) => ({
      id: `login-${row.id}`,
      type: "panel_login",
      actorId: row.discordId,
      actorName: profileMap.get(row.discordId) || row.discordId,
      source: "control-panel",
      description: row.notified ? "Login (alert sent)" : "Login",
      ipAddress: row.ipAddress ?? null,
      location: row.location ?? null,
      userAgent: row.userAgent ?? null,
      createdAt: row.createdAt.toISOString(),
    }))

    const apiWhere: Prisma.ApiTokenEventWhereInput = {
      guildId,
      action: "used",
      ...(options.from || options.to
        ? {
            createdAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    }
    if (actorFilter) {
      apiWhere.OR = [
        { actorName: { contains: actorFilter } },
        { actorId: { contains: actorFilter } },
      ]
    }

    const apiRows = await db.apiTokenEvent.findMany({
      where: apiWhere,
      orderBy: { createdAt: "desc" },
      take: fetchSpan,
    })

    const apiEvents: SecurityAccessLogRecord[] = apiRows.map((row) => {
      const metadata = asJsonObject<Record<string, any>>(row.metadata) ?? {}
      const tokenLabel =
        (typeof metadata?.tokenLabel === "string" && metadata.tokenLabel) ||
        (typeof metadata?.label === "string" && metadata.label) ||
        null
      const source = typeof metadata?.endpoint === "string" ? metadata.endpoint : row.action
      const description =
        typeof metadata?.description === "string"
          ? metadata.description
          : tokenLabel
            ? `Token ${tokenLabel} used`
            : "API token used"
      const ipAddress = typeof metadata?.ipAddress === "string" ? metadata.ipAddress : null
      const location = typeof metadata?.location === "string" ? metadata.location : null
      const userAgent = typeof metadata?.userAgent === "string" ? metadata.userAgent : null
      return {
        id: `api-${row.id}`,
        type: "api_token",
        actorId: row.tokenId,
        actorName: tokenLabel,
        source,
        description,
        ipAddress,
        location,
        userAgent,
        createdAt: row.createdAt.toISOString(),
      }
    })

    const matchesActor = (event: SecurityAccessLogRecord) => {
      if (!actorFilter) return true
      const values = [
        event.actorName,
        event.actorId,
        event.ipAddress,
        event.location,
        event.source,
      ]
      return values.some((value) => value?.toLowerCase().includes(actorFilter))
    }

    const loginFiltered = loginEvents.filter(matchesActor)
    const apiFiltered = apiEvents.filter(matchesActor)

    const combined = [...loginFiltered, ...apiFiltered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)

    return combined
  } catch (error) {
    logDbError("[VectoBeat] Failed to list security access logs:", error)
    return []
  }
}

export type QueueActionExport = {
  id: string
  action: string
  category: string | null
  description: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

export const listQueueActionsForExport = async (guildId: string, limit = 500): Promise<QueueActionExport[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.automationAction.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      category: row.category,
      description: row.description,
      metadata: (row.metadata as Record<string, any> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list automation actions:", error)
    return []
  }
}

export type ModerationEventExport = {
  id: string
  type: string
  name: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

export const listModerationEventsForExport = async (
  guildId: string,
  limit = 500,
): Promise<ModerationEventExport[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.botActivityEvent.findMany({
      where: {
        OR: [
          { guildId },
          { guildId: null },
        ],
        type: { contains: "moderation" },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      metadata: (row.metadata as Record<string, any> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list moderation events:", error)
    return []
  }
}

export type BillingEntryExport = {
  id: string
  guildId: string
  tier: string
  status: string
  amount: string
  currency: string
  periodStart: string
  periodEnd: string
}

export const listBillingEntriesForExport = async (
  guildId: string,
  limit = 120,
): Promise<BillingEntryExport[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.subscription.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return rows.map((row) => ({
      id: row.id,
      guildId: row.guildId,
      tier: row.tier,
      status: row.status,
      amount: row.monthlyPrice?.toString() ?? "0",
      currency: "USD",
      periodStart: row.currentPeriodStart.toISOString(),
      periodEnd: row.currentPeriodEnd.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list billing entries:", error)
    return []
  }
}

const calculateReadTime = (content: string | null | undefined) => {
  if (!content) {
    return "1 min read"
  }
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~]/g, " ")
  const words = plain.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} min read`
}

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  author: string
  category: string
  readTime: string | null
  views: number
  featured: boolean
  publishedAt: string
  image?: string | null
}

export type BlogReactionType = "up" | "down"

export interface BlogReactionSummary {
  up: number
  down: number
}

export interface BlogComment {
  id: string
  postId: string
  authorId: string
  author: string
  body: string
  createdAt: string
}

interface BlogPostRow {
  id: string
  slug: string
  title: string
  excerpt: string | null
  content: string
  author: string
  category: string | null
  readTime: string | null
  views: number
  featured: boolean
  publishedAt: Date
  updatedAt: Date
}

interface BlogReactionRow {
  postIdentifier: string
  reaction: BlogReactionType
  count: number
}

interface BlogReactionVoteRow {
  postIdentifier: string
  authorId: string
  reaction: BlogReactionType
  createdAt: Date
}

const emptyReactions: BlogReactionSummary = { up: 0, down: 0 }

interface BlogCommentRow {
  id: string
  postIdentifier: string
  authorId: string
  author: string
  body: string
  createdAt: Date
}

const mapBlogPost = (row: BlogPostRow): BlogPost => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt || "",
  content: row.content,
  author: row.author,
  category: row.category || "General",
  readTime: calculateReadTime(row.content),
  views: row.views ?? 0,
  featured: row.featured ?? false,
  publishedAt: row.publishedAt.toISOString(),
})

export const getBlogPosts = async (): Promise<BlogPost[]> => {
  try {
    const db = getPool()
    if (!db) return []

    const posts = await db.blogPost.findMany({
      orderBy: { publishedAt: "desc" },
    })

    return posts.map((row) =>
      mapBlogPost({
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        content: row.content,
        author: row.author,
        category: row.category,
        readTime: row.readTime,
        views: row.views,
        featured: row.featured,
        publishedAt: row.publishedAt,
        updatedAt: row.updatedAt,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load blog posts:", error)
    return []
  }
}

export const getBlogPostByIdentifier = async (identifier: string): Promise<BlogPost | null> => {
  try {
    const db = getPool()
    if (!db) {
      return null
    }

    const post = await db.blogPost.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
    })

    if (!post) {
      return null
    }

    return mapBlogPost({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      author: post.author,
      category: post.category,
      readTime: post.readTime,
      views: post.views,
      featured: post.featured,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to load blog post:", error)
    return null
  }
}

interface BlogPostInput {
  id?: string
  slug: string
  title: string
  excerpt?: string
  content: string
  author: string
  category?: string
  featured?: boolean
}

const normalizeExcerpt = (excerpt?: string | null): string | null => {
  if (!excerpt) return null
  const trimmed = excerpt.trim()
  const MAX_LENGTH = 190
  if (trimmed.length <= MAX_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_LENGTH - 3).trimEnd()}...`
}

export const saveBlogPost = async (input: BlogPostInput): Promise<BlogPost | null> => {
  try {
    const db = getPool()
    if (!db) return null

    const computedReadTime = calculateReadTime(input.content)
    const baseData = {
      title: input.title,
      excerpt: normalizeExcerpt(input.excerpt),
      content: input.content,
      author: input.author,
      category: input.category || null,
      readTime: computedReadTime,
      featured: input.featured ?? false,
    }

    let record: BlogPostRow | null = null

    if (input.id) {
      try {
        const updated = await db.blogPost.update({
          where: { id: input.id },
          data: {
            slug: input.slug,
            ...baseData,
          },
        })
        record = {
          id: updated.id,
          slug: updated.slug,
          title: updated.title,
          excerpt: updated.excerpt,
          content: updated.content,
          author: updated.author,
          category: updated.category,
          readTime: updated.readTime,
          views: updated.views,
          featured: updated.featured,
          publishedAt: updated.publishedAt,
          updatedAt: updated.updatedAt,
        }
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")) {
          throw error
        }
      }
    }

    if (!record) {
      const created = await db.blogPost.upsert({
        where: { slug: input.slug },
        update: {
          title: baseData.title,
          excerpt: baseData.excerpt,
          content: baseData.content,
          author: baseData.author,
          category: baseData.category,
          readTime: baseData.readTime,
          featured: baseData.featured,
        },
        create: {
          id: input.id,
          slug: input.slug,
          ...baseData,
          publishedAt: new Date(),
        },
      })

      record = {
        id: created.id,
        slug: created.slug,
        title: created.title,
        excerpt: created.excerpt,
        content: created.content,
        author: created.author,
        category: created.category,
        readTime: created.readTime,
        views: created.views,
        featured: created.featured,
        publishedAt: created.publishedAt,
        updatedAt: created.updatedAt,
      }
    }

    return record ? mapBlogPost(record) : null
  } catch (error) {
    logDbError("[VectoBeat] Failed to save blog post:", error)
    return null
  }
}

export const deleteBlogPost = async (identifier: string) => {
  try {
    const db = getPool()
    if (!db) return false

    const result = await db.blogPost.deleteMany({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
    })

    return result.count > 0
  } catch (error) {
    logDbError("[VectoBeat] Failed to delete blog post:", error)
    return false
  }
}

export const incrementBlogViews = async (identifier: string) => {
  try {
    const db = getPool()
    if (!db) {
      return undefined
    }

    const existing = await db.blogPost.findFirst({
      where: { OR: [{ id: identifier }, { slug: identifier }] },
      select: { id: true },
    })

    if (!existing) {
      return undefined
    }

    const updated = await db.blogPost.update({
      where: { id: existing.id },
      data: { views: { increment: 1 } },
      select: { views: true },
    })

    return updated.views
  } catch (error) {
    logDbError("[VectoBeat] Failed to increment blog views:", error)
    return undefined
  }
}

export const getBlogReactions = async (postIdentifier: string): Promise<BlogReactionSummary> => {
  try {
    const db = getPool()
    if (!db) return emptyReactions

    const rows = await db.blogReaction.findMany({
      where: { postIdentifier },
    })

    return rows.reduce<BlogReactionSummary>(
      (acc, row) => ({
        ...acc,
        [row.reaction]: row.count,
      }),
      { ...emptyReactions },
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load blog reactions:", error)
    return emptyReactions
  }
}

export const getBlogReactionForUser = async (postIdentifier: string, authorId: string): Promise<BlogReactionType | null> => {
  try {
    const db = getPool()
    if (!db) return null

    const vote = await db.blogReactionVote.findUnique({
      where: {
        blog_reaction_votes_post_identifier_author_id_key: {
          postIdentifier,
          authorId,
        },
      },
      select: { reaction: true },
    })
    return vote?.reaction ?? null
  } catch (error) {
    logDbError("[VectoBeat] Failed to load blog reaction vote:", error)
    return null
  }
}

export const recordBlogReaction = async (
  postIdentifier: string,
  authorId: string,
  reaction: BlogReactionType,
): Promise<{ summary: BlogReactionSummary; alreadyReacted: boolean; userReaction: BlogReactionType | null }> => {
  try {
    const db = getPool()
    if (!db) {
      return { summary: emptyReactions, alreadyReacted: false, userReaction: null }
    }

    const existing = await db.blogReactionVote.findUnique({
      where: {
        blog_reaction_votes_post_identifier_author_id_key: {
          postIdentifier,
          authorId,
        },
      },
    })

    if (existing) {
      const summary = await getBlogReactions(postIdentifier)
      return { summary, alreadyReacted: true, userReaction: existing.reaction }
    }

    await db.$transaction(async (tx) => {
      await tx.blogReactionVote.create({
        data: {
          postIdentifier,
          authorId,
          reaction,
        },
      })

      await tx.blogReaction.upsert({
        where: {
          blog_reactions_post_identifier_reaction_key: {
            postIdentifier,
            reaction,
          },
        },
        update: { count: { increment: 1 } },
        create: {
          postIdentifier,
          reaction,
          count: 1,
        },
      })
    })

    const summary = await getBlogReactions(postIdentifier)
    return { summary, alreadyReacted: false, userReaction: reaction }
  } catch (error) {
    logDbError("[VectoBeat] Failed to add blog reaction:", error)
    return { summary: emptyReactions, alreadyReacted: false, userReaction: null }
  }
}

const mapBlogComment = (row: BlogCommentRow): BlogComment => ({
  id: row.id,
  postId: row.postIdentifier,
  authorId: row.authorId,
  author: row.author,
  body: row.body,
  createdAt: row.createdAt.toISOString(),
})

export const getBlogComments = async (postIdentifier: string): Promise<BlogComment[]> => {
  try {
    const db = getPool()
    if (!db) return []

    const comments = await db.blogComment.findMany({
      where: { postIdentifier },
      orderBy: { createdAt: "desc" },
      take: 200,
    })

    return comments.map((row) =>
      mapBlogComment({
        id: row.id,
        postIdentifier: row.postIdentifier,
        authorId: row.authorId,
        author: row.author,
        body: row.body,
        createdAt: row.createdAt,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load blog comments:", error)
    return []
  }
}

export const addBlogComment = async (
  postIdentifier: string,
  authorId: string,
  author: string,
  body: string,
): Promise<BlogComment | null> => {
  try {
    const db = getPool()
    if (!db) return null

    const trimmedAuthor = author.trim().slice(0, 120)
    const trimmedBody = body.trim().slice(0, 2000)

    if (!trimmedAuthor || !trimmedBody) {
      return null
    }

    const result = await db.blogComment.create({
      data: {
        postIdentifier,
        authorId,
        author: trimmedAuthor,
        body: trimmedBody,
      },
    })

    return mapBlogComment({
      id: result.id,
      postIdentifier: result.postIdentifier,
      authorId: result.authorId,
      author: result.author,
      body: result.body,
      createdAt: result.createdAt,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to add blog comment:", error)
    return null
  }
}

export const addNewsletterSubscriber = async (email: string, name?: string | null) => {
  try {
    const db = getPool()
    if (!db) return { created: false }

    await db.newsletterSubscriber.upsert({
      where: { email: email.trim().toLowerCase() },
      update: {},
      create: {
        email: email.trim().toLowerCase(),
        name: name?.trim() || null,
      },
    })

    return { created: true }
  } catch (error) {
    logDbError("[VectoBeat] Failed to add newsletter subscriber:", error)
    return { created: false }
  }
}

interface NewsletterCampaignRecord {
  id: string
  subject: string
  body: string
  sentBy: string | null
  sentAt: Date | null
  recipientCount: number | null
}

const mapCampaign = (row: NewsletterCampaignRecord) => ({
  id: row.id,
  subject: row.subject,
  body: row.body,
  sentBy: row.sentBy,
  sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  recipientCount: row.recipientCount ?? 0,
})

export const listNewsletterCampaigns = async () => {
  try {
    const db = getPool()
    if (!db) return []

    const campaigns = await db.newsletterCampaign.findMany({
      orderBy: [
        { sentAt: "desc" },
        { createdAt: "desc" },
      ],
    })

    return campaigns.map((row) =>
      mapCampaign({
        id: row.id,
        subject: row.subject,
        body: row.body,
        sentBy: row.sentBy,
        sentAt: row.sentAt,
        recipientCount: row.recipientCount,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load newsletter campaigns:", error)
    return []
  }
}

export const createNewsletterCampaign = async ({
  subject,
  body,
  sentBy,
  recipientCountOverride,
}: {
  subject: string
  body: string
  sentBy?: string | null
  recipientCountOverride?: number
}) => {
  try {
    const db = getPool()
    if (!db) return null

    const recipientCount =
      typeof recipientCountOverride === "number" ? recipientCountOverride : await db.newsletterSubscriber.count()

    const result = await db.newsletterCampaign.create({
      data: {
        subject,
        body,
        sentBy: sentBy || null,
        sentAt: new Date(),
        recipientCount,
      },
    })

    console.log("[VectoBeat] Newsletter dispatched", {
      subject,
      recipients: recipientCount,
    })

    return mapCampaign({
      id: result.id,
      subject: result.subject,
      body: result.body,
      sentBy: result.sentBy,
      sentAt: result.sentAt,
      recipientCount: result.recipientCount,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to create newsletter campaign:", error)
    return null
  }
}

export const listNewsletterSubscribers = async () => {
  try {
    const db = getPool()
    if (!db) return []

    const rows = await db.newsletterSubscriber.findMany({
      select: { email: true, name: true },
      orderBy: { subscribedAt: "asc" },
    })

    return rows.map((row) => ({
      email: row.email,
      name: row.name,
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to load newsletter subscribers:", error)
    return []
  }
}

interface ContactMessageRecord {
  id: string
  name: string
  email: string
  company: string | null
  topic: string | null
  priority: string
  subject: string | null
  message: string
  status: string
  response: string | null
  respondedBy: string | null
  respondedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface ContactMessageThreadRecord {
  id: string
  ticketId: string
  authorId: string | null
  authorName: string | null
  role: string
  body: string
  attachments: Prisma.JsonValue | null
  createdAt: Date
}

const mapContactMessage = (row: ContactMessageRecord) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  company: row.company,
  topic: row.topic,
  priority: row.priority,
  subject: row.subject,
  message: row.message,
  status: row.status,
  response: row.response,
  respondedBy: row.respondedBy,
  respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const buildContactCategoryWhere = (
  scope?: "contact" | "ticket",
): Prisma.ContactMessageWhereInput | undefined => {
  const partnerPredicate: Prisma.ContactMessageWhereInput = {
    OR: [
      { topic: { contains: "partner" } },
      { subject: { contains: "partner" } },
      { status: { in: ["waiting", "accepted", "declined"] } },
    ],
  }

  if (!scope) return undefined
  if (scope === "ticket") {
    return {
      OR: [
        { conversation: { some: {} } },
        { subject: { contains: "Ticket" } },
        { subject: { contains: "ticket" } },
        partnerPredicate,
      ],
    }
  }
  return {
    AND: [
      { conversation: { none: {} } },
      {
        NOT: {
          OR: [
            { subject: { contains: "Ticket" } },
            { subject: { contains: "ticket" } },
            partnerPredicate,
          ],
        },
      },
    ],
  }
}

const mapContactMessageThread = (row: ContactMessageThreadRecord) => ({
  id: row.id,
  ticketId: row.ticketId,
  authorId: row.authorId,
  authorName: row.authorName,
  role: row.role,
  body: row.body,
  attachments: row.attachments,
  createdAt: row.createdAt.toISOString(),
})

export const createContactMessage = async ({
  name,
  email,
  company,
  topic,
  priority,
  subject,
  message,
  status,
}: {
  name: string
  email: string
  company?: string | null
  topic?: string | null
  priority?: string | null
  subject?: string | null
  message: string
  status?: string | null
}) => {
  try {
    const db = getPool()
    if (!db) return null

    const clampText = (value: string, limit: number) => {
      const text = value || ""
      return text.length > limit ? text.slice(0, limit) : text
    }
    // Reduce lengths to fit varchar columns in the current schema.
    const MAX_MESSAGE_LENGTH = 180
    const MAX_SUBJECT_LENGTH = 180

    const result = await db.contactMessage.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        company: company?.trim() || null,
        topic: topic?.trim() || null,
        priority: priority?.trim() || "normal",
        subject: clampText(subject || "", MAX_SUBJECT_LENGTH) || null,
        message: clampText(message, MAX_MESSAGE_LENGTH),
        status: status?.trim() || "open",
      },
    })

    return mapContactMessage({
      id: result.id,
      name: result.name,
      email: result.email,
      company: result.company,
      topic: result.topic,
      priority: result.priority,
      subject: result.subject,
      message: result.message,
      status: result.status,
      response: result.response,
      respondedBy: result.respondedBy,
      respondedAt: result.respondedAt,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to create contact message:", error)
    return null
  }
}

export const getContactMessageById = async (id: string) => {
  try {
    const db = getPool()
    if (!db) return null

    const record = await db.contactMessage.findUnique({
      where: { id },
    })

    if (!record) return null

    return mapContactMessage({
      id: record.id,
      name: record.name,
      email: record.email,
      company: record.company,
      topic: record.topic,
      priority: record.priority,
      subject: record.subject,
      message: record.message,
      status: record.status,
      response: record.response,
      respondedBy: record.respondedBy,
      respondedAt: record.respondedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to load contact message:", error)
    return null
  }
}

export const listContactMessages = async (options?: { scope?: "contact" | "ticket" }) => {
  try {
    const db = getPool()
    if (!db) return []

  const scopeFilter = buildContactCategoryWhere(options?.scope)
  const openStatuses = ["open", "waiting"]
  const openWhere: Prisma.ContactMessageWhereInput = scopeFilter
    ? { AND: [scopeFilter, { status: { in: openStatuses } }] }
    : { status: { in: openStatuses } }
  const otherWhere: Prisma.ContactMessageWhereInput = scopeFilter
    ? { AND: [scopeFilter, { NOT: { status: { in: openStatuses } } }] }
    : { NOT: { status: { in: openStatuses } } }

    const [openMessages, otherMessages] = await Promise.all([
      db.contactMessage.findMany({
        where: openWhere,
        orderBy: { createdAt: "desc" },
      }),
      db.contactMessage.findMany({
        where: otherWhere,
        orderBy: { createdAt: "desc" },
      }),
    ])

    return [...openMessages, ...otherMessages].map((row) =>
      mapContactMessage({
        id: row.id,
        name: row.name,
        email: row.email,
        company: row.company,
        topic: row.topic,
        priority: row.priority,
        subject: row.subject,
        message: row.message,
        status: row.status,
        response: row.response,
        respondedBy: row.respondedBy,
        respondedAt: row.respondedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load contact messages:", error)
    return []
  }
}

export const listContactMessagesByEmail = async (
  email: string,
  limit = 25,
  options?: { scope?: "contact" | "ticket" },
) => {
  try {
    const db = getPool()
    if (!db) return []

    const scopeFilter = buildContactCategoryWhere(options?.scope)
    const baseWhere: Prisma.ContactMessageWhereInput = {
      email: email.trim().toLowerCase(),
    }
    const where = scopeFilter ? { AND: [scopeFilter, baseWhere] } : baseWhere

    const result = await db.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return result.map((row) =>
      mapContactMessage({
        id: row.id,
        name: row.name,
        email: row.email,
        company: row.company,
        topic: row.topic,
        priority: row.priority,
        subject: row.subject,
        message: row.message,
        status: row.status,
        response: row.response,
        respondedBy: row.respondedBy,
        respondedAt: row.respondedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    )
  } catch (error) {
    logDbError("[VectoBeat] Failed to load contact messages by email:", error)
    return []
  }
}

export const updateContactMessage = async (
  id: string,
  updates: { status?: string; response?: string; respondedBy?: string | null; priority?: string | null },
) => {
  try {
    const db = getPool()
    if (!db) return null

    const result = await db.contactMessage.update({
      where: { id },
      data: {
        status: updates.status ?? undefined,
        response: updates.response ?? undefined,
        respondedBy: updates.respondedBy ?? undefined,
        respondedAt: updates.response ? new Date() : undefined,
        priority: updates.priority ?? undefined,
      },
    })

    return mapContactMessage({
      id: result.id,
      name: result.name,
      email: result.email,
      company: result.company,
      topic: result.topic,
      priority: result.priority,
      subject: result.subject,
      message: result.message,
      status: result.status,
      response: result.response,
      respondedBy: result.respondedBy,
      respondedAt: result.respondedAt,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to update contact message:", error)
    return null
  }
}

export const getContactMessageThread = async (id: string) => {
  try {
    const db = getPool()
    if (!db) return null

    const ticket = await db.contactMessage.findUnique({
      where: { id },
      include: { conversation: { orderBy: { createdAt: "asc" } } },
    })

    if (!ticket) return null

    return {
      ...mapContactMessage({
        id: ticket.id,
        name: ticket.name,
        email: ticket.email,
        company: ticket.company,
        topic: ticket.topic,
        priority: ticket.priority,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        response: ticket.response,
        respondedBy: ticket.respondedBy,
        respondedAt: ticket.respondedAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      }),
      messages: ticket.conversation.map((row) =>
        mapContactMessageThread({
          id: row.id,
          ticketId: row.ticketId,
          authorId: row.authorId,
          authorName: row.authorName,
          role: row.role,
          body: row.body,
          attachments: row.attachments,
          createdAt: row.createdAt,
        }),
      ),
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to load contact message thread:", error)
    return null
  }
}

export const appendContactMessageThread = async ({
  ticketId,
  authorId,
  authorName,
  role,
  body,
  attachments,
}: {
  ticketId: string
  authorId?: string | null
  authorName?: string | null
  role: string
  body: string
  attachments?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null
}) => {
  try {
    const db = getPool()
    if (!db) return null

    const clampText = (value: string, limit: number) => {
      const text = value || ""
      return text.length > limit ? text.slice(0, limit) : text
    }
    const MAX_BODY_LENGTH = 180

    const created = await db.contactMessageThread.create({
      data: {
        ticketId,
        authorId: authorId || null,
        authorName: authorName || null,
        role,
        body: clampText(body, MAX_BODY_LENGTH),
        attachments: attachments ?? Prisma.JsonNull,
      },
    })

    await db.contactMessage.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    })

    return mapContactMessageThread({
      id: created.id,
      ticketId: created.ticketId,
      authorId: created.authorId,
      authorName: created.authorName,
      role: created.role,
      body: created.body,
      attachments: created.attachments,
      createdAt: created.createdAt,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to append ticket message:", error)
    return null
  }
}

export type ForumCategoryRecord = {
  id: string
  title: string
  description: string | null
  slug: string
  threadCount: number
}

export type ForumThreadRecord = {
  id: string
  categoryId: string
  categorySlug?: string | null
  categoryTitle?: string | null
  title: string
  summary: string | null
  status: string
  authorId: string | null
  authorName: string | null
  tags: string[]
  replies: number
  lastReplyAt: string | null
  createdAt: string
}

export type ForumPostRecord = {
  id: string
  threadId: string
  authorId: string | null
  authorName: string | null
  role: string
  body: string
  createdAt: string
}

export type ForumEventRecord = {
  id: string
  action: string
  entityType: string
  entityId: string
  actorId: string | null
  actorName: string | null
  actorRole: string
  categorySlug: string | null
  threadId: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

export type ForumStats = {
  categories: number
  threads: number
  posts: number
  events24h: number
  posts24h: number
  threads24h: number
  activePosters24h: number
  lastEventAt: string | null
  topCategories: Array<{ title: string; slug: string; threads: number }>
}

const DEFAULT_FORUM_CATEGORIES: Array<{ title: string; slug: string; description: string }> = [
  {
    title: "Playbooks & Onboarding",
    slug: "playbooks",
    description: "Step-by-step playbooks for rolling out automation, onboarding soundpacks, and mod rituals.",
  },
  {
    title: "Automation Recipes",
    slug: "automation",
    description: "Automation snippets, triggers, and workflows that save your mods time every week.",
  },
  {
    title: "Status & Resilience",
    slug: "resilience",
    description: "Incident drills, failover configs, and lessons learned from the Self-Healing Voice Grid.",
  },
  {
    title: "Compliance & Safety",
    slug: "compliance",
    description: "Policy, consent, and safety guardrails for regulated or trust-sensitive communities.",
  },
  {
    title: "Release Previews",
    slug: "previews",
    description: "Closed preview threads for alpha/beta drops, feedback surveys, and rollout guides.",
  },
  {
    title: "Moderator Lounge",
    slug: "moderator-lounge",
    description: "Role-gated space for leads to compare templates, macros, and incident retros.",
  },
]

const seedForumCategories = async () => {
  try {
    const db = getPool()
    if (!db) return []
    const existing = await db.forumCategory.count()
    if (existing > 0) return []

    await db.forumCategory.createMany({
      data: DEFAULT_FORUM_CATEGORIES.map((entry) => ({
        title: entry.title,
        slug: entry.slug,
        description: entry.description,
      })),
      skipDuplicates: true,
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to seed forum categories:", error)
  }
  return []
}

export const listForumCategories = async (): Promise<ForumCategoryRecord[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.forumCategory.findMany({
      include: { threads: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    })
    if (!rows.length) {
      await seedForumCategories()
      return listForumCategories()
    }
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      slug: row.slug,
      threadCount: row.threads.length,
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list forum categories:", error)
    return []
  }
}

export const listForumThreads = async (categorySlug?: string): Promise<ForumThreadRecord[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const where = categorySlug ? { category: { slug: categorySlug } } : undefined
    const rows = await db.forumThread.findMany({
      where,
      include: { category: { select: { slug: true, title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    })
    return rows.map((row) => ({
      id: row.id,
      categoryId: row.categoryId,
      categorySlug: row.category?.slug ?? null,
      categoryTitle: row.category?.title ?? null,
      title: row.title,
      summary: row.summary ?? null,
      status: row.status,
      authorId: row.authorId ?? null,
      authorName: row.authorName ?? null,
      tags: (row.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      replies: row.replies,
      lastReplyAt: row.lastReplyAt ? row.lastReplyAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list forum threads:", error)
    return []
  }
}

export const updateForumThreadStatus = async (threadId: string, status: string): Promise<ForumThreadRecord | null> => {
  const normalizedStatus = normalizeInput(status ?? "", 32)
  if (!normalizedStatus) {
    return null
  }
  try {
    const db = getPool()
    if (!db) return null
    const updated = await db.forumThread.update({
      where: { id: threadId },
      data: { status: normalizedStatus },
      include: { category: { select: { slug: true, title: true } } },
    })
    return {
      id: updated.id,
      categoryId: updated.categoryId,
      categorySlug: updated.category?.slug ?? null,
      categoryTitle: updated.category?.title ?? null,
      title: updated.title,
      summary: updated.summary ?? null,
      status: updated.status,
      authorId: updated.authorId ?? null,
      authorName: updated.authorName ?? null,
      tags: (updated.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      replies: updated.replies,
      lastReplyAt: updated.lastReplyAt ? updated.lastReplyAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to update forum thread status:", error)
    return null
  }
}

export const listForumPosts = async (threadId: string): Promise<ForumPostRecord[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.forumPost.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      take: 50,
    })
    return rows.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      authorId: row.authorId ?? null,
      authorName: row.authorName ?? null,
      role: row.role,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list forum posts:", error)
    return []
  }
}

export const deleteForumThread = async (threadId: string) => {
  try {
    const db = getPool()
    if (!db) return false

    await db.forumPost.deleteMany({ where: { threadId } })
    await db.forumThread.delete({ where: { id: threadId } })
    return true
  } catch (error) {
    logDbError("[VectoBeat] Failed to delete forum thread:", error)
    return false
  }
}

export const deleteForumPost = async (postId: string) => {
  try {
    const db = getPool()
    if (!db) return false
    await db.forumPost.delete({ where: { id: postId } })
    return true
  } catch (error) {
    logDbError("[VectoBeat] Failed to delete forum post:", error)
    return false
  }
}

export const recordForumEvent = async (payload: {
  action: string
  entityType: string
  entityId: string
  actorId?: string | null
  actorName?: string | null
  actorRole?: string | null
  categorySlug?: string | null
  threadId?: string | null
  metadata?: Record<string, any> | null
}): Promise<void> => {
  try {
    const db = getPool()
    if (!db) return
    await db.forumEvent.create({
      data: {
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        actorId: payload.actorId ?? null,
        actorName: payload.actorName ?? null,
        actorRole: payload.actorRole ?? "member",
        categorySlug: payload.categorySlug ?? null,
        threadId: payload.threadId ?? null,
        metadata: (payload.metadata ?? {}) as Prisma.JsonObject,
      },
    })
  } catch (error) {
    logDbError("[VectoBeat] Failed to record forum event:", error)
  }
}

export const listForumEvents = async (
  limit = 50,
  options?: { sinceHours?: number; categorySlug?: string },
): Promise<ForumEventRecord[]> => {
  const since =
    options?.sinceHours && Number.isFinite(options.sinceHours) ? new Date(Date.now() - options.sinceHours * 3_600_000) : null
  try {
    const db = getPool()
    if (!db) return []
    const rows = await db.forumEvent.findMany({
      where: {
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(options?.categorySlug ? { categorySlug: options.categorySlug } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(limit, 200)),
    })
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId ?? null,
      actorName: row.actorName ?? null,
      actorRole: row.actorRole,
      categorySlug: row.categorySlug ?? null,
      threadId: row.threadId ?? null,
      metadata: (row.metadata as Record<string, any> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list forum events:", error)
    return []
  }
}

export const getForumStats = async (): Promise<ForumStats> => {
  try {
    const db = getPool()
    if (!db) {
      return {
        categories: 0,
        threads: 0,
        posts: 0,
        events24h: 0,
        posts24h: 0,
        threads24h: 0,
        activePosters24h: 0,
        lastEventAt: null,
        topCategories: [],
      }
    }

    const now = new Date()
    const since = new Date(now.getTime() - 24 * 3_600_000)
    const [categories, threads, posts, events24h, posts24h, threads24h, eventsLatest, categoryCounts] = await Promise.all([
      db.forumCategory.count(),
      db.forumThread.count(),
      db.forumPost.count(),
      db.forumEvent.count({ where: { createdAt: { gte: since } } }),
      db.forumPost.count({ where: { createdAt: { gte: since } } }),
      db.forumThread.count({ where: { createdAt: { gte: since } } }),
      db.forumEvent.findFirst({ orderBy: { createdAt: "desc" } }),
      db.forumCategory.findMany({
        select: { id: true, title: true, slug: true, threads: { select: { id: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ])

    const activePosters24h = await db.forumPost.groupBy({
      by: ["authorId"],
      where: { createdAt: { gte: since }, authorId: { not: null } },
      _count: { authorId: true },
    })

    return {
      categories,
      threads,
      posts,
      events24h,
      posts24h,
      threads24h,
      activePosters24h: activePosters24h.length,
      lastEventAt: eventsLatest?.createdAt ? eventsLatest.createdAt.toISOString() : null,
      topCategories: categoryCounts
        .map((entry) => ({ title: entry.title, slug: entry.slug, threads: entry.threads.length }))
        .sort((a, b) => b.threads - a.threads)
        .slice(0, 6),
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to compute forum stats:", error)
    return {
      categories: 0,
      threads: 0,
      posts: 0,
      events24h: 0,
      posts24h: 0,
      threads24h: 0,
      activePosters24h: 0,
      lastEventAt: null,
      topCategories: [],
    }
  }
}

export const createForumThread = async (payload: {
  categorySlug: string
  title: string
  summary?: string | null
  tags?: string[]
  authorId?: string | null
  authorName?: string | null
  body?: string | null
}): Promise<ForumThreadRecord | null> => {
  const title = normalizeInput(payload.title, 200)
  if (!title) return null
  const summary = normalizeInput(payload.summary ?? null, 400)
  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .map((tag) => normalizeInput(tag, 48))
        .filter((value): value is string => Boolean(value))
    : []
  const authorId = normalizeInput(payload.authorId ?? null, 64)
  const authorName = normalizeInput(payload.authorName ?? null, 80)
  const body = normalizeInput(payload.body ?? null, 5000)

  try {
    const db = getPool()
    if (!db) return null
    await seedForumCategories()
    const category =
      (await db.forumCategory.findUnique({ where: { slug: payload.categorySlug } })) ||
      (await db.forumCategory.findFirst())
    if (!category) return null

    const thread = await db.$transaction(async (tx) => {
      const created = await tx.forumThread.create({
        data: {
          categoryId: category.id,
          title,
          summary,
          status: "open",
          authorId,
          authorName,
          tags: tags.join(","),
          replies: body ? 1 : 0,
          lastReplyAt: body ? new Date() : null,
        },
      })
      if (body) {
        await tx.forumPost.create({
          data: {
            threadId: created.id,
            authorId,
            authorName,
            body,
            role: "member",
          },
        })
      }
      return created
    })

    void recordForumEvent({
      action: "thread_created",
      entityType: "thread",
      entityId: thread.id,
      actorId: authorId,
      actorName: authorName,
      actorRole: "member",
      categorySlug: category.slug,
      threadId: thread.id,
      metadata: { tags },
    })

    return {
      id: thread.id,
      categoryId: thread.categoryId,
      title: thread.title,
      summary: thread.summary ?? null,
      status: thread.status,
      authorId: thread.authorId ?? null,
      authorName: thread.authorName ?? null,
      tags,
      replies: thread.replies,
      lastReplyAt: thread.lastReplyAt ? thread.lastReplyAt.toISOString() : null,
      createdAt: thread.createdAt.toISOString(),
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to create forum thread:", error)
    return null
  }
}

export const createForumPost = async (payload: {
  threadId: string
  body: string
  authorId?: string | null
  authorName?: string | null
  role?: string | null
}): Promise<ForumPostRecord | null> => {
  const body = normalizeInput(payload.body, 5000)
  if (!body) return null
  const role = normalizeInput(payload.role ?? "member", 32) ?? "member"
  const authorId = normalizeInput(payload.authorId ?? null, 64)
  const authorName = normalizeInput(payload.authorName ?? null, 80)
  try {
    const db = getPool()
    if (!db) return null
    const thread = await db.forumThread.findUnique({
      where: { id: payload.threadId },
      include: { category: { select: { slug: true } } },
    })
    if (!thread) return null

    const record = await db.$transaction(async (tx) => {
      const post = await tx.forumPost.create({
        data: {
          threadId: payload.threadId,
          body,
          authorId,
          authorName,
          role,
        },
      })
      await tx.forumThread.update({
        where: { id: payload.threadId },
        data: {
          replies: { increment: 1 },
          lastReplyAt: new Date(),
        },
      })
      return post
    })

    void recordForumEvent({
      action: "post_created",
      entityType: "post",
      entityId: record.id,
      actorId: authorId,
      actorName: authorName,
      actorRole: role,
      categorySlug: thread.category?.slug ?? null,
      threadId: record.threadId,
    })

    return {
      id: record.id,
      threadId: record.threadId,
      authorId: record.authorId ?? null,
      authorName: record.authorName ?? null,
      role: record.role,
      body: record.body,
      createdAt: record.createdAt.toISOString(),
    }
  } catch (error) {
    logDbError("[VectoBeat] Failed to create forum post:", error)
    return null
  }
}

export type SupportKnowledgeArticle = {
  id: string
  subject: string
  summary: string
  status: string
  priority: string | null
  resolvedAt: string | null
  updatedAt: string
  category: string | null
}

export const listSupportKnowledgeBase = async (limit = 6): Promise<SupportKnowledgeArticle[]> => {
  try {
    const db = getPool()
    if (!db) return []
    const statuses = ["resolved", "closed", "solved"]
    const rows = await db.contactMessage.findMany({
      where: { status: { in: statuses } },
      orderBy: { updatedAt: "desc" },
      take: Math.max(1, Math.min(limit, 12)),
    })
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject ?? row.topic ?? "Ticket",
      summary: (row.response || row.message || "").slice(0, 240) || "Resolved ticket",
      status: row.status,
      priority: row.priority ?? null,
      resolvedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
      category: row.topic ?? null,
    }))
  } catch (error) {
    logDbError("[VectoBeat] Failed to list support KB entries:", error)
    return []
  }
}
