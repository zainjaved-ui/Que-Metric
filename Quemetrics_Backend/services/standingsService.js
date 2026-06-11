const {
    MatchResult,
    LeaguePlayer,
    League,
    Player
} = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");

/**
 * Recalculate and update standings for a league
 * @param {string} leagueId 
 */
async function updateLeagueStandings(leagueId) {
    console.log(`[standingsService] Updating standings for league: ${leagueId}`);

    // 1. Fetch League configuration
    const league = await League.findByPk(leagueId);
    if (!league) {
        console.error(`[standingsService] League not found: ${leagueId}`);
        return;
    }

    // Parse Points System and Tie-Break Priority
    let pointsSystem = league.pointsSystem || {};
    if (typeof pointsSystem === 'string') {
        try { pointsSystem = JSON.parse(pointsSystem); } catch (e) { pointsSystem = {}; }
    }

    let tieBreakPriority = league.tieBreakPriority || [
        'headToHead', 'frameDifference', 'framesWon', 'highestBreak', 'wins', 'winPercentage', 'random'
    ];
    if (typeof tieBreakPriority === 'string') {
        try { tieBreakPriority = JSON.parse(tieBreakPriority); } catch (e) { tieBreakPriority = []; }
    }

    // Auto-inject swissRanking for Swiss format if not present
    const leagueStructure = typeof league.structure === 'string' ? JSON.parse(league.structure || '{}') : (league.structure || {});
    if (leagueStructure.format === 'swiss' && !tieBreakPriority.includes('swissRanking')) {
        // Insert after headToHead or at the beginning
        const headToHeadIdx = tieBreakPriority.indexOf('headToHead');
        if (headToHeadIdx !== -1) {
            tieBreakPriority.splice(headToHeadIdx + 1, 0, 'swissRanking');
        } else {
            tieBreakPriority.unshift('swissRanking');
        }
    }

    let advanced = league.advanced || {};
    if (typeof advanced === 'string') {
        try { advanced = JSON.parse(advanced); } catch (e) { advanced = {}; }
    }

    // 2. Fetch all confirmed match results for this league
    const results = await MatchResult.findAll({
        where: {
            leagueId,
            resultStatus: {
                [Op.or]: [
                    sequelize.where(sequelize.fn('LOWER', sequelize.col('resultStatus')), 'confirmed'),
                    sequelize.where(sequelize.fn('LOWER', sequelize.col('resultStatus')), 'completed')
                ]
            }
        }
    });

    // 2b. Fetch bye fixtures (status='bye') for already active rounds only
    const { Fixture } = require('../models');
    const byes = await Fixture.findAll({
        where: {
            leagueId,
            status: 'bye',
            round: { [Op.lte]: league.currentRound } // only count byes in started rounds
        }
    });

    // 3. Fetch all approved players in the league
    const leaguePlayers = await LeaguePlayer.findAll({
        where: { leagueId, approvalStatus: 'approved' }
    });

    // Initialize/Reset player stats map
    const statsMap = {};
    leaguePlayers.forEach(lp => {
        statsMap[lp.playerId] = {
            matchesPlayed: 0,
            matchesWon: 0,
            matchesLost: 0,
            draws: 0,
            walkoverWins: 0, // Track walkover wins separately
            walkoverLosses: 0, // Track walkover losses separately
            framesWon: 0,
            framesLost: 0,
            whitewashes: 0,
            highestBreak: 0,
            points: 0,
            participationPoints: 0,
            bonusPoints: 0,
            divisionId: lp.divisionId,
            status: lp.status, // Track player status
            manualPointsAdjustment: lp.manualPointsAdjustment || 0, // Track manual adjustments
            leaguePlayerId: lp.id, // Track for debugging
            headToHead: {}, // To store results against other players: { opponentId: points }
            matchHistory: [], // To store match outcomes for streak calculation: [{ date: Date, result: 'W'|'L'|'D'|'WO' }]
            breaks50Plus: 0,
            breaks100Plus: 0,
            ballsPotted: 0,
            ballsConceded: 0,
            sevenBallWins: 0,
            blackFinishes: 0,
            whitewashWins: 0,
            opponents: [], // Track opponent IDs for Swiss tie-breaks
            swissTieBreakScore: 0 // Store calculated Swiss score
        };
        if (lp.manualPointsAdjustment && lp.manualPointsAdjustment !== 0) {
            console.log(`[standingsService DEBUG] Player ${lp.playerId} has manualPointsAdjustment = ${lp.manualPointsAdjustment}`);
        }
    });

    // 4. Process each match result
    results.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // Sort by date to calculate streaks correctly

    for (const result of results) {
        const {
            player1Id, player2Id, winnerId,
            player1Frames, player2Frames,
            player1RackWins, player2RackWins,
            snookerFrameDetails, poolRackDetails, pookerFrameDetails,
            isWalkover,
            highestBreak, breaks50Plus, breaks100Plus,
            player1BallsPotted, player2BallsPotted,
            player1SevenBallWins, player2SevenBallWins,
            player1BlackFinishes, player2BlackFinishes,
            player1WhitewashWins, player2WhitewashWins
        } = result;

        const p1 = statsMap[player1Id];
        const p2 = statsMap[player2Id];

        if (!p1 || !p2) continue;

        // Parse rData EARLY so we can check if it's an explicit withdrawal auto-loss/whitewash
        let rData = {};
        try {
            if (result.notes && result.notes.startsWith('{')) {
                rData = JSON.parse(result.notes);
            }
        } catch (e) { }

        const isWalkoverMatch = rData?.isWalkover || rData?.isManualWalkover || result.isWalkover === true || result.isWalkover === 1;
        let withdrawalRule = rData?.withdrawalRule;

        // Fallback for older walkover records that did not embed JSON
        if (!withdrawalRule && isWalkoverMatch && result.notes === 'Automated bye due to player withdrawal.') {
            if (p1.status === 'withdrawn' || p2.status === 'withdrawn') {
                withdrawalRule = 'whitewash';
            }
        }

        // Note: 'voidAll' behavior is handled at the very end of this calculation by zeroing out the withdrawn player's final stats, 
        // to ensure active opponents keep their points from those historical games as requested by the user.

        // Participation Points - SKIP for walkovers
        if (pointsSystem.bonuses?.participation && !isWalkoverMatch) {
            const pPoints = pointsSystem.bonuses.participationValue || 1; // Default to 1 if not specified
            p1.participationPoints += pPoints;
            p2.participationPoints += pPoints;
            p1.points += pPoints;
            p2.points += pPoints;
        }

        // For ALL matches (regular and walkovers), increment matches played
        p1.matchesPlayed += 1;
        p2.matchesPlayed += 1;

        // 4b. Aggregate Frames/Racks Won (Base Stats) - SKIP for walkovers
        const leagueSport = String(league.sport).toLowerCase();
        const f1 = (leagueSport === 'pool' ? result.player1RackWins : result.player1Frames) || 0;
        const f2 = (leagueSport === 'pool' ? result.player2RackWins : result.player2Frames) || 0;

        if (!isWalkoverMatch) {
            p1.framesWon += f1;
            p1.framesLost += f2;
            p2.framesWon += f2;
            p2.framesLost += f1;
        }

        // Apply frames as points if configured - SKIP for walkovers
        let matchRules = {};
        try {
            if (league.matchRules) {
                matchRules = typeof league.matchRules === 'string' ? JSON.parse(league.matchRules) : league.matchRules;
            }
        } catch (e) {
            console.warn('[standingsService] Failed to parse matchRules:', e.message);
        }

        if (matchRules.scoreDetail === 'points' && !isWalkoverMatch) {
            p1.points += f1;
            p2.points += f2;
        }

        // 4c. Sport-Specific Granular Stats & High-Break Attribution - SKIP for walkovers
        let p1MatchHighBreak = 0;
        let p2MatchHighBreak = 0;

        if (!isWalkoverMatch) {
            // Try to find player-specific high breaks in the frame/rack details (more precise)
            const frameDetails = result.snookerFrameDetails || result.poolRackDetails || result.pookerFrameDetails;
            if (Array.isArray(frameDetails)) {
                frameDetails.forEach(f => {
                    // Check both standard field names used across the system
                    const b1 = parseInt(f.player1Break || f.player1HighestBreak || 0);
                    const b2 = parseInt(f.player2Break || f.player2HighestBreak || 0);
                    p1MatchHighBreak = Math.max(p1MatchHighBreak, b1);
                    p2MatchHighBreak = Math.max(p2MatchHighBreak, b2);
                });
            }

            // Fallback: If no frame-levels details were found, but the match says there was a high break,
            // we attribute it to the player who won more frames if we can't be sure.
            if (p1MatchHighBreak === 0 && p2MatchHighBreak === 0 && result.highestBreak > 0) {
                if (f1 > f2) p1MatchHighBreak = result.highestBreak;
                else if (f2 > f1) p2MatchHighBreak = result.highestBreak;
                else {
                    // True tie-break situation or shared match-stat fallback
                    p1MatchHighBreak = result.highestBreak;
                    p2MatchHighBreak = result.highestBreak;
                }
            }

            p1.highestBreak = Math.max(p1.highestBreak, p1MatchHighBreak);
            p2.highestBreak = Math.max(p2.highestBreak, p2MatchHighBreak);

            // --- NEW: AWARD BREAK-OVER-X BONUS POINTS ---
            if (pointsSystem.bonuses?.breakOverX) {
                const threshold = Number(pointsSystem.bonuses.breakValue) || 50;
                const bPoints = Number(pointsSystem.bonuses.breakPoints) || 1;

                if (p1MatchHighBreak >= threshold) {
                    p1.points += bPoints;
                    p1.bonusPoints += bPoints;
                }
                if (p2MatchHighBreak >= threshold) {
                    p2.points += bPoints;
                    p2.bonusPoints += bPoints;
                }
            }

            const resSport = String(result.sport || '').toLowerCase().trim();
            if (resSport === 'snooker') {
                p1.breaks50Plus += (result.player1Id === player1Id ? (result.breaks50Plus || 0) : 0);
                p1.breaks100Plus += (result.player1Id === player1Id ? (result.breaks100Plus || 0) : 0);
                p2.breaks50Plus += (result.player2Id === player2Id ? (result.breaks50Plus || 0) : 0);
                p2.breaks100Plus += (result.player2Id === player2Id ? (result.breaks100Plus || 0) : 0);
            } else if (resSport === 'pool') {
                p1.ballsPotted += (result.player1BallsPotted || 0);
                p1.ballsConceded += (result.player2BallsPotted || 0);
                p2.ballsPotted += (result.player2BallsPotted || 0);
                p2.ballsConceded += (result.player1BallsPotted || 0);
                p1.sevenBallWins += (result.player1SevenBallWins || 0);
                p2.sevenBallWins += (result.player2SevenBallWins || 0);
            } else if (resSport === 'pooker') {
                p1.ballsPotted += (result.player1BallsPotted || 0);
                p1.ballsConceded += (result.player2BallsPotted || 0);
                p2.ballsPotted += (result.player2BallsPotted || 0);
                p2.ballsConceded += (result.player1BallsPotted || 0);
                p1.blackFinishes += (result.player1BlackFinishes || 0);
                p2.blackFinishes += (result.player2BlackFinishes || 0);
                p1.sevenBallWins += (result.player1SevenBallWins || 0);
                p2.sevenBallWins += (result.player2SevenBallWins || 0);
                p1.whitewashWins += (result.player1WhitewashWins || 0);
                p2.whitewashWins += (result.player2WhitewashWins || 0);
            }
        }

        // Track opponents for Swiss - SKIP for walkovers
        if (!isWalkoverMatch) {
            p1.opponents.push(player2Id);
            p2.opponents.push(player1Id);
        }

        // Get handicap adjustments if enabled - SKIP for walkovers
        let p1HandicapBonus = 0;
        let p2HandicapBonus = 0;
        if (matchRules?.handicap?.enabled && !isWalkoverMatch) {
            try {
                const p1LeaguePlayer = await LeaguePlayer.findOne({
                    where: { leagueId: league.id, playerId: player1Id },
                    attributes: ['handicap'],
                });
                const p2LeaguePlayer = await LeaguePlayer.findOne({
                    where: { leagueId: league.id, playerId: player2Id },
                    attributes: ['handicap'],
                });
                p1HandicapBonus = p1LeaguePlayer?.handicap || 0;
                p2HandicapBonus = p2LeaguePlayer?.handicap || 0;
            } catch (e) {
                console.warn('[standingsService] Failed to fetch handicap:', e.message);
            }
        }

        // Winner/Loser/Draw Logic
        if (!winnerId) {
            // Draw - SKIP for walkovers
            if (!isWalkoverMatch) {
                p1.draws += 1;
                p2.draws += 1;
                const dPoints = pointsSystem.draw ?? 1;
                p1.points += dPoints + p1HandicapBonus;
                p2.points += dPoints + p2HandicapBonus;
                p1.headToHead[player2Id] = (p1.headToHead[player2Id] || 0) + dPoints;
                p2.headToHead[player1Id] = (p2.headToHead[player1Id] || 0) + dPoints;
                if (p1HandicapBonus > 0) p1.bonusPoints += p1HandicapBonus;
                if (p2HandicapBonus > 0) p2.bonusPoints += p2HandicapBonus;
                p1.matchHistory.push({ date: result.createdAt, outcome: 'D' });
                p2.matchHistory.push({ date: result.createdAt, outcome: 'D' });
            }
        } else {
            const isP1Winner = winnerId === player1Id;
            const winner = isP1Winner ? p1 : p2;
            const loser = isP1Winner ? p2 : p1;
            const winnerIdStr = isP1Winner ? player1Id : player2Id;
            const loserIdStr = isP1Winner ? player2Id : player1Id;

            // For ALL matches (regular and walkovers), increment match wins/losses
            // This ensures walkovers count towards total match records
            winner.matchesWon += 1;
            loser.matchesLost += 1;

            // Track walkover wins/losses separately for detailed reporting
            if (isWalkoverMatch) {
                if (!['whitewash', 'forfeit'].includes(withdrawalRule)) {
                    winner.walkoverWins += 1;
                    loser.walkoverLosses += 1;
                }

                // Only push WO records to history if they are standard walkovers
                // We DO NOT update streak history for auto-withdrawals based on user request ('in standing table streak not update')
                if (!['whitewash', 'forfeit'].includes(withdrawalRule)) {
                    winner.matchHistory.push({ date: result.createdAt, outcome: 'WO' }); // Walkover win
                    loser.matchHistory.push({ date: result.createdAt, outcome: 'WO' }); // Walkover loss
                }
            } else {
                winner.matchHistory.push({ date: result.createdAt, outcome: 'W' });
                loser.matchHistory.push({ date: result.createdAt, outcome: 'L' });
            }

            // Base Points
            if (!isWalkoverMatch) {
                let wPoints = pointsSystem.win ?? 3;
                let lPoints = pointsSystem.loss ?? 0;

                winner.points += wPoints;
                loser.points += lPoints;

                // Apply handicap bonus to winner
                const winnerHandicap = isP1Winner ? p1HandicapBonus : p2HandicapBonus;
                if (winnerHandicap > 0) {
                    winner.points += winnerHandicap;
                    winner.bonusPoints += winnerHandicap;
                }

                winner.headToHead[loserIdStr] = (winner.headToHead[loserIdStr] || 0) + wPoints;
                loser.headToHead[winnerIdStr] = (loser.headToHead[winnerIdStr] || 0) + lPoints;
            } else if (withdrawalRule === 'whitewash') {
                // Whitewash gives 2 points to winner
                winner.points += 2;
                winner.headToHead[loserIdStr] = (winner.headToHead[loserIdStr] || 0) + 2;
                loser.headToHead[winnerIdStr] = (loser.headToHead[winnerIdStr] || 0) + 0;
            }

            if (!isWalkoverMatch) {
                // Whitewash Statistic - ALWAYS count for stats if loser got 0 frames
                const winnerScore = isP1Winner ? f1 : f2;
                const loserScore = isP1Winner ? f2 : f1;
                if (loserScore === 0 && winnerScore > 0) {
                    winner.whitewashes += 1;

                    // Award bonus points only if enabled in pointsSystem
                    if (pointsSystem.bonuses?.whitewash) {
                        const wwPoints = pointsSystem.bonuses.whitewashPoints || 1;
                        winner.bonusPoints += wwPoints;
                        winner.points += wwPoints;
                    }
                }
            }
        }
    }

    // 4d. Process Byes (Advance player without awarding points/stats)
    for (const bye of byes) {
        const player = statsMap[bye.player1Id];
        if (!player) {
            console.warn(`[standingsService] Player ${bye.player1Id} not found in statsMap for bye fixture ${bye.id}`);
            continue;
        }

        // Standard Practice: Bye player advances without any stats, points, or streak impact.
        // Byes are NOT real matches, so we deliberately do NOT push to matchHistory.
        // This ensures the streak (W1, W2, L1 etc.) is calculated from real matches only.
        // player.matchesPlayed += 0;
        // player.matchesWon += 0;
        // player.points += 0;
        // player.framesWon += 0;
        // matchHistory NOT pushed — bye does not affect streak.
    }

    // 4e. Calculate Swiss Tie-breaks if applicable
    let structure = league.structure || {};
    if (typeof structure === 'string') { try { structure = JSON.parse(structure); } catch { structure = {}; } }

    if (structure.format === 'swiss') {
        const tieBreakMethod = structure.swiss?.tieBreak || 'buchholz';
        Object.keys(statsMap).forEach(playerId => {
            const player = statsMap[playerId];
            let score = 0;

            if (tieBreakMethod === 'buchholz') {
                score = player.opponents.reduce((sum, oppId) => sum + (statsMap[oppId]?.points || 0), 0);
            } else if (tieBreakMethod === 'median') {
                const oppScores = player.opponents.map(oppId => statsMap[oppId]?.points || 0).sort((a, b) => a - b);
                if (oppScores.length >= 3) {
                    oppScores.shift();
                    oppScores.pop();
                    score = oppScores.reduce((sum, s) => sum + s, 0);
                } else {
                    score = oppScores.reduce((sum, s) => sum + s, 0);
                }
            } else if (tieBreakMethod === 'sonneborn') {
                score = player.opponents.reduce((sum, oppId) => {
                    const opponentPoints = statsMap[oppId]?.points || 0;
                    const ourMatchPointsAgainstThem = player.headToHead[oppId] || 0;
                    const resultWeight = (ourMatchPointsAgainstThem >= (pointsSystem.win || 3)) ? 1 :
                        (ourMatchPointsAgainstThem >= (pointsSystem.draw || 1)) ? 0.5 : 0;
                    return sum + (opponentPoints * resultWeight);
                }, 0);
            }
            player.swissTieBreakScore = score;
        });
    }

    // 5. Update each LeaguePlayer record
    const withdrawalBehaviourFinal = advanced?.withdrawal || 'keepPlayed';

    const updatePromises = leaguePlayers.map(lp => {
        const stats = statsMap[lp.playerId];

        // Final Rule Injection: "when i withdraw and option from league is void all matches then only withdraw player stats become 0 remiang player remian the sme"
        if (withdrawalBehaviourFinal === 'voidAll' && stats.status === 'withdrawn') {
            stats.matchesPlayed = 0;
            stats.matchesWon = 0;
            stats.matchesLost = 0;
            stats.draws = 0;
            stats.framesWon = 0;
            stats.framesLost = 0;
            stats.whitewashes = 0;
            stats.highestBreak = 0;
            stats.points = 0;
            stats.participationPoints = 0;
            stats.bonusPoints = 0;
            stats.walkoverWins = 0;
            stats.walkoverLosses = 0;
            stats.breaks50Plus = 0;
            stats.breaks100Plus = 0;
            stats.ballsPotted = 0;
            stats.ballsConceded = 0;
            stats.sevenBallWins = 0;
            stats.blackFinishes = 0;
            stats.whitewashWins = 0;
            stats.matchHistory = [];
        }

        const winPercentage = stats.matchesPlayed > 0 ? (stats.matchesWon / stats.matchesPlayed) * 100 : 0;

        const calculatedPoints = stats.points + (stats.manualPointsAdjustment || 0);
        if (stats.manualPointsAdjustment && stats.manualPointsAdjustment !== 0) {
            console.log(`[standingsService DEBUG] Updating player ${lp.playerId}: matchPoints=${stats.points}, manualAdj=${stats.manualPointsAdjustment}, final=${calculatedPoints}`);
        }

        return lp.update({
            matchesPlayed: stats.matchesPlayed,
            matchesWon: stats.matchesWon,
            matchesLost: stats.matchesLost,
            draws: stats.draws,
            framesWon: stats.framesWon,
            framesLost: stats.framesLost,
            frameDifference: stats.framesWon - stats.framesLost,
            whitewashes: stats.whitewashes,
            highestBreak: stats.highestBreak,
            points: calculatedPoints, // Include manual adjustment
            participationPoints: stats.participationPoints,
            bonusPoints: stats.bonusPoints,
            winPercentage: winPercentage,
            headToHeadResults: stats.headToHead,
            streak: calculateStreak(stats.matchHistory),
            breaks50Plus: stats.breaks50Plus,
            breaks100Plus: stats.breaks100Plus,
            ballsPotted: stats.ballsPotted,
            ballsConceded: stats.ballsConceded,
            sevenBallWins: stats.sevenBallWins,
            blackFinishes: stats.blackFinishes,
            whitewashWins: stats.whitewashWins,
            walkoverWins: stats.walkoverWins,
            walkoverLosses: stats.walkoverLosses,
            swissTieBreakScore: stats.swissTieBreakScore
        });
    });

    await Promise.all(updatePromises);
    console.log(`[standingsService] Standings updated for ${leaguePlayers.length} players in league ${leagueId}`);
}

/**
 * Calculate streak string (e.g., W3, L1, D2)
 * @param {Array} history 
 */
function calculateStreak(history) {
    if (!history || history.length === 0) return "-";

    // History is already sorted by date in updateLeagueStandings
    const reversed = [...history].reverse();
    const lastResult = reversed[0].outcome;
    let count = 0;

    for (const entry of reversed) {
        if (entry.outcome === lastResult) {
            count++;
        } else {
            break;
        }
    }

    return `${lastResult}${count}`;
}

/**
 * Get sorted standings for a division or league
 * @param {string} leagueId 
 * @param {string} divisionId 
 */
async function getSortedStandings(leagueId, divisionId = null) {
    const league = await League.findByPk(leagueId);
    if (!league) {
        console.warn(`[getSortedStandings] League not found: ${leagueId}`);
        return [];
    }

    const where = { leagueId };
    if (divisionId) where.divisionId = divisionId;

    // OPTIMIZATION: Only fetch necessary attributes to reduce payload and improve query speed
    const allPlayers = await LeaguePlayer.findAll({
        where,
        attributes: [
            'id', 'playerId', 'leagueId', 'divisionId',
            'matchesPlayed', 'matchesWon', 'matchesLost', 'draws',
            'framesWon', 'framesLost', 'frameDifference',
            'points', 'highestBreak', 'breaks50Plus', 'breaks100Plus',
            'sevenBallWins', 'ballsPotted', 'blackFinishes',
            'whitewashWins', 'whitewashes', 'winPercentage', 'streak',
            'title', 'excludeFromRankings',
            'headToHeadResults', 'swissTieBreakScore', 'manualPointsAdjustment',
            'walkoverWins', 'walkoverLosses', 'status'
        ],
        include: [{
            model: Player,
            as: 'player',
            attributes: ['id', 'name', 'nickname'],  // Only name and nickname needed for display
            required: false
        }]
    });

    // Filter out players explicitly marked to be excluded from rankings
    const players = allPlayers.filter(p => !p.excludeFromRankings);

    let tieBreakPriority = league.tieBreakPriority || [
        'headToHead', 'frameDifference', 'framesWon', 'highestBreak', 'wins', 'winPercentage', 'random'
    ];
    if (typeof tieBreakPriority === 'string') {
        try { tieBreakPriority = JSON.parse(tieBreakPriority); } catch (e) { tieBreakPriority = []; }
    }

    // Auto-inject swissRanking for Swiss format if not present
    let leagueStructure = {};
    try {
        leagueStructure = typeof league.structure === 'string' ? JSON.parse(league.structure || '{}') : (league.structure || {});
    } catch (e) {
        leagueStructure = {};
    }
    if (leagueStructure.format === 'swiss' && !tieBreakPriority.includes('swissRanking')) {
        // Insert after headToHead or at the beginning
        const headToHeadIdx = tieBreakPriority.indexOf('headToHead');
        if (headToHeadIdx !== -1) {
            tieBreakPriority.splice(headToHeadIdx + 1, 0, 'swissRanking');
        } else {
            tieBreakPriority.unshift('swissRanking');
        }
    }

    // Stable random tie-break: must NOT call Math.random() inside sort comparator (non-transitive → V8 sort can hang)
    const randomKey = new Map();
    players.forEach((p) => {
        randomKey.set(p.playerId, Math.random());
    });

    // Calculate win percentage for sorting (avoid calculating multiple times)
    const playerWinPct = new Map();
    players.forEach(p => {
        const matches = p.matchesPlayed || 0;
        playerWinPct.set(p.playerId, matches > 0 ? (p.matchesWon || 0) / matches : 0);
    });

    // Sort players based on priority
    players.sort((a, b) => {
        // 0. Status Priority: Active players first, withdrawn players last
        if (a.status !== b.status) {
            if (a.status === 'withdrawn') return 1;
            if (b.status === 'withdrawn') return -1;
        }

        // 1. Primary: Total Points
        if (b.points !== a.points) return b.points - a.points;

        // 2. Secondary: Titles (Champion > Runner-up > others)
        const getTitlePriority = (p) => {
            if (p.title === 'Champion') return 2;
            if (p.title === 'Runner-up') return 1;
            return 0;
        };
        const priorityA = getTitlePriority(a);
        const priorityB = getTitlePriority(b);
        if (priorityA !== priorityB) return priorityB - priorityA;

        // 2. Tie-break priorities
        for (const criteria of tieBreakPriority) {
            switch (criteria) {
                case 'headToHead':
                    // Check results between a and b
                    const aResults = a.headToHeadResults || {};
                    const bResults = b.headToHeadResults || {};
                    const aPointsVsB = aResults[b.playerId] || 0;
                    const bPointsVsA = bResults[a.playerId] || 0;

                    if (aPointsVsB !== bPointsVsA) return bPointsVsA - aPointsVsB;
                    break;
                case 'frameDifference':
                    if (b.frameDifference !== a.frameDifference) return b.frameDifference - a.frameDifference;
                    break;
                case 'framesWon':
                    if (b.framesWon !== a.framesWon) return b.framesWon - a.framesWon;
                    break;
                case 'highestBreak':
                    if (b.highestBreak !== a.highestBreak) return b.highestBreak - a.highestBreak;
                    break;
                case 'wins':
                    if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
                    break;
                case 'winPercentage': {
                    const aWinPct = playerWinPct.get(a.playerId) || 0;
                    const bWinPct = playerWinPct.get(b.playerId) || 0;
                    if (bWinPct !== aWinPct) return bWinPct - aWinPct;
                    break;
                }
                case 'swissRanking':
                    if (b.swissTieBreakScore !== a.swissTieBreakScore) return b.swissTieBreakScore - a.swissTieBreakScore;
                    break;
                case 'random': {
                    const ra = randomKey.get(a.playerId) ?? 0;
                    const rb = randomKey.get(b.playerId) ?? 0;
                    if (ra !== rb) return ra - rb;
                    break;
                }
            }
        }
        return 0;
    });

    return players;
}

module.exports = {
    updateLeagueStandings,
    getSortedStandings
};
