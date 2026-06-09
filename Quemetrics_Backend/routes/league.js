const express = require("express");
const router = express.Router();
const leagueController = require("../controllers/leagueController");
const divisionController = require("../controllers/divisionController");
const leaguePlayerController = require("../controllers/leaguePlayerController");
const fixtureController = require("../controllers/fixtureController");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validate");
const { auditLog, captureOldValue } = require("../middleware/auditLogger");
const { League } = require("../models");

// Helper to get league by ID for audit logging
const getLeagueById = async (req) => {
  return await League.findByPk(req.params.leagueId);
};

// ============================================
// WIZARD ROUTES (NEW)
// ============================================

// Get clubs for wizard dropdown
router.get(
  "/wizard/clubs",
  authenticate,
  requireRole("organization"),
  leagueController.getWizardClubs
);

// Get seasons for a specific game
router.get(
  "/wizard/games/:gameName/seasons",
  authenticate,
  requireRole("organization"),
  leagueController.getGameSeasons
);

// Create wizard league (Step 1 - Basic Info only)
router.post(
  "/wizard",
  authenticate,
  requireRole("organization"),
  auditLog("wizard_league_created", "league"),
  leagueController.createWizardLeague
);

// Update wizard league (any step)
router.patch(
  "/wizard/:leagueId",
  authenticate,
  requireRole("organization"),
  captureOldValue(getLeagueById),
  auditLog("wizard_league_updated", "league"),
  leagueController.updateWizardLeague
);

// Activate wizard league
router.post(
  "/wizard/:leagueId/activate",
  authenticate,
  requireRole("organization"),
  auditLog("wizard_league_activated", "league"),
  leagueController.activateWizardLeague
);

// ============================================
// LEAGUE ROUTES (Common for all sports)
// ============================================

// Create new league (Snooker/Pool/Poker)
router.post(
  "/",
  authenticate,
  requireRole("organization"),
  auditLog("league_created", "league"),
  leagueController.createLeague
);

// Get all leagues with filters
router.get("/", authenticate, leagueController.getLeagues);

// Get single league by ID
router.get("/:leagueId", authenticate, leagueController.getLeagueById);

// Update league
router.put(
  "/:leagueId",
  authenticate,
  requireRole("organization"),
  captureOldValue(getLeagueById),
  auditLog("league_updated", "league"),
  leagueController.updateLeague
);

// Delete league
router.delete(
  "/:leagueId",
  authenticate,
  requireRole("organization"),
  captureOldValue(getLeagueById),
  auditLog("league_deleted", "league"),
  leagueController.deleteLeague
);

// Publish league (Draft → Registration Open)
router.post(
  "/:leagueId/publish",
  authenticate,
  requireRole("organization"),
  auditLog("league_published", "league"),
  leagueController.publishLeague
);

// Start league (Registration Open → Active)
router.post(
  "/:leagueId/start",
  authenticate,
  requireRole("organization"),
  auditLog("league_started", "league"),
  leagueController.startLeague
);

// Progress to next round (Active → Increment Round)
router.post(
  "/:leagueId/next-round",
  authenticate,
  requireRole("organization"),
  auditLog("league_next_round", "league"),
  leagueController.nextRound
);

// Advance Group Stage → Seed Knockout Bracket (groupsKnockout format only)
router.post(
  "/:leagueId/advance-to-knockout",
  authenticate,
  requireRole("organization"),
  auditLog("league_advance_to_knockout", "league"),
  leagueController.advanceToKnockout
);

// Join a league via shareable invite link (no leagueId needed — token identifies the league)
router.post(
  "/join-by-token",
  authenticate,
  leagueController.joinByToken
);

// Join a league via short invite code
router.post(
  "/join-by-code",
  authenticate,
  leagueController.joinByCode
);

// Player self-join a league
router.post(
  "/:leagueId/join",
  authenticate,
  leagueController.joinLeague
);

// Player self-leave a league
router.post(
  "/:leagueId/leave",
  authenticate,
  leagueController.leaveLeague
);

// Finalize league (Active → Completed, triggers promotion/relegation)
router.post(
  "/:leagueId/finalize",
  authenticate,
  requireRole("organization"),
  auditLog("league_finalized", "league"),
  leagueController.finalizeLeague
);

// ============================================
// DIVISION ROUTES (Snooker & Pool)
// ============================================

// Create division
router.post(
  "/:leagueId/divisions",
  authenticate,
  requireRole("organization"),
  auditLog("division_created", "division"),
  divisionController.createDivision
);

// Get all divisions for a league
router.get(
  "/:leagueId/divisions",
  authenticate,
  divisionController.getDivisions
);

// Update division
router.put(
  "/:leagueId/divisions/:divisionId",
  authenticate,
  requireRole("organization"),
  auditLog("division_updated", "division"),
  divisionController.updateDivision
);

// Delete division
router.delete(
  "/:leagueId/divisions/:divisionId",
  authenticate,
  requireRole("organization"),
  auditLog("division_deleted", "division"),
  divisionController.deleteDivision
);

// ============================================
// LEAGUE PLAYER ROUTES (All sports)
// ============================================

// Add player to league
router.post(
  "/:leagueId/players",
  authenticate,
  requireRole("organization"),
  auditLog("player_added_to_league", "league_player"),
  leaguePlayerController.addPlayerToLeague
);

// Analyze and preview a late enrollment without mutating bookings
router.post(
  "/:leagueId/players/analyze",
  authenticate,
  requireRole("organization"),
  leaguePlayerController.analyzeLateEnrollment
);

// Invite a player by email to join the league (sends invitation email)
router.post(
  "/:leagueId/invite",
  authenticate,
  requireRole("organization"),
  leagueController.invitePlayerByEmail
);

// Get count of all pending join requests for an organization's leagues
router.get(
  "/organization/join-requests/count",
  authenticate,
  requireRole("organization"),
  leagueController.getOrganizationJoinRequestCount
);

// Get join requests for a league (admin only)
router.get(
  "/:leagueId/join-requests",
  authenticate,
  requireRole("organization"),
  leagueController.getJoinRequests
);

// Approve or reject a join request
router.post(
  "/:leagueId/join-requests/:leaguePlayerId/approve",
  authenticate,
  requireRole("organization"),
  auditLog("join_request_approved", "league_player"),
  leagueController.approveJoinRequest
);

// Manually regenerate fixtures for a league (incremental mode)
router.post(
  "/:leagueId/regenerate-fixtures",
  authenticate,
  requireRole("organization"),
  auditLog("fixtures_regenerated", "league"),
  leagueController.regenerateLeagueFixtures
);

// Get all players in league
router.get(
  "/:leagueId/players",
  authenticate,
  leaguePlayerController.getLeaguePlayers
);

// Get league standings/rankings
router.get(
  "/:leagueId/standings",
  authenticate,
  leaguePlayerController.getLeagueStandings
);

// Override standings - manually adjust player points/rankings
router.post(
  "/:leagueId/standings/override",
  authenticate,
  requireRole("organization"),
  auditLog("standings_overridden", "league_player"),
  leagueController.overrideStandings
);

// Update league player
router.put(
  "/:leagueId/players/:leaguePlayerId",
  authenticate,
  requireRole("organization"),
  auditLog("league_player_updated", "league_player"),
  leaguePlayerController.updateLeaguePlayer
);

// Remove player from league
router.delete(
  "/:leagueId/players/:leaguePlayerId",
  authenticate,
  requireRole("organization"),
  auditLog("player_removed_from_league", "league_player"),
  leaguePlayerController.removePlayerFromLeague
);

// Manually override player standings/points
router.post(
  "/:leagueId/players/:leaguePlayerId/override",
  authenticate,
  requireRole("organization"),
  auditLog("player_standings_overridden", "league_player"),
  leaguePlayerController.overridePlayerStandings
);

// Withdraw player from league
router.post(
  "/:leagueId/players/:leaguePlayerId/withdraw",
  authenticate,
  requireRole("organization"),
  auditLog("player_withdrawn", "league_player"),
  leaguePlayerController.withdrawPlayer
);

// ============================================
// DIVISION PLAYER ROUTES (Snooker & Pool)
// ============================================

// Add player directly to a division
router.post(
  "/:leagueId/divisions/:divisionId/players",
  authenticate,
  requireRole("organization"),
  auditLog("player_added_to_division", "league_player"),
  leaguePlayerController.addPlayerToDivision
);

// Get all players in a specific division
router.get(
  "/:leagueId/divisions/:divisionId/players",
  authenticate,
  leaguePlayerController.getDivisionPlayers
);

// ============================================
// FIXTURE ROUTES (Snooker & Pool)
// ============================================

// Generate fixtures
router.post(
  "/:leagueId/fixtures/generate",
  authenticate,
  requireRole("organization"),
  auditLog("fixtures_generated", "fixture"),
  fixtureController.generateFixtures
);

// Get all fixtures for league
router.get(
  "/:leagueId/fixtures",
  authenticate,
  fixtureController.getFixtures
);

// Get single fixture
router.get(
  "/:leagueId/fixtures/:fixtureId",
  authenticate,
  fixtureController.getFixtureById
);

// Record match result
router.post(
  "/:leagueId/fixtures/:fixtureId/result",
  authenticate,
  requireRole("organization"),
  auditLog("match_result_recorded", "fixture"),
  fixtureController.recordMatchResult
);

// Manual Walkover
router.post(
  "/:leagueId/fixtures/:fixtureId/walkover",
  authenticate,
  requireRole("organization"),
  auditLog("match_walkover_recorded", "fixture"),
  fixtureController.recordWalkover
);

// Update fixture
router.put(
  "/:leagueId/fixtures/:fixtureId",
  authenticate,
  requireRole("organization"),
  auditLog("fixture_updated", "fixture"),
  fixtureController.updateFixture
);

// Delete fixture
router.delete(
  "/:leagueId/fixtures/:fixtureId",
  authenticate,
  requireRole("organization"),
  auditLog("fixture_deleted", "fixture"),
  fixtureController.deleteFixture
);

// ============================================
// POOKER & CUE SPORT ROUTES
// ============================================
// Pooker uses standard league and division routes above.
// Legacy card game 'poker' routes have been removed.

module.exports = router;
