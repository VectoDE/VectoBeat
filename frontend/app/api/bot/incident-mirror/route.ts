import { NextResponse, type NextRequest } from "next/server"
import { authorizeRequest } from "@/lib/api-auth"
import { getApiKeySecrets } from "@/lib/api-keys"
import { getLatestIncidentMirror } from "@/lib/db"

const AUTH_TOKEN_TYPES = ["server_settings", "control_panel", "status_events"]

const isAuthorized = async (request: NextRequest) => {
  const secrets = await getApiKeySecrets(AUTH_TOKEN_TYPES, { includeEnv: false })
  return authorizeRequest(request, secrets, { allowLocalhost: true })
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const guildId = request.nextUrl.searchParams.get("guildId")
  const label = request.nextUrl.searchParams.get("label") || "staging"
  if (!guildId) {
    return NextResponse.json({ error: "guildId required" }, { status: 400 })
  }

  const mirror = await getLatestIncidentMirror(guildId, label.toLowerCase())
  if (!mirror) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  return NextResponse.json({ mirror })
}
