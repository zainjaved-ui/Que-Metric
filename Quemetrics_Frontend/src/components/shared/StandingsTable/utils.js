/**
 * Utility functions for Standings Table components
 */

/**
 * Parse column visibility from standingsDisplay configuration
 * Supports both object format (legacy) and array format (new wizard)
 */
export const getColumnVisibility = (standingsDisplay, defaults = {}) => {
  if (!standingsDisplay?.columns) {
    // Show all by default if no configuration
    return Object.keys(defaults).reduce((acc, key) => ({ ...acc, [key]: true }), {});
  }

  const columns = standingsDisplay.columns;

  const isColumnVisible = (...keys) => {
    if (Array.isArray(columns)) {
      return keys.some((key) => columns.includes(key));
    }

    if (columns && typeof columns === 'object') {
      return keys.some((key) =>
        Object.prototype.hasOwnProperty.call(columns, key) && columns[key] !== false
      );
    }

    return true;
  };

  return {
    matchesPlayed: isColumnVisible('matchesPlayed'),
    wins: isColumnVisible('wins'),
    losses: isColumnVisible('losses'),
    draws: isColumnVisible('draws'),
    framesWon: isColumnVisible('framesWon'),
    framesConceded: isColumnVisible('framesConceded', 'framesLost'),
    frameDifference: isColumnVisible('frameDifference', 'frameDiff'),
    whitewashes: isColumnVisible('whitewashes', 'ww'),
    highestBreak: isColumnVisible('highestBreak', 'hb'),
    winPercentage: isColumnVisible('winPercent', 'winPercentage'),
    streak: isColumnVisible('streak'),
    ballsPotted: isColumnVisible('ballsPotted', 'totalBallsPotted'),
    ballsConceded: isColumnVisible('ballsConceded'),
    sevenBallWins: isColumnVisible('sevenBallWins', 'sbw'),
    blackFinishes: isColumnVisible('blackFinishes', 'bf'),
    whitewashWins: isColumnVisible('whitewashWins', 'www'),
    breaks50Plus: isColumnVisible('breaks50Plus'),
    breaks100Plus: isColumnVisible('breaks100Plus'),
    points: isColumnVisible('points'),
  };
};

/**
 * Get color class for a stat value
 */
export const getStatColor = (statName, value) => {
  switch (statName) {
    case 'wins':
    case 'matchesWon':
      return 'text-green-600 font-black';
    case 'losses':
    case 'matchesLost':
      return 'text-red-600 font-bold';
    case 'draws':
      return 'text-gray-500 font-medium';
    case 'framesWon':
      return 'text-[#132F45] font-medium';
    case 'framesConceded':
    case 'framesLost':
      return 'font-medium text-gray-500';
    case 'frameDifference':
      if (value > 0) return 'text-green-600 font-bold';
      if (value < 0) return 'text-red-500 font-bold';
      return 'text-gray-400 font-bold';
    case 'highestBreak':
      return 'italic font-medium text-blue-600';
    case 'ballsPotted':
      return 'font-medium text-emerald-600';
    case 'sevenBallWins':
      return 'font-bold text-yellow-600';
    case 'blackFinishes':
      return 'font-bold text-gray-800';
    case 'whitewashWins':
    case 'whitewashes':
      return 'text-purple-600 font-black';
    case 'breaks50Plus':
      return 'font-bold text-orange-600';
    case 'breaks100Plus':
      return 'font-black text-red-600';
    case 'winPercentage':
      return 'font-bold text-gray-600';
    case 'points':
      return 'font-black text-[#132F45]';
    default:
      return 'font-medium text-[#132F45]';
  }
};

/**
 * Format streak for display
 */
export const formatStreak = (streak) => {
  if (!streak || streak === '-') return '-';
  return streak;
};

/**
 * Get medal icon for top 3 positions
 */
export const getMedalIcon = (position) => {
  switch (position) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return null;
  }
};

/**
 * Get row background class based on position and status
 */
export const getRowClassName = (position, isCurrentUser, status) => {
  if (status === 'withdrawn') {
    return 'opacity-40 grayscale';
  }
  if (isCurrentUser) {
    return 'bg-[#FDF2D1]/40'; // Gold tint for current user
  }
  if (position <= 3) {
    return 'bg-blue-50/30'; // Blue highlight for top 3
  }
  return '';
};

/**
 * Format frame difference with +/- sign
 */
export const formatFrameDifference = (value) => {
  if (value === null || value === undefined) return '0';
  if (value > 0) return `+${value}`;
  return String(value);
};

/**
 * Get default image URL
 */
export const getImageUrl = (url) => {
  if (!url) return null;
  // Handle relative URLs
  if (url.startsWith('/')) {
    return url;
  }
  return url;
};
