import type { MembershipTier } from "./memberships"

export type ServerApiToken = {
  id: string
  label: string
  hash: string
  lastFour: string
  createdAt: string
  rotatedAt?: string | null
  lastUsedAt?: string | null
  scopes: string[]
  createdBy?: string | null
  status: "active" | "disabled"
  expiresAt?: string | null
  leakDetected?: boolean
}

export const TIER_SEQUENCE: MembershipTier[] = ["free", "starter", "pro", "growth", "scale", "enterprise"]

export type ServerFeatureSettings = {
  multiSourceStreaming: boolean
  sourceAccessLevel: "core" | "extended" | "unlimited"
  playbackQuality: "standard" | "hires"
  autoCrossfade: boolean
  lavalinkRegion: string
  queueLimit: number
  collaborativeQueue: boolean
  playlistSync: boolean
  analyticsMode: "basic" | "advanced" | "predictive"
  aiRecommendations: boolean
  exportWebhooks: boolean
  webhookEndpoint: string
  webhookSecret: string
  automationLevel: "off" | "smart" | "full"
  automationWindow: string
  webhookEvents: string[]
  moderatorAlerts: boolean
  incidentEscalation: boolean
  priorityCare: boolean
  whiteLabelBranding: boolean
  compliancePack: boolean
  customPrefix: string
  brandingAccentColor: string
  apiTokens: ServerApiToken[]
  customDomain: string
  customDomainStatus: "unconfigured" | "pending_dns" | "pending_tls" | "verified" | "failed"
  customDomainDnsRecord: string
  customDomainVerifiedAt: string | null
  customDomainTlsStatus: "pending" | "active" | "failed"
  assetPackUrl: string
  mailFromAddress: string
  apiTokenTtlDays: number
  embedAccentColor: string
  embedLogoUrl: string
  embedCtaLabel: string
  embedCtaUrl: string
}

export const defaultServerFeatureSettings: ServerFeatureSettings = {
  multiSourceStreaming: false,
  sourceAccessLevel: "core",
  playbackQuality: "standard",
  autoCrossfade: false,
  lavalinkRegion: "auto",
  queueLimit: 100,
  collaborativeQueue: true,
  playlistSync: false,
  analyticsMode: "basic",
  aiRecommendations: false,
  exportWebhooks: false,
  webhookEndpoint: "",
  webhookSecret: "",
  automationLevel: "off",
  automationWindow: "",
  webhookEvents: [],
  moderatorAlerts: true,
  incidentEscalation: false,
  priorityCare: false,
  whiteLabelBranding: false,
  compliancePack: false,
  customPrefix: "!",
  brandingAccentColor: "#FF4D6D",
  apiTokens: [],
  customDomain: "",
  customDomainStatus: "unconfigured",
  customDomainDnsRecord: "",
  customDomainVerifiedAt: null,
  customDomainTlsStatus: "pending",
  assetPackUrl: "",
  mailFromAddress: "",
  apiTokenTtlDays: 0,
  embedAccentColor: "",
  embedLogoUrl: "",
  embedCtaLabel: "",
  embedCtaUrl: "",
}

type OptionType = "boolean" | "select" | "range" | "multiselect" | "text" | "color"

export interface ServerFeatureOption {
  key: keyof ServerFeatureSettings
  label: string
  description: string
  type: OptionType
  minTier?: MembershipTier
  choices?: Array<{
    value: string
    label: string
    minTier?: MembershipTier
  }>
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: string[]
  placeholder?: string
  maxLength?: number
}

export interface ServerFeatureGroup {
  id: string
  title: string
  description: string
  options: ServerFeatureOption[]
}

export const SERVER_FEATURE_GROUPS: ServerFeatureGroup[] = [
  {
    id: "streaming",
    title: "Streaming & Playback",
    description: "Control audio sources, latency and presentation for this server.",
    options: [
      {
        key: "multiSourceStreaming",
        label: "Multi-source streaming",
        description: "Enable Spotify, YouTube, SoundCloud, Bandcamp and more as playback sources.",
        type: "boolean",
        minTier: "starter",
      },
      {
        key: "sourceAccessLevel",
        label: "Music sources",
        description: "Choose how many native catalogs are unlocked for this server.",
        type: "select",
        choices: [
          { value: "core", label: "Core pack (5 sources)" },
          { value: "extended", label: "Extended pack (15 sources)", minTier: "starter" },
          { value: "unlimited", label: "Unlimited catalog", minTier: "pro" },
        ],
      },
      {
        key: "playbackQuality",
        label: "Playback quality",
        description: "Choose the maximum bitrate available to listeners in this server.",
        type: "select",
        choices: [
          { value: "standard", label: "Standard (128 kbps)" },
          { value: "hires", label: "Hi-Res (320 kbps)", minTier: "pro" },
        ],
        minTier: "free",
      },
      {
        key: "autoCrossfade",
        label: "Auto crossfade",
        description: "Blend the last and next track to remove silences between songs.",
        type: "boolean",
        minTier: "pro",
      },
      {
        key: "lavalinkRegion",
        label: "Preferred Lavalink region",
        description: "Scale plans can pin playback to a dedicated regional cluster.",
        type: "select",
        minTier: "scale",
        choices: [
          { value: "auto", label: "Auto (closest node)" },
          { value: "us", label: "United States" },
          { value: "eu", label: "Europe" },
          { value: "apac", label: "APAC" },
        ],
      },
    ],
  },
  {
    id: "queue",
    title: "Queue & Collaboration",
    description: "Manage how your community collaborates on playlists and queue limits.",
    options: [
      {
        key: "queueLimit",
        label: "Queue size limit",
        description: "Maximum number of tracks that can be queued at once.",
        type: "range",
        min: 50,
        max: 50000,
        step: 50,
        unit: "tracks",
      },
      {
        key: "collaborativeQueue",
        label: "Collaborative queue",
        description: "Allow everyone with voice access to contribute songs without DJ permissions.",
        type: "boolean",
      },
      {
        key: "playlistSync",
        label: "Playlist sync",
        description: "Automatically sync community playlists with external services.",
        type: "boolean",
        minTier: "starter",
      },
    ],
  },
  {
    id: "branding",
    title: "Branding & Identity",
    description: "Customize how VectoBeat commands and embeds appear in your community.",
    options: [
      {
        key: "customPrefix",
        label: "Command prefix",
        description: "Set a fallback prefix for text commands when slash commands are disabled.",
        type: "text",
        minTier: "starter",
        placeholder: "!",
        maxLength: 5,
      },
      {
        key: "brandingAccentColor",
        label: "Accent color",
        description: "Pick the embed highlight color used for announcements and status messages.",
        type: "color",
        minTier: "starter",
      },
      {
        key: "whiteLabelBranding",
        label: "White-label branding",
        description: "Remove VectoBeat references from embeds and slash responses.",
        type: "boolean",
        minTier: "scale",
      },
    ],
  },
  {
    id: "analytics",
    title: "Analytics & Intelligence",
    description: "Decide how much telemetry and automation you want to run for this guild.",
    options: [
      {
        key: "analyticsMode",
        label: "Analytics depth",
        description: "Control how deeply we analyze your listening data.",
        type: "select",
        choices: [
          { value: "basic", label: "Basic insights" },
          { value: "advanced", label: "Advanced dashboards", minTier: "starter" },
          { value: "predictive", label: "Predictive & cohort trends", minTier: "growth" },
        ],
      },
      {
        key: "aiRecommendations",
        label: "AI recommendations",
        description: "Unlock AI-powered track & playlist recommendations based on history.",
        type: "boolean",
        minTier: "pro",
      },
      {
        key: "exportWebhooks",
        label: "Analytics webhooks",
        description: "Send listening sessions and key metrics to your own data warehouse.",
        type: "boolean",
        minTier: "pro",
      },
      {
        key: "webhookEndpoint",
        label: "Webhook endpoint",
        description: "HTTPS endpoint to receive telemetry (queue, billing, safety).",
        type: "text",
        minTier: "pro",
        maxLength: 500,
        placeholder: "https://example.com/vectobeat/webhooks",
      },
      {
        key: "webhookSecret",
        label: "Webhook secret",
        description: "Optional HMAC signing secret for validating payloads.",
        type: "text",
        minTier: "pro",
        maxLength: 120,
        placeholder: "optional-secret",
      },
    ],
  },
  {
    id: "automation",
    title: "Automation & Integrations",
    description: "Configure automation flows, alerts and integrations for moderators.",
    options: [
      {
        key: "automationLevel",
        label: "Automation level",
        description: "Choose how aggressively automation should manage the bot.",
        type: "select",
        choices: [
          { value: "off", label: "Manual control" },
          { value: "smart", label: "Smart triggers", minTier: "pro" },
          { value: "full", label: "Full orchestration", minTier: "growth" },
        ],
      },
      {
        key: "automationWindow",
        label: "Automation window (UTC)",
        description: "Restrict when automation plays queue guardian roles. Format HH:MM-HH:MM.",
        type: "text",
        minTier: "scale",
        placeholder: "00:00-06:00",
        maxLength: 11,
      },
      {
        key: "webhookEvents",
        label: "Webhook events",
        description: "Select which bot events should emit webhook payloads.",
        type: "multiselect",
        options: ["track_start", "queue_idle", "dj_override", "incident_created", "billing_usage"],
        minTier: "growth",
      },
    ],
  },
  {
    id: "security",
    title: "Security & Support",
    description: "Control escalation, moderator alerts, and compliance add-ons for this server.",
    options: [
      {
        key: "moderatorAlerts",
        label: "Moderator alerts",
        description: "Send DM alerts to moderators when the bot detects playback issues.",
        type: "boolean",
      },
      {
        key: "incidentEscalation",
        label: "Incident escalation",
        description: "Automatically open an incident with on-call staff when regional uptime drops.",
        type: "boolean",
        minTier: "scale",
      },
      {
        key: "priorityCare",
        label: "Priority Care (<4h 24/7)",
        description: "Escalate outages directly to the on-call engineer crew with under 4h responses.",
        type: "boolean",
        minTier: "pro",
      },
      {
        key: "compliancePack",
        label: "Compliance pack",
        description: "Enable enhanced logging, audit exports, and data residency controls.",
        type: "boolean",
        minTier: "enterprise",
      },
    ],
  },
]
