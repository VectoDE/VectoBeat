import { getPrismaClient, handlePrismaError } from "./prisma"

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

export type TrendEntry = { period: string; count: number }
export type ArtistTrend = { artist: string; count: number; genres: string[] }
export type Suggestion = { type: string; priority: "high" | "medium" | "low"; message: string; data?: Record<string, unknown> }

/**
 * Analyzes learning trends: genre shifts, top artists, and activity patterns.
 */
export async function analyzeTrends(guildId?: string | null, days = 30) {
    const prisma = getPrismaClient()
    if (!prisma) return null

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    try {
        const recentLogs = await prisma.musicLearningLog.findMany({
            where: {
                createdAt: { gte: since },
                ...(guildId ? { guildId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 500,
        })

        const dailyCounts = new Map<string, number>()
        for (const log of recentLogs) {
            const day = log.createdAt.toISOString().slice(0, 10)
            dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1)
        }
        const activityTrend: TrendEntry[] = Array.from(dailyCounts.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([period, count]) => ({ period, count }))

        const topArtists = await prisma.musicTrack.groupBy({
            by: ["artist"],
            where: { createdAt: { gte: since } },
            _count: { artist: true },
            orderBy: { _count: { artist: "desc" } },
            take: 10,
        })

        const artistTrends: ArtistTrend[] = []
        for (const entry of topArtists) {
            const genres = await prisma.musicTrack.findMany({
                where: { artist: entry.artist, genre: { not: null } },
                select: { genre: true },
                distinct: ["genre"],
                take: 5,
            })
            artistTrends.push({
                artist: entry.artist,
                count: entry._count.artist,
                genres: genres.map(g => g.genre).filter(Boolean) as string[],
            })
        }

        const genreTrend = await prisma.musicTrack.groupBy({
            by: ["genre"],
            where: { genre: { not: null }, createdAt: { gte: since } },
            _count: { genre: true },
            orderBy: { _count: { genre: "desc" } },
            take: 10,
        })

        return {
            period: { days, since: since.toISOString() },
            activityTrend,
            topArtists: artistTrends,
            genreDistribution: genreTrend.map(g => ({ genre: g.genre, count: g._count.genre })),
            totalLearningEvents: recentLogs.length,
        }
    } catch (error) {
        console.error("[AutoQueue] Failed to analyze trends:", error)
        handlePrismaError(error)
        return null
    }
}

/**
 * Generates improvement suggestions based on learned data.
 */
export async function getImprovementSuggestions(): Promise<Suggestion[]> {
    const prisma = getPrismaClient()
    if (!prisma) return []

    const suggestions: Suggestion[] = []

    try {
        const stats = await getAutoQueueStats()
        if (!stats) return suggestions

        if (stats.trackCount === 0) {
            suggestions.push({
                type: "bootstrap",
                priority: "high",
                message: "No tracks learned yet. Play music to start building the recommendation engine.",
            })
            return suggestions
        }

        if (stats.relationCount < stats.trackCount * 0.3) {
            suggestions.push({
                type: "coverage",
                priority: "medium",
                message: `Only ${stats.relationCount} relationships learned across ${stats.trackCount} tracks. More sequential plays will improve recommendations.`,
                data: { ratio: stats.relationCount / Math.max(stats.trackCount, 1) },
            })
        }

        const ungenred = await prisma.musicTrack.count({ where: { genre: null } })
        if (ungenred > stats.trackCount * 0.5) {
            suggestions.push({
                type: "genre_gaps",
                priority: "medium",
                message: `${ungenred} of ${stats.trackCount} tracks have no genre tag. Genre tagging improves fallback recommendations.`,
                data: { ungenred, total: stats.trackCount },
            })
        }

        const weakLinks = await prisma.musicRecommendation.count({ where: { weight: { lte: 1 } } })
        if (weakLinks > stats.relationCount * 0.8) {
            suggestions.push({
                type: "weak_links",
                priority: "low",
                message: "Most track relationships have low confidence. Repeated sequential plays strengthen recommendations.",
                data: { weakLinks, total: stats.relationCount },
            })
        }

        const orphanedTracks = await prisma.musicTrack.count({
            where: {
                recommendationsFrom: { none: {} },
                recommendationsTo: { none: {} },
            },
        })
        if (orphanedTracks > stats.trackCount * 0.3) {
            suggestions.push({
                type: "orphaned_tracks",
                priority: "medium",
                message: `${orphanedTracks} tracks are isolated (no learned relationships). These won't appear in recommendations.`,
                data: { orphanedTracks, total: stats.trackCount },
            })
        }

        if (stats.topGenres.length >= 3) {
            suggestions.push({
                type: "diversity",
                priority: "low",
                message: `Good genre diversity detected across ${stats.topGenres.length} genres. The recommendation engine can cross-pollinate.`,
                data: { genres: stats.topGenres },
            })
        }

        return suggestions
    } catch (error) {
        console.error("[AutoQueue] Failed to generate suggestions:", error)
        handlePrismaError(error)
        return suggestions
    }
}

/**
 * Returns a comprehensive learning summary for the AI dashboard.
 */
export async function getLearningSummary(guildId?: string | null) {
    const [stats, trends, suggestions, recentLogs] = await Promise.all([
        getAutoQueueStats(),
        analyzeTrends(guildId, 30),
        getImprovementSuggestions(),
        listLearningLogs(10),
    ])

    return {
        stats,
        trends,
        suggestions,
        recentActivity: recentLogs,
        status: stats && stats.trackCount > 0 ? "active" : "awaiting_data",
    }
}
