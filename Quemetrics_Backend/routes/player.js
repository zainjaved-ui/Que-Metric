const express = require("express");
const router = express.Router();
const playerController = require("../controllers/playerController");
const tournamentController = require("../controllers/tournamentController");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validate");
const { upload, uploadErrorHandler } = require("../middleware/upload");

router.get("/me", authenticate, requireRole("player"), playerController.getMyProfile);
router.get("/me", authenticate, requireRole("player"), playerController.getMyProfile);
router.put("/me", authenticate, requireRole("player"), validate(schemas.updatePlayer), playerController.updateProfile);
router.get(
  "/all",
  authenticate,
  requireRole("super_admin", "organization"),
  playerController.getAllPlayers
);
router.get(
  "/diagnostics",
  authenticate,
  requireRole("super_admin"),
  playerController.getDiagnostics
);
router.get(
  "/club/:clubId",
  authenticate,
  playerController.getPlayersByClub
);

// OPTIMIZED: Get dashboard overview (leagues + standings + upcoming fixtures in 1 call)
router.get(
  "/dashboard/overview",
  authenticate,
  requireRole("player"),
  playerController.getDashboardOverview
);

// FILTERED: Get dashboard stats with league/tournament/game filters (excludes bye & walkover)
router.get(
  "/dashboard/filtered-stats",
  authenticate,
  requireRole("player"),
  playerController.getFilteredStats
);

// COMPREHENSIVE: Get full dashboard stats (streak, overall, season, H2H, trend, recent, bookings)
router.get(
  "/dashboard/stats",
  authenticate,
  requireRole("player"),
  playerController.getDashboardStats
);

// STATS ENGINE: Deep analysis of last 10 matches
router.get(
  "/dashboard/stats-engine",
  authenticate,
  requireRole("player"),
  playerController.getStatsEngine
);

// Toggle player status (activate/deactivate) — super_admin only
router.put("/:playerId/toggle-status", authenticate, requireRole("super_admin"), playerController.togglePlayerStatus);

// Avatar upload with error handling
router.post(
  "/me/avatar",
  authenticate,
  requireRole("player"),
  (req, res, next) => {
    upload.single("avatar")(req, res, (err) => {
      if (err) {
        return uploadErrorHandler(err, req, res, next);
      }
      next();
    });
  },
  playerController.uploadAvatar
);

// ============================================================================
// TOURNAMENT ROUTES
// ============================================================================

/**
 * GET /api/player/tournaments
 * Get player's tournament registrations
 */
router.get(
  "/tournaments",
  authenticate,
  requireRole("player"),
  tournamentController.getPlayerTournaments
);

/**
 * GET /api/player/tournament-matches
 * Get player's all active tournament matches across all tournaments
 */
router.get(
  "/tournament-matches",
  authenticate,
  requireRole("player"),
  tournamentController.getPlayerAllTournamentMatches
);

/**
 * GET /api/player/verify-tournament-add
 * Verify that a specific tournament was added to the player
 */
router.get(
  "/verify-tournament-add/:tournamentId",
  authenticate,
  requireRole("player"),
  async (req, res) => {
    try {
      const { userId } = req.user;
      const { tournamentId } = req.params;

      // Get player
      const player = await require("../models").Player.findOne({ where: { userId } });
      if (!player) {
        return res.json({ success: false, error: 'No player found' });
      }

      // Check if participant exists
      const participant = await require("../models").TournamentParticipant.findOne({
        where: { playerId: player.id, tournamentId },
      });

      if (!participant) {
        return res.json({
          success: false,
          found: false,
          message: 'Tournament not found for this player',
          playerId: player.id,
          tournamentId,
        });
      }

      // Get tournament details
      const tournament = await require("../models").Tournament.findByPk(tournamentId);

      res.json({
        success: true,
        found: true,
        message: 'Tournament found for this player',
        participant: {
          id: participant.id,
          status: participant.status,
          registrationMethod: participant.registrationMethod,
          registrationDate: participant.registrationDate,
        },
        tournament: {
          id: tournament.id,
          name: tournament.name,
        },
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/player/tournaments/register
 * Submit open registration request
 */
router.post(
  "/tournaments/register",
  authenticate,
  requireRole("player"),
  tournamentController.submitOpenRegistrationRequest
);

module.exports = router;
