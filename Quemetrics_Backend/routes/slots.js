const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { authenticate, requireRole, requireVerifiedAccount } = require("../middleware/auth");

router.get(
  "/",
  authenticate,
  requireRole("player", "organization"),
  requireVerifiedAccount,
  bookingController.getSlotsByTable
);

module.exports = router;
