export interface QueueTrackSummary {
  title: string
  author: string
  duration: number
  uri?: string | null
  artworkUrl?: string | null
  source?: string | null
  requester?: string | null
}

export interface QueueSnapshot {
  guildId: string
  updatedAt: string
  reason?: string
  metadata?: Record<string, any> | null
  paused: boolean
  volume: number | null
  nowPlaying: QueueTrackSummary | null
  queue: QueueTrackSummary[]
}
