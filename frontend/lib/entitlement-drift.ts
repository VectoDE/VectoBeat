import type { MembershipTier } from "./memberships"
import type { PlanCapabilities } from "./plan-capabilities"
import type { ServerFeatureSettings } from "./server-settings"

export type DriftSeverity = "exceeds" | "underutilized"

export type EntitlementDriftFinding = {
  guildId: string
  tier: MembershipTier
  field: string
  severity: DriftSeverity
  expected: string | number | boolean | null
  actual: string | number | boolean | null
  message: string
}

type EvaluateInput = {
  guildId: string
  tier: MembershipTier
  plan: PlanCapabilities
  settings: ServerFeatureSettings
}

const SOURCE_LEVEL_ORDER: ServerFeatureSettings["sourceAccessLevel"][] = ["core", "extended", "unlimited"]
const PLAYBACK_ORDER: ServerFeatureSettings["playbackQuality"][] = ["standard", "hires"]
const ANALYTICS_ORDER: ServerFeatureSettings["analyticsMode"][] = ["basic", "advanced", "predictive"]
const AUTOMATION_ORDER: ServerFeatureSettings["automationLevel"][] = ["off", "smart", "full"]

const compareOrdered = <T extends string>(
  results: EntitlementDriftFinding[],
  params: EvaluateInput,
  field: string,
  label: string,
  actual: T,
  allowed: T,
  order: readonly T[],
) => {
  const actualIndex = order.indexOf(actual)
  const allowedIndex = order.indexOf(allowed)
  if (actualIndex === -1 || allowedIndex === -1 || actualIndex === allowedIndex) {
    return
  }
  const severity: DriftSeverity = actualIndex > allowedIndex ? "exceeds" : "underutilized"
  results.push({
    guildId: params.guildId,
    tier: params.tier,
    field,
    severity,
    expected: allowed,
    actual,
    message:
      severity === "exceeds"
        ? `${label} exceeds entitlement (${actual} > ${allowed})`
        : `${label} below entitlement (${actual} < ${allowed})`,
  })
}

const compareBoolean = (
  results: EntitlementDriftFinding[],
  params: EvaluateInput,
  field: string,
  label: string,
  planValue: boolean,
  actual: boolean,
) => {
  if (planValue === actual) {
    return
  }
  const severity: DriftSeverity = actual && !planValue ? "exceeds" : "underutilized"
  results.push({
    guildId: params.guildId,
    tier: params.tier,
    field,
    severity,
    expected: planValue,
    actual,
    message:
      severity === "exceeds"
        ? `${label} enabled without entitlement`
        : `${label} disabled even though plan includes it`,
  })
}

export const evaluateEntitlementDrift = (params: EvaluateInput): EntitlementDriftFinding[] => {
  const { plan, settings } = params
  const findings: EntitlementDriftFinding[] = []

  compareBoolean(findings, params, "queue_sync", "Queue sync", plan.serverSettings.playlistSync, settings.playlistSync)
  compareBoolean(
    findings,
    params,
    "multi_source_streaming",
    "Multi-source streaming",
    plan.serverSettings.multiSourceStreaming,
    settings.multiSourceStreaming,
  )
  compareBoolean(
    findings,
    params,
    "ai_recommendations",
    "AI recommendations",
    plan.serverSettings.aiRecommendations,
    settings.aiRecommendations,
  )
  compareBoolean(
    findings,
    params,
    "analytics_exports",
    "Analytics exports",
    plan.serverSettings.exportWebhooks,
    settings.exportWebhooks,
  )

  compareOrdered(
    findings,
    params,
    "source_access",
    "Source access level",
    settings.sourceAccessLevel,
    plan.serverSettings.maxSourceAccessLevel,
    SOURCE_LEVEL_ORDER,
  )
  compareOrdered(
    findings,
    params,
    "playback_quality",
    "Playback quality",
    settings.playbackQuality,
    plan.serverSettings.maxPlaybackQuality,
    PLAYBACK_ORDER,
  )
  compareOrdered(
    findings,
    params,
    "analytics_mode",
    "Analytics depth",
    settings.analyticsMode,
    plan.serverSettings.maxAnalyticsMode,
    ANALYTICS_ORDER,
  )
  compareOrdered(
    findings,
    params,
    "automation_level",
    "Automation level",
    settings.automationLevel,
    plan.serverSettings.maxAutomationLevel,
    AUTOMATION_ORDER,
  )

  if (typeof plan.limits.queue === "number" && settings.queueLimit > plan.limits.queue) {
    findings.push({
      guildId: params.guildId,
      tier: params.tier,
      field: "queue_limit",
      severity: "exceeds",
      expected: plan.limits.queue,
      actual: settings.queueLimit,
      message: `Queue limit exceeds entitlement (${settings.queueLimit} > ${plan.limits.queue})`,
    })
  }

  const tokenCount = Array.isArray(settings.apiTokens) ? settings.apiTokens.length : 0
  if (!plan.features.apiTokens && tokenCount > 0) {
    findings.push({
      guildId: params.guildId,
      tier: params.tier,
      field: "api_tokens",
      severity: "exceeds",
      expected: 0,
      actual: tokenCount,
      message: "API tokens exist without an entitlement",
    })
  } else if (plan.features.apiTokens && tokenCount === 0) {
    findings.push({
      guildId: params.guildId,
      tier: params.tier,
      field: "api_tokens",
      severity: "underutilized",
      expected: ">=1",
      actual: 0,
      message: "Plan allows API tokens but none are provisioned",
    })
  }

  return findings
}
