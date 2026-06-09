/**
 * Bye Handling Configuration & Helpers
 * Provides helper text, validation rules, and bracket calculation logic
 */

// ── BYE HANDLING MODES ──────────────────────────────────────────────
export const BYE_HANDLING_OPTIONS = {
  AUTO_EXPAND: {
    value: 'auto_expand',
    label: 'Auto-expand bracket (power of 2)',
    description: 'Bracket expands to nearest power of 2, lower seeds receive byes',
    helperText: (playerCount) => {
      if (!playerCount || playerCount < 1) return '';
      const bracketSize = getNextPowerOfTwo(playerCount);
      const byeCount = bracketSize - playerCount;
      if (byeCount === 0) {
        return `Perfect bracket: ${playerCount} players → ${bracketSize}-slot bracket (no byes needed)`;
      }
      return `${playerCount} players → ${bracketSize}-slot bracket with ${byeCount} bye${byeCount > 1 ? 's' : ''}`;
    },
    icon: '📊',
    color: 'blue',
  },
  PRELIMINARY_ROUND: {
    value: 'preliminary_round',
    label: 'Preliminary round',
    description: 'Bottom seeds play qualification matches, top seeds advance to main bracket',
    helperText: (playerCount) => {
      if (!playerCount || playerCount < 1) return '';
      const targetBracketSize = getNextPowerOfTwo(playerCount);
      if (playerCount === targetBracketSize) {
        return `Already power of 2: ${playerCount} players → no preliminary round needed`;
      }
      const extraPlayers = playerCount - targetBracketSize;
      const prelimMatches = Math.ceil(extraPlayers / 2);
      return `${playerCount} players → ${prelimMatches} preliminary match${prelimMatches > 1 ? 'es' : ''} + ${targetBracketSize} main bracket`;
    },
    icon: '🎯',
    color: 'amber',
    minPlayers: 3, // At least 3 to have a preliminary round
  },
  RANDOM_BYE: {
    value: 'random_bye',
    label: 'Random bye distribution',
    description: 'All players shuffled randomly, byes assigned randomly',
    helperText: (playerCount) => {
      if (!playerCount || playerCount < 1) return '';
      const bracketSize = getNextPowerOfTwo(playerCount);
      const byeCount = bracketSize - playerCount;
      if (byeCount === 0) {
        return `Perfect bracket: ${playerCount} players → no random distribution needed`;
      }
      return `${playerCount} players → ${byeCount} random bye${byeCount > 1 ? 's' : ''} among shuffled players`;
    },
    icon: '🎲',
    color: 'purple',
  },
  TOP_SEEDED: {
    value: 'top_seeded',
    label: 'Top-seeded byes',
    description: 'Top ranked/seeded players receive byes',
    helperText: (playerCount, seeding) => {
      if (!playerCount || playerCount < 1) return '';
      const bracketSize = getNextPowerOfTwo(playerCount);
      const byeCount = bracketSize - playerCount;

      if (seeding !== 'ranked' && seeding !== 'manual') {
        return `⚠️ Requires ranking data. Switch seeding to "Ranked (by points)" to use this option.`;
      }

      if (byeCount === 0) {
        return `Perfect bracket: ${playerCount} players → no byes needed`;
      }
      const topSeedCount = Math.min(byeCount, playerCount);
      return `Top ${topSeedCount} player${topSeedCount > 1 ? 's' : ''} of ${playerCount} receive bye${byeCount > 1 ? 's' : ''}`;
    },
    icon: '👑',
    color: 'green',
    requiresRanking: true,
  },
};

// ── UTILITY FUNCTIONS ──────────────────────────────────────────────

/**
 * Calculate next power of 2
 * @param {number} n - Current number
 * @returns {number} Next power of 2 >= n
 */
export function getNextPowerOfTwo(n) {
  if (n <= 1) return 1;
  if ((n & (n - 1)) === 0) return n; // Already power of 2
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Calculate bye count and match count for given player count and bye mode
 * @param {number} playerCount - Total players
 * @param {string} byeHandling - bye handling mode
 * @returns {object} { bracketSize, byeCount, realMatches, prelimMatches }
 */
export function calculateByeStructure(playerCount, byeHandling) {
  if (!playerCount || playerCount < 1) {
    return { bracketSize: 0, byeCount: 0, realMatches: 0, prelimMatches: 0 };
  }

  const targetBracketSize = getNextPowerOfTwo(playerCount);

  // PRELIMINARY ROUND
  if (byeHandling === 'preliminary_round' && playerCount !== targetBracketSize) {
    const extraPlayers = playerCount - targetBracketSize;
    const prelimMatches = Math.ceil(extraPlayers / 2);
    const mainBracketMatches = targetBracketSize - 1; // Standard knockout matches
    return {
      bracketSize: targetBracketSize,
      byeCount: 0,
      realMatches: mainBracketMatches + prelimMatches,
      prelimMatches,
      mainMatches: mainBracketMatches,
      hasPrelimsRound: true,
    };
  }

  // AUTO_EXPAND, RANDOM_BYE, TOP_SEEDED (all standard bracket with byes)
  const byeCount = targetBracketSize - playerCount;
  const realMatches = playerCount - 1; // Total matches needed
  const playersInMatches = playerCount - byeCount; // Players actually playing R1
  const round1Matches = playersInMatches / 2;

  return {
    bracketSize: targetBracketSize,
    byeCount,
    realMatches,
    prelimMatches: 0,
    mainMatches: realMatches,
    round1Matches: Math.ceil(round1Matches),
    hasPrelimsRound: false,
  };
}

/**
 * Get all bye handling options
 * @returns {array} Array of option objects
 */
export function getByeHandlingOptions() {
  return Object.values(BYE_HANDLING_OPTIONS);
}

/**
 * Get option by value
 * @param {string} value - option value
 * @returns {object|null} option object or null
 */
export function getByeHandlingOption(value) {
  const option = Object.values(BYE_HANDLING_OPTIONS).find(opt => opt.value === value);
  return option || null;
}

/**
 * Validate bye handling selection against player count
 * @param {string} byeHandling - bye handling mode
 * @param {number} playerCount - total players
 * @returns {object} { isValid: bool, errors: [], warnings: [] }
 */
export function validateByeHandling(byeHandling, playerCount) {
  const errors = [];
  const warnings = [];

  if (!byeHandling) {
    errors.push('Bye handling method is required');
    return { isValid: false, errors, warnings };
  }

  const option = getByeHandlingOption(byeHandling);
  if (!option) {
    errors.push(`Invalid bye handling mode: ${byeHandling}`);
    return { isValid: false, errors, warnings };
  }

  // Check minimum players for preliminary round
  if (byeHandling === 'preliminary_round' && playerCount && playerCount < 3) {
    warnings.push('Preliminary round requires at least 3 players. Will default to auto-expand for smaller groups.');
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Validate bye handling against seeding method
 * @param {string} byeHandling - bye handling mode
 * @param {string} seeding - seeding method (random, ranked, manual)
 * @returns {object} { isValid: bool, errors: [], warnings: [], message: string }
 */
export function validateSeedingByeCompatibility(byeHandling, seeding) {
  const errors = [];
  const warnings = [];
  let message = '';

  const option = getByeHandlingOption(byeHandling);

  if (option?.requiresRanking && seeding !== 'ranked' && seeding !== 'manual') {
    errors.push(
      `"${option.label}" requires ranked seeding data. Change seeding to "Ranked (by points)" to use this bye handling mode.`
    );
    message = `Seeding method incompatible with bye handling: requires ranking`;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    message,
  };
}

/**
 * Get disabled state for bye handling options
 * @param {string} byeHandling - bye handling mode
 * @param {string} seeding - seeding method
 * @param {number} playerCount - total players
 * @returns {object} { disabled: bool, reason: string }
 */
export function getByeHandlingDisabledState(byeHandling, seeding, playerCount) {
  const option = getByeHandlingOption(byeHandling);

  // Check ranking requirement
  if (option?.requiresRanking && seeding !== 'ranked' && seeding !== 'manual') {
    return {
      disabled: true,
      reason: `Requires "Ranked (by points)" seeding method`,
    };
  }

  // Check minimum player count for preliminary
  if (byeHandling === 'preliminary_round' && playerCount && playerCount < 3) {
    return {
      disabled: true,
      reason: 'Requires at least 3 players',
    };
  }

  return { disabled: false, reason: '' };
}

/**
 * Format bye structure for display
 * @param {number} playerCount - total players
 * @param {string} byeHandling - bye handling mode
 * @returns {string} Human-readable summary
 */
export function formatByeStructureSummary(playerCount, byeHandling) {
  if (!playerCount) return '';
  const option = getByeHandlingOption(byeHandling);
  if (!option) return '';

  return option.helperText(playerCount);
}
