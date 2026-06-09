import React, { useState, useEffect } from 'react';
import apiClient from '../../contexts/apiClient';
import { FaTrophy, FaUsers } from 'react-icons/fa';

/**
 * QualifiersDisplay Component
 * Shows all qualified players advancing from groups to knockout stage
 */
export const QualifiersDisplay = ({ tournament }) => {
  const [qualifiers, setQualifiers] = useState([]);
  const [groupingByGroup, setGroupingByGroup] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tournament?.id) {
      setQualifiers([]);
      setLoading(false);
      return;
    }

    const fetchQualifiers = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(`/tournaments/${tournament.id}/qualifiers`);

        if (response.data?.success) {
          const qualifiersList = response.data.data || [];
          setQualifiers(qualifiersList);

          // Group qualifiers by group number for display
          const grouped = {};
          qualifiersList.forEach((q) => {
            if (!grouped[q.groupNumber]) {
              grouped[q.groupNumber] = [];
            }
            grouped[q.groupNumber].push(q);
          });
          setGroupingByGroup(grouped);
          setError(null);
        } else {
          setError(response.data?.error || 'Failed to load qualifiers');
          setQualifiers([]);
        }
      } catch (err) {
        console.error('[QualifiersDisplay] Error fetching qualifiers:', err);
        setError(err.message || 'Failed to load qualifiers');
        setQualifiers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchQualifiers();
  }, [tournament?.id]);

  if (loading) {
    return (
      <div className="qualifiers-container p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-300 rounded w-1/2"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-48 bg-gray-200 rounded"></div>
            <div className="h-48 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="qualifiers-container p-6">
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-700 font-medium">Error loading qualifiers</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!qualifiers || qualifiers.length === 0) {
    return (
      <div className="qualifiers-container p-6">
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <FaTrophy className="inline-block text-gray-400 mb-3" size={48} />
          <p className="text-gray-600 text-lg">No qualifiers yet</p>
          <p className="text-gray-500 text-sm mt-2">Groups are still in progress</p>
        </div>
      </div>
    );
  }

  return (
    <div className="qualifiers-container space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <FaTrophy className="text-yellow-500 mr-3" size={32} />
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Qualified Players</h2>
            <p className="text-gray-600 text-sm mt-1">
              {qualifiers.length} players advancing to knockout stage
            </p>
          </div>
        </div>
      </div>

      {/* Qualifiers by Group */}
      {Object.keys(groupingByGroup)
        .sort()
        .map((groupNum) => {
          const groupQualifiers = groupingByGroup[groupNum];
          const groupName = groupQualifiers[0]?.groupName || `Group ${String.fromCharCode(64 + parseInt(groupNum))}`;

          return (
            <div key={groupNum} className="group-qualifiers bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Group Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">{groupName}</h3>
                <p className="text-sm text-gray-600 mt-1">{groupQualifiers.length} qualified</p>
              </div>

              {/* Qualifiers Grid */}
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {groupQualifiers.map((qualifier, idx) => (
                    <div
                      key={qualifier.playerId}
                      className="player-card bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200 p-4 hover:shadow-md transition-shadow"
                    >
                      {/* Rank Badge */}
                      <div className="relative mb-4">
                        <div className="absolute -top-2 -right-2 bg-green-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                          {qualifier.position}
                        </div>

                        {/* Player Avatar or Initial */}
                        {qualifier.playerAvatarUrl ? (
                          <img
                            src={qualifier.playerAvatarUrl}
                            alt={qualifier.playerName}
                            className="w-full h-32 rounded-lg object-cover bg-gray-200"
                          />
                        ) : (
                          <div className="w-full h-32 rounded-lg bg-gray-200 flex items-center justify-center">
                            <span className="text-4xl font-bold text-gray-400">
                              {qualifier.playerName?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Player Info */}
                      <div className="text-center">
                        <h4 className="font-bold text-gray-800 text-sm mb-2 line-clamp-2">{qualifier.playerName}</h4>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex justify-center items-center space-x-1">
                            <span className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                              {qualifier.pointsEarned} pts
                            </span>
                          </div>
                          <div className="text-gray-500">{qualifier.groupName}</div>
                        </div>
                      </div>

                      {/* Seeding Info (if applicable) */}
                      <div className="mt-3 pt-3 border-t border-green-200">
                        <p className="text-xs text-gray-600 text-center">
                          <span className="font-semibold">Seed:</span> {qualifier.position}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

      {/* Summary */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <FaUsers className="text-green-600 mr-3" size={28} />
            <div>
              <p className="text-sm text-gray-600">Total Qualified</p>
              <p className="text-2xl font-bold text-gray-800">{qualifiers.length} / {qualifiers.length} players</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-600 mb-2">Groups: {Object.keys(groupingByGroup).length}</p>
            <span className="inline-block bg-green-500 text-white px-4 py-2 rounded-lg font-semibold">
              Ready for Knockout
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QualifiersDisplay;
