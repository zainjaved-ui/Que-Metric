/**
 * Seeding Compatibility Validator
 * Validates bye handling selections against seeding methods
 */

/**
 * Bye handling modes and their requirements
 */
const BYE_HANDLING_CONFIG = {
  auto_expand: {
    requiresRanking: false,
    minPlayers: 1,
    description: 'Bracket expands to power of 2',
  },
  preliminary_round: {
    requiresRanking: false,
    minPlayers: 3,
    description: 'Bottom seeds play qualification, top seeds get byes',
  },
  random_bye: {
    requiresRanking: false,
    minPlayers: 1,
    description: 'Players shuffled, byes assigned randomly',
  },
  top_seeded: {
    requiresRanking: true, // MUST have seeding: ranked or manual
    minPlayers: 2,
    description: 'Top seeds receive byes',
  },
};

/**
 * Validate bye handling against seeding method
 * @param {string} byesHandling - bye handling mode
 * @param {string} seeding - seeding method (random, ranked, manual)
 * @param {number} playerCount - total players (optional)
 * @returns {object} { isValid: bool, errors: [], warnings: [] }
 */
function validateSeedingByeCompatibility(byesHandling, seeding, playerCount = null) {
  const errors = [];
  const warnings = [];

  // Validate bye handling exists
  if (!byesHandling || !BYE_HANDLING_CONFIG[byesHandling]) {
    errors.push(`Invalid bye handling mode: ${byesHandling}`);
    return { isValid: false, errors, warnings };
  }

  const config = BYE_HANDLING_CONFIG[byesHandling];

  // Check ranking requirement
  if (config.requiresRanking && seeding !== 'ranked' && seeding !== 'manual') {
    errors.push(
      `"${byesHandling}" bye handling requires ranked seeding data. ` +
      `Current seeding method is "${seeding}". Use "ranked" or "manual" seeding.`
    );
  }

  // Check minimum player count (if provided)
  if (playerCount && playerCount < config.minPlayers) {
    if (byesHandling === 'preliminary_round') {
      warnings.push(
        `"${byesHandling}" requires at least ${config.minPlayers} players. ` +
        `Will default to "auto_expand" for ${playerCount} player${playerCount > 1 ? 's' : ''}.`
      );
    }
  }

  // Additional validation: manual seeding with top_seeded
  if (byesHandling === 'top_seeded' && seeding === 'manual') {
    warnings.push(
      'Manual seeding with top-seeded byes: top N players from manual seed order will receive byes.'
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get validation error message for API response
 * @param {string} byesHandling
 * @param {string} seeding
 * @param {number} playerCount
 * @returns {string|null} error message or null if valid
 */
function getSeedingByeError(byesHandling, seeding, playerCount = null) {
  const validation = validateSeedingByeCompatibility(byesHandling, seeding, playerCount);
  return validation.errors.length > 0 ? validation.errors[0] : null;
}

/**
 * Check if bye handling is compatible with seeding
 * @param {string} byesHandling
 * @param {string} seeding
 * @returns {boolean}
 */
function isCompatible(byesHandling, seeding) {
  const validation = validateSeedingByeCompatibility(byesHandling, seeding);
  return validation.isValid;
}

module.exports = {
  validateSeedingByeCompatibility,
  getSeedingByeError,
  isCompatible,
  BYE_HANDLING_CONFIG,
};
