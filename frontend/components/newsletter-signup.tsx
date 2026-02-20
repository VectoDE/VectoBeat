"use client"

import { useState } from "react"
import { apiClient } from "@/lib/api-client"

type NewsletterCopy = {
  label: string
  title: string
  description: string
  namePlaceholder: string
  emailPlaceholder: string
  submitIdle: string
  submitLoading: string
  success: string
  error: string
}

interface NewsletterSignupProps {
  copy?: NewsletterCopy
}

export function NewsletterSignup({ copy }: NewsletterSignupProps) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  const resolvedCopy: NewsletterCopy =
    copy ?? {
      label: "Newsletter",
      title: "Stay in Sync with VectoBeat",
      description: "Be the first to hear about new features, incidents, and roadmap drops. We send no more than one update per week.",
      namePlaceholder: "Name (optional)",
      emailPlaceholder: "you@server.com",
      submitIdle: "Subscribe",
      submitLoading: "Adding...",
      success: "You're on the list! Keep an eye on your inbox.",
      error: "Unable to subscribe right now.",
    }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email) return
    setStatus("loading")
    setMessage(null)
    try {
      await apiClient("/api/newsletter/subscribe", {
        method: "POST",
        body: JSON.stringify({ email, name }),
      })
      setStatus("success")
      setMessage(resolvedCopy.success)
      setEmail("")
      setName("")
    } catch (error) {
      console.error("Newsletter subscribe failed:", error)
      setStatus("error")
      setMessage(error instanceof Error ? error.message : resolvedCopy.error)
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-8">
      <p className="text-xs uppercase tracking-[0.4em] text-foreground/60 mb-2">{resolvedCopy.label}</p>
      <h2 className="text-3xl font-bold mb-2">{resolvedCopy.title}</h2>
      <p className="text-foreground/70 mb-6">{resolvedCopy.description}</p>
      <form className="grid md:grid-cols-3 gap-4" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={resolvedCopy.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-4 py-3 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm md:col-span-1"
        />
        <input
          type="email"
          placeholder={resolvedCopy.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="px-4 py-3 rounded-lg bg-background border border-border/50 focus:border-primary/50 outline-none text-sm md:col-span-1"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 md:col-span-1"
        >
          {status === "loading" ? resolvedCopy.submitLoading : resolvedCopy.submitIdle}
        </button>
      </form>
      {message && (
        <p className={`text-sm mt-3 ${status === "error" ? "text-destructive" : "text-foreground/70"}`}>{message}</p>
      )}
    </div>
  )
}
