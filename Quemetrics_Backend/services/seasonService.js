const { League, LeaguePlayer, AuditLog, Player } = require("../models");

/**
 * Archive a completed league
 * @param {string} leagueId
 */
async function archiveLeague(leagueId) {
    try {
        const league = await League.findByPk(leagueId);
        if (!league) {
            throw new Error("League not found");
        }

        // Archive the league
        const updated = await league.update({
            status: 'completed'
        });

        console.log(`[seasonService] League ${leagueId} archived successfully`);
        return updated;
    } catch (error) {
        console.error(`[seasonService] Error archiving league:`, error);
        throw error;
    }
}

/**
 * Carry over ranking points from current season to next season
 * Used when a league is repeating with carryover enabled
 * @param {string} currentLeagueId
 * @param {string} nextLeagueId
 */
async function carryOverPoints(currentLeagueId, nextLeagueId) {
    try {
        const currentLeague = await League.findByPk(currentLeagueId);
        const nextLeague = await League.findByPk(nextLeagueId);

        if (!currentLeague || !nextLeague) {
            throw new Error("One or both leagues not found");
        }

        // Get advanced settings to verify carryover is enabled
        let advanced = currentLeague.advanced || {};
        if (typeof advanced === 'string') {
            try { advanced = JSON.parse(advanced); } catch { advanced = {}; }
        }

        if (!advanced.carryRanking) {
            throw new Error("Carryover not enabled for this league");
        }

        // Get all players from current league sorted by ranking
        const currentPlayers = await LeaguePlayer.findAll({
            where: { leagueId: currentLeagueId },
            order: [['points', 'DESC']]
        });

        const carryOverData = {};
        for (const player of currentPlayers) {
            // Find the same player in next league
            const nextPlayer = await LeaguePlayer.findOne({
                where: {
                    leagueId: nextLeagueId,
                    playerId: player.playerId
                }
            });

            if (nextPlayer) {
                // Add carried points as bonus in next season
                const bonusPoints = player.points || 0;
                await nextPlayer.update({
                    bonusPoints: (nextPlayer.bonusPoints || 0) + bonusPoints
                });

                carryOverData[player.playerId] = {
                    carriedPoints: bonusPoints,
                    rank: currentPlayers.indexOf(player) + 1
                };
            }
        }

        console.log(`[seasonService] Carried over points for ${Object.keys(carryOverData).length} players from ${currentLeagueId} to ${nextLeagueId}`);
        return carryOverData;
    } catch (error) {
        console.error(`[seasonService] Error carrying over points:`, error);
        throw error;
    }
}

/**
 * Reset seasonal stats while keeping lifetime records
 * @param {string} leagueId
 */
async function resetSeasonalStats(leagueId) {
    try {
        const league = await League.findByPk(leagueId);
        if (!league) {
            throw new Error("League not found");
        }

        // Get advanced settings to verify reset is enabled
        let advanced = league.advanced || {};
        if (typeof advanced === 'string') {
            try { advanced = JSON.parse(advanced); } catch { advanced = {}; }
        }

        const resetStats = advanced.resetStats !== false; // Default to true
        const keepLifetime = advanced.keepLifetime !== false; // Default to true

        // Get all players and reset their seasonal stats
        const players = await LeaguePlayer.findAll({
            where: { leagueId }
        });

        const resetData = {};
        for (const player of players) {
            // If keepLifetime is enabled, store current stats in a JSON field first
            let lifetimeStats = [];
            if (keepLifetime) {
                lifetimeStats = player.lifetimeStats || [];
                if (!Array.isArray(lifetimeStats)) {
                    try {
                        lifetimeStats = JSON.parse(lifetimeStats) || [];
                    } catch {
                        lifetimeStats = [];
                    }
                }

                // Add current season to lifetime records
                lifetimeStats.push({
                    season: league.gameSeasonId || 'unknown',
                    matchesPlayed: player.matchesPlayed,
                    matchesWon: player.matchesWon,
                    matchesLost: player.matchesLost,
                    draws: player.draws,
                    framesWon: player.framesWon,
                    framesLost: player.framesLost,
                    points: player.points,
                    highestBreak: player.highestBreak,
                    date: new Date()
                });
            }

            // Reset seasonal stats (but keep bonusPoints if carryover was applied)
            const updateData = resetStats ? {
                matchesPlayed: 0,
                matchesWon: 0,
                matchesLost: 0,
                draws: 0,
                framesWon: 0,
                framesLost: 0,
                frameDifference: 0,
                whitewashes: 0,
                points: 0,
                participationPoints: 0,
                // Keep bonusPoints from carryover
                winPercentage: 0,
                streak: '-'
            } : {};

            if (keepLifetime) {
                updateData.lifetimeStats = JSON.stringify(lifetimeStats);
            }

            await player.update(updateData);

            resetData[player.playerId] = {
                seasonalStatsReset: resetStats,
                lifetimeRecorded: keepLifetime,
                lifetimeSeasons: keepLifetime ? lifetimeStats.length : 0
            };
        }

        console.log(`[seasonService] Reset stats for ${players.length} players in league ${leagueId}`);
        return resetData;
    } catch (error) {
        console.error(`[seasonService] Error resetting seasonal stats:`, error);
        throw error;
    }
}

/**
 * Check and process leagues that have reached their end date
 * Called periodically (e.g., daily via cron job)
 */
async function processSeasonEndDates() {
    try {
        const now = new Date();

        // Find all active leagues that have passed their end date
        const expiredLeagues = await League.findAll({
            where: {
                status: 'active',
                leagueEndDate: {
                    [require('sequelize').Op.lte]: now
                }
            }
        });

        const processed = [];
        for (const league of expiredLeagues) {
            let advanced = league.advanced || {};
            if (typeof advanced === 'string') {
                try { advanced = JSON.parse(advanced); } catch { advanced = {}; }
            }

            // Archive if enabled
            if (advanced.seasonEnd === 'archive') {
                await archiveLeague(league.id);
                processed.push({
                    leagueId: league.id,
                    action: 'archived',
                    leagueName: league.name
                });
            }
        }

        if (processed.length > 0) {
            console.log(`[seasonService] Processed ${processed.length} expired leagues`);
        }

        return processed;
    } catch (error) {
        console.error(`[seasonService] Error processing season end dates:`, error);
        return [];
    }
}

/**
 * Get lifetime statistics for a player across all seasons
 * @param {string} playerId
 */
async function getPlayerLifetimeStats(playerId) {
    try {
        // Get all league participations for this player
        const leaguePlayers = await LeaguePlayer.findAll({
            where: { playerId },
            include: [
                { model: League, as: 'league', attributes: ['id', 'name', 'gameSeasonId'] }
            ]
        });

        const lifetimeStats = {
            playerId,
            totalLeagues: leaguePlayers.length,
            totalMatchesPlayed: 0,
            totalWins: 0,
            totalLosses: 0,
            totalDraws: 0,
            totalFramesWon: 0,
            totalFramesLost: 0,
            highestBreak: 0,
            seasons: []
        };

        for (const lp of leaguePlayers) {
            const stats = {
                leagueId: lp.leagueId,
                leagueName: lp.league?.name,
                season: lp.league?.gameSeasonId,
                matchesPlayed: lp.matchesPlayed,
                matchesWon: lp.matchesWon,
                matchesLost: lp.matchesLost,
                draws: lp.draws,
                framesWon: lp.framesWon,
                framesLost: lp.framesLost,
                points: lp.points
            };

            lifetimeStats.seasons.push(stats);
            lifetimeStats.totalMatchesPlayed += lp.matchesPlayed || 0;
            lifetimeStats.totalWins += lp.matchesWon || 0;
            lifetimeStats.totalLosses += lp.matchesLost || 0;
            lifetimeStats.totalDraws += lp.draws || 0;
            lifetimeStats.totalFramesWon += lp.framesWon || 0;
            lifetimeStats.totalFramesLost += lp.framesLost || 0;
            lifetimeStats.highestBreak = Math.max(lifetimeStats.highestBreak, lp.highestBreak || 0);
        }

        return lifetimeStats;
    } catch (error) {
        console.error(`[seasonService] Error getting lifetime stats:`, error);
        throw error;
    }
}

module.exports = {
    archiveLeague,
    carryOverPoints,
    resetSeasonalStats,
    processSeasonEndDates,
    getPlayerLifetimeStats
};
