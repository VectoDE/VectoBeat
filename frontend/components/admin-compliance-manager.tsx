"use client"

import { useEffect, useState, useCallback } from "react"
import { apiClient } from "@/lib/api-client"

type DataExportRequest = {
  id: string
  discordId: string
  status: string
  downloadUrl: string | null
  expiresAt: string | null
  createdAt: string
}

export function AdminComplianceManager() {
  const [requests, setRequests] = useState<DataExportRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient<DataExportRequest[]>('/api/admin/compliance/export-requests')
      setRequests(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Data Export Logs</h3>
            <p className="text-xs text-foreground/60">
              Review GDPR Trust & Safety Compliance Mode exports requested by users.
            </p>
          </div>
          <button
            onClick={loadRequests}
            disabled={loading}
            className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 muted-scroll">
          {requests.map(req => (
            <div key={req.id} className="border border-border/40 rounded-lg p-4 bg-background/70 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="font-semibold text-sm">Discord ID: {req.discordId}</p>
                <p className="text-xs text-foreground/60">Requested on: {new Date(req.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${req.status === 'completed' ? 'bg-primary/10 text-primary' : 'bg-foreground/10 text-foreground/60'}`}>
                  {req.status}
                </span>
              </div>
            </div>
          ))}
          {requests.length === 0 && !loading && (
            <p className="text-sm text-foreground/60">No compliance exports found.</p>
          )}
          {loading && (
            <p className="text-sm text-foreground/60">Loading export logs...</p>
          )}
        </div>
      </section>
    </div>
  )
}
