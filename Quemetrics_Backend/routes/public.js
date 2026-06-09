const express = require("express");
const router = express.Router();
const publicController = require("../controllers/publicController");

// Get verified organizations (for player registration dropdown)
router.get("/organizations", publicController.getVerifiedOrganizations);

module.exports = router;
