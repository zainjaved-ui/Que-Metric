const express = require("express");
const router = express.Router();
const tournamentController = require("../controllers/tournamentController");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validate");
const { auditLog, captureOldValue } = require("../middleware/auditLogger");
const { upload, uploadErrorHandler } = require("../middleware/upload");
const { Tournament } = require("../models");

// ============================================================================
// TOURNAMENT CRUD
// ============================================================================

/**
 * POST /api/tournaments
 * Create a new tournament
 */
router.post(
  "/",
  authenticate,
  requireRole("organization"),
  auditLog("tournament_created", "tournament"),
  tournamentController.createTournament
);

/**
 * GET /api/tournaments
 * Get all tournaments (paginated)
 */
router.get("/", authenticate, tournamentController.getTournaments);

/**
 * GET /api/tournaments/discover
 * List available tournaments for player discovery (no auth required)
 */
router.get("/discover", tournamentController.discoverTournaments);

/**
 * GET /api/tournaments/venues
 * Get venues available for an organization (for bracket scheduling)
 */
router.get(
  "/venues",
  authenticate,
  tournamentController.getVenuesForOrganization
);

/**
 * GET /api/tournaments/venues/all
 * Get ALL venues across all organizers (for venue selection)
 */
router.get(
  "/venues/all",
  authenticate,
  requireRole("organization"),
  tournamentController.getAllVenues
);

/**
 * GET /api/tournaments/withdrawals-feed
 * Withdrawn players across all tournaments for this organization
 */
router.get(
  "/withdrawals-feed",
  authenticate,
  requireRole("organization"),
  tournamentController.getOrganizationWithdrawalsFeed
);

// ============================================================================
// RANKINGS (must be before /:tournamentId param routes)
// ============================================================================

/**
 * GET /api/tournaments/rankings
 * Get overall player rankings with tiebreakers
 */
router.get(
  "/rankings",
  tournamentController.getRankings
);

/**
 * GET /api/tournaments/rankings/:playerId/history
 * Get a player's ranking point history
 */
router.get(
  "/rankings/:playerId/history",
  tournamentController.getRankingHistory
);

/**
 * GET /api/tournaments/:tournamentId/ranking-config
 * Get tournament's ranking configuration (point structure based on tier)
 */
router.get(
  "/:tournamentId/ranking-config",
  tournamentController.getTournamentRankingConfig
);

/**
 * POST /api/tournaments/rankings/override
 * Super admin append-only ranking override
 */
router.post(
  "/rankings/override",
  authenticate,
  requireRole("super_admin"),
  tournamentController.applyRankingOverride
);

/**
 * GET /api/tournaments/rankings/form/:sport
 * Get form rankings (last 10 tournaments within 12 months)
 */
router.get(
  "/rankings/form/:sport",
  tournamentController.getFormRankings
);

/**
 * POST /api/tournaments/rankings/rebuild
 * Super admin manual snapshot rebuild
 */
router.post(
  "/rankings/rebuild",
  authenticate,
  requireRole("super_admin"),
  tournamentController.rebuildSeasonRankingSnapshot
);

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * POST /api/tournaments/validate-ranking-config
 * Validate ranking configuration and get tier-based presets
 */
router.post(
  "/validate-ranking-config",
  authenticate,
  requireRole("organization"),
  tournamentController.validateRankingConfiguration
);

/**
 * GET /api/player/tournaments
 * Get player's tournament registrations
 */
router.get(
  "/player/tournaments",
  authenticate,
  tournamentController.getPlayerTournaments
);

/**
 * GET /api/tournaments/:tournamentId/player-matches
 * Get player's matches in a tournament
/**
 * GET /api/tournaments/:tournamentId/player-matches
 * Get player's matches in a tournament
 */
router.get(
  "/:tournamentId/player-matches",
  authenticate,
  tournamentController.getPlayerMatches
);

/**
 * GET /api/tournaments/:tournamentId
 * Get tournament details
 */
router.get("/:tournamentId", authenticate, tournamentController.getTournamentById);

/**
 * PUT /api/tournaments/:tournamentId
 * Update tournament
 */
router.put(
  "/:tournamentId",
  authenticate,
  requireRole("organization"),
  auditLog("tournament_updated", "tournament"),
  tournamentController.updateTournament
);

/**
 * PATCH /api/tournaments/:tournamentId/official-ranking
 * Super admin official ranking designation
 */
router.patch(
  "/:tournamentId/official-ranking",
  authenticate,
  requireRole("super_admin"),
  tournamentController.setTournamentOfficialRankingStatus
);

/**
 * POST /api/tournaments/:tournamentId/complete
 * Mark tournament as completed
 */
router.post(
  "/:tournamentId/complete",
  authenticate,
  requireRole("organization"),
  auditLog("tournament_completed", "tournament"),
  tournamentController.completeTournament
);

/**
 * POST /api/tournaments/:tournamentId/recalculate-rankings
 * Manually recalculate and award ranking points for a completed tournament
 */
router.post(
  "/:tournamentId/recalculate-rankings",
  authenticate,
  requireRole("organization"),
  auditLog("tournament_rankings_recalculated", "tournament"),
  tournamentController.recalculateRankingPoints
);

/**
 * POST /api/tournaments/:tournamentId/close-registration
 * Close registration (registration → registration_closed)
 */
router.post(
  "/:tournamentId/close-registration",
  authenticate,
  requireRole("organization"),
  auditLog("tournament_registration_closed", "tournament"),
  tournamentController.closeRegistration
);

// ============================================================================
// PARTICIPANT MANAGEMENT
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/register
 * Register player for tournament
 */
router.post(
  "/:tournamentId/register",
  authenticate,
  auditLog("participant_registered", "tournament_participant"),
  tournamentController.registerForTournament
);

/**
 * GET /api/tournaments/:tournamentId/participants
 * Get tournament participants
 */
router.get(
  "/:tournamentId/participants",
  authenticate,
  tournamentController.getTournamentParticipants
);

/**
 * GET /api/tournaments/:tournamentId/participants/export
 * Export tournament participants as PDF
 */
router.get(
  "/:tournamentId/participants/export",
  authenticate,
  requireRole("organization"),
  tournamentController.exportParticipantsAsPDF
);

/**
 * POST /api/tournaments/:tournamentId/participants/:participantId/approve
 * Approve/reject participant registration
 */
router.post(
  "/:tournamentId/participants/:participantId/approve",
  authenticate,
  requireRole("organization"),
  auditLog("participant_approved", "tournament_participant"),
  tournamentController.approveParticipant
);

/**
 * DELETE /api/tournaments/participants/:participantId
 * Remove a participant (organization admin)
 */
router.delete(
  "/participants/:participantId",
  authenticate,
  requireRole("organization"),
  auditLog("participant_removed", "tournament_participant"),
  tournamentController.removeParticipant
);

// ============================================================================
// INVITATIONS & JOIN CODES
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/invitations
 * Create invitation links
 */
router.post(
  "/:tournamentId/invitations",
  authenticate,
  requireRole("organization"),
  auditLog("invitations_created", "tournament_invitation"),
  tournamentController.createInvitationLink
);

/**
 * GET /api/tournaments/invitations/validate
 * Validate an invitation token (public)
 */
router.get(
  "/invitations/validate",
  tournamentController.validateInvitationToken
);

/**
 * POST /api/tournaments/invitations/accept
 * Accept an invitation (authenticated)
 */
router.post(
  "/invitations/accept",
  authenticate,
  auditLog("invitation_accepted", "tournament_invitation"),
  tournamentController.acceptInvitation
);

/**
 * GET /api/tournaments/invitations/pending
 * Get pending invitations for a player by email
 * Note: No authentication required - uses email parameter for validation
 */
router.get(
  "/invitations/pending",
  tournamentController.getPendingInvitations
);

/**
 * POST /api/tournaments/:tournamentId/join-code
 * Generate join code
 */
router.post(
  "/:tournamentId/join-code",
  authenticate,
  requireRole("organization"),
  auditLog("join_code_created", "tournament_invitation"),
  tournamentController.generateJoinCode
);

/**
 * GET /api/tournaments/:tournamentId/join-code
 * Get existing join codes for tournament
 */
router.get(
  "/:tournamentId/join-code",
  authenticate,
  requireRole("organization"),
  tournamentController.getJoinCodes
);

/**
 * POST /api/tournaments/register-with-code
 * Register using join code
 */
router.post(
  "/register-with-code",
  authenticate,
  auditLog("registered_with_join_code", "tournament_participant"),
  tournamentController.registerWithJoinCode
);

// ============================================================================
// BRACKET GENERATION
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/generate-bracket
 * Generate tournament bracket
 */
router.post(
  "/:tournamentId/generate-bracket",
  authenticate,
  requireRole("organization"),
  auditLog("bracket_generated", "tournament"),
  tournamentController.generateBracket
);

/**
 * POST /api/tournaments/:tournamentId/generate-fixtures
 * Same behavior as generate-bracket (round-robin, knockout, etc.)
 */
router.post(
  "/:tournamentId/generate-fixtures",
  authenticate,
  requireRole("organization"),
  auditLog("bracket_generated", "tournament"),
  tournamentController.generateFixtures
);

/**
 * POST /api/tournaments/:tournamentId/start
 * Start tournament (generate round 1 — Swiss, knockout, etc.)
 */
router.post(
  "/:tournamentId/start",
  authenticate,
  requireRole("organization"),
  auditLog("tournament_started", "tournament"),
  tournamentController.startTournament
);

/**
 * POST /api/tournaments/:tournamentId/round/complete
 * Swiss: all matches in round done → close round and generate next pairings
 */
router.post(
  "/:tournamentId/round/complete",
  authenticate,
  requireRole("organization"),
  auditLog("tournament_round_completed", "tournament"),
  tournamentController.completeTournamentRound
);

/**
 * POST /api/tournaments/:tournamentId/bracket/lock
 * Lock the tournament bracket (organizer confirms it's final)
 */
router.post(
  "/:tournamentId/bracket/lock",
  authenticate,
  requireRole("organization"),
  auditLog("bracket_locked", "tournament"),
  tournamentController.lockBracket
);

/**
 * GET /api/tournaments/:tournamentId/bracket/status
 * Get bracket generation and scheduling status
 */
router.get(
  "/:tournamentId/bracket/status",
  authenticate,
  tournamentController.getBracketStatus
);

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/schedule
 * Schedule a specific match (set date, time, venue)
 */
router.post(
  "/:tournamentId/matches/:matchId/schedule",
  authenticate,
  requireRole("organization"),
  auditLog("match_scheduled", "tournament_match"),
  tournamentController.scheduleMatch
);

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/book
 * Player books match time when flexible scheduling is enabled
 */
router.post(
  "/:tournamentId/matches/:matchId/book",
  authenticate,
  auditLog("match_booked", "tournament_match"),
  tournamentController.bookTournamentMatch
);

/**
 * POST /api/tournaments/:tournamentId/schedule-all-matches
 * Bulk schedule all tournament matches
 */
router.post(
  "/:tournamentId/schedule-all-matches",
  authenticate,
  requireRole("organization"),
  auditLog("matches_scheduled", "tournament"),
  tournamentController.scheduleAllMatches
);

/**
 * POST /api/tournaments/:tournamentId/generate-next-round
 * Manually generate (knockout) or unlock (round-robin) next round
 */
router.post(
  "/:tournamentId/generate-next-round",
  authenticate,
  requireRole("organization"),
  auditLog("next_round_generated", "tournament"),
  tournamentController.generateNextRound
);

// Alias: POST /api/tournaments/:tournamentId/next-round
// (kept for compatibility with expected Swiss workflow naming)
router.post(
  "/:tournamentId/next-round",
  authenticate,
  requireRole("organization"),
  auditLog("next_round_generated", "tournament"),
  tournamentController.generateNextRound
);

// ============================================================================
// LATE REGISTRATION & FIXTURE REGENERATION
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/add-late-player
 * Add late player with strategy (after deadline/fixtures)
 * Supports: regenerate, fill_bye, qualifier, waitlist
 */
router.post(
  "/:tournamentId/add-late-player",
  authenticate,
  requireRole("organization"),
  auditLog("late_player_added", "tournament_participant"),
  tournamentController.addLatePlayerWithStrategy
);

/**
 * POST /api/tournaments/:tournamentId/late-entry
 * Multi-player late entry with strategy + optional preview (preview=true)
 */
router.post(
  "/:tournamentId/late-entry",
  authenticate,
  requireRole("organization"),
  auditLog("late_entry_requested", "tournament"),
  tournamentController.addLatePlayersWithStrategy
);

/**
 * GET /api/tournaments/:tournamentId/regeneration-history
 * Get fixture regeneration history for tournament
 */
router.get(
  "/:tournamentId/regeneration-history",
  authenticate,
  tournamentController.getFixtureRegenerationHistory
);

// ============================================================================
// MATCH MANAGEMENT
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/result
 * Submit match result
 */
router.post(
  "/:tournamentId/matches/:matchId/result",
  authenticate,
  upload.single("resultImage"),
  uploadErrorHandler,
  auditLog("match_result_submitted", "tournament_match"),
  tournamentController.submitMatchResult
);

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/confirm
 * Opponent confirms match result
 */
router.post(
  "/:tournamentId/matches/:matchId/confirm",
  authenticate,
  auditLog("match_result_confirmed", "tournament_match"),
  tournamentController.confirmMatchResult
);

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/dispute
 * Player disputes match result
 */
router.post(
  "/:tournamentId/matches/:matchId/dispute",
  authenticate,
  auditLog("match_result_disputed", "tournament_match"),
  tournamentController.disputeMatchResult
);

/**
 * GET /api/tournaments/:tournamentId/matches
 * Get tournament matches
 */
router.get(
  "/:tournamentId/matches",
  authenticate,
  tournamentController.getTournamentMatches
);

// ============================================================================
// STANDINGS & RANKINGS
// ============================================================================

/**
 * GET /api/tournaments/:tournamentId/standings
 * Get tournament standings
 */
router.get(
  "/:tournamentId/standings",
  authenticate,
  tournamentController.getTournamentStandings
);

/**
 * GET /api/tournaments/:tournamentId/groups
 * Get all groups for a group-based tournament (groups_knockout format)
 */
router.get(
  "/:tournamentId/groups",
  authenticate,
  tournamentController.getTournamentGroups
);

/**
 * GET /api/tournaments/:tournamentId/groups/:groupNumber/standings
 * Get standings for a specific group
 */
router.get(
  "/:tournamentId/groups/:groupNumber/standings",
  authenticate,
  tournamentController.getGroupStandings
);

/**
 * GET /api/tournaments/:tournamentId/qualifiers
 * Get all qualified players from all groups (for knockout seeding visualization)
 */
router.get(
  "/:tournamentId/qualifiers",
  authenticate,
  tournamentController.getTournamentQualifiers
);

// ============================================================================
// ADMIN OVERRIDES
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/override
 * Admin override match result
 */
router.post(
  "/:tournamentId/matches/:matchId/override",
  authenticate,
  requireRole("super_admin"),
  auditLog("match_overridden", "tournament_match"),
  tournamentController.overrideMatchResult
);

/**
 * PUT /api/tournaments/:tournamentId/matches/:matchId/reschedule
 * Reschedule match to new date
 */
router.put(
  "/:tournamentId/matches/:matchId/reschedule",
  authenticate,
  requireRole("organization"),
  auditLog("match_rescheduled", "tournament_match"),
  tournamentController.rescheduleMatch
);

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/deadline-change-request
 * Player requests deadline extension when no venue slots are available
 */
router.post(
  "/:tournamentId/matches/:matchId/deadline-change-request",
  authenticate,
  requireRole("player", "organization"),
  auditLog("match_deadline_change_requested", "tournament_match"),
  tournamentController.requestDeadlineChange
);

router.get(
  "/:tournamentId/deadline-requests",
  authenticate,
  requireRole("organization"),
  tournamentController.getDeadlineChangeRequests
);

router.post(
  "/:tournamentId/deadline-requests/:requestId/apply",
  authenticate,
  requireRole("organization"),
  auditLog("match_deadline_change_applied", "tournament_match"),
  tournamentController.applyDeadlineChangeRequest
);

/**
 * POST /api/tournaments/:tournamentId/void-ranking-points
 * Void tournament ranking points (admin only)
 */
router.post(
  "/:tournamentId/void-ranking-points",
  authenticate,
  requireRole("super_admin"),
  auditLog("ranking_points_voided", "tournament"),
  tournamentController.voidTournamentRankingPoints
);

// ============================================================================
// TOURNAMENT DISCOVERY & OPEN REGISTRATION
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/register-open-request
 * Submit open registration request (requires approval)
 */
router.post(
  "/:tournamentId/register-open-request",
  authenticate,
  auditLog("open_registration_submitted", "tournament_participant"),
  tournamentController.submitOpenRegistrationRequest
);

/**
 * GET /api/tournaments/:tournamentId/open-requests
 * Get list of open registration requests (org admin only)
 */
router.get(
  "/:tournamentId/open-requests",
  authenticate,
  requireRole("organization"),
  tournamentController.getOpenRegistrationRequests
);

// ============================================================================
// PLAYER TOURNAMENT RESULTS ENDPOINTS (for Results page)
// ============================================================================

/**
 * GET /api/tournaments/player-results/pending
 * Get tournament matches awaiting player's confirmation
 */
router.get(
  "/player-results/pending",
  authenticate,
  requireRole("player"),
  tournamentController.getPlayerPendingTournamentResults
);

/**
 * GET /api/tournaments/player-results/submitted
 * Get tournament matches submitted by player
 */
router.get(
  "/player-results/submitted",
  authenticate,
  requireRole("player"),
  tournamentController.getPlayerSubmittedTournamentResults
);

/**
 * GET /api/tournaments/player-results/completed
 * Get completed tournament matches for player
 */
router.get(
  "/player-results/completed",
  authenticate,
  requireRole("player"),
  tournamentController.getPlayerCompletedTournamentResults
);

// ============================================================================
// WITHDRAWAL, CANCELLATION & AUTO-FORFEIT
// ============================================================================

/**
 * GET /api/tournaments/:tournamentId/withdrawal-info
 * Returns the current stage and applicable withdrawal rule before a player commits to withdrawing
 */
router.get(
  "/:tournamentId/withdrawal-info",
  authenticate,
  tournamentController.getWithdrawalInfo
);

/**
 * POST /api/tournaments/:tournamentId/withdraw
 * Player withdraws from tournament
 */
router.post(
  "/:tournamentId/withdraw",
  authenticate,
  auditLog("player_withdrawn", "tournament_participant"),
  tournamentController.withdrawPlayer
);

/**
 * GET /api/tournaments/:tournamentId/voided-matches
 * Get all voided matches pending admin resolution (organizer only)
 */
router.get(
  "/:tournamentId/voided-matches",
  authenticate,
  requireRole("organization"),
  tournamentController.getVoidedMatches
);

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/resolve-void
 * Resolve a voided match (organizer decides outcome - promote player, alternate, or reschedule)
 */
router.post(
  "/:tournamentId/matches/:matchId/resolve-void",
  authenticate,
  requireRole("organization"),
  auditLog("voided_match_resolved", "tournament_match"),
  tournamentController.resolveVoidedMatch
);

/**
 * POST /api/tournaments/:tournamentId/cancel
 * Cancel a tournament (organization only)
 */
router.post(
  "/:tournamentId/cancel",
  authenticate,
  requireRole("organization"),
  auditLog("tournament_cancelled", "tournament"),
  tournamentController.cancelTournament
);

/**
 * POST /api/tournaments/:tournamentId/auto-forfeit
 * Auto-forfeit overdue matches
 */
router.post(
  "/:tournamentId/auto-forfeit",
  authenticate,
  requireRole("organization"),
  auditLog("auto_forfeit_overdue", "tournament"),
  tournamentController.autoForfeitOverdueMatches
);

// ============================================================================
// LADDER FORMAT
// ============================================================================

/**
 * GET /api/tournaments/:tournamentId/ladder/standings
 * Get current ladder standings
 */
router.get(
  "/:tournamentId/ladder/standings",
  authenticate,
  tournamentController.getLadderStandings
);

/**
 * POST /api/tournaments/:tournamentId/ladder/challenge
 * Create a ladder challenge
 */
router.post(
  "/:tournamentId/ladder/challenge",
  authenticate,
  auditLog("ladder_challenge_created", "tournament_match"),
  tournamentController.createLadderChallenge
);

// ============================================================================
// FLEXIBLE SCHEDULING & MATCH BOOKING
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/book
 * Book a match time (flexible scheduling)
 */
router.post(
  "/:tournamentId/matches/:matchId/book",
  authenticate,
  tournamentController.bookMatchTime
);

/**
 * DELETE /api/tournaments/:tournamentId/matches/:matchId/book
 * Cancel a match booking
 */
router.delete(
  "/:tournamentId/matches/:matchId/book",
  authenticate,
  tournamentController.cancelMatchBooking
);

/**
 * GET /api/tournaments/:tournamentId/matches/:matchId/available-slots
 * Get available booking slots for a match
 */
router.get(
  "/:tournamentId/matches/:matchId/available-slots",
  authenticate,
  tournamentController.getAvailableBookingSlots
);

/**
 * POST /api/tournaments/:tournamentId/scheduling/auto-forfeit
 * Manually trigger auto-forfeit for overdue matches (admin only)
 */
router.post(
  "/:tournamentId/scheduling/auto-forfeit",
  authenticate,
  requireRole("organization"),
  tournamentController.runAutoForfeit
);

module.exports = router;
