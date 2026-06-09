import React, { useState } from 'react';
import { FaTimes, FaCalendarAlt } from 'react-icons/fa';

/**
 * RescheduleMatchModal
 * Allows admin to reschedule a match to a new date
 */
export default function RescheduleMatchModal({
  match,
  tournament,
  onReschedule,
  onCancel,
  loading = false,
}) {
  const getPlayerName = (player) => {
    if (!player) return 'Unknown';
    return player.name || player.nickname || 'Unknown';
  };

  const [formData, setFormData] = useState({
    scheduledDate: match.scheduledDate ? new Date(match.scheduledDate).toISOString().split('T')[0] : '',
    scheduledDeadline: tournament?.matchDeadlineDate
      ? new Date(tournament.matchDeadlineDate).toISOString().split('T')[0]
      : (match.scheduledDeadline ? new Date(match.scheduledDeadline).toISOString().split('T')[0] : ''),
    reason: '',
    updateTournamentDeadline: true,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.scheduledDate) {
      alert('Please select a new scheduled date');
      return;
    }

    try {
      await onReschedule({
        matchId: match.id,
        scheduledDate: new Date(formData.scheduledDate),
        scheduledDeadline: formData.scheduledDeadline ? new Date(formData.scheduledDeadline) : null,
        rescheduleReason: formData.reason,
        updateTournamentDeadline: Boolean(formData.updateTournamentDeadline),
      });
    } catch (error) {
      console.error('Reschedule error:', error);
      alert('Error rescheduling match: ' + (error?.message || error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="sticky top-0 bg-blue-600 text-white px-6 py-4 flex justify-between items-center rounded-t-lg">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <FaCalendarAlt />
              Reschedule Match
            </h3>
            <p className="text-blue-100 text-sm mt-1">
              {getPlayerName(match.player1)} vs {getPlayerName(match.player2)}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-white hover:text-blue-100 text-2xl disabled:opacity-50"
          >
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Current Schedule Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-3">Current Schedule</h4>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-700">Scheduled Date:</dt>
                <dd className="font-semibold text-gray-900">
                  {match.scheduledDate ? new Date(match.scheduledDate).toLocaleDateString() : 'Not set'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-700">Deadline:</dt>
                <dd className="font-semibold text-gray-900">
                  {(tournament?.matchDeadlineDate || match.scheduledDeadline)
                    ? new Date(tournament?.matchDeadlineDate || match.scheduledDeadline).toLocaleDateString()
                    : 'Not set'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-700">Round:</dt>
                <dd className="font-semibold text-gray-900">Round {match.roundNumber}</dd>
              </div>
            </dl>
          </div>

          {/* New Schedule */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">New Schedule</h4>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                New Match Date <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-gray-600 mt-1">Must be today or later</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                New Deadline (Optional)
              </label>
              <input
                type="date"
                value={formData.scheduledDeadline}
                onChange={(e) => setFormData({ ...formData, scheduledDeadline: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={formData.scheduledDate || new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-gray-600 mt-1">When result must be submitted by</p>
            </div>

            <div className="flex items-start gap-2">
              <input
                id="updateTournamentDeadline"
                type="checkbox"
                checked={formData.updateTournamentDeadline}
                onChange={(e) => setFormData({ ...formData, updateTournamentDeadline: e.target.checked })}
                className="mt-1"
              />
              <label htmlFor="updateTournamentDeadline" className="text-sm text-gray-700">
                Apply this as tournament match deadline (`matchDeadlineDate`) for all open matches
              </label>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Reason for Rescheduling
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="e.g., Venue unavailable, Player illness, Weather conditions..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows="3"
              />
            </div>
          </div>

          {/* Info */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-900 font-medium">ℹ️ Players will be notified of the reschedule</p>
          </div>
        </form>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-900 hover:bg-gray-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !formData.scheduledDate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Rescheduling...' : 'Reschedule Match'}
          </button>
        </div>
      </div>
    </div>
  );
}
