const express = require("express");
const router = express.Router();
const organizationController = require("../controllers/organizationController");
const { authenticate, requireRole } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validate");
const { auditLog, captureOldValue } = require("../middleware/auditLogger");
const { Season } = require("../models");

// Helper to get season by ID for audit logging
const getSeasonById = async (req) => {
  return await Season.findByPk(req.params.seasonId);
};

router.get("/me", authenticate, requireRole("organization"), organizationController.getMyOrganization);
router.put("/me", authenticate, requireRole("organization"), validate(schemas.updateOrganization), organizationController.updateOrganization);
router.post("/venue-owners/invite", authenticate, requireRole("organization"), validate(schemas.inviteVenueOwner), organizationController.inviteVenueOwner);
router.get("/venue-owners", authenticate, requireRole("organization"), organizationController.getMyVenueOwners);
router.delete("/venue-owners/:venueOwnerId", authenticate, requireRole("organization"), organizationController.removeVenueOwner);

// =====================================================
// Venue Management Routes (Multi-Organizer Support)
// =====================================================

router.get("/venues/all", authenticate, requireRole("organization"), organizationController.getAllVenues);
router.post("/venues/:venueOwnerId/request-approval", authenticate, requireRole("organization"), organizationController.requestVenueApproval);
router.get("/venues/approval-requests", authenticate, requireRole("organization"), organizationController.getApprovalRequests);
router.put("/venues/approval-requests/:requestId/approve", authenticate, requireRole("organization"), organizationController.approveVenueRequest);
router.put("/venues/approval-requests/:requestId/reject", authenticate, requireRole("organization"), organizationController.rejectVenueRequest);

// =====================================================
// Season Routes
// =====================================================

router.post(
  "/seasons",
  authenticate,
  requireRole("organization"),
  organizationController.createSeason
);

router.get(
  "/seasons",
  authenticate,
  requireRole("organization"),
  organizationController.getAllSeasons
);

router.get(
  "/seasons/current",
  authenticate,
  requireRole("organization"),
  organizationController.getCurrentSeason
);

router.get(
  "/seasons/:seasonId",
  authenticate,
  requireRole("organization"),
  organizationController.getSeasonById
);

router.put(
  "/seasons/:seasonId",
  authenticate,
  requireRole("organization"),
  captureOldValue(getSeasonById),
  organizationController.editSeason
);

router.delete(
  "/seasons/:seasonId",
  authenticate,
  requireRole("organization"),
  captureOldValue(getSeasonById),
  organizationController.deleteSeason
);

// =====================================================
// Games Routes
// =====================================================

router.get(
  "/games",
  // authenticate,
  // requireRole("organization"),
  organizationController.getGames
);

// =====================================================
// Players Routes
// =====================================================

router.get(
  "/players",
  authenticate,
  requireRole("organization"),
  organizationController.getPlayers
);

router.get(
  "/:organizationId/players",
  authenticate,
  organizationController.getOrganizationPlayers
);

// =====================================================
// Club Management Routes
// =====================================================

const clubController = require("../controllers/clubController");

router.get(
  "/clubs",
  authenticate,
  requireRole("organization"),
  organizationController.getClubs // getClubs can stay since it has custom filtering tailored to org dashboard
);

router.post(
  "/clubs",
  authenticate,
  requireRole("organization"),
  clubController.createClub // Replaced with mature clubController method
);

router.put(
  "/clubs/:clubId",
  authenticate,
  requireRole("organization"),
  clubController.updateClub // Replaced with mature clubController method
);

router.delete(
  "/clubs/:clubId",
  authenticate,
  requireRole("organization"),
  clubController.deleteClub // Replaced with mature clubController method
);

module.exports = router;
