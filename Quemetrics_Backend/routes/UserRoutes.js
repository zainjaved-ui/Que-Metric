var express = require('express');
var router = express.Router();
const userController = require("../controllers/UserController");
const { authenticate } = require("../middleware/auth");

// Get all players (users with role="player")
router.get(
  "/players",
  authenticate,
  userController.getAllPlayers
);

module.exports = router;
