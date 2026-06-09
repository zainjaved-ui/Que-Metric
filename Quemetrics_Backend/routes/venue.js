const express = require("express");
const router = express.Router();
const venueController = require("../controllers/venueController");
const { authenticate, requireRole, requireVerifiedAccount } = require("../middleware/auth");

router.get(
  "/:venueId",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  venueController.getVenueById
);

module.exports = router;

