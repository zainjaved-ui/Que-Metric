import React, { useState, useEffect, useContext, useCallback } from 'react';
import { TournamentContext } from '../contexts/TournamentContext';

/**
 * Rankings page - Global player rankings (decay UI disabled temporarily)
 */
export default function Rankings() {
  const { getRankings, getRankingHistory } = useContext(TournamentContext);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    const result = await getRankings({ limit: 100 });
    if (result.success) {
      setRankings(result.data.rankings || []);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [getRankings]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  const handleViewHistory = async (playerId) => {
    if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
      setPlayerHistory([]);
      return;
    }
    setSelectedPlayer(playerId);
    setHistoryLoading(true);
    const result = await getRankingHistory(playerId);
    if (result.success) {
      setPlayerHistory(result.data.history || []);
    }
    setHistoryLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Player Rankings</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rank</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Player</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Points</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wins</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">W/L</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rankings.map((player) => (
              <React.Fragment key={player.playerId}>
                <tr className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                  selectedPlayer === player.playerId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                      player.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                      player.rank === 2 ? 'bg-gray-200 text-gray-800' :
                      player.rank === 3 ? 'bg-orange-100 text-orange-800' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {player.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {player.playerName}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    {player.totalPoints}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {(player.tournamentWins || []).filter(w => w.position === 1).length}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                    {player.matchesWon}/{player.matchesPlayed}
                    {player.matchesPlayed > 0 && (
                      <span className="ml-1 text-xs text-gray-400">
                        ({Math.round((player.matchesWon / player.matchesPlayed) * 100)}%)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleViewHistory(player.playerId)}
                      className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {selectedPlayer === player.playerId ? 'Hide' : 'View'}
                    </button>
                  </td>
                </tr>

                {selectedPlayer === player.playerId && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 bg-gray-50 dark:bg-gray-700/30">
                      {historyLoading ? (
                        <div className="flex justify-center py-2">
                          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                        </div>
                      ) : playerHistory.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Ranking Points History</p>
                          {playerHistory.map((h) => (
                            <div key={h.id} className="flex items-center justify-between text-sm">
                              <span className="text-gray-700 dark:text-gray-300">
                                {h.tournamentName || 'Tournament'}
                                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                                  {h.tier}
                                </span>
                                {h.finishingPosition && (
                                  <span className="ml-1 text-xs text-gray-400">#{h.finishingPosition}</span>
                                )}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className={`font-medium ${h.isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400 line-through'}`}>
                                  {h.currentPoints} pts
                                </span>
                                {/* Ranking Points Decay disabled temporarily
                                {h.decayPercentage != null && h.decayPercentage < 100 && h.isActive && (
                                  <span className="text-xs text-orange-500">({h.decayPercentage}%)</span>
                                )}
                                */}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No ranking history found.</p>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}

            {rankings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No rankings data available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
