"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Download, Star, ShieldCheck, Loader2, Trash2 } from "lucide-react"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

interface Plugin {
  id: string
  name: string
  description: string | null
  version: string
  author: string
  downloads: number
  rating: number
  verified: boolean
  price: string
  installed?: boolean
}

function PluginMarketplaceContent() {
  const searchParams = useSearchParams()
  const guildId = searchParams?.get("guild")
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const url = guildId ? `/api/plugins?guildId=${guildId}` : "/api/plugins"
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load plugins")
        return res.json()
      })
      .then((data) => {
        setPlugins(data)
      })
      .catch((err) => {
        console.error(err)
      })
      .finally(() => setLoading(false))
  }, [guildId])

  const handleAction = async (pluginId: string, action: "install" | "uninstall") => {
    if (!guildId) {
        alert("Please select a server first.")
        return
    }
    setProcessing(pluginId)
    try {
      const res = await fetch("/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginId, guildId, action })
      })
      
      if (!res.ok) throw new Error(`${action} failed`)
      
      // Update local state
      setPlugins(prev => prev.map(p => 
        p.id === pluginId 
            ? { ...p, installed: action === "install" } 
            : p
      ))
      
      // alert(`Plugin ${action}ed successfully`)
    } catch (error) {
      console.error(error)
       alert(`Error ${action}ing plugin`)
    } finally {
      setProcessing(null)
    }
  }

  const filteredPlugins = plugins.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plugin Marketplace</h1>
          <p className="text-muted-foreground mt-1">
            Extend VectoBeat with community and official plugins.
            {guildId && <span className="ml-2 bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">Server Selected</span>}
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search plugins..." 
            className="pl-9" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {!guildId && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 p-4 rounded-lg mb-6">
            Please select a server in the Control Panel to install plugins.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlugins.map((plugin) => (
            <Card key={plugin.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{plugin.name}</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>v{plugin.version}</span>
                      <span>by {plugin.author}</span>
                    </div>
                  </div>
                  {plugin.verified && (
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Verified
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground mb-4">
                  {plugin.description || "No description available."}
                </p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center">
                        <Download className="h-4 w-4 mr-1" />
                        {plugin.downloads}
                    </div>
                    <div className="flex items-center">
                        <Star className="h-4 w-4 mr-1 fill-yellow-500 text-yellow-500" />
                        {plugin.rating}
                    </div>
                    <div className="font-medium text-foreground">
                        {plugin.price}
                    </div>
                </div>
              </CardContent>
              <CardFooter>
                {plugin.installed ? (
                    <Button 
                        variant="outline" 
                        className="w-full border-red-500/20 hover:bg-red-500/10 hover:text-red-500"
                        disabled={!!processing || !guildId}
                        onClick={() => handleAction(plugin.id, "uninstall")}
                    >
                        {processing === plugin.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Uninstall
                    </Button>
                ) : (
                    <Button 
                        className="w-full"
                        disabled={!!processing || !guildId}
                        onClick={() => handleAction(plugin.id, "install")}
                    >
                        {processing === plugin.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <Download className="h-4 w-4 mr-2" />
                        )}
                        Install
                    </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PluginMarketplace() {
    return (
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <PluginMarketplaceContent />
        </Suspense>
    )
}
