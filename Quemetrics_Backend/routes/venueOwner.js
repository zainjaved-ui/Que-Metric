const express = require("express");
const router = express.Router();
const venueOwnerController = require("../controllers/venueOwnerController");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validate");

router.post("/accept-invitation", validate(schemas.acceptInvitation), venueOwnerController.acceptInvitation);
router.get("/me", authenticate, requireRole("venue_owner"), venueOwnerController.getMyProfile);
router.get("/venues", authenticate, requireRole("venue_owner"), venueOwnerController.getMyVenues);
router.put("/me", authenticate, requireRole("venue_owner"), validate(schemas.updateVenueOwner), venueOwnerController.updateProfile);

// Venue Approval Request Routes
router.get("/approval-requests", authenticate, requireRole("venue_owner"), venueOwnerController.getVenueApprovalRequests);
router.put("/approval-requests/:requestId/approve", authenticate, requireRole("venue_owner"), venueOwnerController.approveApprovalRequest);
router.put("/approval-requests/:requestId/reject", authenticate, requireRole("venue_owner"), venueOwnerController.rejectApprovalRequest);
// League Venue Request Routes
router.get("/league-requests", authenticate, requireRole("venue_owner"), venueOwnerController.getLeagueVenueRequests);
router.put("/league-requests/:requestId/approve", authenticate, requireRole("venue_owner"), venueOwnerController.approveLeagueVenueRequest);
router.put("/league-requests/:requestId/reject", authenticate, requireRole("venue_owner"), venueOwnerController.rejectLeagueVenueRequest);

// Tournament venue request routes
router.get(
  "/tournament-venue-requests",
  authenticate,
  requireRole("venue_owner"),
  venueOwnerController.getTournamentVenueRequests
);
router.put(
  "/tournament-venue-requests/:requestId/accept",
  authenticate,
  requireRole("venue_owner"),
  venueOwnerController.acceptTournamentVenueRequest
);
router.put(
  "/tournament-venue-requests/:requestId/reject",
  authenticate,
  requireRole("venue_owner"),
  venueOwnerController.rejectTournamentVenueRequest
);

router.get("/dashboard-stats", authenticate, requireRole("venue_owner"), venueOwnerController.getDashboardStats);

router.get("/slot-availability", authenticate, requireRole("venue_owner"), venueOwnerController.getSlotAvailability);
router.get("/all-bookings", authenticate, requireRole("venue_owner"), venueOwnerController.getAllBookings);
router.get("/member-bookings", authenticate, requireRole("venue_owner"), venueOwnerController.getMemberBookings);
router.post("/new-member-booking", authenticate, requireRole("venue_owner"), venueOwnerController.createMemberBooking);
router.delete("/bookings/:bookingId", authenticate, requireRole("venue_owner"), venueOwnerController.deleteBooking);

module.exports = router;
