/**
 * Ranking Preset Service
 *
 * Provides tier-based ranking point presets, validation logic, and
 * compatibility rules for tournament ranking configuration.
 */

/**
 * NEW: 3-tier ranking model per specification
 * Structure: { Winner, 'Runner-Up', 'Semi-Final', 'Quarter-Final', Last16, Last32 }
 * Tiers: Tier1 (Major Events), Tier2 (Club Championships), Tier3 (Local/Open)
 */
const TIER_3_MODEL_PRESETS = {
  tier1: {
    Winner: 500,
    "Runner-Up": 300,
    "Semi-Final": 180,
    "Quarter-Final": 100,
    Last16: 50,
    Last32: 25,
  },
  tier2: {
    Winner: 200,
    "Runner-Up": 120,
    "Semi-Final": 70,
    "Quarter-Final": 40,
    Last16: 20,
  },
  tier3: {
    Winner: 100,
    "Runner-Up": 60,
    "Semi-Final": 35,
    "Quarter-Final": 20,
  },
};

/**
 * NEW: 3-tier minimum participants for full points
 * Below minimum = 50% weighting applied
 */
const TIER_3_MODEL_MINIMUMS = {
  tier1: 16,
  tier2: 12,
  tier3: 8,
};

/**
 * NEW: Mapping from old 5-tier to new 3-tier model
 */
const TIER_COMPATIBILITY_MAPPING = {
  international: "tier1",
  national: "tier1",
  regional: "tier2",
  county: "tier2",
  local: "tier3",
};

/**
 * Default ranking points structure for each tournament tier (LEGACY)
 *
 * Structure: { winner, runnerUp, semi, quarter }
 * - winner: 1st place (Champion)
 * - runnerUp: 2nd place (Runner-up/Final loser)
 * - semi: 3rd-4th place (Semi-final losers)
 * - quarter: 5th-8th place (Quarter-final losers)
 */
const TIER_POINT_PRESETS = {
  international: {
    winner: 1000,
    runnerUp: 600,
    semi: 360,
    quarter: 220
  },
  national: {
    winner: 500,
    runnerUp: 300,
    semi: 180,
    quarter: 100
  },
  regional: {
    winner: 200,
    runnerUp: 120,
    semi: 60,
    quarter: 30
  },
  county: {
    winner: 100,
    runnerUp: 60,
    semi: 30,
    quarter: 10
  },
  local: {
    winner: 50,
    runnerUp: 30,
    semi: 15,
    quarter: 5
  }
};

/**
 * Recommended minimum participants for each tier to award ranking points
 *
 * These are recommendations - organizers can override via minPlayersForRankingPoints
 */
const TIER_MINIMUM_PLAYERS = {
  international: 32,
  national: 16,
  regional: 8,
  county: 4,
  local: 2
};

/**
 * Tier-Scope compatibility matrix
 *
 * Defines which ranking scopes are typically appropriate for each tournament tier.
 * Used for advisory warnings (not strict enforcement for flexibility).
 */
const TIER_SCOPE_COMPATIBILITY = {
  international: {
    recommended: ['national'],
    allowed: ['national'],
    discouraged: ['county', 'regional']
  },
  local: {
    recommended: ['county'],
    allowed: ['county', 'regional'],
    discouraged: ['national']
  },
  county: {
    recommended: ['county', 'regional'],
    allowed: ['county', 'regional', 'national'],
    discouraged: []
  },
  regional: {
    recommended: ['regional', 'national'],
    allowed: ['county', 'regional', 'national'],
    discouraged: []
  },
  national: {
    recommended: ['national'],
    allowed: ['regional', 'national'],
    discouraged: ['county']
  }
};

/**
 * Valid tier values
 */
const VALID_TIERS = ['local', 'county', 'regional', 'national', 'international'];

/**
 * Valid ranking scope values
 */
const VALID_SCOPES = ['county', 'regional', 'national'];

/**
 * Get default ranking point distribution for a given tier
 *
 * @param {string} tier - Tournament tier (local, county, regional, national)
 * @returns {Object} Point distribution { winner, runnerUp, semi, quarter }
 */
function getTierPresets(tier) {
  if (!tier || !TIER_POINT_PRESETS[tier]) {
    // Default to local if tier is invalid
    return { ...TIER_POINT_PRESETS.local };
  }

  return { ...TIER_POINT_PRESETS[tier] };
}

/**
 * Get recommended minimum players for a given tier
 *
 * @param {string} tier - Tournament tier
 * @returns {number} Recommended minimum participant count
 */
function getRecommendedMinimumPlayers(tier) {
  return TIER_MINIMUM_PLAYERS[tier] || TIER_MINIMUM_PLAYERS.local;
}

/**
 * Validate if a tier value is valid
 *
 * @param {string} tier - Tournament tier to validate
 * @returns {boolean} True if valid
 */
function isValidTier(tier) {
  return VALID_TIERS.includes(tier);
}

/**
 * Validate if ranking scope values are valid
 *
 * @param {Array<string>} scopes - Ranking scopes to validate
 * @returns {Object} { valid: boolean, invalidScopes: Array<string> }
 */
function validateRankingScopes(scopes) {
  if (!Array.isArray(scopes)) {
    return { valid: false, invalidScopes: [], error: 'Ranking scope must be an array' };
  }

  const invalidScopes = scopes.filter(scope => !VALID_SCOPES.includes(scope));

  return {
    valid: invalidScopes.length === 0,
    invalidScopes
  };
}

/**
 * Check tier-scope compatibility and return advisory warnings
 *
 * @param {string} tier - Tournament tier
 * @param {Array<string>} scopes - Selected ranking scopes
 * @returns {Object} { compatible: boolean, warnings: Array<string>, recommendations: Array<string> }
 */
function checkTierScopeCompatibility(tier, scopes) {
  if (!tier || !TIER_SCOPE_COMPATIBILITY[tier]) {
    return {
      compatible: true,
      warnings: [],
      recommendations: []
    };
  }

  const compatibility = TIER_SCOPE_COMPATIBILITY[tier];
  const warnings = [];
  const recommendations = [];

  // Check for discouraged scopes
  scopes.forEach(scope => {
    if (compatibility.discouraged.includes(scope)) {
      warnings.push(`${capitalize(tier)} tournaments typically should not affect ${capitalize(scope)} rankings`);
    }
    if (!compatibility.allowed.includes(scope)) {
      warnings.push(`${capitalize(scope)} scope is unusual for ${capitalize(tier)} tier tournaments`);
    }
  });

  // Check if any recommended scopes are missing
  const missingRecommended = compatibility.recommended.filter(
    rec => !scopes.includes(rec)
  );

  if (missingRecommended.length > 0) {
    recommendations.push(
      `Consider adding ${missingRecommended.map(capitalize).join(', ')} scope(s) for ${capitalize(tier)} tournaments`
    );
  }

  return {
    compatible: warnings.length === 0,
    warnings,
    recommendations
  };
}

/**
 * Validate point distribution structure and values
 *
 * @param {Object} pointDistribution - Point distribution object
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validatePointDistribution(pointDistribution) {
  const errors = [];

  if (!pointDistribution || typeof pointDistribution !== 'object') {
    errors.push('Point distribution must be an object');
    return { valid: false, errors };
  }

  const requiredPositions = ['winner', 'runnerUp', 'semi', 'quarter'];

  requiredPositions.forEach(position => {
    if (!(position in pointDistribution)) {
      errors.push(`Missing required position: ${position}`);
    } else {
      const value = pointDistribution[position];

      if (typeof value !== 'number') {
        errors.push(`${position} points must be a number`);
      } else if (value < 0) {
        errors.push(`${position} points cannot be negative`);
      } else if (!Number.isInteger(value)) {
        errors.push(`${position} points must be an integer`);
      }
    }
  });

  // At least winner position should have points > 0
  if (pointDistribution.winner !== undefined && pointDistribution.winner <= 0) {
    errors.push('Winner points must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate minimum players for ranking points
 *
 * @param {number} minPlayers - Minimum player count
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateMinimumPlayers(minPlayers) {
  if (typeof minPlayers !== 'number') {
    return { valid: false, error: 'Minimum players must be a number' };
  }

  if (minPlayers < 2) {
    return { valid: false, error: 'Minimum players for ranking points must be at least 2' };
  }

  if (!Number.isInteger(minPlayers)) {
    return { valid: false, error: 'Minimum players must be an integer' };
  }

  return { valid: true, error: null };
}

/**
 * Comprehensive ranking configuration validation
 *
 * @param {Object} config - Ranking configuration object
 * @param {boolean} config.ranked - Whether tournament is ranked
 * @param {string} config.tier - Tournament tier
 * @param {Array<string>} config.rankingScope - Selected ranking scopes
 * @param {number} config.minPlayersForRankingPoints - Minimum players threshold
 * @param {Object} config.rankingPointsPerRound - Point distribution
 * @returns {Object} Validation result with errors, warnings, and recommendations
 */
function validateRankingConfiguration(config) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    recommendations: [],
    tierPresets: null
  };

  // If not ranked, skip most validations
  if (!config.ranked) {
    return result;
  }

  // Validate tier
  if (!config.tier) {
    result.valid = false;
    result.errors.push('Tournament tier is required for ranked tournaments');
  } else if (!isValidTier(config.tier)) {
    result.valid = false;
    result.errors.push(`Invalid tier: ${config.tier}. Must be one of: ${VALID_TIERS.join(', ')}`);
  } else {
    // Provide tier presets for reference
    result.tierPresets = getTierPresets(config.tier);

    // Add recommendation about minimum players
    const recommendedMin = getRecommendedMinimumPlayers(config.tier);
    if (config.minPlayersForRankingPoints < recommendedMin) {
      result.recommendations.push(
        `Recommended minimum for ${capitalize(config.tier)} tournaments: ${recommendedMin} players`
      );
    }
  }

  // Validate ranking scope
  if (!config.rankingScope || config.rankingScope.length === 0) {
    result.valid = false;
    result.errors.push('At least one ranking scope must be selected for ranked tournaments');
  } else {
    const scopeValidation = validateRankingScopes(config.rankingScope);
    if (!scopeValidation.valid) {
      result.valid = false;
      if (scopeValidation.error) {
        result.errors.push(scopeValidation.error);
      }
      if (scopeValidation.invalidScopes.length > 0) {
        result.errors.push(
          `Invalid ranking scope(s): ${scopeValidation.invalidScopes.join(', ')}. Must be one of: ${VALID_SCOPES.join(', ')}`
        );
      }
    }

    // Check tier-scope compatibility
    if (config.tier && scopeValidation.valid) {
      const compatibility = checkTierScopeCompatibility(config.tier, config.rankingScope);
      result.warnings.push(...compatibility.warnings);
      result.recommendations.push(...compatibility.recommendations);
    }
  }

  // Validate minimum players
  if (config.minPlayersForRankingPoints !== undefined) {
    const minPlayersValidation = validateMinimumPlayers(config.minPlayersForRankingPoints);
    if (!minPlayersValidation.valid) {
      result.valid = false;
      result.errors.push(minPlayersValidation.error);
    }
  }

  // Validate point distribution
  if (config.rankingPointsPerRound) {
    const pointValidation = validatePointDistribution(config.rankingPointsPerRound);
    if (!pointValidation.valid) {
      result.valid = false;
      result.errors.push(...pointValidation.errors);
    }
  }

  return result;
}

/**
 * Helper function to capitalize first letter
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get default ranking point distribution for the new 3-tier model
 *
 * @param {string} newTier - New tier level (tier1, tier2, tier3)
 * @returns {Object} Point distribution
 */
function getTier3Presets(newTier) {
  if (!newTier || !TIER_3_MODEL_PRESETS[newTier]) {
    return { ...TIER_3_MODEL_PRESETS.tier3 };
  }
  return { ...TIER_3_MODEL_PRESETS[newTier] };
}

/**
 * Get minimum players for new 3-tier model
 *
 * @param {string} newTier - New tier level (tier1, tier2, tier3)
 * @returns {number} Recommended minimum participant count
 */
function getTier3MinimumPlayers(newTier) {
  return TIER_3_MODEL_MINIMUMS[newTier] || TIER_3_MODEL_MINIMUMS.tier3;
}

/**
 * Map old 5-tier to new 3-tier model
 *
 * @param {string} oldTier - Old tier value (local, county, regional, national, international)
 * @returns {string} New tier level (tier1, tier2, tier3)
 */
function mapTier(oldTier) {
  return TIER_COMPATIBILITY_MAPPING[oldTier] || "tier3";
}

module.exports = {
  // NEW: 3-tier model constants
  TIER_3_MODEL_PRESETS,
  TIER_3_MODEL_MINIMUMS,
  TIER_COMPATIBILITY_MAPPING,

  // Constants (legacy)
  TIER_POINT_PRESETS,
  TIER_MINIMUM_PLAYERS,
  TIER_SCOPE_COMPATIBILITY,
  VALID_TIERS,
  VALID_SCOPES,

  // NEW: 3-tier model functions
  getTier3Presets,
  getTier3MinimumPlayers,
  mapTier,

  // Functions (legacy)
  getTierPresets,
  getRecommendedMinimumPlayers,
  isValidTier,
  validateRankingScopes,
  checkTierScopeCompatibility,
  validatePointDistribution,
  validateMinimumPlayers,
  validateRankingConfiguration
};
