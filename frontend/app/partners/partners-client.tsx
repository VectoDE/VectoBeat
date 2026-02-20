"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowUpRight, Handshake, ShieldCheck, Sparkles, Radio, Server, HeartHandshake } from "lucide-react"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { apiClient } from "@/lib/api-client"

const PARTNERS = [
  {
    name: "UplyTech",
    role: "Cloud & Billing",
    href: "https://www.uplytech.de",
    description: "Infrastructure, scaling policy, and billing rails that keep VectoBeat performant and predictable.",
    logo: "/partners/uplytech.webp",
  },
  {
    name: "Lavalink Community",
    role: "Audio Stack",
    href: "https://github.com/lavalink-devs/Lavalink",
    description: "The open-source audio engine powering resilient streaming, node routing, and crossfade pipelines.",
    logo: "/partners/lavalink.png",
  },
  {
    name: "Discord Developer Ecosystem",
    role: "Platform Partner",
    href: "https://discord.com/developers",
    description: "Guidance on intents, compliance, and platform integrity so VectoBeat stays first-class on Discord.",
    logo: "/partners/discord.png",
  },
  {
    name: "Stripe",
    role: "Payments",
    href: "https://stripe.com",
    description: "Subscription management, invoicing, and secure checkout flows for every VectoBeat plan.",
    logo: "/partners/stripe.png",
  },
  {
    name: "Grafana & Prometheus",
    role: "Observability",
    href: "https://grafana.com",
    description: "Dashboards, alerts, and SLO tracking for Lavalink nodes, queue sync, and bot uptime.",
    logo: "/partners/prometheus.svg",
  },
  {
    name: "Open Source Contributors",
    role: "Community",
    href: "https://github.com/VectoDE/VectoBeat",
    description: "Engineers and moderators shaping features, writing docs, and stress-testing releases.",
    logo: "/partners/github.png",
  },
  {
    name: "Tavernen Werbungs HUB",
    role: "Advertising Partner",
    href: "https://discord.gg/Hr5JkTkgFu",
    description: "German-speaking advertising hub for servers & social media. Fair, secure systems to promote and connect.",
    logo: "/partners/tavernen_werbungs_hub.png",
  },
]

const BENEFITS = [
  {
    icon: ShieldCheck,
    title: "Reliability First",
    copy: "Redundant Lavalink nodes, automatic failover, and transparent uptime reporting shared with partners.",
  },
  {
    icon: Radio,
    title: "Signal-Rich Telemetry",
    copy: "Access to anonymized metrics—latency, queue health, player counts—so partners see impact in real time.",
  },
  {
    icon: Sparkles,
    title: "Co-Branded Experiences",
    copy: "Launch campaigns, shared playlists, and in-app messaging that feel native to VectoBeat.",
  },
]

type PartnerFormState = {
  name: string
  email: string
  company: string
  website: string
  topic: string
  priority: string
  message: string
}

export function PartnersClient() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [session, setSession] = useState<{ authenticated: boolean; id?: string; displayName?: string; email?: string } | null>(null)
  const [form, setForm] = useState<PartnerFormState>({
    name: "",
    email: "",
    company: "",
    website: "",
    topic: "Co-marketing",
    priority: "normal",
    message: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canSubmit = Boolean(session?.authenticated)

  useEffect(() => {
    const bootstrapSession = async () => {
      try {
        const data = await apiClient<any>("/api/verify-session", { credentials: "include" })
        if (data?.authenticated) {
          setSession({
            authenticated: true,
            id: data.id,
            displayName: data.displayName || data.username,
            email: data.email || "",
          })
          setForm((prev) => ({
            ...prev,
            name: prev.name || data.displayName || data.username || "",
            email: prev.email || data.email || "",
          }))
        } else {
          setSession({ authenticated: false })
        }
      } catch {
        setSession({ authenticated: false })
      }
    }
    bootstrapSession()
  }, [])

  const isAuthenticated = session?.authenticated
  const formIsValid = useMemo(() => {
    if (!form.name.trim()) return false
    if (!form.message.trim()) return false
    if (!isAuthenticated && !form.email.trim()) return false
    return true
  }, [form, isAuthenticated])

  const handleChange = (key: keyof PartnerFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const resetState = () => {
    setForm({
      name: session?.displayName || "",
      email: session?.email || "",
      company: "",
      website: "",
      topic: "Co-marketing",
      priority: "normal",
      message: "",
    })
    setSubmitError(null)
    setSubmitMessage(null)
    setSubmitting(false)
  }

  const handleSubmit = async () => {
    if (!formIsValid || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    setSubmitMessage(null)
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        subject: `[Partner] ${form.topic} (${form.priority})`,
        message: [
          form.message.trim(),
          form.company ? `\n\nCompany: ${form.company.trim()}` : "",
          form.website ? `\nWebsite: ${form.website.trim()}` : "",
        ]
          .filter(Boolean)
          .join(""),
        priority: form.priority,
        topic: `Partner • ${form.topic}`,
      }

      if (isAuthenticated && session?.id) {
        await apiClient<any>("/api/support-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: payload.name,
            email: payload.email,
            message: payload.message,
            discordId: session.id,
            category: payload.topic || "Partner",
            priority: payload.priority,
            subject: payload.subject,
          }),
        })
        setSubmitMessage("Your partner request was converted into a support ticket. We’ll reply inside your account.")
      } else {
        await apiClient<any>("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            topic: payload.topic || "Partner",
          }),
        })
        setSubmitMessage(
          "We received your partner request. Add your email so we can migrate it to a ticket when you sign in."
        )
      }
      setForm((prev) => ({ ...prev, message: "" }))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit your request."
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const openDialog = () => {
    if (!canSubmit) return
    setDialogOpen(true)
  }

  const disabledHint = "Sign in to submit a partner request."

  return (
    <Dialog open={dialogOpen} onOpenChange={(state) => { setDialogOpen(state); if (!state) resetState() }}>
      <div className="min-h-screen bg-background">
        <Navigation />

        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <DialogHeader>
            <DialogTitle>Partner intake</DialogTitle>
            <DialogDescription>
              Share your idea and preferred channel. If you are signed in, we open a ticket instantly; otherwise drop your email
              and we can attach it once you log in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                Email {isAuthenticated ? <span className="text-foreground/60">(optional)</span> : null}
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="you@example.com"
                required={!isAuthenticated}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={form.company}
                onChange={(e) => handleChange("company", e.target.value)}
                placeholder="Brand or organization"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={form.website}
                onChange={(e) => handleChange("website", e.target.value)}
                placeholder="https://"
              />
            </div>
            <div className="space-y-2">
              <Label>Topic</Label>
              <Select value={form.topic} onValueChange={(value) => handleChange("topic", value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Co-marketing">Co-marketing</SelectItem>
                  <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                  <SelectItem value="Payments">Payments</SelectItem>
                  <SelectItem value="Platform">Platform</SelectItem>
                  <SelectItem value="Data & analytics">Data & analytics</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(value) => handleChange("priority", value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="message">What should we build together?</Label>
              <Textarea
                id="message"
                rows={5}
                value={form.message}
                onChange={(e) => handleChange("message", e.target.value)}
                placeholder="Describe the partnership, timelines, success criteria, and who should be involved."
              />
            </div>
            <div className="md:col-span-2 flex items-start justify-between gap-4">
              <div className="text-sm text-foreground/70 space-y-1">
                <p>
                  {isAuthenticated
                    ? "Signed in: we’ll create a support ticket and keep it attached to your account."
                    : "Not signed in? Add your email. We can migrate this request to your account after you log in with the same email."}
                </p>
                {submitMessage && <p className="text-primary">{submitMessage}</p>}
                {submitError && <p className="text-destructive">{submitError}</p>}
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!formIsValid || submitting}
                className={cn("min-w-[140px]", submitting && "opacity-80")}
              >
                {submitting ? "Submitting…" : isAuthenticated ? "Submit ticket" : "Send request"}
              </Button>
            </div>
          </div>
        </DialogContent>

        <section className="relative w-full pt-28 pb-16 px-4 border-b border-border overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-10 left-10 w-40 h-40 bg-primary/20 blur-3xl opacity-50" />
            <div className="absolute -bottom-16 -right-8 w-72 h-72 bg-secondary/20 blur-3xl opacity-40" />
          </div>

          <div className="relative max-w-6xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary mb-6">
              <HeartHandshake className="h-4 w-4" />
              Partnership Network
            </div>
            <div className="grid lg:grid-cols-[1.25fr_1fr] gap-10 items-start">
              <div>
                <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">Partners powering VectoBeat</h1>
                <p className="text-lg text-foreground/70 max-w-2xl leading-relaxed">
                  VectoBeat pairs premium audio with battle-tested collaborators. Join the network and launch integrations,
                  co-marketing, or infrastructure pilots with the team.
                </p>
                <div className="flex flex-wrap gap-4 mt-8">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          onClick={openDialog}
                          aria-disabled={!canSubmit}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20",
                            !canSubmit && "cursor-not-allowed opacity-60"
                          )}
                        >
                          Become a partner
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canSubmit && <TooltipContent>{disabledHint}</TooltipContent>}
                  </Tooltip>
                  <Link
                    href={DISCORD_BOT_INVITE_URL}
                    className="inline-flex items-center gap-2 rounded-lg border border-border/80 px-5 py-3 text-sm font-semibold hover:border-primary/60 hover:text-primary transition-colors"
                  >
                    Launch the bot
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-linear-to-br from-primary/10 via-background/40 to-secondary/10 p-6 shadow-lg shadow-primary/10">
                <div className="flex items-center gap-3 mb-4">
                  <Handshake className="h-10 w-10 text-primary" />
                  <div>
                    <p className="text-sm text-foreground/60">Partner Promise</p>
                    <p className="text-xl font-semibold">Performance, Trust, Transparency</p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-xl border border-border/70 bg-card/50 p-4">
                    <p className="text-foreground/60 mb-1">Lavalink footprint</p>
                    <p className="text-lg font-semibold">Multi-node EU cluster</p>
                    <p className="text-foreground/60 mt-2">Regional routing + auto healing for low-latency playback.</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/50 p-4">
                    <p className="text-foreground/60 mb-1">Shared telemetry</p>
                    <p className="text-lg font-semibold">Live dashboards</p>
                    <p className="text-foreground/60 mt-2">Partners receive uptime, queue health, and player KPIs.</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/50 p-4">
                    <p className="text-foreground/60 mb-1">Security</p>
                    <p className="text-lg font-semibold">Privacy-first</p>
                    <p className="text-foreground/60 mt-2">Strict OAuth scopes, hashed telemetry, and GDPR controls.</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card/50 p-4">
                    <p className="text-foreground/60 mb-1">Integration time</p>
                    <p className="text-lg font-semibold">&lt; 2 weeks</p>
                    <p className="text-foreground/60 mt-2">Shared playbooks and SDK snippets accelerate go-live.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full py-16 px-4 bg-card/30 border-y border-border">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
              <div>
                <p className="text-sm uppercase tracking-wide text-primary/80 font-semibold mb-2">Partner Spotlight</p>
                <h2 className="text-3xl md:text-4xl font-bold">Verified collaborators & ecosystems</h2>
                <p className="text-foreground/70 mt-2 max-w-3xl">
                  Every partner below is actively linked across VectoBeat. Follow the links to see what we are building together.
                </p>
              </div>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                Learn about the team
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {PARTNERS.map((partner) => {
                const isExternal = partner.href.startsWith("http")
                return (
                  <Link
                    key={partner.name}
                    href={partner.href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noreferrer" : undefined}
                    className="group relative rounded-2xl border border-border/70 bg-linear-to-br from-background via-card/60 to-card/30 p-6 shadow-lg shadow-primary/5 hover:-translate-y-1 transition-transform"
                  >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-secondary/20 rounded-2xl" />
                    </div>
                    <div className="relative flex items-center gap-3 mb-4">
                      <div className="h-12 w-12 rounded-lg border border-border/60 bg-card/60 flex items-center justify-center overflow-hidden">
                        <Image
                          src={partner.logo}
                          alt={`${partner.name} logo`}
                          width={48}
                          height={48}
                          className="object-contain"
                        />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-foreground/60">{partner.role}</p>
                        <p className="text-lg font-semibold">{partner.name}</p>
                      </div>
                    </div>
                    <p className="relative text-foreground/70 leading-relaxed">{partner.description}</p>
                    <div className="relative mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      Visit partner
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        <section className="w-full py-16 px-4">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_1fr] gap-12">
            <div className="rounded-2xl border border-border/60 bg-linear-to-br from-primary/10 via-background/60 to-secondary/10 p-8">
              <div className="flex items-center gap-3 mb-4">
                <Server className="h-10 w-10 text-primary" />
                <div>
                  <p className="text-sm text-foreground/60">Integration lanes</p>
                  <p className="text-2xl font-semibold">Ways we partner</p>
                </div>
              </div>
              <ul className="space-y-4 text-foreground/70 leading-relaxed">
                <li>
                  <span className="font-semibold text-foreground">Co-marketing & launches:</span> shared landing pages,
                  feature placement in the control panel, and in-bot prompts tied to releases.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Infrastructure partnerships:</span> scaling playbooks,
                  incident drills, and uptime SLOs visible to both teams.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Data & analytics:</span> opt-in telemetry exports,
                  anonymized listener insights, and queue health shared securely.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Developer ecosystem:</span> SDK examples, webhook
                  handshakes, and community sessions for new plugins or sources.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              {BENEFITS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border/70 bg-card/50 p-6 flex gap-4 items-start shadow-lg shadow-secondary/5"
                >
                  <item.icon className="h-8 w-8 text-primary mt-1" />
                  <div>
                    <p className="text-xl font-semibold">{item.title}</p>
                    <p className="text-foreground/70 mt-1 leading-relaxed">{item.copy}</p>
                  </div>
                </div>
              ))}
              <div className="rounded-xl border border-dashed border-primary/50 bg-primary/5 p-6">
                <p className="text-sm uppercase tracking-wide text-primary font-semibold mb-2">Let&apos;s talk</p>
                <p className="text-lg text-foreground/80 mb-4">
                  Bring your platform, tooling, or community to the VectoBeat ecosystem. We respond within 48 hours.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          onClick={openDialog}
                          aria-disabled={!canSubmit}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground",
                            !canSubmit && "cursor-not-allowed opacity-60"
                          )}
                        >
                          Open a partner ticket
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canSubmit && <TooltipContent>{disabledHint}</TooltipContent>}
                  </Tooltip>
                  <Link
                    href="mailto:timhauke@uplytech.de"
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary/70 hover:text-primary transition-colors"
                  >
                    Email the team
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </Dialog>
  )
}
