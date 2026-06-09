import React, { useState, useEffect } from 'react';
import apiClient from '../../contexts/apiClient';
import GroupStandings from './GroupStandings';

/**
 * TournamentGroupsView Component
 * Shows all groups and their standings in a groups_knockout tournament
 */
export const TournamentGroupsView = ({ tournament }) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  useEffect(() => {
    if (!tournament?.id) {
      setGroups([]);
      setLoading(false);
      return;
    }

    const fetchGroups = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(`/tournaments/${tournament.id}/groups`);

        if (response.data?.success) {
          setGroups(response.data.data || []);
          // Select first group by default
          if (response.data.data && response.data.data.length > 0) {
            setSelectedGroup(response.data.data[0].groupNumber);
          }
          setError(null);
        } else {
          setError(response.data?.error || 'Failed to load groups');
          setGroups([]);
        }
      } catch (err) {
        console.error('[TournamentGroupsView] Error fetching groups:', err);
        setError(err.message || 'Failed to load groups');
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [tournament?.id]);

  if (loading) {
    return (
      <div className="tournament-groups-container p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-300 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tournament-groups-container p-6">
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-700 font-medium">Error loading groups</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="tournament-groups-container p-6">
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-600 text-lg">No groups configured for this tournament</p>
          <p className="text-gray-500 text-sm mt-2">This tournament may not be using a group-based format</p>
        </div>
      </div>
    );
  }

  const selectedGroupData = groups.find((g) => g.groupNumber === selectedGroup);

  return (
    <div className="tournament-groups-container space-y-6">
      {/* Group Selection Tabs */}
      <div className="group-tabs-container rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto bg-gray-50">
          {groups.map((group) => (
            <button
              key={group.groupNumber}
              onClick={() => setSelectedGroup(group.groupNumber)}
              className={`flex-1 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                selectedGroup === group.groupNumber
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex flex-col items-center sm:flex-row sm:justify-center sm:space-x-2">
                <span>{group.groupName}</span>
                <span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full mt-1 sm:mt-0">
                  {group.totalPlayers || 0} players
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Group Details and Standings */}
      {selectedGroupData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Group Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">{selectedGroupData.groupName}</h3>

              {/* Players in Group */}
              <div className="mb-6">
                <h4 className="font-semibold text-gray-700 mb-3">Participants ({selectedGroupData.totalPlayers || 0})</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedGroupData.players && selectedGroupData.players.length > 0 ? (
                    selectedGroupData.players.map((player) => (
                      <div
                        key={player.id}
                        className={`p-2 rounded text-sm ${
                          selectedGroupData.qualifiedPlayerIds?.includes(player.id)
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center">
                          {player.avatarUrl ? (
                            <img
                              src={player.avatarUrl}
                              alt={player.name}
                              className="w-6 h-6 rounded-full mr-2 object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full mr-2 bg-gray-300 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-gray-600">
                                {player.name?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-gray-800">{player.name}</p>
                          </div>
                          {selectedGroupData.qualifiedPlayerIds?.includes(player.id) && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              ✓
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm italic">No players in this group yet</p>
                  )}
                </div>
              </div>

              {/* Group Status */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">Status</span>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${
                      selectedGroupData.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : selectedGroupData.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {selectedGroupData.status || 'not_started'}
                  </span>
                </div>

                <div className="text-xs text-gray-600">
                  <p className="mb-1">
                    <span className="font-semibold">Qualified:</span> {selectedGroupData.qualifiedPlayerIds?.length || 0} / {selectedGroupData.totalQualified || 2}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Standings Table */}
          <div className="lg:col-span-2">
            <GroupStandings tournament={tournament} groupNumber={selectedGroupData.groupNumber} />
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentGroupsView;
