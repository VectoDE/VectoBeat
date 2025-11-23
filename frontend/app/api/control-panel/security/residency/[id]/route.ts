"use server"

import { NextResponse, type NextRequest } from "next/server"
import { createHmac } from "crypto"
import type { MembershipTier } from "@/lib/memberships"
import { getPlanCapabilities } from "@/lib/plan-capabilities"
import { DATA_RESIDENCY_PROOFS } from "@/lib/data-residency"
import { verifyControlPanelGuildAccess } from "@/lib/control-panel-auth"

const ensureSecurityAccess = (tier: MembershipTier) => getPlanCapabilities(tier).serverSettings.exportWebhooks

const buildSignature = (payload: string) => {
  const secret =
    process.env.DATA_ATTESTATION_SIGNING_SECRET ||
    process.env.ATTESTATION_SIGNING_SECRET ||
    "vectobeat-attestation-fallback"
  return createHmac("sha256", secret).update(payload).digest("hex")
}

export async function GET(
  request: NextRequest,
  context: {
    params: { id: string }
  },
) {
  const guildId = request.nextUrl.searchParams.get("guildId")?.trim()
  const discordId = request.nextUrl.searchParams.get("discordId")?.trim()
  if (!guildId || !discordId) {
    return NextResponse.json({ error: "guild_and_discord_required" }, { status: 400 })
  }

  const access = await verifyControlPanelGuildAccess(request, discordId, guildId)
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status })
  }

  if (!ensureSecurityAccess(access.tier)) {
    return NextResponse.json({ error: "plan_required" }, { status: 403 })
  }

  const proof = DATA_RESIDENCY_PROOFS.find((entry) => entry.id === context.params.id)
  if (!proof) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const attestation = {
    proofId: proof.id,
    guildId,
    issuedAt: new Date().toISOString(),
    region: proof.region,
    provider: proof.provider,
    dataCenters: proof.dataCenters,
    replication: proof.replication,
    controls: proof.controls,
    lastAudit: proof.lastAudit,
    statement: proof.statement,
    signer: {
      name: "Mara Weiss",
      title: "Chief Trust & Security Officer",
      organization: "VectoBeat",
    },
  }
  const payload = JSON.stringify(attestation, null, 2)
  const signedPayload = JSON.stringify(
    {
      ...attestation,
      signature: buildSignature(payload),
      hashAlg: "HMAC-SHA256",
    },
    null,
    2,
  )

  const headers = new Headers()
  headers.set("Content-Type", "application/json; charset=utf-8")
  headers.set("Content-Disposition", `attachment; filename="attestation-${proof.id}.json"`)
  return new NextResponse(signedPayload, { status: 200, headers })
}
