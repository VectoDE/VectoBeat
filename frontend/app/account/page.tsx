"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import type { LucideIcon } from "lucide-react"
import {
  User,
  Lock,
  Shield,
  Bell,
  CreditCard,
  LogOut,
  Link2 as LinkIcon,
  SlidersHorizontal,
  Youtube,
  Instagram,
  Twitter,
  Twitch,
  Github,
  Gitlab,
  Slack,
  Music4,
  Gamepad2,
  Flame,
  Joystick,
  SquareKanban,
} from "lucide-react"
import { buildDiscordLoginUrl } from "@/lib/config"

const PREFERENCE_DEFAULTS = {
  preferredLanguage: "en",
}

const NOTIFICATION_DEFAULTS = {
  maintenanceAlerts: true,
  downtimeAlerts: true,
  releaseNotes: true,
  securityNotifications: true,
  betaProgram: false,
  communityEvents: false,
}

const PRIVACY_DEFAULTS = {
  profilePublic: false,
  searchVisibility: true,
  analyticsOptIn: false,
  dataSharing: false,
}

const PROFILE_FORM_DEFAULTS = {
  displayName: "",
  headline: "",
  bio: "",
  location: "",
  website: "",
  handle: "",
}

const SECURITY_DEFAULTS = {
  twoFactorEnabled: false,
  loginAlerts: true,
  backupCodesRemaining: 5,
  activeSessions: 1,
  lastPasswordChange: null as string | null,
}

type LinkedProviderDefinition = {
  value: string
  label: string
  icon: LucideIcon
  placeholder: string
  helper?: string
  urlBased?: boolean
}

const buildGuildManageHref = (guildId?: string | null) => {
  if (typeof guildId !== "string" || !guildId.trim()) {
    return "/control-panel"
  }
  return `/control-panel?guild=${encodeURIComponent(guildId)}`
}

const LINKED_ACCOUNT_PROVIDERS: LinkedProviderDefinition[] = [
  {
    value: "youtube",
    label: "YouTube Channel",
    icon: Youtube,
    placeholder: "youtube.com/@vectobeat",
    helper: "Paste the channel URL or handle that should appear on your profile.",
    urlBased: true,
  },
  {
    value: "instagram",
    label: "Instagram",
    icon: Instagram,
    placeholder: "instagram.com/your-handle",
    urlBased: true,
  },
  {
    value: "x",
    label: "X (Twitter)",
    icon: Twitter,
    placeholder: "x.com/your-handle",
    urlBased: true,
  },
  {
    value: "tiktok",
    label: "TikTok",
    icon: Music4,
    placeholder: "tiktok.com/@your-handle",
    urlBased: true,
  },
  {
    value: "twitch",
    label: "Twitch",
    icon: Twitch,
    placeholder: "twitch.tv/channel",
    urlBased: true,
  },
  {
    value: "faceit",
    label: "FACEIT",
    icon: Flame,
    placeholder: "faceit.com/en/players/handle",
    urlBased: true,
  },
  {
    value: "steam",
    label: "Steam",
    icon: Gamepad2,
    placeholder: "steamcommunity.com/id/handle",
    urlBased: true,
  },
  {
    value: "github",
    label: "GitHub",
    icon: Github,
    placeholder: "github.com/username",
    urlBased: true,
  },
  {
    value: "gitlab",
    label: "GitLab",
    icon: Gitlab,
    placeholder: "gitlab.com/username",
    urlBased: true,
  },
  {
    value: "slack",
    label: "Slack Workspace",
    icon: Slack,
    placeholder: "workspace.slack.com",
    helper: "Use the workspace URL so we can deep-link teammates directly.",
    urlBased: true,
  },
  {
    value: "microsoft",
    label: "Microsoft (Teams/Azure)",
    icon: SquareKanban,
    placeholder: "tenant.onmicrosoft.com",
    urlBased: true,
  },
  {
    value: "discord_alt",
    label: "Secondary Discord ID",
    icon: Joystick,
    placeholder: "Discord user ID (snowflake)",
    helper: "Perfect for co-admins who help manage billing or automation.",
    urlBased: false,
  },
]

const DEFAULT_LINKED_PROVIDER = LINKED_ACCOUNT_PROVIDERS[0]?.value ?? "discord_alt"

const formatProviderLabel = (value: string) =>
  value
    .split(/[_-]/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ")

const maskDiscordId = (value: string) => {
  if (!value) return ""
  if (value.length <= 4) {
    return "*".repeat(Math.max(value.length, 1))
  }
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`
}

type NotificationState = typeof NOTIFICATION_DEFAULTS
type PrivacyState = typeof PRIVACY_DEFAULTS
type SecurityState = typeof SECURITY_DEFAULTS
type ActiveSessionState = {
  id: string
  ipAddress: string | null
  userAgent: string | null
  location: string | null
  createdAt: string
  lastActive: string
  revoked: boolean
}

type AccountSubscription = {
  id: string
  name: string
  tier: string
  status: string
  currentPeriodStart: string
  currentPeriodEnd: string
  pricePerMonth: number
  discordServerId: string
  stripeCustomerId?: string | null
}

const RENEWAL_NOTICE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

const shouldShowRenewalPrompt = (subscription: AccountSubscription) => {
  if (!subscription) return false
  if (subscription.status === "canceled") return false
  if (subscription.status === "past_due") return true
  const endTimestamp = new Date(subscription.currentPeriodEnd).getTime()
  if (Number.isNaN(endTimestamp)) {
    return false
  }
  return endTimestamp - Date.now() <= RENEWAL_NOTICE_WINDOW_MS
}

const getTierBadgeColor = (tier: string) => {
  switch (tier) {
    case "starter":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30"
    case "pro":
      return "bg-primary/20 text-primary border-primary/30"
    case "enterprise":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30"
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30"
  }
}

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case "active":
      return "bg-green-500/20 text-green-500"
    case "canceled":
      return "bg-red-500/20 text-red-400"
    case "pending":
      return "bg-yellow-500/20 text-yellow-500"
    case "past_due":
      return "bg-orange-500/20 text-orange-500"
    default:
      return "bg-gray-500/20 text-gray-400"
  }
}

export default function AccountPage() {
  const appRouter = useRouter()
  const [activeTab, setActiveTab] = useState("profile")
  const [loading, setLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    phone: "",
    discordId: "",
  })
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [contactLoading, setContactLoading] = useState(false)
  const [contactSaving, setContactSaving] = useState(false)
  const [contactMessage, setContactMessage] = useState<string | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState(() => ({ ...PREFERENCE_DEFAULTS }))
  const [languageSaving, setLanguageSaving] = useState(false)
  const [languageError, setLanguageError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<NotificationState>(() => ({ ...NOTIFICATION_DEFAULTS }))
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [notificationsSaving, setNotificationsSaving] = useState(false)
  const [notificationsError, setNotificationsError] = useState<string | null>(null)
  const [privacy, setPrivacy] = useState<PrivacyState>(() => ({ ...PRIVACY_DEFAULTS }))
  const [privacyLoading, setPrivacyLoading] = useState(true)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [privacyError, setPrivacyError] = useState<string | null>(null)
  const [security, setSecurity] = useState<SecurityState>(() => ({ ...SECURITY_DEFAULTS }))
  const [securityLoading, setSecurityLoading] = useState(true)
  const [securitySaving, setSecuritySaving] = useState(false)
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ActiveSessionState[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [backupCodesVisible, setBackupCodesVisible] = useState(false)
  const [backupCodesLoading, setBackupCodesLoading] = useState(false)
  const [backupCodesFetched, setBackupCodesFetched] = useState(false)
  const [backupCodesError, setBackupCodesError] = useState<string | null>(null)
  const [downloadingData, setDownloadingData] = useState(false)
  const [linkedAccounts, setLinkedAccounts] = useState<
    Array<{ id: string; provider: string; handle: string; createdAt: string }>
  >([])
  const [linkedAccountsLoading, setLinkedAccountsLoading] = useState(true)
  const [linkedAccountsError, setLinkedAccountsError] = useState<string | null>(null)
const [linkedAccountForm, setLinkedAccountForm] = useState({
  provider: DEFAULT_LINKED_PROVIDER,
  handle: "",
})
const [linkedAccountSaving, setLinkedAccountSaving] = useState(false)
const [showPrimaryDiscordId, setShowPrimaryDiscordId] = useState(false)
const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileMeta, setProfileMeta] = useState<{ username: string; displayName: string; avatarUrl: string | null }>({
    username: "",
    displayName: "",
    avatarUrl: null,
  })
  const [guildMetrics, setGuildMetrics] = useState({
    membershipCount: 0,
    adminGuildCount: 0,
    botGuildCount: 0,
  })
  const [profileSettings, setProfileSettings] = useState({ ...PROFILE_FORM_DEFAULTS })
  const [profileSettingsLoading, setProfileSettingsLoading] = useState(false)
  const [profileSettingsSaving, setProfileSettingsSaving] = useState(false)
  const [profileSettingsError, setProfileSettingsError] = useState<string | null>(null)
const [subscriptions, setSubscriptions] = useState<AccountSubscription[]>([])
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true)
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null)
  const [renewingSubscriptionId, setRenewingSubscriptionId] = useState<string | null>(null)
const [subscriptionPreview, setSubscriptionPreview] = useState<AccountSubscription | null>(null)
  const subscriptionOwnerName = profileMeta.displayName || profileMeta.username || formData.username || "You"
  const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("de-DE") : "—")
  const formatEuros = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount)
  const handleSubscriptionPayment = useCallback(
    async (subscription: AccountSubscription) => {
      if (!formData.discordId) return
      setRenewingSubscriptionId(subscription.id)
      setSubscriptionsError(null)
      try {
        const response = await fetch("/api/billing/portal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discordId: formData.discordId }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Unable to open billing portal.")
        }
        const data = await response.json()
        if (!data?.url) {
          throw new Error("Billing portal unavailable.")
        }
        window.location.href = data.url
      } catch (error) {
        console.error("Failed to open billing portal:", error)
        setSubscriptionsError(error instanceof Error ? error.message : "Unable to open billing portal.")
      } finally {
        setRenewingSubscriptionId(null)
      }
    },
    [formData.discordId],
  )
  const loginHref =
    typeof window !== "undefined"
      ? buildDiscordLoginUrl(`${window.location.origin}/api/auth/discord/callback`)
      : buildDiscordLoginUrl()
  const profileShareSlug = (profileSettings.handle || profileMeta.username || formData.discordId || "").trim()
  const profileShareBase =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const profileShareUrl = profileShareSlug
    ? `${profileShareBase.replace(/\/$/, "")}/profile/${profileShareSlug}`
    : ""
  const activeLinkedProvider =
    LINKED_ACCOUNT_PROVIDERS.find((provider) => provider.value === linkedAccountForm.provider) ??
    LINKED_ACCOUNT_PROVIDERS[0]
  const otherDeviceCount = currentSessionId
    ? sessions.filter((session) => session.id !== currentSessionId).length
    : Math.max(sessions.length - (sessions.length ? 1 : 0), 0)

  const fetchContactInfo = useCallback(async (discordId: string) => {
    setContactLoading(true)
    setContactError(null)
    try {
      const response = await fetch(`/api/account/contact?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Failed to load contact info")
      }
      const data = await response.json()
      setFormData((prev) => ({
        ...prev,
        email: data.email || prev.email,
        phone: data.phone || prev.phone,
      }))
    } catch (error) {
      console.error("Failed to load contact info:", error)
      setContactError("Unable to load contact information")
    } finally {
      setContactLoading(false)
    }
  }, [])

  const handleSaveContact = useCallback(async () => {
    if (!formData.discordId) return
    setContactSaving(true)
    setContactMessage(null)
    setContactError(null)
    try {
      const response = await fetch("/api/account/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordId: formData.discordId,
          phone: formData.phone,
        }),
      })
      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error || "Failed to save contact info")
      }
      setContactMessage("Contact information updated")
    } catch (error) {
      console.error("Failed to save contact info:", error)
      setContactError(error instanceof Error ? error.message : "Failed to save contact information")
    } finally {
      setContactSaving(false)
    }
  }, [formData.discordId, formData.phone])

  const fetchProfileSettings = useCallback(async (discordId: string) => {
    setProfileSettingsLoading(true)
    setProfileSettingsError(null)
    try {
      const response = await fetch(`/api/account/profile?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Failed to load profile settings")
      }
      const data = await response.json()
      setProfileSettings({
        displayName: data.displayName ?? "",
        headline: data.headline ?? "",
        bio: data.bio ?? "",
        location: data.location ?? "",
        website: data.website ?? "",
        handle: data.handle ?? "",
      })
      setProfileMeta((prev) => ({
        ...prev,
        displayName: data.displayName || prev.displayName,
        username: data.username || prev.username,
        avatarUrl: data.avatarUrl ?? prev.avatarUrl,
      }))
    } catch (error) {
      console.error("Failed to load profile settings:", error)
      setProfileSettingsError("Unable to load profile settings")
    } finally {
      setProfileSettingsLoading(false)
    }
  }, [])

  const handleSaveProfileSettings = useCallback(async () => {
    if (!formData.discordId) return
    setProfileSettingsSaving(true)
    setProfileSettingsError(null)
    setProfileMessage(null)
    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordId: formData.discordId,
          ...profileSettings,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update profile")
      }
      setProfileSettings({
        displayName: payload.displayName ?? "",
        headline: payload.headline ?? "",
        bio: payload.bio ?? "",
        location: payload.location ?? "",
        website: payload.website ?? "",
        handle: payload.handle ?? "",
      })
      setProfileMeta((prev) => ({
        ...prev,
        displayName: payload.displayName || prev.displayName,
        username: payload.username || prev.username,
        avatarUrl: payload.avatarUrl ?? prev.avatarUrl,
      }))
      setProfileMessage("Profile updated successfully.")
    } catch (error) {
      console.error("Failed to update profile settings:", error)
      setProfileSettingsError(error instanceof Error ? error.message : "Unable to update profile settings.")
    } finally {
      setProfileSettingsSaving(false)
    }
  }, [formData.discordId, profileSettings])

  const fetchLinkedAccounts = useCallback(async (discordId: string) => {
    setLinkedAccountsLoading(true)
    setLinkedAccountsError(null)
    try {
      const response = await fetch(`/api/account/linked-accounts?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Failed to load linked accounts")
      }
      const data = await response.json()
      setLinkedAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    } catch (error) {
      console.error("Failed to load linked accounts:", error)
      setLinkedAccountsError("Unable to load linked accounts")
    } finally {
      setLinkedAccountsLoading(false)
    }
  }, [])

  const handleAddLinkedAccount = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!formData.discordId || !linkedAccountForm.handle.trim()) {
        return
      }
      setLinkedAccountSaving(true)
      setLinkedAccountsError(null)
      try {
        const providerConfig =
          LINKED_ACCOUNT_PROVIDERS.find((provider) => provider.value === linkedAccountForm.provider) ??
          LINKED_ACCOUNT_PROVIDERS[0]
        let normalizedHandle = linkedAccountForm.handle.trim()
        if (providerConfig?.urlBased && normalizedHandle && !/^https?:\/\//i.test(normalizedHandle)) {
          normalizedHandle = `https://${normalizedHandle}`
        }
        const response = await fetch("/api/account/linked-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discordId: formData.discordId,
            provider: linkedAccountForm.provider,
            handle: normalizedHandle,
            metadata: {
              urlBased: providerConfig?.urlBased ?? false,
              label: providerConfig?.label,
            },
          }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || "Failed to add linked account")
        }
        const data = await response.json()
        setLinkedAccounts(Array.isArray(data.accounts) ? data.accounts : [])
        setLinkedAccountForm((prev) => ({ ...prev, handle: "" }))
      } catch (error) {
        console.error("Failed to add linked account:", error)
        setLinkedAccountsError(error instanceof Error ? error.message : "Unable to add linked account")
      } finally {
        setLinkedAccountSaving(false)
      }
    },
    [formData.discordId, linkedAccountForm.handle, linkedAccountForm.provider],
  )

  const handleRemoveLinkedAccount = useCallback(
    async (accountId: string) => {
      if (!formData.discordId) return
      setLinkedAccountSaving(true)
      setLinkedAccountsError(null)
      try {
        const response = await fetch("/api/account/linked-accounts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discordId: formData.discordId, accountId }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || "Failed to remove linked account")
        }
        const data = await response.json()
        setLinkedAccounts(Array.isArray(data.accounts) ? data.accounts : [])
      } catch (error) {
        console.error("Failed to remove linked account:", error)
        setLinkedAccountsError(error instanceof Error ? error.message : "Unable to remove linked account")
      } finally {
        setLinkedAccountSaving(false)
      }
    },
    [formData.discordId],
  )

  const handleTogglePrimaryDiscordId = useCallback(() => {
    if (!formData.discordId) return
    setShowPrimaryDiscordId((prev) => !prev)
  }, [formData.discordId])

  const handleCopyProfileLink = useCallback(() => {
    if (!profileShareUrl) return
    navigator.clipboard
      ?.writeText(profileShareUrl)
      .then(() => setProfileMessage("Profile link copied to clipboard"))
      .catch(() => setProfileMessage("Unable to copy profile link at the moment."))
  }, [profileShareUrl])

  const fetchSubscriptions = useCallback(async (discordId: string) => {
    setSubscriptionsLoading(true)
    setSubscriptionsError(null)
    try {
      const response = await fetch(`/api/subscriptions?userId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Failed to load subscriptions")
      }
      const payload = await response.json()
      setSubscriptions(
        (payload?.subscriptions || []).map((sub: any) => ({
          id: sub.id,
          name: sub.name || "Unknown Server",
          tier: sub.tier,
          status: sub.status,
          currentPeriodStart: (sub.currentPeriodStart || sub.current_period_start)?.toString(),
          currentPeriodEnd: (sub.currentPeriodEnd || sub.current_period_end)?.toString(),
          pricePerMonth: Number(sub.pricePerMonth ?? sub.monthly_price ?? 0),
          discordServerId: sub.discordServerId || sub.guild_id,
          stripeCustomerId: sub.stripeCustomerId ?? sub.stripe_customer_id ?? null,
        })),
      )
    } catch (error) {
      console.error("Failed to load subscriptions:", error)
      setSubscriptions([])
      setSubscriptionsError("Unable to load subscriptions right now.")
    } finally {
      setSubscriptionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!formData.discordId) return
    fetchLinkedAccounts(formData.discordId)
  }, [fetchLinkedAccounts, formData.discordId])

  const fetchPreferences = useCallback(async (discordId: string) => {
    try {
      const response = await fetch(`/api/preferences?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Failed to load preferences")
      }
      const data = await response.json()
      setPreferences({
        ...PREFERENCE_DEFAULTS,
        ...data,
      })
      if (typeof window !== "undefined" && data?.preferredLanguage) {
        try {
          window.localStorage.setItem("preferred_language", data.preferredLanguage)
        } catch (error) {
          console.error("Failed to persist language preference locally:", error)
        }
      }
    } catch (error) {
      console.error("Failed to load preferences:", error)
    }
  }, [])

  const handleLanguageChange = useCallback(
    async (value: string) => {
      if (!formData.discordId) return
      setLanguageSaving(true)
      setLanguageError(null)
      try {
        const response = await fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discordId: formData.discordId,
            preferredLanguage: value,
          }),
        })
        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to update language preference")
        }
        setPreferences((prev) => ({ ...prev, preferredLanguage: value }))
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem("preferred_language", value)
          } catch (error) {
            console.error("Failed to persist language preference locally:", error)
          }
        }
      } catch (error) {
        console.error("Failed to update language preference:", error)
        setLanguageError("Failed to update language")
      } finally {
        setLanguageSaving(false)
      }
    },
    [formData.discordId],
  )

  const fetchNotifications = useCallback(async (discordId: string) => {
    setNotificationsLoading(true)
    setNotificationsError(null)
    try {
      const response = await fetch(`/api/account/notifications?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Failed to load notifications")
      const data = await response.json()
      setNotifications({
        ...NOTIFICATION_DEFAULTS,
        ...data,
      })
    } catch (error) {
      console.error("Failed to load notifications:", error)
      setNotificationsError("Unable to load notifications")
    } finally {
      setNotificationsLoading(false)
    }
  }, [])

  const handleNotificationToggle = useCallback(
    async (key: keyof NotificationState, value: boolean) => {
      if (!formData.discordId) return
      setNotifications((prev) => ({ ...prev, [key]: value }))
      setNotificationsSaving(true)
      setNotificationsError(null)
      try {
        const response = await fetch("/api/account/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discordId: formData.discordId,
            [key]: value,
          }),
        })
        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to update notifications")
        }
      } catch (error) {
        console.error("Failed to update notifications:", error)
        setNotificationsError("Failed to save notification settings")
      } finally {
        setNotificationsSaving(false)
      }
    },
    [formData.discordId],
  )

  const fetchPrivacy = useCallback(async (discordId: string) => {
    setPrivacyLoading(true)
    setPrivacyError(null)
    try {
      const response = await fetch(`/api/account/privacy?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Failed to load privacy settings")
      const data = await response.json()
      setPrivacy({
        ...PRIVACY_DEFAULTS,
        ...data,
      })
    } catch (error) {
      console.error("Failed to load privacy settings:", error)
      setPrivacyError("Unable to load privacy settings")
    } finally {
      setPrivacyLoading(false)
    }
  }, [])

  const handlePrivacyToggle = useCallback(
    async (key: keyof PrivacyState, value: boolean) => {
      if (!formData.discordId) return
      setPrivacy((prev) => ({ ...prev, [key]: value }))
      setPrivacySaving(true)
      setPrivacyError(null)
      try {
        const response = await fetch("/api/account/privacy", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discordId: formData.discordId,
            [key]: value,
          }),
        })
        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to update privacy settings")
        }
      } catch (error) {
        console.error("Failed to update privacy settings:", error)
        setPrivacyError("Failed to save privacy settings")
      } finally {
        setPrivacySaving(false)
      }
    },
    [formData.discordId],
  )

  const fetchSecurity = useCallback(async (discordId: string) => {
    setSecurityLoading(true)
    setSecurityError(null)
    try {
      const response = await fetch(`/api/account/security?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Failed to load security settings")
      const data = await response.json()
      setSecurity({
        ...SECURITY_DEFAULTS,
        ...data,
      })
    } catch (error) {
      console.error("Failed to load security settings:", error)
      setSecurityError("Unable to load security settings")
    } finally {
      setSecurityLoading(false)
    }
  }, [])

  const fetchSessions = useCallback(async (discordId: string, token?: string | null) => {
    setSessionsLoading(true)
    setSessionsError(null)
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const response = await fetch(`/api/account/security/sessions?discordId=${discordId}`, {
        headers,
        cache: "no-store",
        credentials: "include",
      })
      if (!response.ok) {
        throw new Error("Failed to load sessions")
      }
      const data = await response.json()
      const fetched: ActiveSessionState[] = Array.isArray(data.sessions)
        ? data.sessions.map((session: ActiveSessionState & { id: string }) => ({
            ...session,
            id: session.id,
          }))
        : []
      setSessions(fetched)
      setCurrentSessionId((prev) => {
        if (prev && fetched.some((session) => session.id === prev)) {
          return prev
        }
        return fetched[0]?.id ?? prev
      })
    } catch (error) {
      console.error("Failed to load sessions:", error)
      setSessionsError("Unable to load active sessions")
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const fetchBackupCodes = useCallback(
    async (discordId: string, token?: string | null) => {
      setBackupCodesLoading(true)
      setBackupCodesError(null)
      try {
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
        const response = await fetch(`/api/account/security/backup-codes?discordId=${discordId}`, {
          headers,
          cache: "no-store",
          credentials: "include",
        })
        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to load backup codes")
        }
        const data = await response.json()
        setBackupCodes(Array.isArray(data.codes) ? data.codes : [])
        setBackupCodesFetched(true)
      } catch (error) {
        console.error("Failed to load backup codes:", error)
        setBackupCodesError("Unable to fetch backup codes")
      } finally {
        setBackupCodesLoading(false)
      }
    },
    [],
  )

  const ensureTwoFactor = useCallback(
    (sessionData: { id: string; requiresTwoFactor?: boolean; username?: string }) => {
      if (!sessionData.requiresTwoFactor) {
        return true
      }
      const key = `two_factor_verified_${sessionData.id}`
      const timestamp = localStorage.getItem(key)
      if (timestamp && Date.now() - Number(timestamp) < 1000 * 60 * 30) {
        return true
      }
      appRouter.push(`/two-factor?context=login&username=${encodeURIComponent(sessionData.username || "VectoBeat")}`)
      return false
    },
    [appRouter],
  )

  const handleSecurityUpdate = useCallback(
    async (updates: Partial<typeof SECURITY_DEFAULTS>) => {
      if (!formData.discordId) return
      setSecurity((prev) => ({ ...prev, ...updates }))
      setSecuritySaving(true)
      setSecurityError(null)
      try {
        const response = await fetch("/api/account/security", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discordId: formData.discordId,
            ...updates,
            lastPasswordChange: updates.lastPasswordChange ?? SECURITY_DEFAULTS.lastPasswordChange,
          }),
        })
        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to update security settings")
        }
      } catch (error) {
        console.error("Failed to update security settings:", error)
        setSecurityError("Failed to save security settings")
      } finally {
        setSecuritySaving(false)
      }
    },
    [formData.discordId],
  )

  const handleDownloadData = useCallback(async () => {
    if (!formData.discordId) {
      setPrivacyError("You must be signed in to download your data.")
      return
    }
    setDownloadingData(true)
    setPrivacyError(null)
    try {
      const headers: Record<string, string> = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/account/export?discordId=${formData.discordId}`, {
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: "include",
      })
      if (!response.ok) {
        throw new Error("Failed to generate export")
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `vectobeat-data-${formData.discordId}.pdf`
      anchor.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to download export:", error)
      setPrivacyError("Unable to download your data export")
    } finally {
      setDownloadingData(false)
    }
  }, [formData.discordId, authToken])

  const handleRevealBackupCodes = useCallback(() => {
    if (!formData.discordId) {
      setBackupCodesError("Unable to reveal backup codes without a valid session.")
      return
    }
    setBackupCodesVisible((prev) => {
      const next = !prev
      if (next && !backupCodesFetched) {
        fetchBackupCodes(formData.discordId, authToken)
      }
      return next
    })
  }, [formData.discordId, authToken, backupCodesFetched, fetchBackupCodes])

  const handleRegenerateBackupCodes = useCallback(async () => {
    if (!formData.discordId) {
      setBackupCodesError("Unable to regenerate backup codes right now.")
      return
    }
    if (!window.confirm("Generate new backup codes? Existing codes will immediately stop working.")) {
      return
    }
    setBackupCodesLoading(true)
    setBackupCodesError(null)
    try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const response = await fetch("/api/account/security/backup-codes", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ discordId: formData.discordId }),
        })
      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error || "Failed to regenerate backup codes")
      }
      const data = await response.json()
      setBackupCodes(Array.isArray(data.codes) ? data.codes : [])
      setBackupCodesFetched(true)
      setBackupCodesVisible(true)
      fetchSecurity(formData.discordId)
    } catch (error) {
      console.error("Failed to regenerate backup codes:", error)
      setBackupCodesError(error instanceof Error ? error.message : "Failed to regenerate backup codes")
    } finally {
      setBackupCodesLoading(false)
    }
  }, [formData.discordId, authToken, fetchSecurity])

  const handleDownloadBackupCodes = useCallback(() => {
    if (!backupCodes.length) return
    const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "vectobeat-backup-codes.txt"
    anchor.click()
    window.URL.revokeObjectURL(url)
  }, [backupCodes])

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const tokenFromUrl = urlParams.get("token")
        const userIdFromUrl = urlParams.get("user_id")

        const storedToken = localStorage.getItem("discord_token") || undefined
        const storedUserId = localStorage.getItem("discord_user_id") || undefined
        const token = tokenFromUrl || storedToken
        const userId = userIdFromUrl || storedUserId

        if (tokenFromUrl && userIdFromUrl) {
          localStorage.setItem("discord_token", tokenFromUrl)
          localStorage.setItem("discord_user_id", userIdFromUrl)
          window.history.replaceState({}, document.title, window.location.pathname)
        }

        const response = await fetch("/api/verify-session", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "include",
        })

        if (!response.ok) {
          throw new Error("Session verification request failed")
        }

        const sessionData = await response.json()

        if (!sessionData?.authenticated) {
          throw new Error("unauthenticated")
        }

        if (!ensureTwoFactor(sessionData) || cancelled) {
          return
        }

        const resolvedUserId = sessionData.id || userId || ""
        if (!resolvedUserId) {
          throw new Error("Missing user identifier")
        }

        setIsAuthorized(true)
        setAuthError(null)
        if (token) {
          localStorage.setItem("discord_token", token)
        }
        localStorage.setItem("discord_user_id", resolvedUserId)
        setAuthToken(token ?? null)
        setCurrentSessionId(sessionData.currentSessionId ?? null)
        setFormData({
          email: sessionData.email ?? "",
          username: sessionData.username ?? "",
          phone: sessionData.phone ?? "",
          discordId: resolvedUserId,
        })
        setProfileMeta({
          username: sessionData.username ?? "",
          displayName: sessionData.displayName || sessionData.username || "",
          avatarUrl: sessionData.avatarUrl || null,
        })
        const membershipList = Array.isArray(sessionData.membershipGuilds)
          ? sessionData.membershipGuilds
          : Array.isArray(sessionData.guilds)
          ? sessionData.guilds
          : []
        const adminList = Array.isArray(sessionData.adminGuilds)
          ? sessionData.adminGuilds
          : membershipList.filter((guild: any) => guild.isAdmin)
        setGuildMetrics({
          membershipCount: sessionData.membershipCount ?? membershipList.length,
          adminGuildCount: sessionData.adminGuildCount ?? adminList.length,
          botGuildCount: sessionData.botGuildCount ?? adminList.filter((guild: any) => guild.hasBot).length,
        })

        void fetchContactInfo(resolvedUserId)
        void fetchPreferences(resolvedUserId)
        void fetchNotifications(resolvedUserId)
        void fetchPrivacy(resolvedUserId)
        void fetchSecurity(resolvedUserId)
        void fetchSubscriptions(resolvedUserId)
        void fetchProfileSettings(resolvedUserId)
      } catch (error) {
        console.error("Auth check failed:", error)
        localStorage.removeItem("discord_token")
        localStorage.removeItem("discord_user_id")
        if (!cancelled) {
          setIsAuthorized(false)
          setAuthError("Please sign in with Discord again to load your account.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void checkAuth()

    return () => {
      cancelled = true
    }
  }, [
    ensureTwoFactor,
    fetchContactInfo,
    fetchPreferences,
    fetchNotifications,
    fetchPrivacy,
    fetchSecurity,
    fetchSubscriptions,
    fetchProfileSettings,
  ])

  useEffect(() => {
    if (formData.discordId) {
      fetchSessions(formData.discordId, authToken)
    }
  }, [formData.discordId, authToken, fetchSessions])

  const handleLogout = useCallback(() => {
    localStorage.removeItem("discord_token")
    localStorage.removeItem("discord_user_id")
    setAuthToken(null)
    setIsAuthorized(false)
    appRouter.push("/")
  }, [appRouter])

  const handleSessionRevoke = useCallback(
    async (sessionId: string) => {
      if (!formData.discordId) {
        setSessionsError("Missing session context.")
        return
      }
      setSessionsError(null)
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const response = await fetch("/api/account/security/sessions", {
          method: "DELETE",
          headers,
          credentials: "include",
          body: JSON.stringify({ discordId: formData.discordId, sessionId }),
        })
        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to revoke session")
        }
        if (sessionId === currentSessionId) {
          handleLogout()
          return
        }
        fetchSessions(formData.discordId, authToken)
      } catch (error) {
        console.error("Failed to revoke session:", error)
        setSessionsError(error instanceof Error ? error.message : "Unable to revoke session")
      }
    },
    [formData.discordId, authToken, currentSessionId, handleLogout, fetchSessions],
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin mx-auto mb-4" />
            <p className="text-foreground/70">Loading your account...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex-1 w-full py-20 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4">Session Required</h1>
            <p className="text-foreground/70 mb-6">
              {authError || "Sign in with Discord to open your account settings."}
            </p>
            <a
              href={loginHref}
              className="inline-flex px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold"
            >
              Sign in with Discord
            </a>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />

      <div className="flex-1 w-full pt-24 pb-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Account Settings</h1>
            <p className="text-foreground/70">Manage your VectoBeat account and preferences</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar Navigation */}
            <div className="md:col-span-1">
              <nav className="space-y-2">
                {[
                  { id: "profile", label: "Profile", icon: User },
                  { id: "settings", label: "Preferences", icon: SlidersHorizontal },
                  { id: "subscriptions", label: "Billing", icon: CreditCard },
                  { id: "security", label: "Security", icon: Lock },
                  { id: "notifications", label: "Alerts", icon: Bell },
                  { id: "privacy", label: "Privacy", icon: Shield },
                  { id: "linked", label: "Integrations", icon: LinkIcon },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                      activeTab === id
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/70 hover:text-foreground hover:bg-card/50"
                    }`}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Content Area */}
            <div className="md:col-span-3">
              {/* Profile Tab */}
              {activeTab === "profile" && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-border/50 bg-card/30 p-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center text-2xl font-semibold text-primary">
                        {profileMeta.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profileMeta.avatarUrl}
                            alt={profileMeta.displayName || profileMeta.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          (profileMeta.displayName || profileMeta.username || "VB")
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-foreground/60">Display name</p>
                        <p className="text-2xl font-bold text-foreground">
                          {profileMeta.displayName || profileMeta.username || "Community Member"}
                        </p>
                        <p className="text-sm text-foreground/60">{formData.email || "No email attached"}</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                      <button
                        onClick={handleCopyProfileLink}
                        disabled={!profileShareUrl}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border/50 text-sm font-semibold hover:bg-card/50 transition-colors disabled:opacity-60"
                      >
                        <LinkIcon size={16} />
                        Copy profile link
                      </button>
                      <Link
                        href="/support-desk"
                        className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors text-sm"
                      >
                        Contact support
                      </Link>
                    </div>
                  </div>

                  {profileMessage && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400">
                      {profileMessage}
                    </div>
                  )}

                  <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
                    <div>
                      <h3 className="text-lg font-bold">Profile details</h3>
                      <p className="text-sm text-foreground/60">
                        Customize the information shown on your public profile at /profile/{profileSettings.handle || profileMeta.username || formData.discordId}
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold">Display name</label>
                        <input
                          type="text"
                          value={profileSettings.displayName}
                          onChange={(e) =>
                            setProfileSettings((prev) => ({ ...prev, displayName: e.target.value }))
                          }
                          disabled={profileSettingsLoading || profileSettingsSaving}
                          className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm disabled:opacity-60"
                          placeholder={profileMeta.displayName || "Community Member"}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold">Headline</label>
                        <input
                          type="text"
                          value={profileSettings.headline}
                          onChange={(e) =>
                            setProfileSettings((prev) => ({ ...prev, headline: e.target.value }))
                          }
                          disabled={profileSettingsLoading || profileSettingsSaving}
                          className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm disabled:opacity-60"
                          placeholder="Automation lead @ OrbitLab"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">Bio</label>
                      <textarea
                        value={profileSettings.bio}
                        onChange={(e) =>
                          setProfileSettings((prev) => ({ ...prev, bio: e.target.value }))
                        }
                        disabled={profileSettingsLoading || profileSettingsSaving}
                        className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm disabled:opacity-60 min-h-[140px]"
                        placeholder="Share what you build with VectoBeat."
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold">Location</label>
                        <input
                          type="text"
                          value={profileSettings.location}
                          onChange={(e) =>
                            setProfileSettings((prev) => ({ ...prev, location: e.target.value }))
                          }
                          disabled={profileSettingsLoading || profileSettingsSaving}
                          className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm disabled:opacity-60"
                          placeholder="Berlin, Germany"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold">Website</label>
                        <input
                          type="text"
                          value={profileSettings.website}
                          onChange={(e) =>
                            setProfileSettings((prev) => ({ ...prev, website: e.target.value }))
                          }
                          disabled={profileSettingsLoading || profileSettingsSaving}
                          className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm disabled:opacity-60"
                          placeholder="https://vectobeat.uplytech.de"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">Profile handle</label>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-foreground/50">/profile/</span>
                        <input
                          type="text"
                          value={profileSettings.handle}
                          onChange={(e) => {
                            const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32)
                            setProfileSettings((prev) => ({
                              ...prev,
                              handle: sanitized,
                            }))
                          }}
                          disabled={profileSettingsLoading || profileSettingsSaving}
                          className="flex-1 px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm disabled:opacity-60"
                          placeholder={profileMeta.username || formData.discordId}
                        />
                      </div>
                      <p className="text-xs text-foreground/60">Only lowercase letters, numbers, and hyphens are allowed.</p>
                    </div>
                    {profileSettingsError && (
                      <p className="text-sm text-destructive">{profileSettingsError}</p>
                    )}
                    <button
                      onClick={handleSaveProfileSettings}
                      disabled={profileSettingsSaving || profileSettingsLoading}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors text-sm disabled:opacity-60"
                    >
                      {profileSettingsSaving ? "Saving…" : "Save profile"}
                    </button>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold">Server overview</h3>
                        <p className="text-sm text-foreground/60">
                          Live counts sourced directly from your Discord session and billing records.
                        </p>
                      </div>
                      <Link
                        href="/control-panel"
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-border/60 text-sm font-semibold hover:bg-card/40 transition-colors"
                      >
                        Open Control Panel
                      </Link>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      {[
                        { label: "Total servers", value: guildMetrics.membershipCount },
                        { label: "Admin servers", value: guildMetrics.adminGuildCount },
                        { label: "Bot installations", value: guildMetrics.botGuildCount },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-xl border border-border/50 bg-background/30 p-4 text-center">
                          <p className="text-sm uppercase tracking-[0.2em] text-foreground/50">{stat.label}</p>
                          <p className="text-3xl font-bold text-foreground mt-2">{stat.value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-foreground/60">
                      Data refreshes whenever you sign in or reload this page. Invite the bot to additional servers from the control
                      panel for immediate tracking.
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">Visibility</h3>
                        <p className="text-sm text-foreground/60">
                          Control how other community members can discover your VectoBeat profile.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border/40 hover:bg-card/40 transition-colors">
                      <input
                        type="checkbox"
                        className="mt-1 w-5 h-5 rounded cursor-pointer"
                        checked={privacy.profilePublic}
                        onChange={(e) => handlePrivacyToggle("profilePublic", e.target.checked)}
                      />
                      <div>
                        <p className="font-semibold">Public profile</p>
                        <p className="text-sm text-foreground/70">
                          Allow others to view your VectoBeat profile via shareable link.
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border/40 hover:bg-card/40 transition-colors">
                      <input
                        type="checkbox"
                        className="mt-1 w-5 h-5 rounded cursor-pointer"
                        checked={privacy.searchVisibility}
                        onChange={(e) => handlePrivacyToggle("searchVisibility", e.target.checked)}
                      />
                      <div>
                        <p className="font-semibold">Search visibility</p>
                        <p className="text-sm text-foreground/70">Show up in community search and leaderboards.</p>
                      </div>
                    </label>
                  </div>

                </div>
              )}

              {/* Settings Tab */}
              {activeTab === "settings" && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">Preferences</h2>
                      <p className="text-sm text-foreground/60">
                        Update the information VectoBeat uses to reach you outside of Discord.
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold mb-1">Email address</label>
                        <input
                          type="email"
                          value={formData.email ?? ""}
                          disabled
                          className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 opacity-60 cursor-not-allowed text-sm"
                        />
                        <p className="text-xs text-foreground/60">Synced automatically from Discord OAuth.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold mb-1">Phone number</label>
                        <input
                          type="tel"
                          value={formData.phone ?? ""}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm"
                          placeholder="+49 160 00000000"
                        />
                        <p className="text-xs text-foreground/60">
                          Optional. Helps us send SMS alerts if you enable them.
                        </p>
                        {contactError && <p className="text-xs text-destructive">{contactError}</p>}
                        {contactMessage && <p className="text-xs text-green-500">{contactMessage}</p>}
                        <button
                          onClick={handleSaveContact}
                          disabled={contactSaving || contactLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors text-sm disabled:opacity-60"
                        >
                          {contactSaving ? "Saving…" : "Save phone"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
                    <div>
                      <h3 className="text-lg font-bold">Language</h3>
                      <p className="text-sm text-foreground/60">
                        Pick the language you prefer across the dashboard and public profile.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold mb-1">Language</label>
                      <select
                        value={preferences.preferredLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                        disabled={languageSaving}
                        className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm"
                      >
                        <option value="en">English</option>
                        <option value="de">Deutsch</option>
                        <option value="fr">Français</option>
                        <option value="es">Español</option>
                      </select>
                      {languageError && <p className="text-xs text-destructive">{languageError}</p>}
                      {languageSaving && <p className="text-xs text-foreground/60">Saving…</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Subscriptions Tab */}
              {activeTab === "subscriptions" && (
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold">Billing & Plans</h2>
                      <p className="text-foreground/60 text-sm">
                        Every server currently assigned to a paid VectoBeat plan.
                      </p>
                    </div>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors font-semibold"
                    >
                      Upgrade / Add Plan
                    </Link>
                  </div>

                  {subscriptionsError && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {subscriptionsError}
                    </div>
                  )}

                  {subscriptionsLoading ? (
                    <div className="py-12 text-center text-foreground/60 text-sm">Loading subscriptions…</div>
                  ) : subscriptions.length > 0 ? (
                    <div className="space-y-4">
                      {subscriptions.map((sub) => {
                        const periodStart = new Date(sub.currentPeriodStart)
                        const periodEnd = new Date(sub.currentPeriodEnd)
                        const periodStartLabel = periodStart.toLocaleDateString()
                        const periodEndLabel = periodEnd.toLocaleDateString()
                        const showRenewButton = shouldShowRenewalPrompt(sub)
                        return (
                          <div
                            key={sub.id}
                            className="rounded-lg border border-border/50 bg-card/30 p-6 hover:bg-card/50 transition-colors"
                          >
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-bold capitalize">{sub.tier} plan</h3>
                                <span
                                  className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${getTierBadgeColor(sub.tier)}`}
                                >
                                  {sub.tier}
                                </span>
                                <span
                                  className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(sub.status)}`}
                                >
                                  {sub.status}
                                </span>
                              </div>
                          <p className="text-sm text-foreground/70">
                            Server: <span className="font-semibold">{sub.name}</span> ({sub.discordServerId})
                          </p>
                          <p className="text-xs text-foreground/60">Owner: {subscriptionOwnerName}</p>
                        </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold">${sub.pricePerMonth.toFixed(2)}</p>
                              <p className="text-xs text-foreground/60">per month</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/30 pt-4 mb-6 text-sm">
                            <div>
                              <p className="text-foreground/60">Billing window</p>
                              <p className="font-semibold">
                                {periodStartLabel} – {periodEndLabel}
                              </p>
                            </div>
                            <div>
                              <p className="text-foreground/60">Stripe Subscription ID</p>
                              <p className="font-semibold">{sub.id}</p>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              type="button"
                              onClick={() => setSubscriptionPreview(sub)}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border/60 text-sm hover:bg-card/40 transition-colors"
                            >
                              View Details
                            </button>
                            <Link
                              href={buildGuildManageHref(sub.discordServerId)}
                              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                            >
                              Manage in Control Panel
                            </Link>
                            <a
                              href={`/api/billing/invoice?subscriptionId=${encodeURIComponent(sub.id)}`}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border/60 text-sm hover:bg-card/40 transition-colors"
                            >
                              PDF Invoice
                            </a>
                            {showRenewButton && (
                              <button
                                type="button"
                                onClick={() => handleSubscriptionPayment(sub)}
                                disabled={renewingSubscriptionId === sub.id}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-primary/40 text-primary font-semibold hover:bg-primary/10 transition-colors disabled:opacity-60"
                              >
                                {renewingSubscriptionId === sub.id ? "Opening…" : "Pay Membership"}
                              </button>
                            )}
                            <Link
                              href="/support-desk"
                              className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-border/60 text-sm hover:bg-card/40 transition-colors"
                            >
                              Contact Support
                            </Link>
                          </div>
                          <p className="text-xs text-foreground/60 mt-4">
                            {showRenewButton
                              ? `Pay before ${periodEndLabel} to keep this plan active. Otherwise it will automatically end on the final day if no payment is made.`
                              : `If you skip payment, this membership automatically expires on ${periodEndLabel}.`}
                          </p>
                        </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 rounded-lg border border-border/50 bg-card/20">
                      <p className="text-foreground/70 mb-4">You don’t have an active plan yet.</p>
                      <Link
                        href="/pricing"
                        className="inline-flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold"
                      >
                        View plans
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Security Tab */}
              {activeTab === "security" && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-border/50 bg-card/30 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-2xl font-bold">Security Settings</h2>
                      {securitySaving && <span className="text-xs text-foreground/60">Saving...</span>}
                    </div>
                    {securityError && <p className="text-xs text-destructive mb-3">{securityError}</p>}

                    {securityLoading ? (
                      <p className="text-sm text-foreground/60">Loading security data...</p>
                    ) : (
                      <div className="space-y-4">
                        <label className="p-4 bg-background rounded-lg flex items-center gap-4 cursor-pointer hover:bg-card/50 transition-colors">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded cursor-pointer"
                            checked={security.twoFactorEnabled}
                            onChange={(e) => handleSecurityUpdate({ twoFactorEnabled: e.target.checked })}
                          />
                          <div className="flex-1">
                            <p className="font-semibold">Two-Factor Authentication</p>
                            <p className="text-sm text-foreground/70">
                              Protect your account with rotating 6-digit codes. Click &ldquo;Set Up 2FA&rdquo; to scan the QR code
                              and enter the generated passcode on the next screen.
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              appRouter.push(`/two-factor?mode=setup&username=${encodeURIComponent(formData.username || "VectoBeat")}`)
                            }
                            className="px-4 py-2 border border-border/50 rounded-lg hover:bg-card/50 transition-colors"
                          >
                            Set Up 2FA
                          </button>
                        </label>

                        <label className="p-4 bg-background rounded-lg flex items-center gap-4 cursor-pointer hover:bg-card/50 transition-colors">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded cursor-pointer"
                            checked={security.loginAlerts}
                            onChange={(e) => handleSecurityUpdate({ loginAlerts: e.target.checked })}
                          />
                          <div className="flex-1">
                            <p className="font-semibold">Login Alerts</p>
                            <p className="text-sm text-foreground/70">
                              Receive instant alerts via email/Discord whenever a new device signs in.
                            </p>
                          </div>
                        </label>

                        <div className="p-4 bg-background rounded-lg space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <p className="font-semibold">Backup Codes</p>
                              <p className="text-sm text-foreground/70">
                                {security.backupCodesRemaining} codes available for offline recovery.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={handleRevealBackupCodes}
                                className="px-4 py-2 border border-border/50 rounded-lg hover:bg-card/50 transition-colors text-sm"
                              >
                                {backupCodesVisible ? "Hide Codes" : "Reveal Codes"}
                              </button>
                              <button
                                onClick={handleRegenerateBackupCodes}
                                disabled={backupCodesLoading}
                                className="px-4 py-2 border border-border/50 rounded-lg hover:bg-card/50 transition-colors text-sm disabled:opacity-60"
                              >
                                {backupCodesLoading ? "Regenerating..." : "Regenerate"}
                              </button>
                              <button
                                onClick={handleDownloadBackupCodes}
                                disabled={!backupCodes.length}
                                className="px-4 py-2 border border-border/50 rounded-lg hover:bg-card/50 transition-colors text-sm disabled:opacity-60"
                              >
                                Download
                              </button>
                            </div>
                          </div>
                          {backupCodesError && <p className="text-xs text-destructive">{backupCodesError}</p>}
                          {backupCodesVisible && (
                            <div className="grid sm:grid-cols-2 gap-2">
                              {backupCodes.length > 0 ? (
                                backupCodes.map((code) => (
                                  <code
                                    key={code}
                                    className="px-3 py-2 rounded-lg bg-background border border-border/50 text-sm text-center tracking-widest"
                                  >
                                    {code}
                                  </code>
                                ))
                              ) : (
                                <p className="text-sm text-foreground/60">
                                  {backupCodesLoading ? "Loading codes..." : "No backup codes available yet."}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="p-4 bg-background rounded-lg space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <p className="font-semibold">Active Sessions</p>
                              <p className="text-sm text-foreground/70">
                                {sessions.length} device{sessions.length === 1 ? "" : "s"} currently signed in
                                {otherDeviceCount > 0
                                  ? ` - ${otherDeviceCount} other device${otherDeviceCount === 1 ? "" : "s"}`
                                  : ""}.
                              </p>
                            </div>
                            <button
                              onClick={() => formData.discordId && authToken && fetchSessions(formData.discordId, authToken)}
                              className="px-4 py-2 border border-border/50 rounded-lg hover:bg-card/50 transition-colors text-sm"
                            >
                              Refresh
                            </button>
                          </div>
                          {sessionsError && <p className="text-xs text-destructive">{sessionsError}</p>}
                          {sessionsLoading ? (
                            <p className="text-sm text-foreground/60">Loading sessions...</p>
                          ) : sessions.length ? (
                            <div className="space-y-3">
                              {sessions.map((session) => (
                                <div
                                  key={session.id}
                                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-border/40 rounded-lg p-3"
                                >
                                  <div>
                                    <p className="font-semibold">
                                      {session.location || "Unknown location"}
                                      {session.id === currentSessionId && (
                                        <span className="ml-2 text-xs text-primary font-semibold">This device</span>
                                      )}
                                    </p>
                                    <p className="text-xs text-foreground/60">
                                      {session.ipAddress || "No IP"} - Last active{" "}
                                      {new Date(session.lastActive).toLocaleString()}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleSessionRevoke(session.id)}
                                    className="px-4 py-2 border border-border/50 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-sm"
                                  >
                                    Log Out
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-foreground/60">No other devices are currently signed in.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-border/50 bg-card/30 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-2xl font-bold">Notification Preferences</h2>
                      {notificationsSaving && <span className="text-xs text-foreground/60">Saving...</span>}
                    </div>
                    {notificationsError && <p className="text-xs text-destructive mb-3">{notificationsError}</p>}

                    {notificationsLoading ? (
                      <p className="text-sm text-foreground/60">Loading notifications...</p>
                    ) : (
                      <div className="space-y-4">
                        {(
                          [
                            {
                              key: "maintenanceAlerts",
                              title: "Maintenance Alerts",
                              description: "Free vServer maintenance windows & updates",
                          },
                          {
                            key: "downtimeAlerts",
                            title: "Downtime Alerts",
                            description: "Outage notifications & recovery status",
                          },
                          {
                            key: "releaseNotes",
                            title: "Release Notes",
                            description: "New VectoBeat features and bug fixes",
                          },
                          {
                            key: "securityNotifications",
                            title: "Security Bulletins",
                            description: "Critical fixes and account security reminders",
                          },
                          {
                            key: "betaProgram",
                            title: "Beta Program",
                            description: "Invitations to beta builds and testing waves",
                          },
                            {
                              key: "communityEvents",
                              title: "Community Events",
                              description: "Workshops, tournaments, and AMAs",
                            },
                          ] as { key: keyof NotificationState; title: string; description: string }[]
                        ).map((item) => (
                          <label
                            key={item.key}
                            className="p-4 bg-background rounded-lg flex items-center gap-4 cursor-pointer hover:bg-card/50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              className="w-5 h-5 rounded cursor-pointer"
                              checked={notifications[item.key]}
                              onChange={(e) => handleNotificationToggle(item.key, e.target.checked)}
                            />
                            <div className="flex-1">
                              <p className="font-semibold">{item.title}</p>
                              <p className="text-sm text-foreground/70">{item.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Privacy Tab */}
              {activeTab === "privacy" && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-border/50 bg-card/30 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-2xl font-bold">Privacy Settings</h2>
                      {privacySaving && <span className="text-xs text-foreground/60">Saving...</span>}
                    </div>
                    {privacyError && <p className="text-xs text-destructive mb-3">{privacyError}</p>}

                    {privacyLoading ? (
                      <p className="text-sm text-foreground/60">Loading privacy settings...</p>
                    ) : (
                      <div className="space-y-4">
                        <label className="p-4 bg-background rounded-lg flex items-center gap-4 cursor-pointer hover:bg-card/50 transition-colors">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded cursor-pointer"
                            checked={privacy.profilePublic}
                            onChange={(e) => handlePrivacyToggle("profilePublic", e.target.checked)}
                          />
                          <div className="flex-1">
                            <p className="font-semibold">Public Profile</p>
                            <p className="text-sm text-foreground/70">Allow others to see your public stats</p>
                          </div>
                        </label>

                        <label className="p-4 bg-background rounded-lg flex items-center gap-4 cursor-pointer hover:bg-card/50 transition-colors">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded cursor-pointer"
                            checked={privacy.searchVisibility}
                            onChange={(e) => handlePrivacyToggle("searchVisibility", e.target.checked)}
                          />
                          <div className="flex-1">
                            <p className="font-semibold">Search Visibility</p>
                            <p className="text-sm text-foreground/70">Make your server discoverable</p>
                          </div>
                        </label>

                        <label className="p-4 bg-background rounded-lg flex items-center gap-4 cursor-pointer hover:bg-card/50 transition-colors">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded cursor-pointer"
                            checked={privacy.analyticsOptIn}
                            onChange={(e) => handlePrivacyToggle("analyticsOptIn", e.target.checked)}
                          />
                          <div className="flex-1">
                            <p className="font-semibold">Analytics Opt-In</p>
                            <p className="text-sm text-foreground/70">Help improve the bot with anonymous data</p>
                          </div>
                        </label>

                        <label className="p-4 bg-background rounded-lg flex items-center gap-4 cursor-pointer hover:bg-card/50 transition-colors">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded cursor-pointer"
                            checked={privacy.dataSharing}
                            onChange={(e) => handlePrivacyToggle("dataSharing", e.target.checked)}
                          />
                          <div className="flex-1">
                            <p className="font-semibold">Data Sharing</p>
                            <p className="text-sm text-foreground/70">Share anonymized stats with partners</p>
                          </div>
                        </label>

                        <div className="pt-4 border-t border-border/30 space-y-2">
                          <p className="text-sm text-foreground/60">Data & Privacy</p>
                          <button
                            onClick={handleDownloadData}
                            disabled={downloadingData}
                            className="w-full px-4 py-3 border border-border/50 rounded-lg hover:bg-card/50 transition-colors text-left disabled:opacity-60"
                          >
                            {downloadingData ? "Preparing export..." : "Download My Data"}
                          </button>
                          <button className="w-full px-4 py-3 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors text-left">
                            Delete My Account
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Linked Accounts Tab */}
              {activeTab === "linked" && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
                    <h2 className="text-2xl font-bold">Primary Discord Account</h2>
                    <div className="grid sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-foreground/60">Email</p>
                        <p className="font-semibold text-foreground">{formData.email || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-foreground/60">Phone</p>
                        <p className="font-semibold text-foreground">{formData.phone || "Not provided"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-foreground/60">Discord User ID</p>
                            <p className="font-semibold text-foreground">
                              {showPrimaryDiscordId && formData.discordId
                                ? formData.discordId
                                : maskDiscordId(formData.discordId ?? "") || "Not provided"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleTogglePrimaryDiscordId}
                            disabled={!formData.discordId}
                            className="text-xs text-primary hover:text-primary/80 transition-colors"
                          >
                            {showPrimaryDiscordId ? "Hide" : "Reveal"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold">Additional Linked Accounts</h2>
                        <p className="text-sm text-foreground/70">
                          Connect creator profiles, social platforms, and tooling accounts so teammates and communities can verify it&rsquo;s really you.
                        </p>
                      </div>
                      {linkedAccountSaving && <span className="text-xs text-foreground/60">Saving...</span>}
                    </div>
                    {linkedAccountsError && <p className="text-xs text-destructive">{linkedAccountsError}</p>}
                    {linkedAccountsLoading ? (
                      <p className="text-sm text-foreground/60">Loading linked accounts...</p>
                    ) : linkedAccounts.length ? (
                      <div className="space-y-3">
                        {linkedAccounts.map((account) => {
                          const providerMeta =
                            LINKED_ACCOUNT_PROVIDERS.find((provider) => provider.value === account.provider) ?? null
                          const ProviderIcon = providerMeta?.icon ?? LinkIcon
                          const providerLabel = providerMeta?.label ?? formatProviderLabel(account.provider)
                          const isUrlHandle = /^https?:\/\//i.test(account.handle)
                          return (
                            <div
                              key={account.id}
                              className="flex items-center justify-between gap-3 border border-border/40 rounded-lg p-3"
                            >
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <ProviderIcon className="w-4 h-4 text-primary" />
                                  <p className="font-semibold">{providerLabel}</p>
                                </div>
                                {isUrlHandle ? (
                                  <a
                                    href={account.handle}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary hover:underline break-all"
                                  >
                                    {account.handle}
                                  </a>
                                ) : (
                                  <p className="text-xs text-foreground/60 break-all">@{account.handle}</p>
                                )}
                                <p className="text-[11px] text-foreground/50">
                                  Linked {new Date(account.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveLinkedAccount(account.id)}
                                className="px-3 py-1 rounded-lg border border-border/60 text-xs hover:bg-destructive/10 hover:text-destructive transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/60">No additional accounts linked yet.</p>
                    )}

                    <form onSubmit={handleAddLinkedAccount} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
                      <div className="space-y-1">
                        <select
                          value={linkedAccountForm.provider}
                          onChange={(event) =>
                            setLinkedAccountForm((prev) => ({ ...prev, provider: event.target.value }))
                          }
                          className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm"
                        >
                          {LINKED_ACCOUNT_PROVIDERS.map((provider) => (
                            <option key={provider.value} value={provider.value}>
                              {provider.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={linkedAccountForm.handle}
                          onChange={(event) =>
                            setLinkedAccountForm((prev) => ({ ...prev, handle: event.target.value }))
                          }
                          placeholder={activeLinkedProvider?.placeholder ?? "Profile URL or handle"}
                          className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm"
                        />
                        {activeLinkedProvider?.helper && (
                          <p className="text-xs text-foreground/50">{activeLinkedProvider.helper}</p>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={linkedAccountSaving || !linkedAccountForm.handle.trim()}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 text-sm"
                      >
                        Link Account
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Logout Button */}
              <div className="mt-8">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors font-semibold flex items-center justify-between"
                >
                  <span>Logout</span>
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

        <Footer />
      </div>

      {subscriptionPreview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-foreground/60">Subscription</p>
                <p className="text-xl font-semibold">{subscriptionPreview.tier} • {subscriptionPreview.name}</p>
              </div>
              <button
                onClick={() => setSubscriptionPreview(null)}
                className="text-foreground/60 hover:text-foreground text-2xl leading-none px-2"
                aria-label="Close subscription details"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-foreground/80">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-foreground/60 text-xs uppercase">Guild</p>
                  <p className="font-semibold">{subscriptionPreview.name}</p>
                  <p className="text-xs text-foreground/60">ID: {subscriptionPreview.discordServerId}</p>
                </div>
                <div>
                  <p className="text-foreground/60 text-xs uppercase">Owner</p>
                  <p className="font-semibold">{subscriptionOwnerName}</p>
                  <p className="text-xs text-foreground/60">Status: {subscriptionPreview.status}</p>
                </div>
                <div>
                  <p className="text-foreground/60 text-xs uppercase">Current period</p>
                  <p className="font-semibold">
                    {formatDate(subscriptionPreview.currentPeriodStart)} → {formatDate(subscriptionPreview.currentPeriodEnd)}
                  </p>
                </div>
                <div>
                  <p className="text-foreground/60 text-xs uppercase">Monthly price</p>
                  <p className="font-semibold">{formatEuros(subscriptionPreview.pricePerMonth)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-4 border-t border-border/40">
                <a
                  href={`/api/billing/invoice?subscriptionId=${encodeURIComponent(subscriptionPreview.id)}`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border/60 text-sm font-semibold hover:bg-card/40 transition-colors"
                >
                  Download PDF
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const preview = subscriptionPreview
                    setSubscriptionPreview(null)
                    if (preview) {
                      handleSubscriptionPayment(preview)
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  Open Billing Portal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
