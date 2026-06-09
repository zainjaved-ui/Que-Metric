import React, { useState } from 'react';
import { FaCalendarAlt, FaMapMarkerAlt, FaClock, FaTrophy, FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import Button from '../../../../components/ui/Button';

export default function MatchCard({ match, tournament, round, onSubmitResult, onConfirmResult }) {
  const navigate = useNavigate();
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultForm, setResultForm] = useState({
    player1FramesWon: '',
    player2FramesWon: '',
    winner: '',
  });

  const getOpponent = () => {
    if (match.isPlayer1) {
      return match.player2 || match.opponent;
    }
    return match.player1 || match.opponent;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status) => {
    const statuses = {
      scheduled: { color: 'bg-blue-100 text-blue-800', icon: FaClock, label: 'Upcoming' },
      in_progress: { color: 'bg-orange-100 text-orange-800', icon: FaClock, label: 'In Progress' },
      pending_confirmation: { color: 'bg-yellow-100 text-yellow-800', icon: FaExclamationTriangle, label: 'Awaiting Confirmation' },
      completed: { color: 'bg-green-100 text-green-800', icon: FaCheckCircle, label: 'Completed' },
      disputed: { color: 'bg-red-100 text-red-800', icon: FaTimes, label: 'Disputed' },
      voided: { color: 'bg-gray-100 text-gray-800', icon: FaTimes, label: 'Voided' },
      walkover: { color: 'bg-purple-100 text-purple-800', icon: FaTrophy, label: 'Walkover' },
    };

    const statusObj = statuses[status] || statuses.scheduled;
    const Icon = statusObj.icon;

    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${statusObj.color}`}>
        <Icon className="text-sm" />
        {statusObj.label}
      </div>
    );
  };

  const opponent = getOpponent();
  const canSubmitResult = ['scheduled', 'in_progress'].includes(match.status);
  const canConfirmResult = match.status === 'pending_confirmation' &&
    ((match.isPlayer1 && !match.player1Confirmed) || (match.isPlayer2 && !match.player2Confirmed));
  const isCompleted = match.status === 'completed';

  const handleSubmitResult = async () => {
    if (!resultForm.player1FramesWon || !resultForm.player2FramesWon || !resultForm.winner) {
      alert('Please fill in all result fields');
      return;
    }

    if (onSubmitResult) {
      await onSubmitResult(match.id, {
        player1FramesWon: parseInt(resultForm.player1FramesWon),
        player2FramesWon: parseInt(resultForm.player2FramesWon),
        winner: resultForm.winner,
      });
      setShowResultModal(false);
      setResultForm({ player1FramesWon: '', player2FramesWon: '', winner: '' });
    }
  };

  const handleConfirmResult = async () => {
    if (onConfirmResult) {
      await onConfirmResult(match.id);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-l-4 border-blue-500">
      {/* Header: Tournament & Round Info */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{tournament?.name || 'Tournament'}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {round?.name || `Round ${match.roundNumber}`} • {round?.roundType}
            {match.bestOfFrames && <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Best of {match.bestOfFrames}</span>}
          </p>
        </div>
        {getStatusBadge(match.status)}
      </div>

      {/* Match Details: Players & Frames */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Player 1 */}
        <div className={`p-4 rounded-lg ${match.isPlayer1 ? 'bg-blue-50 border-2 border-blue-300' : 'bg-gray-50'}`}>
          <div className="flex items-center gap-3 mb-3">
            {match.player1?.avatarUrl && (
              <img src={match.player1.avatarUrl} alt={match.player1.name} className="w-12 h-12 rounded-full" />
            )}
            <div>
              <p className="font-semibold text-gray-900">{match.player1?.name || 'Player 1'}</p>
              {match.isPlayer1 && <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">You</span>}
              {match.handicapPlayer1 > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded ml-1">+{match.handicapPlayer1} frames</span>}
            </div>
          </div>
          {isCompleted && match.player1FramesWon !== null && (
            <p className="text-2xl font-bold text-gray-900">{match.player1FramesWon}</p>
          )}
        </div>

        {/* VS & Score */}
        <div className="flex flex-col justify-center items-center">
          <p className="text-xl font-bold text-gray-500 mb-2">VS</p>
          {isCompleted && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Final Score</p>
              <div className="flex gap-4 justify-center items-center">
                <span className="text-2xl font-bold text-gray-900">{match.player1FramesWon || 0}</span>
                <span className="text-gray-400">-</span>
                <span className="text-2xl font-bold text-gray-900">{match.player2FramesWon || 0}</span>
              </div>
              {match.winner === 'player1' && (
                <p className="text-sm text-green-600 font-semibold mt-2">🏆 {match.player1?.name || 'Player 1'} Won</p>
              )}
              {match.winner === 'player2' && (
                <p className="text-sm text-green-600 font-semibold mt-2">🏆 {match.player2?.name || 'Player 2'} Won</p>
              )}
            </div>
          )}
        </div>

        {/* Player 2 */}
        <div className={`p-4 rounded-lg ${match.isPlayer2 ? 'bg-blue-50 border-2 border-blue-300' : 'bg-gray-50'}`}>
          <div className="flex items-center gap-3 mb-3">
            {match.player2?.avatarUrl && (
              <img src={match.player2.avatarUrl} alt={match.player2.name} className="w-12 h-12 rounded-full" />
            )}
            <div>
              <p className="font-semibold text-gray-900">{match.player2?.name || 'Player 2'}</p>
              {match.isPlayer2 && <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">You</span>}
              {match.handicapPlayer2 > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded ml-1">+{match.handicapPlayer2} frames</span>}
            </div>
          </div>
          {isCompleted && match.player2FramesWon !== null && (
            <p className="text-2xl font-bold text-gray-900">{match.player2FramesWon}</p>
          )}
        </div>
      </div>

      {/* Match Info: Date, Venue, Format */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 text-sm">
        {/* Scheduled Date */}
        <div className="flex items-center gap-2 text-gray-600">
          <FaCalendarAlt className="text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Scheduled</p>
            <p className="font-medium text-gray-900">{formatDateTime(match.scheduledDate)}</p>
          </div>
        </div>

        {/* Format */}
        <div className="flex items-center gap-2 text-gray-600">
          <FaTrophy className="text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Format</p>
            <p className="font-medium text-gray-900">{match.bestOfFrames ? `Best of ${match.bestOfFrames}` : 'Best of Frames'}</p>
          </div>
        </div>

        {/* Venue/Table */}
        <div className="flex items-center gap-2 text-gray-600">
          <FaMapMarkerAlt className="text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Venue</p>
            <p className="font-medium text-gray-900">{match.venueId || 'TBA'}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        {/* Submit Result Button */}
        {canSubmitResult && (
          <Button
            onClick={() => setShowResultModal(true)}
            variant="primary"
            className="text-sm"
          >
            Submit Result
          </Button>
        )}

        {/* Confirm Result Button */}
        {canConfirmResult && (
          <Button
            onClick={handleConfirmResult}
            variant="primary"
            className="text-sm"
          >
            Confirm Match Result
          </Button>
        )}

        {/* View Bracket Button */}
        <Button
          onClick={() => navigate(`/player/tournament/${tournament?.id}/bracket`)}
          variant="secondary"
          className="text-sm"
        >
          View Bracket
        </Button>
      </div>

      {/* Result Submission Modal */}
      {showResultModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Submit Match Result</h3>

            <div className="space-y-4">
              {/* Player 1 Frames */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {match.player1?.name || 'Player 1'} Frames Won
                </label>
                <input
                  type="number"
                  min="0"
                  value={resultForm.player1FramesWon}
                  onChange={(e) => setResultForm({ ...resultForm, player1FramesWon: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  placeholder="0"
                />
              </div>

              {/* Player 2 Frames */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {match.player2?.name || 'Player 2'} Frames Won
                </label>
                <input
                  type="number"
                  min="0"
                  value={resultForm.player2FramesWon}
                  onChange={(e) => setResultForm({ ...resultForm, player2FramesWon: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  placeholder="0"
                />
              </div>

              {/* Winner Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Winner</label>
                <select
                  value={resultForm.winner}
                  onChange={(e) => setResultForm({ ...resultForm, winner: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select winner...</option>
                  <option value="player1">{match.player1?.name || 'Player 1'}</option>
                  <option value="player2">{match.player2?.name || 'Player 2'}</option>
                  <option value="draw">Draw</option>
                </select>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => setShowResultModal(false)}
                variant="secondary"
                className="flex-1 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitResult}
                variant="primary"
                className="flex-1 text-sm"
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
