import React from 'react';
import { FaTrophy } from 'react-icons/fa';
import { getImageUrl } from '../utils';

/**
 * PlayerCell Component
 * Displays player name, avatar, and status badges
 */
const PlayerCell = ({
  player,
  position,
  isCompleted = false,
  status,
  showQualified = false,
  isQualified = false,
  currentUserId = null
}) => {
  const isChampion = isCompleted && position === 1;
  const isLeader = !isCompleted && position === 1;
  const isCurrentUser = currentUserId && player?.id === currentUserId;

  return (
    <div className="flex items-center">
      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-[#132F45] font-bold text-xs border border-blue-200 flex-shrink-0">
        {player?.avatarUrl ? (
          <img
            src={getImageUrl(player.avatarUrl)}
            alt=""
            className="h-full w-full rounded-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          (player?.name || "P").charAt(0).toUpperCase()
        )}
      </div>
      <div className="ml-3">
        <div className="text-sm font-bold text-[#132F45] flex items-center gap-2 flex-wrap">
          <span>{player?.name || 'Unknown Player'}</span>

          {/* Champion/Leader Badge */}
          {(isChampion || isLeader) && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
              isChampion
                ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                : 'bg-blue-100 text-blue-800 border-blue-200'
            }`}>
              <FaTrophy className={isChampion ? 'text-yellow-600' : 'text-blue-600'} />
              {isChampion ? 'Champion' : 'Leader'}
            </span>
          )}

          {/* Qualified Badge */}
          {showQualified && isQualified && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border bg-green-100 text-green-800 border-green-200">
              ✓ Qualified
            </span>
          )}

          {/* Withdrawn Badge */}
          {status === 'withdrawn' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase border bg-red-100 text-red-800 border-red-200">
              Withdrawn
            </span>
          )}

          {/* Late Join Badge */}
          {status === 'late_enrollment' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase border bg-green-100 text-green-800 border-green-200">
              🆕 Late Join
            </span>
          )}

          {/* Current User Indicator */}
          {isCurrentUser && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
              You
            </span>
          )}
        </div>
        {player?.nickname && (
          <div className="text-xs text-gray-500">{player.nickname}</div>
        )}
      </div>
    </div>
  );
};

export default PlayerCell;
