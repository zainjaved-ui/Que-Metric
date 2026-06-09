import React from 'react';
import { FaSpinner, FaTrophy } from 'react-icons/fa';
import RankBadge from './components/RankBadge';
import PlayerCell from './components/PlayerCell';
import StatCell from './components/StatCell';
import StreakBadge from './components/StreakBadge';
import { getColumnVisibility, getRowClassName } from './utils';

/**
 * BaseStandingsTable Component
 * Shared component for displaying standings across Leagues and Tournaments
 *
 * @param {Array} standings - Array of standings data
 * @param {Object} standingsDisplay - Column configuration
 * @param {Boolean} loading - Loading state
 * @param {String} error - Error message
 * @param {String} sport - Sport type (snooker, pool, pooker, poker)
 * @param {Boolean} isCompleted - Whether league/tournament is completed
 * @param {String} currentUserId - Current user's ID for highlighting
 * @param {Function} onPlayerClick - Callback when player is clicked
 * @param {Object} adminActions - Admin action buttons (optional)
 * @param {Function} onRetry - Callback for retry button
 * @param {String} emptyMessage - Message to show when no standings
 * @param {Boolean} showGroupFilter - Show group filtering (for tournaments)
 * @param {Array} groups - Array of groups (for tournaments)
 * @param {Number} activeGroup - Currently selected group
 * @param {Function} onGroupChange - Callback when group changes
 */
const BaseStandingsTable = ({
  standings = [],
  standingsDisplay = null,
  loading = false,
  error = null,
  sport = 'snooker',
  isCompleted = false,
  currentUserId = null,
  onPlayerClick = null,
  adminActions = null,
  onRetry = null,
  emptyMessage = 'No standings available yet.',
  showGroupFilter = false,
  groups = [],
  activeGroup = null,
  onGroupChange = null,
}) => {
  // Parse column visibility
  const visibleCols = getColumnVisibility(standingsDisplay, {
    matchesPlayed: true,
    wins: true,
    losses: true,
    draws: true,
    framesWon: true,
    framesConceded: true,
    frameDifference: true,
    whitewashes: true,
    highestBreak: true,
    winPercentage: true,
    streak: true,
    points: true,
  });

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <FaSpinner className="animate-spin text-3xl text-[#132F45]" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12 opacity-70">
        <FaTrophy className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p className="text-red-600 mb-2">Error loading standings</p>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#0f2333] transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Empty state
  if (standings.length === 0) {
    return (
      <div className="text-center py-12 opacity-70">
        <FaTrophy className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p className="text-gray-600">{emptyMessage}</p>
      </div>
    );
  }

  const showActions = !!adminActions;

  return (
    <div className="space-y-4">
      {/* Group Filter (for tournaments with groups) */}
      {showGroupFilter && groups.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onGroupChange?.(null)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeGroup === null
                ? 'bg-[#132F45] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Groups
          </button>
          {groups.map((group) => (
            <button
              key={group.groupNumber}
              onClick={() => onGroupChange?.(group.groupNumber)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeGroup === group.groupNumber
                  ? 'bg-[#132F45] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {group.groupName || `Group ${group.groupNumber}`}
            </button>
          ))}
        </div>
      )}

      {/* Standings Table */}
      <div className="overflow-x-auto shadow-sm border border-gray-100 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          {/* Table Header */}
          <thead className="bg-[#F8FAFC]">
            <tr>
              <th className="px-3 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider w-8">#</th>
              <th className="px-4 py-3 text-left text-[10px] font-black text-[#132F45] uppercase tracking-wider min-w-[150px]">Player</th>
              {visibleCols.matchesPlayed && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">MP</th>}
              {visibleCols.wins && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">W</th>}
              {visibleCols.losses && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">L</th>}
              {visibleCols.draws && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">D</th>}
              {visibleCols.framesWon && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">FW</th>}
              {visibleCols.framesConceded && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">FC</th>}
              {visibleCols.frameDifference && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">FD</th>}
              {visibleCols.ballsPotted && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">Balls</th>}
              {visibleCols.ballsConceded && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">BC</th>}
              {visibleCols.breaks50Plus && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">50+</th>}
              {visibleCols.breaks100Plus && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">100+</th>}
              {visibleCols.sevenBallWins && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">7B</th>}
              {visibleCols.blackFinishes && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">BF</th>}
              {visibleCols.whitewashWins && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">WW</th>}
              {visibleCols.whitewashes && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">WW</th>}
              {visibleCols.highestBreak && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">HB</th>}
              {visibleCols.winPercentage && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">Win%</th>}
              {visibleCols.streak && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">Streak</th>}
              {visibleCols.points && <th className="px-4 py-3 text-center text-[10px] font-black text-white bg-[#132F45] uppercase tracking-wider">Pts</th>}
              {showActions && <th className="px-4 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider rounded-tr-lg">Actions</th>}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="bg-white divide-y divide-gray-100">
            {standings.map((entry, idx) => {
              const position = entry.position || idx + 1;
              const player = {
                id: entry.playerId,
                name: entry.playerName,
                nickname: entry.playerNickname,
                avatarUrl: entry.playerAvatarUrl,
              };
              const rowClass = getRowClassName(position, player.id === currentUserId, entry.status);

              return (
                <tr key={entry.id || entry.playerId} className={rowClass}>
                  {/* Rank */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <RankBadge position={position} isCompleted={isCompleted} />
                  </td>

                  {/* Player */}
                  <td
                    className={`px-4 py-4 whitespace-nowrap ${onPlayerClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                    onClick={() => onPlayerClick?.(player)}
                  >
                    <PlayerCell
                      player={player}
                      position={position}
                      isCompleted={isCompleted}
                      status={entry.status}
                      showQualified={entry.qualified !== undefined}
                      isQualified={entry.qualified}
                      currentUserId={currentUserId}
                    />
                  </td>

                  {/* Stats */}
                  {visibleCols.matchesPlayed && <StatCell statName="matchesPlayed" value={entry.matchesPlayed ?? 0} />}
                  {visibleCols.wins && <StatCell statName="wins" value={entry.matchesWon ?? 0} />}
                  {visibleCols.losses && <StatCell statName="losses" value={entry.matchesLost ?? 0} />}
                  {visibleCols.draws && <StatCell statName="draws" value={entry.matchesDraw ?? entry.draws ?? 0} />}
                  {visibleCols.framesWon && <StatCell statName="framesWon" value={entry.framesWon ?? 0} />}
                  {visibleCols.framesConceded && <StatCell statName="framesConceded" value={entry.framesLost ?? entry.framesConceded ?? 0} />}
                  {visibleCols.frameDifference && <StatCell statName="frameDifference" value={entry.frameDifference ?? 0} />}
                  {visibleCols.ballsPotted && <StatCell statName="ballsPotted" value={entry.ballsPotted ?? 0} />}
                  {visibleCols.ballsConceded && <StatCell statName="ballsConceded" value={entry.ballsConceded ?? 0} />}
                  {visibleCols.breaks50Plus && <StatCell statName="breaks50Plus" value={entry.breaks50Plus ?? 0} />}
                  {visibleCols.breaks100Plus && <StatCell statName="breaks100Plus" value={entry.breaks100Plus ?? 0} />}
                  {visibleCols.sevenBallWins && <StatCell statName="sevenBallWins" value={entry.sevenBallWins ?? 0} />}
                  {visibleCols.blackFinishes && <StatCell statName="blackFinishes" value={entry.blackFinishes ?? 0} />}
                  {visibleCols.whitewashWins && <StatCell statName="whitewashWins" value={entry.whitewashWins ?? entry.whitewashes ?? 0} />}
                  {visibleCols.whitewashes && <StatCell statName="whitewashes" value={entry.whitewashes ?? 0} />}
                  {visibleCols.highestBreak && <StatCell statName="highestBreak" value={entry.highestBreak || '-'} />}
                  {visibleCols.winPercentage && <StatCell statName="winPercentage" value={entry.winPercentage ?? 0} />}
                  {visibleCols.streak && (
                    <td className="px-2 py-4 whitespace-nowrap text-center text-xs">
                      <StreakBadge streak={entry.streak} />
                    </td>
                  )}
                  {visibleCols.points && <StatCell statName="points" value={entry.points ?? 0} className="bg-blue-50/50" />}

                  {/* Admin Actions */}
                  {showActions && (
                    <td className="px-4 py-4 whitespace-nowrap text-center space-x-2">
                      {adminActions?.renderActions?.(entry)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BaseStandingsTable;
