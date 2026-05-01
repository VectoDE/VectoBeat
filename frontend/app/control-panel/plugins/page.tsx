"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { PluginMarketplace } from "@/components/plugin-marketplace"
import { Loader2 } from "lucide-react"

function PluginMarketplaceContent() {
  const searchParams = useSearchParams()
  const guildId = searchParams?.get("guild") ?? null

  return (
    <div className="container mx-auto py-10 px-4">
      <PluginMarketplace guildId={guildId} />
    </div>
  )
}

export default function PluginMarketplacePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <PluginMarketplaceContent />
    </Suspense>
  )
}
