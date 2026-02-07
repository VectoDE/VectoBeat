"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, Share2 } from "lucide-react"
import { SiFacebook, SiLinkedin, SiX } from "react-icons/si"

interface BlogShareButtonProps {
  url: string
  title?: string
}

const SHARE_TARGETS = [
  {
    label: "Twitter / X",
    icon: SiX,
    buildUrl: (url: string, title?: string) =>
      `https://twitter.com/intent/tweet?${new URLSearchParams({
        url,
        text: title || "Check out this article from VectoBeat!",
      }).toString()}`,
  },
  {
    label: "Facebook",
    icon: SiFacebook,
    buildUrl: (url: string) => `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url }).toString()}`,
  },
  {
    label: "LinkedIn",
    icon: SiLinkedin,
    buildUrl: (url: string, title?: string) =>
      `https://www.linkedin.com/shareArticle?${new URLSearchParams({
        url,
        title: title || "VectoBeat Blog",
        mini: "true",
      }).toString()}`,
  },
]

export function BlogShareButton({ url, title }: BlogShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("[VectoBeat] Unable to copy URL:", error)
    }
  }

  const safeUrl = url || ""

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 hover:bg-card/50 hover:border-primary/30 transition-all duration-200"
      >
        <Share2 size={18} />
        Share
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border/50 bg-card/90 backdrop-blur shadow-lg p-4 space-y-3 z-50">
          <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">Share article</p>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors text-sm"
          >
            <Copy size={16} />
            {copied ? "Link Copied" : "Copy Link"}
          </button>
          <div className="flex flex-col gap-2">
            {SHARE_TARGETS.map((target) => {
              const Icon = target.icon
              return (
                <a
                  key={target.label}
                  href={target.buildUrl(safeUrl, title)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-card/60 transition-colors text-sm"
                >
                  <Icon size={16} />
                  <span>{target.label}</span>
                </a>
              )
            })}
          </div>
          <div className="text-[11px] text-foreground/50 text-center">Links open in a new tab.</div>
        </div>
      )}
    </div>
  )
}
