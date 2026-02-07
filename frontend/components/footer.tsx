"use client"

import Link from "next/link"
import Image from "next/image"
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
} from "lucide-react"
import {
  SiGithub,
  SiGitlab,
  SiInstagram,
  SiLinkedin,
  SiTwitch,
  SiX,
  SiYoutube,
} from "react-icons/si"
import { useEffect, useState } from "react"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const LINK_GROUPS = [
  {
    key: "product",
    title: "Product",
    links: [
      { label: "Home", href: "/" },
      { label: "Pricing", href: "/pricing" },
      { label: "Features", href: "/features" },
      { label: "Blog", href: "/blog" },
      { label: "Security", href: "/security-patches" },
    ],
  },
  {
    key: "company",
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Partners", href: "/partners" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Success Stories", href: "/success-stories" },
    ],
  },
  {
    key: "resources",
    title: "Resources",
    links: [
      { label: "Statistics", href: "/stats" },
      { label: "Support Desk", href: "/support-desk" },
      { label: "Developer", href: "/developer" },
    ],
  },
  {
    key: "legal",
    title: "Legal",
    links: [
      { label: "Imprint", href: "/imprint" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "SLA", href: "/sla" },
    ],
  },
  {
    key: "community",
    title: "Community",
    links: [
      { label: "Forum", href: "/forum" },
      { label: "GitHub", href: "https://github.com/VectoDE/VectoBeat", external: true },
      { label: "Changelog", href: "/changelog" },
      { label: "Documentation", href: "https://github.com/VectoDE/VectoBeat#readme", external: true },
      { label: "Add to Discord", href: DISCORD_BOT_INVITE_URL, external: true },
    ],
  },
]

const CONTACT_ITEMS = [
  { label: "24/7 Incident Desk", value: "+49 172 6166860" },
  { label: "Priority Support", value: "timhauke@uplytech.de" },
  { label: "Operations Center", value: "Itzehoe – Remote EU" },
]

const OPERATIONS_CARDS = [
  { label: "Regions", value: "EU / US / APAC" },
  { label: "Response Window", value: "Priority <4h / Standard <24h" },
  { label: "Escalation", value: "On-call 24/7" },
  { label: "SLA Coverage", value: "Custom agreements" },
]

export default function Footer() {
  const currentYear = new Date().getFullYear()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userProfile, setUserProfile] = useState<{ id?: string; name?: string; email?: string }>({})
  const [donationDialogOpen, setDonationDialogOpen] = useState(false)
  const [donationLoading, setDonationLoading] = useState(false)
  const [donationError, setDonationError] = useState<string | null>(null)
  const [donationAmount, setDonationAmount] = useState("5")
  const [donationEmail, setDonationEmail] = useState("")
  const [donationName, setDonationName] = useState("")

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const response = await fetch("/api/verify-session", {
          credentials: "include",
        })
        if (!response.ok) {
          setIsLoggedIn(false)
          setUserProfile({})
          return
        }
        const data = await response.json()
        setIsLoggedIn(Boolean(data?.authenticated))
        if (data?.authenticated) {
          setUserProfile({
            id: data.id || data.discordId || "",
            name: data.displayName || data.username || "",
            email: data.email || "",
          })
        } else {
          setUserProfile({})
        }
      } catch (error) {
        setIsLoggedIn(false)
        setUserProfile({})
      }
    }
    checkLoginStatus()
  }, [])

  const resetDonationForm = () => {
    setDonationAmount("5")
    setDonationEmail(userProfile.email || "")
    setDonationName(userProfile.name || "")
    setDonationError(null)
    setDonationLoading(false)
  }

  const openDonationDialog = () => {
    resetDonationForm()
    setDonationDialogOpen(true)
  }

  const submitDonation = async () => {
    const amountNumber = Number(String(donationAmount).replace(",", "."))
    if (!Number.isFinite(amountNumber)) {
      setDonationError("Please enter a valid amount.")
      return
    }
    if (amountNumber < 0.5) {
      setDonationError("Minimum donation is €0.50.")
      return
    }
    if (!isLoggedIn) {
      const email = donationEmail.trim()
      if (!email || !email.includes("@")) {
        setDonationError("Please provide a valid email so Stripe can send the receipt.")
        return
      }
    }

    setDonationError(null)
    setDonationLoading(true)
    try {
      const payload: Record<string, any> = {
        amount: amountNumber,
        source: "footer",
      }
      const email = (donationEmail || userProfile.email || "").trim()
      const name = (donationName || userProfile.name || "").trim()
      if (email) payload.email = email
      if (name) payload.name = name
      if (userProfile.id) payload.discordId = userProfile.id

      const response = await fetch("/api/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok || !body?.url) {
        throw new Error(body?.error || "Stripe donation link could not be created.")
      }
      window.location.href = body.url
      setDonationDialogOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open donation link."
      setDonationError(message)
    } finally {
      setDonationLoading(false)
    }
  }

  return (
    <footer className="bg-card/60 border-t border-border/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-14">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-border/50 bg-background/80 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.2)]">
              <div className="flex items-center gap-3 mb-4">
                <Image src="/logo.png" alt="VectoBeat" width={32} height={32} className="h-8 w-8 rounded-md" />
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-foreground/60">VectoBeat</p>
                  <p className="text-lg font-semibold text-foreground">Production Audio Infrastructure</p>
                </div>
              </div>
              <p className="text-foreground/70 text-sm leading-relaxed">
                High-availability Discord music streaming tailored for the VectoBeat bot, with transparent telemetry, audited
                security workflows, and on-call engineers in three regions. Every stat on vectobeat.uplytech.de reflects real bot
                data—no placeholders, no mockups.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-2">
                  <Clock size={16} />
                  Live Operations
                </div>
                <p className="text-xs text-foreground/70 leading-relaxed">
                  Monitor latency, uptime, and stream counts in real time at{" "}
                  <Link href="/stats" className="text-primary hover:underline underline-offset-2">
                    vectobeat.uplytech.de/stats
                  </Link>
                </p>
              </div>
              <div className="rounded-2xl border border-secondary/40 bg-secondary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-secondary mb-2">
                  <ShieldCheck size={16} />
                  Security Center
                </div>
                <p className="text-xs text-foreground/70 leading-relaxed">
                  Enforce 2FA, inspect sessions, and revoke access instantly inside the{" "}
                  <Link href="/account" className="text-secondary hover:underline underline-offset-2">
                    account
                  </Link>
                  .
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              {CONTACT_ITEMS.map((item, index) => {
                const Icon = [Phone, Mail, MapPin][index] ?? Phone
                return (
                  <div key={item.label} className="rounded-xl border border-border/40 bg-card/50 p-4">
                    <div className="flex items-center gap-2 text-foreground font-semibold mb-1">
                      <Icon size={14} className="text-primary" />
                      {item.label}
                    </div>
                    <p className="text-foreground/60 text-xs">{item.value}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/70 p-6 space-y-4">
            <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">Operational Footprint</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {OPERATIONS_CARDS.map((item) => (
                <div key={item.label} className="rounded-lg border border-border/40 bg-card/40 p-3">
                  <p className="text-foreground/60 text-xs">{item.label}</p>
                  <p className="font-semibold text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-foreground/60">
              Need tailored onboarding or compliance documentation for your VectoBeat deployment? Contact
              timhauke@uplytech.de for custom rollout support.
            </p>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-3 lg:grid-cols-5">
          {LINK_GROUPS.map((group) => (
            <div key={group.key}>
              <p className="text-xs uppercase tracking-[0.4em] text-foreground/50 mb-3">{group.title}</p>
              <ul className="space-y-2 text-sm text-foreground/70">
                {group.links.map((link) =>
                  link.external ? (
                    <li key={link.label}>
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link href={link.href} className="hover:text-primary transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
                {group.key === "resources" && isLoggedIn && (
                  <li>
                    <Link href="/control-panel" className="hover:text-primary transition-colors">
                      Control Panel
                    </Link>
                  </li>
                )}
                {group.key === "resources" && isLoggedIn && (
                  <li>
                    <Link href="/account" className="hover:text-primary transition-colors">
                      Account
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border/30 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-foreground/70 text-sm">© {currentYear} VectoBeat by VectoDE. All rights reserved.</p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={openDonationDialog} disabled={donationLoading}>
                  {donationLoading ? "Opening Stripe…" : "Donate (Stripe)"}
                </Button>
                {donationError && !donationDialogOpen && <span className="text-xs text-destructive">{donationError}</span>}
              </div>
            </div>

            {/* Social Links */}
            <div className="flex gap-4">
              {[
                { icon: SiYoutube, href: "https://youtube.com/@vectode", label: "YouTube" },
                { icon: SiTwitch, href: "https://twitch.tv/VectoDE", label: "Twitch" },
                { icon: SiInstagram, href: "https://www.instagram.com/vecto_de", label: "Instagram" },
                { icon: SiX, href: "https://x.com/vecto_de", label: "X (Twitter)" },
                { icon: SiGithub, href: "https://github.com/VectoDE", label: "GitHub" },
                { icon: SiGitlab, href: "https://gitlab.com/timhauke99", label: "GitLab" },
                { icon: SiLinkedin, href: "https://www.linkedin.com/in/tim-hauke-b3b24b2b5/", label: "LinkedIn" },
                { icon: Mail, href: "mailto:timhauke@uplytech.de", label: "Discord (contact for access)" },
              ].map((social) => {
                const Icon = social.icon
                return (
                  <a
                    key={social.href}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground/70 hover:text-primary transition-colors"
                    aria-label={social.label}
                  >
                    <Icon size={20} />
                  </a>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={donationDialogOpen} onOpenChange={(state) => { setDonationDialogOpen(state); if (!state) resetDonationForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Support VectoBeat</DialogTitle>
            <DialogDescription>
              Choose an amount and receipt email. If you are signed in, your account details are prefilled automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="donation-amount">Amount in EUR</Label>
              <Input
                id="donation-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                placeholder="5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="donation-email">
                Receipt email {isLoggedIn ? <span className="text-foreground/60">(prefilled)</span> : null}
              </Label>
              <Input
                id="donation-email"
                type="email"
                value={donationEmail || userProfile.email || ""}
                onChange={(e) => setDonationEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="donation-name">Name (optional)</Label>
              <Input
                id="donation-name"
                value={donationName || userProfile.name || ""}
                onChange={(e) => setDonationName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            {donationError && <p className="text-sm text-destructive">{donationError}</p>}
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDonationDialogOpen(false)} disabled={donationLoading}>
              Cancel
            </Button>
            <Button onClick={submitDonation} disabled={donationLoading}>
              {donationLoading ? "Creating checkout…" : "Continue to Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </footer>
  )
}
