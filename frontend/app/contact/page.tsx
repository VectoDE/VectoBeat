"use client"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { Mail, MessageSquare, Headphones, Github } from "lucide-react"
import { useState } from "react"

export default function ContactPage() {
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
        const payload = await response.json()
        throw new Error(payload.error || "Message could not be sent.")
      }
      setStatus("success")
      setFeedback("Thank you for reaching out! We will get back to you as soon as possible.")
      setForm({ name: "", email: "", subject: "", message: "", topic: "", priority: "normal", company: "" })
    } catch (error) {
      console.error("Contact form failed:", error)
      setStatus("error")
      setFeedback(error instanceof Error ? error.message : "Something went wrong. Please try again.")
    }
  }

  const contactMethods = [
    {
      icon: MessageSquare,
      title: "Discord Support Server",
      description: "Join our community Discord for instant support and to connect with other VectoBeat users",
      link: "https://discord.gg/DtHPAEHxZk",
      linkText: "Join Server",
    },
    {
      icon: Mail,
      title: "Email Support",
      description: "For detailed inquiries and support tickets, reach out to our support team",
      link: "mailto:timhauke@uplytech.de",
      linkText: "Send Email",
    },
    {
      icon: Github,
      title: "GitHub Issues",
      description: "Report bugs, suggest features, and contribute to VectoBeat&rsquo;s development",
      link: "https://github.com/VectoDE/VectoBeat/issues",
      linkText: "Visit GitHub",
    },
    {
      icon: Headphones,
      title: "Business Inquiries",
      description: "For partnerships, sponsorships, and business opportunities",
      link: "mailto:timhauke@uplytech.de",
      linkText: "Contact Sales",
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Header */}
      <section className="relative w-full pt-32 pb-20 px-4 border-b border-border overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-40" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">Get in Touch</h1>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto">
            Have questions? We&rsquo;re here to help. Choose your preferred way to reach us.
          </p>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {contactMethods.map((method, i) => {
              const IconComponent = method.icon
              return (
                <a
                  key={i}
                  href={method.link}
                  target={method.link.startsWith("http") && !method.link.startsWith("mailto:") ? "_blank" : undefined}
                  rel={
                    method.link.startsWith("http") && !method.link.startsWith("mailto:")
                      ? "noopener noreferrer"
                      : undefined
                  }
                  className="p-6 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 hover:border-primary/30 transition-all group"
                >
                  <div className="mb-4 inline-flex p-3 bg-primary/10 group-hover:bg-primary/20 rounded-lg transition-colors">
                    <IconComponent size={24} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{method.title}</h3>
                  <p className="text-foreground/70 text-sm mb-4">{method.description}</p>
                  <span className="text-primary font-semibold text-sm group-hover:gap-2 inline-flex items-center gap-1 transition-all">
                    {method.linkText} →
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      </section>

      {/* Support & SLA Details */}
      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Service Level Agreements (SLA)</h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                plan: "Standard Care (Free & Starter)",
                responseTime: "Under 24 hours",
                channel: "Email & Support Desk",
                sla: "Best effort coverage with access to the public incident feed.",
              },
              {
                plan: "Priority Care (Pro, Growth, Scale & Enterprise)",
                responseTime: "Under 4 hours (24/7)",
                channel: "Dedicated escalation channel & hotline",
                sla: "Named responder, quarterly health reviews, and proactive paging.",
              },
            ].map((tier, i) => (
              <div key={i} className="p-6 rounded-lg border border-primary/20 bg-primary/5">
                <h3 className="text-lg font-bold mb-4 text-primary">{tier.plan}</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground/60 uppercase">Response Time</p>
                    <p className="font-semibold">{tier.responseTime}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground/60 uppercase">Support Channels</p>
                    <p className="text-sm text-foreground/70">{tier.channel}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground/60 uppercase">SLA</p>
                    <p className="text-sm text-foreground/70">{tier.sla}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Issue Categories & Resolution Times */}
      <section className="w-full py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-12">Issue Categories & Resolution Times</h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                category: "Critical Issues",
                priority: "🔴 P1",
                responseTime: "Under 4 hours (Priority Care)",
                examples: ["Bot offline across regions", "Security or billing incidents", "Data integrity risks"],
              },
              {
                category: "High Priority",
                priority: "🟠 P2",
                responseTime: "Under 4 hours (Priority Care)",
                examples: ["Severe performance degradation", "Automation not triggering", "Connection instability"],
              },
              {
                category: "Medium Priority",
                priority: "🟡 P3",
                responseTime: "Within 24 hours (Standard Care)",
                examples: ["Intermittent playback issues", "Minor performance problems", "UI or workflow glitches"],
              },
              {
                category: "Low Priority",
                priority: "🟢 P4",
                responseTime: "Within 2 business days",
                examples: ["Feature requests", "Documentation improvements", "General inquiries"],
              },
            ].map((issue, i) => (
              <div key={i} className="p-6 rounded-lg border border-border/50 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-bold">{issue.category}</h3>
                  <span className="text-2xl">{issue.priority}</span>
                </div>
                <div className="mb-4 p-3 bg-primary/10 rounded text-sm font-semibold text-primary">
                  Response: {issue.responseTime}
                </div>
                <p className="text-xs font-semibold text-foreground/60 uppercase mb-2">Examples</p>
                <ul className="space-y-1">
                  {issue.examples.map((ex, j) => (
                    <li key={j} className="text-sm text-foreground/70">
                      • {ex}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Send us a Message</h2>
            <p className="text-foreground/70">We&rsquo;ll get back to you as soon as possible</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Name</label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border/50 text-foreground placeholder-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Email</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border/50 text-foreground placeholder-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Company (optional)</label>
              <input
                type="text"
                placeholder="Company or organization"
                value={form.company}
                onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border/50 text-foreground placeholder-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Subject</label>
              <input
                type="text"
                placeholder="How can we help?"
                value={form.subject}
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border/50 text-foreground placeholder-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Topic</label>
                <input
                  type="text"
                  placeholder="e.g. Billing, Incident, Feature request"
                  value={form.topic}
                  onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border/50 text-foreground placeholder-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border/50 text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                  required
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Message</label>
              <textarea
                placeholder="Tell us more..."
                rows={6}
                value={form.message}
                onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border/50 text-foreground placeholder-foreground/50 focus:outline-none focus:border-primary/50 transition-colors resize-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {status === "loading" ? "Sending..." : "Send Message"}
            </button>
            {feedback && (
              <p className={`text-sm ${status === "error" ? "text-destructive" : "text-foreground/70"}`}>{feedback}</p>
            )}
          </form>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="w-full py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Frequently Asked Questions</h2>

          <div className="space-y-6">
            {[
              {
                question: "Is there still a free tier?",
                answer:
                  "Yes. The Free plan includes the Discord bot, essential music sources, and community support. Paid tiers simply unlock premium routing, automation, and billing features.",
              },
              {
                question: "How fast does VectoBeat respond?",
                answer:
                  "Live telemetry averages sub-200ms command times thanks to our EU-hosted Lavalink v4 cluster and automatic failover.",
              },
              {
                question: "Can I change or cancel my plan anytime?",
                answer:
                  "Absolutely. Upgrades apply instantly, downgrades take effect at the end of the billing cycle, and you can cancel without penalties inside the Control Panel.",
              },
              {
                question: "Which payment methods and currency do you support?",
                answer:
                  "All pricing is denominated in EUR (€). Stripe processes major credit and debit cards, SEPA direct debit, Apple Pay, and Google Pay. Enterprise invoices can be paid via bank transfer.",
              },
              {
                question: "How do I get help if something breaks?",
                answer:
                  "Start with the Support Desk chat for real-time ticketing, or email timhauke@uplytech.de for escalations. Paid tiers include guaranteed response windows and proactive incident alerts.",
              },
              {
                question: "What do you log about our community?",
                answer:
                  "Only aggregated analytics (page views, install counts, plan status) are stored, all with hashed IPs and full GDPR controls. You can export or delete your data from the Account → Privacy tab anytime.",
              },
              {
                question: "Is there an API or webhook access?",
                answer:
                  "Starter and higher tiers receive REST + Webhook access for automation, event notifications, and billing callbacks. SDKs ship with examples for Node.js and Python.",
              },
            ].map((faq) => (
              <div key={faq.question} className="p-6 rounded-lg border border-border/50 hover:border-primary/30 transition-colors">
                <h3 className="font-semibold text-lg mb-2">{faq.question}</h3>
                <p className="text-foreground/70">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Guidelines */}
      <section className="w-full py-20 px-4 bg-card/30 border-y border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold mb-12 text-center">Community Guidelines</h2>

          <div className="space-y-6">
            {[
              {
                title: "Be Respectful",
                content:
                  "Treat all community members with respect. Harassment, discrimination, and hate speech are not tolerated and will result in immediate removal.",
              },
              {
                title: "Stay On Topic",
                content:
                  "Keep discussions relevant to VectoBeat, Discord bots, or music streaming. Off-topic discussions should be taken to appropriate channels.",
              },
              {
                title: "No Spam or Self-Promotion",
                content:
                  "Avoid excessive self-promotion, spam links, or advertising. Genuine contributions to discussions are always welcome.",
              },
              {
                title: "Search Before Asking",
                content:
                  "Before posting a question, check if it&rsquo;s already been answered in our documentation or FAQ sections.",
              },
              {
                title: "Provide Context",
                content:
                  "When reporting issues, include error messages, steps to reproduce, and your server configuration for faster resolution.",
              },
              {
                title: "Respect Privacy",
                content:
                  "Don&rsquo;t share personal information or server details publicly. Use private channels for sensitive discussions.",
              },
            ].map((guideline, i) => (
              <div key={i} className="p-6 rounded-lg border border-border/50 hover:border-primary/30 transition-colors">
                <h3 className="text-lg font-bold mb-2">{guideline.title}</h3>
                <p className="text-foreground/70">{guideline.content}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
