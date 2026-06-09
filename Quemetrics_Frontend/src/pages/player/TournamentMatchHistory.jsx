import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import Loader from '../../components/ui/Loader';
import { FaArrowLeft, FaCalendarAlt, FaUsers, FaCheck, FaClock, FaSpinner } from 'react-icons/fa';

export default function TournamentMatchHistory() {
  const navigate = useNavigate();
  const { tournamentId } = useParams();
  const [tournament, setTournament] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTournamentAndMatches();
  }, [tournamentId]);

  const fetchTournamentAndMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tournamentRes, matchesRes] = await Promise.all([
        apiClient.get(`/tournaments/${tournamentId}`),
        apiClient.get(`/tournaments/${tournamentId}/matches`),
      ]);

      setTournament(tournamentRes.data?.data || null);
      setMatches(Array.isArray(matchesRes.data?.data) ? matchesRes.data.data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tournament history');
    } finally {
      setLoading(false);
    }
  };

  const getDisplayStatus = (match) => {
    // If match is completed, always show completed
    if (match.status === 'completed') return 'completed';

    // If match is in progress, show in progress
    if (match.status === 'in_progress') return 'in_progress';

    // If match is scheduled but doesn't have booking confirmed, show pending
    if (match.status === 'scheduled') {
      if (!match.isScheduled || !match.bookingTime || !match.venueId) {
        return 'pending';
      }
      return 'scheduled';
    }

    // Default fallback
    return match.status || 'pending';
  };

  const getStatusColor = (status) => {
    const statusMap = {
      completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
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
      pending: <FaClock className="text-amber-600" />,
      pending_confirmation: <FaClock className="text-amber-600" />,
      in_progress: <FaSpinner className="text-purple-600 animate-spin" />,
    };
    return iconMap[status?.toLowerCase()] || <FaClock />;
  };

  if (loading) return <Loader text="Loading match history..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-4 sm:px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/player/tournaments')}
            className="inline-flex items-center gap-2 text-[#132F45] hover:text-[#1c4566] font-black text-[10px] uppercase tracking-widest mb-6"
          >
            <FaArrowLeft className="text-[10px]" /> Back to Tournaments
          </button>

          <div className="bg-linear-to-r from-[#132F45] to-[#1c4566] rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
                  {tournament?.name || 'Tournament Match History'}
                </h1>
                <p className="text-[#BA995D] text-sm font-bold uppercase tracking-widest">
                  {tournament?.sport?.toUpperCase() || 'Sport'} · {matches.length} Matches
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black text-[#BA995D] uppercase mb-1">Status</div>
                <div className="text-sm font-bold text-white capitalize">
                  {tournament?.status?.replace(/_/g, ' ') || 'Unknown'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-bold text-sm">{error}</p>
            <button
              onClick={fetchTournamentAndMatches}
              className="mt-3 text-red-600 hover:text-red-700 font-bold text-xs uppercase tracking-widest"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && matches.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-50 p-12 text-center">
            <FaUsers className="text-6xl text-gray-200 mx-auto mb-4" />
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">
              No Matches
            </h3>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
              This tournament has no matches yet. Matches will appear here once the bracket is generated and matches are scheduled.
            </p>
          </div>
        )}

        {/* Matches List */}
        {!loading && !error && matches.length > 0 && (
          <div className="space-y-4">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
              All Tournament Matches ({matches.length} Total)
            </div>

            {matches.map((match) => (
              <div
                key={match.id}
                className="bg-white border-2 border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden group"
              >
                <div className="p-5 flex items-start justify-between gap-4">
                  {/* Status Badge */}
                  <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border flex items-center gap-2 whitespace-nowrap ${getStatusColor(getDisplayStatus(match))}`}>
                    {getStatusIcon(getDisplayStatus(match))}
                    {String(getDisplayStatus(match) || 'pending').replace(/_/g, ' ')}
                  </div>

                  {/* Match Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 mb-3">
                      {/* Player 1 */}
                      <div className="flex-1 text-center">
                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Player 1</div>
                        <p className="font-black text-[#132F45] text-sm">
                          {match.player1?.name || match.player1?.nickname || 'Player 1'}
                        </p>
                        {getDisplayStatus(match) === 'completed' && match.player1FramesWon !== null && (
                          <p className="text-2xl font-black text-gray-900 mt-1">
                            {match.player1FramesWon || match.player1RackWins || 0}
                          </p>
                        )}
                      </div>

                      {/* VS */}
                      <div className="text-center text-[9px] font-black text-gray-400 uppercase tracking-widest px-3">
                        VS
                      </div>

                      {/* Player 2 */}
                      <div className="flex-1 text-center">
                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Player 2</div>
                        <p className="font-black text-[#132F45] text-sm">
                          {match.player2?.name || match.player2?.nickname || 'Player 2'}
                        </p>
                        {getDisplayStatus(match) === 'completed' && match.player2FramesWon !== null && (
                          <p className="text-2xl font-black text-gray-900 mt-1">
                            {match.player2FramesWon || match.player2RackWins || 0}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Winner Badge */}
                    {getDisplayStatus(match) === 'completed' && match.winner && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                        <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">
                          Winner
                        </p>
                        <p className="font-bold text-emerald-900 text-xs">
                          {match.winner === 'player1'
                            ? (match.player1?.name || match.player1?.nickname || 'Player 1')
                            : (match.player2?.name || match.player2?.nickname || 'Player 2')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Date/Info */}
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 text-gray-500 font-bold text-[10px] uppercase mb-2 justify-end">
                      <FaCalendarAlt size={10} />
                      {match.bookingDate ? match.bookingDate : '-'}
                    </div>
                    {match.roundNumber && (
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg">
                        Round {match.roundNumber}
                      </div>
                    )}
                  </div>
                </div>

                {/* Match Details */}
                {getDisplayStatus(match) === 'completed' && (
                  <div className="bg-gray-50 border-t border-gray-100 px-5 py-3 grid grid-cols-3 gap-3 text-center">
                    {match.roundType && (
                      <div>
                        <div className="text-[8px] font-bold text-gray-400 uppercase mb-1">Round Type</div>
                        <p className="font-bold text-[#132F45] text-xs capitalize">
                          {String(match.roundType).replace(/_/g, ' ')}
                        </p>
                      </div>
                    )}
                    {match.bestOfFrames && (
                      <div>
                        <div className="text-[8px] font-bold text-gray-400 uppercase mb-1">Best Of</div>
                        <p className="font-bold text-[#132F45] text-xs">{match.bestOfFrames}</p>
                      </div>
                    )}
                    {match.playedDate && (
                      <div>
                        <div className="text-[8px] font-bold text-gray-400 uppercase mb-1">Played</div>
                        <p className="font-bold text-[#132F45] text-xs">
                          {new Date(match.playedDate).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
