import React, { useState } from 'react';
import { FaTimes, FaTrophy, FaCheckCircle } from 'react-icons/fa';

/**
 * TournamentCompletionModal Component
 * Handle tournament completion and award ranking points
 */
export default function TournamentCompletionModal({
  tournament,
  standings,
  matchStats,
  onComplete,
  onCancel,
  loading = false,
}) {
  const [confirmed, setConfirmed] = useState(false);

  const getTierBadge = (tier) => {
    const badges = {
      national: { bg: 'bg-yellow-100', text: 'text-yellow-900', label: 'National' },
      regional: { bg: 'bg-purple-100', text: 'text-purple-900', label: 'Regional' },
      county:   { bg: 'bg-blue-100',   text: 'text-blue-900',   label: 'County'   },
      local:    { bg: 'bg-orange-100', text: 'text-orange-900', label: 'Local'    },
    };
    return badges[tier] || badges.local;
  };

  const getPointsTable = () => {
    if (!tournament.ranked) return null;

    const tables = {
      national: {
        label: 'National Tournament',
        points: [500, 300, 180, 100, 60, 30, 15, 5],
      },
      regional: {
        label: 'Regional Tournament',
        points: [200, 120, 60, 30, 15, 8, 4, 1],
      },
      county: {
        label: 'County Tournament',
        points: [100, 60, 30, 10, 5, 2, 1, 0],
      },
      local: {
        label: 'Local Tournament',
        points: [50, 30, 15, 5, 2, 1, 0, 0],
      },
    };

    return tables[tournament.tier] || tables.local;
  };

  const pointsTable = getPointsTable();
  const tierBadge = getTierBadge(tournament.tier);

  // Check minimum participants
  const meetsMinimumRequirement =
    !tournament.ranked || standings.length >= (tournament.minPlayersForRankingPoints || 8);

  const handleComplete = async () => {
    if (!confirmed) {
      alert('Please confirm you understand this action is permanent');
      return;
    }

    try {
      await onComplete();
    } catch (error) {
      alert('Error completing tournament: ' + error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FaTrophy className="text-3xl" />
            <div>
              <h3 className="text-2xl font-bold">Tournament Complete!</h3>
              <p className="text-green-100 text-sm mt-1">{tournament.name}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-white hover:text-green-100 text-2xl">
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Tournament Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Total Participants</p>
              <p className="text-3xl font-bold text-blue-900">{standings.length}</p>
            </div>

            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-purple-600 font-medium">Matches Played</p>
              <p className="text-3xl font-bold text-purple-900">{matchStats?.totalMatches || 0}</p>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-600 font-medium">Match Completion</p>
              <p className="text-3xl font-bold text-green-900">100%</p>
            </div>

            {tournament.ranked && (
              <div className={`p-4 rounded-lg border`} style={{ backgroundColor: tierBadge.bg }}>
                <p className={`text-sm font-medium`} style={{ color: tierBadge.text }}>
                  Ranking Tier
                </p>
                <p className={`text-xl font-bold`} style={{ color: tierBadge.text }}>
                  {tierBadge.label.split(':')[1].trim()}
                </p>
              </div>
            )}
          </div>

          {/* Minimum Participants Check */}
          {!meetsMinimumRequirement && (
            <div className="p-4 border-l-4 border-orange-500 bg-orange-50">
              <p className="font-semibold text-orange-900">⚠️ Below Minimum Participants</p>
              <p className="text-sm text-orange-800 mt-1">
                This tournament has {standings.length} participants, but minimum for ranking points is{' '}
                {tournament.minPlayersForRankingPoints || 8}. Ranking points will NOT be awarded.
              </p>
            </div>
          )}

          {/* Final Standings */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-4 text-lg">Final Standings</h4>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Position</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Player</th>
                    <th className="px-6 py-3 text-center font-semibold text-gray-700">Matches</th>
                    <th className="px-6 py-3 text-center font-semibold text-gray-700">Wins</th>
                    {tournament.ranked && (
                      <th className="px-6 py-3 text-center font-semibold text-gray-700 bg-green-50">
                        Ranking Points
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {standings.map((player, idx) => {
                    const points =
                      meetsMinimumRequirement && pointsTable
                        ? pointsTable.points[idx] || 0
                        : 0;

                    return (
                      <tr
                        key={player.playerId ?? player.id ?? `standing-${idx}`}
                        className={`border-b border-gray-200 hover:bg-gray-50 transition ${
                          idx === 0 ? 'bg-yellow-50' : idx === 1 ? 'bg-gray-100' : idx === 2 ? 'bg-orange-50' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {idx === 0 && <span className="text-2xl">🥇</span>}
                            {idx === 1 && <span className="text-2xl">🥈</span>}
                            {idx === 2 && <span className="text-2xl">🥉</span>}
                            <span className="font-bold text-lg text-gray-900">#{idx + 1}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div>
                            <p className="font-semibold text-gray-900">{player.playerName}</p>
                            <p className="text-xs text-gray-600">{player.playerEmail}</p>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-center font-medium text-gray-900">
                          {player.matchesPlayed || 0}
                        </td>

                        <td className="px-6 py-4 text-center font-medium text-gray-900">
                          {player.wins || 0}
                        </td>

                        {tournament.ranked && (
                          <td className="px-6 py-4 text-center font-bold bg-green-50 text-green-900 text-lg">
                            +{points}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ranking Points Table */}
          {tournament.ranked && meetsMinimumRequirement && pointsTable && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <FaTrophy /> {pointsTable.label}
              </h4>
              <div className="grid grid-cols-4 gap-2 text-sm">
                {pointsTable.points.map((pts, idx) => (
                  pts > 0 && (
                    <div key={idx} className="p-2 bg-white border border-blue-200 rounded text-center">
                      <p className="text-xs text-blue-600 font-medium">#{idx + 1}</p>
                      <p className="text-lg font-bold text-blue-900">{pts}</p>
                    </div>
                  )
                ))}
              </div>
              <p className="text-xs text-blue-800 mt-3 italic">
                Points awarded based on finishing position and tournament tier
              </p>
            </div>
          )}

          {/* Confirmation Checkbox */}
          <div className="p-4 border-2 border-green-300 bg-green-50 rounded-lg">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-5 h-5 mt-1 cursor-pointer"
              />
              <div>
                <p className="font-semibold text-green-900">I understand this action is permanent</p>
                <p className="text-sm text-green-800 mt-1">
                  This will:
                </p>
                <ul className="text-sm text-green-800 mt-2 space-y-1">
                  <li>✓ Archive the tournament (becomes read-only)</li>
                  <li>✓ Lock all results and standings</li>
                  {tournament.ranked && meetsMinimumRequirement && (
                    <li>✓ Award ranking points to all players</li>
                  )}
                  <li>✓ Make tournament visible in player profiles and history</li>
                </ul>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-900 hover:bg-gray-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleComplete}
            disabled={!confirmed || loading}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                Completing...
              </>
            ) : (
              <>
                <FaCheckCircle />
                Complete Tournament
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
