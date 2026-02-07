"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Music } from "lucide-react"
import { SiGithub } from "react-icons/si"
import { DISCORD_BOT_INVITE_URL } from "@/lib/config"

export default function CTA() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-r from-primary/20 to-secondary/20"></div>
          <div className="relative p-12 md:p-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Ready to Transform Your Server?</h2>
            <p className="text-foreground/70 text-lg mb-8 max-w-2xl mx-auto">
              Add VectoBeat to your Discord server today and give your community the music experience they deserve.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground text-base">
                <Link href={DISCORD_BOT_INVITE_URL}>
                  <Music className="w-5 h-5 mr-2" />
                  Add VectoBeat Now
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary text-primary hover:bg-primary/10 text-base bg-transparent"
              >
                <Link href="https://github.com/VectoDE/VectoBeat" target="_blank">
                  <SiGithub className="w-5 h-5 mr-2" />
                  View Documentation
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
