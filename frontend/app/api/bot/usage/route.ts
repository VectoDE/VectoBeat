import { NextRequest, NextResponse } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { getApiKeySecrets } from "@/lib/api-keys"
import { getBotUsageTotals, upsertBotUsageTotals } from "@/lib/db"

const SECRET_TYPES = ["status_api", "status_events", "control_panel"]

const parseOptionalNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) {
    return null
  }
  return number < 0 ? 0 : Math.trunc(number)
}

export async function GET() {
  const totals = await getBotUsageTotals()
  return NextResponse.json({ totals })
}

export async function POST(request: NextRequest) {
  const secrets = await getApiKeySecrets(SECRET_TYPES, { includeEnv: false })
  if (!authorizeRequest(request, secrets, { allowLocalhost: true })) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  const totals = await upsertBotUsageTotals({
    totalStreams: parseOptionalNumber((payload as Record<string, unknown>).totalStreams),
    commandsTotal: parseOptionalNumber((payload as Record<string, unknown>).commandsTotal),
    incidentsTotal: parseOptionalNumber((payload as Record<string, unknown>).incidentsTotal),
  })

  return NextResponse.json({ ok: true, totals })
}
