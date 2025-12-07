"use client"

import { useState, useEffect, useCallback, useMemo, FormEvent } from "react"
import { io, type Socket } from "socket.io-client"
import { useRouter } from "next/navigation"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import {
  CreditCard,
  LogOut,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Server,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  Lock,
  RefreshCw,
  Globe,
  FileDown,
  FileText,
} from "lucide-react"
import Link from "next/link"
import { DISCORD_BOT_INVITE_URL, buildDiscordLoginUrl, BRANDING_CNAME_TARGET } from "@/lib/config"
import { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/memberships"
import {
  SERVER_FEATURE_GROUPS,
  defaultServerFeatureSettings,
  type ServerFeatureSettings,
  TIER_SEQUENCE,
} from "@/lib/server-settings"
import { getPlanCapabilities, getQueueLimitCap } from "@/lib/plan-capabilities"
import { QueueSyncPanel } from "@/components/queue-sync-panel"
import { API_SCOPE_DEFINITIONS, DEFAULT_API_SCOPES } from "@/lib/api-scopes"

interface Subscription {
  id: string
  name: string
  tier: "free" | "starter" | "pro" | "growth" | "scale" | "enterprise"
  status: "active" | "canceled" | "pending"
  currentPeriodStart: string
  currentPeriodEnd: string
  pricePerMonth: number
  discordServerId: string
}

const sanitizeGuildId = (value?: string | null) => (typeof value === "string" ? value.trim() : "") || ""
const buildManageHref = (guildId?: string | null) => `/control-panel?guild=${encodeURIComponent(sanitizeGuildId(guildId))}`
const SOURCE_LEVEL_ORDER: ServerFeatureSettings["sourceAccessLevel"][] = ["core", "extended", "unlimited"]
const formatQueueCapLabel = (tier: MembershipTier) => {
  const value = getQueueLimitCap(tier)
  return value === null ? "Unlimited" : value.toLocaleString()
}
const automationActionLabel = (action: string) => {
  switch (action) {
    case "queue_trim":
      return "Queue trim"
    case "auto_restart":
      return "Auto restart"
    case "command_throttled":
      return "Command throttled"
    default:
      return action.replace(/_/g, " ")
  }
}
const formatAutomationTimestamp = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const MAIN_CONTENT_ID = "control-panel-main"
const OVERVIEW_TAB_ID = "control-panel-tab-overview"
const SETTINGS_TAB_ID = "control-panel-tab-settings"
const OVERVIEW_PANEL_ID = "control-panel-overview-panel"
const SETTINGS_PANEL_ID = "control-panel-settings-panel"
const GUILD_SELECT_ID = "control-panel-guild-select"
const REGION_SELECT_ID = "control-panel-region-select"
const REGION_SELECT_HELP_ID = "control-panel-region-select-help"

type ApiTokenSummary = {
  id: string
  label: string
  lastFour: string
  createdAt: string
  rotatedAt: string | null
  lastUsedAt: string | null
  scopes: string[]
  status: "active" | "disabled"
  expiresAt: string | null
  leakDetected: boolean
}

type ApiTokenLifecycleAction = "disable" | "enable" | "mark_leak" | "clear_leak" | "set_expiry"

type AutomationActionSummary = {
  id: string
  action: string
  category: string | null
  description: string | null
  createdAt: string
  metadata?: Record<string, any> | null
}

type ApiTokenEventSummary = {
  id: string
  action: string
  actorName?: string | null
  createdAt: string
  metadata?: Record<string, any> | null
}

type SuccessPodTimelineEntrySummary = {
  id: string
  requestId: string
  kind: string
  note: string | null
  actor: string | null
  createdAt: string
}

type SuccessPodRequestSummary = {
  id: string
  status: string
  summary: string
  contact: string | null
  assignedTo: string | null
  assignedContact: string | null
  submittedAt: string
  acknowledgedAt: string | null
  scheduledFor: string | null
  resolvedAt: string | null
  timeline: SuccessPodTimelineEntrySummary[]
}

type ScaleContactSummary = {
  managerName: string | null
  managerEmail: string | null
  managerDiscord: string | null
  escalationChannel: string | null
  escalationNotes: string | null
}

type LavalinkNodeStatus = {
  name: string
  region?: string | null
  available?: boolean
  players?: number
  playingPlayers?: number
}

type LavalinkPlayerState = {
  nodeName?: string | null
  nodeRegion?: string | null
  desiredRegion?: string | null
}

type SecurityAuditEvent = {
  id: string
  type: "command" | "api" | "admin"
  source: string
  actor: string | null
  actorId: string | null
  description: string | null
  createdAt: string
  metadata?: Record<string, any> | null
}

type SecurityAccessLog = {
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

type ResidencyProofSummary = {
  id: string
  region: string
  dataCenters: string[]
  provider: string
  replication: string
  controls: string[]
  lastAudit: string
  statement: string
  downloadPath: string
}

type SecurityAuditFilters = {
  from: string
  to: string
  actor: string
  type: "all" | "command" | "api" | "admin"
}

type SecurityAccessFilters = {
  from: string
  to: string
  actor: string
}

const successStatusLabel = (status: string) => {
  switch (status) {
    case "acknowledged":
      return "Acknowledged"
    case "scheduled":
      return "Scheduled"
    case "resolved":
      return "Resolved"
    default:
      return "Submitted"
  }
}

const successStatusBadgeClass = (status: string) => {
  switch (status) {
    case "resolved":
      return "bg-emerald-500/15 text-emerald-200 border border-emerald-400/50"
    case "scheduled":
      return "bg-sky-500/15 text-sky-200 border border-sky-400/50"
    case "acknowledged":
      return "bg-amber-500/15 text-amber-200 border border-amber-400/50"
    default:
      return "bg-primary/10 text-primary-foreground border border-primary/40"
  }
}

const formatSuccessTimestamp = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

const formatAccessTypeLabel = (value: SecurityAccessLog["type"]) => {
  switch (value) {
    case "panel_login":
      return "Control panel login"
    case "api_token":
      return "API token use"
    default:
      return value
  }
}

const formatExpiryLabel = (value?: string | null) => {
  if (!value) return "No expiry set"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "No expiry set"
  return `Expires ${date.toLocaleString()}`
}

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const fromDateTimeLocalValue = (value?: string) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

const formatSecurityTimestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const toUtcISOString = (value: string, endOfDay = false) => {
  if (!value) return null
  const base = endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`
  const date = new Date(base)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

const SECURITY_FILTER_DEFAULTS: SecurityAuditFilters = {
  from: "",
  to: "",
  actor: "",
  type: "all",
}

const ACCESS_FILTER_DEFAULTS: SecurityAccessFilters = {
  from: "",
  to: "",
  actor: "",
}

const SETTINGS_CARD_CLASS = "rounded-xl border border-border/50 bg-card/40 shadow-sm backdrop-blur-sm"

export default function ControlPanelPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [adminGuilds, setAdminGuilds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [overviewData, setOverviewData] = useState<any>(null)
  const skipHref = `#${MAIN_CONTENT_ID}`
  const [botSettings, setBotSettings] = useState({
    autoJoinVoice: true,
    announceTracks: true,
    djMode: false,
    normalizeVolume: true,
    defaultVolume: 70,
  })
  const [botSettingsLoading, setBotSettingsLoading] = useState(true)
  const [botSettingsSaving, setBotSettingsSaving] = useState(false)
  const [botSettingsError, setBotSettingsError] = useState<string | null>(null)
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null)
  const [serverSettings, setServerSettings] = useState<ServerFeatureSettings>(defaultServerFeatureSettings)
  const [serverSettingsLoading, setServerSettingsLoading] = useState(false)
  const [serverSettingsSaving, setServerSettingsSaving] = useState(false)
  const [serverSettingsError, setServerSettingsError] = useState<string | null>(null)
  const [settingsSocket, setSettingsSocket] = useState<Socket | null>(null)
  const [advancedAnalytics, setAdvancedAnalytics] = useState<any | null>(null)
  const [advancedAnalyticsLoading, setAdvancedAnalyticsLoading] = useState(false)
  const [advancedAnalyticsError, setAdvancedAnalyticsError] = useState<string | null>(null)
  const [automationActions, setAutomationActions] = useState<AutomationActionSummary[]>([])
  const [automationActionsLoading, setAutomationActionsLoading] = useState(false)
  const [automationActionsError, setAutomationActionsError] = useState<string | null>(null)
  const [successContact, setSuccessContact] = useState("")
  const [successSummary, setSuccessSummary] = useState("")
  const [successStatus, setSuccessStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [successError, setSuccessError] = useState<string | null>(null)
  const [successPodRequests, setSuccessPodRequests] = useState<SuccessPodRequestSummary[]>([])
  const [successPodLoading, setSuccessPodLoading] = useState(false)
  const [successPodError, setSuccessPodError] = useState<string | null>(null)
  const [scaleContact, setScaleContact] = useState<ScaleContactSummary | null>(null)
  const [scaleContactLoading, setScaleContactLoading] = useState(false)
  const [scaleContactError, setScaleContactError] = useState<string | null>(null)
  const [routingNodes, setRoutingNodes] = useState<LavalinkNodeStatus[]>([])
  const [routingPlayerState, setRoutingPlayerState] = useState<LavalinkPlayerState | null>(null)
  const [routingUpdatedAt, setRoutingUpdatedAt] = useState<string | null>(null)
  const [routingStatusLoading, setRoutingStatusLoading] = useState(false)
  const [routingStatusError, setRoutingStatusError] = useState<string | null>(null)
  const [routingRebalanceStatus, setRoutingRebalanceStatus] = useState<"idle" | "running" | "success" | "error">("idle")
  const [routingRebalanceError, setRoutingRebalanceError] = useState<string | null>(null)
  const [conciergeSummary, setConciergeSummary] = useState("")
  const [conciergeContact, setConciergeContact] = useState("")
  const [conciergeHours, setConciergeHours] = useState(1)
  const [conciergeUsage, setConciergeUsage] = useState<{ remaining: number | null; used: number; total: number | null } | null>(null)
  const [conciergeStatus, setConciergeStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [conciergeError, setConciergeError] = useState<string | null>(null)
  const [apiTokens, setApiTokens] = useState<ApiTokenSummary[]>([])
  const [apiTokenSecret, setApiTokenSecret] = useState<string | null>(null)
  const [apiTokenSecretSource, setApiTokenSecretSource] = useState<"create" | "rotate" | null>(null)
  const [apiTokenLabel, setApiTokenLabel] = useState("")
  const [apiTokenScopes, setApiTokenScopes] = useState<string[]>([...DEFAULT_API_SCOPES])
  const [apiTokenLoading, setApiTokenLoading] = useState(false)
  const [apiTokenError, setApiTokenError] = useState<string | null>(null)
  const [apiTokenRotating, setApiTokenRotating] = useState<string | null>(null)
  const [apiTokenAudit, setApiTokenAudit] = useState<ApiTokenEventSummary[]>([])
  const [apiTokenAuditLoading, setApiTokenAuditLoading] = useState(false)
  const [apiTokenAuditError, setApiTokenAuditError] = useState<string | null>(null)
  const [apiTokenAction, setApiTokenAction] = useState<{ tokenId: string; action: ApiTokenLifecycleAction } | null>(null)
  const [apiTokenExpiryDrafts, setApiTokenExpiryDrafts] = useState<Record<string, string>>({})
  const [apiTokenTtlInput, setApiTokenTtlInput] = useState("")
  const [apiTokenPolicySaving, setApiTokenPolicySaving] = useState(false)
  const [apiTokenPolicyMessage, setApiTokenPolicyMessage] = useState<string | null>(null)
  const [apiTokenPolicyError, setApiTokenPolicyError] = useState<string | null>(null)
  const [securityEvents, setSecurityEvents] = useState<SecurityAuditEvent[]>([])
  const [securityFilters, setSecurityFilters] = useState<SecurityAuditFilters>(SECURITY_FILTER_DEFAULTS)
  const [securityFilterDraft, setSecurityFilterDraft] = useState<SecurityAuditFilters>(SECURITY_FILTER_DEFAULTS)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [securityExporting, setSecurityExporting] = useState<"csv" | "jsonl" | null>(null)
  const [securityAccessLogs, setSecurityAccessLogs] = useState<SecurityAccessLog[]>([])
  const [securityAccessFilters, setSecurityAccessFilters] = useState<SecurityAccessFilters>(ACCESS_FILTER_DEFAULTS)
  const [securityAccessFilterDraft, setSecurityAccessFilterDraft] = useState<SecurityAccessFilters>(ACCESS_FILTER_DEFAULTS)
  const [securityAccessLoading, setSecurityAccessLoading] = useState(false)
  const [securityAccessError, setSecurityAccessError] = useState<string | null>(null)
  const [residencyProofs, setResidencyProofs] = useState<ResidencyProofSummary[]>([])
  const [residencyLoading, setResidencyLoading] = useState(false)
  const [residencyError, setResidencyError] = useState<string | null>(null)
  const [residencyDownloading, setResidencyDownloading] = useState<string | null>(null)
  const [customDomainInput, setCustomDomainInput] = useState("")
  const [assetPackInput, setAssetPackInput] = useState("")
  const [mailFromInput, setMailFromInput] = useState("")
  const [embedAccentInput, setEmbedAccentInput] = useState("")
  const [embedLogoInput, setEmbedLogoInput] = useState("")
  const [embedCtaLabelInput, setEmbedCtaLabelInput] = useState("")
  const [embedCtaUrlInput, setEmbedCtaUrlInput] = useState("")
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainMessage, setDomainMessage] = useState<string | null>(null)
  const [domainError, setDomainError] = useState<string | null>(null)
  const loginHref =
    typeof window !== "undefined"
      ? buildDiscordLoginUrl(`${window.location.origin}/api/auth/discord/callback`)
      : buildDiscordLoginUrl()

  const fetchSubscriptionsForUser = useCallback(async (discordId: string) => {
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
        })),
      )
    } catch (error) {
      console.error("Failed to load subscriptions:", error)
      setSubscriptions([])
    }
  }, [])

  const fetchOverviewData = useCallback(async (discordId: string) => {
    try {
      const response = await fetch(`/api/dashboard/overview?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Failed to load overview metrics")
      }
      const payload = await response.json()
      setOverviewData(payload)
    } catch (error) {
      console.error("Failed to load overview data:", error)
      setOverviewData(null)
    }
  }, [])

  const fetchBotSettings = useCallback(async (discordId: string) => {
    setBotSettingsLoading(true)
    setBotSettingsError(null)
    try {
      const response = await fetch(`/api/account/bot-settings?discordId=${discordId}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Failed to load bot settings")
      }
      const payload = await response.json()
      setBotSettings((prev) => ({ ...prev, ...payload }))
    } catch (error) {
      console.error("Failed to load bot settings:", error)
      setBotSettingsError("Unable to load bot settings")
    } finally {
      setBotSettingsLoading(false)
    }
  }, [])

  const handleBotSettingChange = useCallback(
    async (key: keyof typeof botSettings, value: boolean | number) => {
      if (!user?.id) return
      setBotSettings((prev) => ({ ...prev, [key]: value }))
      setBotSettingsSaving(true)
      setBotSettingsError(null)
      try {
        const response = await fetch("/api/account/bot-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discordId: user.id, [key]: value }),
        })
        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to update bot settings")
        }
      } catch (error) {
        console.error("Failed to update bot settings:", error)
        setBotSettingsError("Failed to save bot settings")
      } finally {
        setBotSettingsSaving(false)
      }
    },
    [user?.id],
  )

  const ensureTwoFactor = useCallback(
    (sessionData: any) => {
      if (!sessionData.requiresTwoFactor) return true
      const key = `two_factor_verified_${sessionData.id}`
      const timestamp = localStorage.getItem(key)
      if (timestamp && Date.now() - Number(timestamp) < 1000 * 60 * 30) {
        return true
      }
      router.push(`/two-factor?context=login&username=${encodeURIComponent(sessionData.username || "VectoBeat")}`)
      return false
    },
    [router],
  )

  const subscribedGuildIds = useMemo(() => new Set(subscriptions.map((sub) => sub.discordServerId)), [subscriptions])
  const botGuildIdSet = useMemo(() => {
    const raw = overviewData?.bot?.raw
    const ids = new Set<string>()
    if (raw) {
      const candidateLists = [
        (Array.isArray(raw.guildIds) && raw.guildIds) || [],
        (Array.isArray(raw.guild_ids) && raw.guild_ids) || [],
        (Array.isArray(raw.guilds) && raw.guilds) || [],
        (Array.isArray(raw.servers) && raw.servers) || [],
      ]
      for (const list of candidateLists) {
        for (const entry of list as any[]) {
          if (typeof entry === "string") {
            ids.add(entry)
          } else if (entry && typeof entry === "object") {
            if (typeof (entry as any).id === "string") ids.add((entry as any).id)
            if (typeof (entry as any).guildId === "string") ids.add((entry as any).guildId)
          }
        }
      }
    }
    return ids
  }, [overviewData?.bot?.raw])
  const guildsWithBot = useMemo(
    () =>
      adminGuilds.filter(
        (guild) => guild.hasBot || subscribedGuildIds.has(guild.id) || botGuildIdSet.has(guild.id),
      ),
    [adminGuilds, subscribedGuildIds, botGuildIdSet],
  )
  const guildsWithoutBot = useMemo(
    () =>
      adminGuilds.filter(
        (guild) => !(guild.hasBot || subscribedGuildIds.has(guild.id) || botGuildIdSet.has(guild.id)),
      ),
    [adminGuilds, subscribedGuildIds, botGuildIdSet],
  )
  const subscriptionTierByGuild = useMemo(() => {
    const map = new Map<string, MembershipTier>()
    subscriptions.forEach((sub) => {
      map.set(sub.discordServerId, sub.tier as MembershipTier)
    })
    return map
  }, [subscriptions])
  const selectedGuild = useMemo(
    () => (selectedGuildId ? adminGuilds.find((guild) => guild.id === selectedGuildId) ?? null : null),
    [selectedGuildId, adminGuilds],
  )
  const selectedGuildTier: MembershipTier = selectedGuildId
    ? subscriptionTierByGuild.get(selectedGuildId) ?? "free"
    : "free"
  const tierIndex = TIER_SEQUENCE.indexOf(selectedGuildTier)
  const tierDefinition = MEMBERSHIP_TIERS[selectedGuildTier]
  const selectedGuildHasBot = Boolean(
    selectedGuild && (selectedGuild.hasBot || subscribedGuildIds.has(selectedGuild.id)),
  )
  const selectedPlan = useMemo(() => getPlanCapabilities(selectedGuildTier), [selectedGuildTier])
  const planAllowsApiTokens = selectedPlan.features.apiTokens
  const planAllowsSuccessPod = selectedPlan.features.successPod
  const planAllowsRegionalRouting = selectedPlan.features.regionalRouting
  const planAllowsConcierge = selectedPlan.features.concierge
  const planAllowsAdvancedAnalytics = selectedPlan.serverSettings.maxAnalyticsMode !== "basic"
  const planAllowsPredictiveAnalytics = selectedPlan.serverSettings.maxAnalyticsMode === "predictive"
  const planAllowsAutomation = selectedPlan.serverSettings.maxAutomationLevel !== "off"
  const planAllowsQueueSync = selectedPlan.serverSettings.playlistSync
  const planAllowsAnalyticsExports = selectedPlan.serverSettings.exportWebhooks
  const planAllowsSecurityDesk = selectedPlan.serverSettings.exportWebhooks

  const fetchSuccessPodRequests = useCallback(async () => {
    if (!planAllowsSuccessPod || !selectedGuildId || !selectedGuildHasBot || !user?.id) {
      setSuccessPodRequests([])
      setSuccessPodError(null)
      setSuccessPodLoading(false)
      return
    }
    setSuccessPodLoading(true)
    setSuccessPodError(null)
    try {
      const response = await fetch(
        `/api/success-pod?guildId=${encodeURIComponent(selectedGuildId)}&discordId=${user.id}`,
        { cache: "no-store", credentials: "include" },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load success pod workflow")
      }
      setSuccessPodRequests(payload?.requests ?? [])
    } catch (error) {
      console.error("Failed to load success pod requests:", error)
      setSuccessPodRequests([])
      setSuccessPodError(error instanceof Error ? error.message : "Unable to load success pod workflow.")
    } finally {
      setSuccessPodLoading(false)
    }
  }, [planAllowsSuccessPod, selectedGuildHasBot, selectedGuildId, user?.id])

  const fetchApiTokenAudit = useCallback(async () => {
    if (!planAllowsApiTokens || !selectedGuildId || !user?.id) {
      setApiTokenAudit([])
      setApiTokenAuditError(null)
      setApiTokenAuditLoading(false)
      return
    }
    setApiTokenAuditLoading(true)
    setApiTokenAuditError(null)
    try {
      const response = await fetch(
        `/api/control-panel/api-tokens/audit?guildId=${selectedGuildId}&discordId=${user.id}`,
        { cache: "no-store" },
      )
      if (!response.ok) {
        throw new Error("Unable to load audit log")
      }
      const payload = await response.json()
      setApiTokenAudit(Array.isArray(payload?.events) ? payload.events : [])
    } catch (error) {
      setApiTokenAuditError(error instanceof Error ? error.message : "Failed to load audit log")
      setApiTokenAudit([])
    } finally {
      setApiTokenAuditLoading(false)
    }
  }, [planAllowsApiTokens, selectedGuildId, user?.id])

  const fetchSecurityAuditEvents = useCallback(async () => {
    if (!planAllowsSecurityDesk || !selectedGuildId || !user?.id) {
      setSecurityEvents([])
      setSecurityError(null)
      setSecurityLoading(false)
      return
    }
    setSecurityLoading(true)
    setSecurityError(null)
    try {
      const params = new URLSearchParams({
        guildId: selectedGuildId,
        discordId: user.id,
      })
      const fromIso = securityFilters.from ? toUtcISOString(securityFilters.from, false) : null
      const toIso = securityFilters.to ? toUtcISOString(securityFilters.to, true) : null
      if (fromIso) params.set("from", fromIso)
      if (toIso) params.set("to", toIso)
      if (securityFilters.actor.trim()) params.set("actor", securityFilters.actor.trim())
      if (securityFilters.type !== "all") params.set("type", securityFilters.type)
      const response = await fetch(`/api/control-panel/security/audit?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error("Unable to load security audit log")
      }
      const payload = await response.json().catch(() => null)
      setSecurityEvents(Array.isArray(payload?.events) ? payload.events : [])
    } catch (error) {
      setSecurityEvents([])
      setSecurityError(error instanceof Error ? error.message : "Failed to load security audit log")
    } finally {
      setSecurityLoading(false)
    }
  }, [
    planAllowsSecurityDesk,
    securityFilters.actor,
    securityFilters.from,
    securityFilters.to,
    securityFilters.type,
    selectedGuildId,
    user?.id,
  ])

  const fetchSecurityAccessLogs = useCallback(async () => {
    if (!planAllowsSecurityDesk || !selectedGuildId || !user?.id) {
      setSecurityAccessLogs([])
      setSecurityAccessError(null)
      setSecurityAccessLoading(false)
      return
    }
    setSecurityAccessLoading(true)
    setSecurityAccessError(null)
    try {
      const params = new URLSearchParams({
        guildId: selectedGuildId,
        discordId: user.id,
      })
      const fromIso = securityAccessFilters.from ? toUtcISOString(securityAccessFilters.from, false) : null
      const toIso = securityAccessFilters.to ? toUtcISOString(securityAccessFilters.to, true) : null
      if (fromIso) {
        params.set("from", fromIso)
      }
      if (toIso) {
        params.set("to", toIso)
      }
      if (securityAccessFilters.actor.trim()) {
        params.set("actor", securityAccessFilters.actor.trim())
      }
      const response = await fetch(`/api/control-panel/security/access?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error("Unable to load access logs")
      }
      const payload = await response.json().catch(() => null)
      setSecurityAccessLogs(Array.isArray(payload?.logs) ? payload.logs : [])
    } catch (error) {
      setSecurityAccessError(error instanceof Error ? error.message : "Failed to load access logs")
      setSecurityAccessLogs([])
    } finally {
      setSecurityAccessLoading(false)
    }
  }, [
    planAllowsSecurityDesk,
    securityAccessFilters.actor,
    securityAccessFilters.from,
    securityAccessFilters.to,
    selectedGuildId,
    user?.id,
  ])

  const fetchResidencyProofs = useCallback(async () => {
    if (!planAllowsSecurityDesk || !selectedGuildId || !user?.id) {
      setResidencyProofs([])
      setResidencyError(null)
      setResidencyLoading(false)
      return
    }
    setResidencyLoading(true)
    setResidencyError(null)
    try {
      const response = await fetch(
        `/api/control-panel/security/residency?guildId=${selectedGuildId}&discordId=${user.id}`,
        { cache: "no-store" },
      )
      if (!response.ok) {
        throw new Error("Unable to load residency proofs")
      }
      const payload = await response.json().catch(() => null)
      setResidencyProofs(Array.isArray(payload?.proofs) ? payload.proofs : [])
    } catch (error) {
      setResidencyProofs([])
      setResidencyError(error instanceof Error ? error.message : "Failed to load residency proofs")
    } finally {
      setResidencyLoading(false)
    }
  }, [planAllowsSecurityDesk, selectedGuildId, user?.id])

  const activeSubscriptions = subscriptions.filter((sub) => sub.status === "active")
  const activeMonthlyRecurring = activeSubscriptions.reduce((sum, sub) => sum + sub.pricePerMonth, 0)
  const topSubscriptions = activeSubscriptions.slice(0, 4)
  const pricingCurrency = (process.env.NEXT_PUBLIC_PRICING_CURRENCY || "EUR").toUpperCase()
  const currencySymbol = pricingCurrency === "EUR" ? "€" : pricingCurrency

  useEffect(() => {
    let active = true
    let socket: Socket | null = null

    const connect = async () => {
      try {
        await fetch("/api/socket")
        socket = io({ path: "/api/socket" })
        if (!active) {
          socket.disconnect()
          return
        }
        setSettingsSocket(socket)
      } catch (error) {
        console.error("[VectoBeat] Failed to connect settings socket:", error)
      }
    }

    void connect()

    return () => {
      active = false
      if (socket) {
        socket.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    if (!guildsWithBot.length) {
      if (selectedGuildId) {
        setSelectedGuildId(null)
      }
      return
    }
    if (!selectedGuildId || !guildsWithBot.find((guild) => guild.id === selectedGuildId)) {
      setSelectedGuildId(guildsWithBot[0].id)
    }
  }, [guildsWithBot, selectedGuildId])

  useEffect(() => {
    if (!selectedGuildId || !user?.id) {
      return
    }
    let cancelled = false
    const fetchSettings = async () => {
      setServerSettingsLoading(true)
      setServerSettingsError(null)
      try {
        const response = await fetch(
          `/api/control-panel/server-settings?guildId=${selectedGuildId}&discordId=${user.id}`,
          { cache: "no-store" },
        )
        if (!response.ok) {
          throw new Error("Failed to load server settings")
        }
        const payload = await response.json()
        if (cancelled) return
        const tier = subscriptionTierByGuild.get(selectedGuildId) ?? "free"
        const queueCap = getQueueLimitCap(tier)
        const merged = {
          ...defaultServerFeatureSettings,
          ...(payload?.settings || {}),
        }
        if (typeof queueCap === "number") {
          merged.queueLimit = Math.min(merged.queueLimit ?? queueCap, queueCap)
        }
        setServerSettings(merged)
      } catch (error) {
        if (!cancelled) {
          console.error("[VectoBeat] Failed to hydrate server settings:", error)
          setServerSettingsError("Unable to load server feature settings")
        }
      } finally {
        if (!cancelled) {
          setServerSettingsLoading(false)
        }
      }
    }
    void fetchSettings()
    return () => {
      cancelled = true
    }
  }, [selectedGuildId, subscriptionTierByGuild, user?.id])

  useEffect(() => {
    if (!settingsSocket) return
    const handleSettingsUpdate = (payload: any) => {
      if (!payload || payload.guildId !== selectedGuildId) {
        return
      }
      const queueCap = getQueueLimitCap(selectedGuildTier)
      const merged = {
        ...defaultServerFeatureSettings,
        ...(payload.settings || {}),
      }
      if (typeof queueCap === "number") {
        const nextQueueLimit = Number(merged.queueLimit)
        merged.queueLimit = Number.isFinite(nextQueueLimit) ? Math.min(nextQueueLimit, queueCap) : queueCap
      }
      setServerSettings(merged)
    }

    settingsSocket.on("server-settings:update", handleSettingsUpdate)
    if (selectedGuildId) {
      settingsSocket.emit("settings:join", selectedGuildId)
    }

    return () => {
      settingsSocket.off("server-settings:update", handleSettingsUpdate)
      if (selectedGuildId) {
        settingsSocket.emit("settings:leave", selectedGuildId)
      }
    }
  }, [selectedGuildId, selectedGuildTier, settingsSocket])


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
        setAuthToken(token || null)

        if (!ensureTwoFactor(sessionData) || cancelled) {
          return
        }

        const resolvedUserId = sessionData.id || userId
        if (!resolvedUserId) {
          throw new Error("Missing user identifier")
        }

        if (token) {
          localStorage.setItem("discord_token", token)
        }
        localStorage.setItem("discord_user_id", resolvedUserId)

        setIsAuthorized(true)
        setAuthError(null)
        setUser({
          id: resolvedUserId,
          email: sessionData.email,
          phone: sessionData.phone,
          discordUsername: sessionData.displayName || sessionData.username,
          avatar: sessionData.avatarUrl || sessionData.avatar,
          joinedDate: (() => {
            const raw = sessionData.createdAt || sessionData.lastSeen
            const parsed = raw ? new Date(raw) : new Date()
            return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
          })(),
        })

        const guildsWithAdmin = Array.isArray(sessionData.guilds)
          ? sessionData.guilds.filter((guild: any) => guild.isAdmin)
          : []
        setAdminGuilds(guildsWithAdmin)

        void fetchSubscriptionsForUser(resolvedUserId)
        void fetchOverviewData(resolvedUserId)
        void fetchBotSettings(resolvedUserId)
      } catch (error) {
        console.error("Auth check failed:", error)
        setAuthToken(null)
        localStorage.removeItem("discord_token")
        localStorage.removeItem("discord_user_id")
        if (!cancelled) {
          setIsAuthorized(false)
          setAuthError("Please sign in with Discord again to open the control panel.")
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
  }, [ensureTwoFactor, fetchBotSettings, fetchOverviewData, fetchSubscriptionsForUser])

  useEffect(() => {
    if (user?.email) {
      setSuccessContact(user.email)
    }
  }, [user?.email])

  useEffect(() => {
    setCustomDomainInput(serverSettings.customDomain || "")
    setAssetPackInput(serverSettings.assetPackUrl || "")
    setMailFromInput(serverSettings.mailFromAddress || "")
    setEmbedAccentInput(serverSettings.embedAccentColor || "")
    setEmbedLogoInput(serverSettings.embedLogoUrl || "")
    setEmbedCtaLabelInput(serverSettings.embedCtaLabel || "")
    setEmbedCtaUrlInput(serverSettings.embedCtaUrl || "")
  }, [
    serverSettings.assetPackUrl,
    serverSettings.customDomain,
    serverSettings.embedAccentColor,
    serverSettings.embedCtaLabel,
    serverSettings.embedCtaUrl,
    serverSettings.embedLogoUrl,
    serverSettings.mailFromAddress,
  ])

  useEffect(() => {
    const ttl = typeof serverSettings.apiTokenTtlDays === "number" ? serverSettings.apiTokenTtlDays : 0
    setApiTokenTtlInput(String(ttl))
  }, [serverSettings.apiTokenTtlDays])

  useEffect(() => {
    setApiTokens([])
    setApiTokenSecret(null)
    setApiTokenSecretSource(null)
    setApiTokenError(null)
    if (!planAllowsApiTokens || !selectedGuildId || !user?.id) {
      return
    }
    const controller = new AbortController()
    const fetchTokens = async () => {
      setApiTokenLoading(true)
      try {
        const response = await fetch(
          `/api/control-panel/api-tokens?guildId=${selectedGuildId}&discordId=${user.id}`,
          { cache: "no-store", signal: controller.signal },
        )
        if (!response.ok) {
          throw new Error("Unable to load API tokens")
        }
        const payload = await response.json()
        const tokens = Array.isArray(payload.tokens)
          ? payload.tokens.map((token: ApiTokenSummary) => ({
            ...token,
            scopes: Array.isArray(token.scopes) && token.scopes.length ? token.scopes : [...DEFAULT_API_SCOPES],
            rotatedAt: token.rotatedAt ?? null,
            lastUsedAt: token.lastUsedAt ?? null,
            status: token.status === "disabled" ? "disabled" : "active",
            expiresAt: token.expiresAt ?? null,
            leakDetected: Boolean(token.leakDetected),
          }))
          : []
        setApiTokens(tokens)
        void fetchApiTokenAudit()
      } catch (error) {
        if (!controller.signal.aborted) {
          setApiTokenError(error instanceof Error ? error.message : "Failed to load API tokens")
        }
      } finally {
        if (!controller.signal.aborted) {
          setApiTokenLoading(false)
        }
      }
    }
    void fetchTokens()
    return () => controller.abort()
  }, [fetchApiTokenAudit, planAllowsApiTokens, selectedGuildId, user?.id])

  useEffect(() => {
    if (!apiTokens.length) {
      setApiTokenExpiryDrafts({})
      return
    }
    const drafts: Record<string, string> = {}
    apiTokens.forEach((token) => {
      drafts[token.id] = toDateTimeLocalValue(token.expiresAt)
    })
    setApiTokenExpiryDrafts(drafts)
  }, [apiTokens])

  useEffect(() => {
    void fetchApiTokenAudit()
  }, [fetchApiTokenAudit])

  useEffect(() => {
    void fetchSecurityAuditEvents()
  }, [fetchSecurityAuditEvents])

  useEffect(() => {
    void fetchSecurityAccessLogs()
  }, [fetchSecurityAccessLogs])

  useEffect(() => {
    void fetchResidencyProofs()
  }, [fetchResidencyProofs])

  const persistServerSettings = useCallback(
    async (updates: Partial<ServerFeatureSettings>) => {
      if (!selectedGuildId || !user?.id) {
        return
      }
      setServerSettingsSaving(true)
      setServerSettingsError(null)
      try {
        const response = await fetch("/api/control-panel/server-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discordId: user.id,
            guildId: selectedGuildId,
            settings: updates,
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to update server settings")
        }
        if (payload?.settings) {
          setServerSettings(payload.settings)
        }
      } catch (error) {
        console.error("[VectoBeat] Failed to persist server settings:", error)
        setServerSettingsError("Unable to save server settings")
      } finally {
        setServerSettingsSaving(false)
      }
    },
    [selectedGuildId, user?.id],
  )

  const normalizeSelectValue = (
    key: keyof ServerFeatureSettings,
    raw: string,
  ): ServerFeatureSettings[keyof ServerFeatureSettings] => {
    switch (key) {
      case "playbackQuality":
        return (raw === "hires" ? "hires" : "standard") as ServerFeatureSettings["playbackQuality"]
      case "analyticsMode":
        return (raw === "advanced" || raw === "predictive" ? raw : "basic") as ServerFeatureSettings["analyticsMode"]
      case "automationLevel":
        return (raw === "smart" || raw === "full" ? raw : "off") as ServerFeatureSettings["automationLevel"]
      case "sourceAccessLevel":
        return (raw === "extended" || raw === "unlimited" ? raw : "core") as ServerFeatureSettings["sourceAccessLevel"]
      default:
        return raw as ServerFeatureSettings[keyof ServerFeatureSettings]
    }
  }

  const handleServerFeatureChange = useCallback(
    (key: keyof ServerFeatureSettings, value: ServerFeatureSettings[keyof ServerFeatureSettings]) => {
      if (!selectedGuildId) return
      setServerSettings((prev) => ({ ...prev, [key]: value }))
      void persistServerSettings({ [key]: value })
    },
    [persistServerSettings, selectedGuildId],
  )


  const handleWebhookEventToggle = useCallback(
    (eventKey: string) => {
      if (!selectedGuildId) return
      const exists = serverSettings.webhookEvents.includes(eventKey)
      const nextEvents = exists
        ? serverSettings.webhookEvents.filter((value) => value !== eventKey)
        : [...serverSettings.webhookEvents, eventKey]
      setServerSettings((prev) => ({ ...prev, webhookEvents: nextEvents }))
      void persistServerSettings({ webhookEvents: nextEvents })
    },
    [persistServerSettings, selectedGuildId, serverSettings.webhookEvents],
  )

  useEffect(() => {
    const queueCap = getQueueLimitCap(selectedGuildTier)
    if (typeof queueCap === "number" && serverSettings.queueLimit > queueCap) {
      setServerSettings((prev) => ({ ...prev, queueLimit: queueCap }))
      void persistServerSettings({ queueLimit: queueCap })
    }
  }, [selectedGuildTier, serverSettings.queueLimit, persistServerSettings])

  useEffect(() => {
    const allowedLevel = selectedPlan.serverSettings.maxSourceAccessLevel
    if (
      SOURCE_LEVEL_ORDER.indexOf(serverSettings.sourceAccessLevel) >
      SOURCE_LEVEL_ORDER.indexOf(allowedLevel)
    ) {
      setServerSettings((prev) => ({ ...prev, sourceAccessLevel: allowedLevel }))
      void persistServerSettings({ sourceAccessLevel: allowedLevel })
    }
  }, [selectedPlan.serverSettings.maxSourceAccessLevel, serverSettings.sourceAccessLevel, persistServerSettings])

  useEffect(() => {
    if (!selectedPlan.features.concierge) {
      setConciergeHours(1)
      return
    }
    const monthlyHours = selectedPlan.limits.conciergeHours
    let maxHours = 8
    if (typeof conciergeUsage?.remaining === "number") {
      maxHours = Math.max(1, conciergeUsage.remaining)
    } else if (typeof monthlyHours === "number") {
      maxHours = Math.max(1, monthlyHours)
    }
    setConciergeHours((prev) => Math.max(1, Math.min(maxHours, prev)))
  }, [selectedPlan.features.concierge, selectedPlan.limits.conciergeHours, conciergeUsage])

  useEffect(() => {
    if (!planAllowsAdvancedAnalytics || !selectedGuildId || !user?.id) {
      setAdvancedAnalytics(null)
      setAdvancedAnalyticsError(null)
      setAdvancedAnalyticsLoading(false)
      return
    }
    if (advancedAnalytics && (advancedAnalytics as any)?.__guildId === selectedGuildId) {
      return
    }
    let cancelled = false
    const fetchAnalytics = async () => {
      setAdvancedAnalyticsLoading(true)
      try {
        const response = await fetch(
          `/api/dashboard/analytics?discordId=${user.id}&guildId=${encodeURIComponent(selectedGuildId)}`,
          { cache: "no-store", credentials: "include" },
        )
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load analytics")
        }
        if (!cancelled) {
          const analyticsPayload = payload?.analytics
          if (analyticsPayload) {
            analyticsPayload.__guildId = selectedGuildId
          }
          setAdvancedAnalytics(analyticsPayload ?? null)
          setAdvancedAnalyticsError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setAdvancedAnalyticsError(error instanceof Error ? error.message : "Unable to load analytics")
          setAdvancedAnalytics(null)
        }
      } finally {
        if (!cancelled) {
          setAdvancedAnalyticsLoading(false)
        }
      }
    }
    void fetchAnalytics()
    return () => {
      cancelled = true
    }
  }, [planAllowsAdvancedAnalytics, selectedGuildId, user?.id, advancedAnalytics])

  useEffect(() => {
    const resetAutomationAndConcierge = () => {
      setAutomationActions([])
      setAutomationActionsError(null)
      setAutomationActionsLoading(false)
      setConciergeUsage(null)
      setConciergeStatus("idle")
      setConciergeError(null)
    }
    if (!selectedGuildId || !selectedGuildHasBot || !user?.id) {
      resetAutomationAndConcierge()
      return
    }
    if (!planAllowsAutomation && !planAllowsConcierge) {
      resetAutomationAndConcierge()
      return
    }
    let cancelled = false

    const fetchAutomationActions = async () => {
      if (!planAllowsAutomation) {
        setAutomationActions([])
        setAutomationActionsError(null)
        setAutomationActionsLoading(false)
        return
      }
      setAutomationActionsLoading(true)
      setAutomationActionsError(null)
      try {
        const automationUrl = `/api/control-panel/automation-actions?guildId=${encodeURIComponent(selectedGuildId)}&discordId=${user.id}&limit=25`
        const automationResponse = await fetch(automationUrl, { cache: "no-store", credentials: "include" })
        const automationPayload = await automationResponse.json().catch(() => null)
        if (!automationResponse.ok) {
          throw new Error(automationPayload?.error || "Failed to load automation actions")
        }
        if (!cancelled) {
          setAutomationActions(automationPayload?.actions ?? [])
        }
      } catch (error) {
        console.error("Failed to load automation actions:", error)
        if (!cancelled) {
          setAutomationActions([])
          setAutomationActionsError(
            error instanceof Error ? error.message : "Unable to load automation audit trail.",
          )
        }
      } finally {
        if (!cancelled) {
          setAutomationActionsLoading(false)
        }
      }
    }

    const fetchConciergeUsage = async () => {
      if (!planAllowsConcierge) {
        setConciergeUsage(null)
        return
      }
      if (!user?.id || !selectedGuildId) {
        setConciergeUsage(null)
        return
      }
      try {
        const params = new URLSearchParams({
          guildId: selectedGuildId,
          discordId: user.id,
        })
        const headers: HeadersInit = {}
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const usageResponse = await fetch(`/api/concierge?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
          headers,
        })
        if (usageResponse.ok) {
          const usagePayload = await usageResponse.json().catch(() => null)
          if (!cancelled) {
            setConciergeUsage(usagePayload?.usage ?? null)
          }
        } else if (!cancelled) {
          setConciergeUsage(null)
        }
      } catch (error) {
        console.error("Failed to load concierge usage:", error)
        if (!cancelled) {
          setConciergeUsage(null)
        }
      }
    }

    void (async () => {
      await Promise.all([fetchAutomationActions(), fetchConciergeUsage()])
    })()

    return () => {
      cancelled = true
    }
  }, [planAllowsAutomation, planAllowsConcierge, selectedGuildId, selectedGuildHasBot, authToken, user?.id])

  useEffect(() => {
    void fetchSuccessPodRequests()
  }, [fetchSuccessPodRequests])

  const refreshScaleContact = useCallback(async () => {
    if (!planAllowsSuccessPod || !selectedGuildId || !selectedGuildHasBot || !user?.id) {
      setScaleContact(null)
      setScaleContactError(null)
      setScaleContactLoading(false)
      return
    }
    setScaleContactLoading(true)
    setScaleContactError(null)
    try {
      const response = await fetch(
        `/api/scale/contact?guildId=${encodeURIComponent(selectedGuildId)}&discordId=${user.id}`,
        { cache: "no-store", credentials: "include" },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load account manager")
      }
      setScaleContact(payload?.contact ?? null)
    } catch (error) {
      setScaleContact(null)
      setScaleContactError(error instanceof Error ? error.message : "Unable to load contact info.")
    } finally {
      setScaleContactLoading(false)
    }
  }, [planAllowsSuccessPod, selectedGuildHasBot, selectedGuildId, user?.id])

  useEffect(() => {
    void refreshScaleContact()
  }, [refreshScaleContact])

  const refreshRoutingStatus = useCallback(async () => {
    if (!planAllowsRegionalRouting || !selectedGuildId || !selectedGuildHasBot || !user?.id) {
      setRoutingNodes([])
      setRoutingPlayerState(null)
      setRoutingUpdatedAt(null)
      setRoutingStatusError(null)
      setRoutingStatusLoading(false)
      return
    }
    setRoutingStatusLoading(true)
    setRoutingStatusError(null)
    try {
      const response = await fetch(
        `/api/control-panel/lavalink/nodes?guildId=${encodeURIComponent(selectedGuildId)}&discordId=${user.id}`,
        { cache: "no-store", credentials: "include" },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load routing status")
      }
      setRoutingNodes(Array.isArray(payload?.nodes) ? payload.nodes : [])
      setRoutingPlayerState(payload?.player ?? null)
      setRoutingUpdatedAt(typeof payload?.updatedAt === "string" ? payload.updatedAt : null)
    } catch (error) {
      setRoutingNodes([])
      setRoutingPlayerState(null)
      setRoutingUpdatedAt(null)
      setRoutingStatusError(error instanceof Error ? error.message : "Unable to load routing status")
    } finally {
      setRoutingStatusLoading(false)
    }
  }, [planAllowsRegionalRouting, selectedGuildHasBot, selectedGuildId, user?.id])

  useEffect(() => {
    void refreshRoutingStatus()
  }, [refreshRoutingStatus])

  const handleLogout = () => {
    localStorage.removeItem("discord_token")
    localStorage.removeItem("discord_user_id")
    router.push("/")
  }
  const handleRefreshAnalytics = () => {
    setAdvancedAnalytics(null)
    setAdvancedAnalyticsError(null)
    setAdvancedAnalyticsLoading(false)
  }

  const handleConciergeRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPlan.features.concierge || !selectedGuildId) return
    if (!conciergeSummary.trim()) {
      setConciergeError("Describe what you need help with.")
      return
    }
    if (
      selectedPlan.limits.conciergeHours !== null &&
      conciergeUsage &&
      typeof conciergeUsage.remaining === "number" &&
      conciergeUsage.remaining <= 0
    ) {
      setConciergeError("All concierge hours have been used. Upgrade to Scale for dedicated coverage.")
      return
    }
    setConciergeStatus("submitting")
    setConciergeError(null)
    try {
      const maxHours =
        typeof conciergeUsage?.remaining === "number"
          ? Math.max(1, conciergeUsage.remaining)
          : selectedPlan.limits.conciergeHours !== null
            ? Math.max(1, selectedPlan.limits.conciergeHours)
            : 8
      const hoursToRequest = Math.max(1, Math.min(maxHours, conciergeHours))
      const response = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: selectedGuildId,
          guildName: selectedGuild?.name,
          contact: conciergeContact,
          summary: conciergeSummary,
          hours: hoursToRequest,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to submit concierge request")
      }
      setConciergeStatus("success")
      setConciergeSummary("")
      if (payload?.usage) {
        setConciergeUsage(payload.usage)
      }
    } catch (error) {
      console.error("Concierge request failed:", error)
      setConciergeStatus("error")
      setConciergeError(error instanceof Error ? error.message : "Request failed")
    }
  }

  const toggleApiScope = (scope: string, enabled: boolean) => {
    setApiTokenScopes((prev) => {
      if (enabled) {
        if (prev.includes(scope)) return prev
        return [...prev, scope]
      }
      if (prev.length <= 1 && prev.includes(scope)) {
        return prev
      }
      return prev.filter((value) => value !== scope)
    })
  }

  const handleRoutingRebalance = useCallback(async () => {
    if (!selectedGuildId || !user?.id) return
    setRoutingRebalanceStatus("running")
    setRoutingRebalanceError(null)
    try {
      const response = await fetch("/api/control-panel/lavalink/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: selectedGuildId, discordId: user.id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to refresh routing")
      }
      setRoutingRebalanceStatus("success")
      setTimeout(() => setRoutingRebalanceStatus("idle"), 4000)
      void refreshRoutingStatus()
    } catch (error) {
      setRoutingRebalanceStatus("error")
      setRoutingRebalanceError(error instanceof Error ? error.message : "Unable to refresh routing")
    }
  }, [refreshRoutingStatus, selectedGuildId, user?.id])

  const handleSuccessPodRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedGuildId || !user?.id) return
    if (!successSummary.trim()) {
      setSuccessError("Please describe what you need help with.")
      return
    }
    setSuccessStatus("submitting")
    setSuccessError(null)
    try {
      const response = await fetch("/api/success-pod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          guildId: selectedGuildId,
          guildName: selectedGuild?.name,
          contact: successContact,
          summary: successSummary,
          discordId: user.id,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to submit request")
      }
      if (payload?.request) {
        setSuccessPodRequests((prev) => {
          const next = [payload.request as SuccessPodRequestSummary, ...prev]
          return next.slice(0, 10)
        })
      } else {
        void fetchSuccessPodRequests()
      }
      setSuccessStatus("success")
      setSuccessSummary("")
    } catch (error) {
      setSuccessStatus("error")
      setSuccessError(error instanceof Error ? error.message : "Request failed")
    }
  }

  const handleCreateApiToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!planAllowsApiTokens || !selectedGuildId || !user?.id) return
    const label = apiTokenLabel.trim()
    if (!label) {
      setApiTokenError("Provide a label for this token.")
      return
    }
    if (apiTokenScopes.length === 0) {
      setApiTokenError("Select at least one scope.")
      return
    }
    setApiTokenError(null)
    setApiTokenLoading(true)
    try {
      const response = await fetch("/api/control-panel/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: selectedGuildId,
          discordId: user.id,
          label,
          scopes: apiTokenScopes,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to create token")
      }
      if (payload?.record) {
        setApiTokens((prev) => [...prev, payload.record])
      }
      setApiTokenSecret(payload?.token ?? null)
      setApiTokenSecretSource("create")
      setApiTokenLabel("")
      setApiTokenScopes([...DEFAULT_API_SCOPES])
      void fetchApiTokenAudit()
    } catch (error) {
      setApiTokenError(error instanceof Error ? error.message : "Failed to create token")
    } finally {
      setApiTokenLoading(false)
    }
  }

  const handleDeleteApiToken = async (tokenId: string) => {
    if (!planAllowsApiTokens || !selectedGuildId || !user?.id) return
    setApiTokenError(null)
    try {
      const response = await fetch("/api/control-panel/api-tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: selectedGuildId, discordId: user.id, tokenId }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || "Unable to delete token")
      }
      setApiTokens((prev) => prev.filter((token) => token.id !== tokenId))
      void fetchApiTokenAudit()
    } catch (error) {
      setApiTokenError(error instanceof Error ? error.message : "Failed to delete token")
    }
  }

  const handleRotateApiToken = async (tokenId: string) => {
    if (!planAllowsApiTokens || !selectedGuildId || !user?.id) return
    setApiTokenError(null)
    setApiTokenRotating(tokenId)
    try {
      const response = await fetch("/api/control-panel/api-tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: selectedGuildId, discordId: user.id, tokenId, action: "rotate" }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to rotate token")
      }
      if (payload?.record) {
        setApiTokens((prev) => prev.map((token) => (token.id === payload.record.id ? payload.record : token)))
      }
      setApiTokenSecret(payload?.token ?? null)
      setApiTokenSecretSource("rotate")
      void fetchApiTokenAudit()
    } catch (error) {
      setApiTokenError(error instanceof Error ? error.message : "Failed to rotate token")
    } finally {
      setApiTokenRotating(null)
    }
  }

  const handleTokenLifecycleAction = async (
    tokenId: string,
    action: ApiTokenLifecycleAction,
    overrides?: Record<string, unknown>,
  ) => {
    if (!planAllowsApiTokens || !selectedGuildId || !user?.id) return
    setApiTokenError(null)
    setApiTokenAction({ tokenId, action })
    try {
      const response = await fetch("/api/control-panel/api-tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: selectedGuildId,
          discordId: user.id,
          tokenId,
          action,
          ...overrides,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to update token")
      }
      if (payload?.record) {
        setApiTokens((prev) => prev.map((token) => (token.id === payload.record.id ? payload.record : token)))
      }
      void fetchApiTokenAudit()
    } catch (error) {
      setApiTokenError(error instanceof Error ? error.message : "Token update failed")
    } finally {
      setApiTokenAction(null)
    }
  }

  const handleApplyTokenExpiry = async (tokenId: string) => {
    const draft = apiTokenExpiryDrafts[tokenId] ?? ""
    const iso = fromDateTimeLocalValue(draft)
    if (draft && !iso) {
      setApiTokenError("Enter a valid expiration date.")
      return
    }
    await handleTokenLifecycleAction(tokenId, "set_expiry", { expiresAt: iso })
  }

  const handleClearTokenExpiry = async (tokenId: string) => {
    setApiTokenExpiryDrafts((prev) => ({ ...prev, [tokenId]: "" }))
    await handleTokenLifecycleAction(tokenId, "set_expiry", { expiresAt: null })
  }

  const handleSaveTokenPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!planAllowsApiTokens || !selectedGuildId || !user?.id) return
    const parsed = Number(apiTokenTtlInput)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setApiTokenPolicyError("Enter a valid number of days (0-365).")
      setApiTokenPolicyMessage(null)
      return
    }
    const ttlDays = Math.min(365, Math.floor(parsed))
    setApiTokenPolicySaving(true)
    setApiTokenPolicyError(null)
    setApiTokenPolicyMessage(null)
    try {
      const response = await fetch("/api/control-panel/api-tokens/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: selectedGuildId, discordId: user.id, ttlDays }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to update policy")
      }
      const applied = typeof payload?.ttlDays === "number" ? payload.ttlDays : ttlDays
      setApiTokenTtlInput(String(applied))
      setServerSettings((prev) => ({ ...prev, apiTokenTtlDays: applied }))
      setApiTokenPolicyMessage(
        applied === 0
          ? "Tokens will no longer expire automatically."
          : `New tokens will expire after ${applied} day${applied === 1 ? "" : "s"}.`,
      )
    } catch (error) {
      setApiTokenPolicyError(error instanceof Error ? error.message : "Unable to update policy")
    } finally {
      setApiTokenPolicySaving(false)
    }
  }

  const handleApplySecurityFilters = () => {
    setSecurityFilters(securityFilterDraft)
  }

  const handleResetSecurityFilters = () => {
    setSecurityFilterDraft(SECURITY_FILTER_DEFAULTS)
    setSecurityFilters(SECURITY_FILTER_DEFAULTS)
  }

  const handleApplyAccessFilters = () => {
    setSecurityAccessFilters(securityAccessFilterDraft)
  }

  const handleResetAccessFilters = () => {
    setSecurityAccessFilterDraft(ACCESS_FILTER_DEFAULTS)
    setSecurityAccessFilters(ACCESS_FILTER_DEFAULTS)
  }

  const handleSecurityExport = async (format: "csv" | "jsonl") => {
    if (!planAllowsSecurityDesk || !selectedGuildId || !user?.id) return
    setSecurityError(null)
    setSecurityExporting(format)
    try {
      const params = new URLSearchParams({
        guildId: selectedGuildId,
        discordId: user.id,
        format,
        download: "1",
      })
      const fromIso = securityFilters.from ? toUtcISOString(securityFilters.from, false) : null
      const toIso = securityFilters.to ? toUtcISOString(securityFilters.to, true) : null
      if (fromIso) params.set("from", fromIso)
      if (toIso) params.set("to", toIso)
      if (securityFilters.actor.trim()) params.set("actor", securityFilters.actor.trim())
      if (securityFilters.type !== "all") params.set("type", securityFilters.type)
      const response = await fetch(`/api/control-panel/security/audit?${params.toString()}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || "Unable to export audit log")
      }
      const blob = await response.blob()
      if (typeof window === "undefined") {
        return
      }
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      const extension = format === "jsonl" ? "jsonl" : "csv"
      const stamp = new Date().toISOString().split("T")[0]
      anchor.href = url
      anchor.download = `security-audit-${selectedGuildId}-${stamp}.${extension}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Failed to export audit log")
    } finally {
      setSecurityExporting(null)
    }
  }

  const handleDownloadResidencyAttestation = async (proofId: string) => {
    if (!planAllowsSecurityDesk || !selectedGuildId || !user?.id) return
    setResidencyError(null)
    setResidencyDownloading(proofId)
    try {
      const query = new URLSearchParams({
        guildId: selectedGuildId,
        discordId: user.id,
      })
      const response = await fetch(`/api/control-panel/security/residency/${proofId}/attestation?${query.toString()}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || "Unable to download attestation")
      }
      const blob = await response.blob()
      if (typeof window === "undefined") return
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `attestation-${proofId}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setResidencyError(error instanceof Error ? error.message : "Failed to download attestation")
    } finally {
      setResidencyDownloading(null)
    }
  }

  const requestDomainAction = async (
    action: "save" | "mark_active" | "reset",
    payload?: {
      customDomain?: string
      assetPackUrl?: string
      mailFromAddress?: string
      embedAccentColor?: string
      embedLogoUrl?: string
      embedCtaLabel?: string
      embedCtaUrl?: string
    },
  ) => {
    if (!selectedGuildId || !user?.id) return null
    const response = await fetch("/api/control-panel/domain-branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: selectedGuildId,
        discordId: user.id,
        action,
        customDomain: payload?.customDomain,
        assetPackUrl: payload?.assetPackUrl,
        mailFromAddress: payload?.mailFromAddress,
        embedAccentColor: payload?.embedAccentColor,
        embedLogoUrl: payload?.embedLogoUrl,
        embedCtaLabel: payload?.embedCtaLabel,
        embedCtaUrl: payload?.embedCtaUrl,
      }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.error || "Domain update failed")
    }
    if (data?.settings) {
      setServerSettings((prev) => ({ ...prev, ...data.settings }))
    }
    return data
  }

  const handleDomainSave = async () => {
    if (!planAllowsApiTokens) return
    setDomainSaving(true)
    setDomainError(null)
    setDomainMessage(null)
    try {
      await requestDomainAction("save", {
        customDomain: customDomainInput,
        assetPackUrl: assetPackInput,
        mailFromAddress: mailFromInput,
        embedAccentColor: embedAccentInput,
        embedLogoUrl: embedLogoInput,
        embedCtaLabel: embedCtaLabelInput,
        embedCtaUrl: embedCtaUrlInput,
      })
      setDomainMessage("Domain settings saved. DNS changes will be detected automatically.")
    } catch (error) {
      setDomainError(error instanceof Error ? error.message : "Unable to save domain settings")
    } finally {
      setDomainSaving(false)
    }
  }

  const handleDomainActivate = async () => {
    setDomainSaving(true)
    setDomainError(null)
    setDomainMessage(null)
    try {
      await requestDomainAction("mark_active")
      setDomainMessage("Custom domain marked as active. TLS certificates deployed.")
    } catch (error) {
      setDomainError(error instanceof Error ? error.message : "Unable to mark domain active")
    } finally {
      setDomainSaving(false)
    }
  }

  const handleDomainReset = async () => {
    setDomainSaving(true)
    setDomainError(null)
    setDomainMessage(null)
    try {
      await requestDomainAction("reset")
      setCustomDomainInput("")
      setAssetPackInput("")
      setMailFromInput("")
      setEmbedAccentInput("")
      setEmbedLogoInput("")
      setEmbedCtaLabelInput("")
      setEmbedCtaUrlInput("")
      setDomainMessage("Domain branding reset to defaults.")
    } catch (error) {
      setDomainError(error instanceof Error ? error.message : "Unable to reset domain settings")
    } finally {
      setDomainSaving(false)
    }
  }
  const handleRenewalPayment = () => {
    router.push("/pricing?upgrade=renewal")
  }
  const overviewActivePlans = overviewData?.subscriptions?.activeCount ?? guildsWithBot.length
  const overviewMonthlyTotal = overviewData?.subscriptions?.totalMonthly ?? guildsWithBot.reduce((sum, guild) => {
    const sub = subscriptions.find((s) => s.discordServerId === guild.id)
    return sum + (sub?.pricePerMonth ?? 0)
  }, 0)
  const overviewNextRenewal =
    overviewData?.subscriptions?.nextRenewal ||
    guildsWithBot.reduce<string | null>((soonest, guild) => {
      const sub = subscriptions.find((s) => s.discordServerId === guild.id)
      if (!sub) return soonest
      if (!soonest) return sub.currentPeriodEnd
      return new Date(soonest) > new Date(sub.currentPeriodEnd) ? sub.currentPeriodEnd : soonest
    }, null)
  const nextRenewalDate = overviewNextRenewal ? new Date(overviewNextRenewal) : null
  const renewSoon = nextRenewalDate ? nextRenewalDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 : false
  const nextRenewalLabel = nextRenewalDate
    ? nextRenewalDate.toLocaleDateString()
    : "No subscription scheduled"
  const showPayNowButton = Boolean(nextRenewalDate && renewSoon)
  const botGuildCount = overviewData?.bot?.guildCount ?? (botGuildIdSet.size > 0 ? botGuildIdSet.size : guildsWithBot.length)
  const botActivePlayers = overviewData?.bot?.activePlayers ?? null

  const formatDuration = (value?: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return null
    }
    const totalSeconds = Math.floor(value)
    const days = Math.floor(totalSeconds / 86_400)
    const hours = Math.floor((totalSeconds % 86_400) / 3_600)
    const minutes = Math.floor((totalSeconds % 3_600) / 60)
    const parts = []
    if (days) parts.push(`${days}d`)
    if (hours) parts.push(`${hours}h`)
    if (minutes && parts.length < 2) parts.push(`${minutes}m`)
    if (!parts.length) {
      return "<1m"
    }
    return parts.join(" ")
  }

  const uptimeSeconds =
    typeof overviewData?.bot?.uptimeSeconds === "number"
      ? overviewData.bot.uptimeSeconds
      : typeof overviewData?.bot?.uptime === "number"
        ? overviewData.bot.uptime
        : Number(overviewData?.bot?.uptime)
  const botUptimeLabel = formatDuration(uptimeSeconds)

  const buildGuildInviteUrl = (guildId: string) => {
    if (!DISCORD_BOT_INVITE_URL.includes("client_id")) {
      return DISCORD_BOT_INVITE_URL
    }
    const separator = DISCORD_BOT_INVITE_URL.includes("?") ? "&" : "?"
    return `${DISCORD_BOT_INVITE_URL}${separator}guild_id=${encodeURIComponent(guildId)}&disable_guild_select=true`
  }

  const integrationEndpointBase =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/analytics`
      : "/api/integrations/analytics"
  const conciergeUserId =
    typeof user?.id === "string" && user.id.trim().length > 0 ? user.id : "{discordId}"
  const proIntegrationUrl = `${integrationEndpointBase}?discordId=${conciergeUserId}`
  const integrationCurl = `curl -H "Authorization: Bearer <discord_token>" "${proIntegrationUrl}"`
  const analyticsExportUrl =
    selectedGuildId && user?.id ? `/api/analytics/export?guildId=${encodeURIComponent(selectedGuildId)}&discordId=${user.id}` : null

  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case "starter":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      case "pro":
        return "bg-primary/20 text-primary border-primary/30"
      case "enterprise":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30"
      case "free":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  const featureAvailability = useMemo(() => {
    return SERVER_FEATURE_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      options: group.options.map((option) => {
        const minTier = option.minTier ?? "free"
        const requiredIndex = TIER_SEQUENCE.indexOf(minTier)
        const available = tierIndex >= requiredIndex
        return {
          key: option.key,
          label: option.label,
          minTier,
          available,
        }
      }),
    }))
  }, [tierIndex])

  const renderFeatureControls = () => {
    if (selectedGuildId && selectedGuildHasBot) {
      const queueCapValue = getQueueLimitCap(selectedGuildTier)
      const queueLimitSentence =
        queueCapValue === null ? "Queue limit is unlimited" : `Queue limit capped at ${queueCapValue.toLocaleString()} tracks`
      return (
        <div className="space-y-6">
          <div className={`${SETTINGS_CARD_CLASS} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">Feature Controls</h3>
                <p className="text-sm text-foreground/60">
                  Settings saved for <strong>{selectedGuild?.name}</strong>. {queueLimitSentence} on the{" "}
                  {tierDefinition.name} plan.
                </p>
              </div>
              {(serverSettingsLoading || serverSettingsSaving) && (
                <span className="text-xs text-foreground/60">
                  {serverSettingsLoading ? "Loading..." : "Saving..."}
                </span>
              )}
            </div>
            {selectedGuildHasBot && (
              <div className={`${SETTINGS_CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">Global Bot Defaults</h3>
                  {(botSettingsLoading || botSettingsSaving) && (
                    <span className="text-xs text-foreground/60">{botSettingsLoading ? "Loading..." : "Saving..."}</span>
                  )}
                </div>
                {botSettingsError && (
                  <p className="text-xs text-destructive mb-3" role="alert">
                    {botSettingsError}
                  </p>
                )}
                {botSettingsLoading ? (
                  <p className="text-sm text-foreground/60">Loading bot preferences...</p>
                ) : (
                  <div className="space-y-4">
                    {(
                      [
                        {
                          key: "autoJoinVoice",
                          title: "Auto-Join Voice",
                          description: "Have the bot join as soon as music starts playing",
                        },
                        {
                          key: "announceTracks",
                          title: "Now Playing Announcements",
                          description: "Post the current song in chat",
                        },
                        { key: "djMode", title: "DJ Mode", description: "Restrict queue controls to DJ roles only" },
                        {
                          key: "normalizeVolume",
                          title: "Normalize Volume",
                          description: "Smooth out loudness differences between tracks",
                        },
                      ] as const
                    ).map((setting) => (
                      <label
                        key={setting.key}
                        className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 w-5 h-5 rounded cursor-pointer"
                          checked={botSettings[setting.key]}
                          disabled={botSettingsSaving}
                          onChange={(e) => handleBotSettingChange(setting.key, e.target.checked)}
                        />
                        <div>
                          <p className="font-semibold">{setting.title}</p>
                          <p className="text-sm text-foreground/70">{setting.description}</p>
                        </div>
                      </label>
                    ))}

                    <div className="p-4 rounded-lg border border-border/50 bg-card/30">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold">Default Volume</p>
                        <span className="text-sm text-foreground/70">{botSettings.defaultVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        step={1}
                        value={botSettings.defaultVolume}
                        disabled={botSettingsSaving}
                        onChange={(e) => handleBotSettingChange("defaultVolume", Number(e.target.value))}
                        className="w-full"
                        style={{ accentColor: "var(--primary)" }}
                      />
                      <div className="flex justify-between text-[11px] text-foreground/60 mt-1">
                        <span>0%</span>
                        <span>100%</span>
                        <span>200%</span>
                      </div>
                      <p className="text-xs text-foreground/60 mt-2">Applies when the bot joins a new voice channel.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {serverSettingsError && (
              <p className="text-xs text-destructive mb-3" role="alert">
                {serverSettingsError}
              </p>
            )}
            {serverSettingsLoading ? (
              <p className="text-sm text-foreground/60">Loading server-specific settings...</p>
            ) : (
              <div className="space-y-5 py-4">
                {SERVER_FEATURE_GROUPS.map((group) => (
                  <div key={group.id} className={`${SETTINGS_CARD_CLASS} p-4 space-y-3`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <SlidersHorizontal className="text-primary" size={18} />
                      </div>
                      <div>
                        <p className="font-semibold">{group.title}</p>
                        <p className="text-xs text-foreground/60">{group.description}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {group.options.map((option) => {
                        const unlocked =
                          !option.minTier ||
                          TIER_SEQUENCE.indexOf(selectedGuildTier) >= TIER_SEQUENCE.indexOf(option.minTier)
                        const requiredTierLabel = option.minTier ? MEMBERSHIP_TIERS[option.minTier].name : ""
                        const optionValue = serverSettings[option.key]
                        const optionId = `server-feature-${group.id}-${option.key}`
                        const descriptionId = `${optionId}-description`
                        if (option.type === "boolean") {
                          return (
                            <label
                              key={option.key}
                            className={`flex items-start gap-3 p-3 rounded-lg border ${unlocked ? "border-border/50 bg-card/30" : "border-border/30 bg-card/20 opacity-60"
                              }`}
                          >
                              <input
                                type="checkbox"
                                id={optionId}
                                className="mt-1 w-5 h-5 rounded cursor-pointer"
                                checked={Boolean(optionValue)}
                                disabled={!unlocked || serverSettingsSaving}
                                onChange={(e) => handleServerFeatureChange(option.key, e.target.checked)}
                                aria-describedby={descriptionId}
                              />
                              <div>
                                <p className="font-semibold">{option.label}</p>
                                <p id={descriptionId} className="text-xs text-foreground/60">
                                  {option.description}
                                </p>
                                {!unlocked && option.minTier && (
                                  <span className="text-xs text-primary">Requires {requiredTierLabel}</span>
                                )}
                              </div>
                            </label>
                          )
                        }
                        if (option.type === "select") {
                          const choices =
                            option.choices?.filter((choice) =>
                              !choice.minTier ||
                              TIER_SEQUENCE.indexOf(selectedGuildTier) >= TIER_SEQUENCE.indexOf(choice.minTier),
                            ) ?? []
                          const currentChoice = typeof optionValue === "string" ? optionValue : String(choices[0]?.value)
                          return (
                            <div key={option.key} className="space-y-2">
                              <label htmlFor={optionId} className="font-semibold block">
                                {option.label}
                              </label>
                              <p id={descriptionId} className="text-xs text-foreground/60">
                                {option.description}
                              </p>
                              <select
                                id={optionId}
                                value={currentChoice}
                                disabled={!unlocked || serverSettingsSaving}
                                onChange={(e) =>
                                  handleServerFeatureChange(option.key, e.target.value as ServerFeatureSettings[typeof option.key])
                                }
                                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm"
                                aria-describedby={descriptionId}
                              >
                                {choices.map((choice) => (
                                  <option key={choice.value} value={choice.value}>
                                    {choice.label}
                                  </option>
                                ))}
                              </select>
                              {!unlocked && option.minTier && (
                                <p className="text-xs text-primary">Available on {requiredTierLabel} plans.</p>
                              )}
                            </div>
                          )
                        }
                        if (option.type === "range") {
                          const queueCap = getQueueLimitCap(selectedGuildTier)
                          const isUnlimitedCap = option.key === "queueLimit" && queueCap === null
                          const fallbackMax = option.max ?? queueCap ?? 100
                          const sliderMax = isUnlimitedCap
                            ? Math.max(fallbackMax, serverSettings.queueLimit, 250000)
                            : Math.min(fallbackMax, queueCap ?? fallbackMax)
                          const sliderMin = option.min ?? 0
                          const sliderValue =
                            option.key === "queueLimit"
                              ? Math.min(serverSettings.queueLimit, sliderMax)
                              : (optionValue as number)
                          const displayValue =
                            option.key === "queueLimit" ? serverSettings.queueLimit : sliderValue
                          const sliderValueText = Number.isFinite(displayValue)
                            ? `${displayValue.toLocaleString()} ${option.unit ?? "units"}`
                            : "Unlimited"
                          const valueId = `${optionId}-value`
                          const customInputId = `${optionId}-custom`
                          const customHelperId = `${customInputId}-help`
                          const sliderDescriptionText = option.description?.trim()
                          const sliderDescribedBy = sliderDescriptionText ? `${valueId} ${descriptionId}` : valueId
                          return (
                            <div key={option.key} className="p-4 rounded-lg border border-border/50 bg-card/30 space-y-3">
                              <div className="flex items-center justify-between">
                                <label htmlFor={optionId} className="font-semibold">
                                  {option.label}
                                </label>
                                <span id={valueId} className="text-sm text-foreground/70">
                                  {sliderValueText}
                                </span>
                              </div>
                              <input
                                type="range"
                                id={optionId}
                                min={sliderMin}
                                max={sliderMax}
                                step={option.step ?? 1}
                                value={sliderValue}
                                disabled={serverSettingsSaving}
                                onChange={(e) => handleServerFeatureChange(option.key, Number(e.target.value))}
                                className="w-full"
                                style={{ accentColor: "var(--primary)" }}
                                aria-describedby={sliderDescribedBy}
                                aria-valuemin={sliderMin}
                                aria-valuemax={sliderMax}
                                aria-valuenow={sliderValue}
                                aria-valuetext={sliderValueText}
                              />
                              {sliderDescriptionText && (
                                <p id={descriptionId} className="text-xs text-foreground/60">
                                  {option.description}
                                </p>
                              )}
                              {isUnlimitedCap && (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label htmlFor={customInputId} className="sr-only">
                                      Custom queue limit
                                    </label>
                                    <input
                                      type="number"
                                      id={customInputId}
                                      min={sliderMin}
                                      step={option.step ?? 1}
                                      value={serverSettings.queueLimit}
                                      disabled={serverSettingsSaving}
                                      onChange={(e) => handleServerFeatureChange(option.key, Number(e.target.value))}
                                      className="w-32 rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
                                      inputMode="numeric"
                                      aria-describedby={customHelperId}
                                    />
                                    <span id={customHelperId} className="text-xs text-foreground/60">
                                      Enter any custom cap to go beyond the slider range.
                                    </span>
                                  </div>
                                  <p className="text-xs text-foreground/60">
                                    Starter and higher plans unlock unlimited queue sizes—set any number above 50 tracks.
                                  </p>
                                </div>
                              )}
                              <p className="text-xs text-foreground/60">{option.description}</p>
                            </div>
                          )
                        }
                        if (option.type === "multiselect") {
                          const unlockedOption =
                            !option.minTier ||
                            TIER_SEQUENCE.indexOf(selectedGuildTier) >= TIER_SEQUENCE.indexOf(option.minTier)
                          return (
                            <div key={option.key} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Sparkles size={16} className="text-secondary" />
                                <div>
                                  <p className="font-semibold">{option.label}</p>
                                  <p className="text-xs text-foreground/60">{option.description}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(option.options || []).map((eventKey) => (
                                  <button
                                    key={eventKey}
                                    type="button"
                                    onClick={() => handleWebhookEventToggle(eventKey)}
                                    disabled={!unlockedOption || serverSettingsSaving}
                                    className={`px-3 py-1 rounded-full border text-xs ${serverSettings.webhookEvents.includes(eventKey)
                                      ? "border-secondary text-secondary bg-secondary/10"
                                      : "border-border/50 text-foreground/60"
                                      }`}
                                  >
                                    {eventKey.replace("_", " ")}
                                  </button>
                                ))}
                              </div>
                              {!unlockedOption && option.minTier && (
                                <p className="text-xs text-primary">
                                  Available on {MEMBERSHIP_TIERS[option.minTier].name} plans.
                                </p>
                              )}
                            </div>
                          )
                        }
                        if (option.type === "text") {
                          const maxLength = option.maxLength ?? 32
                          const placeholder = option.placeholder ?? ""
                          const textValue = typeof optionValue === "string" ? optionValue : ""
                          const locked = !unlocked || serverSettingsSaving
                          return (
                            <div key={option.key} className="space-y-2">
                              <p className="font-semibold">{option.label}</p>
                              <p className="text-xs text-foreground/60">{option.description}</p>
                              <input
                                type="text"
                                value={textValue}
                                disabled={locked}
                                maxLength={maxLength}
                                placeholder={placeholder}
                                onChange={(e) => {
                                  const nextValue = e.target.value.slice(0, maxLength)
                                  setServerSettings((prev) => ({
                                    ...prev,
                                    [option.key]: nextValue as ServerFeatureSettings[typeof option.key],
                                  }))
                                }}
                                onBlur={(e) => {
                                  const fallbackValue = placeholder || (defaultServerFeatureSettings[option.key] as string)
                                  const sanitized = (e.target.value || "").trim().slice(0, maxLength)
                                  handleServerFeatureChange(
                                    option.key,
                                    (sanitized || fallbackValue) as ServerFeatureSettings[typeof option.key],
                                  )
                                }}
                                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors text-sm"
                              />
                              {!unlocked && option.minTier && (
                                <p className="text-xs text-primary">
                                  Available on {MEMBERSHIP_TIERS[option.minTier].name} plans.
                                </p>
                              )}
                            </div>
                          )
                        }
                        if (option.type === "color") {
                          const fallbackColor =
                            (defaultServerFeatureSettings[option.key] as string) || "#FF4D6D"
                          const currentValue =
                            typeof optionValue === "string" && /^#([0-9a-f]{6})$/i.test(optionValue)
                              ? optionValue
                              : fallbackColor
                          return (
                            <div key={option.key} className="space-y-2">
                              <p className="font-semibold">{option.label}</p>
                              <p className="text-xs text-foreground/60">{option.description}</p>
                              <div className="flex items-center gap-3">
                                <input
                                  type="color"
                                  value={currentValue}
                                  disabled={!unlocked || serverSettingsSaving}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    const sanitized = /^#([0-9a-f]{6})$/i.test(value)
                                      ? value.toUpperCase()
                                      : fallbackColor
                                    handleServerFeatureChange(option.key, sanitized as ServerFeatureSettings[typeof option.key])
                                  }}
                                  className="h-10 w-16 rounded border border-border/60 bg-background cursor-pointer"
                                />
                                <code className="text-sm text-foreground/70">{currentValue}</code>
                              </div>
                              {!unlocked && option.minTier && (
                                <p className="text-xs text-primary">
                                  Available on {MEMBERSHIP_TIERS[option.minTier].name} plans.
                                </p>
                              )}
                            </div>
                          )
                        }
                        return null
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {renderAutomationAuditPanel()}
          {renderConciergeSupport()}
          {renderRegionalRoutingPanel()}
          {renderAccountManagerPanel()}
          {renderSuccessPodPanel()}
          {renderApiTokenPanel()}
          {renderSecurityDeskPanel()}
          {renderDomainBrandingPanel()}
        </div>
      )
    }

    if (guildsWithBot.length > 0) {
      return (
        <div className="rounded-lg border border-border/50 bg-card/20 p-6 text-sm text-foreground/70">
          <p className="font-semibold mb-2">No configurable server selected</p>
          <p>
            Invite VectoBeat to one of your Discord servers or select a guild with the bot installed to unlock feature
            controls.
          </p>
          <div className="mt-4 flex gap-3 flex-wrap">
            <a
              href={DISCORD_BOT_INVITE_URL}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Add VectoBeat to Discord
            </a>
            <Link href="/account" className="text-primary text-sm font-semibold hover:underline">
              Manage subscriptions
            </Link>
          </div>
        </div>
      )
    }

    return null
  }

  const renderAutomationAuditPanel = () => {
    if (!selectedGuildId || !selectedGuildHasBot) {
      return null
    }
    if (!planAllowsAutomation) {
      return (
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-6 space-y-3 text-sm text-foreground/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="text-primary" size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Automation engine audit</p>
              <p className="text-xs text-foreground/60">
                Marketing promises around queue automation map here. Upgrade to unlock live throttling, queue trims, and restart history in the panel.
              </p>
            </div>
          </div>
          <Link href="/pricing" className="inline-flex text-primary font-semibold hover:underline">
            Explore automation plans
          </Link>
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-border/60 bg-card/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">Automation engine audit</p>
            <p className="text-xs text-foreground/60">Eligible plans log queue trims, auto restarts, and throttled commands per shard.</p>
          </div>
          <span className="text-xs text-foreground/60">
            {automationActionsLoading ? "Loading…" : "Last 25 actions"}
          </span>
        </div>
        {automationActionsError && (
          <p className="text-xs text-destructive" role="alert">
            {automationActionsError}
          </p>
        )}
        {!automationActionsError && (
          <>
            {automationActionsLoading ? (
              <p className="text-sm text-foreground/60">Fetching recent automation activity…</p>
            ) : automationActions.length === 0 ? (
              <p className="text-sm text-foreground/60">
                No automation events recorded yet. Once automation manages your queue, actions will appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                {automationActions.slice(0, 5).map((action) => (
                  <li
                    key={action.id}
                    className="flex items-start justify-between gap-4 rounded border border-border/30 bg-background/40 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold">{automationActionLabel(action.action)}</p>
                      <p className="text-xs text-foreground/60">
                        {action.description ?? "Automation engine applied adjustments."}
                      </p>
                    </div>
                    <span className="text-xs text-foreground/60">
                      {formatAutomationTimestamp(action.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    )
  }

  const renderConciergeSupport = () => {
    if (!selectedGuildId || !selectedGuildHasBot) {
      return null
    }
    if (!selectedPlan.features.concierge) {
      return (
        <div className="rounded-lg border border-dashed border-border/50 bg-card/10 p-6 space-y-2 text-sm text-foreground/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="text-primary" size={18} />
            </div>
            <div>
              <p className="font-semibold text-foreground">Concierge desk</p>
              <p className="text-xs text-foreground/60">
                Enterprise onboarding promises white-glove help. Upgrade to Growth or Scale so this panel unlocks scheduling, quotas, and SLA tracking.
              </p>
            </div>
          </div>
          <Link href="/pricing" className="inline-flex text-primary font-semibold hover:underline">
            Unlock concierge access
          </Link>
        </div>
      )
    }
    const monthlyHours = selectedPlan.limits.conciergeHours
    const unlimitedConcierge = monthlyHours === null
    const slaMinutes = selectedPlan.concierge.slaMinutes ?? 240
    const quotaDepleted = !unlimitedConcierge && conciergeUsage?.remaining === 0
    const conciergeLabel = planAllowsSuccessPod ? "Dedicated success pod bridge" : "Concierge hours"
    const conciergeDetail = unlimitedConcierge
      ? "Scale plans receive white-glove scheduling with a 60-minute SLA."
      : "Growth plans include two concierge hours per month for migrations, health reviews, and analytics audits."
    const requestMax =
      typeof conciergeUsage?.remaining === "number"
        ? Math.max(1, conciergeUsage.remaining)
        : typeof monthlyHours === "number"
          ? Math.max(1, monthlyHours)
          : 8
    const remainingCopy = unlimitedConcierge
      ? "Unlimited concierge coverage this cycle."
      : conciergeUsage
        ? `Remaining: ${(conciergeUsage.remaining ?? 0).toLocaleString()}h of ${(conciergeUsage.total ?? monthlyHours ?? 0).toLocaleString()}h this cycle.`
        : "Checking available hours..."
    return (
      <div className="rounded-lg border border-primary/40 bg-card/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-primary">{conciergeLabel}</p>
            <p className="text-xs text-foreground/70">{conciergeDetail}</p>
            <p className="text-xs text-foreground/60">
              SLA: {slaMinutes >= 60 ? `${slaMinutes / 60}h` : `${slaMinutes} minutes`} response. {remainingCopy}
            </p>
          </div>
        </div>
        <form className="space-y-3" onSubmit={handleConciergeRequest}>
          <label className="text-sm font-semibold text-foreground/80">
            Contact email
            <input
              type="email"
              value={conciergeContact}
              onChange={(e) => setConciergeContact(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="you@example.com"
              required
            />
          </label>
          {!unlimitedConcierge && (
            <label className="text-sm font-semibold text-foreground/80">
              Hours needed
              <input
                type="number"
                min={1}
                max={requestMax}
                value={conciergeHours}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (!Number.isFinite(value)) return
                  setConciergeHours(Math.max(1, Math.min(requestMax, value)))
                }}
                disabled={quotaDepleted}
                className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              />
              <span className="text-xs text-foreground/60">
                Requests reset every 30 days. Upgrade to Scale for unlimited concierge access.
              </span>
            </label>
          )}
          <label className="text-sm font-semibold text-foreground/80">
            What do you need?
            <textarea
              value={conciergeSummary}
              onChange={(e) => setConciergeSummary(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm min-h-[100px]"
              placeholder="Share context, timelines, and desired outcomes."
              required
            />
          </label>
          {conciergeError && (
            <p className="text-xs text-destructive" role="alert">
              {conciergeError}
            </p>
          )}
          {conciergeStatus === "success" && (
            <p className="text-xs text-emerald-400" role="status">
              Request received. Our concierge team will respond within the SLA.
            </p>
          )}
          <button
            type="submit"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            disabled={conciergeStatus === "submitting" || quotaDepleted}
          >
            {conciergeStatus === "submitting" ? "Sending..." : "Submit concierge request"}
          </button>
          {quotaDepleted && (
            <p className="text-xs text-foreground/70">
              Concierge quota reached. Scale plans include unlimited concierge coverage.
            </p>
          )}
        </form>
      </div>
    )
  }

  const renderAccountManagerPanel = () => {
    if (!planAllowsSuccessPod || !selectedGuildId || !selectedGuildHasBot) {
      return null
    }
    const hasContact = Boolean(scaleContact)
    const managerName = scaleContact?.managerName || "Dedicated account manager"
    const escalationNotes =
      scaleContact?.escalationNotes || "Escalation bridge will be configured by your success pod."
    return (
      <div className="rounded-lg border border-primary/40 bg-card/20 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-1">Account manager</p>
            <h3 className="text-lg font-bold">Escalation & coverage</h3>
            <p className="text-sm text-foreground/60">
              Reach your account team anytime and follow the documented escalation path for urgent incidents.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (scaleContactLoading) return
              void refreshScaleContact()
            }}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
            disabled={scaleContactLoading}
          >
            {scaleContactLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {scaleContactError && (
          <p className="text-xs text-destructive" role="alert">
            {scaleContactError}
          </p>
        )}
        {!hasContact && !scaleContactLoading && (
          <p className="text-sm text-foreground/65">
            Your account manager details are being provisioned. Ops will share direct contacts shortly.
          </p>
        )}
        {hasContact && (
          <div className="rounded-md border border-border/40 bg-background/60 p-4 space-y-2">
            <div>
              <p className="text-sm font-semibold text-primary">{managerName}</p>
              {scaleContact?.managerEmail && (
                <a
                  href={
                    scaleContact.managerEmail
                      ? `mailto:${encodeURIComponent(scaleContact.managerEmail)}`
                      : "#"
                  }
                  className="text-xs text-primary/80 hover:underline break-all"
                >
                  {scaleContact.managerEmail}
                </a>
              )}
              {scaleContact?.managerDiscord && (
                <p className="text-xs text-foreground/60">Discord: {scaleContact.managerDiscord}</p>
              )}
            </div>
            {scaleContact?.escalationChannel && (
              <p className="text-xs text-foreground/65">Primary escalation: {scaleContact.escalationChannel}</p>
            )}
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{escalationNotes}</p>
          </div>
        )}
      </div>
    )
  }

  const renderRegionalRoutingPanel = () => {
    if (!selectedGuildId || !selectedGuildHasBot) {
      return null
    }
    if (!planAllowsRegionalRouting) {
      return (
        <div className="rounded-lg border border-dashed border-border/50 bg-background/40 p-6 space-y-2 text-sm text-foreground/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Globe size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Regional routing</p>
              <p className="text-xs text-foreground/60">
                Marketing promises regional failover and routing. Upgrade to Growth to pin Lavalink nodes from this control panel.
              </p>
            </div>
          </div>
          <Link href="/pricing" className="inline-flex text-primary font-semibold hover:underline">
            Upgrade for routing controls
          </Link>
        </div>
      )
    }
    const desiredRegion = String(serverSettings.lavalinkRegion || "auto").toLowerCase()
    const regionLabels: Record<string, string> = {
      auto: "Auto (closest node)",
      us: "United States",
      eu: "Europe",
      apac: "APAC",
    }
    const desiredLabel = regionLabels[desiredRegion] || desiredRegion.toUpperCase()
    const currentNodeRegion = (routingPlayerState?.nodeRegion || "").toLowerCase()
    const currentNodeName = routingPlayerState?.nodeName || null
    const usingFallback =
      Boolean(currentNodeRegion && desiredRegion && desiredRegion !== "auto" && currentNodeRegion !== desiredRegion)
    const lastSyncLabel = routingUpdatedAt ? new Date(routingUpdatedAt).toLocaleTimeString() : "recently"
    const regionOptions = selectedPlan.serverSettings.allowedLavalinkRegions.map((value) => ({
      value,
      label: regionLabels[value] ?? value.toUpperCase(),
    }))

    return (
      <div className="rounded-lg border border-primary/40 bg-card/20 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-1">Regional routing</p>
            <h3 className="text-lg font-bold">Pin playback to your preferred region</h3>
            <p className="text-sm text-foreground/60">
              When you change the region or a node fails, we seamlessly move players without interrupting tracks.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline disabled:opacity-60"
            disabled={routingStatusLoading}
            onClick={() => {
              if (routingStatusLoading) return
              void refreshRoutingStatus()
            }}
          >
            <RefreshCw className={routingStatusLoading ? "animate-spin" : ""} size={14} />
            {routingStatusLoading ? "Syncing…" : "Refresh"}
          </button>
        </div>
        {routingStatusError && (
          <p className="text-xs text-destructive" role="alert">
            {routingStatusError}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border/40 bg-background/50 p-4 space-y-1">
            <p className="text-sm font-semibold text-foreground/80">Preferred region</p>
            <p className="text-lg font-bold text-primary">{desiredLabel}</p>
            <p className="text-xs text-foreground/60">
              Last sync {lastSyncLabel}. We poll the bot every few seconds to keep routing aligned.
            </p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/50 p-4 space-y-1">
            <p className="text-sm font-semibold text-foreground/80">Active node</p>
            {currentNodeName ? (
              <p className="text-lg font-semibold">
                {currentNodeName}{" "}
                <span className="text-sm font-normal text-foreground/60">
                  ({(currentNodeRegion || "auto").toUpperCase()})
                </span>
              </p>
            ) : (
              <p className="text-sm text-foreground/60">
                No active session. Once playback resumes we will route to {desiredLabel}.
              </p>
            )}
            {usingFallback && (
              <p className="text-xs text-amber-400">
                Currently operating on {(currentNodeRegion || "auto").toUpperCase()} while waiting for{" "}
                {desiredRegion.toUpperCase()} capacity.
              </p>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-foreground/60 mb-2 flex items-center gap-2">
            <Server size={14} /> Cluster health
          </p>
          {routingNodes.length === 0 ? (
            <p className="text-sm text-foreground/60">
              Node metrics are unavailable right now. Refresh in a moment to verify regional status.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {routingNodes.map((node) => (
                <div
                  key={node.name}
                  className="rounded-md border border-border/40 bg-background/50 px-3 py-2 text-sm space-y-1"
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>{node.name}</span>
                    <span className={node.available ? "text-emerald-400 text-xs" : "text-destructive text-xs"}>
                      {node.available ? "Online" : "Offline"}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/60">
                    Region {(node.region || "auto").toString().toUpperCase()} • Players{" "}
                    {node.playingPlayers ?? node.players ?? 0}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2" htmlFor={REGION_SELECT_ID}>
              <Globe size={16} />
              Preferred region
            </label>
            <select
              id={REGION_SELECT_ID}
              value={serverSettings.lavalinkRegion}
              onChange={(event) =>
                handleServerFeatureChange(
                  "lavalinkRegion",
                  event.target.value as ServerFeatureSettings["lavalinkRegion"],
                )
              }
              disabled={serverSettingsSaving}
              className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              aria-describedby={REGION_SELECT_HELP_ID}
            >
              {regionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p id={REGION_SELECT_HELP_ID} className="text-xs text-foreground/60">
              Changes are pushed instantly to the bot and any active player will switch without dropping tracks.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground/80">Force a rebalance</label>
            <button
              type="button"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              disabled={routingRebalanceStatus === "running"}
              onClick={() => {
                if (routingRebalanceStatus === "running") return
                void handleRoutingRebalance()
              }}
            >
              {routingRebalanceStatus === "running" ? "Rebalancing..." : "Rebalance now"}
            </button>
            {routingRebalanceStatus === "success" && (
              <p className="text-xs text-emerald-400" role="status">
                Routing signal sent. Players will migrate within a few seconds.
              </p>
            )}
            {routingRebalanceStatus === "error" && routingRebalanceError && (
              <p className="text-xs text-destructive" role="alert">
                {routingRebalanceError}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderSuccessPodPanel = () => {
    if (!selectedGuildId || !selectedGuildHasBot) {
      return null
    }
    if (!planAllowsSuccessPod) {
      return (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-6 space-y-2 text-sm text-foreground/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="text-primary" size={18} />
            </div>
            <div>
              <p className="font-semibold text-foreground">Scale success pod</p>
              <p className="text-xs text-foreground/60">
                Concierge marketing promises escalation teams. Upgrade to Scale to coordinate through this pod workspace directly inside the panel.
              </p>
            </div>
          </div>
          <Link href="/pricing" className="inline-flex text-primary font-semibold hover:underline">
            Meet the success pod
          </Link>
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-border/60 bg-card/30 p-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-1">Scale success pod</p>
          <h3 className="text-lg font-bold">Coordinate with your success pod</h3>
          <p className="text-sm text-foreground/70">
            Submit a request and the dedicated Scale pod will reach out with a migration plan or escalation bridge.
          </p>
        </div>
        <form className="space-y-3" onSubmit={handleSuccessPodRequest}>
          <label className="text-sm font-semibold text-foreground/80">
            Contact email
            <input
              type="email"
              value={successContact}
              onChange={(e) => setSuccessContact(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="text-sm font-semibold text-foreground/80">
            What do you need?
            <textarea
              value={successSummary}
              onChange={(e) => setSuccessSummary(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm min-h-[120px]"
              placeholder="Share context, timelines, and desired outcomes."
              required
            />
          </label>
          {successError && (
            <p className="text-xs text-destructive" role="alert">
              {successError}
            </p>
          )}
          {successStatus === "success" && (
            <p className="text-xs text-emerald-400" role="status">
              Request received. Your success pod will reach out shortly.
            </p>
          )}
          <button
            type="submit"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            disabled={successStatus === "submitting"}
          >
            {successStatus === "submitting" ? "Sending..." : "Send request"}
          </button>
        </form>
        <div className="border-t border-border/30 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground/80">Lifecycle</p>
              <p className="text-xs text-foreground/60">
                Track acknowledgement, scheduling, and resolution updates for your pod requests.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              disabled={successPodLoading}
              onClick={() => {
                void fetchSuccessPodRequests()
              }}
            >
              {successPodLoading ? "Syncing…" : "Refresh"}
            </button>
          </div>
          {successPodError && (
            <p className="text-xs text-destructive" role="alert">
              {successPodError}
            </p>
          )}
          {successPodLoading ? (
            <p className="text-sm text-foreground/60">Syncing success pod workflow…</p>
          ) : successPodRequests.length === 0 ? (
            <p className="text-sm text-foreground/60">
              No active success pod requests yet. Submit the form above to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {successPodRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-border/40 bg-background/50 p-3 space-y-2 shadow-inner"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-foreground/90">{successStatusLabel(request.status)}</p>
                      <p className="text-xs text-foreground/60">
                        Submitted {formatSuccessTimestamp(request.submittedAt) ?? "recently"}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${successStatusBadgeClass(request.status)}`}
                    >
                      {successStatusLabel(request.status)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80">
                    {request.summary.length > 400 ? `${request.summary.slice(0, 400)}…` : request.summary}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-foreground/65">
                    {request.assignedTo && <span>Assigned to {request.assignedTo}</span>}
                    {request.assignedContact && <span>Contact {request.assignedContact}</span>}
                    {request.contact && <span>Requester: {request.contact}</span>}
                    {request.scheduledFor && (
                      <span>Scheduled for {formatSuccessTimestamp(request.scheduledFor) ?? "TBD"}</span>
                    )}
                    {request.resolvedAt && (
                      <span>Resolved {formatSuccessTimestamp(request.resolvedAt) ?? "recently"}</span>
                    )}
                  </div>
                  <ul className="space-y-2 border-t border-border/30 pt-2">
                    {(request.timeline ?? []).slice(-4).map((entry) => (
                      <li key={entry.id} className="flex items-start gap-3 text-xs text-foreground/70">
                        <span className="mt-1 h-2 w-2 rounded-full bg-primary/70" />
                        <div>
                          <p className="font-semibold text-foreground/80">
                            {successStatusLabel(entry.kind)}{" "}
                            <span className="font-normal text-foreground/60">
                              {formatSuccessTimestamp(entry.createdAt) ?? ""}
                            </span>
                          </p>
                          {entry.note && <p>{entry.note}</p>}
                          {entry.actor && <p className="text-[11px] text-foreground/50">By {entry.actor}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderApiTokenPanel = () => {
    if (!selectedGuildId || !selectedGuildHasBot) {
      return null
    }
    if (!planAllowsApiTokens) {
      return (
        <div className="rounded-lg border border-dashed border-border/50 bg-background/30 p-6 space-y-2 text-sm text-foreground/70">
          <p className="font-semibold">API Access</p>
          <p>Your current plan does not include API tokens. Upgrade to unlock programmatic access for automation.</p>
          <Link href="/pricing" className="inline-flex text-primary text-sm font-semibold hover:underline">
            View plans
          </Link>
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-border/50 bg-card/20 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-1">API access</p>
            <h3 className="text-lg font-bold">API tokens</h3>
            <p className="text-sm text-foreground/70">
              Starter and higher plans can generate scoped API tokens for automation, queue sync, and integrations.
            </p>
          </div>
          <span className="text-xs text-foreground/60">
            {apiTokenLoading ? "Loading tokens..." : `${apiTokens.length}/10 tokens`}
          </span>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/20 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Token lifecycle policy</p>
            <p className="text-xs text-foreground/60">
              Require all newly generated tokens to expire automatically after a set number of days.
            </p>
          </div>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleSaveTokenPolicy}>
            <label className="flex flex-col text-xs font-semibold text-foreground/70">
              Default TTL (days)
              <input
                type="number"
                min={0}
                max={365}
                value={apiTokenTtlInput}
                onChange={(event) => setApiTokenTtlInput(event.target.value)}
                className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-normal"
                aria-describedby="token-ttl-hint"
              />
            </label>
            <button
              type="submit"
              disabled={apiTokenPolicySaving}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {apiTokenPolicySaving ? "Saving…" : "Save policy"}
            </button>
            <p id="token-ttl-hint" className="text-xs text-foreground/60">
              Use 0 for no automatic expiration. Max 365 days.
            </p>
          </form>
          {apiTokenPolicyMessage && (
            <p className="text-xs text-emerald-400" role="status">
              {apiTokenPolicyMessage}
            </p>
          )}
          {apiTokenPolicyError && (
            <p className="text-xs text-destructive" role="alert">
              {apiTokenPolicyError}
            </p>
          )}
        </div>
        <form className="space-y-4" onSubmit={handleCreateApiToken}>
          <div className="md:flex md:space-x-3 md:space-y-0 space-y-3">
            <input
              type="text"
              value={apiTokenLabel}
              onChange={(e) => setApiTokenLabel(e.target.value)}
              className="flex-1 rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="Token label (e.g. Production)"
              maxLength={48}
              aria-label="API token label"
              required
            />
            <button
              type="submit"
              disabled={apiTokenLoading}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {apiTokenLoading ? "Working..." : "Generate token"}
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground/70">Scopes</p>
            <div className="grid gap-2 md:grid-cols-2">
              {API_SCOPE_DEFINITIONS.map((scope) => {
                const checked = apiTokenScopes.includes(scope.value)
                return (
                  <label
                    key={scope.value}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${checked ? "border-primary/40 bg-primary/5" : "border-border/40 bg-background/20"
                      }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) => toggleApiScope(scope.value, e.target.checked)}
                    />
                    <div>
                      <p className="text-sm font-semibold">{scope.label}</p>
                      <p className="text-xs text-foreground/60">{scope.description}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </form>
        {apiTokenSecret && (
          <div className="rounded-lg border border-emerald-400/50 bg-emerald-500/5 p-4 space-y-1">
            <p className="text-sm font-semibold text-emerald-200">
              {apiTokenSecretSource === "rotate" ? "Token rotated" : "New token"}
            </p>
            <code className="text-sm break-all text-emerald-100">{apiTokenSecret}</code>
            <p className="text-xs text-emerald-200/70">
              Copy this token now. For security reasons it won&apos;t be shown again.
            </p>
          </div>
        )}
        {apiTokenError && (
          <p className="text-xs text-destructive" role="alert">
            {apiTokenError}
          </p>
        )}
        <div className="space-y-3">
          {apiTokens.length === 0 ? (
            <p className="text-sm text-foreground/60">No tokens yet.</p>
          ) : (
            apiTokens.map((token) => {
              const lifecycleBusy = apiTokenAction?.tokenId === token.id
              const lifecycleAction = apiTokenAction?.action
              return (
                <div
                  key={token.id}
                  className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{token.label}</p>
                      <p className="text-xs text-foreground/60">
                        Created {new Date(token.createdAt).toLocaleString()} · ends with {token.lastFour}
                      </p>
                      {token.rotatedAt && (
                        <p className="text-[11px] text-foreground/50">
                          Rotated {new Date(token.rotatedAt).toLocaleString()}
                        </p>
                      )}
                      {token.lastUsedAt && (
                        <p className="text-[11px] text-foreground/50">
                          Last used {new Date(token.lastUsedAt).toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-foreground/60 mt-1">{formatExpiryLabel(token.expiresAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => handleRotateApiToken(token.id)}
                        className="text-primary hover:underline disabled:opacity-50"
                        disabled={apiTokenRotating === token.id}
                      >
                        {apiTokenRotating === token.id ? "Rotating…" : "Rotate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTokenLifecycleAction(token.id, token.status === "active" ? "disable" : "enable")}
                        className="text-primary hover:underline disabled:opacity-50"
                        disabled={lifecycleBusy}
                      >
                        {token.status === "active"
                          ? lifecycleBusy && lifecycleAction === "disable"
                            ? "Disabling…"
                            : "Disable"
                          : lifecycleBusy && lifecycleAction === "enable"
                            ? "Enabling…"
                            : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTokenLifecycleAction(token.id, token.leakDetected ? "clear_leak" : "mark_leak")}
                        className="text-primary hover:underline disabled:opacity-50"
                        disabled={lifecycleBusy}
                      >
                        {token.leakDetected
                          ? lifecycleBusy && lifecycleAction === "clear_leak"
                            ? "Clearing…"
                            : "Clear leak"
                          : lifecycleBusy && lifecycleAction === "mark_leak"
                            ? "Flagging…"
                            : "Mark leak"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteApiToken(token.id)}
                        className="text-destructive hover:underline disabled:opacity-50"
                        disabled={lifecycleBusy}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-foreground/70">
                    <span
                      className={`px-2 py-1 rounded-full border ${token.status === "active"
                        ? "border-emerald-500/60 text-emerald-200 bg-emerald-500/10"
                        : "border-border/50 text-foreground/70 bg-background/20"
                        }`}
                    >
                      {token.status === "active" ? "Active" : "Disabled"}
                    </span>
                    {token.leakDetected && (
                      <span className="px-2 py-1 rounded-full border border-amber-400/70 text-amber-200 bg-amber-500/10">
                        Leak flagged
                      </span>
                    )}
                    {token.expiresAt && (
                      <span className="px-2 py-1 rounded-full border border-primary/40 text-primary bg-primary/5">
                        TTL enforced
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-foreground/70">
                    {token.scopes.map((scope) => {
                      const scopeDef = API_SCOPE_DEFINITIONS.find((definition) => definition.value === scope)
                      return (
                        <span key={`${token.id}-${scope}`} className="px-2 py-1 rounded-full border border-border/40">
                          {scopeDef?.label ?? scope}
                        </span>
                      )
                    })}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground/70" htmlFor={`token-expiry-${token.id}`}>
                      Expiration override (local time)
                    </label>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <input
                        id={`token-expiry-${token.id}`}
                        type="datetime-local"
                        value={apiTokenExpiryDrafts[token.id] ?? ""}
                        onChange={(event) =>
                          setApiTokenExpiryDrafts((prev) => ({ ...prev, [token.id]: event.target.value }))
                        }
                        className="flex-1 rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApplyTokenExpiry(token.id)}
                          className="rounded-md border border-border/40 px-3 py-1 text-xs font-semibold text-foreground hover:bg-background/50 disabled:opacity-50"
                          disabled={lifecycleBusy && lifecycleAction === "set_expiry"}
                        >
                          {lifecycleBusy && lifecycleAction === "set_expiry" ? "Saving…" : "Save expiry"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleClearTokenExpiry(token.id)}
                          className="rounded-md border border-border/40 px-3 py-1 text-xs font-semibold text-foreground hover:bg-background/50 disabled:opacity-50"
                          disabled={lifecycleBusy && lifecycleAction === "set_expiry"}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="rounded-lg border border-border/40 bg-background/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold">Audit log</p>
              <p className="text-xs text-foreground/60">Rotation, deletion, and usage events appear here.</p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              disabled={apiTokenAuditLoading}
              onClick={() => void fetchApiTokenAudit()}
            >
              {apiTokenAuditLoading ? "Syncing…" : "Refresh"}
            </button>
          </div>
          {apiTokenAuditError && (
            <p className="text-xs text-destructive" role="alert">
              {apiTokenAuditError}
            </p>
          )}
          {apiTokenAuditLoading ? (
            <p className="text-sm text-foreground/60">Loading audit events…</p>
          ) : apiTokenAudit.length === 0 ? (
            <p className="text-sm text-foreground/60">No audit events recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {apiTokenAudit.map((event) => (
                <li key={event.id} className="rounded-md border border-border/40 bg-background/50 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="font-semibold text-foreground">{event.action}</span>
                    <span className="text-foreground/60">{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-foreground/70">
                    {event.actorName ? `By ${event.actorName}` : "System"}{" "}
                    {event.metadata?.label ? `· ${event.metadata.label}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  const renderSecurityDeskPanel = () => {
    if (!selectedGuildId || !selectedGuildHasBot) {
      return null
    }
    if (!planAllowsSecurityDesk) {
      return (
        <div className="rounded-lg border border-dashed border-border/30 bg-background/20 p-6 space-y-2 text-sm text-foreground/70">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center">
              <ShieldAlert className="text-primary" size={18} />
            </div>
            <div>
              <p className="font-semibold text-foreground">Security &amp; Compliance Desk</p>
              <p className="text-xs text-foreground/60">
                Growth plans unlock audit-ready exports for commands, API calls, and administrative changes with filtering.
              </p>
            </div>
          </div>
          <Link href="/pricing" className="inline-flex text-primary text-sm font-semibold hover:underline">
            Compare plans
          </Link>
        </div>
      )
    }
    const hasEvents = securityEvents.length > 0
    return (
      <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-1">Security &amp; Compliance Desk</p>
            <h3 className="text-lg font-bold">Audit log exports</h3>
            <p className="text-sm text-foreground/70">
              Filter commands, API calls, and admin actions by actor or date range. Export JSONL or CSV for investigations.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void handleSecurityExport("csv")}
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold text-foreground hover:bg-background/40 disabled:opacity-50"
              disabled={securityExporting !== null}
            >
              <FileDown size={14} />
              {securityExporting === "csv" ? "Exporting…" : "Export CSV"}
            </button>
            <button
              type="button"
              onClick={() => void handleSecurityExport("jsonl")}
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-semibold text-foreground hover:bg-background/40 disabled:opacity-50"
              disabled={securityExporting !== null}
            >
              <FileDown size={14} />
              {securityExporting === "jsonl" ? "Exporting…" : "Export JSONL"}
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs font-semibold text-foreground/70">
            From
            <input
              type="date"
              value={securityFilterDraft.from}
              onChange={(event) => setSecurityFilterDraft((prev) => ({ ...prev, from: event.target.value }))}
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-foreground/70">
            To
            <input
              type="date"
              value={securityFilterDraft.to}
              onChange={(event) => setSecurityFilterDraft((prev) => ({ ...prev, to: event.target.value }))}
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-foreground/70">
            Actor
            <input
              type="text"
              value={securityFilterDraft.actor}
              onChange={(event) => setSecurityFilterDraft((prev) => ({ ...prev, actor: event.target.value }))}
              placeholder="email, Discord ID, or name"
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-foreground/70">
            Event type
            <select
              value={securityFilterDraft.type}
              onChange={(event) =>
                setSecurityFilterDraft((prev) => ({ ...prev, type: event.target.value as SecurityAuditFilters["type"] }))
              }
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-normal"
            >
              <option value="all">All events</option>
              <option value="command">Commands</option>
              <option value="api">API calls</option>
              <option value="admin">Admin actions</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApplySecurityFilters}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={handleResetSecurityFilters}
            className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background/50"
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background/50 disabled:opacity-50"
            disabled={securityLoading}
            onClick={() => void fetchSecurityAuditEvents()}
          >
            {securityLoading ? "Syncing…" : "Refresh"}
          </button>
        </div>
        {securityError && (
          <p className="text-xs text-destructive" role="alert">
            {securityError}
          </p>
        )}
        {securityLoading ? (
          <p className="text-sm text-foreground/60">Syncing audit events…</p>
        ) : !hasEvents ? (
          <p className="text-sm text-foreground/60">No audit events match the selected filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/40 bg-background/20">
            <table className="min-w-full divide-y divide-border/40 text-sm">
              <thead className="bg-background/40 text-xs uppercase tracking-wide text-foreground/60">
                <tr>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {securityEvents.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          event.type === "api"
                            ? "bg-primary/10 text-primary"
                            : event.type === "command"
                              ? "bg-amber-500/15 text-amber-200"
                              : "bg-emerald-500/15 text-emerald-200"
                        }`}
                      >
                        {event.type === "api" ? "API call" : event.type === "command" ? "Command" : "Admin"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{event.source}</p>
                      {event.metadata?.origin && (
                        <p className="text-xs text-foreground/60">Origin: {String(event.metadata.origin)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {event.actor ? (
                        <>
                          <p className="font-semibold">{event.actor}</p>
                          {event.actorId && <p className="text-xs text-foreground/60">{event.actorId}</p>}
                        </>
                      ) : (
                        <p className="text-xs text-foreground/50">System</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-foreground/80">{event.description || "No description"}</p>
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <pre className="mt-2 rounded bg-background/70 p-2 text-[11px] text-foreground/70 overflow-x-auto">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-foreground/70">{formatSecurityTimestamp(event.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="space-y-3 border-t border-border/30 pt-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">Access logs</p>
            <p className="text-xs text-foreground/60">
              Panel logins and API token usage including IP + geolocation data.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs font-semibold text-foreground/70">
              From
              <input
                type="date"
                value={securityAccessFilterDraft.from}
                onChange={(event) =>
                  setSecurityAccessFilterDraft((prev) => ({ ...prev, from: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-foreground/70">
              To
              <input
                type="date"
                value={securityAccessFilterDraft.to}
                onChange={(event) =>
                  setSecurityAccessFilterDraft((prev) => ({ ...prev, to: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-foreground/70">
              Actor / token
              <input
                type="text"
                value={securityAccessFilterDraft.actor}
                onChange={(event) =>
                  setSecurityAccessFilterDraft((prev) => ({ ...prev, actor: event.target.value }))
                }
                placeholder="User email, Discord ID, or token label"
                className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApplyAccessFilters}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={handleResetAccessFilters}
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background/50"
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background/50 disabled:opacity-50"
              disabled={securityAccessLoading}
              onClick={() => void fetchSecurityAccessLogs()}
            >
              {securityAccessLoading ? "Syncing…" : "Refresh"}
            </button>
          </div>
          {securityAccessError && (
            <p className="text-xs text-destructive" role="alert">
              {securityAccessError}
            </p>
          )}
        {securityAccessLoading ? (
          <p className="text-sm text-foreground/60">Syncing access logs…</p>
        ) : securityAccessLogs.length === 0 ? (
          <p className="text-sm text-foreground/60">No access events recorded for the selected window.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/40 bg-background/30">
            <table className="min-w-full divide-y divide-border/40 text-sm">
              <thead className="bg-background/40 text-xs uppercase tracking-wide text-foreground/60">
                <tr>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-left">IP address</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {securityAccessLogs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-foreground">{formatAccessTypeLabel(log.type)}</p>
                      {log.description && <p className="text-xs text-foreground/60">{log.description}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-foreground">
                        {log.actorName || log.actorId || "Unknown"}
                      </p>
                      {log.actorName && log.actorId && (
                        <p className="text-xs text-foreground/60">{log.actorId}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-foreground/70">{log.location || "Unknown"}</td>
                    <td className="px-3 py-2 text-sm text-foreground/70">{log.ipAddress || "Unknown"}</td>
                    <td className="px-3 py-2 text-sm text-foreground/70">
                      <p>{log.source || "N/A"}</p>
                      {log.userAgent && (
                        <p className="text-[11px] text-foreground/50 break-all">{log.userAgent}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-foreground/70">{formatSecurityTimestamp(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="space-y-3 border-t border-border/30 pt-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">Data residency proofs</p>
          <p className="text-xs text-foreground/60">
            Export signed attestations for auditors with per-region residency statements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background/50 disabled:opacity-50"
            disabled={residencyLoading}
            onClick={() => void fetchResidencyProofs()}
          >
            {residencyLoading ? "Syncing…" : "Refresh"}
          </button>
        </div>
        {residencyError && (
          <p className="text-xs text-destructive" role="alert">
            {residencyError}
          </p>
        )}
        {residencyLoading ? (
          <p className="text-sm text-foreground/60">Syncing residency proofs…</p>
        ) : residencyProofs.length === 0 ? (
          <p className="text-sm text-foreground/60">No residency attestations available for this plan.</p>
        ) : (
          <div className="grid gap-4">
            {residencyProofs.map((proof) => (
              <div key={proof.id} className="rounded-lg border border-border/40 bg-background/20 p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{proof.region}</p>
                    <p className="text-xs text-foreground/60">{proof.provider}</p>
                    <p className="text-xs text-foreground/60">
                      Last audit {formatSecurityTimestamp(proof.lastAudit)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDownloadResidencyAttestation(proof.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background/40 disabled:opacity-50"
                    disabled={residencyDownloading === proof.id}
                  >
                    <FileText size={14} />
                    {residencyDownloading === proof.id ? "Preparing…" : "Download attestation"}
                  </button>
                </div>
                <div className="text-xs text-foreground/70 space-y-2">
                  <div>
                    <p className="font-semibold text-foreground">Data centers</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {proof.dataCenters.map((dc) => (
                        <li key={`${proof.id}-${dc}`}>{dc}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Replication</p>
                    <p>{proof.replication}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Controls</p>
                    <p>{proof.controls.join(", ")}</p>
                  </div>
                  <p className="italic text-foreground/70">“{proof.statement}”</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

  const renderDomainBrandingPanel = () => {
    if (!selectedGuildId || !selectedGuildHasBot || !planAllowsApiTokens) {
      return null
    }
    const domainStatus = serverSettings.customDomainStatus || "unconfigured"
    const tlsStatus = serverSettings.customDomainTlsStatus || "pending"
    const dnsRecord = serverSettings.customDomainDnsRecord || BRANDING_CNAME_TARGET
    const statusCopy: Record<string, string> = {
      unconfigured: "No domain configured",
      pending_dns: "Waiting for DNS (CNAME) to resolve",
      pending_tls: "DNS detected. Issuing TLS certificates.",
      verified: "Domain active",
      failed: "Validation failed",
    }
    const tlsCopy: Record<string, string> = {
      pending: "Waiting for TLS issuance",
      active: "TLS certificate active",
      failed: "TLS issuance failed",
    }
    const showActivate = serverSettings.customDomain && domainStatus !== "verified"
    return (
      <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Domain branding</p>
            <h3 className="text-lg font-bold">Custom CNAME + mail branding</h3>
            <p className="text-sm text-foreground/70">
              Point your own domain at VectoBeat dashboards and send concierge mailers from a trusted address.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-foreground/80">
            Custom domain
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="status.your-domain.com"
              value={customDomainInput}
              onChange={(e) => setCustomDomainInput(e.target.value)}
            />
            <span className="text-xs text-foreground/60">
              Create a CNAME pointing to <code>{dnsRecord}</code>.
            </span>
          </label>
          <div className="rounded-md border border-border/50 bg-background/50 px-3 py-2 text-xs text-foreground/70 mt-2 md:mt-0">
            <p className="font-semibold text-foreground mb-1">DNS instructions</p>
            <p>Add a CNAME record:</p>
            <pre className="bg-card/50 rounded px-2 py-1 mt-2">
              {`Host: ${customDomainInput || "example.yourdomain.com"}
Target: ${dnsRecord}`}
            </pre>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-foreground/80">
            Asset pack URL
            <input
              type="url"
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="https://cdn.yourdomain.com/vecto-assets.json"
              value={assetPackInput}
              onChange={(e) => setAssetPackInput(e.target.value)}
            />
            <span className="text-xs text-foreground/60">
              Provide a JSON descriptor with logos, colors, and mail templates.
            </span>
          </label>
          <label className="text-sm font-semibold text-foreground/80">
            Mail from address
            <input
              type="email"
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="alerts@yourdomain.com"
              value={mailFromInput}
              onChange={(e) => setMailFromInput(e.target.value)}
            />
            <span className="text-xs text-foreground/60">
              Concierge + automation mailers will use this address once TLS is active.
            </span>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-foreground/80">
            Embed accent color
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="#FF4D6D"
              value={embedAccentInput}
              onChange={(e) => setEmbedAccentInput(e.target.value)}
            />
            <span className="text-xs text-foreground/60">Overrides default embed border color (hex).</span>
          </label>
          <label className="text-sm font-semibold text-foreground/80">
            Embed logo URL
            <input
              type="url"
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="https://cdn.yourdomain.com/logo.png"
              value={embedLogoInput}
              onChange={(e) => setEmbedLogoInput(e.target.value)}
            />
            <span className="text-xs text-foreground/60">Displayed as thumbnail on bot embeds.</span>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-foreground/80">
            Embed CTA label
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="View status page"
              value={embedCtaLabelInput}
              onChange={(e) => setEmbedCtaLabelInput(e.target.value)}
            />
            <span className="text-xs text-foreground/60">Shown as an action field on bot embeds.</span>
          </label>
          <label className="text-sm font-semibold text-foreground/80">
            Embed CTA URL
            <input
              type="url"
              className="mt-1 w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm"
              placeholder="https://status.yourdomain.com"
              value={embedCtaUrlInput}
              onChange={(e) => setEmbedCtaUrlInput(e.target.value)}
            />
          </label>
        </div>
        <div className="rounded-md border border-border/40 bg-background/40 p-4 text-sm">
          <p className="font-semibold text-foreground">Status</p>
          <p className="text-xs text-foreground/60">
            Domain: <span className="font-semibold text-foreground">{statusCopy[domainStatus] ?? domainStatus}</span>
          </p>
          <p className="text-xs text-foreground/60">
            TLS: <span className="font-semibold text-foreground">{tlsCopy[tlsStatus] ?? tlsStatus}</span>
          </p>
          {serverSettings.customDomainVerifiedAt && (
            <p className="text-xs text-foreground/60">
              Verified at {new Date(serverSettings.customDomainVerifiedAt).toLocaleString()}
            </p>
          )}
        </div>
        {domainError && (
          <p className="text-xs text-destructive" role="alert">
            {domainError}
          </p>
        )}
        {domainMessage && (
          <p className="text-xs text-emerald-400" role="status">
            {domainMessage}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDomainSave}
            disabled={domainSaving}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {domainSaving ? "Saving…" : "Save & Request TLS"}
          </button>
          {showActivate && (
            <button
              type="button"
              onClick={handleDomainActivate}
              disabled={domainSaving}
              className="px-4 py-2 rounded-lg border border-primary/40 text-primary font-semibold hover:bg-primary/10 transition-colors disabled:opacity-60"
            >
              Mark domain active
            </button>
          )}
          {serverSettings.customDomain && (
            <button
              type="button"
              onClick={handleDomainReset}
              disabled={domainSaving}
              className="px-4 py-2 rounded-lg border border-border/40 text-foreground/70 hover:bg-border/10 transition-colors disabled:opacity-60"
            >
              Reset domain
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderAdvancedAnalyticsContent = () => {
    if (!planAllowsAdvancedAnalytics) {
      return (
        <div className="rounded-lg border border-dashed border-border/50 bg-background/40 p-6 text-sm text-foreground/70">
          Your current plan only includes read-only analytics. Upgrade to unlock traffic breakdowns, engagement metrics,
          analytics exports, and queue history archives.
          <Link href="/pricing" className="inline-flex text-primary font-semibold ml-2">
            Upgrade now
          </Link>
        </div>
      )
    }
    if (advancedAnalyticsLoading) {
      return <p className="text-sm text-foreground/60">Loading advanced analytics…</p>
    }
    if (advancedAnalyticsError) {
      return (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-destructive" role="alert">
            {advancedAnalyticsError}
          </p>
          <button
            onClick={handleRefreshAnalytics}
            className="inline-flex items-center justify-center px-4 py-2 text-sm rounded-lg border border-primary/40 text-primary font-semibold hover:bg-primary/10 transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    if (!advancedAnalytics) {
      return <p className="text-sm text-foreground/60">Analytics will appear once telemetry data is recorded.</p>
    }

    const summaryCards = Array.isArray(advancedAnalytics.summaryCards)
      ? advancedAnalytics.summaryCards.slice(0, 3)
      : []
    const engagementMetrics = Array.isArray(advancedAnalytics.engagementMetrics)
      ? advancedAnalytics.engagementMetrics.slice(0, 4)
      : []
    const performanceMetrics = Array.isArray(advancedAnalytics.performanceMetrics)
      ? advancedAnalytics.performanceMetrics.slice(0, 4)
      : []
    const topPages = Array.isArray(advancedAnalytics.topPages) ? advancedAnalytics.topPages.slice(0, 5) : []
    const sourceDistribution = Array.isArray(advancedAnalytics.sourceDistribution)
      ? advancedAnalytics.sourceDistribution.slice(0, 5)
      : []

    return (
      <div className="space-y-6">
        {summaryCards.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card: any) => (
              <div
                key={card.label}
                className="rounded-lg border border-border/40 bg-background/40 px-4 py-3 flex flex-col gap-1"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">{card.label}</p>
                <p className="text-2xl font-semibold">{card.value}</p>
                {card.change && <p className="text-xs text-primary">{card.change}</p>}
                {card.detail && <p className="text-xs text-foreground/60">{card.detail}</p>}
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3">
            <p className="text-sm font-semibold">Engagement Metrics</p>
            <dl className="space-y-2">
              {engagementMetrics.map((metric: any) => (
                <div key={metric.metric} className="flex items-center justify-between text-sm">
                  <dt className="text-foreground/60">{metric.metric}</dt>
                  <dd className="font-semibold text-foreground">{metric.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3">
            <p className="text-sm font-semibold">Performance Snapshot</p>
            <dl className="space-y-2">
              {performanceMetrics.map((metric: any) => (
                <div key={metric.metric} className="flex items-center justify-between text-sm">
                  <dt className="text-foreground/60">{metric.metric}</dt>
                  <dd className="font-semibold text-foreground">{metric.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        {(topPages.length > 0 || sourceDistribution.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {topPages.length > 0 && (
              <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                <p className="text-sm font-semibold mb-3">Top Pages</p>
                <ul className="space-y-2 text-sm">
                  {topPages.map((page: any) => (
                    <li key={`${page.path}-${page.views}`} className="flex items-center justify-between">
                      <span className="text-foreground/70">{page.path}</span>
                      <span className="font-semibold">{page.views?.toLocaleString?.() ?? page.views}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sourceDistribution.length > 0 && (
              <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                <p className="text-sm font-semibold mb-3">Source Distribution</p>
                <div className="flex flex-wrap gap-2">
                  {sourceDistribution.map((source: any) => (
                    <span
                      key={source.name}
                      className="px-3 py-1 rounded-full text-xs font-semibold border"
                      style={{
                        color: source.color,
                        borderColor: source.color,
                        backgroundColor: `${source.color}20`,
                      }}
                    >
                      {source.name}: {source.value?.toLocaleString?.() ?? source.value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

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
      <div className="min-h-screen bg-background muted-scrollbar flex flex-col">
        <a href={skipHref} className="skip-link">
          Skip to control panel content
        </a>
        <Navigation />
        <main id={MAIN_CONTENT_ID} role="main" className="flex-1 w-full py-20 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4">Sign-in Required</h1>
            <p className="text-foreground/70 mb-6">
              {authError || "Sign in with Discord to open the control panel."}
            </p>
            <a
              href={loginHref || "#"}
              className="inline-flex px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold"
            >
              Sign in with Discord
            </a>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col muted-scrollbar">
      <a href={skipHref} className="skip-link">
        Skip to control panel content
      </a>
      <Navigation />

      <main id={MAIN_CONTENT_ID} role="main" className="flex-1 w-full pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-10">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-2">Control Panel</h1>
            <p className="text-foreground/70">Supervise your VectoBeat deployments, guild automation, and premium features.</p>
          </div>

          {/* Tabs */}
          <div className="mb-8 border-b border-border">
            <nav
              className="flex flex-wrap gap-2 overflow-x-auto pb-2 md:flex-nowrap"
              role="tablist"
              aria-label="Control panel sections"
              aria-orientation="horizontal"
            >
              <button
                type="button"
                id={OVERVIEW_TAB_ID}
                role="tab"
                aria-controls={OVERVIEW_PANEL_ID}
                aria-selected={activeTab === "overview"}
                tabIndex={activeTab === "overview" ? 0 : -1}
                onClick={() => setActiveTab("overview")}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-t ${activeTab === "overview"
                  ? "border-primary text-primary"
                  : "border-transparent text-foreground/60 hover:text-foreground"
                  }`}
              >
                Overview
              </button>
              <button
                type="button"
                id={SETTINGS_TAB_ID}
                role="tab"
                aria-controls={SETTINGS_PANEL_ID}
                aria-selected={activeTab === "settings"}
                tabIndex={activeTab === "settings" ? 0 : -1}
                onClick={() => setActiveTab("settings")}
                className={`px-4 py-3 font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-t ${activeTab === "settings"
                  ? "border-primary text-primary"
                  : "border-transparent text-foreground/60 hover:text-foreground"
                  }`}
              >
                Settings
              </button>
            </nav>
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <section
              id={OVERVIEW_PANEL_ID}
              role="tabpanel"
              aria-labelledby={OVERVIEW_TAB_ID}
              aria-live="polite"
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 mb-8">
                {/* Bot Reach Card */}
                <div className="rounded-lg border border-border/50 bg-card/30 p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <ShieldCheck size={24} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Bot Reach</p>
                      <p className="font-semibold text-2xl">{botGuildCount != null ? botGuildCount : "No data yet"}</p>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/70">
                    Players online: {botActivePlayers != null ? botActivePlayers : "No data yet"}
                  </p>
                  {botUptimeLabel ? (
                    <p className="text-xs text-foreground/50 mt-2">Uptime: {botUptimeLabel}</p>
                  ) : (
                    <p className="text-xs text-foreground/50 mt-2">Uptime: No telemetry</p>
                  )}
                </div>

                {/* Active Subscriptions Card */}
                <div className="rounded-lg border border-border/50 bg-card/30 p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <CreditCard size={24} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Active Plans</p>
                      <p className="font-semibold text-2xl">{overviewActivePlans}</p>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/70">
                    Total: {currencySymbol}
                    {overviewMonthlyTotal.toFixed(2)}
                    /month
                  </p>
                </div>

                {/* Quota Card */}
                <div className="rounded-lg border border-border/50 bg-card/30 p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Clock size={24} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Next Renewal</p>
                      <p className="font-semibold">{nextRenewalLabel}</p>
                      {!overviewNextRenewal && (
                        <p className="text-xs text-foreground/60 mt-1">Choose a plan to schedule your next billing date.</p>
                      )}
                    </div>
                  </div>
                  {showPayNowButton && (
                    <button
                      onClick={handleRenewalPayment}
                      className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Pay Now
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-12">
                <div className="rounded-lg border border-border/50 bg-card/30 p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <ShieldCheck size={24} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Servers with VectoBeat</p>
                      <p className="font-semibold text-2xl">{guildsWithBot.length}</p>
                    </div>
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1 muted-scrollbar">
                    {guildsWithBot.map((guild) => (
                      <div key={guild.id} className="flex items-center justify-between border-b border-border/30 pb-3 last:border-b-0">
                        <div>
                          <p className="font-semibold text-foreground">{guild.name}</p>
                          <p className="text-xs text-foreground/60">ID: {guild.id}</p>
                        </div>
                        <Link
                          href={buildManageHref(guild.id)}
                          className="text-xs text-primary border border-primary/30 px-3 py-1 rounded-full hover:bg-primary/10 transition-colors"
                        >
                          Manage
                        </Link>
                      </div>
                    ))}
                    {guildsWithBot.length === 0 && (
                      <p className="text-foreground/60 text-sm">No servers have VectoBeat installed yet.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/30 p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                      <ShieldAlert size={24} className="text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/70">Servers needing installation</p>
                      <p className="font-semibold text-2xl">{guildsWithoutBot.length}</p>
                    </div>
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1 muted-scrollbar">
                    {guildsWithoutBot.map((guild) => (
                      <div key={guild.id} className="flex items-center justify-between border-b border-border/30 pb-3 last:border-b-0">
                        <div>
                          <p className="font-semibold text-foreground">{guild.name}</p>
                          <p className="text-xs text-foreground/60">ID: {guild.id}</p>
                        </div>
                        <a
                          href={buildGuildInviteUrl(guild.id)}
                          className="text-xs text-primary border border-primary/30 px-3 py-1 rounded-full hover:bg-primary/10 transition-colors"
                        >
                          Add Bot
                        </a>
                      </div>
                    ))}
                    {guildsWithoutBot.length === 0 && (
                      <p className="text-foreground/60 text-sm">All eligible servers already have VectoBeat installed.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/30 p-6 mb-12 space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm text-foreground/70">Advanced analytics &amp; reports</p>
                    <p className="text-xs text-foreground/60">
                      Monitor audience engagement, source distribution, and performance trends.
                    </p>
                  </div>
                  {planAllowsAdvancedAnalytics && (
                    <button
                      onClick={handleRefreshAnalytics}
                      className="inline-flex items-center justify-center px-4 py-2 text-sm rounded-lg border border-primary/40 text-primary font-semibold hover:bg-primary/10 transition-colors"
                    >
                      Refresh
                    </button>
                  )}
                </div>
                {renderAdvancedAnalyticsContent()}
                {planAllowsAnalyticsExports && (
                  <div className="rounded-lg border border-primary/40 bg-background/60 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Integrations API</p>
                        <p className="text-xs text-foreground/60">
                          Connect dashboards or automation by calling the analytics export endpoint.
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold border border-primary/30 text-primary">
                        Included
                      </span>
                    </div>
                    <div className="bg-card/40 rounded-md border border-border/40 px-3 py-2 font-mono text-xs text-foreground/80 break-all">
                      {integrationCurl}
                    </div>
                    <p className="text-xs text-foreground/60">
                      Include your `discord_token` cookie value in the `Authorization` header to authenticate.
                    </p>
                  </div>
                )}
                {planAllowsAnalyticsExports && planAllowsPredictiveAnalytics && analyticsExportUrl && (
                  <div className="rounded-lg border border-primary/40 bg-background/60 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Analytics exports (JSONL)</p>
                        <p className="text-xs text-foreground/60">Download raw event streams for offline analysis. Each line is a JSON object.</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold border border-primary/30 text-primary">
                        Growth
                      </span>
                    </div>
                    <pre className="rounded bg-card/40 border border-border/40 px-3 py-2 text-[11px] text-foreground/80 overflow-x-auto">
                      {`{"event":"queue_trim","data":{"removed":2,"remaining":148},"ts":"2024-03-28T19:23:41.102Z"}`}
                      {"\n"}
                      {`{"event":"play","data":{"source":"spotify","requester":"347118042382","track":"abc123"},"ts":"2024-03-28T19:25:02.889Z"}`}
                    </pre>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-foreground/60">
                        Paste the file into BigQuery, Python, or any JSONL reader to power internal dashboards.
                      </p>
                      <a
                        href={analyticsExportUrl}
                        download
                        className="inline-flex items-center justify-center px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                      >
                        Download JSONL
                      </a>
                    </div>
                    <p className="text-xs text-foreground/50">
                      Tip: schedule a cron job with `curl {window.location.origin}{analyticsExportUrl}` to keep exports in sync.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
                <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <CreditCard size={22} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-foreground/60">Active MRR</p>
                        <p className="text-2xl font-semibold">
                          {currencySymbol}
                          {activeMonthlyRecurring.toFixed(2)}/mo
                        </p>
                      </div>
                    </div>
                    <Link href="/account" className="text-xs text-primary hover:underline">
                      Manage in Account
                    </Link>
                  </div>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1 muted-scrollbar">
                    {topSubscriptions.length > 0 ? (
                      topSubscriptions.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-4 py-2"
                        >
                          <div>
                            <p className="text-sm font-semibold">{sub.name}</p>
                            <p className="text-xs text-foreground/60">ID: {sub.discordServerId}</p>
                          </div>
                          <div className="text-right">
                            <div
                              className={`inline-flex px-2 py-1 rounded-full text-[10px] font-semibold border ${getTierBadgeColor(sub.tier)}`}
                            >
                              {sub.tier}
                            </div>
                            <p className="text-sm font-semibold mt-1">
                              {currencySymbol}
                              {sub.pricePerMonth.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-foreground/60">No active subscriptions yet.</p>
                    )}
                  </div>
                  {subscriptions.length > topSubscriptions.length && (
                    <p className="text-xs text-foreground/50">
                      Showing {topSubscriptions.length} of {subscriptions.length} subscriptions.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-border/50 bg-card/30 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles size={22} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground/60">Bot Footprint</p>
                      <p className="text-2xl font-semibold">{botGuildCount} guilds</p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                      <dt className="text-foreground/60 text-xs uppercase">Active players</dt>
                      <dd className="font-semibold">{botActivePlayers ?? "—"}</dd>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                      <dt className="text-foreground/60 text-xs uppercase">Uptime</dt>
                      <dd className="font-semibold">{botUptimeLabel ?? "—"}</dd>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                      <dt className="text-foreground/60 text-xs uppercase">With bot</dt>
                      <dd className="font-semibold">{guildsWithBot.length}</dd>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                      <dt className="text-foreground/60 text-xs uppercase">Needs install</dt>
                      <dd className="font-semibold">{guildsWithoutBot.length}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <section
              id={SETTINGS_PANEL_ID}
              role="tabpanel"
              aria-labelledby={SETTINGS_TAB_ID}
              aria-live="polite"
              className="space-y-6"
            >
              <div className={`${SETTINGS_CARD_CLASS} p-6 space-y-4`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Server className="text-primary" size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Server Selection</h3>
                    <p className="text-sm text-foreground/70">
                      Choose a server to unlock plan-specific controls. Only servers with VectoBeat installed are listed.
                    </p>
                  </div>
                </div>

                {guildsWithBot.length ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-[2fr_1fr] items-start">
                      <select
                        id={GUILD_SELECT_ID}
                        value={selectedGuildId ?? ""}
                        onChange={(event) => setSelectedGuildId(event.target.value)}
                        className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 focus:outline-none transition-colors"
                        aria-label="Select a Discord server to configure"
                      >
                        {guildsWithBot.map((guild) => (
                          <option key={guild.id} value={guild.id}>
                            {guild.name}
                          </option>
                        ))}
                      </select>
                      <a
                        href={DISCORD_BOT_INVITE_URL}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-primary/30 text-primary font-semibold hover:bg-primary/10 transition-colors"
                      >
                        Add Server
                      </a>
                    </div>

                    {guildsWithoutBot.length > 0 && (
                      <p className="text-xs text-foreground/60">
                        Ready for installation:{" "}
                        {guildsWithoutBot
                          .slice(0, 3)
                          .map((guild) => guild.name)
                          .join(", ")}
                        {guildsWithoutBot.length > 3 ? "..." : ""}
                      </p>
                    )}

                    {selectedGuild && selectedGuildHasBot && (
                      <div className={`${SETTINGS_CARD_CLASS} p-4 flex flex-col gap-2`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Active Plan</p>
                            <p className="font-semibold">{tierDefinition.name}</p>
                          </div>
                          <Link href="/pricing" className="text-xs text-primary hover:underline">
                            View upgrade options
                          </Link>
                        </div>
                        <p className="text-sm text-foreground/70">{tierDefinition.description}</p>
                      </div>
                    )}
                  </>
                ) : (
                <div className={`${SETTINGS_CARD_CLASS} border-dashed p-4 text-sm text-foreground/70`}>
                  <p>No servers are connected yet.</p>
                  <p className="mt-2">
                    Invite VectoBeat to one of your Discord servers to configure plan-specific features.
                  </p>
                  <a
                      href={DISCORD_BOT_INVITE_URL}
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Add VectoBeat to Discord
                    </a>
                  </div>
                )}
              </div>

              {selectedGuildHasBot ? (
                renderFeatureControls()
              ) : (
                <div className={`${SETTINGS_CARD_CLASS} border-dashed p-4 text-sm text-foreground/70`}>
                  <p>Premium controls are disabled until VectoBeat joins this server.</p>
                  <p className="mt-2">
                    Invite the bot or select a connected guild to configure plan-specific features.
                  </p>
                  <a
                    href={DISCORD_BOT_INVITE_URL}
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Add VectoBeat to Discord
                  </a>
                </div>
              )}

              {selectedGuildHasBot && selectedGuildId && (
                planAllowsQueueSync ? (
                  <QueueSyncPanel guildId={selectedGuildId} enabled={planAllowsQueueSync} />
                ) : (
                  <div className={`${SETTINGS_CARD_CLASS} border-dashed border-primary/40 bg-primary/5 p-6 space-y-2 text-sm text-foreground/70`}>
                    <p className="font-semibold text-primary">Real-time queue sync</p>
                    <p>
                      Upgrade to a plan with queue sync to stream live queue updates across devices. Any API tokens you
                      generated stay valid and will begin returning queue data via{" "}
                      <code className="px-1 py-0.5 bg-card/60 rounded">/api/external/queue</code> as soon as your guild
                      unlocks this capability.
                    </p>
                    <Link href="/pricing" className="inline-flex text-primary font-semibold hover:underline">
                      Explore plans
                    </Link>
                  </div>
                )
              )}

              <div className={`${SETTINGS_CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold">Plan Feature Coverage</h3>
                    <p className="text-sm text-foreground/60">
                      See which controls are active on the {tierDefinition.name} plan and which require an upgrade.
                    </p>
                  </div>
                  <Link href="/pricing" className="text-xs text-primary hover:underline">
                    Compare plans
                  </Link>
                </div>
                <div className="space-y-5">
                  {featureAvailability.map((group) => (
                    <div key={group.id} className={`${SETTINGS_CARD_CLASS} p-4`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <SlidersHorizontal className="text-primary" size={16} />
                        </div>
                        <div>
                          <p className="font-semibold">{group.title}</p>
                          <p className="text-xs text-foreground/60">{group.description}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {group.options.map((option) => {
                          const unlocked = option.available
                          const requiredTier = MEMBERSHIP_TIERS[option.minTier].name
                          return (
                            <div
                              key={option.key}
                              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${unlocked
                                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-100"
                                : "border-border/40 bg-background/10 text-foreground/70"
                                }`}
                            >
                              <div className="flex items-center gap-2 text-sm">
                                {unlocked ? (
                                  <CheckCircle2 size={16} className="text-emerald-400" />
                                ) : (
                                  <Lock size={16} className="text-foreground/50" />
                                )}
                                <span>{option.label}</span>
                              </div>
                              {unlocked ? (
                                <span className="text-xs uppercase tracking-wide text-emerald-200">Available</span>
                              ) : (
                                <span className="text-xs text-foreground/60">Requires {requiredTier}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${SETTINGS_CARD_CLASS} p-6`}>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors font-semibold flex items-center justify-between"
                >
                  <span>Logout</span>
                  <LogOut size={18} />
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
