/**
 * Seeding Validation Utilities
 * Validates seeding configuration and player assignments
 */

/**
 * Validate manual seeding configuration
 * @param {Array} manualSeedOrder - Array of player IDs in seed position order
 * @param {Array} enrolledPlayerIds - Array of enrolled player IDs
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
function validateManualSeeding(manualSeedOrder, enrolledPlayerIds) {
  const errors = [];

  if (!Array.isArray(manualSeedOrder)) {
    errors.push('Manual seed order must be an array');
    return { isValid: false, errors };
  }

  if (!Array.isArray(enrolledPlayerIds)) {
    errors.push('Enrolled player IDs must be an array');
    return { isValid: false, errors };
  }

  // Check if all seed order entries are valid UUIDs
  const uniqueSeeds = new Set();
  manualSeedOrder.forEach((playerId, index) => {
    if (!playerId) {
      errors.push(`Position ${index + 1}: Player ID is missing or invalid`);
      return;
    }

    if (uniqueSeeds.has(playerId)) {
      errors.push(`Duplicate player ID at position ${index + 1}: ${playerId}`);
    } else {
      uniqueSeeds.add(playerId);
    }
  });

  // Check if all players are from enrolled list
  const enrolledSet = new Set(enrolledPlayerIds);
  manualSeedOrder.forEach((playerId, index) => {
    if (!enrolledSet.has(playerId)) {
      errors.push(`Position ${index + 1}: Player ${playerId} is not enrolled in tournament`);
    }
  });

  // Check if all enrolled players are assigned
  if (manualSeedOrder.length < enrolledPlayerIds.length) {
    const assignedSet = new Set(manualSeedOrder);
    const unassigned = enrolledPlayerIds.filter((pId) => !assignedSet.has(pId));
    errors.push(`Not all players are assigned: ${unassigned.length} players missing seed positions`);
  }

  // Check for gaps in positions
  if (manualSeedOrder.length === enrolledPlayerIds.length) {
    if (manualSeedOrder.length > 0 && uniqueSeeds.size === manualSeedOrder.length) {
      // All positions assigned and unique - valid
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    assignedCount: manualSeedOrder.length,
    totalCount: enrolledPlayerIds.length,
  };
}

/**
 * Validate seeding method for a tournament
 * @param {string} seedingMethod - Seeding method (random, ranked, manual)
 * @param {Object} config - Tournament format config
 * @param {Array} enrolledPlayerIds - Array of enrolled player IDs
 * @returns {Object} { isValid: boolean, errors: Array<string>, warnings: Array<string> }
 */
function validateSeedingConfig(seedingMethod, config, enrolledPlayerIds) {
  const errors = [];
  const warnings = [];

  if (!['random', 'ranked', 'manual'].includes(seedingMethod)) {
    errors.push(`Invalid seeding method: ${seedingMethod}`);
    return { isValid: false, errors, warnings };
  }

  if (seedingMethod === 'manual') {
    const manualValidation = validateManualSeeding(config.manualSeedOrder || [], enrolledPlayerIds);
    if (!manualValidation.isValid) {
      errors.push(...manualValidation.errors);
    }
  }

  if (seedingMethod === 'ranked') {
    if (!config.rankingSource) {
      warnings.push('Ranking source not specified, using default: "global"');
    }

    if (!['global', 'league_table'].includes(config.rankingSource)) {
      errors.push(`Invalid ranking source: ${config.rankingSource}. Must be "global" or "league_table"`);
    }

    if (enrolledPlayerIds.length < 2) {
      warnings.push('Ranked seeding with fewer than 2 players will have no effect');
    }
  }

  if (seedingMethod === 'random' && enrolledPlayerIds.length < 2) {
    warnings.push('Random seeding with fewer than 2 players will have no effect');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Build seed positions from manual seed order
 * Maps player IDs to their seed positions
 * @param {Array} manualSeedOrder - Array of player IDs in seed order
 * @returns {Object} Map of playerId -> seedPosition (1-indexed)
 */
function buildSeedPositionMap(manualSeedOrder) {
  const map = {};
  (manualSeedOrder || []).forEach((playerId, index) => {
    map[playerId] = index + 1; // 1-indexed positions
  });
  return map;
}

module.exports = {
  validateManualSeeding,
  validateSeedingConfig,
  buildSeedPositionMap,
};
