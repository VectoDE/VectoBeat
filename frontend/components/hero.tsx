"use client"

import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Music, Zap } from "lucide-react"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"

export default function Hero() {
  return (
    <section className="relative min-h-screen pt-20 pb-20 px-4 overflow-hidden flex items-center justify-center">
      {/* Gradient background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-30"></div>
        <div className="absolute bottom-0 left-20 w-96 h-96 bg-secondary/10 rounded-full blur-3xl opacity-30"></div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-8 animate-float-up">
          <Music className="w-4 h-4 text-primary" />
          <span className="text-sm text-primary font-medium">Premium Discord Music Bot</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-balance mb-6 text-foreground">
          Your Perfect{" "}
          <span className="text-transparent bg-clip-text bg-linear-to-r from-primary to-secondary">
            Music Companion
          </span>
        </h1>

        <p className="text-lg md:text-xl text-foreground/70 text-balance mb-8 max-w-2xl mx-auto">
          VectoBeat brings premium music streaming to your Discord server. High-quality audio, seamless playback, and
          powerful commands for the ultimate listening experience.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground text-base">
            <Link href={DISCORD_BOT_INVITE_URL}>
              <Music className="w-5 h-5 mr-2" />
              Add to Your Server
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-primary text-primary hover:bg-primary/10 text-base bg-transparent"
          >
            <Link href="https://github.com/VectoDE/VectoBeat" target="_blank">
              <Zap className="w-5 h-5 mr-2" />
              View on GitHub
            </Link>
          </Button>
        </div>

        <div className="flex justify-center">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-0 bg-linear-to-r from-primary to-secondary rounded-lg blur-lg opacity-50"></div>
            <div className="relative bg-card rounded-lg p-1">
              <Image src="/logo.png" alt="VectoBeat" width={400} height={400} className="w-full animate-pulse-glow" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
