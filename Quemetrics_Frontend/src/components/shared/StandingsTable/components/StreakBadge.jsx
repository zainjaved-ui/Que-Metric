import React from 'react';
import { formatStreak } from '../utils';

/**
 * StreakBadge Component
 * Displays win/loss streak indicator
 */
const StreakBadge = ({ streak }) => {
  const displayStreak = formatStreak(streak);

  if (!displayStreak || displayStreak === '-') {
    return <span className="text-gray-400">-</span>;
  }

  let colorClass = 'bg-gray-100 text-gray-600';
  if (displayStreak.startsWith('W')) {
    colorClass = 'bg-green-100 text-green-700';
  } else if (displayStreak.startsWith('L')) {
    colorClass = 'bg-red-100 text-red-700';
  } else if (displayStreak.startsWith('D')) {
    colorClass = 'bg-gray-100 text-gray-600';
  } else if (displayStreak === 'WO') {
    colorClass = 'bg-orange-100 text-orange-700';
  }

  return (
    <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${colorClass}`}>
      {displayStreak}
    </span>
  );
};

export default StreakBadge;
