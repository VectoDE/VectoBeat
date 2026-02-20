"use client"

import Image from "next/image"
import Link from "next/link"
import { SiGithub } from "react-icons/si"
import { buildDiscordLoginUrl } from "@/lib/config"
import { Button } from "@/components/ui/button"

export default function Header() {
  return (
    <header className="fixed w-full top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <Image
            src="/logo.png"
            alt="VectoBeat Logo"
            width={40}
            height={40}
            className="group-hover:scale-110 transition-transform rounded-md"
          />
          <span className="text-xl font-bold text-primary hidden sm:inline">VectoBeat</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-foreground/80 hover:text-primary transition-colors">
            Features
          </Link>
          <Link href="#stats" className="text-foreground/80 hover:text-primary transition-colors">
            Stats
          </Link>
          <Link
            href="https://github.com/VectoDE/VectoBeat"
            target="_blank"
            className="text-foreground/80 hover:text-primary transition-colors"
          >
            GitHub
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-primary text-primary hover:bg-primary/10 bg-transparent"
          >
            <Link href="https://github.com/VectoDE/VectoBeat" target="_blank">
              <SiGithub className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">GitHub</span>
            </Link>
          </Button>
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Link href={buildDiscordLoginUrl("/control-panel")}>
              Login with Discord
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
