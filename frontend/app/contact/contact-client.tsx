'use client'

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { Mail, MessageSquare, Headphones, Github } from "lucide-react"
import { useState } from "react"

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", topic: "", priority: "normal", company: "" })
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name || !form.email || !form.message || !form.topic || !form.priority) {
      setFeedback("Please fill in all required fields (including topic and priority).")
      setStatus("error")
      return
    }

    setStatus("loading")
    setFeedback(null)

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Failed to send message.")
      }
      setStatus("success")
      setFeedback("Thanks for reaching out! We’ll respond within one business day.")
      setForm({ name: "", email: "", subject: "", message: "", topic: "", priority: "normal", company: "" })
    } catch (error) {
      console.error("Contact form error:", error)
      setStatus("error")
      setFeedback(error instanceof Error ? error.message : "Unable to send message. Please try again.")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="max-w-5xl mx-auto px-4 py-16">
        <header className="text-center mb-10">
          <p className="text-primary font-semibold uppercase tracking-wide text-sm">Contact</p>
          <h1 className="text-4xl font-bold mt-2">Talk with VectoBeat</h1>
          <p className="text-foreground/70 mt-3">
            Support, sales, and partnership requests are answered by real humans within one business day.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="p-4 border border-border rounded-lg bg-card/50 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary"><Mail className="w-5 h-5" />Email</div>
            <p className="text-sm text-foreground/70">support@vectobeat.com</p>
          </div>
          <div className="p-4 border border-border rounded-lg bg-card/50 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary"><Headphones className="w-5 h-5" />Support desk</div>
            <p className="text-sm text-foreground/70">Priority care for premium plans.</p>
          </div>
          <div className="p-4 border border-border rounded-lg bg-card/50 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary"><Github className="w-5 h-5" />GitHub</div>
            <p className="text-sm text-foreground/70">Report issues or request features on our repo.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          <form onSubmit={handleSubmit} className="md:col-span-3 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-2 text-sm font-medium text-foreground/80">
                Name *
                <input
                  className="w-full rounded-md border border-border bg-card px-3 py-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground/80">
                Email *
                <input
                  type="email"
                  className="w-full rounded-md border border-border bg-card px-3 py-2"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </label>
            </div>
            <label className="space-y-2 text-sm font-medium text-foreground/80">
              Company
              <input
                className="w-full rounded-md border border-border bg-card px-3 py-2"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Company or community name"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground/80">
              Topic *
              <select
                className="w-full rounded-md border border-border bg-card px-3 py-2"
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                required
              >
                <option value="">Select a topic</option>
                <option value="support">Support</option>
                <option value="sales">Sales</option>
                <option value="partnership">Partnership</option>
                <option value="security">Security</option>
                <option value="press">Press</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground/80">
              Priority *
              <select
                className="w-full rounded-md border border-border bg-card px-3 py-2"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                required
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground/80">
              Subject
              <input
                className="w-full rounded-md border border-border bg-card px-3 py-2"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Short summary"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground/80">
              Message *
              <textarea
                className="w-full rounded-md border border-border bg-card px-3 py-3"
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:scale-[1.01] transition"
              disabled={status === "loading"}
            >
              {status === "loading" ? "Sending..." : "Send message"}
              <MessageSquare className="w-4 h-4" />
            </button>
            {feedback && (
              <p className={`text-sm ${status === "error" ? "text-destructive" : "text-primary"}`}>
                {feedback}
              </p>
            )}
          </form>

          <aside className="md:col-span-2 space-y-4">
            <div className="p-4 border border-border rounded-lg bg-card/50 flex items-start gap-3">
              <Mail className="w-5 h-5 text-primary mt-1" />
              <div>
                <p className="font-semibold">Support & Billing</p>
                <p className="text-sm text-foreground/70">support@vectobeat.com</p>
              </div>
            </div>
            <div className="p-4 border border-border rounded-lg bg-card/50 flex items-start gap-3">
              <Headphones className="w-5 h-5 text-primary mt-1" />
              <div>
                <p className="font-semibold">Priority Care</p>
                <p className="text-sm text-foreground/70">Expedited support for premium plans.</p>
              </div>
            </div>
            <div className="p-4 border border-border rounded-lg bg-card/50 flex items-start gap-3">
              <Github className="w-5 h-5 text-primary mt-1" />
              <div>
                <p className="font-semibold">GitHub</p>
                <p className="text-sm text-foreground/70">Submit issues and feature requests.</p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  )
}
