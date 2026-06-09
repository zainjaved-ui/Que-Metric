const { Op } = require("sequelize");
const {
  League,
  PokerTournamentStructure,
  LeaguePlayer,
  Organization
} = require("../models");

// ============================================
// POKER TOURNAMENT STRUCTURE
// ============================================

/**
 * Create tournament structure for Poker league
 */
exports.createTournamentStructure = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const {
      tournamentType,
      startingChips,
      blindLevels,
      blindDuration,
      maxPlayersPerTable,
      buyInAmount,
      rebuyAllowed,
      rebuyPeriod,
      prizeStructure
    } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.sport !== "poker") {
      return res.status(400).json({
        success: false,
        error: "Tournament structure is only for Poker leagues"
      });
    }

    if (league.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "Can only create structure for draft leagues"
      });
    }

    // Check if structure already exists
    const existingStructure = await PokerTournamentStructure.findOne({
      where: { leagueId }
    });

    if (existingStructure) {
      return res.status(400).json({
        success: false,
        error: "Tournament structure already exists. Use update endpoint."
      });
    }

    // Validate blind levels structure
    if (!Array.isArray(blindLevels) || blindLevels.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Blind levels must be a non-empty array"
      });
    }

    // Create tournament structure
    const structure = await PokerTournamentStructure.create({
      leagueId,
      tournamentType: tournamentType || league.tournamentType,
      startingChips: startingChips || 10000,
      blindLevels,
      blindDuration: blindDuration || 15,
      maxPlayersPerTable: maxPlayersPerTable || 9,
      buyInAmount: buyInAmount || league.buyInAmount,
      rebuyAllowed: rebuyAllowed || false,
      rebuyPeriod: rebuyPeriod || null,
      prizeStructure: prizeStructure || null
    });

    res.status(201).json({
      success: true,
      data: structure,
      message: "Tournament structure created successfully"
    });
  } catch (error) {
    console.error("createTournamentStructure error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Get tournament structure for a league
 */
exports.getTournamentStructure = async (req, res) => {
  try {
    const { leagueId } = req.params;

    const structure = await PokerTournamentStructure.findOne({
      where: { leagueId },
      include: [{ association: "league" }]
    });

    if (!structure) {
      return res.status(404).json({
        success: false,
        error: "Tournament structure not found"
      });
    }

    res.json({ success: true, data: structure, message: "Tournament structure retrieved" });
  } catch (error) {
    console.error("getTournamentStructure error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Update tournament structure
 */
exports.updateTournamentStructure = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const updateData = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.status === "active" || league.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Cannot modify structure of active or completed tournaments"
      });
    }

    const structure = await PokerTournamentStructure.findOne({
      where: { leagueId }
    });

    if (!structure) {
      return res.status(404).json({
        success: false,
        error: "Tournament structure not found"
      });
    }

    await structure.update(updateData);

    res.json({
      success: true,
      data: structure,
      message: "Tournament structure updated"
    });
  } catch (error) {
    console.error("updateTournamentStructure error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Delete tournament structure
 */
exports.deleteTournamentStructure = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "Can only delete structure from draft leagues"
      });
    }

    const structure = await PokerTournamentStructure.findOne({
      where: { leagueId }
    });

    if (!structure) {
      return res.status(404).json({
        success: false,
        error: "Tournament structure not found"
      });
    }

    await structure.destroy();

    res.json({
      success: true,
      data: null,
      message: "Tournament structure deleted"
    });
  } catch (error) {
    console.error("deleteTournamentStructure error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Balance poker tables (redistribute players across tables)
 */
exports.balanceTables = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
      include: [{ association: "pokerStructure" }]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.sport !== "poker") {
      return res.status(400).json({
        success: false,
        error: "Table balancing is only for Poker tournaments"
      });
    }

    const activePlayers = await LeaguePlayer.findAll({
      where: {
        leagueId,
        isEliminated: false,
        status: { [Op.in]: ["active", "late_enrollment"] }
      },
      order: [["tableNumber", "ASC"], ["seatPosition", "ASC"]]
    });

    if (activePlayers.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No active players to balance"
      });
    }

    const maxPlayersPerTable = league.pokerStructure.maxPlayersPerTable || 9;
    const numTables = Math.ceil(activePlayers.length / maxPlayersPerTable);

    // Redistribute players evenly across tables
    let tableNum = 1;
    let seatNum = 1;

    for (const player of activePlayers) {
      await player.update({
        tableNumber: tableNum,
        seatPosition: seatNum
      });

      seatNum++;
      if (seatNum > maxPlayersPerTable) {
        seatNum = 1;
        tableNum++;
      }
    }

    const balancedPlayers = await LeaguePlayer.findAll({
      where: { leagueId, isEliminated: false },
      include: [{ association: "player", attributes: ["id", "name"] }],
      order: [["tableNumber", "ASC"], ["seatPosition", "ASC"]]
    });

    res.json({
      success: true,
      data: {
        players: balancedPlayers,
        numTables,
        playersPerTable: maxPlayersPerTable
      },
      message: "Tables balanced successfully"
    });
  } catch (error) {
    console.error("balanceTables error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Eliminate player from poker tournament
 */
exports.eliminatePlayer = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, leaguePlayerId } = req.params;
    const { eliminationPosition } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.sport !== "poker") {
      return res.status(400).json({
        success: false,
        error: "Player elimination is only for Poker tournaments"
      });
    }

    const leaguePlayer = await LeaguePlayer.findOne({
      where: { id: leaguePlayerId, leagueId }
    });

    if (!leaguePlayer) {
      return res.status(404).json({ success: false, error: "Player not found in tournament" });
    }

    await leaguePlayer.update({
      isEliminated: true,
      status: "eliminated",
      eliminationPosition: eliminationPosition || null,
      currentChips: 0
    });

    res.json({
      success: true,
      data: leaguePlayer,
      message: "Player eliminated from tournament"
    });
  } catch (error) {
    console.error("eliminatePlayer error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Update player chip count
 */
exports.updateChipCount = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, leaguePlayerId } = req.params;
    const { currentChips } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id }
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    const leaguePlayer = await LeaguePlayer.findOne({
      where: { id: leaguePlayerId, leagueId }
    });

    if (!leaguePlayer) {
      return res.status(404).json({ success: false, error: "Player not found" });
    }

    await leaguePlayer.update({ currentChips });

    // Auto-eliminate if chips reach 0
    if (currentChips <= 0) {
      await leaguePlayer.update({
        isEliminated: true,
        status: "eliminated"
      });
    }

    res.json({
      success: true,
      data: leaguePlayer,
      message: "Chip count updated"
    });
  } catch (error) {
    console.error("updateChipCount error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

module.exports = exports;
