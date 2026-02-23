"use client"

import { useEffect, useState, useCallback } from "react"
import { apiClient } from "@/lib/api-client"

type BotInstance = {
  id: string
  instanceId: string
  region: string
  status: string
  lastHeartbeat: string
  meta: any | null
}

export function AdminFederationManager() {
  const [instances, setInstances] = useState<BotInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadInstances = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient<BotInstance[]>('/api/admin/federation')
      setInstances(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load instances")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInstances()
  }, [loadInstances])

  const handleDelete = async (id: string, instanceId: string) => {
    if (!window.confirm(`Delete detached instance tracking for ${instanceId}?`)) return
    try {
      await apiClient(`/api/admin/federation?id=${id}`, { method: "DELETE" })
      loadInstances()
    } catch (err) {
      alert("Failed to delete instance")
    }
  }

  const getStatusColor = (status: string, lastHeartbeat: string) => {
    const heartbeatAge = Date.now() - new Date(lastHeartbeat).getTime()
    if (heartbeatAge > 5 * 60 * 1000) return "bg-red-500/10 text-red-500" // Offline (5+ mins old)
    if (status.toLowerCase() === "online") return "bg-emerald-500/10 text-emerald-500"
    if (status.toLowerCase() === "starting") return "bg-yellow-500/10 text-yellow-500"
    return "bg-foreground/10 text-foreground/60"
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Bot Federation Network</h3>
            <p className="text-xs text-foreground/60">
              View active Bot Instances connected across the federated network.
            </p>
          </div>
          <button
            onClick={loadInstances}
            disabled={loading}
            className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
          >
            {loading ? "Refreshing…" : "Refresh List"}
          </button>
        </div>
        
        {error && <p className="text-sm text-destructive">{error}</p>}
        
        <div className="grid gap-4 mt-6">
          {instances.map(instance => (
            <div key={instance.id} className="border border-border/40 rounded-lg p-5 bg-background/50 flex flex-col md:flex-row md:items-center gap-6 justify-between transition-colors hover:border-border/60">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6 flex-1 text-sm">
                <div>
                  <p className="text-xs text-foreground/50 mb-1">Instance ID</p>
                  <p className="font-mono font-medium truncate" title={instance.instanceId}>{instance.instanceId.slice(0, 8)}...</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/50 mb-1">Type</p>
                  <p className="font-medium">
                    {instance.meta?.shardId !== undefined || instance.meta?.shards !== undefined 
                      ? `Shard ${instance.meta?.shardId ?? 'N/A'}`
                      : "Standalone"}
                  </p>
                  {instance.meta?.clusterId !== undefined && (
                    <p className="text-[10px] text-foreground/40">Cluster {instance.meta.clusterId}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-foreground/50 mb-1">Region</p>
                  <p className="font-medium flex items-center gap-2">
                    <span className="opacity-80">🌍</span> {instance.region}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-foreground/50 mb-1">Heartbeat</p>
                  <p className="font-medium" title={new Date(instance.lastHeartbeat).toLocaleString()}>
                    {new Date(instance.lastHeartbeat).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-foreground/50 mb-1">State</p>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide inline-flex ${getStatusColor(instance.status, instance.lastHeartbeat)}`}>
                    {Date.now() - new Date(instance.lastHeartbeat).getTime() > 5 * 60 * 1000 ? "OFFLINE" : instance.status}
                  </span>
                </div>
              </div>
              <div>
                <button
                  onClick={() => handleDelete(instance.id, instance.instanceId)}
                  className="px-3 py-1.5 border border-red-500/30 text-red-500 rounded text-xs hover:bg-red-500/10 transition-colors w-full md:w-auto"
                >
                  Detach
                </button>
              </div>
            </div>
          ))}
          {instances.length === 0 && !loading && (
            <div className="text-center p-8 border border-border/30 rounded-lg bg-background/30">
              <p className="text-foreground/50">No instances found in the federation network.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
