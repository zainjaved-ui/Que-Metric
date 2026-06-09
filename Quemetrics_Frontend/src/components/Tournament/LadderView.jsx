import React, { useState, useEffect, useContext, useCallback } from 'react';
import { TournamentContext } from '../../contexts/TournamentContext';

/**
 * LadderView - Displays current ladder standings with challenge buttons
 */
export default function LadderView({ tournamentId, currentPlayerId }) {
  const { getLadderStandings, createLadderChallenge } = useContext(TournamentContext);
  const [standings, setStandings] = useState([]);
  const [challengeRange, setChallengeRange] = useState(2);
  const [challengeCooldown, setChallengeCooldown] = useState(24);
  const [loading, setLoading] = useState(true);
  const [challengeLoading, setChallengeLoading] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const fetchStandings = useCallback(async () => {
    setLoading(true);
    const result = await getLadderStandings(tournamentId);
    if (result.success) {
      setStandings(result.data.standings || []);
      setChallengeRange(result.data.challengeRange || 2);
      setChallengeCooldown(result.data.challengeCooldown || 24);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [getLadderStandings, tournamentId]);

  useEffect(() => {
    fetchStandings();
  }, [fetchStandings]);

  const currentPlayer = standings.find(s => s.playerId === currentPlayerId);
  const currentPosition = currentPlayer?.position;

  const canChallenge = (targetPosition) => {
    if (!currentPosition || !targetPosition) return false;
    if (targetPosition >= currentPosition) return false; // Can only challenge higher (lower number)
    if (currentPosition - targetPosition > challengeRange) return false;
    // Check cooldown
    if (currentPlayer?.lastChallengeDate) {
      const cooldownMs = challengeCooldown * 60 * 60 * 1000;
      const elapsed = Date.now() - new Date(currentPlayer.lastChallengeDate).getTime();
      if (elapsed < cooldownMs) return false;
    }
    return currentPlayer?.status === 'approved';
  };

  const handleChallenge = async (targetPlayerId) => {
    setChallengeLoading(targetPlayerId);
    setMessage(null);
    const result = await createLadderChallenge(tournamentId, { targetPlayerId });
    if (result.success) {
      setMessage('Challenge created successfully!');
      fetchStandings();
    } else {
      setError(result.error);
    }
    setChallengeLoading(null);
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Ladder Standings</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Challenge range: {challengeRange} positions up | Cooldown: {challengeCooldown}h
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded">
          {error}
        </div>
      )}
      {message && (
        <div className="mx-4 mt-2 p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm rounded">
          {message}
        </div>
      )}

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {standings.map((player) => (
          <div
            key={player.playerId}
            className={`flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
              player.playerId === currentPlayerId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${
                player.position === 1 ? 'bg-yellow-100 text-yellow-800' :
                player.position === 2 ? 'bg-gray-100 text-gray-800' :
                player.position === 3 ? 'bg-orange-100 text-orange-800' :
                'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {player.position}
              </span>
              <div>
                <span className="font-medium text-gray-900 dark:text-white">{player.playerName}</span>
                {player.status === 'withdrawn' && (
                  <span className="ml-2 text-xs text-red-500">(withdrawn)</span>
                )}
              </div>
            </div>

            {currentPlayerId && player.playerId !== currentPlayerId && canChallenge(player.position) && (
              <button
                onClick={() => handleChallenge(player.playerId)}
                disabled={challengeLoading === player.playerId}
                className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition-colors"
              >
                {challengeLoading === player.playerId ? 'Challenging...' : 'Challenge'}
              </button>
            )}
          </div>
        ))}

        {standings.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No ladder positions assigned yet.
          </div>
        )}
      </div>
    </div>
  );
}
