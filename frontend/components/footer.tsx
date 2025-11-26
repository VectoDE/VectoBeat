"use client"

import Link from "next/link"
import Image from "next/image"
import { Github, Mail, Twitter, Phone, MapPin, Clock, ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"

const LINK_GROUPS = [
  {
    key: "product",
    title: "Product",
    links: [
      { label: "Home", href: "/" },
      { label: "Pricing", href: "/pricing" },
      { label: "Blog", href: "/blog" },
      { label: "Features", href: "/features" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    key: "company",
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
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

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const response = await fetch("/api/verify-session", {
          credentials: "include",
        })
        if (!response.ok) {
          setIsLoggedIn(false)
          return
        }
        const data = await response.json()
        setIsLoggedIn(Boolean(data?.authenticated))
      } catch (error) {
        setIsLoggedIn(false)
      }
    }
    checkLoginStatus()
  }, [])

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
                    <Link href="/developer" className="hover:text-primary transition-colors">
                      Developers
                    </Link>
                  </li>
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
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-foreground/70 text-sm">© {currentYear} VectoBeat by VectoDE. All rights reserved.</p>

            {/* Social Links */}
            <div className="flex gap-4">
              {[
                { icon: Github, href: "https://github.com/VectoDE", label: "GitHub" },
                { icon: Twitter, href: "https://twitter.com/VectoDE", label: "Twitter" },
                { icon: Mail, href: "mailto:timhauke@uplytech.de", label: "Email" },
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
    </footer>
  )
}
