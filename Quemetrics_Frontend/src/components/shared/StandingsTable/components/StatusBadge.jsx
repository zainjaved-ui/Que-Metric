import React from 'react';

/**
 * StatusBadge Component
 * Displays status indicators for players
 */
const StatusBadge = ({ status, qualified = false }) => {
  if (status === 'withdrawn') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-red-100 text-red-800 border border-red-200">
        Withdrawn
      </span>
    );
  }

  if (status === 'disqualified') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-gray-100 text-gray-800 border border-gray-200">
        Disqualified
      </span>
    );
  }

  if (status === 'late_enrollment') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-green-100 text-green-800 border border-green-200">
        🆕 Late Join
      </span>
    );
  }

  if (qualified) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-green-100 text-green-800 border border-green-200">
        ✓ Qualified
      </span>
    );
  }

  return null;
};

export default StatusBadge;
