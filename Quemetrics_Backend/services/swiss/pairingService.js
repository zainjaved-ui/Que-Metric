/**
 * Swiss pairing facade over SwissPairingEngine.
 * Keeps controller logic thin and testable.
 */
"use strict";

const SwissPairingEngine = require("../SwissPairingEngine");

function generateRoundOnePairings(participants, { seeding = "random" } = {}) {
  return SwissPairingEngine.generateRoundOnePairings(participants, { seeding });
}

function generateNextRoundPairings({ participants, completedMatches, scoringRules }) {
  return SwissPairingEngine.generateSubsequentRoundPairings({
    participants,
    completedMatches,
    scoringRules,
  });
}

module.exports = {
  generateRoundOnePairings,
  generateNextRoundPairings,
};

