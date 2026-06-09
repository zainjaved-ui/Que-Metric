/**
 * Player Matches Tab
 * Shows player's upcoming and completed matches in a tournament
 */
import React, { useContext, useState, useEffect } from 'react';
import { FaCheck, FaClock, FaExclamation, FaArrowRight } from 'react-icons/fa';
import { TournamentContext } from '../../../../contexts/TournamentContext';
import SubmitMatchResultModal from './SubmitMatchResultModal';

export default function PlayerMatchesTab({ tournament, onRefresh }) {
  const context = useContext(TournamentContext);

  if (!context) {
    return <div className="text-center py-8 text-red-600">Tournament context not available</div>;
  }

  const { matches, loading, error, getTournamentMatches, confirmMatchResult } = context;
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [filter, setFilter] = useState('upcoming');

  useEffect(() => {
    if (tournament?.id) {
      getTournamentMatches(tournament.id);
    }
  }, [tournament?.id, getTournamentMatches]);

  const filteredMatches = matches
    .filter((match) => Boolean(match.player1Id) && Boolean(match.player2Id))
    .filter((match) => {
    if (filter === 'all') return true;
    if (filter === 'completed') return match.status === 'completed';
    if (filter === 'upcoming') return match.status !== 'completed';
    return true;
  });

  const handleSubmitResult = (match) => {
    setSelectedMatch(match);
    setShowSubmitModal(true);
  };

  const handleResultSubmitted = () => {
    setShowSubmitModal(false);
    setSelectedMatch(null);
    if (onRefresh) onRefresh();
    getTournamentMatches(tournament.id);
  };

  const handleConfirmResult = async (match) => {
    try {
      const result = await confirmMatchResult(tournament.id, match.id);
      if (result.success) {
        getTournamentMatches(tournament.id);
        if (onRefresh) onRefresh();
      } else {
        alert(result.error || 'Failed to confirm result');
      }
    } catch (err) {
      alert(err.message || 'Failed to confirm result');
    }
  };

  const getMatchStatus = (match) => {
    if (match.status === 'completed') return 'completed';
    if (match.status === 'pending_confirmation') return 'awaiting_confirmation';
    if (match.status === 'disputed') return 'disputed';
    if (match.status === 'in_progress') return 'in_progress';
    return 'scheduled';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <FaCheck className="text-green-600" />;
      case 'awaiting_confirmation':
        return <FaClock className="text-yellow-600" />;
      case 'disputed':
        return <FaExclamation className="text-red-600" />;
      default:
        return <FaClock className="text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'awaiting_confirmation':
        return 'bg-yellow-50 border-yellow-200';
      case 'disputed':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading matches...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Buttons */}
      <div className="flex gap-2 mb-6">
        {['upcoming', 'completed', 'all'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded font-medium transition ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Matches List */}
      {filteredMatches.length === 0 ? (
        <div className="p-8 bg-gray-50 border border-dashed border-gray-300 rounded text-center">
          <p className="text-gray-600">No matches yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              statusIcon={getStatusIcon(getMatchStatus(match))}
              statusColor={getStatusColor(getMatchStatus(match))}
              status={getMatchStatus(match)}
              onSubmitResult={handleSubmitResult}
              onConfirmResult={handleConfirmResult}
            />
          ))}
        </div>
      )}

      {/* Submit Result Modal */}
      {showSubmitModal && selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <SubmitMatchResultModal
              tournament={tournament}
              match={selectedMatch}
              onClose={() => setShowSubmitModal(false)}
              onSubmitted={handleResultSubmitted}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Match Card Component
 */
function MatchCard({ match, statusIcon, statusColor, status, onSubmitResult, onConfirmResult }) {
  const opponent = match.player1Id === match.playerId ? match.player2 : match.player1;
  const isCompleted = status === 'completed' || status === 'awaiting_confirmation';

  return (
    <div className={`border rounded-lg p-4 ${statusColor}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          {statusIcon}
          <div>
            <h4 className="font-bold text-gray-900">
              Round {match.roundNumber} - {match.roundType?.replace(/_/g, ' ').toUpperCase()}
            </h4>
            <p className="text-sm text-gray-600">
              {match.scheduledDate && new Date(match.scheduledDate).toLocaleString()}
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-white rounded text-xs font-semibold text-gray-700">
          {status.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>

      {/* Players and Result */}
      <div className="bg-white bg-opacity-50 rounded p-4 mb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-600 mb-1">You</p>
            <p className="font-semibold text-gray-900">Me</p>
          </div>

          {isCompleted ? (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Frames</p>
              <p className="font-bold text-lg text-gray-900">
                {match.player1FramesWon || 0} - {match.player2FramesWon || 0}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <FaArrowRight className="text-gray-400 text-2xl" />
            </div>
          )}

          <div className="flex-1 text-right">
            <p className="text-sm text-gray-600 mb-1">Opponent</p>
            <p className="font-semibold text-gray-900">{opponent?.name || 'TBD'}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!isCompleted && status !== 'disputed' && (
          <button
            onClick={() => onSubmitResult(match)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition"
          >
            Submit Result
          </button>
        )}
        {status === 'awaiting_confirmation' && (
          <button
            onClick={() => onConfirmResult && onConfirmResult(match)}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 transition"
          >
            Confirm Result
          </button>
        )}
        {status === 'disputed' && (
          <button
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 transition"
          >
            View Dispute
          </button>
        )}
        <button className="px-4 py-2 border border-gray-300 rounded font-medium hover:bg-gray-50 transition">
          Details
        </button>
      </div>
    </div>
  );
}
