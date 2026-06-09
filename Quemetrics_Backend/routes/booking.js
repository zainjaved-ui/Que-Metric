const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { authenticate, requireRole, requireVerifiedAccount } = require("../middleware/auth");

// All routes require authentication and player role + verified account

// Get all snooker leagues for the player
router.get(
  "/snooker-leagues",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getSnookerLeagues
);

// Get all pool leagues for the player
router.get(
  "/pool-leagues",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getPoolLeagues
);

// Get all poker leagues for the player
router.get(
  "/poker-leagues",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getPokerLeagues
);

// Get all matches for a specific league
router.get(
  "/leagues/:leagueId/matches",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getLeagueMatches
);

// Get all matches for a specific pool league
router.get(
  "/pool-matches/:leagueId",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getPoolMatches
);

// Get all matches for a specific poker league
router.get(
  "/poker-matches/:leagueId",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getPokerMatches
);

// Get all pooker leagues for the player
router.get(
  "/pooker-leagues",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getPookerLeagues
);

// Get all matches for a specific pooker league
router.get(
  "/pooker-matches/:leagueId",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getPookerMatches
);

// Get available venues
router.get(
  "/venues",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getAvailableVenues
);

// Tournament venues for table booking (aliases GET /venues?tournamentId=)
router.get(
  "/tournament/:tournamentId/venues",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  (req, res) => {
    req.query = { ...req.query, tournamentId: req.params.tournamentId };
    return bookingController.getAvailableVenues(req, res);
  }
);

// Get available time slots for a venue and date
router.get(
  "/time-slots",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getAvailableTimeSlots
);

// Get monthly availability for a venue
router.get(
  "/monthly-availability",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getMonthlyAvailability
);

// Player tournament match booking (table / venue / time)
router.post(
  "/tournament",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.createTournamentBooking
);

// Create a new booking
router.post(
  "/",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.createBooking
);

// Get all bookings for the logged-in player
router.get(
  "/my-bookings",
  authenticate,
  requireRole("player", "organization"),
  bookingController.getMyBookings
);

// Get all completed bookings for the logged-in player
router.get(
  "/my-bookings/completed",
  authenticate,
  requireRole("player", "organization"),
  bookingController.getCompletedBookings
);

// Confirm a booking (opponent confirms)
router.put(
  "/:bookingId/confirm",
  authenticate,
  requireRole("player", "organization"),
  bookingController.confirmBooking
);

// Reject a booking (opponent rejects)
router.put(
  "/:bookingId/reject",
  authenticate,
  requireRole("player", "organization"),
  bookingController.rejectBooking
);

// Cancel a booking
router.put(
  "/:bookingId/cancel",
  authenticate,
  requireRole("player", "organization"),
  bookingController.cancelBooking
);

// Get counts of active leagues for each sport for the player
router.get(
  "/game-stats",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getGameStats
);

// DEBUG ENDPOINT - Remove in production
// Diagnostic endpoint to inspect venue and league data
router.get(
  "/debug/venue-data",
  authenticate,
  bookingController.debugVenueData
);

module.exports = router;
