import React from 'react';
import { getMedalIcon } from '../utils';

/**
 * RankBadge Component
 * Displays rank position with medal icons for top 3
 */
const RankBadge = ({ position, isCompleted = false }) => {
  const medal = getMedalIcon(position);

  return (
    <div className="flex items-center justify-center">
      {medal ? (
        <span className="text-2xl" title={`Position ${position}`}>
          {medal}
        </span>
      ) : (
        <span className="text-sm font-black text-gray-400">
          {position}
        </span>
      )}
    </div>
  );
};

export default RankBadge;
