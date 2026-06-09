/**
 * Swiss bye facade.
 * BYE selection rule: exactly one bye per round for odd player counts,
 * and always to the lowest eligible standing (never had a bye).
 */
"use strict";

const SwissPairingEngine = require("../SwissPairingEngine");

function selectByeRecipient(players) {
  return SwissPairingEngine.selectByeRecipient(players);
}

module.exports = {
  selectByeRecipient,
};

