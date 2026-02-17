"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { buildDiscordLoginUrl } from "@/lib/config"
import { apiClient } from "@/lib/api-client"

type SessionUser = {
  id: string
  username: string
  email?: string
}

const restEndpoints = [
  {
    method: "GET",
    path: "/api/v1/queues",
    scope: "queue.read",
    description: "List active queues + metadata for your authenticated guilds.",
  },
  {
    method: "POST",
    path: "/api/v1/queues/{guildId}/tracks",
    scope: "queue.write",
    description: "Inject tracks into the guild queue from your automation.",
  },
  {
    method: "DELETE",
    path: "/api/v1/queues/{guildId}/tracks/{trackId}",
    scope: "queue.write",
    description: "Remove a track or cancel an upcoming automation task.",
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/test",
    scope: "integrations.manage",
    description: "Send a signed test event to validate your webhook endpoint.",
  },
]

const webhookEvents = [
  {
    name: "queue.updated",
    payload: ["guildId", "version", "tracks", "nowPlaying", "triggeredBy"],
    note: "Emitted whenever the queue changes or automation trims tracks.",
  },
  {
    name: "automation.fired",
    payload: ["guildId", "action", "metadata", "timestamp", "shardId"],
    note: "Records automation actions for audit + analytics exports.",
  },
  {
    name: "concierge.escalated",
    payload: ["guildId", "summary", "contact", "hours", "priority"],
    note: "Growth/Scale concierge desk escalations with SLA metadata.",
  },
]

const rateLimits = [
  { bucket: "REST - standard", limit: "200 requests / min", reset: "Rolling window per API token" },
  { bucket: "REST - automation", limit: "600 requests / min", reset: "Requires queue.write scope" },
  { bucket: "Webhook delivery", limit: "Retries x5 with exponential backoff", reset: "Drops after 24h" },
  { bucket: "Portal downloads", limit: "5 compliance exports / hr", reset: "Per guild" },
]

const sdkGuides = [
  {
    name: "TypeScript SDK",
    install: "npm install @vectobeat/sdk",
    snippet: `import { VectoClient } from "@vectobeat/sdk"

const client = new VectoClient({ token: process.env.VECTO_TOKEN })
const queues = await client.queues.list()
await client.queues.addTrack(guildId, { url: "https://youtu.be/123", requestedBy: "automation" })`,
  },
  {
    name: "Python SDK",
    install: "pip install vectobeat-sdk",
    snippet: `from vectobeat import VectoClient

client = VectoClient(token=os.environ["VECTO_TOKEN"])
metrics = client.analytics.rate_limits()
client.webhooks.send_test(target="https://example.com/hooks")`,
  },
]

const planGates = [
  {
    capability: "REST API (queue.read/write)",
    tiers: ["starter", "pro", "growth", "scale", "enterprise"],
    notes: "Starter inherits read-only scopes. Write access unlocks from Pro upward.",
  },
  {
    capability: "Webhook subscriptions",
    tiers: ["pro", "growth", "scale", "enterprise"],
    notes: "Includes signed events + replay protection.",
  },
  {
    capability: "Automation audit + compliance exports",
    tiers: ["growth", "scale", "enterprise"],
    notes: "Includes JSONL export + snapshot downloads via portal.",
  },
  {
    capability: "Concierge + success pod APIs",
    tiers: ["scale", "enterprise"],
    notes: "White-glove workflows with dedicated pods and SLA hooks.",
  },
]

export default function DeveloperPortalPage() {
  const [loading, setLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [betaAllowed, setBetaAllowed] = useState(false)
  const [betaLoading, setBetaLoading] = useState(true)
  const [betaError, setBetaError] = useState<string | null>(null)

  const loginHref = useMemo(() => {
    if (typeof window === "undefined") {
      return buildDiscordLoginUrl()
    }
    return buildDiscordLoginUrl(`${window.location.origin}/api/auth/discord/callback`)
  }, [])

  useEffect(() => {
    let cancelled = false
    const verify = async () => {
      try {
        const payload = await apiClient<any>("/api/verify-session", { credentials: "include" })
        if (cancelled) return
        if (payload?.authenticated) {
          setIsAuthorized(true)
          setUser({
            id: payload.id,
            username: payload.displayName || payload.username,
            email: payload.email,
          })
        } else {
          setIsAuthorized(false)
          setUser(null)
        }
      } catch {
        if (!cancelled) {
          setIsAuthorized(false)
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void verify()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isAuthorized || !user) {
      setBetaLoading(false)
      setBetaAllowed(false)
      return
    }
    let cancelled = false
    const loadNotifications = async () => {
      setBetaLoading(true)
      setBetaError(null)
      try {
        const payload = await apiClient<any>(`/api/account/notifications?discordId=${user.id}`, {
          credentials: "include",
        })
        if (!cancelled) {
          setBetaAllowed(Boolean(payload.betaProgram))
        }
      } catch (error) {
        console.error("Failed to load notification preferences:", error)
        if (!cancelled) {
          setBetaAllowed(false)
          setBetaError(error instanceof Error ? error.message : "Unable to verify beta access.")
        }
      } finally {
        if (!cancelled) {
          setBetaLoading(false)
        }
      }
    }
    void loadNotifications()
    return () => {
      cancelled = true
    }
  }, [isAuthorized, user])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center py-24">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin mx-auto" />
            <p className="text-foreground/60 text-sm">Opening developer portal…</p>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="max-w-md text-center space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Developer portal</p>
            <h1 className="text-3xl font-bold">Sign in to continue</h1>
            <p className="text-foreground/70">
              The developer portal hosts private API tokens, webhook secrets, and compliance exports. Sign in with your
              VectoBeat control-panel account to access the docs.
            </p>
            <a
              href={loginHref}
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Sign in with Discord
            </a>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (betaLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center py-24">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin mx-auto" />
            <p className="text-foreground/60 text-sm">Checking beta access…</p>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (!betaAllowed) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="max-w-md text-center space-y-4 border border-border/60 rounded-xl p-6 bg-card/40">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Beta required</p>
            <h1 className="text-3xl font-bold">Enable alerts access</h1>
            <p className="text-foreground/70">
              The developer portal is limited to beta participants. Enable the “Beta Program” toggle under Alerts in
              your account to proceed.
            </p>
            {betaError && <p className="text-sm text-destructive">{betaError}</p>}
            <Link
              href="/account#alerts"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Open alerts settings
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1 w-full pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto space-y-12">
          <section className="rounded-2xl border border-border/50 bg-card/40 p-8 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70 mb-2">Developer portal</p>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-4">
                <h1 className="text-4xl font-bold">Build on top of VectoBeat.</h1>
                <p className="text-foreground/70 max-w-2xl">
                  Access unified docs for REST endpoints, webhook schemas, SDK snippets, and rate limits. Everything honours your
                  control-panel plan gating, so the behaviour documented here mirrors production. Need an API key? Request it via
                  Support and we&apos;ll mint a developer token tied to your account.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="#rest"
                    className="px-5 py-2 rounded-lg bg-primary/10 text-primary font-semibold border border-primary/40 hover:bg-primary/15 transition-colors text-sm"
                  >
                    REST reference
                  </Link>
                  <Link
                    href="#webhooks"
                    className="px-5 py-2 rounded-lg border border-border/60 text-sm font-semibold text-foreground/80 hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    Webhook schemas
                  </Link>
                  <Link
                    href="/support-desk?category=Developer%20API%20Key&priority=high"
                    className="px-5 py-2 rounded-lg border border-primary/50 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                  >
                    Request developer key
                  </Link>
                </div>
              </div>
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 w-full max-w-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Signed in</p>
                <p className="text-lg font-semibold text-foreground">{user?.username}</p>
                <p className="text-sm text-foreground/70">{user?.email || "No email attached"}</p>
                <p className="text-xs text-foreground/60 mt-4">
                  Tokens minted from this portal inherit your control-panel scopes. Keep them secret; they grant all REST
                  scopes unlocked for your plan.
                </p>
              </div>
            </div>
          </section>

          <section id="webhooks" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Webhook schemas</p>
                <h2 className="text-2xl font-bold">Event payloads + signing</h2>
              </div>
              <span className="text-xs text-foreground/60">All payloads are signed with HMAC SHA256</span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {webhookEvents.map((event) => (
                <div key={event.name} className="rounded-xl border border-border/50 bg-card/30 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{event.name}</p>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/50">JSON</span>
                  </div>
                  <p className="text-xs text-foreground/60">{event.note}</p>
                  <p className="text-[11px] text-foreground/50 font-mono">
                    {event.payload.map((field) => `.${field}`).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border/50 bg-card/20 p-4">
              <p className="text-sm font-semibold mb-2">Verification example</p>
              <pre className="bg-background/60 border border-border/40 rounded-lg p-4 text-xs overflow-auto">
{`const digest = crypto
  .createHmac("sha256", process.env.VECTO_WEBHOOK_SECRET)
  .update(rawBody)
  .digest("hex")

if (digest !== req.headers["x-vectobeat-signature"]) {
  return res.status(401).send("invalid signature")
}`}
              </pre>
            </div>
          </section>

          <section id="rest" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-primary/70">REST endpoints</p>
                <h2 className="text-2xl font-bold">Authenticated routes + scopes</h2>
              </div>
              <span className="text-xs text-foreground/60">Bearer tokens are issued from the Control Panel → API</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/20">
              <table className="w-full text-sm">
                <thead className="text-left text-foreground/60 text-xs uppercase tracking-[0.2em]">
                  <tr>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Path</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {restEndpoints.map((endpoint) => (
                    <tr key={`${endpoint.method}-${endpoint.path}`} className="border-t border-border/40">
                      <td className="px-4 py-3 font-mono text-xs text-primary">{endpoint.method}</td>
                      <td className="px-4 py-3 font-mono text-xs">{endpoint.path}</td>
                      <td className="px-4 py-3 text-foreground/70">{endpoint.scope}</td>
                      <td className="px-4 py-3 text-foreground/70">{endpoint.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/50 bg-card/30 p-6 space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Rate limits</p>
              <h3 className="text-xl font-semibold">Protecting shared capacity</h3>
              <div className="space-y-3">
                {rateLimits.map((row) => (
                  <div
                    key={row.bucket}
                    className="flex items-center justify-between text-sm border border-border/40 rounded-lg px-3 py-2 bg-background/40"
                  >
                    <div>
                      <p className="font-semibold">{row.bucket}</p>
                      <p className="text-xs text-foreground/60">{row.reset}</p>
                    </div>
                    <span className="text-xs font-semibold text-primary">{row.limit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card/30 p-6 space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-primary/70">SDK quickstarts</p>
              <h3 className="text-xl font-semibold">Ship faster with our official clients</h3>
              <div className="space-y-4">
                {sdkGuides.map((sdk) => (
                  <div key={sdk.name} className="border border-border/40 rounded-lg p-4 bg-background/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{sdk.name}</p>
                      <code className="text-xs bg-card/60 border border-border/40 rounded px-2 py-1">{sdk.install}</code>
                    </div>
                    <pre className="bg-background/60 border border-border/30 rounded-lg p-3 text-xs overflow-auto">{sdk.snippet}</pre>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary/70">Plan gating</p>
              <h2 className="text-2xl font-bold">Capabilities unlocked per tier</h2>
              <p className="text-sm text-foreground/60">
                These gates mirror the Control Panel → Membership configuration, so portal behaviour stays in sync with
                your marketing promises.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/20">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.2em] text-foreground/60">
                  <tr>
                    <th className="px-4 py-3">Capability</th>
                    <th className="px-4 py-3">Included tiers</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {planGates.map((gate) => (
                    <tr key={gate.capability} className="border-t border-border/40">
                      <td className="px-4 py-3 font-semibold text-foreground">{gate.capability}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {["starter", "pro", "growth", "scale", "enterprise"].map((tier) => (
                            <span
                              key={tier}
                              className={`px-2 py-1 rounded-full text-[11px] uppercase tracking-wide border ${
                                gate.tiers.includes(tier)
                                  ? "bg-primary/10 border-primary/40 text-primary"
                                  : "bg-transparent border-border/40 text-foreground/40"
                              }`}
                            >
                              {tier}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground/70">{gate.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
