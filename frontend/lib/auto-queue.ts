import { getPrismaClient, handlePrismaError } from "./prisma"
import type { Prisma } from "@prisma/client"

export type TrackMetadata = {
    title: string
    artist: string
    genre?: string
    source?: string
    sourceId?: string
    duration?: number
    album?: string
    thumbnail?: string
}

/**
 * Records a track playback event and updates learning data.
 * @param current Metadata of the track that just started.
 * @param previous Metadata of the track that played immediately before (optional).
 * @param guildId Discord Guild ID (optional).
 */
export async function recordTrackPlayback(
    current: TrackMetadata,
    previous?: TrackMetadata | null,
    guildId?: string | null,
) {
    const prisma = getPrismaClient()
    if (!prisma) return

    try {
        // 1. Ensure current track exists in DB
        const currentTrack = await prisma.musicTrack.upsert({
            where: {
                source_sourceId: {
                    source: current.source || "unknown",
                    sourceId: current.sourceId || current.title + current.artist,
                },
            },
            update: {
                title: current.title,
                artist: current.artist,
                genre: current.genre || undefined,
                metadata: current as any,
            },
            create: {
                title: current.title,
                artist: current.artist,
                genre: current.genre,
                source: current.source || "unknown",
                sourceId: current.sourceId || current.title + current.artist,
                metadata: current as any,
            },
        })

        // 2. If there's a previous track, record the relationship
        if (previous) {
            const prevTrack = await prisma.musicTrack.findUnique({
                where: {
                    source_sourceId: {
                        source: previous.source || "unknown",
                        sourceId: previous.sourceId || previous.title + previous.artist,
                    },
                },
            })

            if (prevTrack) {
                await prisma.musicRecommendation.upsert({
                    where: {
                        fromTrackId_toTrackId: {
                            fromTrackId: prevTrack.id,
                            toTrackId: currentTrack.id,
                        },
                    },
                    update: {
                        weight: { increment: 1.0 },
                        lastPlayedAt: new Date(),
                    },
                    create: {
                        fromTrackId: prevTrack.id,
                        toTrackId: currentTrack.id,
                        weight: 1.0,
                        lastPlayedAt: new Date(),
                    },
                })

                // Log the learning event
                await prisma.musicLearningLog.create({
                    data: {
                        guildId,
                        event: "learned_relation",
                        details: `Learned relationship: "${prevTrack.title}" -> "${currentTrack.title}"`,
                    },
                })
            }
        }

        // 3. Update genre if it was missing and now present
        if (current.genre && !currentTrack.genre) {
            await prisma.musicLearningLog.create({
                data: {
                    guildId,
                    event: "identified_genre",
                    details: `Identified genre for "${currentTrack.title}": ${current.genre}`,
                },
            })
        }

    } catch (error) {
        console.error("[AutoQueue] Failed to record playback:", error)
        handlePrismaError(error)
    }
}

/**
 * Gets recommended tracks based on a seed track.
 */
export async function getRecommendedTracks(trackId: string, limit = 5) {
    const prisma = getPrismaClient()
    if (!prisma) return []

    try {
        // 1. Try to find tracks that often follow this one
        const recommendations = await prisma.musicRecommendation.findMany({
            where: { fromTrackId: trackId },
            orderBy: { weight: "desc" },
            take: limit,
            include: {
                toTrack: true,
            },
        })

        if (recommendations.length > 0) {
            return recommendations.map((r) => r.toTrack)
        }

        // 2. Fallback: Find tracks of the same genre
        const seedTrack = await prisma.musicTrack.findUnique({ where: { id: trackId } })
        if (seedTrack?.genre) {
            return prisma.musicTrack.findMany({
                where: {
                    genre: seedTrack.genre,
                    id: { not: trackId },
                },
                orderBy: { createdAt: "desc" },
                take: limit,
            })
        }

        // 3. Deep fallback: Same artist
        if (seedTrack?.artist) {
            return prisma.musicTrack.findMany({
                where: {
                    artist: seedTrack.artist,
                    id: { not: trackId }
                },
                take: limit
            })
        }

        return []
    } catch (error) {
        console.error("[AutoQueue] Failed to get recommendations:", error)
        handlePrismaError(error)
        return []
    }
}

/**
 * Lists recent learning events for the admin UI.
 */
export async function listLearningLogs(limit = 50) {
    const prisma = getPrismaClient()
    if (!prisma) return []

    try {
        return prisma.musicLearningLog.findMany({
            orderBy: { createdAt: "desc" },
            take: limit,
        })
    } catch (error) {
        console.error("[AutoQueue] Failed to list learning logs:", error)
        handlePrismaError(error)
        return []
    }
}

/**
 * Gets general Auto Queue statistics.
 */
export async function getAutoQueueStats() {
    const prisma = getPrismaClient()
    if (!prisma) return null

    try {
        const [trackCount, relationCount, logCount] = await Promise.all([
            prisma.musicTrack.count(),
            prisma.musicRecommendation.count(),
            prisma.musicLearningLog.count()
        ])

        const topGenres = await prisma.musicTrack.groupBy({
            by: ["genre"],
            where: { genre: { not: null } },
            _count: { genre: true },
            orderBy: { _count: { genre: "desc" } },
            take: 5
        })

        return {
            trackCount,
            relationCount,
            logCount,
            topGenres: topGenres.map(g => ({ genre: g.genre, count: g._count.genre }))
        }
    } catch (error) {
        console.error("[AutoQueue] Failed to get stats:", error)
        handlePrismaError(error)
        return null
    }
}
