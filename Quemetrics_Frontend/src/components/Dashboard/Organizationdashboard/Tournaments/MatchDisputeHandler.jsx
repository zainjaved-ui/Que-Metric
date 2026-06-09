import React, { useState } from 'react';
import { FaTimes, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';

/**
 * MatchDisputeHandler Component
 * Manage disputed matches, view dispute details, and admin override
 */
export default function MatchDisputeHandler({
  match,
  disputeDetails,
  onResolveDispute,
  onOverride,
  onCancel,
  loading = false,
  isAdmin = false,
}) {
  const [activeTab, setActiveTab] = useState('details'); // details, override
  const [overrideData, setOverrideData] = useState({
    playerWins: 0,
    player2Wins: 0,
    reason: '',
    frames: match.frames || [],
  });

  const handleOverride = async () => {
    if (!overrideData.reason.trim()) {
      alert('Please provide a reason for the override');
      return;
    }

    try {
      await onOverride({
        matchId: match.id,
        overrideReason: overrideData.reason,
        resultFrames: overrideData.frames,
        player1Score: overrideData.playerWins,
        player2Score: overrideData.player2Wins,
      });
    } catch (error) {
      alert('Error overriding result: ' + error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-red-600 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FaExclamationTriangle className="text-2xl" />
            <div>
              <h3 className="text-2xl font-bold">Disputed Match</h3>
              <p className="text-red-100 text-sm mt-1">
                {match.player1Name} vs {match.player2Name}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-white hover:text-red-100 text-2xl">
            <FaTimes />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-6 py-4 font-medium border-b-2 transition ${
              activeTab === 'details'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Dispute Details
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('override')}
              className={`px-6 py-4 font-medium border-b-2 transition ${
                activeTab === 'override'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Admin Override
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Dispute Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Dispute Reason */}
              <div className="p-4 bg-orange-50 border border-orange-300 rounded-lg">
                <h4 className="font-semibold text-orange-900 mb-2">Dispute Reason</h4>
                <p className="text-orange-800 whitespace-pre-wrap">
                  {disputeDetails?.reason || 'No reason provided'}
                </p>
              </div>

              {/* Original Result */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Original Result Submitted</h4>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="space-y-2">
                    {match.frames && match.frames.length > 0 ? (
                      match.frames.map((frame, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2">
                          <span className="text-sm font-medium">Frame {idx + 1}</span>
                          <span>
                            {frame.player1Score} - {frame.player2Score}
                          </span>
                          <span className="text-xs text-gray-600">
                            {frame.player1Score > frame.player2Score ? match.player1Name : match.player2Name} won
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-600 text-sm">
                        Walkover: {match.walkoverReason}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dispute History */}
              {disputeDetails?.history && disputeDetails.history.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Dispute Timeline</h4>
                  <div className="space-y-3">
                    {disputeDetails.history.map((entry, idx) => (
                      <div key={idx} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-medium text-gray-900">{entry.action}</p>
                          <p className="text-xs text-gray-600">
                            {new Date(entry.timestamp).toLocaleString()}
                          </p>
                        </div>
                        {entry.details && (
                          <p className="text-sm text-gray-700">{entry.details}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isAdmin && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-900 font-semibold">Awaiting Admin Review</p>
                  <p className="text-sm text-blue-800 mt-1">
                    A tournament organizer will review this dispute and make a decision shortly.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Admin Override Tab */}
          {activeTab === 'override' && isAdmin && (
            <div className="space-y-6">
              <div className="p-4 bg-red-50 border border-red-300 rounded-lg">
                <h4 className="font-semibold text-red-900 mb-2">⚠️ Admin Override</h4>
                <p className="text-red-800 text-sm">
                  You are about to override the match result. This action will:
                </p>
                <ul className="text-sm text-red-800 mt-2 space-y-1">
                  <li>• Lock this match with the new result</li>
                  <li>• Advance the correct winner in the bracket</li>
                  <li>• Update tournament standings automatically</li>
                  <li>• Create an audit log of this action</li>
                </ul>
              </div>

              {/* Frame Editing */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Set Correct Result</h4>
                <div className="space-y-3">
                  {overrideData.frames.map((frame, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="font-semibold text-gray-700 min-w-16">Frame {idx + 1}</div>

                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="147"
                          value={frame.player1Score || 0}
                          onChange={(e) => {
                            const updated = [...overrideData.frames];
                            updated[idx] = {
                              ...updated[idx],
                              player1Score: Math.max(0, parseInt(e.target.value) || 0),
                            };
                            setOverrideData({ ...overrideData, frames: updated });
                          }}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <span className="text-gray-600 font-medium">vs</span>

                        <input
                          type="number"
                          min="0"
                          max="147"
                          value={frame.player2Score || 0}
                          onChange={(e) => {
                            const updated = [...overrideData.frames];
                            updated[idx] = {
                              ...updated[idx],
                              player2Score: Math.max(0, parseInt(e.target.value) || 0),
                            };
                            setOverrideData({ ...overrideData, frames: updated });
                          }}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Override Reason */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Reason for Override
                </label>
                <textarea
                  placeholder="Why are you overriding this result? This will be logged in the audit trail."
                  value={overrideData.reason}
                  onChange={(e) => setOverrideData({ ...overrideData, reason: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="4"
                />
              </div>

              {/* Audit Notice */}
              <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                <p className="text-sm text-yellow-900 font-semibold">📋 Audit Trail</p>
                <p className="text-sm text-yellow-800 mt-1">
                  All admin overrides are logged with timestamp, organizer ID, and reason for review purposes.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-900 hover:bg-gray-100 transition disabled:opacity-50"
          >
            Close
          </button>

          {isAdmin && activeTab === 'override' && (
            <button
              onClick={handleOverride}
              disabled={loading || !overrideData.reason.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50"
            >
              {loading ? 'Overriding...' : 'Apply Override'}
            </button>
          )}

          {!isAdmin && activeTab === 'details' && (
            <button
              onClick={() => onResolveDispute('awaiting_review')}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              <FaCheckCircle /> Mark Reviewed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
