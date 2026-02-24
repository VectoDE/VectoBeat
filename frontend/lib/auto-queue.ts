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
        // 1. Try to find tracks that often follow this one (Learned Relationships)
        const recommendations = await prisma.musicRecommendation.findMany({
            where: { fromTrackId: trackId },
            orderBy: { weight: "desc" },
            take: limit,
            include: {
                toTrack: true,
            },
        })

        let results = recommendations.map((r) => r.toTrack)

        // 2. Fallback: Find tracks of the same genre
        if (results.length < limit) {
            const seedTrack = await prisma.musicTrack.findUnique({ where: { id: trackId } })
            if (seedTrack?.genre) {
                const genreTracks = await prisma.musicTrack.findMany({
                    where: {
                        genre: seedTrack.genre,
                        id: { notIn: [trackId, ...results.map(r => r.id)] },
                    },
                    orderBy: { createdAt: "desc" }, // Favor newer additions for variety
                    take: limit - results.length,
                })
                results = [...results, ...genreTracks]
            }
        }

        // 3. Deep fallback: Same artist
        if (results.length < limit) {
            const seedTrack = results.length === 0 ? await prisma.musicTrack.findUnique({ where: { id: trackId } }) : null
            const artist = results.length > 0 ? results[0].artist : seedTrack?.artist

            if (artist) {
                const artistTracks = await prisma.musicTrack.findMany({
                    where: {
                        artist: artist,
                        id: { notIn: [trackId, ...results.map(r => r.id)] }
                    },
                    take: limit - results.length
                })
                results = [...results, ...artistTracks]
            }
        }

        // 4. Final fallback: Global Popularity (Most played tracks)
        if (results.length < limit) {
            // We can approximate popularity by counting recommendations "to" these tracks
            // or just pick random tracks from the library if no playback counts exist yet.
            const popularTracks = await prisma.musicTrack.findMany({
                where: {
                    id: { notIn: [trackId, ...results.map(r => r.id)] }
                },
                orderBy: {
                    recommendationsTo: {
                        _count: "desc"
                    }
                },
                take: limit - results.length
            })
            results = [...results, ...popularTracks]
        }

        return results
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
