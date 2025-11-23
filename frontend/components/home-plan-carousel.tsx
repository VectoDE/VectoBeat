"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, X } from "lucide-react"
import { MEMBERSHIP_TIERS } from "@/lib/memberships"
import type { MembershipTier } from "@/lib/memberships"
import { DISCORD_BOT_INVITE_URL, buildDiscordLoginUrl } from "@/lib/config"
const PLAN_COPY = {
  monthlyLabel: "Monthly",
  yearlyLabel: "Yearly",
  instructions: "Slides advance every 5 seconds. Hover to pause, drag or swipe horizontally to explore plans—no scrollbar needed.",
  emailPlaceholder: "Billing email (required for checkout)",
  emailHint: "Discord did not share an email—please enter one manually.",
  guildSelectHint: "Select which server should receive this plan.",
  noGuildHint: "Invite VectoBeat to a server first so we can attach the subscription to it.",
  inviteHint: "You need to own or manage at least one Discord server to assign the subscription.",
  discountLabel: "Save {{amount}} per year vs monthly",
  featuresLabel: "Features",
  badgeLabel: "Most Popular",
  redirecting: "Redirecting...",
  billingPeriod: { month: "month", year: "year" },
  errors: {
    loginRequired: "Please log in with Discord to continue checkout.",
    emailInvalid: "Enter a valid billing email to continue.",
    noGuild: "You need to own or manage at least one Discord server to assign the subscription.",
  },
} as const

const tierEntries = Object.entries(MEMBERSHIP_TIERS) as Array<[MembershipTier, (typeof MEMBERSHIP_TIERS)[MembershipTier]]>

type SessionGuild = { id: string; name: string; isAdmin?: boolean }
type SessionData = {
  id: string
  email?: string | null
  phone?: string | null
  displayName?: string | null
  username?: string | null
  guilds?: SessionGuild[]
}


export function HomePlanCarousel() {
  const totalSlides = tierEntries.length
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")
  const [activeSlide, setActiveSlide] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const [slideMetrics, setSlideMetrics] = useState({ width: 0, gap: 0 })
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [session, setSession] = useState<SessionData | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<MembershipTier | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [billingEmail, setBillingEmail] = useState("")
  const [selectedGuildId, setSelectedGuildId] = useState<string>("")
  const pricingCurrency = (process.env.NEXT_PUBLIC_PRICING_CURRENCY || "EUR").toUpperCase()
  const locale = "en-US"
  const priceFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: pricingCurrency }),
    [locale, pricingCurrency],
  )
  const formatPrice = (amount: number) => priceFormatter.format(amount)

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("discord_token") : null
    if (token) {
      setAuthToken(token)
    }
    void fetchSession(token ?? undefined)
  }, [])

  useEffect(() => {
    if (isPaused || totalSlides <= 1) {
      return
    }
    const id = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % totalSlides)
    }, 5000)
    return () => window.clearInterval(id)
  }, [isPaused, totalSlides])

  useEffect(() => {
    const updateMetrics = () => {
      if (!sliderRef.current) return
      const firstSlide = sliderRef.current.querySelector<HTMLElement>("[data-plan-card]")
      if (!firstSlide) return
      const width = firstSlide.getBoundingClientRect().width
      const gapValue = parseFloat(window.getComputedStyle(sliderRef.current).columnGap || "0")
      setSlideMetrics({
        width,
        gap: Number.isFinite(gapValue) ? gapValue : 0,
      })
    }

    updateMetrics()
    window.addEventListener("resize", updateMetrics)
    return () => window.removeEventListener("resize", updateMetrics)
  }, [])

  useEffect(() => {
    if (activeSlide > totalSlides - 1) {
      setActiveSlide(Math.max(totalSlides - 1, 0))
    }
  }, [totalSlides, activeSlide])

  const sliderStep = slideMetrics.width ? slideMetrics.width + slideMetrics.gap : 340

  useEffect(() => {
    if (session?.email) {
      setBillingEmail("")
      setError(null)
    }
  }, [session?.email])

  useEffect(() => {
    const guilds: SessionGuild[] = session?.guilds ?? []
    if (!guilds.length) {
      setSelectedGuildId("")
      return
    }
    const preferred = guilds.find((guild) => guild.isAdmin) ?? guilds[0]
    setSelectedGuildId(preferred?.id ?? "")
  }, [session?.guilds])

  const fetchSession = async (token?: string, silent?: boolean) => {
    try {
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch("/api/verify-session", {
        headers,
        credentials: "include",
      })
      if (!response.ok) {
        throw new Error("Failed to verify session")
      }
      const data = await response.json()
      if (data?.authenticated) {
        setSession(data)
        if (!silent) {
          setError(null)
        }
        return data
      }
    } catch (err) {
      console.error("[VectoBeat] Failed to load session:", err)
    }
    return null
  }

  const goToPrev = () => {
    if (!totalSlides) return
    setActiveSlide((prev) => (prev - 1 + totalSlides) % totalSlides)
  }

  const goToNext = () => {
    if (!totalSlides) return
    setActiveSlide((prev) => (prev + 1) % totalSlides)
  }

  const shouldSkipDrag = (target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false
    }
    return Boolean(target.closest("button, a, input, select, textarea, [role='button'], [data-slider-interactive='true']"))
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (shouldSkipDrag(event.target)) {
      return
    }
    if (!sliderRef.current) return
    event.preventDefault()
    sliderRef.current.setPointerCapture(event.pointerId)
    setDragStartX(event.clientX)
    setIsPaused(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX === null) return
    setDragOffset(event.clientX - dragStartX)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sliderRef.current?.hasPointerCapture(event.pointerId)) {
      sliderRef.current.releasePointerCapture(event.pointerId)
    }
    if (dragStartX === null) return
    const delta = event.clientX - dragStartX
    const threshold = 60
    if (delta > threshold) {
      goToPrev()
    } else if (delta < -threshold) {
      goToNext()
    }
    setDragOffset(0)
    setDragStartX(null)
    setTimeout(() => setIsPaused(false), 200)
  }

  const cancelDrag = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (event && sliderRef.current?.hasPointerCapture(event.pointerId)) {
      sliderRef.current.releasePointerCapture(event.pointerId)
    }
    setDragStartX(null)
    setDragOffset(0)
    setTimeout(() => setIsPaused(false), 200)
  }

  const handleSubscribe = async (tierId: MembershipTier) => {
    if (tierId === "free") {
      window.location.href = DISCORD_BOT_INVITE_URL
      return
    }

    if (tierId === "enterprise") {
      window.location.href = `mailto:timhauke@uplytech.de?subject=${tierId.charAt(0).toUpperCase() + tierId.slice(1)}%20Plan%20Inquiry`
      return
    }

    let resolvedSession = session
    if (!resolvedSession?.id) {
      resolvedSession = await fetchSession(authToken ?? undefined, true)
    }
    if (!resolvedSession?.id) {
      localStorage.removeItem("discord_token")
      localStorage.removeItem("discord_user_id")
      setError(PLAN_COPY.errors.loginRequired)
      const redirectUri = `${window.location.origin}/api/auth/discord/callback`
      window.location.href = buildDiscordLoginUrl(redirectUri)
      return
    }

    const normalizedEmail = (resolvedSession.email || billingEmail).trim()
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    if (!emailValid) {
      setError(PLAN_COPY.errors.emailInvalid)
      return
    }

    const allGuilds: SessionGuild[] = resolvedSession.guilds || []
    const resolvedGuild =
      allGuilds.find((guild) => guild.id === selectedGuildId) ||
      allGuilds.find((guild) => guild.isAdmin) ||
      allGuilds[0]

    if (!resolvedGuild?.id) {
      setError(PLAN_COPY.errors.noGuild)
      return
    }

    try {
      setError(null)
      setCheckoutLoading(tierId)
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const navigatorLocale = typeof window !== "undefined" ? window.navigator.language : "en"
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify({
          tierId,
          billingCycle,
          customerEmail: normalizedEmail,
          discordId: resolvedSession.id,
          guildId: resolvedGuild.id,
          guildName: resolvedGuild.name,
          customerName: session?.displayName || session?.username || null,
          customerPhone: session?.phone || null,
          locale: navigatorLocale,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Checkout failed")
      }

      const { url } = payload
      if (!url) {
        throw new Error("Stripe checkout session could not be initialized.")
      }
      window.location.href = url
    } catch (checkoutError) {
      console.error("[VectoBeat] Checkout failed:", checkoutError)
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout failed")
    } finally {
      setCheckoutLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-4 bg-card/50 border border-border/50 rounded-lg p-2">
        <button
          onClick={() => setBillingCycle("monthly")}
          className={`px-6 py-2 rounded-lg font-semibold transition-all ${
            billingCycle === "monthly"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/70 hover:text-foreground"
          }`}
        >
          {PLAN_COPY.monthlyLabel}
        </button>
        <button
          onClick={() => setBillingCycle("yearly")}
          className={`px-6 py-2 rounded-lg font-semibold transition-all ${
            billingCycle === "yearly"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/70 hover:text-foreground"
          }`}
        >
          {PLAN_COPY.yearlyLabel}
        </button>
      </div>

      <p className="text-xs text-foreground/50 text-center">{PLAN_COPY.instructions}</p>
      {(error || !session?.email || Array.isArray(session?.guilds)) && (
        <div className="max-w-2xl mx-auto text-center space-y-2">
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          {!session?.email && (
            <div className="flex flex-col sm:flex-row items-center gap-2 justify-center">
              <input
                type="email"
                value={billingEmail}
                onChange={(event) => setBillingEmail(event.target.value)}
                placeholder={PLAN_COPY.emailPlaceholder}
                className="w-full sm:w-auto min-w-[260px] px-3 py-2 rounded-lg border border-border/60 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-xs text-foreground/50">{PLAN_COPY.emailHint}</span>
            </div>
          )}
          {session?.guilds?.length ? (
            <div className="flex flex-col sm:flex-row items-center gap-2 justify-center">
              <select
                value={selectedGuildId}
                onChange={(event) => setSelectedGuildId(event.target.value)}
                className="w-full sm:w-auto min-w-60 px-3 py-2 rounded-lg border border-border/60 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                {(session?.guilds ?? []).map((guild: SessionGuild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name} {guild.isAdmin ? "(Admin)" : ""}
                  </option>
                ))}
              </select>
              <span className="text-xs text-foreground/50">{PLAN_COPY.guildSelectHint}</span>
            </div>
          ) : (
            <p className="text-xs text-foreground/50">
              {PLAN_COPY.noGuildHint} {PLAN_COPY.inviteHint}
            </p>
          )}
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/30 py-8 px-4"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => {
          if (dragStartX === null) setIsPaused(false)
        }}
      >
        <div
          ref={sliderRef}
          className={`flex gap-6 items-stretch ${dragStartX === null ? "transition-transform duration-500" : ""}`}
          style={{ transform: `translateX(${-(sliderStep * activeSlide) + dragOffset}px)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={(event) => cancelDrag(event)}
          onPointerLeave={(event) => {
            if (dragStartX !== null) {
              handlePointerUp(event)
            }
          }}
        >
          {tierEntries.map(([tierKey, tier]) => {
            const displayedPrice = billingCycle === "monthly" ? tier.monthlyPrice : tier.yearlyPrice
            const formattedPrice = formatPrice(displayedPrice)
            const yearlySavings =
              tier.monthlyPrice > 0 && tier.yearlyPrice > 0 ? tier.monthlyPrice * 12 - tier.yearlyPrice : 0
            const tierName = tier.name
            const tierDescription = tier.description
            const tierCta = tier.cta
            const tierFeatures = tier.features
            const yearlyDiscountLabel =
              yearlySavings > 0
                ? PLAN_COPY.discountLabel.replace("{{amount}}", formatPrice(yearlySavings))
                : null
            return (
              <div
                key={tierKey}
                data-plan-card
                className={`relative min-w-[260px] sm:min-w-[320px] lg:min-w-[360px] rounded-2xl border transition-all group ${
                  tier.highlighted
                    ? "bg-linear-to-b from-primary/20 to-secondary/10 border-primary/50 shadow-lg hover:scale-[1.02]"
                    : "bg-card/50 border-border/50 hover:border-primary/30"
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-primary rounded-full text-sm font-semibold text-primary-foreground">
                    {PLAN_COPY.badgeLabel}
                  </div>
                )}

                <div className="p-8">
                  <h3 className="text-2xl font-bold mb-2">{tierName}</h3>
                  <p className="text-foreground/60 text-sm mb-6">{tierDescription}</p>

                  <div className="mb-8">
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-5xl font-bold">{formattedPrice}</span>
                      <span className="text-foreground/60">
                        /{billingCycle === "monthly" ? PLAN_COPY.billingPeriod.month : PLAN_COPY.billingPeriod.year}
                      </span>
                    </div>
                    {billingCycle === "yearly" && yearlyDiscountLabel && (
                      <p className="text-xs text-green-500 font-semibold">{yearlyDiscountLabel}</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleSubscribe(tierKey)}
                    className={`w-full inline-flex justify-center py-3 rounded-lg font-semibold transition-all mb-8 ${
                      tier.highlighted
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-primary/30 text-primary hover:bg-primary/10"
                    }`}
                    disabled={checkoutLoading === tierKey}
                  >
                    {checkoutLoading === tierKey ? PLAN_COPY.redirecting : tierCta}
                  </button>

                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">{PLAN_COPY.featuresLabel}</p>
                    {tierFeatures.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3">
                        {feature.included ? (
                          <Check size={20} className="text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <X size={20} className="text-foreground/30 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className={`text-sm ${feature.included ? "text-foreground/80" : "text-foreground/40"}`}>
                            {feature.name}
                            {feature.value && <span className="font-semibold"> - {feature.value}</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
