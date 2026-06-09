import React from 'react';
import { getStatColor, formatFrameDifference } from '../utils';

/**
 * StatCell Component
 * Displays a stat value with appropriate coloring
 */
const StatCell = ({ statName, value, className = '' }) => {
  const colorClass = getStatColor(statName, value);

  let displayValue = value;
  if (statName === 'frameDifference') {
    displayValue = formatFrameDifference(value);
  } else if (value === null || value === undefined) {
    displayValue = '-';
  } else if (statName === 'winPercentage') {
    displayValue = `${Math.round(value)}%`;
  }

  return (
    <td className={`px-2 py-4 whitespace-nowrap text-center text-xs ${colorClass} ${className}`}>
      {displayValue}
    </td>
  );
};

export default StatCell;
