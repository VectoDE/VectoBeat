"use client"

import { Music, Zap, Radio, BarChart3, Users, Settings } from "lucide-react"

const features = [
  {
    icon: Music,
    title: "High-Quality Streaming",
    description: "Crystal clear audio from multiple sources with support for all major platforms.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Instant playback and seamless queue management for uninterrupted music enjoyment.",
  },
  {
    icon: Radio,
    title: "Multi-Source Support",
    description: "Stream from YouTube, Spotify, SoundCloud, and many other platforms.",
  },
  {
    icon: BarChart3,
    title: "Advanced Controls",
    description: "Full volume control, equalizer, and playback speed adjustments for perfect sound.",
  },
  {
    icon: Users,
    title: "Social Features",
    description: "Share playlists, view now playing info, and manage music collaboratively with your server.",
  },
  {
    icon: Settings,
    title: "Customizable",
    description: "Configure prefix, permissions, and features to match your server's unique needs.",
  },
]

export default function Features() {
  return (
    <section id="features" className="py-20 px-4 bg-card/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-foreground">Powerful Features</h2>
          <p className="text-foreground/70 text-lg max-w-2xl mx-auto">
            Everything you need for the ultimate music experience on Discord
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="group p-6 rounded-lg bg-background border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20"
              >
                <div className="mb-4 inline-flex p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-foreground/70">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
