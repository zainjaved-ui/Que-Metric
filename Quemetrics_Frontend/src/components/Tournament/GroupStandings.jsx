import React, { useState, useEffect } from 'react';
import apiClient from '../../contexts/apiClient';
import { FaMedal } from 'react-icons/fa';

/**
 * GroupStandings Component
 * Displays the standings for a specific group in a groups_knockout tournament
 */
export const GroupStandings = ({ tournament, groupNumber }) => {
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tournament?.id || typeof groupNumber === 'undefined') {
      setStandings(null);
      setLoading(false);
      return;
    }

    const fetchStandings = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(
          `/tournaments/${tournament.id}/groups/${groupNumber}/standings`
        );

        if (response.data?.success) {
          let standingsData = response.data.data;

          // Trust server-calculated position field (includes proper tiebreaker logic)
          // Sort by position if available, otherwise by points as fallback
          if (standingsData && standingsData.standings && Array.isArray(standingsData.standings)) {
            const sortedStandings = [...standingsData.standings].sort((a, b) => {
              // Use server position if available (already includes tiebreaker logic)
              if (a.position != null && b.position != null) {
                return (a.position || 0) - (b.position || 0);
              }
              // Fallback for legacy data without position field
              return (b.pointsEarned || 0) - (a.pointsEarned || 0);
            });
            standingsData = { ...standingsData, standings: sortedStandings };
          }

          setStandings(standingsData);
          setError(null);
        } else {
          setError(response.data?.error || 'Failed to load group standings');
          setStandings(null);
        }
      } catch (err) {
        console.error(`[GroupStandings] Error fetching standings for group ${groupNumber}:`, err);
        setError(err.message || 'Failed to load group standings');
        setStandings(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStandings();
  }, [tournament?.id, groupNumber]);

  if (loading) {
    return (
      <div className="group-standings-container p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-gray-300 rounded w-1/2"></div>
          <div className="space-y-2">
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="group-standings-container p-4">
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-700 font-medium">Error loading standings</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!standings) {
    return (
      <div className="group-standings-container p-4">
        <div className="text-center py-8">
          <p className="text-gray-500">No standings data available yet</p>
        </div>
      </div>
    );
  }

  const getMedalIcon = (position) => {
    if (position <= standings.qualifiedCount) {
      const medalClass = position === 1 ? 'text-yellow-500' : position === 2 ? 'text-gray-400' : 'text-orange-600';
      return <FaMedal className={`inline-block mr-2 ${medalClass}`} />;
    }
    return null;
  };

  return (
    <div className="group-standings-container bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-bold text-gray-800">
          {standings.groupName}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {standings.qualifiedCount} qualified from {standings.standings.length} players
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Position</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Player</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Points</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Matches</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Frames</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Diff</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {standings.standings.map((standing, idx) => (
              <tr
                key={standing.playerId}
                className={`border-b border-gray-100 ${
                  standing.qualified ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center">
                    {getMedalIcon(standing.position)}
                    <span className="font-semibold text-gray-800">#{standing.position}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center">
                    {standing.playerAvatarUrl ? (
                      <img
                        src={standing.playerAvatarUrl}
                        alt={standing.playerName}
                        className="w-8 h-8 rounded-full mr-2 object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full mr-2 bg-gray-300 flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-600">
                          {standing.playerName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-800">{standing.playerName}</p>
                      {standing.playerEmail && (
                        <p className="text-xs text-gray-500">{standing.playerEmail}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold">
                    {standing.pointsEarned}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-700">
                  {standing.matchesWon}-{standing.matchesLost}
                </td>
                <td className="px-4 py-3 text-center text-gray-700">
                  {standing.framesWon}-{standing.framesLost}
                </td>
                <td className="px-4 py-3 text-center font-semibold">
                  <span className={standing.frameDifference >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {standing.frameDifference > 0 ? '+' : ''}{standing.frameDifference}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {standing.qualified ? (
                    <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">
                      Qualified
                    </span>
                  ) : (
                    <span className="inline-block bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                      Eliminated
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {standings.status && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
          <span className="capitalize">Status: {standings.status}</span>
        </div>
      )}
    </div>
  );
};

export default GroupStandings;
