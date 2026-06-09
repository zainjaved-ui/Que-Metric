/**
 * Thin alias routes for match results without tournamentId in the path.
 */
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { upload, uploadErrorHandler } = require("../middleware/upload");
const { TournamentMatch } = require("../models");
const tournamentController = require("../controllers/tournamentController");

/**
 * POST /api/matches/:matchId/result
 * Resolves tournament from the match and delegates to tournament match result handler.
 */
router.post("/:matchId/result", authenticate, upload.single("resultImage"), uploadErrorHandler, async (req, res, next) => {
  try {
    const match = await TournamentMatch.findByPk(req.params.matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }
    req.params.tournamentId = match.tournamentId;
    req.params.matchId = match.id;
    return tournamentController.submitMatchResult(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
