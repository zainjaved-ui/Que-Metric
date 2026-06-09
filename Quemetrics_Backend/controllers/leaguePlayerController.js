const { Op } = require("sequelize");
const {
  League,
  LeaguePlayer,
  Player,
  Division,
  Organization,
  User,
  Fixture,
  Booking
} = require("../models");
const { sendLeagueEnrollmentEmail } = require("../utils/email");
const standingsService = require("../services/standingsService");
const fixtureService = require("../services/fixtureService");

// ============================================
// LEAGUE PLAYER OPERATIONS
// ============================================

async function buildEnrollmentPreview({ league, playerIds, divisionId = null }) {
  const [currentPlayerCount, completedFixturesCount, scheduledFixturesCount, bookingCount] = await Promise.all([
    LeaguePlayer.count({ where: { leagueId: league.id } }),
    Fixture.count({ where: { leagueId: league.id, status: 'completed' } }),
    Fixture.count({ where: { leagueId: league.id, status: 'scheduled' } }),
    Booking.count({ where: { leagueId: league.id } })
  ]);

  const selectedPlayers = await Player.findAll({
    where: { id: { [Op.in]: playerIds } },
    include: [{ model: User, as: 'user', attributes: ['email'] }]
  });

  if (selectedPlayers.length !== playerIds.length) {
    const selectedIds = new Set(selectedPlayers.map(player => player.id));
    const missingPlayerIds = playerIds.filter(playerId => !selectedIds.has(playerId));
    throw new Error(`Player not found: ${missingPlayerIds[0]}`);
  }

  let resolvedDivision = null;
  if (divisionId) {
    const division = await Division.findOne({ where: { id: divisionId, leagueId: league.id } });
    if (!division) {
      throw new Error('Division not found in this league');
    }

    resolvedDivision = {
      id: division.id,
      name: division.name,
      maxPlayers: division.maxPlayers || null
    };
  }

  const lateJoinBlocked = league.status === 'active' && !league.lateJoinAllowed;
  const canProceed = completedFixturesCount === 0 && !lateJoinBlocked;

  return {
    canProceed,
    blockedReason: canProceed
      ? null
      : lateJoinBlocked
        ? 'Late enrollment is disabled for this league.'
        : 'This enrollment method is unavailable because the league already has completed matches.',
    mode: 'analyze_preview',
    bookingsPreserved: bookingCount,
    currentPlayerCount,
    selectedPlayerCount: selectedPlayers.length,
    projectedPlayerCount: currentPlayerCount + selectedPlayers.length,
    completedFixturesCount,
    scheduledFixturesCount,
    division: resolvedDivision,
    isLateEnrollment: league.status === 'active',
    selectedPlayers: selectedPlayers.map(player => ({
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      email: player.user?.email || null
    }))
  };
}

/**
 * Add player to league
 * - For Snooker/Pool: assign to division
 * - For Poker: register with seat and table assignment
 */
/**
 * Add player to league
 * - For Snooker/Pool: auto-assign to division OR require divisionId
 * - For Poker: register directly to league without division
 */
exports.addPlayerToLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { playerId, divisionId, ranking, seatPosition, tableNumber, preserveBookings = false } = req.body;

    // Verify organization owns this league
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
      include: [{
        association: "divisions",
        separate: true,
        order: [['createdAt', 'ASC']]
      }]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    // Check if player exists and get their user email
    const player = await Player.findByPk(playerId, {
      include: [{ model: User, as: "user", attributes: ["email"] }]
    });
    if (!player) {
      return res.status(404).json({ success: false, error: "Player not found" });
    }

    // Verify league status and late join compatibility
    if (league.status === "active") {
      // Requirement: IF full schedule selected -> late join SHOULD be disabled
      // (Unless we have an explicit migration/substitution system, but for now block to ensure fairness)
      if (league.fixtureStrategy === 'full_schedule' && !league.lateJoinAllowed) {
        return res.status(400).json({
          success: false,
          error: "Late joining is disabled for this league as fixtures are already locked in full schedule."
        });
      }
    }

    if (league.status === "completed" || league.status === "cancelled") {
      return res.status(400).json({
        success: false,
        error: "Cannot add players to completed or cancelled leagues"
      });
    }

    // Check if player already enrolled
    const existingEnrollment = await LeaguePlayer.findOne({
      where: { leagueId, playerId }
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        error: "Player already enrolled in this league"
      });
    }

    // ===== DIVISION ASSIGNMENT LOGIC =====
    let finalDivisionId = divisionId || null;
    const isDivisionBasedLeague = league.sport && ['snooker', 'pool'].includes(league.sport.toLowerCase());
    const isLateEnrollment = league.status === 'active';

    // Always allow auto-assignment if no divisionId is provided, even for late joiners.
    // This ensures players are placed in a division rather than left unassigned.
    if (!divisionId && league.divisions && league.divisions.length > 0) {
      // League has divisions enabled and no specific division provided
      if (isDivisionBasedLeague) {
        // For Snooker/Pool: AUTO-ASSIGN to least-filled division
        console.log(`[addPlayerToLeague] Snooker/Pool league detected. Auto-assigning player ${playerId} to division`);

        // Get player counts for each division
        const divisionCounts = {};
        league.divisions.forEach(d => {
          divisionCounts[d.id] = 0;
        });

        const existingPlayers = await LeaguePlayer.findAll({
          where: { leagueId },
          attributes: ['divisionId', 'id']
        });

        existingPlayers.forEach(lp => {
          if (lp.divisionId && divisionCounts.hasOwnProperty(lp.divisionId)) {
            divisionCounts[lp.divisionId]++;
          }
        });

        // Find division with minimum players
        let targetDivision = league.divisions[0];
        let minCount = Infinity;

        for (const division of league.divisions) {
          const count = divisionCounts[division.id] || 0;
          if (count < minCount) {
            minCount = count;
            targetDivision = division;
          }
        }

        finalDivisionId = targetDivision.id;
        console.log(`[addPlayerToLeague] Auto-assigned player ${playerId} to division ${finalDivisionId} (${minCount} existing players)`);
      }
      // For Poker: divisionId stays null (optional)
    }

    // Validate division if divisionId is provided
    if (divisionId) {
      const division = await Division.findOne({
        where: { id: divisionId, leagueId }
      });

      if (!division) {
        return res.status(404).json({
          success: false,
          error: "Division not found in this league"
        });
      }

      // Check division capacity
      if (division.maxPlayers) {
        const currentPlayers = await LeaguePlayer.count({ where: { divisionId } });
        if (currentPlayers >= division.maxPlayers) {
          return res.status(400).json({
            success: false,
            error: "Division is full"
          });
        }
      }
    }

    if (isLateEnrollment && !league.lateJoinAllowed) {
      return res.status(400).json({
        success: false,
        error: "Late enrollment not allowed for this league"
      });
    }

    // Create league player entry with proper division assignment
    // Detect if this is a late joiner into an active full-schedule league
    const isFullScheduleLateJoin = isLateEnrollment && league.fixtureStrategy === 'full_schedule';

    const createData = {
      leagueId,
      playerId,
      divisionId: finalDivisionId, // Use the auto-assigned or provided division ID
      ranking: ranking || null,
      status: isLateEnrollment ? "late_enrollment" : "active",
      enrollmentDate: new Date(),
      // Polish: flag partial participation for late joiners in full-schedule leagues
      // They won't have played all fixtures, so their stats will be incomplete.
      partialParticipation: isFullScheduleLateJoin,
      // By default, partial participants are still included in rankings.
      // Admin can toggle excludeFromRankings via the standings override if desired.
      excludeFromRankings: false
    };

    if (isFullScheduleLateJoin) {
      console.log(`[addPlayerToLeague] ⚠️  Late joiner in full_schedule league — partialParticipation=true for player ${playerId}`);
    }


    // Pooker and other cue sports don't use seat/table assignments at enrollment time
    // instead they use standard fixture scheduling.

    const leaguePlayer = await LeaguePlayer.create(createData);
    console.log(`[addPlayerToLeague] Player ${playerId} added to league ${leagueId} with divisionId: ${finalDivisionId}`);

    // Send enrollment email
    if (player.user && player.user.email) {
      const division = finalDivisionId ? (league.divisions || []).find(d => d.id === finalDivisionId) : null;
      try {
        await sendLeagueEnrollmentEmail({
          email: player.user.email,
          name: player.name,
          leagueName: league.name || (league.basicInfo && league.basicInfo.leagueName),
          organizerName: organization.organizationName,
          divisionName: division ? division.name : null
        });
        console.log(`[addPlayerToLeague] Enrollment email sent to ${player.user.email}`);
      } catch (emailError) {
        console.error(`[addPlayerToLeague] Failed to send enrollment email:`, emailError.message);
      }
    }

    // ===== FIXTURE GENERATION FOR NEWLY ADDED PLAYER (if late join) =====
    if (isLateEnrollment && league.lateJoinAllowed) {
      try {
        console.log(`[addPlayerToLeague] Active league detected with late join. Injecting player ${playerId} into future rounds...`);
        const { injectLateJoiner } = require("../services/fixtureGenerator");
        await injectLateJoiner(leagueId, playerId, finalDivisionId);
        console.log(`[addPlayerToLeague] Player ${playerId} injected into future rounds successfully`);
      } catch (genError) {
        console.error("Fixture injection failed after late player add:", genError.message);
        // Don't fail the whole operation if fixture generation fails
      }
    }

    const result = await LeaguePlayer.findByPk(leaguePlayer.id, {
      include: [
        { association: "player", attributes: ["id", "name", "nickname"] },
        { association: "division", attributes: ["id", "name"] }
      ]
    });

    return res.status(201).json({
      success: true,
      data: result,
      divisionAssigned: !!finalDivisionId,
      isLateEnrollment,
      message: finalDivisionId
        ? `Player added to league and auto-assigned to division`
        : `Player added to league successfully (no division assignment)`
    });
  } catch (error) {
    console.error("addPlayerToLeague error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

exports.analyzeLateEnrollment = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId } = req.params;
    const { playerIds, playerId, divisionId = null } = req.body;

    const requestedPlayerIds = Array.isArray(playerIds)
      ? playerIds.filter(Boolean)
      : (playerId ? [playerId] : []);

    if (requestedPlayerIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one player is required for enrollment analysis'
      });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const league = await League.findOne({
      where: { id: leagueId, organizationId: organization.id },
      include: [{
        association: 'divisions',
        separate: true,
        order: [['createdAt', 'ASC']]
      }]
    });

    if (!league) {
      return res.status(404).json({ success: false, error: 'League not found' });
    }

    const existingEnrollment = await LeaguePlayer.findOne({
      where: {
        leagueId,
        playerId: { [Op.in]: requestedPlayerIds }
      }
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        error: 'One or more selected players are already enrolled in this league'
      });
    }

    const preview = await buildEnrollmentPreview({
      league,
      playerIds: requestedPlayerIds,
      divisionId
    });

    return res.status(200).json({
      success: true,
      data: preview,
      message: preview.canProceed
        ? 'Enrollment analysis generated successfully'
        : preview.blockedReason
    });
  } catch (error) {
    console.error('analyzeLateEnrollment error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
};

/**
 * Get all players in a league
 */
exports.getLeaguePlayers = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { divisionId, status } = req.query;

    const where = { leagueId };
    if (divisionId) where.divisionId = divisionId;
    if (status) where.status = status;

    const players = await LeaguePlayer.findAll({
      where,
      include: [
        { association: "player", attributes: ["id", "name", "nickname", "avatarUrl"] },
        { association: "division", attributes: ["id", "name"] }
      ],
      order: [
        ["points", "DESC"],
        ["matchesWon", "DESC"]
      ]
    });

    res.json({ success: true, data: players, message: "League players retrieved" });
  } catch (error) {
    console.error("getLeaguePlayers error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Update player in league (reassign division, update stats, etc.)
 */
exports.updateLeaguePlayer = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, leaguePlayerId } = req.params;
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

    const leaguePlayer = await LeaguePlayer.findOne({
      where: { id: leaguePlayerId, leagueId }
    });

    if (!leaguePlayer) {
      return res.status(404).json({ success: false, error: "League player not found" });
    }

    // Validate division change if provided
    if (updateData.divisionId) {
      const division = await Division.findOne({
        where: { id: updateData.divisionId, leagueId }
      });

      if (!division) {
        return res.status(404).json({
          success: false,
          error: "Target division not found"
        });
      }
    }

    await leaguePlayer.update(updateData);

    const result = await LeaguePlayer.findByPk(leaguePlayer.id, {
      include: [
        { association: "player" },
        { association: "division" }
      ]
    });

    res.json({ success: true, data: result, message: "League player updated" });
  } catch (error) {
    console.error("updateLeaguePlayer error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Manually override player standings/points
 * POST /leagues/:leagueId/players/:leaguePlayerId/override
 */
exports.overridePlayerStandings = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, leaguePlayerId } = req.params;
    const { manualPointsAdjustment, adjustmentNotes } = req.body;

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

    // Check if admin override is enabled in advanced settings
    let advanced = league.advanced || {};
    if (typeof advanced === 'string') {
      try { advanced = JSON.parse(advanced); } catch (e) { advanced = {}; }
    }

    if (!advanced.adminOverrideStandings) {
      return res.status(403).json({
        success: false,
        error: "Standings override is not enabled for this league. Please enable it in Advanced Settings first."
      });
    }

    const leaguePlayer = await LeaguePlayer.findOne({
      where: { id: leaguePlayerId, leagueId }
    });

    if (!leaguePlayer) {
      return res.status(404).json({ success: false, error: "League player not found" });
    }

    // Check if player has withdrawn
    if (leaguePlayer.status === 'withdrawn') {
      return res.status(400).json({
        success: false,
        error: "Cannot override standings for withdrawn players. This player has withdrawn from the league."
      });
    }

    // Update adjustment fields
    await leaguePlayer.update({
      manualPointsAdjustment: parseInt(manualPointsAdjustment, 10) || 0,
      adjustmentNotes: adjustmentNotes || null
    });

    // Trigger standings recalculation to apply the override
    await standingsService.updateLeagueStandings(leagueId);

    const result = await LeaguePlayer.findByPk(leaguePlayer.id, {
      include: [
        { association: "player", attributes: ["id", "name", "nickname"] },
        { association: "division", attributes: ["id", "name"] }
      ]
    });

    res.json({
      success: true,
      data: result,
      message: "Player standings overridden successfully"
    });
  } catch (error) {
    console.error("overridePlayerStandings error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Withdraw player from league
 * POST /leagues/:leagueId/players/:leaguePlayerId/withdraw
 */
exports.withdrawPlayer = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, leaguePlayerId } = req.params;

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
      return res.status(404).json({ success: false, error: "League player not found" });
    }

    // Update status to withdrawn
    await leaguePlayer.update({ status: "withdrawn" });

    // Handle upcoming fixtures (mark as byes for opponents and advance them if knockout)
    await fixtureService.handlePlayerWithdrawalFromFixtures(leagueId, leaguePlayer.playerId);

    // Trigger standings recalculation (it will respect withdrawalBehaviour)
    await standingsService.updateLeagueStandings(leagueId);

    res.json({
      success: true,
      data: leaguePlayer,
      message: "Player withdrawn from league successfully"
    });
  } catch (error) {
    console.error("withdrawPlayer error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Remove player from league
 */
exports.removePlayerFromLeague = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, leaguePlayerId } = req.params;

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

    if (league.status === "active") {
      return res.status(400).json({
        success: false,
        error: "Cannot remove players from active leagues. Use withdraw status instead."
      });
    }

    const leaguePlayer = await LeaguePlayer.findOne({
      where: { id: leaguePlayerId, leagueId }
    });

    if (!leaguePlayer) {
      return res.status(404).json({ success: false, error: "League player not found" });
    }

    await leaguePlayer.destroy();

    // Trigger fixture regeneration for rolling leagues or auto-scheduling leagues if already active
    let fixturesRegenerated = false;
    const isAutoScheduling = league.scheduling?.generation === 'auto' || league.scheduling?.mode === 'auto';

    if ((league.leagueType === "rolling" || isAutoScheduling) && league.status === "active") {
      try {
        const { generateFixturesForLeague } = require("../services/fixtureGenerator");
        await generateFixturesForLeague(leagueId, null, { incremental: true });
        fixturesRegenerated = true;
      } catch (genError) {
        console.error("Fixture regeneration failed after player removal:", genError);
      }
    }

    res.json({
      success: true,
      data: null,
      fixturesRegenerated,
      message: "Player removed from league"
    });
  } catch (error) {
    console.error("removePlayerFromLeague error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Add player directly to a division
 * Shortcut endpoint that adds player to league AND assigns to division in one call
 */
exports.addPlayerToDivision = async (req, res) => {
  try {
    const { userId } = req.user;
    const { leagueId, divisionId } = req.params;
    const { playerId, ranking } = req.body;

    // Verify organization owns this league
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

    // Verify division belongs to this league
    const division = await Division.findOne({
      where: { id: divisionId, leagueId }
    });

    if (!division) {
      return res.status(404).json({
        success: false,
        error: "Division not found in this league"
      });
    }

    // Check player exists
    const player = await Player.findByPk(playerId);
    if (!player) {
      return res.status(404).json({ success: false, error: "Player not found" });
    }

    // Check if player already enrolled in this league
    const existingEnrollment = await LeaguePlayer.findOne({
      where: { leagueId, playerId }
    });

    if (existingEnrollment) {
      // If player exists but in different or no division, move them to this division
      if (existingEnrollment.divisionId !== divisionId) {
        existingEnrollment.divisionId = divisionId;
        if (ranking !== undefined) existingEnrollment.ranking = ranking;
        await existingEnrollment.save();

        const updatedPlayer = await LeaguePlayer.findByPk(existingEnrollment.id, {
          include: [
            { association: "player", attributes: ["id", "name", "nickname"] },
            { association: "division", attributes: ["id", "name"] }
          ]
        });

        return res.status(200).json({
          success: true,
          data: updatedPlayer,
          message: "Player reassigned to division successfully"
        });
      } else {
        return res.status(400).json({
          success: false,
          error: "Player already in this division"
        });
      }
    }

    // Check division capacity
    if (division.maxPlayers) {
      const currentPlayers = await LeaguePlayer.count({ where: { divisionId } });
      if (currentPlayers >= division.maxPlayers) {
        return res.status(400).json({
          success: false,
          error: "Division is full"
        });
      }
    }

    // Create new league player entry
    const isLateEnrollment = league.status === "active";

    if (isLateEnrollment && !league.lateJoinAllowed) {
      return res.status(400).json({
        success: false,
        error: "Late enrollment not allowed for this league"
      });
    }

    const leaguePlayer = await LeaguePlayer.create({
      leagueId,
      playerId,
      divisionId,
      ranking: ranking || null,
      status: isLateEnrollment ? "late_enrollment" : "active",
      enrollmentDate: new Date()
    });

    const result = await LeaguePlayer.findByPk(leaguePlayer.id, {
      include: [
        { association: "player", attributes: ["id", "name", "nickname"] },
        { association: "division", attributes: ["id", "name"] }
      ]
    });

    res.status(201).json({
      success: true,
      data: result,
      message: "Player added to division successfully"
    });
  } catch (error) {
    console.error("addPlayerToDivision error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Get all players in a specific division
 */
exports.getDivisionPlayers = async (req, res) => {
  try {
    const { leagueId, divisionId } = req.params;

    // Verify division exists and belongs to league
    const division = await Division.findOne({
      where: { id: divisionId, leagueId }
    });

    if (!division) {
      return res.status(404).json({
        success: false,
        error: "Division not found in this league"
      });
    }

    const players = await LeaguePlayer.findAll({
      where: {
        divisionId,
        leagueId,
        status: { [Op.ne]: "withdrawn" }
      },
      include: [
        { association: "player", attributes: ["id", "name", "nickname", "avatarUrl"] }
      ],
      order: [
        ["points", "DESC"],
        ["matchesWon", "DESC"]
      ]
    });

    res.json({
      success: true,
      data: {
        division: {
          id: division.id,
          name: division.name,
          numberOfFrames: division.numberOfFrames,
          raceLength: division.raceLength,
          maxPlayers: division.maxPlayers,
          currentPlayers: players.length
        },
        players
      },
      message: "Division players retrieved"
    });
  } catch (error) {
    console.error("getDivisionPlayers error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get league standings/rankings
 * Calculates stats from actual match results to ensure accuracy
 */
exports.getLeagueStandings = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { divisionId, recalculate } = req.query;

    if (recalculate === 'true') {
      await standingsService.updateLeagueStandings(leagueId);
    }

    const league = await require('../models').League.findByPk(leagueId);
    if (!league) {
      return res.status(404).json({ success: false, error: "League not found" });
    }

    const standings = await standingsService.getSortedStandings(leagueId, divisionId);

    // Return both standings data and display configuration
    res.json({
      success: true,
      data: {
        standings: standings,
        standingsDisplay: league.standingsDisplay || {
          columns: ['matchesPlayed', 'wins', 'losses', 'draws', 'points', 'framesWon', 'framesConceded', 'frameDifference', 'whitewashes', 'highestBreak', 'winPercent', 'streak', 'walkoverWins', 'walkoverLosses']
        }
      },
      message: "League standings retrieved"
    });
  } catch (error) {
    console.error("getLeagueStandings error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

module.exports = exports;
