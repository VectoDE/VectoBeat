"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { buildDiscordLoginUrl } from "@/lib/config"
import type { TicketDetail, TicketMessage } from "@/lib/types/support"

type Ticket = {
  id: string
  subject: string | null
  status: string
  message: string
  response: string | null
  createdAt: string
  updatedAt: string
}

type AttachmentPreview = {
  id: string
  name: string
  size: number
  type: string
  url: string
  status: "scanning" | "ready" | "blocked"
  error?: string
  textContent?: string | null
  warnings?: string[]
}

const CATEGORY_OPTIONS = ["General", "Billing", "Incident", "Feature Request"]
const PRIORITY_OPTIONS = ["normal", "high", "urgent"]
const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
]
const USER_STATUS_OPTIONS = STATUS_OPTIONS.filter((option) => option.value !== "archived")
const USER_STATUS_VALUES = new Set(USER_STATUS_OPTIONS.map((option) => option.value))

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "open":
      return "bg-amber-500/20 text-amber-300"
    case "resolved":
      return "bg-emerald-500/20 text-emerald-300"
    case "closed":
      return "bg-rose-500/20 text-rose-300"
    case "archived":
      return "bg-foreground/10 text-foreground/60"
    default:
      return "bg-primary/20 text-primary"
  }
}

const formatDate = (value?: string | null) => {
  if (!value) return "Unknown"
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

const formatFileSize = (size?: number) => {
  if (!size || Number.isNaN(size)) return ""
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const getAuthToken = () => (typeof window === "undefined" ? "" : localStorage.getItem("discord_token") ?? "")
const TIER_ORDER = ["free", "starter", "pro", "growth", "scale", "enterprise"]
const highestTier = (tiers: string[]) => {
  let best = "free"
  tiers.forEach((tier) => {
    const idx = TIER_ORDER.indexOf(tier.toLowerCase())
    if (idx > TIER_ORDER.indexOf(best)) {
      best = tier.toLowerCase()
    }
  })
  return best
}

const isImageType = (type?: string) => (type ? type.startsWith("image/") : false)
const isVideoType = (type?: string) => (type ? type.startsWith("video/") : false)
const isAudioType = (type?: string) => (type ? type.startsWith("audio/") : false)
const isPdfType = (type?: string) => type === "application/pdf"
const isTextType = (type?: string) =>
  type ? type.startsWith("text/") || ["application/json", "application/xml"].includes(type) : false
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

const buildDataUrl = (type: string | undefined, content: string) =>
  `data:${type || "application/octet-stream"};base64,${content}`

const decodeTextFromBase64 = (content?: string) => {
  if (!content || typeof window === "undefined") return ""
  try {
    const binary = window.atob(content)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ""
  }
}

type ScanResult = {
  allowed: boolean
  severity: "clean" | "warning" | "blocked"
  reason?: string
  warnings?: string[]
  mime: string
  extension: string
  sha256: string
  textPreview?: string | null
}

const performAttachmentScan = async (file: File): Promise<ScanResult> => {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { allowed: false, severity: "blocked", reason: "File exceeds 15MB limit.", mime: file.type, extension: "", sha256: "" }
  }
  const data = new FormData()
  data.set("file", file)
  data.set("name", file.name)
  const response = await fetch("/api/security/scan", {
    method: "POST",
    body: data,
  })
  const payload: ScanResult = await response.json().catch(() => ({
    allowed: false,
    severity: "blocked",
    reason: "Security scan failed.",
    mime: file.type || "application/octet-stream",
    extension: "",
    warnings: [],
    sha256: "",
  }))
  if (!response.ok) {
    return { ...payload, allowed: false, severity: payload.severity ?? "blocked" }
  }
  return payload
}

type SubscriptionSummary = {
  tier: string
  status?: string
}

type TicketConversationEntry = TicketMessage & {
  subscription?: string | null
  subscriptionTier?: string | null
  tier?: string | null
  plan?: string | null
}

export function SupportDeskPanel() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [category, setCategory] = useState("")
  const [priority, setPriority] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [acceptedPolicies, setAcceptedPolicies] = useState(false)

  const [ticketEmail, setTicketEmail] = useState("")
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketError, setTicketError] = useState<string | null>(null)
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({})

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [thread, setThread] = useState<TicketDetail | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [replyMessage, setReplyMessage] = useState("")
  const [replyAttachments, setReplyAttachments] = useState<Array<{ id: string; file: File }>>([])
  const [attachmentPreviews, setAttachmentPreviews] = useState<AttachmentPreview[]>([])
  const [replying, setReplying] = useState(false)
  const [replyStatus, setReplyStatus] = useState("open")
  const [attachmentInputKey, setAttachmentInputKey] = useState(0)
  const attachmentPreviewRef = useRef<AttachmentPreview[]>([])

  const [hydrated, setHydrated] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [sessionInfo, setSessionInfo] = useState<{ name: string; email: string | null; discordId: string } | null>(null)
  const [highestSubscription, setHighestSubscription] = useState("free")
  const [toolkitMacros, setToolkitMacros] = useState<Array<{ id: string; label: string; body: string }>>([])
  const [selectedMacroId, setSelectedMacroId] = useState("")
  const [toolkitStage, setToolkitStage] = useState<"alpha" | "beta" | null>(null)
  const [toolkitBadges, setToolkitBadges] = useState<Array<{ id: string; label: string; description?: string }>>([])

  const selectedTicket = useMemo(
    () => (selectedTicketId ? tickets.find((ticket) => ticket.id === selectedTicketId) ?? null : null),
    [selectedTicketId, tickets],
  )

  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    attachmentPreviewRef.current = attachmentPreviews
  }, [attachmentPreviews])

  useEffect(() => {
    return () => {
      attachmentPreviewRef.current.forEach((preview) => {
        URL.revokeObjectURL(preview.url)
      })
    }
  }, [])

  const fetchToolkit = useCallback(
    async (discordId: string) => {
      try {
        const response = await fetch(`/api/moderator/toolkit?discordId=${discordId}`, { credentials: "include" })
        if (!response.ok) return
        const payload = await response.json()
        setToolkitMacros(Array.isArray(payload?.macros) ? payload.macros : [])
        setToolkitStage(payload?.stage === "alpha" ? "alpha" : payload?.stage === "beta" ? "beta" : null)
        setToolkitBadges(Array.isArray(payload?.badges) ? payload.badges : [])
      } catch (error) {
        console.error("[VectoBeat] Moderator toolkit fetch failed:", error)
      }
    },
    [],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    setLoginUrl(buildDiscordLoginUrl(window.location.href))

    let cancelled = false
    const controller = new AbortController()
    const token = getAuthToken()
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    const verify = async () => {
      try {
        const response = await fetch("/api/verify-session", {
          headers,
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error("Unable to verify session")
        }
        const data = await response.json()
        if (data?.authenticated && !cancelled) {
          const resolvedName = data.displayName || data.username || "Community Member"
          const resolvedEmail = data.email || ""
          const tiers = Array.isArray(data.tiers) ? data.tiers : []
          const bestTier = tiers.length ? highestTier(tiers) : "free"
          setHighestSubscription(bestTier)
          if (["pro", "growth", "scale", "enterprise"].includes(bestTier) && data.discordId) {
            void fetchToolkit(data.discordId)
          }
          setSessionInfo({ name: resolvedName, email: data.email ?? null, discordId: data.discordId || data.id })
          setName(resolvedName)
          setEmail(resolvedEmail)
          setTicketEmail(resolvedEmail)
          setSessionError(data.email ? null : "Add a contact email so we can reach you about your ticket.")
        } else if (!cancelled) {
          setSessionInfo(null)
          setSessionError("Please log in with Discord to open support tickets.")
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[VectoBeat] Support desk session error:", err)
          setSessionInfo(null)
          setSessionError("Please log in with Discord to open support tickets.")
        }
      } finally {
        if (!cancelled) {
          setSessionChecked(true)
        }
      }
    }

    verify()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fetchToolkit])

  const canSubmit = useMemo(
    () => !!sessionInfo && !!email && !!message && !!category && !!priority && acceptedPolicies,
    [sessionInfo, email, message, category, priority, acceptedPolicies],
  )

  const loadTickets = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!sessionInfo) {
        setTicketError("Please log in to view your tickets.")
        return
      }
      if (!ticketEmail) {
        setTicketError("No email available. Please update your Discord account with a reachable email.")
        return
      }
      const silent = options?.silent ?? false
      setTicketError(null)
      if (!silent) {
        setTicketsLoading(true)
      }
      try {
        const params = new URLSearchParams({
          discordId: sessionInfo.discordId,
          email: ticketEmail,
        })
        const response = await fetch(`/api/support-tickets?${params.toString()}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load tickets")
        }
        setTickets(Array.isArray(payload?.tickets) ? payload.tickets : [])
      } catch (err) {
        setTicketError(err instanceof Error ? err.message : "Unable to load tickets")
      } finally {
        if (!silent) {
          setTicketsLoading(false)
        }
      }
    },
    [sessionInfo, ticketEmail],
  )

  const fetchThread = useCallback(
    async (ticketId: string) => {
      if (!sessionInfo) return
      setThreadLoading(true)
      setThreadError(null)
      try {
        const params = new URLSearchParams({ discordId: sessionInfo.discordId })
        const response = await fetch(`/api/support-tickets/${ticketId}?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
          credentials: "include",
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load ticket thread")
        }
        setThread(payload as TicketDetail)
        if (payload?.status) {
          setReplyStatus(USER_STATUS_VALUES.has(payload.status) ? payload.status : "open")
        }
      } catch (err) {
        setThread(null)
        setThreadError(err instanceof Error ? err.message : "Unable to load ticket thread")
      } finally {
        setThreadLoading(false)
      }
    },
    [sessionInfo],
  )

  useEffect(() => {
    if (sessionInfo && ticketEmail) {
      void loadTickets({ silent: true })
    }
  }, [loadTickets, sessionInfo, ticketEmail])

  useEffect(() => {
    if (!sessionInfo) return
    let cancelled = false
    const tierOrder = ["free", "starter", "pro", "growth", "scale", "enterprise"]
    const activeStatuses = new Set(["active", "trialing", "pending"])
    const resolveHighestTier = (subscriptions: SubscriptionSummary[]) => {
      let best = "free"
      for (const sub of subscriptions) {
        const normalizedTier = typeof sub.tier === "string" ? sub.tier.trim().toLowerCase() : "free"
        const statusOk = !sub.status || activeStatuses.has((sub.status || "").trim().toLowerCase())
        if (!statusOk) continue
        const currentIdx = tierOrder.indexOf(best)
        const nextIdx = tierOrder.indexOf(normalizedTier)
        if (nextIdx !== -1 && nextIdx > currentIdx) {
          best = normalizedTier
        }
      }
      return best || "free"
    }

    const fetchSubscriptions = async () => {
      try {
        const headers: Record<string, string> = {}
        const token = getAuthToken()
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
        const response = await fetch(`/api/subscriptions?userId=${sessionInfo.discordId}`, {
          cache: "no-store",
          credentials: "include",
          headers,
        })
        if (!response.ok) return
        const payload = await response.json().catch(() => null)
        const subs: SubscriptionSummary[] = Array.isArray(payload?.subscriptions) ? payload.subscriptions : []
        const best = resolveHighestTier(subs)
        if (!cancelled) {
          setHighestSubscription(best)
        }
      } catch (err) {
        console.error("[VectoBeat] Failed to resolve subscriptions for support desk:", err)
      }
    }

    void fetchSubscriptions()
    return () => {
      cancelled = true
    }
  }, [sessionInfo])

  useEffect(() => {
    if (!tickets.length) {
      setSelectedTicketId(null)
      setThread(null)
      return
    }
    setSelectedTicketId((current) => {
      if (current && tickets.some((ticket) => ticket.id === current)) {
        return current
      }
      return null
    })
  }, [tickets])

  useEffect(() => {
    if (selectedTicketId && sessionInfo) {
      void fetchThread(selectedTicketId)
    } else {
      setThread(null)
    }
  }, [selectedTicketId, sessionInfo, fetchThread])

  useEffect(() => {
    const statusSource = thread?.status || selectedTicket?.status
    if (!statusSource) return
    const normalized = USER_STATUS_VALUES.has(statusSource) ? statusSource : "open"
    setReplyStatus((current) => (current === normalized ? current : normalized))
  }, [selectedTicket?.status, thread?.status])

  const trimmedReplyMessage = replyMessage.trim()
  const currentTicketStatus = useMemo(() => {
    const source = thread?.status || selectedTicket?.status || "open"
    return USER_STATUS_VALUES.has(source) ? source : "open"
  }, [selectedTicket?.status, thread?.status])
  const scanInProgress = attachmentPreviews.some((preview) => preview.status === "scanning")
  const hasBlockedAttachment = attachmentPreviews.some((preview) => preview.status === "blocked")
  const hasReadyAttachments = replyAttachments.length > 0
  const statusChanged = replyStatus !== currentTicketStatus
  const hasMessage = trimmedReplyMessage.length > 0

  const canReply =
    !!selectedTicket && !replying && !scanInProgress && !hasBlockedAttachment && (hasMessage || hasReadyAttachments || statusChanged)

  const applyMacro = useCallback(() => {
    const macro = toolkitMacros.find((entry) => entry.id === selectedMacroId)
    if (!macro) return
    setReplyMessage((prev) => {
      if (!prev.trim()) return macro.body
      return `${prev}\n\n${macro.body}`
    })
  }, [selectedMacroId, toolkitMacros])

  const handleAttachmentChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return

    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const url = URL.createObjectURL(file)
      setAttachmentPreviews((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          size: file.size,
          type: file.type,
          url,
          status: "scanning",
          textContent: null,
          warnings: [],
        },
      ])

      try {
        const scanResult = await performAttachmentScan(file)
        if (scanResult.allowed) {
          setAttachmentPreviews((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: "ready",
                    error: undefined,
                    type: scanResult.mime,
                    textContent: scanResult.textPreview ?? (isTextType(scanResult.mime) ? (item.textContent ?? null) : null),
                    warnings: scanResult.warnings ?? [],
                  }
                : item,
            ),
          )
          setReplyAttachments((prev) => [...prev, { id, file }])
        } else {
          setAttachmentPreviews((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, status: "blocked", error: scanResult.reason, warnings: scanResult.warnings ?? [] } : item,
            ),
          )
        }
      } catch (scanError) {
        setAttachmentPreviews((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "blocked",
                  error: scanError instanceof Error ? scanError.message : "Attachment scan failed.",
                  warnings: [],
                }
              : item,
          ),
        )
      }
    }

    setAttachmentInputKey((value) => value + 1)
  }, [])

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachmentPreviews((prev) => {
      const found = prev.find((item) => item.id === id)
      if (found) {
        URL.revokeObjectURL(found.url)
      }
      return prev.filter((item) => item.id !== id)
    })
    setReplyAttachments((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit || submitting || !sessionInfo) return
    setSubmitting(true)
    setFeedback(null)
    setError(null)
    try {
      const response = await fetch("/api/support-tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ name, email, subject, category, priority, message, discordId: sessionInfo.discordId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to submit ticket")
      }
      setFeedback("Thank you! Your ticket has been received. We'll respond via email.")
      setMessage("")
      setSubject("")
      if (!ticketEmail && email) {
        setTicketEmail(email)
      }
      await loadTickets({ silent: true })
      setTimeout(() => setFeedback(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReplySubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedTicket || !sessionInfo || scanInProgress || hasBlockedAttachment) return
    if (!hasMessage && !hasReadyAttachments && !statusChanged) return
    setReplying(true)
    setThreadError(null)
    try {
      const params = new URLSearchParams({ discordId: sessionInfo.discordId })
      const formData = new FormData()
      formData.set("message", trimmedReplyMessage)
      formData.set("authorName", sessionInfo.name)
      const normalizedStatus = USER_STATUS_VALUES.has(replyStatus) ? replyStatus : "open"
      formData.set("status", normalizedStatus)
      replyAttachments.forEach(({ file }, index) => {
        formData.append(`attachment_${index}`, file)
      })

      const response = await fetch(`/api/support-tickets/${selectedTicket.id}?${params.toString()}`, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to send reply")
      }
      setReplyMessage("")
      setReplyAttachments([])
      setAttachmentPreviews((prev) => {
        prev.forEach((preview) => URL.revokeObjectURL(preview.url))
        return []
      })
      setAttachmentInputKey((value) => value + 1)
      await fetchThread(selectedTicket.id)
      await loadTickets({ silent: true })
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : "Unable to send reply")
    } finally {
      setReplying(false)
    }
  }

  const formatRoleLabel = (role?: string | null) => {
    if (!role) return "Support"
    const normalized = role.trim().toLowerCase()
    if (normalized === "admin") return "Admin"
    if (normalized === "operator") return "Operator"
    if (normalized === "member" || normalized === "user") return "Customer"
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }

  const conversation: TicketConversationEntry[] = useMemo(() => {
    if (!thread) return []
    const initial: TicketConversationEntry = {
      id: `${thread.id}-origin`,
      ticketId: thread.id,
      authorId: null,
      authorName: thread.name || "You",
      role: "member",
      body: thread.message,
      attachments: [],
      createdAt: thread.createdAt,
      subscriptionTier: highestSubscription,
    }
    return [initial, ...(thread.messages ?? []).map((msg) => ({ ...msg, subscriptionTier: msg.role === "member" ? highestSubscription : msg.subscriptionTier }))]
  }, [highestSubscription, thread])

  if (!hydrated || !sessionChecked) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/30 p-8 text-center text-foreground/70">
        Loading support desk...
      </div>
    )
  }

  if (!sessionInfo) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 text-center text-foreground/70 space-y-4">
        <p className="text-lg font-semibold">Please log in with Discord to access the Support Desk.</p>
        <p className="text-sm text-foreground/60">
          Tickets are tied to your Discord identity so our team can verify ownership and keep your data secure.
        </p>
        <div className="flex justify-center">
          <a
            href={loginUrl ?? "/api/auth/discord/login"}
            className="inline-flex items-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            Log in with Discord
          </a>
        </div>
        {sessionError && <p className="text-sm text-destructive">{sessionError}</p>}
      </div>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Submit a Ticket</h2>
          <p className="text-sm text-foreground/60">
            Standard Care replies within 24 hours. Priority Care for Pro, Growth, Scale, and Enterprise is monitored 24/7 with a 4-hour SLA.
          </p>
        </div>
        <div className="grid gap-4">
          {sessionError && (
            <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">{sessionError}</p>
          )}
          <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-3 text-sm text-left space-y-1">
            <p className="text-foreground/60">Signed in as</p>
            <p className="font-semibold text-foreground">{name}</p>
            {sessionInfo.email ? (
              <p className="text-foreground/70 text-xs">{sessionInfo.email}</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-foreground/60">Provide an email so we can follow up about your ticket.</p>
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-xs"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setTicketEmail(e.target.value)
                  }}
                  required
                />
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-foreground/80">
              <span>Reason</span>
              <select
                className="mt-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select a reason
                </option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-foreground/80">
              <span>Priority</span>
              <select
                className="mt-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select priority
                </option>
                {PRIORITY_OPTIONS.map((prio) => (
                  <option key={prio} value={prio}>
                    {prio.charAt(0).toUpperCase() + prio.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            type="text"
            placeholder="Ticket title (optional)"
            className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            placeholder="Describe your question or issue"
            className="w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 min-h-[150px]"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
          />
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm text-foreground/70">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border/60 bg-background text-primary focus:ring-primary/30"
            checked={acceptedPolicies}
            onChange={(event) => setAcceptedPolicies(event.target.checked)}
            required
          />
          <span>
            I agree to the{" "}
            <a href="/terms" className="text-primary underline-offset-2 hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-primary underline-offset-2 hover:underline">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="inline-flex items-center justify-center px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Create Ticket"}
        </button>
        {feedback && <p className="text-sm text-primary">{feedback}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Track Existing Tickets</h2>
          <p className="text-sm text-foreground/60">
            Select a ticket to review the full conversation, add attachments, and reply directly to our support team.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[260px,1fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-3 text-sm text-left">
              <p className="text-foreground/60">Tickets linked to</p>
              <p className="font-semibold text-foreground break-all">{ticketEmail || "No email available"}</p>
            </div>
            <button
              type="button"
              onClick={() => loadTickets()}
              className="w-full px-4 py-2 rounded-lg border border-primary/40 text-primary font-semibold hover:bg-primary/10 transition-colors"
            >
              {ticketsLoading ? "Loading..." : "Refresh tickets"}
            </button>
            {ticketError && <p className="text-sm text-destructive">{ticketError}</p>}
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ticketsLoading && !tickets.length && <p className="text-sm text-foreground/60">Loading tickets...</p>}
              {!ticketsLoading && !tickets.length && (
                <p className="text-sm text-foreground/60">No tickets found for this email yet.</p>
              )}
              {tickets.map((ticket) => {
                const isSelected = selectedTicketId === ticket.id
                const isExpanded = expandedTickets[ticket.id]
                return (
                  <div
                    key={ticket.id}
                    className={`rounded-lg border transition-colors ${
                      isSelected ? "border-primary/60 bg-primary/5" : "border-border/50 bg-background/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTickets((prev) => ({
                          ...prev,
                          [ticket.id]: !prev[ticket.id],
                        }))
                      }
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-foreground"
                    >
                      <span>{ticket.subject || "Support Ticket"}</span>
                      <span
                        className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="space-y-3 border-t border-border/40 px-4 py-3 text-xs text-foreground/70">
                        <div className="flex items-center justify-between text-foreground/60">
                          <span>{formatDate(ticket.updatedAt)}</span>
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${statusBadgeClass(ticket.status)}`}>
                            {ticket.status}
                          </span>
                        </div>
                        <p className="text-foreground/80 whitespace-pre-line text-sm">{ticket.message}</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTicketId(null)
                              } else {
                                setSelectedTicketId(ticket.id)
                                setExpandedTickets((prev) => ({ ...prev, [ticket.id]: true }))
                              }
                            }}
                            className="flex-1 rounded-md border border-primary/50 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                          >
                            {isSelected ? "Close thread view" : "Open thread view"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTickets((prev) => ({
                                ...prev,
                                [ticket.id]: false,
                              }))
                            }
                            className="rounded-md border border-border/60 px-3 py-2 text-xs text-foreground/60 hover:text-foreground/80"
                          >
                            Collapse
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/60 p-5 flex flex-col gap-4 min-h-[360px]">
            {!selectedTicket ? (
              <div className="flex flex-1 items-center justify-center text-center text-sm text-foreground/60">
                Select a ticket from the list to view the conversation.
              </div>
            ) : threadLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-foreground/60">Loading thread…</div>
            ) : threadError ? (
              <div className="flex flex-col gap-3 text-center text-sm text-destructive">
                <p>{threadError}</p>
                <button
                  type="button"
                  onClick={() => fetchThread(selectedTicket.id)}
                  className="mx-auto rounded-md border border-destructive/40 px-4 py-1 text-destructive hover:bg-destructive/10"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div className="border-b border-border/40 pb-4 space-y-2">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold">{selectedTicket.subject || "Support Ticket"}</p>
                      <p className="text-xs text-foreground/60">Opened {formatDate(selectedTicket.createdAt)}</p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusBadgeClass(replyStatus)}`}>
                      {replyStatus}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/60">
                    Last updated {formatDate(thread?.updatedAt ?? selectedTicket.updatedAt)}
                  </p>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto pr-1 max-h-[360px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {conversation.map((entry) => {
                    const isMember = entry.role === "member" || entry.role === "user"
                    const label = entry.authorName || (isMember ? "You" : "VectoBeat Support")
                    const attachments = Array.isArray(entry.attachments)
                      ? (entry.attachments as NonNullable<TicketMessage["attachments"]>)
                      : []
                    const alignmentClass = isMember ? "justify-end pr-2" : "justify-start pl-2"
                    const bubbleOffset = isMember ? "ml-16" : "mr-16"
                    const tierLabel =
                      (entry.subscriptionTier || entry.subscription || entry.plan || entry.tier || "").trim() || "free"
                    return (
                      <div
                        key={entry.id}
                        className={`flex ${alignmentClass}`}
                      >
                        <div
                          className={`w-full max-w-2xl rounded-2xl border px-4 py-3 space-y-2 ${
                            isMember
                              ? `border-border/40 bg-card/60 shadow-inner ${bubbleOffset}`
                              : `border-primary/40 bg-primary/10 ${bubbleOffset}`
                          }`}
                        >
                          <div
                        className={`flex items-center justify-between text-xs text-foreground/60 ${
                          isMember ? "pl-4" : "pr-4"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{label}</span>
                          {!isMember && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                              {formatRoleLabel(entry.role)}
                            </span>
                          )}
                          {isMember && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 capitalize">
                              {tierLabel || "free"} plan
                            </span>
                          )}
                        </div>
                        <span>{formatDate(entry.createdAt)}</span>
                      </div>
                          <p
                            className={`text-sm text-foreground/80 whitespace-pre-line ${
                              isMember ? "pl-4" : "pr-4"
                            }`}
                          >
                            {entry.body}
                          </p>
                          {!!attachments.length && (
                            <div className={`space-y-1 ${isMember ? "pl-4" : "pr-4"}`}>
                              <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">Attachments</p>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {attachments.map((file, index) => {
                                  const type = file.type || "application/octet-stream"
                                  const dataUrl = buildDataUrl(type, file.content)
                                  const image = isImageType(type)
                                  const video = isVideoType(type)
                                  const audio = isAudioType(type)
                                  const pdf = isPdfType(type)
                                  const text = isTextType(type)
                                  const textContent = text ? decodeTextFromBase64(file.content) : ""
                                  return (
                                    <div
                                      key={`${entry.id}-attachment-${index}`}
                                      className="space-y-2 rounded-lg border border-border/40 bg-background/60 p-3 text-xs text-foreground/70"
                                    >
                                      <div className="rounded-md border border-border/30 bg-card/40 p-2">
                                        {image ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={dataUrl} alt={file.name || "Attachment"} className="h-32 w-full rounded-md object-cover" />
                                        ) : video ? (
                                          <video controls src={dataUrl} className="h-32 w-full rounded-md bg-black/40" />
                                        ) : audio ? (
                                          <audio controls className="w-full">
                                            <source src={dataUrl} type={type} />
                                          </audio>
                                        ) : pdf ? (
                                          <iframe src={dataUrl} title={file.name || "PDF attachment"} className="h-32 w-full rounded-md bg-white" />
                                        ) : text ? (
                                          <pre className="h-32 overflow-auto rounded-md bg-card/80 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                                            {textContent || "Attachment content unavailable."}
                                          </pre>
                                        ) : (
                                          <p className="text-center text-[11px] text-foreground/50">
                                            Preview unavailable. Use the buttons below to open the file.
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] text-foreground/60">
                                        <span className="font-semibold text-foreground">{file.name || `Attachment ${index + 1}`}</span>
                                        {file.size ? <span>{formatFileSize(file.size)}</span> : null}
                                      </div>
                                      <div className="flex gap-2">
                                        <a
                                          href={dataUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="flex-1 rounded-md border border-border/60 px-2 py-1 text-center text-[11px] font-semibold text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors"
                                        >
                                          View
                                        </a>
                                        <a
                                          href={dataUrl}
                                          download={file.name || `attachment-${index + 1}`}
                                          className="rounded-md border border-border/60 px-2 py-1 text-[11px] font-semibold text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors"
                                        >
                                          Save
                                        </a>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {!conversation.length && (
                    <p className="text-sm text-foreground/60">No replies have been added to this ticket yet.</p>
                  )}
                </div>

                <form onSubmit={handleReplySubmit} className="border-t border-border/40 pt-4 space-y-3">
                  {toolkitMacros.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/40 p-3 text-xs text-foreground/70">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-foreground font-semibold">Moderator Toolkit</span>
                        {toolkitStage ? (
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              toolkitStage === "alpha"
                                ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                                : "bg-sky-500/15 text-sky-200 border border-sky-500/30"
                            }`}
                          >
                            {toolkitStage === "alpha" ? "Alpha" : "Beta"}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={selectedMacroId}
                          onChange={(e) => setSelectedMacroId(e.target.value)}
                          className="rounded-md border border-border/60 bg-background/80 px-3 py-1 text-xs text-foreground/80"
                        >
                          <option value="">Select a macro</option>
                          {toolkitMacros.map((macro) => (
                            <option key={macro.id} value={macro.id}>
                              {macro.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={applyMacro}
                          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                          disabled={!selectedMacroId}
                        >
                          Insert Macro
                        </button>
                      </div>
                      {toolkitBadges.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {toolkitBadges.map((badge) => (
                            <span
                              key={badge.id}
                              className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200 border border-emerald-500/30"
                              title={badge.description}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <textarea
                    value={replyMessage}
                    onChange={(event) => setReplyMessage(event.target.value)}
                    placeholder="Send an update or share additional details"
                    className="w-full rounded-lg border border-border/60 bg-card/30 px-3 py-2 text-sm min-h-[100px]"
                  />
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex flex-1 flex-wrap gap-3">
                      <label
                        htmlFor="ticket-attachments"
                        className="inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-1 text-xs font-semibold text-foreground/70 cursor-pointer hover:border-primary/60 hover:text-primary transition-colors"
                      >
                        Attach files
                      </label>
                      <input
                        key={attachmentInputKey}
                        id="ticket-attachments"
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleAttachmentChange}
                      />
                      <p className="text-[11px] text-foreground/50">
                        Attachments run through an automated malware scan before they reach support.
                      </p>
                      <select
                        value={replyStatus}
                        onChange={(event) => setReplyStatus(event.target.value)}
                        className="rounded-md border border-border/60 bg-background/80 px-3 py-1 text-xs font-semibold text-foreground/70 focus:border-primary/60"
                      >
                        {USER_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={!canReply}
                      className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {replying ? "Sending..." : "Send reply"}
                    </button>
                  </div>
                  {attachmentPreviews.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3">
                      {attachmentPreviews.map((preview) => {
                        const image = isImageType(preview.type)
                        const video = isVideoType(preview.type)
                        const audio = isAudioType(preview.type)
                        const pdf = isPdfType(preview.type)
                        const text = isTextType(preview.type)
                        const showContent = preview.status !== "blocked"
                        const statusLabel =
                          preview.status === "ready"
                            ? "Ready to send"
                            : preview.status === "blocked"
                              ? preview.error || "Blocked by scan"
                              : "Scanning for threats…"
                        const statusTone =
                          preview.status === "ready"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : preview.status === "blocked"
                              ? "bg-rose-500/15 text-rose-300"
                              : "bg-amber-500/15 text-amber-300"
                        return (
                          <div
                            key={preview.id}
                            className="space-y-3 rounded-lg border border-border/40 bg-background/60 p-3 text-xs text-foreground/70"
                          >
                            <div className="relative rounded-lg border border-border/30 bg-card/50 p-2">
                              {showContent ? (
                                image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={preview.url} alt={preview.name} className="h-40 w-full rounded-md object-cover" />
                                ) : video ? (
                                  <video controls src={preview.url} className="h-40 w-full rounded-md bg-black/30" />
                                ) : audio ? (
                                  <audio controls className="w-full">
                                    <source src={preview.url} type={preview.type} />
                                  </audio>
                                ) : pdf ? (
                                  <iframe src={preview.url} title={preview.name} className="h-40 w-full rounded-md bg-white" />
                                ) : text ? (
                                  <pre className="h-40 overflow-auto rounded-md bg-card/80 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                                    {preview.textContent || "Attachment content unavailable."}
                                  </pre>
                                ) : (
                                  <p className="text-center text-[11px] text-foreground/60">
                                    Preview unavailable. The file will still be delivered to support.
                                  </p>
                                )
                              ) : preview.status === "blocked" ? (
                                <p className="text-center text-[11px] text-destructive">
                                  {preview.error || "Blocked by security policy."}
                                </p>
                              ) : (
                                <p className="text-center text-[11px] text-foreground/60">Scanning attachment…</p>
                              )}
                              {preview.status === "scanning" && (
                                <div className="absolute inset-0 rounded-lg bg-background/70 backdrop-blur-sm flex items-center justify-center text-[11px] font-semibold text-foreground">
                                  Running security scan…
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">{preview.name}</p>
                                <p>{formatFileSize(preview.size)}</p>
                                <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>
                                  {statusLabel}
                                </span>
                                {preview.warnings && preview.warnings.length > 0 && (
                                  <ul className="list-disc space-y-1 pl-5 text-[11px] text-amber-300/80">
                                    {preview.warnings.map((warning, index) => (
                                      <li key={`${preview.id}-warning-${index}`}>{warning}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(preview.id)}
                                className="rounded-md border border-border/60 px-3 py-1 text-xs text-foreground/70 hover:border-destructive/50 hover:text-destructive"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {scanInProgress && (
                        <p className="text-[11px] text-foreground/50">Hold tight—attachments are finishing their security scan.</p>
                      )}
                      {hasBlockedAttachment && (
                        <p className="text-[11px] text-destructive">
                          Remove blocked files before sending your update.
                        </p>
                      )}
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
