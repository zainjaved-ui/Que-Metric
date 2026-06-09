/**
 * Swiss round orchestration.
 * - Computes standings from completed matches
 * - Produces pairings for the next round (including BYE rows as player2Id=null)
 */
"use strict";

const { generateNextRoundPairings } = require("./pairingService");

function generateNextSwissRoundPairings({
  participants,
  completedMatches,
  scoringRules,
}) {
  return generateNextRoundPairings({
    participants,
    completedMatches,
    scoringRules,
  });
}

module.exports = {
  generateNextSwissRoundPairings,
};

