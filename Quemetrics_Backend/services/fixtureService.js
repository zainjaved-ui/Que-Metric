const { Fixture, League, MatchResult } = require('../models');
const { Op } = require('sequelize');
const standingsService = require('./standingsService');

/**
 * Service to handle fixture-related business logic like deadlines and forfeits.
 */

/**
 * Check for overdue fixtures in a league and process auto-forfeits if enabled.
 * @param {string} leagueId 
 */
async function processOverdueFixtures(leagueId) {
    try {
        const league = await League.findByPk(leagueId);
        if (!league) return { success: false, error: 'League not found' };

        // Parse scheduling rules
        let scheduling = league.scheduling || {};
        if (typeof scheduling === 'string') {
            try { scheduling = JSON.parse(scheduling); } catch (e) { scheduling = {}; }
        }

        const { deadlineDays, autoForfeit } = scheduling;
        if (!deadlineDays) return { success: true, message: 'No deadline set for this league' };

        const today = new Date();

        // Find scheduled fixtures that are past their deadline
        const overdueFixtures = await Fixture.findAll({
            where: {
                leagueId,
                status: 'scheduled',
                scheduledDate: {
                    [Op.not]: null
                }
            }
        });

        let processedCount = 0;
        const updates = [];

        // Parse matchRules once outside the loop
        let matchRules = league.matchRules || {};
        if (typeof matchRules === 'string') {
            try { matchRules = JSON.parse(matchRules); } catch (e) { matchRules = {}; }
        }

        for (const fixture of overdueFixtures) {
            const scheduledDate = new Date(fixture.scheduledDate);
            const deadlineDate = new Date(scheduledDate.getTime() + (deadlineDays * 24 * 60 * 60 * 1000));

            if (deadlineDate < today) {
                // This fixture is overdue
                if (autoForfeit) {
                    const walkoverRule = matchRules.walkover || { rule: 'autoBestOf' };

                    if (walkoverRule.rule === 'admin') {
                        // Admin decides: Mark as overdue but don't auto-complete
                        fixture.status = 'scheduled'; 
                        fixture.resultData = {
                            ...(fixture.resultData || {}),
                            isOverdue: true,
                            overdueMessage: 'Deadline passed. Admin decision required.'
                        };
                    } else {
                        // Auto-complete with walkover results
                        let score1 = 0, score2 = 0;
                        const bestOf = parseInt(matchRules.bestOf) || parseInt(matchRules.customFrames) || 5;
                        const defaultScore = bestOf;

                        if (walkoverRule.rule === 'autoBestOf' || walkoverRule.rule === 'auto3-0') {
                            score1 = defaultScore; score2 = 0; 
                        } else if (walkoverRule.rule === 'auto2-0') {
                            score1 = 2; score2 = 0;
                        } else if (walkoverRule.rule === 'auto5-0') {
                            score1 = 5; score2 = 0;
                        } else if (walkoverRule.rule === 'custom' && walkoverRule.customScore) {
                            const parts = walkoverRule.customScore.split(/[–-]/);
                            score1 = parseInt(parts[0]) || 0;
                            score2 = parseInt(parts[1]) || 0;
                        } else {
                            score1 = defaultScore; score2 = 0;
                        }

                        fixture.status = 'completed';
                        fixture.resultData = {
                            ...(fixture.resultData || {}),
                            isAutoForfeit: true,
                            walkoverScore: `${score1}-${score2}`,
                            note: 'Automatically forfeited due to deadline.'
                        };

                        if (league.sport === 'snooker' || league.sport === 'pooker') {
                            fixture.player1Frames = score1;
                            fixture.player2Frames = score2;
                        } else if (league.sport === 'pool') {
                            fixture.player1RackWins = score1;
                            fixture.player2RackWins = score2;
                        }

                        const matchResultData = {
                            fixtureId: fixture.id,
                            leagueId: fixture.leagueId,
                            matchType: "league",
                            sport: league.sport,
                            submittedBy: fixture.player1Id,
                            player1Id: fixture.player1Id,
                            player2Id: fixture.player2Id,
                            winnerId: fixture.winnerId || null,
                            resultStatus: "Confirmed",
                            isWalkover: true,
                            resultData: {
                                isAutoForfeit: true,
                                walkoverScore: `${score1}-${score2}`,
                                note: 'Automatically forfeited due to deadline.'
                            }
                        };

                        if (league.sport === "snooker" || league.sport === "pooker") {
                            matchResultData.player1Frames = score1;
                            matchResultData.player2Frames = score2;
                        } else if (league.sport === "pool") {
                            matchResultData.player1RackWins = score1;
                            matchResultData.player2RackWins = score2;
                        }

                        // Create MatchResult (if not exists)
                        updates.push(MatchResult.findOrCreate({
                            where: { fixtureId: fixture.id },
                            defaults: matchResultData
                        }).then(([mr, created]) => {
                            if (!created) return mr.update(matchResultData);
                        }));
                    }

                    updates.push(fixture.save());
                    processedCount++;
                }
            }
        }

        if (updates.length > 0) {
            await Promise.all(updates);
            // Trigger a single standings recalculation if any updates occurred
            await standingsService.updateLeagueStandings(leagueId);
        }

        return {
            success: true,
            processedCount,
            overdueCount: overdueFixtures.length
        };
    } catch (error) {
        console.error(`[processOverdueFixtures] Error for league ${leagueId}:`, error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    processOverdueFixtures,
    handlePlayerWithdrawalFromFixtures
};

/**
 * Handle fixtures when a player withdraws from a league.
 * Converts upcoming matches to byes and advances opponents in knockouts.
 */
async function handlePlayerWithdrawalFromFixtures(leagueId, playerId) {
    const { Fixture, MatchResult, League } = require('../models');
    
    // Find all incomplete fixtures for this player in this league
    const fixtures = await Fixture.findAll({
        where: {
            leagueId,
            [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }],
            status: { [Op.in]: ['scheduled', 'in_progress'] }
        }
    });

    const league = await League.findByPk(leagueId);
    if (!league) return;

    for (const fixture of fixtures) {
        const isPlayer1 = fixture.player1Id === playerId;
        const opponentId = isPlayer1 ? fixture.player2Id : fixture.player1Id;

        if (opponentId) {
            // Mark as bye and set opponent as winner
            await fixture.update({
                status: 'bye',
                winnerId: opponentId,
                loserId: playerId
            });

            // Create a MatchResult for the walkover/bye record
            await MatchResult.create({
                fixtureId: fixture.id,
                leagueId,
                matchType: 'league',
                sport: league.sport,
                submittedBy: opponentId, // Fix: submittedBy cannot be null
                player1Id: fixture.player1Id,
                player2Id: fixture.player2Id,
                winnerId: opponentId,
                isWalkover: true,
                resultStatus: 'Confirmed',
                notes: 'Automated bye due to player withdrawal.'
            });

            // If it's a knockout stage, advance the opponent to the next round
            if (fixture.stage === 'knockout') {
                await advanceKnockoutWinner(fixture);
            }
        } else {
            // No opponent (e.g., already a bye or placeholder), just cancel
            await fixture.update({ status: 'cancelled' });
        }
    }
}

/**
 * Propagates a winner to the next round in a knockout bracket.
 */
async function advanceKnockoutWinner(fixture) {
    if (!fixture.winnerId) return;
    
    const nextR = (fixture.round || 1) + 1;
    const nextIdx = Math.floor(fixture.matchIndex / 2);
    const isP1 = fixture.matchIndex % 2 === 0;

    const { Fixture } = require('../models');
    const target = await Fixture.findOne({
        where: {
            leagueId: fixture.leagueId,
            round: nextR,
            matchIndex: nextIdx,
            divisionId: fixture.divisionId,
            stage: 'knockout'
        }
    });

    if (target) {
        if (isP1) await target.update({ player1Id: fixture.winnerId });
        else await target.update({ player2Id: fixture.winnerId });
    }
}
