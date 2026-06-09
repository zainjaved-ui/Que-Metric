const express = require("express");
const router = express.Router();
const matchResultController = require("../controllers/matchResultController");
const { authenticate, requireRole, requireVerifiedAccount } = require("../middleware/auth");
const { uploadSingle, uploadErrorHandler } = require("../middleware/upload");

// ============================================
// MATCH RESULT SUBMISSION WORKFLOW ROUTES
// ============================================

// Step 1: Get available games (Snooker, Pool, Poker)
router.get(
  "/games",
  authenticate,
  matchResultController.getAvailableGames
);

// Step 2a: Get leagues by game (for league matches)
router.get(
  "/leagues/game/:gameId",
  authenticate,
  matchResultController.getLeaguesByGame
);

// Step 2b: Get tournaments by game (for tournament matches)
router.get(
  "/tournaments/game/:gameId",
  authenticate,
  requireRole("player"),
  requireVerifiedAccount,
  matchResultController.getTournamentsByGame
);

// Step 3a: Get confirmed unscored bookings for a specific league
router.get(
  "/bookings/league/:leagueId",
  authenticate,
  requireRole("player"),
  requireVerifiedAccount,
  matchResultController.getLeagueBookings
);

// Step 3b: Get confirmed unscored bookings for a specific tournament
router.get(
  "/bookings/tournament/:tournamentId",
  authenticate,
  requireRole("player"),
  requireVerifiedAccount,
  matchResultController.getTournamentBookings
);

// Step 4: Get complete match details for a booking (includes match configuration)
router.get(
  "/booking/:bookingId/details",
  authenticate,
  requireRole("player"),
  matchResultController.getBookingDetails
);

// Step 5: Submit match result (creates result with "Pending" status)
router.post(
  "/submit",
  authenticate,
  requireRole("player"),
  uploadSingle("resultImage"),
  uploadErrorHandler,
  matchResultController.submitMatchResult
);

// Step 6: Confirm match result (opponent confirms, updates to "Confirmed" and marks booking "Completed")
router.put(
  "/:resultId/confirm",
  authenticate,
  requireRole("player"),
  matchResultController.confirmMatchResult
);

// ============================================
// ADDITIONAL UTILITY ROUTES
// ============================================

// Get all pending results waiting for player's confirmation
router.get(
  "/pending",
  authenticate,
  requireRole("player"),
  matchResultController.getPendingResults
);

// Get all results submitted by the logged-in player
router.get(
  "/my-submissions",
  authenticate,
  requireRole("player"),
  matchResultController.getMySubmittedResults
);

// Get all completed results for the logged-in player
router.get(
  "/completed",
  authenticate,
  requireRole("player"),
  matchResultController.getCompletedResults
);

// ============================================
// PLAYER NOTIFICATION ROUTES
// ============================================

// Get all notifications for logged-in player
router.get(
  "/notifications",
  authenticate,
  requireRole("player"),
  matchResultController.getPlayerNotifications
);

// Mark notification as read
router.put(
  "/notifications/:notificationId/read",
  authenticate,
  requireRole("player"),
  matchResultController.markNotificationRead
);

// ============================================
// ORGANIZATION DISPUTE MANAGEMENT ROUTES
// ============================================

// Get all unique game types (sports) used in an organization's leagues and tournaments
router.get(
  "/get-game-types",
  authenticate,
  requireRole("organization"),
  matchResultController.getOrganizationGameTypes
);

// Get all disputes for an organization (all sports/leagues)
router.get(
  "/disputes",
  authenticate,
  requireRole("organization"),
  matchResultController.getOrganizationDisputes
);

// Get disputes filtered by sport (game type)
router.get(
  "/disputes/sport/:sport",
  authenticate,
  requireRole("organization"),
  matchResultController.getDisputesBySport
);

// Get disputes filtered by specific Game ID (UUID)
router.get(
  "/disputes/game/:gameId",
  authenticate,
  requireRole("organization"),
  matchResultController.getDisputesByGame
);

// Get leagues that contain disputes (for filtering)
router.get(
  "/disputes/leagues/:sport",
  authenticate,
  requireRole("organization"),
  matchResultController.getLeaguesWithDisputes
);

// Get all disputed matches for a specific league
router.get(
  "/disputes/league/:leagueId",
  authenticate,
  requireRole("organization"),
  matchResultController.getDisputesByLeague
);

// Get full details of a specific dispute for review
router.get(
  "/disputes/:disputeId/details",
  authenticate,
  requireRole("organization"),
  matchResultController.getDisputeDetails
);

// Resolve dispute (admin updates scores and confirms)
router.put(
  "/disputes/:disputeId/resolve",
  authenticate,
  requireRole("organization"),
  matchResultController.resolveDispute
);

// Admin Match Approval
router.get(
  "/admin/awaiting-approval",
  authenticate,
  requireRole("organization"),
  matchResultController.getResultsAwaitingAdminApproval
);

router.put(
  "/admin/:resultId/approve",
  authenticate,
  requireRole("organization"),
  matchResultController.approveMatchResult
);

// Admin Walkover Approval/Rejection
router.put(
  "/admin/:resultId/walkover",
  authenticate,
  requireRole("organization"),
  matchResultController.approveRejectWalkover
);

// ============================================
// DIAGNOSTIC ENDPOINTS (FOR DEBUGGING)
// ============================================

// Get ALL pending results in database (regardless of player)
router.get(
  "/diagnostic/all-pending",
  authenticate,
  requireRole("player"),
  matchResultController.getAllPendingResults
);

// ============================================
// PLAYER MATCH RESULTS PAGE ROUTES
// ============================================

// Get divisions by league (for dropdown filtering)
// Allow both players and organizations to view divisions
router.get(
  "/divisions/league/:leagueId",
  authenticate,
  matchResultController.getDivisionsByLeague
);

// Get matches by division (complete match results for player match results page)
// Allow both players and organizations to view matches
router.get(
  "/matches/division/:divisionId",
  authenticate,
  matchResultController.getMatchesByDivision
);

// ============================================
// DEBUG/TESTING ROUTE - Generate test data
// ============================================
// Only available in development - creates sample fixtures, bookings, and match results
router.post(
  "/test-data/generate",
  authenticate,
  requireRole("player"),
  matchResultController.generateTestData
);

// ============================================
// DIAGNOSTIC ROUTES - Debug data flow
// ============================================
router.get(
  "/diagnostic/division/:divisionId/fixtures",
  authenticate,
  requireRole("player"),
  matchResultController.diagnosticDivisionFixtures
);

router.get(
  "/diagnostic/division/:divisionId/full-chain",
  authenticate,
  requireRole("player"),
  matchResultController.diagnosticFullChain
);

// Auto-generate test data for a specific division
router.post(
  "/test-data/division/:divisionId/generate",
  authenticate,
  requireRole("player"),
  matchResultController.generateTestDataForDivision
);

// Quick diagnostic for a division
router.get(
  "/diagnostic/division/:divisionId/quick",
  authenticate,
  requireRole("player"),
  matchResultController.diagnosticQuick
);

// ============================================
// ORGANIZATION WALKOVER MANAGEMENT ROUTES
// ============================================

// Get all pending walkovers for a league (for organization admin approval)
router.get(
  "/pending-walkovers/league/:leagueId",
  authenticate,
  requireRole("organization"),
  matchResultController.getPendingWalkoversForLeague
);

module.exports = router;
