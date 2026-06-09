/**
 * Submit Match Result Modal
 * Allows players to submit and confirm match results
 */
import React, { useState, useContext, useMemo } from 'react';
import { FaX, FaTimes } from 'react-icons/fa';
import { TournamentContext } from '../../../../contexts/TournamentContext';
import TournamentScoreTable from './TournamentScoreTable';

export default function SubmitMatchResultModal({ tournament, match, onClose, onSubmitted }) {
  const context = useContext(TournamentContext);

  if (!context) {
    return <div className="p-6 text-red-600">Tournament context not available</div>;
  }

  // Initialize frameScores based on bestOfFrames
  const bestOfFrames = match.bestOfFrames || tournament?.bestOfFrames || 5;
  const totalFrames = Math.ceil(bestOfFrames / 2) * 2; // Round up to get total frames to display

  const [frameScores, setFrameScores] = useState(
    Array.from({ length: totalFrames }, (_, i) => ({
      frameNumber: i + 1,
      player1Score: '',
      player2Score: '',
      pottedBallsPlayer1: '',
      pottedBallsPlayer2: '',
      sevenBallPlayer1: false,
      sevenBallPlayer2: false,
      blackPlayer1: false,
      blackPlayer2: false,
    }))
  );

  const [winner, setWinner] = useState(match.winner || 'none');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Calculate total frames from frame scores
  const { player1Total, player2Total } = useMemo(() => {
    let p1 = 0, p2 = 0;
    frameScores.forEach(frame => {
      const p1Score = parseInt(frame.player1Score) || 0;
      const p2Score = parseInt(frame.player2Score) || 0;
      if (p1Score > p2Score) p1++;
      else if (p2Score > p1Score) p2++;
    });
    return { player1Total: p1, player2Total: p2 };
  }, [frameScores]);

  const opponent = match.player1Id === match.playerId ? match.player2 : match.player1;
  const isPlayer1 = match.player1Id === match.playerId;

  // Get player names for display
  const player1Name = isPlayer1 ? 'You' : opponent?.name || 'Player 1';
  const player2Name = isPlayer1 ? opponent?.name || 'Player 2' : 'You';

  // Get player initials
  const getInitials = (name) => {
    return name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2) || '?';
  };

  const handleFrameChange = (frameIndex, field, value) => {
    setFrameScores(prev => {
      const updated = [...prev];
      updated[frameIndex] = { ...updated[frameIndex], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Determine actual winner ID
      let actualWinnerId = null;
      if (winner === 'player1') {
        actualWinnerId = match.player1Id;
      } else if (winner === 'player2') {
        actualWinnerId = match.player2Id;
      }

      const resultData = {
        sport: tournament?.sport,
        player1Frames: player1Total,
        player2Frames: player2Total,
        winner: actualWinnerId,
        frameScores: frameScores,
        notes: notes,
      };

      const result = await context.submitMatchResult(tournament.id, match.id, resultData);

      if (result.success) {
        onSubmitted();
        alert('Match result submitted successfully!');
      } else {
        setError(result.error || 'Failed to submit result');
      }
    } catch (err) {
      setError(err.message || 'Failed to submit result');
      console.error('Error submitting result:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header with Close Button */}
      <div className="flex justify-between items-center p-6 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">Submit Match Result</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-2xl"
        >
          <FaTimes />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        {/* Player Score Header */}
        <div className="flex items-center justify-center gap-8 py-4">
          {/* Player 1 */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2 text-xl font-bold text-blue-700">
              {getInitials(player1Name)}
            </div>
            <p className="font-semibold text-gray-900 text-sm">{player1Name}</p>
          </div>

          {/* Score Display */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-4 items-center">
              <div className="border-2 border-gray-400 rounded-lg px-6 py-3 text-center min-w-[80px]">
                <p className="text-3xl font-bold text-gray-900">{player1Total}</p>
              </div>
              <p className="text-2xl font-bold text-gray-400">-</p>
              <div className="border-2 border-gray-400 rounded-lg px-6 py-3 text-center min-w-[80px]">
                <p className="text-3xl font-bold text-gray-900">{player2Total}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">vs</p>
          </div>

          {/* Player 2 */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-2 text-xl font-bold text-red-700">
              {getInitials(player2Name)}
            </div>
            <p className="font-semibold text-gray-900 text-sm">{player2Name}</p>
          </div>
        </div>

        {/* Best of Badge */}
        {bestOfFrames && (
          <div className="flex justify-center">
            <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-semibold">
              Best of {bestOfFrames}
            </span>
          </div>
        )}

        {/* Score Entry Table */}
        <div className="space-y-3 mt-8">
          <TournamentScoreTable
            sport={tournament?.sport || 'snooker'}
            player1Name={player1Name}
            player2Name={player2Name}
            frames={frameScores}
            onFrameChange={handleFrameChange}
          />
        </div>

        {/* Winner Selection */}
        <div className="space-y-3">
          <h3 className="font-bold text-gray-900">Match Result</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 border border-gray-300 rounded cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="winner"
                value="player1"
                checked={winner === 'player1'}
                onChange={(e) => setWinner(e.target.value)}
                className="w-4 h-4"
              />
              <span className="text-gray-900 font-medium">
                {isPlayer1 ? 'I Won' : `${opponent?.name || 'Opponent'} Won`}
              </span>
            </label>

            <label className="flex items-center gap-3 p-3 border border-gray-300 rounded cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="winner"
                value="player2"
                checked={winner === 'player2'}
                onChange={(e) => setWinner(e.target.value)}
                className="w-4 h-4"
              />
              <span className="text-gray-900 font-medium">
                {isPlayer1 ? `${opponent?.name || 'Opponent'} Won` : 'I Won'}
              </span>
            </label>

            <label className="flex items-center gap-3 p-3 border border-gray-300 rounded cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="winner"
                value="draw"
                checked={winner === 'draw'}
                onChange={(e) => setWinner(e.target.value)}
                className="w-4 h-4"
              />
              <span className="text-gray-900 font-medium">Tie/Draw</span>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any comments about the match (e.g., issues, conditions, etc.)"
            rows="3"
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
          <p className="font-medium mb-1">After Submission:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Your opponent will need to confirm this result</li>
            <li>If they dispute it, an admin will review both submissions</li>
            <li>Once confirmed, you'll automatically advance if you won</li>
          </ul>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || winner === 'none' || (player1Total === 0 && player2Total === 0)}
            className={`px-6 py-2 rounded font-medium text-white transition ${
              loading || winner === 'none' || (player1Total === 0 && player2Total === 0)
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Submitting...' : 'Submit Result'}
          </button>
        </div>
      </form>
    </div>
  );
}
