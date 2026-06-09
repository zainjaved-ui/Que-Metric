const { MatchResult, League, Booking, Fixture, Notification, Player } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const standingsService = require("./standingsService");

/**
 * Match Result Enforcement Service
 * Handles automatic confirmation of match results that exceed their time limit.
 */

/**
 * Find and auto-confirm match results that have been pending longer than the allowed time limit.
 */
async function autoConfirmExpiredResults() {
    console.log("[EnforcementService] Checking for expired pending match results...");

    try {
        // 1. Fetch all pending results
        const pendingResults = await MatchResult.findAll({
            where: {
                resultStatus: "Pending",
            },
            include: [
                {
                    model: League,
                    as: "league",
                    attributes: ["id", "reporting"],
                },
                {
                    model: Booking,
                    as: "booking",
                },
            ],
        });

        if (pendingResults.length === 0) {
            console.log("[EnforcementService] No pending results found.");
            return;
        }

        const now = new Date();
        let processedCount = 0;

        for (const result of pendingResults) {
            // 2. Determine time limit
            let timeLimitHours = 48; // Default
            if (result.league && result.league.reporting) {
                try {
                    const reporting = typeof result.league.reporting === 'string'
                        ? JSON.parse(result.league.reporting)
                        : result.league.reporting;

                    if (reporting.dispute && reporting.dispute.timeLimit) {
                        timeLimitHours = reporting.dispute.timeLimit;
                    }
                } catch (e) {
                    console.warn(`[EnforcementService] Failed to parse reporting for league ${result.leagueId}:`, e.message);
                }
            }

            const createdAt = new Date(result.createdAt);
            const diffMs = now - createdAt;
            const diffHours = diffMs / (1000 * 60 * 60);

            if (diffHours >= timeLimitHours) {
                console.log(`[EnforcementService] Result ${result.id} expired (${diffHours.toFixed(1)}h > ${timeLimitHours}h). Auto-confirming...`);

                await autoConfirmMatchResult(result);
                processedCount++;
            }
        }

        console.log(`[EnforcementService] Finished. Auto-confirmed ${processedCount} results.`);
    } catch (error) {
        console.error("[EnforcementService] Error in autoConfirmExpiredResults:", error);
    }
}

/**
 * Auto-confirm a single match result
 * @param {MatchResult} matchResult 
 */
async function autoConfirmMatchResult(matchResult) {
    const transaction = await sequelize.transaction();

    try {
        const reporting = matchResult.league?.reporting;
        const parsedReporting = typeof reporting === 'string' ? JSON.parse(reporting || '{}') : (reporting || {});
        const requiresAdminApproval = parsedReporting.adminApproval === true;
        const targetStatus = requiresAdminApproval ? "Awaiting Admin Approval" : "Confirmed";

        // 1. Update MatchResult status
        await matchResult.update(
            {
                resultStatus: targetStatus,
                notes: (matchResult.notes ? matchResult.notes + "\n" : "") + "[System]: Automatically confirmed after time limit expired.",
                confirmedAt: new Date(),
            },
            { transaction }
        );

        // 2. Update Notification status for the opponent
        const opponentId = matchResult.player1Id === matchResult.submittedBy ? matchResult.player2Id : matchResult.player1Id;

        await Notification.update(
            {
                status: "actioned",
                actionStatus: requiresAdminApproval ? "awaiting_admin_approval" : "confirmed",
                message: (matchResult.notes || "") + " (Auto-confirmed by system)",
            },
            {
                where: {
                    relatedEntityType: "match_result",
                    relatedEntityId: matchResult.id,
                    recipientId: opponentId,
                },
                transaction,
            }
        );

        // 3. Create a new notification for both players about auto-confirmation
        const players = [matchResult.player1Id, matchResult.player2Id];
        for (const pId of players) {
            await Notification.create({
                recipientId: pId,
                type: "match_result_auto_confirmed",
                title: "Match Result Auto-Confirmed",
                message: `The match result for your recent match has been automatically confirmed by the system as the opponent did not respond within the ${requiresAdminApproval ? 'approval' : 'dispute'} period.`,
                relatedEntityType: "match_result",
                relatedEntityId: matchResult.id,
                status: "unread",
            }, { transaction });
        }

        // 4. Finalize match if no admin approval needed
        if (!requiresAdminApproval) {
            // Update booking
            if (matchResult.booking) {
                await matchResult.booking.update({ status: "completed" }, { transaction });
            }

            // Update fixture
            if (matchResult.fixtureId) {
                const fixture = await Fixture.findByPk(matchResult.fixtureId, { transaction });
                if (fixture) {
                    const updateData = {
                        status: "completed",
                        winnerId: matchResult.winnerId,
                        loserId: matchResult.winnerId === matchResult.player1Id ? matchResult.player2Id : matchResult.player1Id,
                    };

                    if (matchResult.sport === "snooker") {
                        updateData.player1Frames = matchResult.player1Frames;
                        updateData.player2Frames = matchResult.player2Frames;
                        updateData.resultData = matchResult.snookerFrameDetails;
                    } else if (matchResult.sport === "pooker") {
                        updateData.player1Frames = matchResult.player1Frames;
                        updateData.player2Frames = matchResult.player2Frames;
                        updateData.resultData = matchResult.pookerFrameDetails;
                    } else if (matchResult.sport === "pool") {
                        updateData.player1RackWins = matchResult.player1RackWins;
                        updateData.player2RackWins = matchResult.player2RackWins;
                        updateData.resultData = matchResult.poolRackDetails;
                    } else if (matchResult.sport === "poker") {
                        updateData.resultData = matchResult.pokerResults;
                    }

                    await fixture.update(updateData, { transaction });
                }
            }
        }

        await transaction.commit();

        // 5. Update standings (outside transaction to avoid deadlocks)
        if (!requiresAdminApproval && matchResult.leagueId) {
            standingsService.updateLeagueStandings(matchResult.leagueId).catch(err => {
                console.error(`[EnforcementService] Error updating standings for league ${matchResult.leagueId}:`, err);
            });
        }

        return true;
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error(`[EnforcementService] Failed to auto-confirm result ${matchResult.id}:`, error);
        return false;
    }
}

module.exports = {
    autoConfirmExpiredResults,
};
