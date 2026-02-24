"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Music, Zap, Brain, TrendingUp, History, Info } from "lucide-react"
import { shortNumber } from "@/lib/utils" // Assuming this exists or I'll use local helper
import { formatDistanceToNow } from "date-fns"

interface AutoQueueStats {
  trackCount: number
  relationCount: number
  logCount: number
  topGenres: Array<{ genre: string; count: number }>
}

interface LearningLog {
  id: string
  event: string
  details: string
  createdAt: string
}

export function AdminAutoQueuePanel() {
  const [stats, setStats] = useState<AutoQueueStats | null>(null)
  const [logs, setLogs] = useState<LearningLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const resp = await fetch("/api/admin/auto-queue")
      if (!resp.ok) throw new Error("Failed to fetch")
      const data = await resp.json()
      setStats(data.stats)
      setLogs(data.logs)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6 text-center text-red-600">
          <Info className="mx-auto mb-2 h-8 w-8" />
          <p>{error}</p>
          <button 
            onClick={() => { setLoading(true); fetchData(); }}
            className="mt-4 text-sm font-medium underline"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Learned Tracks</CardTitle>
            <Music className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shortNumber(stats?.trackCount || 0)}</div>
            <p className="text-xs text-muted-foreground">Unique tracks in DB</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Relationships</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shortNumber(stats?.relationCount || 0)}</div>
            <p className="text-xs text-muted-foreground">Weighted track pairs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Learning Events</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shortNumber(stats?.logCount || 0)}</div>
            <p className="text-xs text-muted-foreground">Total insights captured</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Genre</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {stats?.topGenres?.[0]?.genre || "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Most frequent pattern</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Recent Learning History
            </CardTitle>
            <CardDescription>
              Latest insights gained from telemetry events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant={log.event === "learned_relation" ? "outline" : "secondary"}>
                          {log.event.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm">
                        {log.details}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.createdAt))} ago
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                      No learning events yet. Play some music!
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Top Learned Genres</CardTitle>
            <CardDescription>Distribution of identified track genres</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.topGenres && stats.topGenres.length > 0 ? (
                stats.topGenres.map((g, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{g.genre || "Unknown"}</span>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-secondary">
                        <div 
                           className="h-1.5 rounded-full bg-primary" 
                           style={{ width: `${Math.min(100, (g.count / stats.trackCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">{shortNumber(g.count)} tracks</span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                   Waiting for more data...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
