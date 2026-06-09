import React, { useState, useEffect } from 'react';
import { FaTimes, FaSpinner, FaCalendarAlt, FaUsers, FaCheck, FaClock } from 'react-icons/fa';
import apiClient from '../../contexts/apiClient';

const TournamentMatchesModal = ({ isOpen, tournamentId, tournamentName, onClose }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && tournamentId) {
      fetchMatches();
    }
  }, [isOpen, tournamentId]);

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/tournaments/${tournamentId}/player-matches`);
      const matchesData = Array.isArray(response.data?.data) ? response.data.data : [];
      setMatches(matchesData);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load matches');
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getStatusColor = (status) => {
    const statusMap = {
      completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
      pending_confirmation: 'bg-amber-50 text-amber-700 border-amber-200',
      in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
      default: 'bg-gray-50 text-gray-700 border-gray-200',
    };
    return statusMap[status?.toLowerCase()] || statusMap.default;
  };

  const getStatusIcon = (status) => {
    const iconMap = {
      completed: <FaCheck className="text-emerald-600" />,
      scheduled: <FaClock className="text-blue-600" />,
      pending_confirmation: <FaClock className="text-amber-600" />,
      in_progress: <FaSpinner className="text-purple-600 animate-spin" />,
    };
    return iconMap[status?.toLowerCase()] || <FaClock />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-[#132F45] to-[#1c4566] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">{tournamentName}</h2>
            <p className="text-[#BA995D] text-xs font-bold uppercase tracking-widest mt-1">Match History</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <FaTimes size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <FaSpinner className="text-4xl text-[#BA995D] animate-spin mx-auto mb-4" />
                <p className="text-gray-600 font-black text-xs uppercase tracking-widest">Loading matches...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 font-bold text-sm">{error}</p>
              <button
                onClick={fetchMatches}
                className="mt-3 text-red-600 hover:text-red-700 font-bold text-xs uppercase tracking-widest"
              >
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && matches.length === 0 && (
            <div className="text-center py-12">
              <FaUsers className="text-5xl text-gray-200 mx-auto mb-4" />
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight mb-2">No Matches Yet</h3>
              <p className="text-gray-600 text-sm">Your matches will appear here once they are scheduled.</p>
            </div>
          )}

          {!loading && !error && matches.length > 0 && (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all bg-white"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(match.status)}
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(match.status)}`}>
                        {String(match.status || 'pending').replace(/_/g, ' ')}
                      </span>
                    </div>
                    {match.scheduledDate && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        <FaCalendarAlt size={8} />
                        {new Date(match.scheduledDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1 text-center">
                      <p className="font-bold text-[#132F45] text-sm mb-1">
                        {match.player1?.name || match.player1?.nickname || 'Player 1'}
                      </p>
                      {match.status === 'completed' && (
                        <p className="text-2xl font-black text-gray-900">
                          {match.player1FramesWon || 0}
                        </p>
                      )}
                    </div>

                    <div className="text-center px-4">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">VS</p>
                      {match.status === 'completed' && (
                        <p className="text-lg font-black text-gray-300">–</p>
                      )}
                    </div>

                    <div className="flex-1 text-center">
                      <p className="font-bold text-[#132F45] text-sm mb-1">
                        {match.player2?.name || match.player2?.nickname || 'Player 2'}
                      </p>
                      {match.status === 'completed' && (
                        <p className="text-2xl font-black text-gray-900">
                          {match.player2FramesWon || 0}
                        </p>
                      )}
                    </div>
                  </div>

                  {match.status === 'completed' && match.winner && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                      <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Winner</p>
                      <p className="font-bold text-emerald-900">
                        {match.winner === 'player1'
                          ? (match.player1?.name || match.player1?.nickname || 'Player 1')
                          : (match.player2?.name || match.player2?.nickname || 'Player 2')
                        }
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#132F45] text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-[#1c4566] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TournamentMatchesModal;
