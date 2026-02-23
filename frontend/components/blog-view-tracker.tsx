"use client"

import { useEffect, useRef } from "react"
import { apiClient } from "@/lib/api-client"

interface BlogViewTrackerProps {
  identifier: string
}

export function BlogViewTracker({ identifier }: BlogViewTrackerProps) {
  const hasTracked = useRef(false)

  useEffect(() => {
    if (hasTracked.current) return
    hasTracked.current = true

    // Fire and forget view increment
    apiClient(`/api/blog/${encodeURIComponent(identifier)}/view`, { method: "POST" })
      .catch((err) => console.error("Failed to track blog view:", err))
  }, [identifier])

  return null
}
