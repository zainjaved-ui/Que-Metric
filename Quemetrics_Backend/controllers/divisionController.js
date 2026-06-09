const { Op } = require("sequelize");
const sequelize = require("../config/db");
const {
  League,
  Division,
  LeaguePlayer,
  Player,
  Fixture,
  Organization
} = require("../models");

// ============================================
// DIVISION OPERATIONS (SNOOKER & POOL ONLY)
// ============================================

/**
 * Create Division for Snooker or Pool League
 * Snooker: divisionName, numberOfFrames
 * Pool: divisionName, raceLength
 */
exports.createDivision = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { name, numberOfFrames, raceLength, maxPlayers, description } = req.body;

    // Verify organization owns this league
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "Can only add divisions to draft leagues"
      });
    }

    // Pooker is a cue sport and uses divisions similar to snooker/pool.
    // Legacy card game 'poker' did not use divisions.

    const leagueSport = String(league.sport || '').toLowerCase();
    // Validate game-specific fields
    if (["snooker", "pooker"].includes(leagueSport) && !numberOfFrames) {
      return res.status(400).json({
        success: false,
        error: `Number of frames required for ${league.sport} divisions`
      });
    }

    if (leagueSport === "pool" && !raceLength) {
      return res.status(400).json({
        success: false,
        error: "Race length required for Pool divisions"
      });
    }

    const division = await Division.create({
      leagueId,
      name,
      numberOfFrames: ["snooker", "pooker"].includes(leagueSport) ? numberOfFrames : null,
      raceLength: leagueSport === "pool" ? raceLength : null,
      maxPlayers,
      description,
      status: "active"
    });

    res.status(201).json({
      success: true,
      data: division,
      message: "Division created successfully"
    });
  } catch (error) {
    console.error("createDivision error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Get all divisions for a league
 */
exports.getDivisions = async (req, res) => {
  try {
    const { leagueId } = req.params;

    const divisions = await Division.findAll({
      where: { leagueId },
      include: [
        {
          model: LeaguePlayer,
          as: "players",
          include: [
            { 
              model: Player, 
              as: "player", 
              attributes: ["id", "name", "nickname"] 
            }
          ]
        }
      ],
      order: [["createdAt", "ASC"]],
    });

    res.json({ success: true, data: divisions, message: "Divisions retrieved" });
  } catch (error) {
    console.error("getDivisions error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Update division
 */
exports.updateDivision = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, divisionId } = req.params;
    const updateData = req.body;

    // Verify organization owns this league
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    const division = await Division.findOne({
      where: { id: divisionId, leagueId }
    });

    if (!division) {
      return res.status(404).json({ success: false, error: "Division not found" });
    }

    await division.update(updateData);

    res.json({ success: true, data: division, message: "Division updated" });
  } catch (error) {
    console.error("updateDivision error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Delete division
 */
exports.deleteDivision = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, divisionId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    if (league.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "Can only delete divisions from draft leagues"
      });
    }

    const division = await Division.findOne({
      where: { id: divisionId, leagueId }
    });

    if (!division) {
      return res.status(404).json({ success: false, error: "Division not found" });
    }

    // Check if division has players
    const playerCount = await LeaguePlayer.count({ where: { divisionId } });
    if (playerCount > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete division with assigned players. Remove players first."
      });
    }

    await division.destroy();

    res.json({ success: true, data: null, message: "Division deleted" });
  } catch (error) {
    console.error("deleteDivision error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

module.exports = exports;
