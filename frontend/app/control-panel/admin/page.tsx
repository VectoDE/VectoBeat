"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import Link from "next/link"
import Image from "next/image"
import type { UserRole } from "@/lib/db"
import appPackage from "../../../package.json"

interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  author: string
  category: string
  readTime?: string | null
  views: number
  publishedAt: string
}

type AdminTabKey =
  | "overview"
  | "blog"
  | "newsletter"
  | "ticket"
  | "contacts"
  | "botControl"
  | "system"
  | "logs"
  | "users"
  | "subscriptions"
  | "billing"
  | "apiKeys"
  | "forum"

type NewsletterSubscriber = {
  email: string
  name?: string | null
}

type AdminUserRow = {
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
  profilePublic: boolean
}

type AdminSubscriptionRow = {
  id: string
  discordId: string
  discordServerId: string
  name: string
  tier: string
  status: string
  stripeCustomerId: string | null
  pricePerMonth: number
  currentPeriodStart: string
  currentPeriodEnd: string
}

type AdminBillingItem = AdminSubscriptionRow & {
  dueDate: string
  overdue: boolean
}

type MetricStat = {
  label: string
  value: number | string
  detail: string
  format?: "currency"
}

type AdminSystemKey = {
  id: string
  label: string
  envVar: string
  envVars: string[]
  description: string
  category: string
  required: boolean
  configured: boolean
  lastFour: string | null
  preview: string | null
}

type AdminSystemEndpoints = {
  statusApi?: string | null
  statusFallbacks?: string[]
  queueSync?: string | null
  serverSettings?: string | null
  telemetry?: string | null
}

type AdminEnvEntry = {
  key: string
  value: string
}

const BOT_ACTIONS = [
  { key: "start", label: "Start bot", description: "Start the bot service if it is stopped." },
  { key: "restart", label: "Restart bot", description: "Restart the bot process across all shards." },
  { key: "reload", label: "Reload bot", description: "Reload configuration and caches without a full restart." },
  { key: "reload_commands", label: "Reload commands", description: "Refresh slash commands and permissions." },
  { key: "stop", label: "Stop bot", description: "Gracefully stop the bot service." },
  { key: "restart_frontend", label: "Restart frontend", description: "Restart the control panel/frontend service." },
]

const ADMIN_TABS: Array<{ key: AdminTabKey; label: string; description: string }> = [
  { key: "overview", label: "Overview", description: "Operational health, quick links, and priority signals" },
  { key: "blog", label: "Blogs", description: "Publish news and manage posts" },
  { key: "newsletter", label: "Newsletters", description: "Send announcements to subscribers" },
  { key: "ticket", label: "Tickets", description: "Respond to support tickets and attachments" },
  { key: "contacts", label: "Contacts", description: "Inbound contact form submissions and replies" },
  { key: "forum", label: "Forum", description: "Manage forum categories, threads, and telemetry" },
  { key: "subscriptions", label: "Subscriptions", description: "Oversee guild plans and entitlements" },
  { key: "billing", label: "Billings", description: "Track invoices and manual billing workflows" },
  { key: "users", label: "Users", description: "Manage member accounts and access levels" },
  { key: "apiKeys", label: "API Keys", description: "Monitor system credentials and rotate secrets safely" },
  { key: "botControl", label: "Bot Controls", description: "Manage bot lifecycle actions and deploys" },
  { key: "system", label: "System", description: "Runtime health, endpoints, and service versions" },
  { key: "logs", label: "Logs", description: "Recent admin and bot activity for audit" },
]

const initialForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  author: "",
  category: "Announcement",
}

const estimateReadTime = (content: string | undefined | null) => {
  if (!content?.trim()) {
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

const sanitizeSlug = (value?: string | null, fallback?: string | number) => {
  const candidate =
    typeof value === "string" && value.trim().length
      ? value.trim()
      : fallback != null
        ? String(fallback)
        : ""
  return encodeURIComponent(candidate)
}

const buildBlogHref = (slug?: string | null, fallback?: string | number) => {
  const safeSlug = sanitizeSlug(slug, fallback)
  return safeSlug ? `/blog/${safeSlug}` : "/blog"
}

const buildProfileHref = (handle?: string | null) => {
  if (!handle) return null
  const safeHandle = sanitizeSlug(handle)
  return safeHandle ? `/profile/${safeHandle}` : null
}

const normalizeDateInputValue = (value?: string | null) => {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={onClose} />
    <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <h3 className="text-xl font-bold">{title}</h3>
        <button
          onClick={onClose}
          className="text-foreground/60 hover:text-foreground text-2xl leading-none px-2"
          aria-label="Close modal"
        >
          ×
        </button>
      </div>
      <div className="max-h-[80vh] overflow-y-auto px-6 py-5">{children}</div>
    </div>
  </div>
)

export default function AdminControlPanelPage() {
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [activeTab, setActiveTab] = useState<AdminTabKey>("overview")
  const [adminProfile, setAdminProfile] = useState<{ name: string; email: string | null }>({ name: "", email: null })
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [discordId, setDiscordId] = useState<string | null>(null)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [postsError, setPostsError] = useState<string | null>(null)
  const [form, setForm] = useState(initialForm)
  const [savingPost, setSavingPost] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [campaignForm, setCampaignForm] = useState({ subject: "", body: "" })
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [campaignMessage, setCampaignMessage] = useState<string | null>(null)
  const [campaignLoading, setCampaignLoading] = useState(false)
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<NewsletterSubscriber[]>([])
  const [supportTickets, setSupportTickets] = useState<any[]>([])
  const [supportTicketsLoading, setSupportTicketsLoading] = useState(false)
  const [supportTicketsError, setSupportTicketsError] = useState<string | null>(null)
  const [forumStats, setForumStats] = useState<any | null>(null)
  const [forumEvents, setForumEvents] = useState<any[]>([])
  const [forumCategories, setForumCategories] = useState<any[]>([])
  const [forumThreads, setForumThreads] = useState<any[]>([])
  const [forumPosts, setForumPosts] = useState<any[]>([])
  const [forumSelectedCategory, setForumSelectedCategory] = useState<string>("")
  const [forumSelectedThread, setForumSelectedThread] = useState<string>("")
  const [forumLoading, setForumLoading] = useState(false)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState("")
  const [userPreview, setUserPreview] = useState<AdminUserRow | null>(null)
  const [userRoleFilter, setUserRoleFilter] = useState("all")
  const [userRoleUpdating, setUserRoleUpdating] = useState<string | null>(null)
  const [subscriptionsData, setSubscriptionsData] = useState<AdminSubscriptionRow[]>([])
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false)
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null)
  const [subscriptionSearch, setSubscriptionSearch] = useState("")
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState("all")
  const [subscriptionUpdating, setSubscriptionUpdating] = useState<string | null>(null)
  const [subscriptionPreview, setSubscriptionPreview] = useState<AdminSubscriptionRow | null>(null)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [newSubscription, setNewSubscription] = useState({
    discordId: "",
    discordServerId: "",
    name: "",
    tier: "starter",
    status: "active",
    pricePerMonth: 0,
    currentPeriodStart: "",
    currentPeriodEnd: "",
    stripeCustomerId: "",
  })
  const [billingSearch, setBillingSearch] = useState("")
  const [billingInvoiceSessionId, setBillingInvoiceSessionId] = useState("")
  const [billingMessage, setBillingMessage] = useState<string | null>(null)
  const [billingPreview, setBillingPreview] = useState<AdminBillingItem | null>(null)
  const [blogSearch, setBlogSearch] = useState("")
  const [blogCategoryFilter, setBlogCategoryFilter] = useState("all")
  const [newsletterSearch, setNewsletterSearch] = useState("")
  const [newsletterFilter, setNewsletterFilter] = useState("all")
  const [ticketSearch, setTicketSearch] = useState("")
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all")
  const [ticketPriorityFilter, setTicketPriorityFilter] = useState("all")
  const [isBlogModalOpen, setIsBlogModalOpen] = useState(false)
  const [isNewsletterModalOpen, setIsNewsletterModalOpen] = useState(false)
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [ticketThread, setTicketThread] = useState<any | null>(null)
  const [ticketThreadLoading, setTicketThreadLoading] = useState(false)
  const [ticketThreadError, setTicketThreadError] = useState<string | null>(null)
  const [ticketReply, setTicketReply] = useState("")
  const [ticketReplyStatus, setTicketReplyStatus] = useState("")
  const [ticketAttachmentFiles, setTicketAttachmentFiles] = useState<File[]>([])
  const [ticketAttachmentKey, setTicketAttachmentKey] = useState(0)
  const [developerToken, setDeveloperToken] = useState<string | null>(null)
  const [developerTokenMessage, setDeveloperTokenMessage] = useState<string | null>(null)
  const [ticketDraft, setTicketDraft] = useState({
    name: "",
    email: "",
    subject: "",
    category: "General",
    priority: "normal",
    message: "",
  })
  const [ticketModalMessage, setTicketModalMessage] = useState<string | null>(null)
  const [ticketSubmitting, setTicketSubmitting] = useState(false)
  const [contactMessages, setContactMessages] = useState<any[]>([])
  const [contactLoading, setContactLoading] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)
  const [contactResponse, setContactResponse] = useState("")
  const [contactStatus, setContactStatus] = useState("")
  const [contactPriority, setContactPriority] = useState("")
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [contactActionMessage, setContactActionMessage] = useState<string | null>(null)
  const [contactSearch, setContactSearch] = useState("")
  const [contactStatusFilter, setContactStatusFilter] = useState("all")
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [newContact, setNewContact] = useState({
    name: "",
    email: "",
    subject: "",
    topic: "",
    priority: "normal",
    company: "",
    message: "",
  })
  const [systemKeys, setSystemKeys] = useState<AdminSystemKey[]>([])
  const [systemEndpoints, setSystemEndpoints] = useState<AdminSystemEndpoints>({})
  const [systemKeyLoading, setSystemKeyLoading] = useState(false)
  const [systemKeyError, setSystemKeyError] = useState<string | null>(null)
  const [systemKeyMessage, setSystemKeyMessage] = useState<string | null>(null)
  const [generatedSystemKey, setGeneratedSystemKey] = useState<{ service: string; value: string; envVar?: string } | null>(
    null,
  )
  const [systemKeyGenerating, setSystemKeyGenerating] = useState<string | null>(null)
  const [envEntries, setEnvEntries] = useState<AdminEnvEntry[]>([])
  const [envLoading, setEnvLoading] = useState(false)
  const [envError, setEnvError] = useState<string | null>(null)
  const [envMessage, setEnvMessage] = useState<string | null>(null)
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false)
  const [envForm, setEnvForm] = useState({ key: "", value: "" })
  const [botActionLoading, setBotActionLoading] = useState<string | null>(null)
  const [botActionMessage, setBotActionMessage] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ action: string; label: string } | null>(null)
  const [systemHealth, setSystemHealth] = useState<any | null>(null)
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null)
  const [systemEndpointSearch, setSystemEndpointSearch] = useState("")
  const [logEvents, setLogEvents] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logSearch, setLogSearch] = useState("")
  const [logTypeFilter, setLogTypeFilter] = useState("all")
  const [logsLive, setLogsLive] = useState(false)
  const [apiKeySearch, setApiKeySearch] = useState("")
  const [envSearch, setEnvSearch] = useState("")
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false)
  const [apiKeyForm, setApiKeyForm] = useState({
    label: "",
    envVar: "",
    value: "",
    description: "",
    required: true,
  })
  const [packageSearch, setPackageSearch] = useState("")
  const [runtimeInfo, setRuntimeInfo] = useState<{
    nodeVersion: string | null
    platform: string | null
    arch: string | null
    pid: number | null
    uptimeSeconds: number | null
    region: string | null
  } | null>(null)
  const [connectivity, setConnectivity] = useState<Array<{ label: string; key: string; url?: string | null; status: string }>>(
    [],
  )

  const verifyRole = useCallback(async () => {
    try {
      let urlToken: string | null = null
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        const params = url.searchParams
        const tokenParam = params.get("token")
        const userIdParam = params.get("user_id")
        if (tokenParam && userIdParam) {
          localStorage.setItem("discord_token", tokenParam)
          localStorage.setItem("discord_user_id", userIdParam)
          params.delete("token")
          params.delete("user_id")
          const nextUrl = `${url.pathname}${params.toString() ? `?${params}` : ""}`
          window.history.replaceState({}, document.title, nextUrl)
        }
        urlToken = tokenParam
      }

      const storedToken = localStorage.getItem("discord_token")
      const fetchSession = async (token?: string | null) => {
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
        const response = await fetch("/api/verify-session", {
          headers,
          credentials: "include",
        })
        if (!response.ok) {
          throw new Error("Unable to verify session")
        }
        return response.json()
      }

      let activeToken: string | null = storedToken || urlToken || null
      let session = await fetchSession(activeToken)

      if (!session?.authenticated && activeToken) {
        localStorage.removeItem("discord_token")
        activeToken = null
        session = await fetchSession(null)
      }

      if (!session?.authenticated || !["admin", "operator"].includes(session.role)) {
        setAccessDenied(true)
        setLoading(false)
        return
      }

      if (activeToken) {
        setAuthToken(activeToken)
      } else {
        setAuthToken(null)
      }
      setDiscordId(session.id)
      const profileName = session.displayName || session.username || "VectoBeat Admin"
      const profileEmail = session.email || null
      setAdminProfile({ name: profileName, email: profileEmail })
      setTicketDraft((prev) => ({
        ...prev,
        name: prev.name || profileName,
        email: prev.email || profileEmail || "",
      }))
      setLoading(false)
    } catch (error) {
      console.error("Failed to verify role:", error)
      setAccessDenied(true)
      setLoading(false)
    }
  }, [])

  const loadPosts = useCallback(async () => {
    setPostsLoading(true)
    setPostsError(null)
    try {
      const response = await fetch("/api/blog", { cache: "no-store" })
      if (!response.ok) throw new Error("Failed to load posts")
      const data = await response.json()
      setPosts(Array.isArray(data.posts) ? data.posts : [])
    } catch (error) {
      console.error("Failed to load blog posts:", error)
      setPostsError("Unable to load blog posts")
    } finally {
      setPostsLoading(false)
    }
  }, [])

  const loadCampaigns = useCallback(async () => {
    if (!discordId) return
    setCampaignLoading(true)
    try {
      const headers: HeadersInit = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/newsletter/campaigns?discordId=${discordId}&includeSubscribers=true`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) throw new Error("Failed to load campaigns")
      const data = await response.json()
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : [])
      if (Array.isArray(data.subscribers)) {
        setNewsletterSubscribers(data.subscribers)
      }
    } catch (error) {
      console.error("Failed to load campaigns:", error)
    } finally {
      setCampaignLoading(false)
    }
  }, [discordId, authToken])

  const loadSupportTickets = useCallback(async () => {
    if (!discordId) return
    setSupportTicketsLoading(true)
    setSupportTicketsError(null)
    try {
      const headers: HeadersInit = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/admin/support-tickets?discordId=${discordId}`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) throw new Error("Failed to load tickets")
      const data = await response.json()
      setSupportTickets(Array.isArray(data.tickets) ? data.tickets : [])
    } catch (error) {
      console.error("Failed to load support tickets:", error)
      setSupportTicketsError("Unable to load support tickets.")
    } finally {
      setSupportTicketsLoading(false)
    }
  }, [authToken, discordId])

  const loadForumData = useCallback(
    async (opts?: { threadId?: string; category?: string }) => {
    if (!discordId) return
    setForumLoading(true)
    try {
      const params = new URLSearchParams({ discordId })
      const category = opts?.category ?? forumSelectedCategory
      const threadId = opts?.threadId ?? forumSelectedThread
      if (category) params.set("category", category)
      if (threadId) params.set("threadId", threadId)
      const res = await fetch(`/api/admin/forum?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to load forum data")
      const payload = await res.json()
      setForumStats(payload.stats ?? null)
      setForumEvents(Array.isArray(payload.events) ? payload.events : [])
      setForumCategories(Array.isArray(payload.categories) ? payload.categories : [])
      setForumThreads(Array.isArray(payload.threads) ? payload.threads : [])
      setForumPosts(Array.isArray(payload.posts) ? payload.posts : [])
      // auto-select defaults
      if (!forumSelectedCategory && payload.categories?.length) {
        setForumSelectedCategory(payload.categories[0].slug || payload.categories[0].id || "")
      }
      if (!threadId && payload.threads?.length) {
        setForumSelectedThread(payload.threads[0].id)
      }
    } catch (error) {
      console.error("Failed to load forum data:", error)
    } finally {
      setForumLoading(false)
    }
  },
    [discordId, forumSelectedCategory, forumSelectedThread],
  )

  const loadContactMessages = useCallback(async () => {
    if (!discordId) return
    setContactLoading(true)
    setContactError(null)
    setContactActionMessage(null)
    try {
      const headers: HeadersInit = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/contact/messages?discordId=${discordId}`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to load contact messages")
      }
      const payload = await response.json()
      setContactMessages(Array.isArray(payload.messages) ? payload.messages : [])
    } catch (error) {
      console.error("Failed to load contact messages:", error)
      setContactError(error instanceof Error ? error.message : "Unable to load contact messages")
    } finally {
      setContactLoading(false)
    }
  }, [authToken, discordId])

  const loadAdminUsers = useCallback(async () => {
    if (!discordId) return
    setUsersLoading(true)
    setUsersError(null)
    try {
      const headers: HeadersInit = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/admin/users?discordId=${discordId}`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to load users")
      }
      const data = await response.json()
      const normalizedUsers = Array.isArray(data.users)
        ? data.users.map((user: any) => ({
            id: String(user.id),
            username: user.username ?? null,
            displayName: user.displayName ?? user.username ?? null,
            email: user.email ?? null,
            phone: user.phone ?? null,
            avatarUrl: user.avatarUrl ?? null,
            guildCount: Number.isFinite(user.guildCount) ? user.guildCount : 0,
            lastSeen: user.lastSeen || new Date().toISOString(),
            role: (user.role as UserRole) ?? "member",
            twoFactorEnabled: Boolean(user.twoFactorEnabled),
            handle: user.handle ?? null,
            profilePublic: Boolean(user.profilePublic),
          }))
        : []
      setUsers(normalizedUsers)
    } catch (error) {
      console.error("Failed to load admin users:", error)
      setUsersError(error instanceof Error ? error.message : "Unable to load users")
    } finally {
      setUsersLoading(false)
    }
  }, [authToken, discordId])

  const loadAdminSubscriptions = useCallback(async () => {
    if (!discordId) return
    setSubscriptionsLoading(true)
    setSubscriptionsError(null)
    try {
      const headers: HeadersInit = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/admin/subscriptions?discordId=${discordId}`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to load subscriptions")
      }
      const data = await response.json()
      setSubscriptionsData(Array.isArray(data.subscriptions) ? data.subscriptions : [])
    } catch (error) {
      console.error("Failed to load admin subscriptions:", error)
      setSubscriptionsError(error instanceof Error ? error.message : "Unable to load subscriptions")
    } finally {
      setSubscriptionsLoading(false)
    }
  }, [authToken, discordId])

  const loadSystemKeys = useCallback(async () => {
    if (!discordId) return
    setSystemKeyLoading(true)
    setSystemKeyError(null)
    setSystemKeyMessage(null)
    try {
      const headers: HeadersInit = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/admin/system-keys?discordId=${discordId}`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to load system keys")
      }
      const payload = await response.json()
      setSystemKeys(Array.isArray(payload.keys) ? payload.keys : [])
      setSystemEndpoints(payload.endpoints || {})
      setSystemKeyMessage(payload.generatedAt ? `Last checked ${new Date(payload.generatedAt).toLocaleString()}` : null)
    } catch (error) {
      console.error("Failed to load system keys:", error)
      setSystemKeyError(error instanceof Error ? error.message : "Unable to load system keys")
    } finally {
      setSystemKeyLoading(false)
    }
  }, [authToken, discordId])

  const loadEnvEntries = useCallback(async () => {
    if (!discordId) return
    setEnvLoading(true)
    setEnvError(null)
    setEnvMessage(null)
    try {
      const headers: HeadersInit = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const [frontendRes, botRes] = await Promise.all([
        fetch(`/api/admin/env?discordId=${discordId}&target=frontend`, {
          headers,
          credentials: "include",
        }),
        fetch(`/api/admin/env?discordId=${discordId}&target=bot`, {
          headers,
          credentials: "include",
        }),
      ])
      if (!frontendRes.ok) {
        const payload = await frontendRes.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to load env entries")
      }
      if (!botRes.ok) {
        const payload = await botRes.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to load bot env entries")
      }
      const payloadFront = await frontendRes.json()
      const payloadBot = await botRes.json()
      const entries: AdminEnvEntry[] = []
      if (Array.isArray(payloadFront.entries)) entries.push(...payloadFront.entries)
      if (Array.isArray(payloadBot.entries)) entries.push(...payloadBot.entries)
      setEnvEntries(entries)
    } catch (error) {
      console.error("Failed to load env entries:", error)
      setEnvError(error instanceof Error ? error.message : "Unable to load env entries")
    } finally {
      setEnvLoading(false)
    }
  }, [authToken, discordId])

  const loadSystemHealth = useCallback(async () => {
    setSystemHealthError(null)
    try {
      const response = await fetch("/api/bot/metrics", { cache: "no-store" })
      if (!response.ok) {
        throw new Error("Failed to fetch bot metrics")
      }
      const payload = await response.json()
      setSystemHealth(payload)
    } catch (error) {
      console.error("Failed to load system health:", error)
      setSystemHealthError(error instanceof Error ? error.message : "Unable to load health metrics")
    }
  }, [])

  const loadLogs = useCallback(async () => {
    if (!discordId) return
    setLogsLoading(true)
    setLogsError(null)
    try {
      const headers: HeadersInit = {}
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      const response = await fetch(`/api/admin/logs?discordId=${discordId}&limit=200`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to load logs")
      }
      const payload = await response.json()
      setLogEvents(Array.isArray(payload.events) ? payload.events : [])
    } catch (error) {
      console.error("Failed to load logs:", error)
      setLogsError(error instanceof Error ? error.message : "Unable to load logs")
    } finally {
      setLogsLoading(false)
    }
  }, [authToken, discordId])

  const loadRuntimeInfo = useCallback(async () => {
    if (!discordId) return
    try {
      const headers: HeadersInit = {}
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      const response = await fetch(`/api/admin/runtime?discordId=${discordId}`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) {
        return
      }
      const payload = await response.json()
      setRuntimeInfo({
        nodeVersion: payload.nodeVersion ?? null,
        platform: payload.platform ?? null,
        arch: payload.arch ?? null,
        pid: payload.pid ?? null,
        uptimeSeconds: payload.uptimeSeconds ?? null,
        region: payload.region ?? null,
      })
    } catch (error) {
      console.error("Failed to load runtime info:", error)
    }
  }, [authToken, discordId])

  const getEnvValue = useCallback(
    (key: string) => {
      const entry = envEntries.find((item) => item.key === key)
      if (entry) return entry.value
      if (typeof process !== "undefined" && process.env?.[key]) {
        return process.env[key] as string
      }
      return ""
    },
    [envEntries],
  )

  const loadConnectivity = useCallback(async () => {
    if (!discordId) return
    try {
      const headers: HeadersInit = {}
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      const response = await fetch(`/api/admin/connectivity?discordId=${discordId}`, {
        headers,
        credentials: "include",
      })
      if (!response.ok) return
      const payload = await response.json()
      if (Array.isArray(payload.services)) {
        setConnectivity(payload.services)
      }
    } catch (error) {
      console.error("Failed to load connectivity:", error)
    }
  }, [authToken, discordId])

  const upsertEnvEntry = useCallback((previousKey: string, nextKey: string, value: string) => {
    setEnvEntries((prev) => {
      const filtered = prev.filter((item) => item.key !== previousKey)
      const existingIndex = filtered.findIndex((item) => item.key === nextKey)
      if (existingIndex >= 0) {
        const clone = [...filtered]
        clone[existingIndex] = { ...clone[existingIndex], key: nextKey, value }
        return clone
      }
      return [...filtered, { key: nextKey, value }]
    })
  }, [])

  const fetchTicketThread = useCallback(
    async (ticketId: string | null) => {
      if (!ticketId || !discordId) {
        setTicketThread(null)
        return
      }
      setTicketThreadLoading(true)
      setTicketThreadError(null)
      try {
        const headers: HeadersInit = {}
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const response = await fetch(`/api/support-tickets/${ticketId}?discordId=${discordId}`, {
          headers,
          credentials: "include",
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Failed to load ticket thread")
        }
        const data = await response.json()
        setTicketThread(data)
      } catch (error) {
        console.error("Failed to load ticket thread:", error)
      setTicketThreadError(error instanceof Error ? error.message : "Unable to load ticket thread")
    } finally {
      setTicketThreadLoading(false)
    }
  },
    [authToken, discordId],
  )

  useEffect(() => {
    void fetchTicketThread(selectedTicketId)
  }, [fetchTicketThread, selectedTicketId])

  useEffect(() => {
    verifyRole()
  }, [verifyRole])

  useEffect(() => {
    if (!logsLive) return
    void loadLogs()
    const id = setInterval(() => {
      void loadLogs()
    }, 8000)
    return () => clearInterval(id)
  }, [loadLogs, logsLive])

  useEffect(() => {
    if (!loading && !accessDenied) {
      loadPosts()
      loadCampaigns()
      loadSupportTickets()
      loadAdminUsers()
      loadAdminSubscriptions()
      loadContactMessages()
      loadSystemKeys()
      loadEnvEntries()
      loadSystemHealth()
      loadLogs()
      loadRuntimeInfo()
      loadConnectivity()
      loadForumData()
    }
  }, [
    loading,
    accessDenied,
    loadPosts,
    loadCampaigns,
    loadSupportTickets,
    loadAdminUsers,
    loadAdminSubscriptions,
    loadContactMessages,
    loadSystemKeys,
    loadEnvEntries,
    loadSystemHealth,
    loadLogs,
    loadRuntimeInfo,
    loadConnectivity,
    loadForumData,
  ])

  useEffect(() => {
    if (forumSelectedThread) {
      void loadForumData({ threadId: forumSelectedThread })
    }
  }, [forumSelectedThread, loadForumData])

  useEffect(() => {
    setTicketDraft((prev) => ({
      ...prev,
      name: prev.name || adminProfile.name || "",
      email: prev.email || adminProfile.email || "",
    }))
  }, [adminProfile])

  const postCategories = useMemo(() => {
    const set = new Set<string>()
    posts.forEach((post) => {
      if (post.category) {
        set.add(post.category)
      }
    })
    return Array.from(set)
  }, [posts])

  const totalPostViews = useMemo(
    () => posts.reduce((sum, post) => sum + (post.views || 0), 0),
    [posts],
  )
  const averagePostViews = useMemo(
    () => (posts.length ? Math.round(totalPostViews / posts.length) : 0),
    [posts.length, totalPostViews],
  )
  const filteredPosts = useMemo(() => {
    const query = blogSearch.trim().toLowerCase()
    return posts.filter((post) => {
      const matchesCategory = blogCategoryFilter === "all" || post.category === blogCategoryFilter
      const matchesSearch =
        !query ||
        post.title.toLowerCase().includes(query) ||
        (post.excerpt || "").toLowerCase().includes(query) ||
        (post.category || "").toLowerCase().includes(query)
      return matchesCategory && matchesSearch
    })
  }, [posts, blogSearch, blogCategoryFilter])
  const derivedReadTime = useMemo(() => estimateReadTime(form.content), [form.content])

  const openTickets = useMemo(() => supportTickets.filter((msg) => msg.status === "open").length, [supportTickets])

  const pendingTicketReplies = useMemo(
    () => supportTickets.filter((msg) => !msg.response).length,
    [supportTickets],
  )

  const filteredCampaigns = useMemo(() => {
    const query = newsletterSearch.trim().toLowerCase()
    return campaigns.filter((campaign) => {
      const status = campaign.sentAt ? "sent" : "pending"
      const matchesFilter = newsletterFilter === "all" || status === newsletterFilter
      const matchesSearch = !query || (campaign.subject || "").toLowerCase().includes(query)
      return matchesFilter && matchesSearch
    })
  }, [campaigns, newsletterSearch, newsletterFilter])

  const filteredTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase()
    return supportTickets.filter((msg) => {
      const matchesStatus = ticketStatusFilter === "all" || msg.status === ticketStatusFilter
      const matchesPriority = ticketPriorityFilter === "all" || msg.priority === ticketPriorityFilter
      const bucket = [msg.name, msg.email, msg.subject, msg.message, msg.priority, msg.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      const matchesSearch = !query || bucket.includes(query)
      return matchesStatus && matchesPriority && matchesSearch
    })
  }, [supportTickets, ticketSearch, ticketStatusFilter, ticketPriorityFilter])

  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase()
    return contactMessages.filter((msg) => {
      const matchesStatus = contactStatusFilter === "all" || msg.status === contactStatusFilter
      const bucket = [msg.name, msg.email, msg.subject, msg.message, msg.company, msg.topic].filter(Boolean).join(" ").toLowerCase()
      const matchesSearch = !query || bucket.includes(query)
      return matchesStatus && matchesSearch
    })
  }, [contactMessages, contactSearch, contactStatusFilter])
  const selectedContact = useMemo(
    () => contactMessages.find((msg) => msg.id === selectedContactId) || null,
    [contactMessages, selectedContactId],
  )

  const ticketResolvedCount = useMemo(
    () => supportTickets.filter((ticket) => ticket.status === "resolved").length,
    [supportTickets],
  )

  const ticketClosedCount = useMemo(
    () => supportTickets.filter((ticket) => ticket.status === "closed").length,
    [supportTickets],
  )
  const ticketArchivedCount = useMemo(
    () => supportTickets.filter((ticket) => ticket.status === "archived").length,
    [supportTickets],
  )
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase()
    return users.filter((user) => {
      const matchesRole = userRoleFilter === "all" || user.role === userRoleFilter
      const tokens = [user.username, user.displayName, user.email, user.id].filter(Boolean).join(" ").toLowerCase()
      const matchesSearch = !query || tokens.includes(query)
      return matchesRole && matchesSearch
    })
  }, [userRoleFilter, userSearch, users])

  const totalUsers = useMemo(() => users.length, [users])
  const adminCount = useMemo(() => users.filter((user) => user.role === "admin").length, [users])
  const operatorCount = useMemo(() => users.filter((user) => user.role === "operator").length, [users])
  const recentActiveUsers = useMemo(
    () => users.filter((user) => Date.now() - new Date(user.lastSeen).getTime() < 1000 * 60 * 60 * 24 * 7).length,
    [users],
  )

  const filteredSubscriptions = useMemo(() => {
    const query = subscriptionSearch.trim().toLowerCase()
    return subscriptionsData.filter((sub) => {
      const matchesStatus = subscriptionStatusFilter === "all" || sub.status === subscriptionStatusFilter
      const payload = [sub.name, sub.discordId, sub.discordServerId, sub.tier, sub.status, sub.stripeCustomerId || ""]
        .join(" ")
        .toLowerCase()
      const matchesSearch = !query || payload.includes(query)
      return matchesStatus && matchesSearch
    })
  }, [subscriptionSearch, subscriptionStatusFilter, subscriptionsData])

  const activeSubscriptionCount = useMemo(
    () => subscriptionsData.filter((sub) => sub.status === "active").length,
    [subscriptionsData],
  )
  const canceledSubscriptionCount = useMemo(
    () => subscriptionsData.filter((sub) => sub.status === "canceled").length,
    [subscriptionsData],
  )
  const overdueSubscriptionCount = useMemo(
    () => subscriptionsData.filter((sub) => sub.status === "past_due").length,
    [subscriptionsData],
  )
  const subscriptionMRR = useMemo(
    () =>
      subscriptionsData
        .filter((sub) => sub.status === "active")
        .reduce((sum, sub) => sum + (sub.pricePerMonth || 0), 0),
    [subscriptionsData],
  )

  const billingItems = useMemo<AdminBillingItem[]>(() => {
    return subscriptionsData.map((subscription) => {
      const dueDate = new Date(subscription.currentPeriodEnd)
      const overdue = dueDate.getTime() < Date.now() && subscription.status !== "canceled"
      return {
        ...subscription,
        dueDate: dueDate.toISOString(),
        overdue,
      }
    })
  }, [subscriptionsData])

  const filteredBillingItems = useMemo(() => {
    const query = billingSearch.trim().toLowerCase()
    if (!query) return billingItems
    return billingItems.filter((item) => {
      const bucket = [item.name, item.discordId, item.discordServerId, item.tier, item.status, item.stripeCustomerId || ""]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return bucket.includes(query)
    })
  }, [billingItems, billingSearch])

  const filteredSystemKeys = useMemo(() => {
    const query = apiKeySearch.trim().toLowerCase()
    if (!query) return systemKeys
    return systemKeys.filter((entry) => {
      const payload = [entry.label, entry.envVar, ...(entry.envVars || [])].join(" ").toLowerCase()
      return payload.includes(query)
    })
  }, [apiKeySearch, systemKeys])

  const filteredEnvEntries = useMemo(() => {
    const query = envSearch.trim().toLowerCase()
    const combinedKeys = new Set<string>()
    envEntries.forEach((entry) => combinedKeys.add(entry.key))
    systemKeys.forEach((key) => {
      if (key.envVar) combinedKeys.add(key.envVar)
      ;(key.envVars || []).forEach((ev) => combinedKeys.add(ev))
    })
    Object.keys(process.env || {}).forEach((ev) => combinedKeys.add(ev))
    const combinedEntries = Array.from(combinedKeys).map((key) => ({
      key,
      value: getEnvValue(key),
    }))
    if (!query) return combinedEntries
    return combinedEntries.filter((entry) => `${entry.key} ${entry.value}`.toLowerCase().includes(query))
  }, [envEntries, envSearch, getEnvValue, systemKeys])

  useEffect(() => {
    if (filteredTickets.length === 0) {
      if (selectedTicketId) {
        setSelectedTicketId(null)
        setTicketThread(null)
      }
      return
    }
    if (selectedTicketId && !filteredTickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(null)
      setTicketThread(null)
    }
  }, [filteredTickets, selectedTicketId])

  useEffect(() => {
    setTicketReply("")
    setTicketReplyStatus("")
    setTicketAttachmentFiles([])
    setTicketAttachmentKey((key) => key + 1)
  }, [selectedTicketId])

  useEffect(() => {
    if (!filteredContacts.length) {
      setSelectedContactId(null)
      return
    }
    if (selectedContactId && !filteredContacts.some((contact) => contact.id === selectedContactId)) {
      setSelectedContactId(null)
    }
  }, [filteredContacts, selectedContactId])

  useEffect(() => {
    if (selectedContact) {
      setContactStatus(selectedContact.status || "")
      setContactPriority(selectedContact.priority || "")
      setContactResponse(selectedContact.response || "")
    } else {
      setContactStatus("")
      setContactPriority("")
      setContactResponse("")
    }
  }, [selectedContact])

  const newsletterReach = useMemo(
    () =>
      campaigns.reduce((sum, campaign) => {
        const recipients = Number(
          campaign.recipientCount ?? campaign.recipient_count ?? campaign.recipients ?? 0,
        )
        return sum + (Number.isFinite(recipients) ? recipients : 0)
      }, 0),
    [campaigns],
  )

  const recentOpenTickets = useMemo(
    () => supportTickets.filter((msg) => msg.status === "open").slice(0, 3),
    [supportTickets],
  )

  const activityFeed = useMemo(() => {
    const parseTimestamp = (value?: string | Date | null) => {
      if (!value) return 0
      const date = value instanceof Date ? value : new Date(value)
      return Number.isNaN(date.getTime()) ? 0 : date.getTime()
    }

    const feed = [
      ...posts.map((post) => ({
        id: `post-${post.id}`,
        label: post.title,
        type: "Blog update",
        badge: "Blog",
        meta: post.category,
        status: `${post.views?.toLocaleString() ?? 0} views`,
        dateText: post.publishedAt ? new Date(post.publishedAt).toLocaleString() : "Scheduled",
        timestamp: parseTimestamp(post.publishedAt),
      })),
      ...campaigns.map((campaign) => ({
        id: `campaign-${campaign.id}`,
        label: campaign.subject,
        type: "Campaign",
        badge: "Newsletter",
        meta: campaign.recipientCount ? `${campaign.recipientCount} recipients` : "Draft",
        status: campaign.sentAt ? "Delivered" : "Pending",
        dateText: campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "Not sent",
        timestamp: parseTimestamp(campaign.sentAt ?? campaign.createdAt),
      })),
      ...supportTickets.map((msg) => ({
        id: `ticket-${msg.id}`,
        label: msg.subject || msg.name,
        type: "Ticket",
        badge: msg.status ?? "Ticket",
        meta: msg.email,
        status: msg.status === "open" ? "Awaiting response" : msg.status,
        dateText: msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "Incoming",
        timestamp: parseTimestamp(msg.createdAt ?? msg.updatedAt),
      })),
    ]

    return feed.sort((a, b) => b.timestamp - a.timestamp).slice(0, 6)
  }, [campaigns, supportTickets, posts])

  const formatMetricValue = (value: number | string, format?: "currency") => {
    if (typeof value === "number") {
      if (format === "currency") {
        return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
      }
      return value.toLocaleString()
    }
    return value
  }

  const formatDateTime = (value?: string | number | Date | null) => {
    if (value == null || value === "") return "—"
    const date =
      value instanceof Date
        ? value
        : typeof value === "number"
          ? new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value)
          : new Date(value)
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString("en-US", { dateStyle: "short", timeStyle: "medium" })
  }

  const packageEntries = useMemo(() => {
    const dependencies = Object.entries((appPackage as Record<string, any>).dependencies || {}).map(([name, version]) => ({
      name,
      version: String(version),
      type: "dependency",
    }))
    const devDependencies = Object.entries((appPackage as Record<string, any>).devDependencies || {}).map(
      ([name, version]) => ({
        name,
        version: String(version),
        type: "devDependency",
      }),
    )
    return [...dependencies, ...devDependencies]
  }, [])

  const filteredPackages = useMemo(() => {
    const term = packageSearch.trim().toLowerCase()
    const entries = term
      ? packageEntries.filter(
          (pkg) =>
            pkg.name.toLowerCase().includes(term) ||
            pkg.version.toLowerCase().includes(term) ||
            pkg.type.toLowerCase().includes(term),
        )
      : packageEntries
    return entries.slice(0, 40)
  }, [packageEntries, packageSearch])

  const renderTabContent = () => {
    switch (activeTab) {
      case "blog":
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/50 bg-card/40 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">Published Posts</p>
                <p className="text-3xl font-bold">{posts.length}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/40 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">Total Views</p>
                <p className="text-3xl font-bold">
                  {totalPostViews.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/40 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">Last Update</p>
                <p className="text-3xl font-bold">
                  {posts[0]?.publishedAt ? new Date(posts[0].publishedAt).toLocaleDateString() : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/40 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">Avg Views/Post</p>
                <p className="text-3xl font-bold">{averagePostViews.toLocaleString()}</p>
                <p className="text-xs text-foreground/60 mt-1">Based on live published posts</p>
              </div>
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search posts..."
                    value={blogSearch}
                    onChange={(e) => setBlogSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                  <select
                    value={blogCategoryFilter}
                    onChange={(e) => setBlogCategoryFilter(e.target.value)}
                    className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                  >
                    <option value="all">All categories</option>
                    {postCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadPosts}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => setIsBlogModalOpen(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Create Post
                  </button>
                </div>
              </div>
              {actionMessage && <p className="text-xs text-primary mb-2">{actionMessage}</p>}
              {postsError && <p className="text-sm text-destructive mb-4">{postsError}</p>}
              {postsLoading ? (
                <p className="text-sm text-foreground/60">Loading posts...</p>
              ) : filteredPosts.length ? (
                <div className="space-y-4">
                  {filteredPosts.map((post) => (
                    <div
                      key={post.id}
                      className="border border-border/40 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <p className="text-xs text-foreground/60 uppercase tracking-wide mb-1">{post.category}</p>
                        <p className="text-lg font-semibold">{post.title}</p>
                        <p className="text-xs text-foreground/60">
                          {new Date(post.publishedAt).toLocaleDateString()} - {post.views?.toLocaleString() ?? 0} views
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={buildBlogHref(post.slug, post.id)}
                          className="px-4 py-2 border border-border/50 rounded-lg hover:bg-card/50 transition-colors text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="px-4 py-2 border border-destructive/40 text-destructive rounded-lg hover:bg-destructive/10 transition-colors text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No posts match your filters.</p>
              )}
            </section>
          </>
        )
      case "newsletter": {
        const totalCampaigns = campaigns.length
        const totalRecipients = campaigns.reduce(
          (sum, campaign) => sum + (Number(campaign.recipientCount ?? 0) || 0),
          0,
        )
        const pendingCampaigns = campaigns.filter((campaign) => !campaign.sentAt).length
        const subscriberCount = newsletterSubscribers.length
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Campaigns", value: totalCampaigns, detail: "All-time newsletters" },
                { label: "Recipients reached", value: totalRecipients, detail: "Total targeted" },
                { label: "Pending", value: pendingCampaigns, detail: "Draft or scheduled" },
                {
                  label: "Subscribers",
                  value: subscriberCount,
                  detail: "Active mailing list",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search campaigns..."
                    value={newsletterSearch}
                    onChange={(e) => setNewsletterSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                  <select
                    value={newsletterFilter}
                    onChange={(e) => setNewsletterFilter(e.target.value)}
                    className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="sent">Sent</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadCampaigns}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => setIsNewsletterModalOpen(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Create Campaign
                  </button>
                </div>
              </div>
              {campaignMessage && <p className="text-xs text-primary mb-2">{campaignMessage}</p>}
              {campaignLoading && !campaigns.length ? (
                <p className="text-sm text-foreground/60">Loading campaigns...</p>
              ) : filteredCampaigns.length ? (
                <div className="space-y-3">
                  {filteredCampaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="border border-border/40 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold">{campaign.subject}</p>
                        <p className="text-xs text-foreground/60">
                          Sent {campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "pending"} -{" "}
                          {campaign.recipientCount ?? 0} recipients
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No campaigns match your filters.</p>
              )}
            </section>
          </>
        )
      }
      case "ticket":
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Open", value: openTickets, detail: "Awaiting response" },
                { label: "Resolved", value: ticketResolvedCount, detail: "Marked as resolved" },
                { label: "Closed", value: ticketClosedCount, detail: "Completed conversations" },
                { label: "Archived", value: ticketArchivedCount, detail: "Moved to archive" },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search tickets..."
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={ticketStatusFilter}
                      onChange={(e) => setTicketStatusFilter(e.target.value)}
                      className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                    >
                      <option value="all">All statuses</option>
                      <option value="open">Open</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="archived">Archived</option>
                    </select>
                    <select
                      value={ticketPriorityFilter}
                      onChange={(e) => setTicketPriorityFilter(e.target.value)}
                      className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                    >
                      <option value="all">All priorities</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadSupportTickets}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => setIsTicketModalOpen(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Create Ticket
                  </button>
                </div>
              </div>

              {supportTicketsError && <p className="text-sm text-destructive">{supportTicketsError}</p>}

              <div className="grid lg:grid-cols-[320px_1fr] gap-6">
                <div className="space-y-3">
                  {supportTicketsLoading && !supportTickets.length ? (
                    <p className="text-sm text-foreground/60">Loading tickets...</p>
                  ) : filteredTickets.length ? (
                    filteredTickets.map((ticket) => {
                      const isActive = ticket.id === selectedTicketId
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                            isActive
                              ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
                              : "border-border/50 bg-background/70 hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold truncate">{ticket.subject || "Support Ticket"}</p>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                                  ticket.status === "open"
                                    ? "bg-yellow-500/20 text-yellow-500"
                                    : ticket.status === "resolved"
                                      ? "bg-green-500/20 text-green-500"
                                      : ticket.status === "closed"
                                        ? "bg-foreground/10 text-foreground/60"
                                        : "bg-indigo-500/15 text-indigo-600"
                                }`}
                              >
                                {ticket.status}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                                  ticket.priority === "urgent"
                                    ? "bg-destructive/20 text-destructive"
                                    : ticket.priority === "high"
                                      ? "bg-amber-100 text-amber-900"
                                      : ticket.priority === "low"
                                        ? "bg-foreground/10 text-foreground/60"
                                        : "bg-primary/10 text-primary"
                                }`}
                              >
                                {ticket.priority || "normal"}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-foreground/60">{ticket.email}</p>
                          <p className="mt-2 line-clamp-2 text-sm text-foreground/70">{ticket.message}</p>
                          <p className="mt-2 text-[11px] text-foreground/50">
                            Updated {new Date(ticket.updatedAt).toLocaleString()}
                          </p>
                        </button>
                      )
                    })
                  ) : (
                    <p className="text-sm text-foreground/60">No tickets match your filters.</p>
                  )}
                </div>

                <div className="border border-border/50 rounded-xl bg-background/80 p-4 flex flex-col gap-4 min-h-[420px]">
                  {!selectedTicketId ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-foreground/60">
                      Select a ticket to view its conversation.
                    </div>
                  ) : ticketThreadLoading ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-foreground/60">
                      Loading conversation…
                    </div>
                  ) : ticketThreadError ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-sm text-destructive">
                      <p>{ticketThreadError}</p>
                      <button
                        onClick={() => fetchTicketThread(selectedTicketId)}
                        className="px-4 py-2 border border-destructive/40 rounded-lg hover:bg-destructive/10 transition"
                      >
                        Retry
                      </button>
                    </div>
                  ) : ticketThread ? (
                    <>
                      <div className="border-b border-border/40 pb-3 space-y-1">
                        <div className="flex items-center gap-3">
                          <p className="text-lg font-semibold">{ticketThread.subject || "Support Ticket"}</p>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                              ticketThread.status === "open"
                                ? "bg-yellow-500/20 text-yellow-500"
                                : ticketThread.status === "resolved"
                                  ? "bg-green-500/20 text-green-500"
                                  : "bg-foreground/10 text-foreground/60"
                            }`}
                          >
                            {ticketThread.status}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/60">
                          {ticketThread.name} • {ticketThread.email}
                          {ticketThread.subscription?.tier && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                              {ticketThread.subscription.tier} plan
                              {ticketThread.subscription.serverName ? ` • ${ticketThread.subscription.serverName}` : ""}
                            </span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs text-foreground/60">
                          <span>Created {new Date(ticketThread.createdAt).toLocaleString()}</span>
                          <span>Updated {new Date(ticketThread.updatedAt).toLocaleString()}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!discordId || !ticketThread) return
                              setDeveloperTokenMessage("Generating developer API key…")
                              setDeveloperToken(null)
                              try {
                                const requesterMessage =
                                  ticketThread.messages?.find((msg: any) => msg.role === "member") ?? null
                                const response = await fetch(`/api/admin/developer-keys?discordId=${discordId}`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    ticketId: ticketThread.id,
                                    requesterId: requesterMessage?.authorId || null,
                                    requesterEmail: ticketThread.email,
                                    requesterName: ticketThread.name,
                                    label: `Developer API Key (${ticketThread.email || ticketThread.name || "request"})`,
                                  }),
                                })
                                const payload = await response.json().catch(() => ({}))
                                if (!response.ok) {
                                  throw new Error(payload?.error || "Failed to generate key")
                                }
                                const token = payload?.token as string
                                setDeveloperToken(token)
                                setDeveloperTokenMessage("Key generated. It was also added to the ticket thread.")

                                if (token) {
                                  const form = new FormData()
                                  form.append(
                                    "message",
                                    `Here is your developer API token. Keep it secret:\n\n${token}\n\nRevoke it anytime via support.`,
                                  )
                                  form.append("authorName", "VectoBeat Support")
                                  await fetch(`/api/support-tickets/${ticketThread.id}?discordId=${discordId}`, {
                                    method: "POST",
                                    body: form,
                                  })
                                  await fetchTicketThread(ticketThread.id)
                                  loadSupportTickets()
                                }
                              } catch (error) {
                                console.error("Developer key generation failed:", error)
                                setDeveloperToken(null)
                                setDeveloperTokenMessage(
                                  error instanceof Error ? error.message : "Unable to generate key right now.",
                                )
                              }
                            }}
                            className="px-3 py-2 rounded-lg border border-primary/40 text-xs font-semibold hover:border-primary transition-colors"
                            disabled={!discordId}
                          >
                            Generate developer API key
                          </button>
                          {developerTokenMessage ? (
                            <span className="text-xs text-foreground/60">{developerTokenMessage}</span>
                          ) : null}
                          {developerToken ? (
                            <code className="text-xs px-2 py-1 rounded bg-card border border-border/50">{developerToken}</code>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex-1 space-y-4 overflow-y-auto pr-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {((
                          Array.isArray(ticketThread.messages) && ticketThread.messages.length
                            ? ticketThread.messages
                            : [
                                {
                                  id: `${ticketThread.id}-origin`,
                                  authorName: ticketThread.name,
                                  role: "member",
                                  body: ticketThread.message,
                                  createdAt: ticketThread.createdAt,
                                  attachments: [],
                                },
                              ]
                        ) as any[]).map((entry) => {
                          const attachments = Array.isArray(entry.attachments) ? entry.attachments : []
                          const isAgent = entry.role !== "member"
                          return (
                            <div key={entry.id} className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`max-w-[85%] rounded-lg border p-4 space-y-3 shadow-sm ${
                                  isAgent
                                    ? "border-primary/30 bg-primary/10 text-foreground"
                                    : "border-border/40 bg-card/40 text-foreground"
                                }`}
                              >
                                <div
                                  className={`flex flex-wrap items-center gap-2 text-sm ${
                                    isAgent ? "justify-end text-right" : ""
                                  }`}
                                >
                                  <p className="font-semibold">
                                    {entry.authorName || (entry.role === "member" ? ticketThread.name : "VectoBeat")}
                                  </p>
                                  <span className="text-foreground/50 text-xs">
                                    {new Date(entry.createdAt).toLocaleString()}
                                  </span>
                                  <span
                                    className={`text-[10px] uppercase tracking-[0.3em] ${
                                      entry.role === "member" ? "text-foreground/50" : "text-primary"
                                    }`}
                                  >
                                    {entry.role}
                                  </span>
                                </div>
                                <p className={`text-sm text-foreground/80 whitespace-pre-line ${isAgent ? "text-right" : ""}`}>
                                  {entry.body}
                                </p>
                                {!!attachments.length && (
                                  <div className="grid gap-3">
                                    {attachments.map((file: any, fileIndex: number) => {
                                      const mime = file.type || "application/octet-stream"
                                      const dataUrl = `data:${mime};base64,${file.content}`
                                      const isImage = mime.startsWith("image/")
                                      const isVideo = mime.startsWith("video/")
                                      const isPdf = mime === "application/pdf"
                                      return (
                                        <div
                                          key={`${entry.id}-file-${fileIndex}`}
                                          className="rounded-lg border border-border/40 bg-background/60 p-3 text-sm"
                                        >
                                          <div className="flex items-center justify-between gap-2 mb-2">
                                            <p className="font-semibold truncate">{file.name || `Attachment ${fileIndex + 1}`}</p>
                                            <a
                                              href={dataUrl}
                                              download={file.name || `attachment-${fileIndex + 1}`}
                                              className="text-primary text-xs hover:underline"
                                            >
                                              Download
                                            </a>
                                          </div>
                                          {isImage ? (
                                            <Image
                                              src={dataUrl}
                                              alt={file.name || "image attachment"}
                                              width={400}
                                              height={256}
                                              className="rounded-lg max-h-64 w-full object-contain"
                                              unoptimized
                                            />
                                          ) : isVideo ? (
                                            <video controls className="rounded-lg w-full max-h-64">
                                              <source src={dataUrl} type={mime} />
                                            </video>
                                          ) : isPdf ? (
                                            <iframe
                                              src={dataUrl}
                                              className="rounded-lg w-full h-48 bg-white"
                                              title={file.name || "PDF attachment"}
                                            />
                                          ) : (
                                            <p className="text-xs text-foreground/60">Preview unavailable.</p>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <form className="space-y-3" onSubmit={handleTicketReplySubmit}>
                        <textarea
                          placeholder="Write an update or reply..."
                          value={ticketReply}
                          onChange={(e) => setTicketReply(e.target.value)}
                          className="w-full rounded-lg border border-border/50 bg-background px-4 py-3 text-sm focus:border-primary/50 outline-none"
                          rows={4}
                        />
                        <div className="flex flex-wrap gap-3">
                          <select
                            value={ticketReplyStatus}
                            onChange={(e) => setTicketReplyStatus(e.target.value)}
                            className="px-4 py-2 rounded-lg bg-background border border-border/50 text-sm focus:border-primary/50 outline-none"
                          >
                            <option value="">Keep status</option>
                          <option value="open">Open</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                          <option value="archived">Archived</option>
                        </select>
                          <label className="px-4 py-2 rounded-lg border border-border/50 text-sm cursor-pointer hover:border-primary/50 transition">
                            Attach files
                            <input
                              key={ticketAttachmentKey}
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(event) => {
                                const files = Array.from(event.target.files || [])
                                setTicketAttachmentFiles(files)
                              }}
                            />
                          </label>
                          {!!ticketAttachmentFiles.length && (
                            <span className="text-xs text-foreground/60 self-center">
                              {ticketAttachmentFiles.length} attachment{ticketAttachmentFiles.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setTicketReply("")
                              setTicketReplyStatus("")
                              setTicketAttachmentFiles([])
                              setTicketAttachmentKey((key) => key + 1)
                            }}
                            className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
                          >
                            Reset
                          </button>
                          <button
                            type="submit"
                            disabled={supportTicketsLoading}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                          >
                            {supportTicketsLoading ? "Sending..." : "Send Reply"}
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center justify-center text-sm text-foreground/60">
                      No ticket selected.
                    </div>
                  )}
                </div>
              </div>
            </section>

          </>
        )
      case "contacts": {
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Total messages", value: contactMessages.length, detail: "All contact form submissions" },
                {
                  label: "Open",
                  value: contactMessages.filter((msg) => msg.status === "open").length,
                  detail: "Awaiting response",
                },
                {
                  label: "High/Urgent",
                  value: contactMessages.filter((msg) => ["high", "urgent"].includes(msg.priority)).length,
                  detail: "Prioritized messages",
                },
                {
                  label: "Responses sent",
                  value: contactMessages.filter((msg) => msg.response).length,
                  detail: "Replies delivered",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search contacts…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                  <select
                    value={contactStatusFilter}
                    onChange={(e) => setContactStatusFilter(e.target.value)}
                    className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadContactMessages}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                  Refresh
                </button>
                <button
                  onClick={() => setIsContactModalOpen(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Create Contact
                </button>
              </div>
              </div>
              {contactActionMessage && <p className="text-xs text-primary">{contactActionMessage}</p>}
              {contactError && <p className="text-sm text-destructive">{contactError}</p>}
              {contactLoading ? (
                <p className="text-sm text-foreground/60">Loading contact messages…</p>
              ) : filteredContacts.length ? (
                <div className="grid lg:grid-cols-[320px_1fr] gap-6">
                  <div className="space-y-3">
                    {filteredContacts.map((msg) => {
                      const isActive = selectedContactId === msg.id
                      const priorityBadge =
                        msg.priority === "urgent"
                          ? "bg-destructive/15 text-destructive"
                          : msg.priority === "high"
                            ? "bg-amber-500/20 text-amber-500"
                            : msg.priority === "low"
                              ? "bg-foreground/10 text-foreground/60"
                              : "bg-primary/10 text-primary"
                      const statusBadge =
                        msg.status === "resolved" || msg.status === "closed"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : msg.status === "archived"
                            ? "bg-foreground/10 text-foreground/60"
                            : "bg-indigo-500/15 text-indigo-600"
                      return (
                        <button
                          key={msg.id}
                          onClick={() => setSelectedContactId(msg.id)}
                          className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                            isActive
                              ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
                              : "border-border/50 bg-background/70 hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold truncate">{msg.subject || "Contact message"}</p>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${statusBadge}`}
                              >
                                {msg.status || "open"}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${priorityBadge}`}
                              >
                                {msg.priority || "normal"}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-foreground/60">{msg.email}</p>
                          <p className="mt-2 line-clamp-2 text-sm text-foreground/70">{msg.message}</p>
                          <div className="mt-2 text-[11px] text-foreground/50 flex items-center justify-between">
                            <span>{msg.company || msg.topic || "Contact"}</span>
                            <span>{formatDateTime(msg.updatedAt || msg.createdAt)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="border border-border/50 rounded-xl bg-background/80 p-4 flex flex-col gap-4 min-h-[420px]">
                    {!selectedContact ? (
                      <div className="flex flex-1 items-center justify-center text-sm text-foreground/60">
                        Select a contact to view details and reply by email.
                      </div>
                    ) : (
                      <>
                        <div className="border-b border-border/40 pb-3 space-y-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-lg font-semibold">{selectedContact.name}</p>
                            <span className="text-[11px] text-foreground/60 uppercase tracking-[0.2em]">
                              {selectedContact.status}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                selectedContact.priority === "urgent"
                                  ? "bg-destructive/15 text-destructive"
                                  : selectedContact.priority === "high"
                                    ? "bg-amber-500/20 text-amber-500"
                                    : selectedContact.priority === "low"
                                      ? "bg-foreground/10 text-foreground/60"
                                      : "bg-primary/10 text-primary"
                              }`}
                            >
                              {selectedContact.priority || "normal"}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/60">{selectedContact.email}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-foreground/60">
                            {selectedContact.company && <span>Company: {selectedContact.company}</span>}
                            {selectedContact.topic && <span>Topic: {selectedContact.topic}</span>}
                            {selectedContact.subject && <span>Subject: {selectedContact.subject}</span>}
                            <span>Submitted {new Date(selectedContact.createdAt).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/40 bg-background/80 p-3 text-sm text-foreground/80">
                          <p className="font-semibold text-foreground mb-1">Message</p>
                          <p className="whitespace-pre-line">{selectedContact.message}</p>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-foreground/60">Status</label>
                            <select
                              value={contactStatus || selectedContact.status || "open"}
                              onChange={(e) => {
                                setContactStatus(e.target.value)
                                void handleContactMessageUpdate(selectedContact.id, { status: e.target.value })
                              }}
                              className="w-full px-3 py-2 rounded-lg bg-background border border-border/50 text-sm"
                            >
                              <option value="open">Open</option>
                              <option value="resolved">Resolved</option>
                              <option value="closed">Closed</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-foreground/60">Priority</label>
                            <select
                              value={contactPriority || selectedContact.priority || "normal"}
                              onChange={(e) => {
                                setContactPriority(e.target.value)
                                void handleContactMessageUpdate(selectedContact.id, { priority: e.target.value })
                              }}
                              className="w-full px-3 py-2 rounded-lg bg-background border border-border/50 text-sm"
                            >
                              {["low", "normal", "high", "urgent"].map((value) => (
                                <option key={value} value={value}>
                                  {value.charAt(0).toUpperCase() + value.slice(1)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-foreground/70">Respond by email</label>
                          <textarea
                            value={contactResponse}
                            onChange={(e) => setContactResponse(e.target.value)}
                            rows={4}
                            className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                            placeholder="Write a reply that will be emailed to the sender."
                          />
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (!contactResponse.trim()) {
                                  setContactError("Bitte eine Antwort eingeben.")
                                  return
                                }
                                void handleContactMessageUpdate(selectedContact.id, { response: contactResponse })
                              }}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                            >
                              Send reply
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setContactResponse("")
                                setContactStatus("")
                                setContactPriority("")
                                setSelectedContactId(null)
                              }}
                              className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No contact messages yet.</p>
              )}
            </section>
          </>
        )
      }
      case "botControl": {
        const botStatus = systemHealth?.snapshot?.status || systemHealth?.snapshot?.state
        const isBotOnline =
          botStatus && botStatus !== "offline"
            ? true
            : !!(
                systemHealth?.snapshot?.uptimePercent != null ||
                (systemHealth?.snapshot?.activeListeners || 0) > 0 ||
                (systemHealth?.history || []).some((entry: any) => entry?.status === "online")
              )
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Actions", value: BOT_ACTIONS.length, detail: "Available lifecycle actions" },
                { label: "Pending", value: botActionLoading ? 1 : 0, detail: "Actions in progress" },
                { label: "Endpoints", value: (systemHealth?.history?.length ?? 0) || "—", detail: "Bot nodes" },
                {
                  label: "Uptime",
                  value:
                    systemHealth?.snapshot?.uptimePercent != null
                      ? `${systemHealth.snapshot.uptimePercent.toFixed?.(2) ?? systemHealth.snapshot.uptimePercent}%`
                      : "—",
                  detail: "From bot metrics",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search actions…"
                    onChange={(e) => setBotActionMessage(e.target.value ? `Filter: ${e.target.value}` : null)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadSystemHealth}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                    Refresh metrics
                  </button>
                </div>
              </div>
              <div className="text-xs text-foreground/60">
                {botActionMessage || "Trigger lifecycle actions for the bot and frontend."}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {BOT_ACTIONS.map((action) => (
                  <div
                    key={action.key}
                    className="border border-border/50 rounded-lg p-4 bg-background/70 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{action.label}</p>
                      <button
                        type="button"
                        className="px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                        disabled={botActionLoading === action.key || (action.key === "start" && isBotOnline)}
                        onClick={() => setConfirmModal({ action: action.key, label: action.label })}
                      >
                        {botActionLoading === action.key
                          ? "Running..."
                          : action.key === "start" && isBotOnline
                            ? "Bot running"
                            : action.label}
                      </button>
                    </div>
                    <p className="text-sm text-foreground/70">{action.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )
      }
      case "system": {
        const endpoints = [
          { label: "Frontend URL", value: typeof window !== "undefined" ? window.location.origin : "" },
          { label: "API base", value: "/api" },
          { label: "Bot status endpoint", value: systemEndpoints.statusApi || process.env.BOT_STATUS_API_URL || "" },
          {
            label: "Server settings endpoint",
            value: systemEndpoints.serverSettings || process.env.SERVER_SETTINGS_API_URL || "",
          },
        ]
        const filteredEndpoints = endpoints.filter((item) => {
          if (!systemEndpointSearch.trim()) return true
          const term = systemEndpointSearch.toLowerCase()
          return item.label.toLowerCase().includes(term) || item.value.toLowerCase().includes(term)
        })
        const snapshotEntries = Object.entries(systemHealth?.snapshot || {}).filter(
          ([, val]) => val !== undefined && val !== null && (typeof val === "string" || typeof val === "number"),
        )
        const historyItems = Array.isArray(systemHealth?.history) ? systemHealth?.history : []
        const openEnvFromEndpoint = (label: string, value: string) => {
          const normalizedKey = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")
          setEnvForm({ key: normalizedKey, value: value || "" })
          setIsEnvModalOpen(true)
        }
        const clientInfo =
          typeof window !== "undefined"
            ? {
                userAgent: navigator.userAgent,
                language: navigator.language,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                screen: `${window.screen.width}x${window.screen.height}`,
              }
            : null
        const clientPerf =
          typeof window !== "undefined" && typeof performance !== "undefined" && "memory" in performance
            ? (performance as unknown as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory
            : null
        const runtimeInfoDerived = {
          nodeEnv: process.env.NODE_ENV || "unknown",
          deployment: process.env.VERCEL_ENV || process.env.NEXT_RUNTIME || "local",
          nextRuntime: process.env.NEXT_RUNTIME || "edge/server",
          region:
            runtimeInfo?.region ||
            process.env.VERCEL_REGION ||
            process.env.AWS_REGION ||
            process.env.FLY_REGION ||
            "local",
          nodeVersion: runtimeInfo?.nodeVersion || process.version || null,
          platform: runtimeInfo?.platform || process.platform || null,
          arch: runtimeInfo?.arch || process.arch || null,
          pid: runtimeInfo?.pid ?? (typeof process.pid === "number" ? process.pid : null),
          uptimeSeconds:
            runtimeInfo?.uptimeSeconds ?? (typeof process.uptime === "function" ? Math.round(process.uptime()) : null),
        }
        const envMap = envEntries.reduce<Record<string, string>>((acc, cur) => {
          acc[cur.key] = cur.value
          return acc
        }, {})
        const snapshotTimestamp =
          systemHealth?.snapshot?.recordedAt || systemHealth?.snapshot?.timestamp || systemHealth?.snapshot?.createdAt
        const configChecks = [
          { label: "Database URL", key: "DATABASE_URL" },
          { label: "Bot status API", key: "BOT_STATUS_API_URL" },
          { label: "Server settings API", key: "SERVER_SETTINGS_API_URL", alt: systemEndpoints.serverSettings },
          { label: "Queue sync secret", key: "QUEUE_SYNC_API_KEY", alt: process.env.QUEUE_SYNC_SECRET },
          { label: "Log ingest token", key: "LOG_INGEST_TOKEN" },
        ].map((item) => {
          const value = envMap[item.key] || item.alt || process.env[item.key]
          return {
            ...item,
            configured: Boolean(value),
          }
        })
        const resourceOverview = [
          { label: "Env entries", value: envEntries.length },
          { label: "Tracked API keys", value: systemKeys.length },
          { label: "Log events loaded", value: logEvents.length },
          { label: "Endpoints", value: filteredEndpoints.length },
        ]
        const formatConn = (key: string) => {
          const val =
            envMap[key] ||
            (key === "SERVER_SETTINGS_API_URL" ? systemEndpoints.serverSettings : null) ||
            process.env[key]
          if (!val) return { configured: false, display: "Not configured" }
          try {
            const url = new URL(val)
            return { configured: true, display: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}` }
          } catch {
            return { configured: true, display: val }
          }
        }

  const resolveStatus = (configured: boolean) => {
    if (!configured) return "offline"
    const lastHistory = Array.isArray(systemHealth?.history) ? systemHealth.history[0] : null
    const state = (systemHealth?.snapshot?.status || lastHistory?.status || "").toString().toLowerCase()
    const isOffline = ["offline", "down", "error", "failed"].some((token) => state.includes(token))
    if (isOffline) return "offline"
    const isOnline = ["online", "ok", "healthy", "up"].some((token) => state.includes(token))
    return isOnline ? "online" : "online"
  }

        const redisPrimary =
          envMap.REDIS_URL || envMap.UPSTASH_REDIS_REST_URL || envMap.UPSTASH_REDIS_WS_URL || process.env.REDIS_URL
        const connectionOverview =
          connectivity && connectivity.length
            ? connectivity.map((conn) => ({
                label: conn.label,
                key: conn.key,
                display: conn.url || "Not configured",
                status: conn.status === "missing" ? "missing" : "configured",
                liveStatus: conn.status,
              }))
            : [
                {
                  label: "Database",
                  key: "DATABASE_URL",
                  ...formatConn("DATABASE_URL"),
                  status: formatConn("DATABASE_URL").configured ? "configured" : "missing",
                  liveStatus: "unknown",
                },
                {
                  label: "Redis",
                  key: "REDIS_URL",
                  configured: Boolean(redisPrimary),
                  display: formatConn(redisPrimary ? "REDIS_URL" : "UPSTASH_REDIS_REST_URL").display,
                  status: Boolean(redisPrimary) ? "configured" : "missing",
                  liveStatus: "unknown",
                },
                {
                  label: "Cache",
                  key: "CACHE_URL",
                  ...formatConn("CACHE_URL"),
                  status: formatConn("CACHE_URL").configured ? "configured" : "missing",
                  liveStatus: "unknown",
                },
                {
                  label: "Upstash REST",
                  key: "UPSTASH_REDIS_REST_URL",
                  ...formatConn("UPSTASH_REDIS_REST_URL"),
                  status: formatConn("UPSTASH_REDIS_REST_URL").configured ? "configured" : "missing",
                  liveStatus: "unknown",
                },
                {
                  label: "Upstash WS",
                  key: "UPSTASH_REDIS_WS_URL",
                  ...formatConn("UPSTASH_REDIS_WS_URL"),
                  status: formatConn("UPSTASH_REDIS_WS_URL").configured ? "configured" : "missing",
                  liveStatus: "unknown",
                },
                {
                  label: "Status API",
                  key: "BOT_STATUS_API_URL",
                  ...formatConn("BOT_STATUS_API_URL"),
                  status: formatConn("BOT_STATUS_API_URL").configured ? "configured" : "missing",
                  liveStatus: "unknown",
                },
                {
                  label: "Server settings",
                  key: "SERVER_SETTINGS_API_URL",
                  ...formatConn("SERVER_SETTINGS_API_URL"),
                  status: formatConn("SERVER_SETTINGS_API_URL").configured ? "configured" : "missing",
                  liveStatus: "unknown",
                },
                {
                  label: "Queue sync",
                  key: "QUEUE_SYNC_ENDPOINT",
                  ...formatConn("QUEUE_SYNC_ENDPOINT"),
                  status: formatConn("QUEUE_SYNC_ENDPOINT").configured ? "configured" : "missing",
                  liveStatus: "unknown",
                },
              ]
        const latestHealthTimestamp =
          systemHealth?.history && systemHealth.history.length
            ? systemHealth.history[0]?.timestamp || systemHealth.history[0]?.createdAt
            : systemHealth?.snapshot?.timestamp
      return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                {
                  label: "Nodes",
                  value: (systemHealth?.history?.length ?? 0) || "—",
                  detail: "Active bot nodes",
                },
                {
                  label: "Players",
                  value: systemHealth?.snapshot?.activeListeners ?? "—",
                  detail: "Current players",
                },
                {
                  label: "Listeners",
                  value: systemHealth?.snapshot?.activeListeners ?? "—",
                  detail: "Active listeners",
                },
                {
                  label: "Uptime",
                  value:
                    systemHealth?.snapshot?.uptimePercent != null
                      ? `${systemHealth.snapshot.uptimePercent.toFixed?.(2) ?? systemHealth.snapshot.uptimePercent}%`
                      : "—",
                  detail: "Reported uptime",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search endpoints..."
                    value={systemEndpointSearch}
                    onChange={(e) => setSystemEndpointSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadSystemHealth}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {systemHealthError && <p className="text-sm text-destructive">{systemHealthError}</p>}
              <div className="grid md:grid-cols-2 gap-3">
                {filteredEndpoints.length ? (
                  filteredEndpoints.map((item) => (
                    <div key={item.label} className="border border-border/40 rounded-lg p-4 bg-background/70 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">{item.label}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof navigator !== "undefined" && navigator.clipboard && item.value) {
                                navigator.clipboard.writeText(item.value).catch(() => null)
                              }
                            }}
                            className="px-2 py-1 text-[11px] border border-border/50 rounded-md hover:bg-card/60 transition-colors"
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => openEnvFromEndpoint(item.label, item.value)}
                            className="px-2 py-1 text-[11px] border border-border/50 rounded-md hover:bg-card/60 transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-foreground/80 break-all">{item.value || "Not configured"}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-foreground/60 col-span-full">No endpoints match your search.</p>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="border border-border/40 rounded-lg p-4 bg-background/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Connectivity</p>
                    <span className="text-[11px] text-foreground/60">Last update {formatDateTime(latestHealthTimestamp)}</span>
                  </div>
                  <div className="space-y-1 text-sm text-foreground/80">
                    {connectionOverview.map((conn) => (
                      <div key={conn.label} className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-semibold">{conn.label}</p>
                          <p className="text-xs text-foreground/60 break-all">{conn.display}</p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            conn.status === "configured"
                              ? "bg-primary/10 text-primary"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {conn.status}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            conn.liveStatus === "online"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-amber-500/15 text-amber-500"
                          }`}
                        >
                          {conn.liveStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-border/40 rounded-lg p-4 bg-background/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Packages</p>
                    <input
                      type="search"
                      value={packageSearch}
                      onChange={(e) => setPackageSearch(e.target.value)}
                      placeholder="Filter packages..."
                      className="px-3 py-1.5 text-xs rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                    />
                  </div>
                  <div className="space-y-2 max-h-72 overflow-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {filteredPackages.map((pkg) => (
                      <div key={`${pkg.type}-${pkg.name}`} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-semibold">{pkg.name}</p>
                          <p className="text-[11px] uppercase tracking-[0.2em] text-foreground/50">{pkg.type}</p>
                        </div>
                        <span className="text-xs font-semibold text-foreground/70">{pkg.version}</span>
                      </div>
                    ))}
                    {!filteredPackages.length && (
                      <p className="text-xs text-foreground/60">No packages match your search.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid lg:grid-cols-4 sm:grid-cols-2 gap-3">
                {resourceOverview.map((res) => (
                  <div
                    key={res.label}
                    className="rounded-xl border border-border/40 bg-background/70 p-4 flex flex-col gap-1"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">{res.label}</p>
                    <p className="text-2xl font-bold">
                      {typeof res.value === "number" ? res.value.toLocaleString() : String(res.value)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="border border-border/40 rounded-lg p-4 bg-background/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Snapshot</p>
                    <span className="text-[11px] text-foreground/60">
                      {formatDateTime(snapshotTimestamp) || "No timestamp"}
                    </span>
                  </div>
                  {snapshotEntries.length ? (
                    <div className="space-y-1">
                      {snapshotEntries.map(([key, val]) => {
                        const label = key
                          .replace(/([a-z])([A-Z])/g, "$1 $2")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())
                        const isTimestampKey = /time|date|at$|since$/i.test(key)
                        const value =
                          typeof val === "number"
                            ? val.toLocaleString()
                            : isTimestampKey
                              ? formatDateTime(val as string)
                              : String(val)
                        return (
                          <div key={key} className="flex items-center justify-between text-sm text-foreground/80">
                            <span className="capitalize">{label}</span>
                            <span className="font-semibold">{value}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/60">No snapshot metrics available.</p>
                  )}
                </div>
                <div className="border border-border/40 rounded-lg p-4 bg-background/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">History</p>
                    <span className="text-[11px] text-foreground/60">{historyItems.length} entries</span>
                  </div>
                  {historyItems.length ? (
                    <div className="space-y-2 max-h-72 overflow-auto pr-1">
                      {historyItems.slice(0, 12).map((item: any, idx: number) => (
                        <div key={`history-${idx}`} className="border border-border/30 rounded-md p-2 bg-background/70">
                          <div className="flex items-center justify-between text-xs text-foreground/70">
                            <span>{item.status || "OK"}</span>
                          <span className="text-[10px] text-foreground/50">{formatDateTime(item.timestamp)}</span>
                          </div>
                          {item.uptimePercent != null && (
                            <p className="text-[11px] text-foreground/70">Uptime {item.uptimePercent}%</p>
                          )}
                          {item.activeListeners != null && (
                            <p className="text-[11px] text-foreground/70">Listeners {item.activeListeners}</p>
                          )}
                          {item.message && <p className="text-[11px] text-foreground/60">{item.message}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/60">No history yet.</p>
                  )}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="border border-border/40 rounded-lg p-4 bg-background/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Runtime</p>
                    <span className="text-[11px] text-foreground/60">Deployment</span>
                  </div>
                  <div className="space-y-1 text-sm text-foreground/80">
                    <div className="flex items-center justify-between">
                      <span>Node env</span>
                      <span className="font-semibold">{runtimeInfoDerived.nodeEnv}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Environment</span>
                      <span className="font-semibold">{runtimeInfoDerived.deployment}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Runtime</span>
                      <span className="font-semibold">{runtimeInfoDerived.nextRuntime}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Region</span>
                      <span className="font-semibold">{runtimeInfoDerived.region || "—"}</span>
                    </div>
                  </div>
                </div>
                <div className="border border-border/40 rounded-lg p-4 bg-background/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Frontend session</p>
                    <span className="text-[11px] text-foreground/60">Client</span>
                  </div>
                  {clientInfo ? (
                    <div className="space-y-1 text-sm text-foreground/80">
                      <div className="flex items-center justify-between">
                        <span>Timezone</span>
                        <span className="font-semibold">{clientInfo.timezone}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Language</span>
                        <span className="font-semibold">{clientInfo.language}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Screen</span>
                        <span className="font-semibold">{clientInfo.screen}</span>
                      </div>
                      <div className="text-xs text-foreground/60 break-all">
                        {clientInfo.userAgent || "No user agent"}
                      </div>
                      {clientPerf ? (
                        <div className="text-xs text-foreground/60">
                          Memory{" "}
                          {clientPerf.usedJSHeapSize && clientPerf.jsHeapSizeLimit
                            ? `${(clientPerf.usedJSHeapSize / 1048576).toFixed(1)} MB / ${(
                                (clientPerf.jsHeapSizeLimit || 0) /
                                1048576
                              ).toFixed(1)} MB`
                            : "n/a"}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/60">Client details available in browser only.</p>
                  )}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="border border-border/40 rounded-lg p-4 bg-background/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Backend</p>
                    <span className="text-[11px] text-foreground/60">Server</span>
                  </div>
                  <div className="space-y-1 text-sm text-foreground/80">
                    <div className="flex items-center justify-between">
                      <span>Node version</span>
                      <span className="font-semibold">{runtimeInfoDerived.nodeVersion || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Platform</span>
                      <span className="font-semibold">
                        {(runtimeInfoDerived.platform || "n/a") + " " + (runtimeInfoDerived.arch || "")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Process</span>
                      <span className="font-semibold">
                        {typeof runtimeInfoDerived.pid === "number" && Number.isFinite(runtimeInfoDerived.pid)
                          ? runtimeInfoDerived.pid
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Next runtime</span>
                      <span className="font-semibold">{runtimeInfoDerived.nextRuntime}</span>
                    </div>
                  </div>
                </div>
                <div className="border border-border/40 rounded-lg p-4 bg-background/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Configuration</p>
                    <span className="text-[11px] text-foreground/60">Env</span>
                  </div>
                  <div className="space-y-1 text-sm text-foreground/80">
                    {configChecks.map((check) => (
                      <div key={check.key} className="flex items-center justify-between">
                        <span>{check.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            check.configured ? "bg-primary/10 text-primary" : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {check.configured ? "Configured" : "Missing"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )
      }
      case "logs": {
        const filteredLogs = logEvents.filter((item) => {
          const typeValue = (item.type || "").toLowerCase()
          const matchesType = logTypeFilter === "all" ? true : typeValue.includes(logTypeFilter)
          if (!matchesType) return false
          if (!logSearch.trim()) return true
          const term = logSearch.toLowerCase()
          return (
            (item.type && item.type.toLowerCase().includes(term)) ||
            (item.name && item.name.toLowerCase().includes(term)) ||
            (item.guildId && String(item.guildId).toLowerCase().includes(term)) ||
            (item.metadata && JSON.stringify(item.metadata).toLowerCase().includes(term))
          )
        })
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Items", value: logEvents.length, detail: "Recent combined activity" },
                {
                  label: "Blog",
                  value: logEvents.filter((item) => item.type === "Blog update").length,
                  detail: "Content updates",
                },
                {
                  label: "Tickets",
                  value: logEvents.filter((item) => item.type === "Ticket").length,
                  detail: "Support events",
                },
                {
                  label: "Campaigns",
                  value: logEvents.filter((item) => item.type === "Campaign").length,
                  detail: "Newsletter events",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search logs..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                  <select
                    value={logTypeFilter}
                    onChange={(e) => setLogTypeFilter(e.target.value)}
                    className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                  >
                    <option value="all">All types</option>
                    <option value="blog">Blog</option>
                    <option value="ticket">Ticket</option>
                    <option value="campaign">Campaign</option>
                    <option value="bot">Bot</option>
                    <option value="system">System</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-xs text-foreground/70">
                    <input
                      type="checkbox"
                      checked={logsLive}
                      onChange={(e) => setLogsLive(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Live refresh
                  </label>
                  <button
                    onClick={loadLogs}
                    className="px-3 py-2 border border-border/60 rounded-lg text-xs font-semibold hover:bg-card/40 transition-colors"
                  >
                    Refresh
                  </button>
                  <a
                    href={
                      discordId
                        ? `/api/admin/logs?discordId=${encodeURIComponent(discordId)}&download=1`
                        : undefined
                    }
                    className="px-3 py-2 border border-border/60 rounded-lg text-xs font-semibold hover:bg-card/40 transition-colors"
                    aria-disabled={!discordId}
                  >
                    Download JSON
                  </a>
                </div>
              </div>
              {logsLoading ? (
                <p className="text-sm text-foreground/60">Loading logs…</p>
              ) : logsError ? (
                <p className="text-sm text-destructive">{logsError}</p>
              ) : filteredLogs.length ? (
                <div className="space-y-3">
                  {filteredLogs.map((item) => (
                    <div
                      key={`log-${item.id}`}
                      className="border border-border/40 rounded-lg p-4 bg-background/80 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">{item.type}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-primary">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {item.name && <p className="text-xs text-foreground/70 font-semibold">{item.name}</p>}
                      <p className="text-xs text-foreground/60">
                        {item.guildId ? `Guild: ${item.guildId}` : "Global"} •{" "}
                        {item.success != null ? (item.success ? "Success" : "Failed") : "—"}
                      </p>
                      {item.metadata && (
                        <pre className="text-[11px] text-foreground/70 bg-background/60 rounded p-2 overflow-x-auto">
                          {JSON.stringify(item.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No recent activity yet.</p>
              )}
            </section>
          </>
        )
      }
      case "users": {
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Total users", value: totalUsers, detail: "Tracked profiles" },
                { label: "Admins", value: adminCount, detail: "Role: admin" },
                { label: "Operators", value: operatorCount, detail: "Role: operator" },
                { label: "Active this week", value: recentActiveUsers, detail: "Last seen ≤ 7 days" },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                  >
                    <option value="all">All roles</option>
                    <option value="member">Member</option>
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadAdminUsers}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {usersError && <p className="text-sm text-destructive mb-4">{usersError}</p>}
              {usersLoading ? (
                <p className="text-sm text-foreground/60">Loading users…</p>
              ) : filteredUsers.length ? (
                <div className="space-y-3">
                  {filteredUsers.map((user) => {
                    const publicProfileHref = user.profilePublic ? buildProfileHref(user.handle) : null
                    return (
                      <div
                        key={user.id}
                        className="border border-border/40 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                            {user.avatarUrl ? (
                              <Image
                                src={user.avatarUrl}
                                alt={user.displayName || user.username || user.id}
                                width={48}
                                height={48}
                                className="h-12 w-12 object-cover"
                                unoptimized
                              />
                            ) : (
                              <span className="font-semibold text-primary">
                                {(user.displayName || user.username || user.id).slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold">{user.displayName || user.username || "Unknown user"}</p>
                            <p className="text-xs text-foreground/60">{user.email || "No email"}</p>
                            <p className="text-xs text-foreground/50">
                              Last seen {new Date(user.lastSeen).toLocaleString()} • Guilds {user.guildCount}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1 justify-end">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <span className="text-xs text-foreground/60">
                              2FA: {user.twoFactorEnabled ? "Enabled" : "Disabled"}
                            </span>
                            <select
                              value={user.role}
                              onChange={(e) => handleUserRoleChange(user.id, e.target.value as UserRole)}
                              disabled={userRoleUpdating === user.id}
                              className="px-4 py-2 rounded-lg bg-background border border-border/50 text-sm focus:border-primary/50 outline-none"
                            >
                              <option value="member">Member</option>
                              <option value="operator">Operator</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {publicProfileHref && (
                              <Link
                                href={publicProfileHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
                              >
                                Public profile
                              </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => setUserPreview(user)}
                              className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
                            >
                              Quick view
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No users match your filters.</p>
              )}
            </section>
          </>
        )
      }
      case "subscriptions": {
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Active", value: activeSubscriptionCount, detail: "Billing every month" },
                { label: "Canceled", value: canceledSubscriptionCount, detail: "Ended plans" },
                { label: "Past due", value: overdueSubscriptionCount, detail: "Need attention" },
                { label: "MRR (€)", value: subscriptionMRR, detail: "Active monthly revenue" },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search subscriptions..."
                    value={subscriptionSearch}
                    onChange={(e) => setSubscriptionSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                  <select
                    value={subscriptionStatusFilter}
                    onChange={(e) => setSubscriptionStatusFilter(e.target.value)}
                    className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="past_due">Past due</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={loadAdminSubscriptions}
                  className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setIsSubscriptionModalOpen(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Create Subscription
                </button>
              </div>
            </div>
              {subscriptionsError && <p className="text-sm text-destructive mb-4">{subscriptionsError}</p>}
              {subscriptionsLoading ? (
                <p className="text-sm text-foreground/60">Loading subscriptions…</p>
              ) : filteredSubscriptions.length ? (
                <div className="space-y-4">
                  {filteredSubscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="border border-border/40 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                    >
                      <div>
                        <p className="font-semibold">{sub.name}</p>
                        <p className="text-xs text-foreground/60">
                          Guild ID {sub.discordServerId} • Tier {sub.tier || "—"}
                        </p>
                        <p className="text-xs text-foreground/60">
                          Period {new Date(sub.currentPeriodStart).toLocaleDateString()} →{" "}
                          {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 lg:items-center">
                        <select
                          value={sub.status}
                          onChange={(e) => handleSubscriptionUpdate(sub.id, { status: e.target.value })}
                          disabled={subscriptionUpdating === sub.id}
                          className="px-4 py-2 rounded-lg bg-background border border-border/50 text-sm focus:border-primary/50 outline-none"
                        >
                          <option value="active">Active</option>
                          <option value="past_due">Past due</option>
                          <option value="canceled">Canceled</option>
                          <option value="trialing">Trialing</option>
                        </select>
                        <select
                          value={sub.tier}
                          onChange={(e) => handleSubscriptionUpdate(sub.id, { tier: e.target.value })}
                          disabled={subscriptionUpdating === sub.id}
                          className="px-4 py-2 rounded-lg bg-background border border-border/50 text-sm focus:border-primary/50 outline-none"
                        >
                          {["free", "starter", "pro", "growth", "scale", "enterprise"].map((tier) => (
                            <option key={tier} value={tier}>
                              {tier.charAt(0).toUpperCase() + tier.slice(1)}
                            </option>
                          ))}
                        </select>
                        <span className="text-sm font-semibold">{sub.pricePerMonth.toFixed(2)} €</span>
                        <button
                          type="button"
                          onClick={() => setSubscriptionPreview(sub)}
                          className="px-4 py-2 border border-border/60 rounded-lg text-sm font-semibold hover:bg-card/60 transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No subscriptions match your filters.</p>
              )}
            </section>
          </>
        )
      }
      case "billing": {
        const overdue = billingItems.filter((item) => item.overdue).length
        const upcoming = billingItems.filter((item) => !item.overdue && item.status === "active").length
        const monthlyRecurring = subscriptionMRR
        const nextRenewal = billingItems
          .filter((item) => item.status === "active" && new Date(item.currentPeriodEnd).getTime() > Date.now())
          .map((item) => new Date(item.currentPeriodEnd))
          .sort((a, b) => a.getTime() - b.getTime())[0]
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Active invoices", value: upcoming, detail: "Due in current cycle" },
                { label: "Overdue", value: overdue, detail: "Need attention" },
                { label: "MRR (€)", value: monthlyRecurring, detail: "Active revenue" },
                {
                  label: "Next renewal",
                  value: nextRenewal ? formatDateTime(nextRenewal) : "—",
                  detail: "Closest billing date",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search billing…"
                    value={billingSearch}
                    onChange={(e) => setBillingSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                  <select
                    className="px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm"
                    value={subscriptionStatusFilter}
                    onChange={(e) => setSubscriptionStatusFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="past_due">Past due</option>
                    <option value="canceled">Canceled</option>
                    <option value="trialing">Trialing</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Enter Stripe checkout session ID"
                    value={billingInvoiceSessionId}
                    onChange={(e) => setBillingInvoiceSessionId(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadAdminSubscriptions}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleBillingInvoiceRequest}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Generate invoice
                  </button>
                </div>
              </div>
              {billingMessage && <p className="text-xs text-foreground/60">{billingMessage}</p>}

              <div className="space-y-3">
                {filteredBillingItems.length ? (
                  filteredBillingItems.map((item) => (
                    <div
                      key={`billing-${item.id}`}
                      className="border border-border/40 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                    >
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-foreground/60">
                          Next invoice {new Date(item.currentPeriodEnd).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold">{item.pricePerMonth.toFixed(2)} €</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                            item.overdue ? "bg-destructive/20 text-destructive" : "bg-primary/10 text-primary"
                          }`}
                        >
                          {item.overdue ? "Overdue" : "Scheduled"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setBillingPreview(item)}
                          className="px-4 py-2 text-sm font-semibold border border-border/60 rounded-lg hover:bg-card/60 transition-colors"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openInvoiceForSubscription(item.id)}
                          className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          Invoice
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-foreground/60">No billing data yet.</p>
                )}
              </div>
            </section>
          </>
        )
      }
      case "apiKeys": {
        const configuredCount = systemKeys.filter((key) => key.configured).length
        const requiredMissing = systemKeys.filter((key) => key.required && !key.configured).length
        const optionalMissing = systemKeys.filter((key) => !key.required && !key.configured).length
        const endpoints = [
          { label: "Status API URL", value: systemEndpoints.statusApi },
          { label: "Queue sync endpoint", value: systemEndpoints.queueSync },
          { label: "Server settings endpoint", value: systemEndpoints.serverSettings },
          { label: "Telemetry ingest", value: systemEndpoints.telemetry },
          {
            label: "Status fallbacks",
            value:
              systemEndpoints.statusFallbacks && systemEndpoints.statusFallbacks.length
                ? systemEndpoints.statusFallbacks.join(", ")
                : "",
          },
        ]
        const copyToClipboard = (value: string) => {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(value).catch(() => null)
          }
        }
        return (
          <>
            <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
              {[
                { label: "Configured keys", value: configuredCount, detail: "Active secrets in runtime" },
                { label: "Missing (required)", value: requiredMissing, detail: "Keys that block automation" },
                { label: "Missing (optional)", value: optionalMissing, detail: "Recommended hardening" },
                { label: "Env entries", value: envEntries.length || 0, detail: "Variables in .env" },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search API keys…"
                    value={apiKeySearch}
                    onChange={(e) => setApiKeySearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={loadSystemKeys}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                    disabled={systemKeyLoading}
                  >
                    {systemKeyLoading ? "Refreshing…" : "Refresh"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSystemKeyError(null)
                      setIsApiKeyModalOpen(true)
                    }}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Create API key
                  </button>
                </div>
              </div>
              {systemKeyMessage && <p className="text-xs text-primary">{systemKeyMessage}</p>}
              {systemKeyError && <p className="text-sm text-destructive">{systemKeyError}</p>}
              {systemKeyLoading ? (
                <p className="text-sm text-foreground/60">Loading API key status…</p>
              ) : filteredSystemKeys.length ? (
                <div className="space-y-3">
                  {filteredSystemKeys.map((entry) => (
                    <div
                      key={entry.id}
                      className="border border-border/40 rounded-lg p-4 bg-background/70 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="font-semibold">{entry.label}</p>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                              entry.configured
                                ? "bg-primary/10 text-primary"
                                : entry.required
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-foreground/10 text-foreground/60"
                            }`}
                          >
                            {entry.configured ? "Configured" : entry.required ? "Missing" : "Optional"}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/70">{entry.description}</p>
                        <p className="text-xs text-foreground/60">
                          Env: <code className="text-xs">{entry.envVar}</code>
                          {entry.envVars.length > 1 && ` (fallbacks: ${entry.envVars.slice(1).join(", ")})`}
                        </p>
                        <p className="text-xs text-foreground/50">
                          {entry.preview ? `Last 4: ${entry.lastFour} (${entry.preview})` : "Not detected in runtime."}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleGenerateSystemKey(entry.id)}
                          disabled={systemKeyGenerating === entry.id}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                          {systemKeyGenerating === entry.id ? "Generating…" : "Generate new key"}
                        </button>
                        {entry.preview && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(entry.envVar)}
                            className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
                          >
                            Copy env var
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No tracked services yet.</p>
              )}
            </section>

            {generatedSystemKey && (
              <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-5 space-y-2">
                <p className="text-sm font-semibold text-emerald-200">
                  New key for {generatedSystemKey.service} ({generatedSystemKey.envVar})
                </p>
                <code className="text-sm break-all text-emerald-100">{generatedSystemKey.value}</code>
                <p className="text-xs text-emerald-200/70">
                  Update your environment variable and restart services to apply this key. It is not stored in the panel.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedSystemKey.value)}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Copy key
                  </button>
                  {generatedSystemKey.envVar && (
                    <span className="text-xs text-foreground/70 self-center">
                      Target env: <code className="text-xs">{generatedSystemKey.envVar}</code>
                    </span>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap gap-3">
                  <input
                    type="search"
                    placeholder="Search env…"
                    value={envSearch}
                    onChange={(e) => setEnvSearch(e.target.value)}
                    className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={loadEnvEntries}
                  className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/50 transition-colors"
                  disabled={envLoading}
                  >
                    {envLoading ? "Refreshing…" : "Reload .env"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEnvModalOpen(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Add entry
                  </button>
                </div>
              </div>

              <section className="grid md:grid-cols-2 gap-3">
                {endpoints.map((endpoint) => (
                  <div
                    key={endpoint.label}
                    className="border border-border/40 rounded-lg p-4 bg-background/60 flex flex-col gap-1"
                  >
                    <p className="text-sm font-semibold">{endpoint.label}</p>
                    <p className="text-xs text-foreground/60 break-all">{endpoint.value || "Not configured"}</p>
                  </div>
                ))}
              </section>

              {envMessage && <p className="text-xs text-primary">{envMessage}</p>}
              {envError && <p className="text-xs text-destructive">{envError}</p>}

              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-2">
                {filteredEnvEntries.map((entry, index) => (
                  <div
                    key={`${entry.key}-${index}`}
                    className="border border-border/40 rounded-lg p-3 bg-background/70 flex flex-col gap-2"
                  >
                    <label className="text-xs font-semibold text-foreground/60">Key</label>
                    <input
                      value={entry.key}
                      onChange={(e) => {
                        const nextKey = e.target.value
                        upsertEnvEntry(entry.key, nextKey, entry.value)
                      }}
                      className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    />
                    <label className="text-xs font-semibold text-foreground/60">Value</label>
                    <textarea
                      value={entry.value}
                      onChange={(e) => {
                        upsertEnvEntry(entry.key, entry.key, e.target.value)
                      }}
                      rows={2}
                      className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                    />
                </div>
              ))}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={loadEnvEntries}
                  className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
                  disabled={envLoading}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleEnvSave}
                  disabled={envLoading}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {envLoading ? "Saving…" : "Save .env"}
                </button>
              </div>
            </section>
          </>
        )
      }
      case "forum": {
        return (
          <div className="space-y-6">
            <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">Forum manager</h3>
                  <p className="text-xs text-foreground/60">
                    Browse categories, threads und Posts. Moderation folgt.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <select
                    value={forumSelectedCategory}
                    onChange={(e) => {
                      const slug = e.target.value
                      setForumSelectedCategory(slug)
                      setForumSelectedThread("")
                      void loadForumData({ category: slug, threadId: "" })
                    }}
                    className="px-4 py-2 rounded-lg bg-background border border-border/50 text-sm focus:border-primary/50 outline-none"
                  >
                    <option value="">Alle Kategorien</option>
                    {forumCategories.map((cat) => (
                      <option key={cat.id ?? cat.slug} value={cat.slug ?? cat.id}>
                        {cat.title} ({cat.threadCount ?? cat.threads?.length ?? 0})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => loadForumData()}
                    className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
                    disabled={forumLoading}
                  >
                    {forumLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Kategorien</h4>
                    <span className="text-xs text-foreground/60">{forumCategories.length}</span>
                  </div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 muted-scroll">
                    {forumCategories.map((cat) => (
                      <button
                        key={cat.id ?? cat.slug}
                        onClick={() => {
                          setForumSelectedCategory(cat.slug ?? cat.id ?? "")
                          setForumSelectedThread("")
                          void loadForumData({ category: cat.slug ?? cat.id ?? "" })
                        }}
                        className={`w-full text-left border rounded-lg px-3 py-2 ${
                          forumSelectedCategory === (cat.slug ?? cat.id)
                            ? "border-primary/60 bg-primary/5"
                            : "border-border/40 hover:border-primary/40"
                        }`}
                      >
                        <p className="text-sm font-semibold">{cat.title}</p>
                        <p className="text-xs text-foreground/60">
                          {cat.threadCount ?? cat.threads?.length ?? 0} Threads
                        </p>
                      </button>
                    ))}
                    {forumCategories.length === 0 && <p className="text-sm text-foreground/60">Keine Kategorien.</p>}
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Threads</h4>
                    <span className="text-xs text-foreground/60">{forumThreads.length}</span>
                  </div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 muted-scroll">
                    {forumThreads.map((thread) => (
                      <button
                        key={thread.id}
                        onClick={() => setForumSelectedThread(thread.id)}
                        className={`w-full text-left border rounded-lg px-3 py-2 ${
                          forumSelectedThread === thread.id
                            ? "border-primary/60 bg-primary/5"
                            : "border-border/40 hover:border-primary/40"
                        }`}
                      >
                        <p className="text-sm font-semibold">{thread.title}</p>
                        <p className="text-xs text-foreground/60">
                          {thread.categorySlug || "forum"} · {thread.authorName || "Team"} · {thread.replies} replies
                        </p>
                      </button>
                    ))}
                    {forumThreads.length === 0 && <p className="text-sm text-foreground/60">Keine Threads gefunden.</p>}
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Beiträge</h4>
                    <span className="text-xs text-foreground/60">{forumPosts.length}</span>
                  </div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 muted-scroll">
                    {forumPosts.map((post) => (
                      <div key={post.id} className="border border-border/40 rounded-lg px-3 py-2 bg-background/70">
                        <p className="text-xs text-foreground/60 mb-1">
                          {post.authorName || "Member"} · {new Date(post.createdAt).toLocaleString()}
                        </p>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{post.body}</p>
                      </div>
                    ))}
                    {forumPosts.length === 0 && (
                      <p className="text-sm text-foreground/60">
                        {forumSelectedThread ? "Keine Beiträge im Thread." : "Thread auswählen, um Beiträge zu sehen."}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <section className="rounded-xl border border-border/50 bg-card/30 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Neueste Events</h4>
                  <span className="text-xs text-foreground/60">{forumEvents.length} events</span>
                </div>
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 muted-scroll">
                  {forumEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-border/40 bg-background/60 p-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-foreground text-sm">{event.action}</p>
                        <p className="text-xs text-foreground/60">
                          {event.entityType} · {event.actorName || "Unknown"} · {event.categorySlug || "forum"}
                        </p>
                      </div>
                      <span className="text-xs text-foreground/60">
                        {new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                  {forumEvents.length === 0 && (
                    <p className="text-sm text-foreground/60">Noch keine Forum-Events.</p>
                  )}
                </div>
              </section>
            </section>
          </div>
        )
      }
      case "overview":
      default: {
        const overviewHighlights: MetricStat[] = [
          {
            label: "Active users",
            value: totalUsers,
            detail: "Profiles synced across Discord",
          },
          {
            label: "Privileged staff",
            value: adminCount + operatorCount,
            detail: "Admins & operators",
          },
          {
            label: "Open tickets",
            value: openTickets,
            detail: "Require moderator attention",
          },
          {
            label: "Active plans",
            value: activeSubscriptionCount,
            detail: "Billing every month",
          },
          { label: "MRR (€)", value: subscriptionMRR, detail: "Projected monthly revenue", format: "currency" },
          {
            label: "Newsletter reach",
            value: newsletterReach,
            detail: "Recipients across campaigns",
          },
          {
            label: "Pending replies",
            value: pendingTicketReplies,
            detail: "Draft a response",
          },
          {
            label: "Published updates",
            value: posts.length,
            detail: "Live blog posts",
          },
        ]

        const sentCampaigns = campaigns.filter((campaign) => campaign.sentAt).length
        const pendingCampaigns = campaigns.length - sentCampaigns
        const revenueSnapshot: MetricStat[] = [
          { label: "Active plans", value: activeSubscriptionCount, detail: "Billing this month" },
          { label: "Past due", value: overdueSubscriptionCount, detail: "Need follow-up" },
          { label: "MRR (€)", value: subscriptionMRR, detail: "Projected €", format: "currency" },
        ]
        const communicationsPulse: MetricStat[] = [
          { label: "Subscribers", value: newsletterSubscribers.length, detail: "Reachable audience" },
          { label: "Campaigns sent", value: sentCampaigns, detail: "Delivered newsletters" },
          { label: "Campaigns pending", value: pendingCampaigns, detail: "Queued drafts" },
          { label: "Open tickets", value: openTickets, detail: "Awaiting response" },
        ]

        const quickActions = [
          {
            label: "Guild feature controls",
            description: "Jump directly to server-level bot automation settings.",
            href: { pathname: "/control-panel" },
          },
          {
            label: "Live telemetry",
            description: "Inspect uptime, listeners, and real-time bot metrics.",
            href: { pathname: "/stats" },
          },
          {
            label: "Pricing & entitlements",
            description: "Audit plan unlocks before enabling premium toggles.",
            href: { pathname: "/pricing" },
          },
        ]

        return (
          <>
            <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {overviewHighlights.map((card) => (
                <div key={card.label} className="rounded-xl border border-border/50 bg-card/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">{card.label}</p>
                  <p className="text-3xl font-bold">{formatMetricValue(card.value, card.format)}</p>
                  <p className="text-xs text-foreground/60 mt-1">{card.detail}</p>
                </div>
              ))}
            </section>

            <section className="grid lg:grid-cols-3 gap-6">
              <div className="rounded-xl border border-border/50 bg-card/30 p-6">
                <h2 className="text-2xl font-bold mb-4">Revenue snapshot</h2>
                <div className="space-y-3">
                  {revenueSnapshot.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-center justify-between rounded-lg border border-border/30 bg-background/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">{stat.label}</p>
                        <p className="text-xs text-foreground/60">{stat.detail}</p>
                      </div>
                      <span className="text-xl font-bold">{formatMetricValue(stat.value, stat.format)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-card/30 p-6">
                <h2 className="text-2xl font-bold mb-4">Communications pulse</h2>
                <div className="space-y-3">
                  {communicationsPulse.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-center justify-between rounded-lg border border-border/30 bg-background/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">{stat.label}</p>
                        <p className="text-xs text-foreground/60">{stat.detail}</p>
                      </div>
                      <span className="text-xl font-bold">{formatMetricValue(stat.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-card/30 p-6">
                <h2 className="text-2xl font-bold mb-4">Admin shortcuts</h2>
                <div className="space-y-4">
                  {quickActions.map((action) => (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="block border border-border/40 rounded-lg p-4 hover:border-primary/40 hover:bg-card/50 transition-colors"
                    >
                      <p className="font-semibold">{action.label}</p>
                      <p className="text-sm text-foreground/60">{action.description}</p>
                    </Link>
                  ))}
                </div>
              </div>

            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Priority Tickets</h2>
                <span className="text-xs text-foreground/60">
                  {openTickets} open • {ticketClosedCount} closed
                </span>
              </div>
              {recentOpenTickets.length ? (
                <div className="space-y-3">
                  {recentOpenTickets.map((ticket) => (
                    <div key={ticket.id} className="border border-border/40 rounded-lg p-4">
                      <p className="font-semibold">{ticket.subject || ticket.name}</p>
                      <p className="text-sm text-foreground/60 mb-2">{ticket.email}</p>
                      <p className="text-sm text-foreground/80 line-clamp-3">{ticket.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No open tickets right now. Great job!</p>
              )}
            </section>

            <section className="rounded-xl border border-border/50 bg-card/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Recent Activity</h2>
                <span className="text-xs text-foreground/60">{activityFeed.length ? "Live stream" : "No activity yet"}</span>
              </div>
              {activityFeed.length ? (
                <div className="space-y-3">
                  {activityFeed.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border/40 rounded-lg p-4 flex flex-col gap-1 bg-background/80"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{item.label}</span>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-primary">{item.badge}</span>
                      </div>
                      <p className="text-xs text-foreground/60">{item.meta}</p>
                      <p className="text-xs text-foreground/60">{item.status}</p>
                      <p className="text-[11px] text-foreground/50">{item.dateText}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground/60">No activity has been tracked yet.</p>
              )}
            </section>
          </>
        )
      }
    }
  }

  const closeBlogModal = () => {
    setIsBlogModalOpen(false)
    setActionMessage(null)
    setForm(initialForm)
  }

  const closeNewsletterModal = () => {
    setIsNewsletterModalOpen(false)
    setCampaignMessage(null)
    setCampaignForm({ subject: "", body: "" })
  }

  const closeTicketModal = () => {
    setIsTicketModalOpen(false)
    setTicketModalMessage(null)
    setTicketDraft((prev) => ({ ...prev, subject: "", message: "" }))
  }

  const activeTabMeta = ADMIN_TABS.find((tab) => tab.key === activeTab)
  const userPreviewProfileHref =
    userPreview && userPreview.profilePublic ? buildProfileHref(userPreview.handle) : null

  const handleCreatePost = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!discordId) {
      setActionMessage("Missing authentication context.")
      return
    }

    setSavingPost(true)
    setActionMessage(null)
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" }
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch("/api/blog", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          discordId,
          ...form,
          author: form.author || "VectoBeat Team",
        }),
      })
      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error || "Failed to save post")
      }
      setForm(initialForm)
      setActionMessage("Post published successfully.")
      loadPosts()
    } catch (error) {
      console.error("Failed to publish post:", error)
      setActionMessage(error instanceof Error ? error.message : "Failed to publish post")
    } finally {
      setSavingPost(false)
    }
  }

  const handleCreateCampaign = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!discordId) return
    if (!campaignForm.subject || !campaignForm.body) {
      setCampaignMessage("Subject and body are required.")
      return
    }
    setCampaignMessage(null)
    setCampaignLoading(true)
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" }
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch("/api/newsletter/campaigns", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ discordId, subject: campaignForm.subject, body: campaignForm.body }),
      })
      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error || "Failed to send campaign")
      }
      setCampaignForm({ subject: "", body: "" })
      setCampaignMessage("Newsletter sent!")
      loadCampaigns()
    } catch (error) {
      console.error("Newsletter campaign failed:", error)
      setCampaignMessage(error instanceof Error ? error.message : "Unable to send newsletter.")
    } finally {
      setCampaignLoading(false)
    }
  }

  const handleCreateTicket = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!discordId) {
        setTicketModalMessage("Missing authentication context.")
        return
      }
      if (!ticketDraft.name || !ticketDraft.email || !ticketDraft.message) {
        setTicketModalMessage("Name, email, and message are required.")
        return
      }
      setTicketSubmitting(true)
      setTicketModalMessage(null)
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const response = await fetch("/api/support-tickets", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            discordId,
            name: ticketDraft.name,
            email: ticketDraft.email,
            subject: ticketDraft.subject,
            category: ticketDraft.category,
            priority: ticketDraft.priority,
            message: ticketDraft.message,
          }),
        })
        if (!response.ok) {
          const payload = await response.json()
          throw new Error(payload.error || "Failed to create ticket")
        }
        setTicketModalMessage("Ticket logged successfully.")
        setTicketDraft((prev) => ({ ...prev, subject: "", message: "" }))
        loadSupportTickets()
        closeTicketModal()
      } catch (error) {
        console.error("Failed to create ticket:", error)
        setTicketModalMessage(error instanceof Error ? error.message : "Unable to create ticket.")
      } finally {
        setTicketSubmitting(false)
      }
    },
    [authToken, discordId, loadSupportTickets, ticketDraft],
  )

  const handleTicketReplySubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!selectedTicketId || !discordId) {
        setSupportTicketsError("Select a ticket and ensure authentication is valid.")
        return
      }
      if (!ticketReply.trim() && ticketAttachmentFiles.length === 0) {
        setSupportTicketsError("Add a reply message or at least one attachment.")
        return
      }
      setSupportTicketsLoading(true)
      setSupportTicketsError(null)
      try {
        const formData = new FormData()
        formData.append("message", ticketReply)
        if (ticketReplyStatus) {
          formData.append("status", ticketReplyStatus)
        }
        formData.append("authorName", adminProfile.name || "VectoBeat Admin")
        ticketAttachmentFiles.forEach((file, index) => {
          formData.append(`attachment_${index}`, file)
        })
        const response = await fetch(`/api/support-tickets/${selectedTicketId}?discordId=${discordId}`, {
          method: "POST",
          body: formData,
          credentials: "include",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Unable to send reply")
        }
        setTicketReply("")
        setTicketReplyStatus("")
        setTicketAttachmentFiles([])
        setTicketAttachmentKey((key) => key + 1)
        await fetchTicketThread(selectedTicketId)
        loadSupportTickets()
      } catch (error) {
        console.error("Failed to reply to ticket:", error)
        setSupportTicketsError(error instanceof Error ? error.message : "Unable to send reply.")
      } finally {
        setSupportTicketsLoading(false)
      }
    },
    [
      adminProfile.name,
      authToken,
      discordId,
      fetchTicketThread,
      loadSupportTickets,
      selectedTicketId,
      ticketAttachmentFiles,
      ticketReply,
      ticketReplyStatus,
    ],
  )

  const handleUserRoleChange = useCallback(
    async (targetId: string, nextRole: UserRole) => {
      if (!discordId) return
      setUserRoleUpdating(targetId)
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const response = await fetch("/api/admin/users", {
          method: "PATCH",
          headers,
          credentials: "include",
          body: JSON.stringify({ discordId, targetId, role: nextRole }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Failed to update user role")
        }
        await loadAdminUsers()
      } catch (error) {
        console.error("Failed to change user role:", error)
        setUsersError(error instanceof Error ? error.message : "Unable to update user role")
      } finally {
        setUserRoleUpdating(null)
      }
    },
    [authToken, discordId, loadAdminUsers],
  )

  const handleSubscriptionUpdate = useCallback(
    async (subscriptionId: string, updates: Partial<AdminSubscriptionRow>) => {
      if (!discordId) return
      setSubscriptionUpdating(subscriptionId)
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const response = await fetch("/api/admin/subscriptions", {
          method: "PATCH",
          headers,
          credentials: "include",
          body: JSON.stringify({ discordId, subscriptionId, updates }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Failed to update subscription")
        }
        await loadAdminSubscriptions()
      } catch (error) {
        console.error("Failed to update subscription:", error)
        setSubscriptionsError(error instanceof Error ? error.message : "Unable to update subscription")
      } finally {
        setSubscriptionUpdating(null)
      }
    },
    [authToken, discordId, loadAdminSubscriptions],
  )

  const handleBillingInvoiceRequest = useCallback(() => {
    if (!billingInvoiceSessionId.trim()) {
      setBillingMessage("Enter a Stripe checkout session ID.")
      return
    }
    const sessionId = billingInvoiceSessionId.trim()
    const url = `/api/billing/invoice?sessionId=${encodeURIComponent(sessionId)}`
    setBillingMessage("Generating invoice…")
    window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => setBillingMessage(null), 3000)
  }, [billingInvoiceSessionId])

  const openInvoiceForSubscription = useCallback((subscriptionId: string) => {
    if (!subscriptionId) return
    const url = `/api/billing/invoice?subscriptionId=${encodeURIComponent(subscriptionId)}`
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer")
    }
  }, [])

  const handleContactMessageUpdate = useCallback(
    async (messageId: string, overrides?: { status?: string; response?: string; priority?: string }) => {
      if (!discordId) return
      setContactActionMessage(null)
      setContactError(null)
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const payload: Record<string, any> = {
          discordId,
          messageId,
        }
        const isSelected = selectedContactId === messageId
        const responseValue =
          overrides?.response !== undefined
            ? overrides.response
            : isSelected
              ? contactResponse
              : undefined
        if (overrides?.status !== undefined) {
          payload.status = overrides.status
        } else if (responseValue) {
          const createdAt = selectedContact?.createdAt ? new Date(selectedContact.createdAt).getTime() : null
          const ageMs = createdAt ? Date.now() - createdAt : 0
          const ageDays = ageMs / (1000 * 60 * 60 * 24)
          const autoStatus = ageDays >= 30 ? "closed" : "resolved"
          payload.status = autoStatus
          setContactStatus(autoStatus)
        } else if (isSelected && contactStatus) {
          payload.status = contactStatus
        }
        if (overrides?.priority !== undefined) {
          payload.priority = overrides.priority
        } else if (isSelected && contactPriority) {
          payload.priority = contactPriority
        }
        if (responseValue) {
          payload.response = responseValue
        }
        const response = await fetch("/api/contact/messages", {
          method: "PUT",
          headers,
          credentials: "include",
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Failed to update message")
        }
        setContactActionMessage("Message updated.")
        setContactResponse("")
        setContactPriority("")
        if (payload.status) {
          setContactStatus(payload.status)
        }
        await loadContactMessages()
      } catch (error) {
        console.error("Failed to update contact message:", error)
        setContactError(error instanceof Error ? error.message : "Unable to update contact message")
      }
    },
    [
      authToken,
      contactPriority,
      contactResponse,
      contactStatus,
      discordId,
      loadContactMessages,
      selectedContact,
      selectedContactId,
    ],
  )

  const persistEnvEntries = useCallback(
    async (entries: AdminEnvEntry[]) => {
      if (!discordId) return
      setEnvLoading(true)
      setEnvMessage(null)
      setEnvError(null)
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const botUpdates = entries
          .filter((entry) => entry.key.startsWith("BOT_") || ["DATABASE_URL", "REDIS_URL", "CACHE_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_WS_URL", "QUEUE_SYNC_ENDPOINT"].includes(entry.key))
          .map((entry) => ({ key: entry.key, value: entry.value }))
        const frontendUpdates = entries
          .filter((entry) => !botUpdates.some((b) => b.key === entry.key))
          .map((entry) => ({ key: entry.key, value: entry.value }))

        const saveTarget = async (target: "frontend" | "bot", updates: { key: string; value: string }[]) => {
          if (!updates.length) return
          const response = await fetch("/api/admin/env", {
            method: "PUT",
            headers,
            credentials: "include",
            body: JSON.stringify({
              discordId,
              target,
              updates,
            }),
          })
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}))
            throw new Error(payload.error || `Failed to save ${target} .env file`)
          }
        }

        await saveTarget("frontend", frontendUpdates)
        await saveTarget("bot", botUpdates)
        setEnvMessage("Environment updated. Restart services to apply changes.")
        await loadEnvEntries()
      } catch (error) {
        console.error("Failed to save env entries:", error)
        setEnvError(error instanceof Error ? error.message : "Unable to save env entries")
      } finally {
        setEnvLoading(false)
      }
    },
    [authToken, discordId, loadEnvEntries],
  )

  const handleEnvSave = useCallback(async () => persistEnvEntries(envEntries), [envEntries, persistEnvEntries])

  const handleGenerateSystemKey = useCallback(
    async (serviceId: string) => {
      if (!discordId) return
      setSystemKeyGenerating(serviceId)
      setGeneratedSystemKey(null)
      setSystemKeyError(null)
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const response = await fetch("/api/admin/system-keys", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ discordId, service: serviceId }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Failed to generate key")
        }
        const payload = await response.json()
        setGeneratedSystemKey({ service: payload.service, value: payload.key, envVar: payload.envVar })
        setSystemKeyMessage(payload.message || "Key generated. Saving to environment.")
        if (payload.envVar) {
          const nextEntries = (() => {
            const exists = envEntries.some((entry) => entry.key === payload.envVar)
            if (exists) {
              return envEntries.map((entry) =>
                entry.key === payload.envVar ? { ...entry, value: payload.key } : entry,
              )
            }
            return [...envEntries, { key: payload.envVar, value: payload.key }]
          })()
          setEnvEntries(nextEntries)
          await persistEnvEntries(nextEntries)
        }
      } catch (error) {
        console.error("Failed to generate system key:", error)
        setSystemKeyError(error instanceof Error ? error.message : "Unable to generate system key")
      } finally {
        setSystemKeyGenerating(null)
      }
    },
    [authToken, discordId, envEntries, persistEnvEntries],
  )
  const handleEnvCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!envForm.key.trim()) {
        setEnvError("Key is required")
        return
      }
      const nextEntries = [...envEntries, { key: envForm.key.trim(), value: envForm.value }]
      setEnvEntries(nextEntries)
      setIsEnvModalOpen(false)
      setEnvForm({ key: "", value: "" })
      await persistEnvEntries(nextEntries)
    },
    [envEntries, envForm, persistEnvEntries],
  )

  const handleApiKeyCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setSystemKeyError(null)
      if (!apiKeyForm.envVar.trim()) {
        setSystemKeyError("Env var is required")
        return
      }
      const envVar = apiKeyForm.envVar.trim().toUpperCase()
      const label = apiKeyForm.label.trim() || envVar
      const value = apiKeyForm.value

      const nextEnvEntries = (() => {
        const existingIndex = envEntries.findIndex((entry) => entry.key === envVar)
        if (existingIndex >= 0) {
          const clone = [...envEntries]
          clone[existingIndex] = { key: envVar, value }
          return clone
        }
        return [...envEntries, { key: envVar, value }]
      })()

      setEnvEntries(nextEnvEntries)
      setSystemKeys((prev) => [
        {
          id: `${envVar}-${Date.now()}`,
          label,
          envVar,
          envVars: [envVar],
          description: apiKeyForm.description || "Custom key",
          category: "custom",
          required: apiKeyForm.required,
          configured: Boolean(value),
          lastFour: value ? value.slice(-4) : null,
          preview: value ? `${value.slice(0, 2)}…${value.slice(-2)}` : null,
        },
        ...prev,
      ])
      setIsApiKeyModalOpen(false)
      setApiKeyForm({ label: "", envVar: "", value: "", description: "", required: true })
      await persistEnvEntries(nextEnvEntries)
    },
    [apiKeyForm, envEntries, persistEnvEntries],
  )

  const triggerBotAction = useCallback(
    async (action: string, label: string) => {
      if (!discordId) return
      setBotActionLoading(action)
      setBotActionMessage(null)
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const response = await fetch("/api/admin/bot-control", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ discordId, action }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Control action failed")
        }
        setBotActionMessage(`${label} triggered.`)
      } catch (error) {
        console.error("Bot control failed:", error)
        setBotActionMessage(error instanceof Error ? error.message : "Bot control failed")
      } finally {
        setBotActionLoading(null)
      }
    },
    [authToken, discordId],
  )

  const handleCreateContact = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!discordId) return
      setContactError(null)
      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          credentials: "include",
          body: JSON.stringify({
            name: newContact.name,
            email: newContact.email,
            subject: newContact.subject,
            topic: newContact.topic,
            company: newContact.company,
            priority: newContact.priority,
            message: newContact.message,
          }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Failed to create contact")
        }
        setContactActionMessage("Contact created.")
        setNewContact({
          name: "",
          email: "",
          subject: "",
          topic: "",
          priority: "normal",
          company: "",
          message: "",
        })
        setIsContactModalOpen(false)
        await loadContactMessages()
      } catch (error) {
        console.error("Failed to create contact:", error)
        setContactError(error instanceof Error ? error.message : "Unable to create contact")
      }
    },
    [authToken, discordId, loadContactMessages, newContact],
  )

  const handleCreateSubscription = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!discordId) return
      setSubscriptionsError(null)
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" }
        if (authToken) headers.Authorization = `Bearer ${authToken}`
        const response = await fetch("/api/admin/subscriptions", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            discordId,
            subscriptionId: undefined,
            updates: {
              discordId: newSubscription.discordId,
              discordServerId: newSubscription.discordServerId,
              name: newSubscription.name,
              guildName: newSubscription.name,
              stripeCustomerId: newSubscription.stripeCustomerId || null,
              tier: newSubscription.tier,
              status: newSubscription.status,
              pricePerMonth: Number(newSubscription.pricePerMonth) || 0,
              currentPeriodStart: normalizeDateInputValue(newSubscription.currentPeriodStart),
              currentPeriodEnd: normalizeDateInputValue(newSubscription.currentPeriodEnd),
            },
            create: true,
          }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || "Failed to create subscription")
        }
        setIsSubscriptionModalOpen(false)
        setNewSubscription({
          discordId: "",
          discordServerId: "",
          name: "",
          tier: "starter",
          status: "active",
          pricePerMonth: 0,
          currentPeriodStart: "",
          currentPeriodEnd: "",
          stripeCustomerId: "",
        })
        await loadAdminSubscriptions()
      } catch (error) {
        console.error("Failed to create subscription:", error)
        setSubscriptionsError(error instanceof Error ? error.message : "Unable to create subscription")
      }
    },
    [authToken, discordId, loadAdminSubscriptions, newSubscription],
  )

  const handleDeletePost = async (postId: string) => {
    if (!discordId) return
    if (!window.confirm("Delete this blog post? This cannot be undone.")) {
      return
    }
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" }
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch(`/api/blog/${postId}`, {
        method: "DELETE",
        headers,
        credentials: "include",
        body: JSON.stringify({ discordId }),
      })
      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error || "Failed to delete post")
      }
      loadPosts()
    } catch (error) {
      console.error("Failed to delete blog post:", error)
      setActionMessage("Unable to delete post.")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin mx-auto mb-4" />
            <p className="text-foreground/70">Checking permissions...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md border border-border/50 rounded-xl p-8 bg-card/40">
            <h1 className="text-3xl font-bold mb-4">Access Restricted</h1>
            <p className="text-foreground/70 mb-6">
              You need an administrator role to access the VectoBeat control room.
            </p>
              <Link
                href="/control-panel"
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              Back to Control Panel
            </Link>
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
        <main className="flex-1 w-full pt-24 pb-12 px-4">
          <div className="max-w-6xl mx-auto space-y-10">
            <header>
              <p className="text-xs uppercase tracking-[0.3em] text-foreground/60 mb-2">Control Room</p>
              <h1 className="text-4xl font-bold">Admin Control Panel</h1>
              <p className="text-foreground/70 mt-2">
                Manage VectoBeat content and monitor community communications.
              </p>
            </header>

            <section>
              <div className="border-b border-border/60 overflow-x-auto pb-1 bg-card/40 rounded-lg muted-scroll">
                <div className="flex flex-nowrap gap-3 min-w-max px-1">
                  {ADMIN_TABS.map((tab) => {
                    const isActive = tab.key === activeTab
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                          isActive
                            ? "text-primary border-primary"
                            : "text-foreground/60 border-transparent hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              {activeTabMeta && <p className="text-xs text-foreground/60 mt-3">{activeTabMeta.description}</p>}
            </section>

            <div className="space-y-8 pt-4">{renderTabContent()}</div>
      </div>
        </main>
        <Footer />
      </div>
      <AdminPageStyles />
      {confirmModal && (
        <Modal title="Confirm action" onClose={() => setConfirmModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground/70">
              {`Are you sure you want to ${confirmModal.label.toLowerCase()}? This may impact active users.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void triggerBotAction(confirmModal.action, confirmModal.label)
                  setConfirmModal(null)
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}

      {isContactModalOpen && (
        <Modal title="Create Contact Message" onClose={() => setIsContactModalOpen(false)}>
          <form className="space-y-4" onSubmit={handleCreateContact}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Name</label>
                <input
                  value={newContact.name}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Email</label>
                <input
                  type="email"
                  value={newContact.email}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  required
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Company</label>
                <input
                  value={newContact.company}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, company: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Topic</label>
                <input
                  value={newContact.topic}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, topic: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  required
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Subject</label>
                <input
                  value={newContact.subject}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, subject: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Priority</label>
                <select
                  value={newContact.priority}
                  onChange={(e) => setNewContact((prev) => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Message</label>
              <textarea
                value={newContact.message}
                onChange={(e) => setNewContact((prev) => ({ ...prev, message: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                rows={4}
                required
              />
            </div>
            {contactError && <p className="text-xs text-destructive">{contactError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isSubscriptionModalOpen && (
        <Modal title="Create Subscription" onClose={() => setIsSubscriptionModalOpen(false)}>
          <form className="space-y-4" onSubmit={handleCreateSubscription}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Discord ID (owner)</label>
                <input
                  value={newSubscription.discordId}
                  onChange={(e) => setNewSubscription((prev) => ({ ...prev, discordId: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Server ID</label>
                <input
                  value={newSubscription.discordServerId}
                  onChange={(e) => setNewSubscription((prev) => ({ ...prev, discordServerId: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  required
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Guild name</label>
                <input
                  value={newSubscription.name}
                  onChange={(e) => setNewSubscription((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Stripe customer ID</label>
                <input
                  value={newSubscription.stripeCustomerId}
                  onChange={(e) => setNewSubscription((prev) => ({ ...prev, stripeCustomerId: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  placeholder="cus_xxx"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Tier</label>
                <select
                  value={newSubscription.tier}
                  onChange={(e) => setNewSubscription((prev) => ({ ...prev, tier: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                >
                  {["free", "starter", "pro", "growth", "scale", "enterprise"].map((tier) => (
                    <option key={tier} value={tier}>
                      {tier.charAt(0).toUpperCase() + tier.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Status</label>
                <select
                  value={newSubscription.status}
                  onChange={(e) => setNewSubscription((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                >
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="canceled">Canceled</option>
                  <option value="trialing">Trialing</option>
                </select>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Price / month (€)</label>
                <input
                  type="number"
                  value={newSubscription.pricePerMonth}
                  onChange={(e) =>
                    setNewSubscription((prev) => ({ ...prev, pricePerMonth: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  step="0.01"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold mb-2 block">Period start</label>
                  <input
                    type="date"
                    value={normalizeDateInputValue(newSubscription.currentPeriodStart)}
                    onChange={(e) => setNewSubscription((prev) => ({ ...prev, currentPeriodStart: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-2 block">Period end</label>
                  <input
                    type="date"
                    value={normalizeDateInputValue(newSubscription.currentPeriodEnd)}
                    onChange={(e) => setNewSubscription((prev) => ({ ...prev, currentPeriodEnd: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  />
                </div>
              </div>
            </div>
            {subscriptionsError && <p className="text-xs text-destructive">{subscriptionsError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSubscriptionModalOpen(false)}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isEnvModalOpen && (
        <Modal title="Add environment entry" onClose={() => setIsEnvModalOpen(false)}>
          <form className="space-y-4" onSubmit={handleEnvCreate}>
            <div>
              <label className="text-sm font-semibold mb-2 block">Key</label>
              <input
                value={envForm.key}
                onChange={(e) => setEnvForm((prev) => ({ ...prev, key: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Value</label>
              <textarea
                value={envForm.value}
                onChange={(e) => setEnvForm((prev) => ({ ...prev, value: e.target.value }))}
                rows={3}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
              />
            </div>
            {envError && <p className="text-xs text-destructive">{envError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEnvModalOpen(false)}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
      {isApiKeyModalOpen && (
        <Modal title="Create API key" onClose={() => setIsApiKeyModalOpen(false)}>
          <form className="space-y-4" onSubmit={handleApiKeyCreate}>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold mb-2 block">Label</label>
                <input
                  value={apiKeyForm.label}
                  onChange={(e) => setApiKeyForm((prev) => ({ ...prev, label: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  placeholder="e.g. Discord Bot Token"
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Env variable</label>
                <input
                  value={apiKeyForm.envVar}
                  onChange={(e) => setApiKeyForm((prev) => ({ ...prev, envVar: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none uppercase"
                  placeholder="BOT_TOKEN"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Value</label>
              <textarea
                value={apiKeyForm.value}
                onChange={(e) => setApiKeyForm((prev) => ({ ...prev, value: e.target.value }))}
                rows={3}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                placeholder="Secret value will be written to .env"
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Description</label>
              <input
                value={apiKeyForm.description}
                onChange={(e) => setApiKeyForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                placeholder="What this key is for"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground/70">
              <input
                type="checkbox"
                checked={apiKeyForm.required}
                onChange={(e) => setApiKeyForm((prev) => ({ ...prev, required: e.target.checked }))}
                className="h-4 w-4"
              />
              Required key (mark as blocking if missing)
            </label>
            {systemKeyError && <p className="text-xs text-destructive">{systemKeyError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsApiKeyModalOpen(false)}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Save key
              </button>
            </div>
          </form>
        </Modal>
      )}
      {subscriptionPreview && (
        <Modal title="Subscription overview" onClose={() => setSubscriptionPreview(null)}>
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/40 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">Plan status</p>
                <p className="text-2xl font-bold capitalize">{subscriptionPreview.status}</p>
                <p className="text-xs text-foreground/60">
                  Tier {subscriptionPreview.tier} — {subscriptionPreview.pricePerMonth.toFixed(2)} € / month
                </p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-foreground/50 mb-2">Current period</p>
                <p className="text-sm font-semibold">
                  {formatDateTime(subscriptionPreview.currentPeriodStart)} →{" "}
                  {formatDateTime(subscriptionPreview.currentPeriodEnd)}
                </p>
                <p className="text-xs text-foreground/60">Renews automatically unless canceled</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div className="space-y-2">
                <p>
                  <span className="text-foreground/60">Guild:</span> {subscriptionPreview.name}
                </p>
                <p>
                  <span className="text-foreground/60">Guild ID:</span> {subscriptionPreview.discordServerId}
                </p>
                <p>
                  <span className="text-foreground/60">Owner Discord ID:</span> {subscriptionPreview.discordId}
                </p>
              </div>
              <div className="space-y-2">
                <p>
                  <span className="text-foreground/60">Stripe customer:</span>{" "}
                  {subscriptionPreview.stripeCustomerId || "—"}
                </p>
                <p>
                  <span className="text-foreground/60">Status:</span>{" "}
                  <span className="font-semibold capitalize">{subscriptionPreview.status}</span>
                </p>
                <p>
                  <span className="text-foreground/60">Tier:</span>{" "}
                  <span className="font-semibold capitalize">{subscriptionPreview.tier}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => openInvoiceForSubscription(subscriptionPreview.id)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                Download invoice PDF
              </button>
              <button
                type="button"
                onClick={() => setSubscriptionPreview(null)}
                className="px-4 py-2 border border-border/60 rounded-lg font-semibold hover:bg-card/60 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {billingPreview && (
        <Modal title="Billing details" onClose={() => setBillingPreview(null)}>
          <div className="space-y-6">
            <div className="rounded-xl border border-border/50 bg-background/70 p-4 flex flex-col gap-1">
              <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">Invoice status</p>
              <p className="text-2xl font-bold">{billingPreview.overdue ? "Overdue" : "Scheduled"}</p>
              <p className="text-xs text-foreground/60">
                Next invoice on {formatDateTime(billingPreview.currentPeriodEnd)}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div className="space-y-2">
                <p>
                  <span className="text-foreground/60">Guild:</span> {billingPreview.name}
                </p>
                <p>
                  <span className="text-foreground/60">Guild ID:</span> {billingPreview.discordServerId}
                </p>
                <p>
                  <span className="text-foreground/60">Owner Discord ID:</span> {billingPreview.discordId}
                </p>
                <p>
                  <span className="text-foreground/60">Stripe customer:</span>{" "}
                  {billingPreview.stripeCustomerId || "—"}
                </p>
              </div>
              <div className="space-y-2">
                <p>
                  <span className="text-foreground/60">Tier:</span>{" "}
                  <span className="font-semibold capitalize">{billingPreview.tier}</span>
                </p>
                <p>
                  <span className="text-foreground/60">Monthly price:</span>{" "}
                  {billingPreview.pricePerMonth.toFixed(2)} €
                </p>
                <p>
                  <span className="text-foreground/60">Current period:</span>{" "}
                  {formatDateTime(billingPreview.currentPeriodStart)} → {formatDateTime(billingPreview.currentPeriodEnd)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => openInvoiceForSubscription(billingPreview.id)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                Download invoice PDF
              </button>
              <button
                type="button"
                onClick={() => setBillingPreview(null)}
                className="px-4 py-2 border border-border/60 rounded-lg font-semibold hover:bg-card/60 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {userPreview && (
        <Modal title="User profile" onClose={() => setUserPreview(null)}>
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {userPreview.avatarUrl ? (
                <Image
                  src={userPreview.avatarUrl}
                  alt={userPreview.displayName || userPreview.username || userPreview.id}
                  width={80}
                  height={80}
                  className="h-20 w-20 object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-2xl font-semibold text-primary">
                  {(userPreview.displayName || userPreview.username || userPreview.id).slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-lg font-semibold">{userPreview.displayName || userPreview.username || userPreview.id}</p>
              <p className="text-sm text-foreground/60">{userPreview.email || "No email on file"}</p>
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.25em] text-foreground/60">
                <span>{userPreview.role}</span>
                <span>{userPreview.twoFactorEnabled ? "2FA ENABLED" : "2FA DISABLED"}</span>
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-foreground/60">Guilds:</span> {userPreview.guildCount.toLocaleString()}
              </p>
              <p>
                <span className="text-foreground/60">Last seen:</span> {new Date(userPreview.lastSeen).toLocaleString()}
              </p>
              <p>
                <span className="text-foreground/60">Phone:</span> {userPreview.phone || "—"}
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-foreground/60">Handle:</span> {userPreview.handle || "Not set"}
              </p>
              <p>
                <span className="text-foreground/60">Public profile:</span>{" "}
                {userPreview.profilePublic && userPreview.handle ? "Visible" : "Hidden"}
              </p>
              {userPreviewProfileHref && (
                <Link
                  href={userPreviewProfileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-primary font-semibold hover:underline"
                >
                  Open public profile
                </Link>
              )}
            </div>
          </div>
        </Modal>
      )}

      {isBlogModalOpen && (
        <Modal title="Publish New Update" onClose={closeBlogModal}>
          <form className="space-y-4" onSubmit={handleCreatePost}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Slug</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  placeholder="my-update"
                  required
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Author</label>
                <input
                  value={form.author}
                  onChange={(e) => setForm((prev) => ({ ...prev, author: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  placeholder="VectoBeat Team"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Category</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Estimated Read Time</label>
              <div className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 text-sm text-foreground/80">
                {derivedReadTime}
              </div>
              <p className="text-xs text-foreground/60 mt-1">Calculated automatically from the current content.</p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Excerpt</label>
              <textarea
                value={form.excerpt}
                onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                rows={2}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Content (Markdown)</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                rows={6}
                required
              />
            </div>
            {actionMessage && <p className="text-xs text-primary">{actionMessage}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeBlogModal}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPost}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {savingPost ? "Publishing..." : "Publish Update"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isNewsletterModalOpen && (
        <Modal title="Create Newsletter Campaign" onClose={closeNewsletterModal}>
          <form className="space-y-4" onSubmit={handleCreateCampaign}>
            <div className="rounded-lg border border-border/50 bg-background/60 p-4">
              <p className="text-sm font-semibold mb-1">
                Delivering to {newsletterSubscribers.length.toLocaleString()} subscribers
              </p>
              {newsletterSubscribers.length ? (
                <div className="max-h-32 overflow-y-auto text-xs text-foreground/70 space-y-1">
                  {newsletterSubscribers.slice(0, 12).map((subscriber) => (
                    <p key={subscriber.email} className="flex items-center justify-between gap-2">
                      <span className="truncate">{subscriber.name || "Subscriber"}</span>
                      <span className="text-foreground/50 truncate">{subscriber.email}</span>
                    </p>
                  ))}
                  {newsletterSubscribers.length > 12 && (
                    <p className="text-foreground/50">
                      +{newsletterSubscribers.length - 12} additional subscriber
                      {newsletterSubscribers.length - 12 === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-foreground/60">No subscribers yet.</p>
              )}
            </div>
            <input
              type="text"
              placeholder="Subject"
              value={campaignForm.subject}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, subject: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
              required
            />
            <textarea
              placeholder="Campaign content that will be emailed to all subscribers."
              rows={6}
              value={campaignForm.body}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, body: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none resize-none"
              required
            />
            {campaignMessage && <p className="text-xs text-primary">{campaignMessage}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeNewsletterModal}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={campaignLoading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {campaignLoading ? "Sending..." : "Send Newsletter"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isTicketModalOpen && (
        <Modal title="Create Support Ticket" onClose={closeTicketModal}>
          <form className="space-y-4" onSubmit={handleCreateTicket}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Contact Name</label>
                <input
                  value={ticketDraft.name}
                  onChange={(e) => setTicketDraft((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Email</label>
                <input
                  type="email"
                  value={ticketDraft.email}
                  onChange={(e) => setTicketDraft((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                  required
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">Category</label>
                <select
                  value={ticketDraft.category}
                  onChange={(e) => setTicketDraft((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                >
                  <option value="General">General</option>
                  <option value="Billing">Billing</option>
                  <option value="Incident">Incident</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">Priority</label>
                <select
                  value={ticketDraft.priority}
                  onChange={(e) => setTicketDraft((prev) => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Subject</label>
              <input
                value={ticketDraft.subject}
                onChange={(e) => setTicketDraft((prev) => ({ ...prev, subject: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                placeholder="Describe the issue"
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Message</label>
              <textarea
                value={ticketDraft.message}
                onChange={(e) => setTicketDraft((prev) => ({ ...prev, message: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none"
                rows={5}
                required
              />
            </div>
            {ticketModalMessage && <p className="text-xs text-primary">{ticketModalMessage}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeTicketModal}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={ticketSubmitting}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {ticketSubmitting ? "Creating..." : "Create Ticket"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

const AdminPageStyles = () => (
  <style jsx>{`
    .muted-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(99, 102, 241, 0.55) rgba(0, 0, 0, 0);
    }
    .muted-scroll::-webkit-scrollbar {
      height: 8px;
      width: 8px;
    }
    .muted-scroll::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0);
    }
    .muted-scroll::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(99, 102, 241, 0.6), rgba(56, 189, 248, 0.55));
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .muted-scroll::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, rgba(99, 102, 241, 0.75), rgba(56, 189, 248, 0.7));
    }
  `}</style>
)
