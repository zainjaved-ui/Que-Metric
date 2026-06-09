/**
 * divisionService.js
 * Handles automatic promotion and relegation between divisions when a league is finalized.
 */

const { Division, LeaguePlayer, League } = require('../models');
const standingsService = require('./standingsService');

/**
 * Process promotion and relegation for all divisions in a league.
 * - Divisions are ordered by createdAt ASC: index 0 = top tier (Division 1), last = bottom.
 * - Top N players from division i+1 are promoted to division i.
 * - Bottom N players from division i are relegated to division i+1.
 * - If manualOverride is true, players with manuallyAssigned=true are skipped.
 *
 * @param {string} leagueId
 * @returns {{ moves: Array<{ playerId, playerName, fromDivisionId, fromDivisionName, toDivisionId, toDivisionName, type: 'promotion'|'relegation' }> }}
 */
async function processPromotionRelegation(leagueId) {
    console.log(`[divisionService] Processing promotion/relegation for league: ${leagueId}`);

    const league = await League.findByPk(leagueId);
    if (!league) throw new Error(`League ${leagueId} not found`);

    // Parse structure to get division settings
    let structure = league.structure || {};
    if (typeof structure === 'string') {
        try { structure = JSON.parse(structure); } catch { structure = {}; }
    }

    const divSettings = structure.divisions || {};
    const promotionCount = parseInt(divSettings.promotions, 10) || 0;
    const relegationCount = parseInt(divSettings.relegations, 10) || 0;
    const manualOverride = !!divSettings.manualOverride;

    console.log(`[divisionService] promotions=${promotionCount}, relegations=${relegationCount}, manualOverride=${manualOverride}`);

    if (promotionCount === 0 && relegationCount === 0) {
        console.log('[divisionService] No promotion/relegation configured; skipping.');
        return { moves: [] };
    }

    // Fetch divisions ordered top→bottom (Division 1 first, lowest tier last)
    const divisions = await Division.findAll({
        where: { leagueId },
        order: [['createdAt', 'ASC']],
    });

    if (divisions.length < 2) {
        console.log('[divisionService] Less than 2 divisions; no promotion/relegation possible.');
        return { moves: [] };
    }

    const moves = [];

    // Build a set of manually assigned playerIds if manualOverride is enabled
    let manuallyAssignedPlayerIds = new Set();
    if (manualOverride) {
        // Collect from DB flag
        const manualPlayers = await LeaguePlayer.findAll({
            where: { leagueId, manuallyAssigned: true },
        });
        manualPlayers.forEach(lp => manuallyAssignedPlayerIds.add(lp.playerId));

        // Also collect from structure.divisions.assignedPlayers if present
        const assignedPlayers = divSettings.assignedPlayers || [];
        if (Array.isArray(assignedPlayers)) {
            assignedPlayers.forEach(divArr => {
                if (Array.isArray(divArr)) {
                    divArr.forEach(id => {
                        const pid = typeof id === 'object' ? (id.id || id.playerId) : id;
                        if (pid) manuallyAssignedPlayerIds.add(pid);
                    });
                }
            });
        }
        console.log(`[divisionService] manualOverride active; protecting ${manuallyAssignedPlayerIds.size} players`);
    }

    // Process each adjacent pair of divisions
    for (let i = 0; i < divisions.length - 1; i++) {
        const upperDiv = divisions[i];     // higher tier (e.g., Division 1)
        const lowerDiv = divisions[i + 1]; // lower tier (e.g., Division 2)

        // Get standings for each division (sorted best→worst)
        const upperStandings = await standingsService.getSortedStandings(leagueId, upperDiv.id);
        const lowerStandings = await standingsService.getSortedStandings(leagueId, lowerDiv.id);

        // --- RELEGATION: bottom N players from upper → lower ---
        if (relegationCount > 0 && upperStandings.length > 0) {
            // Take from the end of sorted list (worst performers)
            const relegationCandidates = upperStandings
                .slice(Math.max(0, upperStandings.length - relegationCount))
                .filter(lp => !manualOverride || !manuallyAssignedPlayerIds.has(lp.playerId));

            for (const lp of relegationCandidates) {
                await lp.update({ divisionId: lowerDiv.id });
                moves.push({
                    playerId: lp.playerId,
                    playerName: lp.player?.name || lp.player?.nickname || lp.playerId,
                    fromDivisionId: upperDiv.id,
                    fromDivisionName: upperDiv.name,
                    toDivisionId: lowerDiv.id,
                    toDivisionName: lowerDiv.name,
                    type: 'relegation',
                });
                console.log(`[divisionService] Relegated: ${lp.playerId} from ${upperDiv.name} → ${lowerDiv.name}`);
            }
        }

        // --- PROMOTION: top N players from lower → upper ---
        if (promotionCount > 0 && lowerStandings.length > 0) {
            // Take from the start of sorted list (best performers)
            const promotionCandidates = lowerStandings
                .slice(0, promotionCount)
                .filter(lp => !manualOverride || !manuallyAssignedPlayerIds.has(lp.playerId));

            for (const lp of promotionCandidates) {
                await lp.update({ divisionId: upperDiv.id });
                moves.push({
                    playerId: lp.playerId,
                    playerName: lp.player?.name || lp.player?.nickname || lp.playerId,
                    fromDivisionId: lowerDiv.id,
                    fromDivisionName: lowerDiv.name,
                    toDivisionId: upperDiv.id,
                    toDivisionName: upperDiv.name,
                    type: 'promotion',
                });
                console.log(`[divisionService] Promoted: ${lp.playerId} from ${lowerDiv.name} → ${upperDiv.name}`);
            }
        }
    }

    console.log(`[divisionService] Completed: ${moves.length} player moves.`);
    return { moves };
}

module.exports = { processPromotionRelegation };
