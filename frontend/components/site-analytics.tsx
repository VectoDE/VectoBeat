"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useCallback, useEffect } from "react"
import { apiClient } from "@/lib/api-client"

declare global {
  interface Window {
    __vectobeatConsent?: {
      analytics: boolean
    }
  }
}

const hasAnalyticsConsent = () => typeof window !== "undefined" && window.__vectobeatConsent?.analytics

export function SiteAnalyticsTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const track = useCallback(() => {
    if (typeof window === "undefined" || !hasAnalyticsConsent()) {
      return
    }
    const path = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`
    const payload = { path, referrer: document.referrer || null }
    const url = "/api/metrics/track"
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" })
        navigator.sendBeacon(url, blob)
      } else {
        // Use apiClient for the fallback fetch
        void apiClient(url, {
          method: "POST",
          data: payload,
          keepalive: true,
        })
      }
    } catch (error) {
      console.warn("[VectoBeat] Failed to record page view:", error)
    }
  }, [pathname, searchParams])

  useEffect(() => {
    track()
  }, [track])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ analytics: boolean }>).detail
      if (detail?.analytics) {
        track()
      }
    }
    document.addEventListener("vectobeat:consent", handler)
    return () => document.removeEventListener("vectobeat:consent", handler)
  }, [track])

  return null
}
