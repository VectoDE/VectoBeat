import { createPublicKey, verify as verifySignature } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { buildDiscordLoginUrl } from "@/lib/config"

export const runtime = "nodejs"

const PUBLIC_KEY_PREFIX = Buffer.from("302a300506032b6570032100", "hex")
const PUBLIC_KEY_HEX =
  (process.env.DISCORD_INTERACTIONS_PUBLIC_KEY ||
    process.env.DISCORD_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_DISCORD_PUBLIC_KEY ||
    "").trim()
const PUBLIC_KEY_VALID = /^[a-fA-F0-9]{64}$/.test(PUBLIC_KEY_HEX)
const SITE_ORIGIN =
  (process.env.NEXT_PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")) ||
  "https://vectobeat.uplytech.de"

let cachedDiscordKey: ReturnType<typeof createPublicKey> | null = null

const getDiscordPublicKey = () => {
  if (!PUBLIC_KEY_VALID) return null
  if (cachedDiscordKey) return cachedDiscordKey
  try {
    cachedDiscordKey = createPublicKey({
      key: Buffer.concat([PUBLIC_KEY_PREFIX, Buffer.from(PUBLIC_KEY_HEX, "hex")]),
      format: "der",
      type: "spki",
    })
    return cachedDiscordKey
  } catch (error) {
    console.error("[VectoBeat] Failed to initialise Discord interactions public key:", error)
    return null
  }
}

const isRequestVerified = (body: string, signature: string | null, timestamp: string | null) => {
  const key = getDiscordPublicKey()
  if (!key || !signature || !timestamp) {
    return false
  }
  try {
    // Discord signs the raw request body with the Ed25519 public key. The timestamp is prepended.
    return verifySignature(
      "ed25519",
      Buffer.from(timestamp + body),
      key,
      Buffer.from(signature, "hex")
    )
  } catch (error) {
    console.warn("[VectoBeat] Discord interaction signature validation failed:", error)
    return false
  }
}

const buildLoginUrl = (interaction: any) => {
  const user =
    interaction?.member?.user ||
    interaction?.user || {
      id: "",
      username: "VectoBeat admin",
    }
  const guildId = interaction?.guild_id || ""
  const command = interaction?.data?.name || "interaction"

  const redirectUrl = new URL("/control-panel", SITE_ORIGIN)
  redirectUrl.searchParams.set("source", "discord_interactions")
  if (guildId) redirectUrl.searchParams.set("guild_id", guildId)
  if (user?.id) redirectUrl.searchParams.set("user_id", user.id)
  redirectUrl.searchParams.set("command", command)

  const loginPath = buildDiscordLoginUrl(`${redirectUrl.pathname}${redirectUrl.search}`)
  return `${SITE_ORIGIN.replace(/\/$/, "")}${loginPath}`
}

const unauthorizedResponse = () => NextResponse.json({ error: "invalid_signature" }, { status: 401 })

export async function POST(request: NextRequest) {
  if (!PUBLIC_KEY_VALID) {
    return NextResponse.json({ error: "interactions_not_configured" }, { status: 500 })
  }

  const signature = request.headers.get("x-signature-ed25519")
  const timestamp = request.headers.get("x-signature-timestamp")
  const rawBody = await request.text()

  if (!isRequestVerified(rawBody, signature, timestamp)) {
    return unauthorizedResponse()
  }

  let interaction: any
  try {
    interaction = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  // Discord PING
  if (interaction?.type === 1) {
    return NextResponse.json({ type: 1 })
  }

  const loginUrl = buildLoginUrl(interaction)
  const user = interaction?.member?.user || interaction?.user
  const greeting = user?.username ? `Hey ${user.username}!` : "Hey there!"

  return NextResponse.json({
    type: 4,
    data: {
      flags: 64,
      content: `${greeting} Authenticate with VectoBeat to finish managing your Discord music automation.`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: "Open VectoBeat Control Center",
              url: loginUrl,
            },
          ],
        },
      ],
    },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
