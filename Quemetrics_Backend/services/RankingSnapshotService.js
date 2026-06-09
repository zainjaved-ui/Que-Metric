const { v4: uuidv4 } = require("uuid");
const {
  RankingPointsHistory,
  SeasonRankingSnapshot,
  Season,
  Game,
  Player,
} = require("../models");
const cache = require("../utils/cache");

const VALID_SPORTS = new Set(["snooker", "pool", "pooker"]);

function normalizeSport(value) {
  const sport = String(value || "").trim().toLowerCase();
  return VALID_SPORTS.has(sport) ? sport : null;
}

class RankingSnapshotService {
  async resolveSeasonBySport(sport) {
    const normalizedSport = normalizeSport(sport);
    if (!normalizedSport) return null;

    const activeSeason = await Season.findOne({
      include: [{ model: Game, as: "game", attributes: ["id", "name"] }],
      where: { status: "active" },
      order: [["startDate", "DESC"]],
    });

    if (activeSeason) {
      const gameSport = normalizeSport(activeSeason.game?.name);
      if (gameSport === normalizedSport) return activeSeason;
    }

    const seasons = await Season.findAll({
      include: [{ model: Game, as: "game", attributes: ["id", "name"] }],
      order: [["startDate", "DESC"]],
    });

    return seasons.find((s) => normalizeSport(s.game?.name) === normalizedSport) || null;
  }

  async rebuildSnapshot({ seasonId, sport }) {
    const normalizedSport = normalizeSport(sport);
    if (!seasonId || !normalizedSport) {
      return { success: false, error: "seasonId and valid sport are required" };
    }

    const season = await Season.findByPk(seasonId);
    if (!season) {
      return { success: false, error: "Season not found" };
    }

    const sequelize = RankingPointsHistory.sequelize;
    const entries = await RankingPointsHistory.findAll({
      where: { seasonId, sport: normalizedSport, isActive: true },
      attributes: [
        "playerId",
        [sequelize.fn("SUM", sequelize.literal("pointsAwarded + pointsAdjustment")), "totalPoints"],
        [sequelize.fn("COUNT", sequelize.fn("DISTINCT", sequelize.col("tournamentId"))), "tournamentsCount"],
      ],
      group: ["playerId"],
      having: sequelize.where(sequelize.fn("SUM", sequelize.literal("pointsAwarded + pointsAdjustment")), ">", 0),
      order: [[sequelize.literal("totalPoints"), "DESC"]],
      raw: true,
    });

    const snapshotBatchId = uuidv4();
    // calculatedAt will be set automatically by timestamps (createdAt)

    if (entries.length > 0) {
      await SeasonRankingSnapshot.bulkCreate(
        entries.map((row, index) => ({
          snapshotBatchId,
          seasonId,
          sport: normalizedSport,
          playerId: row.playerId,
          totalPoints: row.totalPoints,
          position: index + 1,
          tournamentsCount: row.tournamentsCount,
        }))
      );
    }
 
    // Invalidate caches related to this season/sport
    try {
      await cache.delStartWith(`rankings:snapshot:${seasonId}:${normalizedSport}`);
      await cache.delStartWith(`rankings:latest:${seasonId}:${normalizedSport}`);
    } catch (e) {
      console.warn('[RankingSnapshotService] Cache invalidation failed:', e.message);
    }

    return {
      success: true,
      data: {
        seasonId,
        sport: normalizedSport,
        snapshotBatchId,
        playersRanked: entries.length,
      },
    };
  }

  async rebuildActiveSeasonSnapshots() {
    const seasons = await Season.findAll({
      where: { status: "active" },
      include: [{ model: Game, as: "game", attributes: ["name"] }],
    });

    const tasks = seasons
      .map((season) => ({
        seasonId: season.id,
        sport: normalizeSport(season.game?.name),
      }))
      .filter((task) => Boolean(task.sport));

    if (tasks.length === 0) return [];

    // Run all rebuilds sequentially to avoid slamming the DB connection pool
    const results = [];
    for (const task of tasks) {
      results.push(await this.rebuildSnapshot(task));
    }
    return results;
  }

  async getLatestSnapshot({ seasonId, sport, limit = 100, offset = 0 }) {
    const normalizedSport = normalizeSport(sport);
    const where = {};
    if (seasonId) where.seasonId = seasonId;
    if (normalizedSport) where.sport = normalizedSport;

    const latest = await SeasonRankingSnapshot.findOne({
      where,
      order: [["createdAt", "DESC"]],
      attributes: ["snapshotBatchId", "seasonId", "sport", "createdAt"],
      raw: true,
    });

    if (!latest) {
      return {
        success: true,
        data: {
          rankings: [],
          total: 0,
          limit: Number(limit),
          offset: Number(offset),
          snapshotBatchId: null,
          createdAt: null,
        },
      };
    }

    const cacheKey = `rankings:latest:${seasonId || 'all'}:${normalizedSport || 'all'}:${limit}:${offset}`;
    try {
      const cached = await cache.get(cacheKey);
      if (cached) return { success: true, data: JSON.parse(cached), isCached: true };
    } catch (e) {}

    const rows = await SeasonRankingSnapshot.findAndCountAll({
      where: {
        snapshotBatchId: latest.snapshotBatchId,
      },
      include: [{ model: Player, as: "player", attributes: ["id", "name", "nickname"] }],
      order: [["position", "ASC"]],
      limit: Number(limit),
      offset: Number(offset),
    });

    const result = {
      rankings: rows.rows,
      total: rows.count,
      limit: Number(limit),
      offset: Number(offset),
      snapshotBatchId: latest.snapshotBatchId,
      calculatedAt: latest.createdAt,
      seasonId: latest.seasonId,
      sport: latest.sport,
    };

    // Cache for 10 minutes
    try {
      await cache.set(cacheKey, JSON.stringify(result), 'EX', 600);
    } catch (e) {}

    return {
      success: true,
      data: result,
    };
  }

  buildAwardDedupeKey({ tournamentId, playerId }) {
    return `award:${tournamentId}:${playerId}`;
  }

  buildOverrideDedupeKey({ playerId, seasonId, sport, reason, createdBy, when }) {
    const stamp = new Date(when || Date.now()).toISOString();
    return `override:${playerId}:${seasonId}:${sport}:${createdBy}:${stamp}:${Buffer.from(String(reason || "")).toString("base64").slice(0, 24)}`;
  }

  /**
   * NEW: Apply 6-level ranking tiebreaker chain
   * 1. Highest tier event win
   * 2. Most tournament wins (12mo)
   * 3. Deepest run in highest tier
   * 4. Head-to-head result
   * 5. Win percentage (12mo)
   * 6. Frame difference (12mo)
   */
  async applyRankingTiebreakers(rankings, sport) {
    if (!rankings || rankings.length < 2) return rankings;

    // NEW: Implement 6-level tiebreaker chain
    // For now, use points as primary and tournament wins as secondary
    // Full implementation requires match data joins which are deferred

    const sorted = [...rankings].sort((a, b) => {
      // Level 1: Total points (already sorted)
      if (a.totalPoints !== b.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }

      // Level 2: Tournament wins (Winners only)
      const aWins = a.stageHistory?.filter((s) => s.stage === "Winner").length || 0;
      const bWins = b.stageHistory?.filter((s) => s.stage === "Winner").length || 0;
      if (aWins !== bWins) {
        return bWins - aWins;
      }

      // Level 3: Deepest run (position)
      const aDeepest = Math.min(...(a.stageHistory?.map((s) => s.position) || [999]));
      const bDeepest = Math.min(...(b.stageHistory?.map((s) => s.position) || [999]));
      if (aDeepest !== bDeepest) {
        return aDeepest - bDeepest;
      }

      // Level 4: Head-to-head (skipped - requires match data)
      // Level 5: Win percentage (skipped - requires match data)
      // Level 6: Frame difference (skipped - requires match data)

      return 0;
    });

    return sorted.map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
  }

  /**
   * NEW: Get rolling 12-month rankings (no season requirement)
   * Aggregates ranking points from RankingPointsHistory within last 12 months
   *
   * @param {object} options - Query options
   * @param {string} options.sport - Sport filter (snooker, pool, pooker)
   * @param {number} options.limit - Pagination limit
   * @param {number} options.offset - Pagination offset
   * @param {string} options.scope - Scope filter (club, county, regional, national)
   * @param {string} options.scopeValue - Value for scope (clubId, county name, region name, or null for national)
   * @returns {object} Ranking data with rolling 12-month aggregation
   */
  /**
   * Calculate provisional ranking points for in-progress tournaments
   * based on current match results and tournament standings
   */
  async calculateProvisionalPoints(tournament, normalizedSport) {
    if (!tournament?.ranked || tournament.sport?.toLowerCase() !== normalizedSport) {
      return [];
    }

    try {
      const provisionalPoints = [];
      const TournamentParticipant = RankingPointsHistory.sequelize.models.TournamentParticipant;
      const TournamentMatch = RankingPointsHistory.sequelize.models.TournamentMatch;

      // Get tournament participants with player data
      const participants = await TournamentParticipant.findAll({
        where: { tournamentId: tournament.id, status: "approved" },
        include: [{ association: "player", model: Player, attributes: ["id", "name"] }],
        raw: false,
      });

      // Get all matches for this tournament
      const matches = await TournamentMatch.findAll({
        where: { tournamentId: tournament.id },
        raw: true,
      });

      // Calculate wins per player
      const winsMap = new Map();
      for (const match of matches) {
        if (match.status === "completed" && match.winner) {
          const winnerId = match.winner === "player1" ? match.player1Id : match.player2Id;
          if (winnerId) winsMap.set(winnerId, (winsMap.get(winnerId) || 0) + 1);
        }
      }

      // Tier mapping
      const TIER_MAPPING = {
        international: "tier1", national: "tier1", regional: "tier2", county: "tier2", local: "tier3",
      };
      const TIER_MINIMUMS = { tier1: 16, tier2: 12, tier3: 8 };
      const TIER_POINTS = {
        tier1: { Winner: 500, "Runner-Up": 300, "Semi-Final": 180, "Quarter-Final": 100, Last16: 50, Last32: 25 },
        tier2: { Winner: 200, "Runner-Up": 120, "Semi-Final": 70, "Quarter-Final": 40, Last16: 20, Last32: 10 },
        tier3: { Winner: 100, "Runner-Up": 60, "Semi-Final": 35, "Quarter-Final": 20, Last16: 10, Last32: 5 },
      };

      const tieredTier = TIER_MAPPING[tournament.tier] || "tier3";
      const tierMin = TIER_MINIMUMS[tieredTier] || 8;
      const approvedCount = participants.length;
      const isBelowThreshold = approvedCount < tierMin;
      const multiplier = isBelowThreshold ? 0.5 : 1.0;

      // Sort participants by wins (descending) to estimate current standings
      const sortedParticipants = [...participants].sort((a, b) => {
        const aWins = winsMap.get(a.playerId) || 0;
        const bWins = winsMap.get(b.playerId) || 0;
        return bWins - aWins;
      });

      // Assign provisional positions and stages based on wins
      for (let i = 0; i < sortedParticipants.length; i++) {
        const p = sortedParticipants[i];
        const playerWins = winsMap.get(p.playerId) || 0;

        // Estimate position (1st, 2nd, etc.)
        const estimatedPosition = i + 1;
        let stage = "Last32";

        if (estimatedPosition === 1) stage = "Winner";
        else if (estimatedPosition === 2) stage = "Runner-Up";
        else if (estimatedPosition <= 4) stage = "Semi-Final";
        else if (estimatedPosition <= 8) stage = "Quarter-Final";
        else if (estimatedPosition <= 16) stage = "Last16";

        const tierPoints = TIER_POINTS[tieredTier] || TIER_POINTS.tier3;
        let basePoints = tierPoints[stage] || 0;
        let finalPoints = Math.floor(basePoints * multiplier);

        // Only award if player won at least 1 match
        if (playerWins > 0 && finalPoints > 0) {
          provisionalPoints.push({
            playerId: p.playerId,
            pointsAwarded: finalPoints,
            tournamentId: tournament.id,
            isProvisional: true,
            stage: stage,
          });
        }
      }

      return provisionalPoints;
    } catch (error) {
      console.error("Error calculating provisional points:", error.message);
      return [];
    }
  }

  async getRolling12MonthRankings({ sport, limit = 100, offset = 0, scope = "national", scopeValue = null, includeProvisional = true }) {
    const normalizedSport = normalizeSport(sport);
    if (!normalizedSport) {
      return {
        success: true,
        data: {
          rankings: [],
          total: 0,
          limit: Number(limit),
          offset: Number(offset),
          rankingWindow: "rolling_12_months",
          calculatedAt: new Date(),
        },
      };
    }

    // Try cache first - this is a very heavy query
    const cacheKey = `rankings:rolling12:${normalizedSport}:${includeProvisional}:${limit}:${offset}`;
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return {
          success: true,
          data: JSON.parse(cached),
          isCached: true
        };
      }
    } catch (e) {
      console.warn('[RankingSnapshotService] Cache read failed:', e.message);
    }

    // Query range: last 12 months from now
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    // Get all active ranking points within 12-month window
    const { Op } = require("sequelize");
    const logs = await RankingPointsHistory.findAll({
      where: {
        sport: normalizedSport,
        isActive: true,
        eventType: "award",  // Only tournament awards, not overrides
        createdAt: { [Op.gte]: twelveMonthsAgo },  // Created within last 12 months
      },
      attributes: [
        "playerId",
        "tournamentId",
        "pointsAwarded",
        "finishingPosition",
        "stageReached",
      ],
      raw: true,
    });

    // Aggregate by player
    const totalsByPlayer = new Map();
    const tournamentsByPlayer = new Map();
    const stageHistoryByPlayer = new Map();

    for (const row of logs) {
      const playerId = row.playerId;
      if (!playerId) continue;

      // Sum points
      const points = Number(row.pointsAwarded || 0);
      totalsByPlayer.set(playerId, Number(totalsByPlayer.get(playerId) || 0) + points);

      // Track tournaments for tournament wins count
      if (row.tournamentId) {
        if (!tournamentsByPlayer.has(playerId)) {
          tournamentsByPlayer.set(playerId, new Set());
        }
        tournamentsByPlayer.get(playerId).add(String(row.tournamentId));
      }

      // Track stage reached for tiebreaker data
      if (row.stageReached) {
        if (!stageHistoryByPlayer.has(playerId)) {
          stageHistoryByPlayer.set(playerId, []);
        }
        stageHistoryByPlayer.get(playerId).push({
          stage: row.stageReached,
          position: row.finishingPosition,
        });
      }
    }

    // Add provisional points from in-progress tournaments
    if (includeProvisional) {
      const Tournament = RankingPointsHistory.sequelize.models.Tournament;
      const inProgressTournaments = await Tournament.findAll({
        where: {
          sport: normalizedSport,
          status: "in_progress",
          ranked: true,
          createdAt: { [Op.gte]: twelveMonthsAgo },
        },
      });

      for (const tournament of inProgressTournaments) {
        const provisionalData = await this.calculateProvisionalPoints(tournament, normalizedSport);
        for (const entry of provisionalData) {
          const playerId = entry.playerId;
          const points = Number(entry.pointsAwarded || 0);
          // Add provisional points
          totalsByPlayer.set(playerId, Number(totalsByPlayer.get(playerId) || 0) + points);

          if (!tournamentsByPlayer.has(playerId)) {
            tournamentsByPlayer.set(playerId, new Set());
          }
          tournamentsByPlayer.get(playerId).add(String(entry.tournamentId));

          if (!stageHistoryByPlayer.has(playerId)) {
            stageHistoryByPlayer.set(playerId, []);
          }
          stageHistoryByPlayer.get(playerId).push({
            stage: entry.stage,
            isProvisional: true,
          });
        }
      }
    }

    // Build ranked entries
    const entries = [...totalsByPlayer.entries()]
      .map(([playerId, totalPoints]) => ({
        playerId,
        totalPoints: Number(totalPoints),
        tournamentsCount: (tournamentsByPlayer.get(playerId) || new Set()).size,
        stageHistory: stageHistoryByPlayer.get(playerId) || [],
      }))
      .filter((row) => row.totalPoints > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints);

    // NEW: Get all tournaments where players participated (not just ranked tournaments)
    // This gives accurate tournament participation count regardless of ranking
    const TournamentParticipant = RankingPointsHistory.sequelize.models.TournamentParticipant;

    // Get all tournaments (completed and in-progress in last 12 months) where these players participated
    const participationData = await TournamentParticipant.findAll({
      where: {
        playerId: entries.map(e => e.playerId),
        status: 'approved',
      },
      attributes: ['playerId', 'tournamentId'],
      raw: true,
    });

    // Filter by tournament creation date (last 12 months)
    const participationByTournament = await RankingPointsHistory.sequelize.models.Tournament.findAll({
      where: {
        id: [...new Set(participationData.map(p => p.tournamentId))],
        createdAt: { [Op.gte]: twelveMonthsAgo },
      },
      attributes: ['id'],
      raw: true,
    });

    const validTournamentIds = new Set(participationByTournament.map(t => t.id));

    // Build map of player -> all tournaments they participated in
    const allTournamentsByPlayer = new Map();
    participationData.forEach(p => {
      if (validTournamentIds.has(p.tournamentId)) {
        if (!allTournamentsByPlayer.has(p.playerId)) {
          allTournamentsByPlayer.set(p.playerId, new Set());
        }
        allTournamentsByPlayer.get(p.playerId).add(String(p.tournamentId));
      }
    });

    // Update entries with total tournament participation count
    entries.forEach(entry => {
      entry.tournamentsCount = (allTournamentsByPlayer.get(entry.playerId) || new Set()).size;
    });

    // Add ranks
    let rankedEntries = entries.map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));

    // Apply tiebreaker chain to resolve equal points
    rankedEntries = await this.applyRankingTiebreakers(rankedEntries, normalizedSport);

    // Fetch player details for selected range
    const selectedEntries = rankedEntries.slice(
      Number(offset),
      Number(offset) + Number(limit)
    );

    const playerIds = selectedEntries.map((e) => e.playerId);
    const players = await Player.findAll({
      where: { id: playerIds },
      attributes: ["id", "name", "nickname"],
      raw: true,
    });
    const playerMap = new Map(players.map((p) => [p.id, p]));

    // Build final response
    const rankings = selectedEntries.map((entry) => {
      const player = playerMap.get(entry.playerId);
      return {
        rank: entry.position,
        playerId: entry.playerId,
        playerName: player?.name || "Unknown",
        nickname: player?.nickname || player?.name || "Unknown",
        totalPoints: entry.totalPoints,
        tournamentsCount: entry.tournamentsCount,
        stageHistory: entry.stageHistory,
        rankingStatus: entry.stageHistory?.some(s => s.isProvisional) ? "provisional" : "confirmed",
      };
    });

    const resultData = {
      rankings,
      total: rankedEntries.length,
      limit: Number(limit),
      offset: Number(offset),
      rankingWindow: "rolling_12_months",
      calculatedAt: now,
      sport: normalizedSport,
      includesProvisional: includeProvisional,
    };

    // Cache the result for 15 minutes to reduce DB load
    try {
      await cache.set(cacheKey, JSON.stringify(resultData), 'EX', 900);
    } catch (e) {
      console.warn('[RankingSnapshotService] Cache write failed:', e.message);
    }

    return {
      success: true,
      data: resultData,
    };
  }
}

module.exports = new RankingSnapshotService();
