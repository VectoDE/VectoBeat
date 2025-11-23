"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

type ConsentPreferences = {
  analytics: boolean
}

type StoredConsent = ConsentPreferences & { acceptedAt: number }

type SessionInfo = {
  token: string
  discordId: string
}

declare global {
  interface Window {
    __vectobeatConsent?: ConsentPreferences
  }
}

const COOKIE_NAME = "vectobeat_cookie_consent"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const CONSENT_INTERVAL_MS = COOKIE_MAX_AGE * 1000
const defaultConsent: ConsentPreferences = { analytics: false }

const readConsentCookie = (): StoredConsent | null => {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(COOKIE_NAME)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.analytics === "boolean" && typeof parsed.acceptedAt === "number") {
      if (Date.now() - parsed.acceptedAt > CONSENT_INTERVAL_MS) {
        return null
      }
      return parsed as StoredConsent
    }
    return null
  } catch {
    return null
  }
}

const writeConsentCookie = (consent: ConsentPreferences) => {
  if (typeof window === "undefined") return
  const record: StoredConsent = {
    analytics: consent.analytics,
    acceptedAt: Date.now(),
  }
  try {
    window.localStorage.setItem(COOKIE_NAME, JSON.stringify(record))
  } catch (error) {
    console.error("[VectoBeat] Failed to persist consent:", error)
  }
}

const clearConsentCookie = () => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(COOKIE_NAME)
  } catch (error) {
    console.error("[VectoBeat] Failed to clear consent:", error)
  }
}

const syncConsent = (consent: ConsentPreferences) => {
  if (typeof window !== "undefined") {
    window.__vectobeatConsent = consent
    document.dispatchEvent(
      new CustomEvent("vectobeat:consent", {
        detail: consent,
      }),
    )
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [consent, setConsent] = useState<ConsentPreferences>(defaultConsent)
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const pushProfileConsentRef = useRef<typeof pushProfileConsent | null>(null)

  const pushProfileConsent = useCallback(
    async (analyticsValue: boolean, options?: { silent?: boolean; sessionOverride?: SessionInfo | null }) => {
      const sessionPayload = options?.sessionOverride ?? sessionInfo
      if (!sessionPayload) {
        if (!options?.silent) {
          setSyncError(null)
        }
        return true
      }

      try {
        const response = await fetch("/api/account/privacy", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionPayload.token}`,
          },
          body: JSON.stringify({
            discordId: sessionPayload.discordId,
            analyticsOptIn: analyticsValue,
          }),
          cache: "no-store",
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || `HTTP ${response.status}`)
        }

        if (!options?.silent) {
          setSyncError(null)
        }

        return true
      } catch (error) {
        console.error("[VectoBeat] Failed to sync analytics consent:", error)
        if (!options?.silent) {
          setSyncError("We could not update your privacy settings. Please try again.")
        }
        return false
      }
    },
    [sessionInfo],
  )

  useEffect(() => {
    pushProfileConsentRef.current = pushProfileConsent
  }, [pushProfileConsent])

  useEffect(() => {
    let cancelled = false

    const initializeConsent = async () => {
      const stored = readConsentCookie()
      const shouldShowBanner = !stored
      let baseline: ConsentPreferences = stored ? { analytics: stored.analytics } : defaultConsent

      if (typeof window !== "undefined") {
        const token = localStorage.getItem("discord_token")
        const discordId = localStorage.getItem("discord_user_id")
        const sessionCandidate = token && discordId ? { token, discordId } : null
        if (!cancelled) {
          setSessionInfo(sessionCandidate)
        }

        if (sessionCandidate) {
          try {
            const response = await fetch(
              `/api/account/privacy?discordId=${encodeURIComponent(sessionCandidate.discordId)}`,
              {
                headers: {
                  Authorization: `Bearer ${sessionCandidate.token}`,
                },
                cache: "no-store",
              },
            )
            if (response.ok) {
              const payload = await response.json()
              if (typeof payload?.analyticsOptIn === "boolean") {
                const serverConsent = { analytics: Boolean(payload.analyticsOptIn) }
                if (stored) {
                  // Align server profile with the consent already stored locally.
                  if (stored.analytics !== serverConsent.analytics) {
                    const syncFn = pushProfileConsentRef.current
                    if (syncFn) {
                      await syncFn(stored.analytics, {
                        silent: true,
                        sessionOverride: sessionCandidate,
                      })
                    }
                  }
                } else {
                  baseline = serverConsent
                }
              }
            }
          } catch (error) {
            console.error("[VectoBeat] Unable to load privacy settings:", error)
          }
        }
      }

      if (!cancelled) {
        setConsent(baseline)
        if (stored) {
          enforceConsent(baseline)
        } else {
          revokeConsent()
        }
        setVisible(shouldShowBanner)
        setMounted(true)
      }
    }

    void initializeConsent()
    return () => {
      cancelled = true
    }
  }, [])

  function enforceConsent(value: ConsentPreferences) {
    if (value.analytics) {
      writeConsentCookie(value)
    } else {
      clearConsentCookie()
    }
    syncConsent(value)
  }

  function revokeConsent() {
    clearConsentCookie()
    syncConsent(defaultConsent)
  }

  async function commitConsent(next: ConsentPreferences) {
    setConsent(next)
    setSaving(true)
    setSyncError(null)

    const synced = await pushProfileConsent(next.analytics)
    if (synced) {
      enforceConsent(next)
      setVisible(false)
    }

    setSaving(false)
  }

  const handleAcceptAll = () => {
    void commitConsent({ analytics: true })
  }

  const handleDeclineAll = () => {
    void commitConsent({ analytics: false })
  }

  const handleSave = () => {
    void commitConsent(consent)
  }

  if (!mounted || !visible) {
    return null
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-6">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border/70 bg-card/95 backdrop-blur-lg shadow-2xl">
        <div className="p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70">VectoBeat Trust Center</p>
            <p className="text-2xl font-semibold text-foreground">Your privacy, your controls</p>
            <p className="text-sm text-foreground/70">
              We rely on two categories of cookies: essential services keep authentication, payments, and abuse-protection working;
              optional analytics cookies let us measure performance and shape the roadmap. Your selection is stored in your VectoBeat
              profile so every support touchpoint uses the same source of truth.
            </p>
            <p className="text-xs text-foreground/50">
              Manage these settings later via{" "}
              <Link href="/account#privacy" className="text-primary hover:underline">
                Account → Privacy
              </Link>{" "}
              or review our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">Essential services</p>
                <span className="text-xs font-semibold uppercase tracking-widest text-foreground/50">Always on</span>
              </div>
              <p className="text-xs text-foreground/70">
                Required for Discord login, session security, CSRF protection, and regional load balancing. Cannot be switched off.
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/80 p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Product analytics</p>
                  <p className="text-xs text-foreground/70">
                    Anonymized, first-party telemetry (no ads, no third parties). Helps us monitor stability and plan features.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground/70">
                  <input
                    id="analytics-consent"
                    type="checkbox"
                    checked={consent.analytics}
                    onChange={(event) => setConsent((prev) => ({ ...prev, analytics: event.target.checked }))}
                    className="h-5 w-5 rounded border-border/60 bg-background text-primary focus:ring-primary"
                    disabled={saving}
                  />
                  <span>{consent.analytics ? "Enabled" : "Disabled"}</span>
                </label>
              </div>
              <p className="text-[11px] text-foreground/60">
                When disabled we still monitor uptime using aggregated, cookie-free infrastructure logs.
              </p>
            </div>
          </div>

          {syncError && (
            <p className="text-sm text-destructive font-semibold" role="alert">
              {syncError}
            </p>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-foreground/60">
              Your choice takes effect immediately across the website, blog, control panel, and support desk.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleDeclineAll}
                disabled={saving}
                className="inline-flex justify-center rounded-lg border border-border/70 px-4 py-2 text-sm font-semibold text-foreground hover:bg-card/60 transition-colors disabled:opacity-60"
              >
                Decline analytics
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex justify-center rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
              >
                Save selection
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                disabled={saving}
                className="inline-flex justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
