import { NextRequest, NextResponse } from "next/server"
import { authorizeRequest, expandSecrets } from "@/lib/api-auth"
import {
  listGuildServerSettings,
  listActiveSubscriptionTiers,
  recordBotActivityEvent,
} from "@/lib/db"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { evaluateEntitlementDrift } from "@/lib/entitlement-drift"

const AUDIT_SECRETS = expandSecrets(
  process.env.ENTITLEMENT_AUDIT_SECRET,
  process.env.STATUS_API_PUSH_SECRET,
  process.env.SERVER_SETTINGS_API_KEY,
)

export async function POST(request: NextRequest) {
  if (!authorizeRequest(request, AUDIT_SECRETS)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const [serverSettings, subscriptionMap] = await Promise.all([
    listGuildServerSettings(),
    listActiveSubscriptionTiers(),
  ])

  const settingsMap = new Map(serverSettings.map((record) => [record.guildId, record]))
  const driftSummaries: Array<{
    guildId: string
    tier: string
    findings: ReturnType<typeof evaluateEntitlementDrift>
  }> = []
  const missingSettings: Array<{ guildId: string; tier: string }> = []
  const activityWrites: Promise<void>[] = []

  for (const record of serverSettings) {
    const tier = subscriptionMap.get(record.guildId) ?? "free"
    const plan = getPlanCapabilities(tier)
    const findings = evaluateEntitlementDrift({
      guildId: record.guildId,
      tier,
      plan,
      settings: record.settings,
    })
    if (findings.length) {
      driftSummaries.push({ guildId: record.guildId, tier, findings })
      findings.forEach((finding) => {
        activityWrites.push(
          recordBotActivityEvent({
            type: "entitlement_drift",
            name: finding.field,
            guildId: record.guildId,
            success: false,
            metadata: {
              severity: finding.severity,
              expected: finding.expected,
              actual: finding.actual,
              tier,
              updatedAt: record.updatedAt,
              message: finding.message,
            },
          }),
        )
      })
    }
  }

  for (const [guildId, tier] of subscriptionMap.entries()) {
    if (!settingsMap.has(guildId)) {
      missingSettings.push({ guildId, tier })
      activityWrites.push(
        recordBotActivityEvent({
          type: "entitlement_drift",
          name: "missing_server_settings",
          guildId,
          success: false,
          metadata: {
            severity: "underutilized",
            expected: "server_settings_record",
            actual: "missing",
            tier,
            message: "Subscription active but no server settings stored",
          },
        }),
      )
    }
  }

  await Promise.all(activityWrites)

  return NextResponse.json({
    ok: true,
    auditedGuilds: serverSettings.length,
    driftGuilds: driftSummaries.length,
    missingGuilds: missingSettings.length,
    drift: driftSummaries,
    missingSettings,
  })
}
