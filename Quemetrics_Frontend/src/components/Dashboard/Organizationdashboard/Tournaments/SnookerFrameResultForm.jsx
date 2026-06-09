import React, { useState } from 'react';
import { FaTimes } from 'react-icons/fa';

/**
 * SnookerFrameResultForm Component
 * Detailed sport-specific match result entry with frame-by-frame scoring
 * Supports: Snooker, Pool, Darts with different scoring rules per sport
 */
export default function SnookerFrameResultForm({
  match,
  tournament,
  currentPlayer,
  opponentName,
  onSubmit,
  onClose,
  loading = false,
}) {
  const sport = tournament?.sport || 'snooker';
  const bestOf = tournament.format?.bestOfFrames || 3;
  const framesNeeded = Math.ceil(bestOf / 2);

  // Get sport-specific max score
  const getMaxScore = () => {
    switch (sport.toLowerCase()) {
      case 'snooker': return 147;
      case 'pool': return 15; // Racks in 9-ball
      case 'darts': return 180; // Max per round
      default: return 147;
    }
  };

  const getFrameLabel = () => {
    switch (sport.toLowerCase()) {
      case 'snooker': return 'Frame';
      case 'pool': return 'Game';
      case 'darts': return 'Round';
      default: return 'Frame';
    }
  };

  const maxScore = getMaxScore();
  const frameLabel = getFrameLabel();

  const [formData, setFormData] = useState({
    frames: Array(bestOf).fill(null).map(() => ({ player1: 0, player2: 0 })),
    walkover: false,
    walkoverReason: '',
    dispute: false,
    disputeReason: '',
    handicap1: tournament?.handicap?.player1Handicap || 0,
    handicap2: tournament?.handicap?.player2Handicap || 0,
  });

  const [matchEnded, setMatchEnded] = useState(false);
  const [player1Wins, setPlayer1Wins] = useState(0);
  const [player2Wins, setPlayer2Wins] = useState(0);

  const handleFrameUpdate = (frameIndex, player, score) => {
    const updated = [...formData.frames];
    updated[frameIndex] = {
      ...updated[frameIndex],
      [player]: Math.max(0, Math.min(maxScore, parseInt(score) || 0)),
    };
    setFormData({ ...formData, frames: updated });

    // Auto-calculate frame wins
    updateFrameWins(updated);
  };

  const updateFrameWins = (frames) => {
    let p1Wins = 0;
    let p2Wins = 0;

    frames.forEach((frame, idx) => {
      if (frame.player1 > frame.player2) {
        p1Wins++;
      } else if (frame.player2 > frame.player1) {
        p2Wins++;
      }
    });

    setPlayer1Wins(p1Wins);
    setPlayer2Wins(p2Wins);

    // Check if match has ended
    if (p1Wins === framesNeeded || p2Wins === framesNeeded) {
      setMatchEnded(true);
    } else {
      setMatchEnded(false);
    }
  };

  const handleWalkover = () => {
    if (!formData.walkover) {
      setFormData({
        ...formData,
        walkover: true,
        walkoverReason: '',
        frames: Array(bestOf).fill(null).map(() => ({ player1: 0, player2: 0 })),
      });
      setMatchEnded(true);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (formData.walkover) {
      if (!formData.walkoverReason.trim()) {
        alert('Please provide a reason for the walkover');
        return;
      }
    } else {
      const playedFrames = formData.frames.filter(
        (f) => f.player1 !== null && f.player2 !== null && (f.player1 > 0 || f.player2 > 0)
      );
      if (playedFrames.length === 0) {
        alert('Please enter results for at least one frame');
        return;
      }
    }

    try {
      const resultData = {
        matchId: match.id,
        frames: formData.walkover ? [] : formData.frames,
        walkover: formData.walkover,
        walkoverReason: formData.walkoverReason,
        dispute: formData.dispute,
        disputeReason: formData.disputeReason,
        playerResult: {
          player1Score: player1Wins,
          player2Score: player2Wins,
        },
      };

      await onSubmit(resultData);
      onClose();
    } catch (error) {
      alert('Error submitting result: ' + error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold">Record Match Result</h3>
            <p className="text-blue-100 text-sm mt-1">
              {currentPlayer} vs {opponentName}
            </p>
          </div>
          <button onClick={onClose} className="text-white hover:text-blue-100 text-2xl">
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Match Info */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-sm text-blue-600 font-medium">Best Of</p>
              <p className="text-3xl font-bold text-blue-900">{bestOf}</p>
              <p className="text-xs text-blue-700 mt-1">First to {framesNeeded}</p>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-sm text-blue-600 font-medium">Your Frames</p>
              <p className="text-3xl font-bold text-blue-900">{player1Wins}</p>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-sm text-blue-600 font-medium">Opponent Frames</p>
              <p className="text-3xl font-bold text-blue-900">{player2Wins}</p>
            </div>
          </div>

          {/* Walkover Option */}
          {!formData.walkover && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <button
                onClick={handleWalkover}
                className="w-full text-center px-4 py-2 text-orange-700 font-semibold hover:bg-orange-100 transition rounded"
              >
                Or record a Walkover / No-Show
              </button>
            </div>
          )}

          {/* Walkover Form */}
          {formData.walkover && (
            <div className="space-y-4 p-4 bg-orange-50 border border-orange-300 rounded-lg">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Why is this a walkover?
                </label>
                <select
                  value={formData.walkoverReason}
                  onChange={(e) => setFormData({ ...formData, walkoverReason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select a reason...</option>
                  <option value="no_show">Opponent Didn't Show</option>
                  <option value="retired">Opponent Retired During Match</option>
                  <option value="injury">Opponent Withdrew (Injury)</option>
                  <option value="other">Other Reason</option>
                </select>
              </div>

              {formData.walkoverReason === 'other' && (
                <div>
                  <textarea
                    placeholder="Please explain..."
                    value={formData.disputeReason}
                    onChange={(e) => setFormData({ ...formData, disputeReason: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    rows="3"
                  />
                </div>
              )}

              <button
                onClick={() =>
                  setFormData({
                    ...formData,
                    walkover: false,
                    walkoverReason: '',
                  })
                }
                className="text-orange-700 font-medium hover:text-orange-900 transition"
              >
                Cancel Walkover
              </button>
            </div>
          )}

          {/* Handicap Info (if applicable) */}
          {(formData.handicap1 !== 0 || formData.handicap2 !== 0) && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-sm font-semibold text-indigo-900 mb-2">⚖️ Handicap Applied</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-sm">
                  <span className="text-indigo-700">You:</span>
                  <span className="font-semibold text-indigo-900 ml-2">+{formData.handicap1}</span>
                </div>
                <div className="text-sm">
                  <span className="text-indigo-700">Opponent:</span>
                  <span className="font-semibold text-indigo-900 ml-2">+{formData.handicap2}</span>
                </div>
              </div>
              <p className="text-xs text-indigo-600 mt-2">Frames will be adjusted according to handicap rules</p>
            </div>
          )}

          {/* Frame Entry */}
          {!formData.walkover && (
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-900">{frameLabel} Scores</h4>
              {formData.frames.slice(0, bestOf).map((frame, idx) => (
                <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="font-semibold text-gray-700 min-w-24">{frameLabel} {idx + 1}</div>

                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max={maxScore}
                      value={frame.player1}
                      onChange={(e) => handleFrameUpdate(idx, 'player1', e.target.value)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />

                    <span className="text-gray-600 font-medium">vs</span>

                    <input
                      type="number"
                      min="0"
                      max={maxScore}
                      value={frame.player2}
                      onChange={(e) => handleFrameUpdate(idx, 'player2', e.target.value)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>

                  {/* Frame Winner Indicator */}
                  {(frame.player1 > frame.player2 || frame.player2 > frame.player1) && (
                    <div className="min-w-20 text-center">
                      {frame.player1 > frame.player2 ? (
                        <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded font-semibold text-sm">
                          ✓ You
                        </span>
                      ) : (
                        <span className="inline-block px-3 py-1 bg-red-100 text-red-800 rounded font-semibold text-sm">
                          ✗ Opponent
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {matchEnded && (
                <div className="p-4 bg-green-50 border-2 border-green-400 rounded-lg">
                  <p className="text-green-900 font-bold text-lg">✓ Match Ended</p>
                  <p className="text-green-800 text-sm mt-1">
                    You have {player1Wins} frames, opponent has {player2Wins} frames
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Dispute Option */}
          <div className="p-4 border-2 border-red-300 bg-red-50 rounded-lg">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.dispute}
                onChange={(e) => setFormData({ ...formData, dispute: e.target.checked })}
                className="w-5 h-5 mt-1 cursor-pointer"
              />
              <div>
                <p className="font-semibold text-red-900">Mark as Disputed</p>
                <p className="text-sm text-red-800 mt-1">
                  Check this if there is a discrepancy or disagreement about the result
                </p>
              </div>
            </label>

            {formData.dispute && (
              <textarea
                placeholder="What is the dispute about?"
                value={formData.disputeReason}
                onChange={(e) => setFormData({ ...formData, disputeReason: e.target.value })}
                className="w-full mt-3 px-4 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                rows="3"
              />
            )}
          </div>

          {/* Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900 font-semibold mb-2">ℹ️ Important</p>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Both players must approve the result before the match is confirmed</li>
              <li>• Enter frame scores (points) not frames won</li>
              <li>• Highest score wins each frame</li>
              <li>• Use walkover option if opponent didn't appear or withdrew</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-900 hover:bg-gray-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (!formData.walkover && !matchEnded && player1Wins === 0 && player2Wins === 0)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Result'}
          </button>
        </div>
      </div>
    </div>
  );
}
