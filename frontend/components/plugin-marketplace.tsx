"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Download, Star, ShieldCheck, Loader2, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"

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

interface PluginMarketplaceProps {
  guildId: string | null
}

export function PluginMarketplace({ guildId }: PluginMarketplaceProps) {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    // If no guild selected, we can still fetch plugins, but without installation status
    const url = guildId ? `/api/plugins?guildId=${guildId}` : "/api/plugins"
    setLoading(true)
    apiClient<Plugin[]>(url)
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
      // Should not happen if button is disabled, but good safety check
      return
    }
    setProcessing(pluginId)
    try {
      await apiClient<any>("/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginId, guildId, action }),
      })

      // Update local state
      setPlugins((prev) =>
        prev.map((p) => (p.id === pluginId ? { ...p, installed: action === "install" } : p)),
      )
    } catch (error) {
      console.error(error)
      // Ideally show a toast notification here
    } finally {
      setProcessing(null)
    }
  }

  const filteredPlugins = plugins.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Plugin Marketplace</h2>
          <p className="text-muted-foreground mt-1">
            Extend VectoBeat with community and official plugins.
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
        <div className="bg-primary/5 border border-primary/20 text-primary p-4 rounded-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <span>Select a server from the settings tab to manage installations.</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlugins.map((plugin) => (
            <Card key={plugin.id} className="flex flex-col border-border/50 bg-card/40">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{plugin.name}</CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>v{plugin.version}</span>
                      <span>•</span>
                      <span>{plugin.author}</span>
                    </div>
                  </div>
                  {plugin.verified && (
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[10px] h-5">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Verified
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                  {plugin.description || "No description available."}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center">
                    <Download className="h-3 w-3 mr-1" />
                    {plugin.downloads}
                  </div>
                  <div className="flex items-center">
                    <Star className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-500" />
                    {plugin.rating}
                  </div>
                  <div className="font-medium text-foreground ml-auto">
                    {plugin.price}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                {plugin.installed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-red-500/20 hover:bg-red-500/10 hover:text-red-500 text-red-500/80"
                    disabled={!!processing || !guildId}
                    onClick={() => handleAction(plugin.id, "uninstall")}
                  >
                    {processing === plugin.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-3 w-3 mr-2" />
                    )}
                    Uninstall
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!!processing || !guildId}
                    onClick={() => handleAction(plugin.id, "install")}
                  >
                    {processing === plugin.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    ) : (
                      <Download className="h-3 w-3 mr-2" />
                    )}
                    Install
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
          {filteredPlugins.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No plugins found matching your search.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
