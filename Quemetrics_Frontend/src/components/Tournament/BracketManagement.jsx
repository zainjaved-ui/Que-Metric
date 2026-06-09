import { useState, useEffect, useContext } from 'react';
import {
  FaCheck, FaLock, FaCalendarAlt, FaSpinner, FaExclamationTriangle
} from 'react-icons/fa';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Alert from '../ui/Alert';
import Loader from '../ui/Loader';
import { TournamentContext } from '../../contexts/TournamentContext';

export default function BracketManagement({ tournament, onBracketLocked, onMatchesScheduled }) {
  const context = useContext(TournamentContext);

  const [bracketStatus, setBracketStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lockingBracket, setLockingBracket] = useState(false);
  const [schedulingMatches, setSchedulingMatches] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [matchSchedules, setMatchSchedules] = useState([]);
  const [defaultDate, setDefaultDate] = useState('');
  const [defaultTime, setDefaultTime] = useState('19:00');
  const [defaultVenue, setDefaultVenue] = useState('');
  const [venues, setVenues] = useState([]);
  const [fetchingVenues, setFetchingVenues] = useState(false);
  const [seedingStrategy, setSeedingStrategy] = useState('ranked'); // ranked, random, manual
  const [bracketFormat, setBracketFormat] = useState('knockout'); // knockout, round_robin, swiss, groups_knockout

  const fetchBracketStatus = async () => {
    try {
      setLoading(true);
      setError('');

      if (!context?.getBracketStatus) {
        setError('Tournament context not available');
        return;
      }

      const result = await context.getBracketStatus(tournament.id);
      if (result.success) {
        setBracketStatus(result.data);
      } else {
        setError(result.error || 'Failed to fetch bracket status');
      }
    } catch (err) {
      console.error('Error loading bracket status:', err);
      setError('Error loading bracket status: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBracketStatus();
    fetchVenues();
  }, [tournament?.id]);

  const handleGenerateBracket = async () => {
    if (!window.confirm(`Generate bracket with ${bracketFormat} format and ${seedingStrategy} seeding?`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (context?.generateBracket) {
        const result = await context.generateBracket(tournament.id, {
          format: bracketFormat,
          seedingStrategy: seedingStrategy,
        });

        if (result.success) {
          setSuccess('✓ Bracket generated successfully!');
          setBracketStatus(result.data);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await fetchBracketStatus();
        } else {
          setError(result.error || 'Failed to generate bracket');
        }
      }
    } catch (err) {
      setError('Error generating bracket: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleLockBracket = async () => {
    if (!window.confirm('Lock the bracket? Players will no longer be able to view matches until they are scheduled.')) {
      return;
    }

    setLockingBracket(true);
    setError('');
    setSuccess('');

    try {
      const response = await apiClient.post(`/tournaments/${tournament.id}/bracket/lock`);
      if (response.data.success) {
        setSuccess('✓ Bracket locked successfully!');
        // Immediately update local state with locked status
        if (bracketStatus && bracketStatus.tournament) {
          setBracketStatus(prev => ({
            ...prev,
            tournament: {
              ...prev.tournament,
              bracketStatus: 'locked',
              bracketLockedAt: response.data.data?.bracketLockedAt || new Date()
            }
          }));
        }
        if (onBracketLocked) onBracketLocked();
        // Wait a moment for database to sync, then fetch complete updated status
        await new Promise(resolve => setTimeout(resolve, 1000));
        await fetchBracketStatus();
      } else {
        setError(response.data.error || 'Failed to lock bracket');
      }
    } catch (err) {
      setError('Error locking bracket: ' + (err.message || err));
    } finally {
      setLockingBracket(false);
    }
  };

  const handleOpenScheduleModal = () => {
    if (!bracketStatus?.matches || bracketStatus.matches.length === 0) {
      setError('No matches to schedule');
      return;
    }

    // Set default values
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDefaultDate(tomorrow.toISOString().split('T')[0]);

    setShowScheduleModal(true);
  };

  const handleApplySchedule = async () => {
    if (!defaultDate) {
      setError('Please select a start date');
      return;
    }
    // Make venue optional
    if (venues.length > 0 && !defaultVenue) {
      setError('Please select a venue');
      return;
    }

    if (!window.confirm(`Schedule all ${bracketStatus.matches.length} matches starting on ${new Date(defaultDate).toLocaleDateString()} at ${defaultTime}?`)) {
      return;
    }

    setSchedulingMatches(true);
    setError('');
    setSuccess('');

    try {
      //Get a default venue from tournament if available
      const venueToUse = defaultVenue || bracketStatus?.tournament?.venueId || venues[0]?.id || null;

      const response = await apiClient.post(
        `/tournaments/${tournament.id}/schedule-all-matches`,
        {
          defaultDate,
          defaultTime,
          defaultVenueId: venueToUse
        }
      );

      if (response.data.success) {
        setSuccess(`✅ Successfully scheduled ${response.data.data.matches.scheduledCount} matches!`);
        // Immediately update local state to show scheduled status
        if (bracketStatus && bracketStatus.tournament) {
          setBracketStatus(prev => ({
            ...prev,
            tournament: {
              ...prev.tournament,
              bracketStatus: 'scheduled',
              allMatchesScheduledAt: response.data.data?.tournament?.allMatchesScheduledAt || new Date()
            }
          }));
        }
        setShowScheduleModal(false);
        if (onMatchesScheduled) onMatchesScheduled();
        // Wait longer for database to sync, then fetch complete updated status
        await new Promise(resolve => setTimeout(resolve, 1500));
        await fetchBracketStatus();
      } else {
        setError(response.data.error || 'Failed to schedule matches');
      }
    } catch (err) {
      setError('Error scheduling matches: ' + (err.message || err));
    } finally {
      setSchedulingMatches(false);
    }
  };

  if (loading) return <Loader />;

  if (!bracketStatus) {
    return (
      <Card>
        <Alert variant="error" message="Failed to load bracket information" />
      </Card>
    );
  }

  const { tournament: tourData = {}, stats = {}, matches = [] } = bracketStatus;
  const currentStatus = tourData.bracketStatus || 'not_generated';
  const isGenerated = currentStatus === 'generated';
  const isLocked = currentStatus === 'locked';
  const isScheduled = currentStatus === 'scheduled';

  // Ensure stats has all required fields
  const safeStats = {
    totalMatches: stats.totalMatches || 0,
    scheduledMatches: stats.scheduledMatches || 0,
    completedMatches: stats.completedMatches || 0,
    percentScheduled: stats.percentScheduled || 0,
    workflowComplete: stats.workflowComplete || false,
    ...stats
  };

  return (
    <div className="space-y-4">
      {error && <Alert variant="error" message={error} />}
      {success && <Alert variant="success" message={success} />}

      {/* Workflow Progress */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">Bracket Workflow</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Step 1: Generate */}
          <div className={`p-4 rounded-lg border-2 ${currentStatus ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center mb-2">
              <FaCheck className="text-green-600 mr-2" />
              <h4 className="font-medium">1. Generated</h4>
            </div>
            <p className="text-sm text-gray-600">
              {tourData.bracketGeneratedAt
                ? new Date(tourData.bracketGeneratedAt).toLocaleDateString()
                : 'Not generated'}
            </p>
          </div>

          {/* Step 2: Review & Lock */}
          <div className={`p-4 rounded-lg border-2 ${isLocked || isScheduled ? 'border-green-300 bg-green-50' : isGenerated ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center mb-2">
              {isLocked || isScheduled ? (
                <FaCheck className="text-green-600 mr-2 text-xl" />
              ) : isGenerated ? (
                <FaSpinner className="text-blue-600 mr-2 text-xl animate-pulse" />
              ) : (
                <FaLock className="text-gray-400 mr-2 text-xl" />
              )}
              <h4 className="font-bold text-lg">2. Review & Lock</h4>
            </div>
            <p className="text-sm text-gray-600">
              {tourData.bracketLockedAt
                ? new Date(tourData.bracketLockedAt).toLocaleDateString()
                : isGenerated ? '⏳ Pending - Click button below to lock' : 'Pending'}
            </p>
          </div>

          {/* Step 3: Schedule */}
          <div className={`p-4 rounded-lg border-2 ${isScheduled ? 'border-green-300 bg-green-50' : isLocked ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center mb-2">
              {isScheduled ? (
                <FaCheck className="text-green-600 mr-2 text-xl" />
              ) : isLocked ? (
                <FaSpinner className="text-blue-600 mr-2 text-xl animate-pulse" />
              ) : (
                <FaCalendarAlt className="text-gray-400 mr-2 text-xl" />
              )}
              <h4 className="font-bold text-lg">3. Schedule Matches</h4>
            </div>
            <p className="text-sm text-gray-600">
              {isLocked ? `⏳ Ready to schedule - ${safeStats.totalMatches} matches waiting` : `${safeStats.percentScheduled}% complete (${safeStats.scheduledMatches}/${safeStats.totalMatches})`}
            </p>
          </div>

          {/* Step 4: Live */}
          <div className={`p-4 rounded-lg border-2 ${isScheduled ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center mb-2">
              {isScheduled ? (
                <FaCheck className="text-green-600 mr-2 text-xl" />
              ) : (
                <FaCheck className="text-gray-400 mr-2 text-xl" />
              )}
              <h4 className="font-bold text-lg">4. Visible to Players</h4>
            </div>
            <p className="text-sm text-gray-600">
              {isScheduled ? '✓ All matches visible to players' : 'Not ready - Complete scheduling'}
            </p>
          </div>
        </div>

        {/* Status Message */}
        {!isScheduled && (
          <Alert
            variant={isGenerated ? 'warning' : isLocked ? 'info' : 'info'}
            message={
              !currentStatus
                ? '⏳ Bracket not yet generated. Click "Generate Bracket" to start.'
                : isGenerated
                ? '👉 Your bracket is ready! Click "Review & Lock Bracket" to proceed to scheduling.'
                : isLocked
                ? '👉 Bracket is locked! Now click "Schedule All Matches" to set dates, times, and venues.'
                : 'All matches must be scheduled before players can view them'
            }
          />
        )}
      </Card>

      {/* Actions */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">Actions</h3>

        {!isGenerated && !isLocked && !isScheduled && (
          <Button
            onClick={async () => {
              try {
                setLoading(true);
                setError('');
                setSuccess('');
                const response = await apiClient.post(
                  `/tournaments/${tournament.id}/generate-bracket`,
                  { seedingMethod: 'random' }
                );
                if (response.data.success) {
                  setSuccess('✓ Bracket generated successfully!');
                  // Immediately update local state to show generated status
                  if (bracketStatus && bracketStatus.tournament) {
                    setBracketStatus(prev => ({
                      ...prev,
                      tournament: {
                        ...prev.tournament,
                        bracketStatus: 'generated',
                        bracketGeneratedAt: response.data.data?.bracketGeneratedAt || new Date()
                      }
                    }));
                  }
                  // Wait for database to sync, then fetch complete updated status
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  await fetchBracketStatus();
                } else {
                  setError('Failed to generate bracket: ' + (response.data.error || 'Unknown error'));
                }
              } catch (err) {
                setError('Error generating bracket: ' + (err.message || err));
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            variant="primary"
            className="w-full mb-4"
          >
            {loading ? (
              <>
                <FaSpinner className="mr-2 animate-spin" />
                Generating Bracket...
              </>
            ) : (
              <>
                <FaCheck className="mr-2" />
                ✓ Step 1: Generate Bracket
              </>
            )}
          </Button>
        )}

        {isGenerated && (
          <Button
            onClick={handleLockBracket}
            disabled={lockingBracket}
            variant="primary"
            className="w-full mb-4"
          >
            {lockingBracket ? (
              <>
                <FaSpinner className="mr-2 animate-spin" />
                Locking Bracket...
              </>
            ) : (
              <>
                <FaLock className="mr-2" />
                ✓ Step 2: Review & Lock Bracket
              </>
            )}
          </Button>
        )}

        {isLocked && (
          <Button
            onClick={handleOpenScheduleModal}
            disabled={schedulingMatches || safeStats.workflowComplete}
            variant="success"
            className="w-full mb-4"
          >
            {safeStats.workflowComplete ? (
              <>
                <FaCheck className="mr-2" />
                All Matches Scheduled
              </>
            ) : (
              <>
                <FaCalendarAlt className="mr-2" />
                ✓ Step 3: 📅 Schedule All Matches
              </>
            )}
          </Button>
        )}

        {isScheduled && (
          <div className="flex items-center justify-center p-4 bg-green-50 rounded border-2 border-green-300">
            <FaCheck className="mr-3 text-green-600 text-2xl" />
            <div>
              <p className="font-bold text-green-700">✓ Workflow Complete!</p>
              <p className="text-sm text-green-600">All matches are now visible to players.</p>
            </div>
          </div>
        )}
      </Card>

      {/* Matches Table */}
      {matches && matches.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold mb-4">Matches</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Round</th>
                  <th className="text-left py-2 px-2">Player 1</th>
                  <th className="text-left py-2 px-2">Player 2</th>
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Time</th>
                  <th className="text-left py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.map(m => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2 font-medium">R{m.roundNumber}</td>
                    <td className="py-2 px-2">{m.player1?.name || 'TBD'}</td>
                    <td className="py-2 px-2">{m.player2?.name || 'TBD'}</td>
                    <td className="py-2 px-2 text-xs">
                      {m.scheduledDate
                        ? new Date(m.scheduledDate).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="py-2 px-2 text-xs">{m.scheduledTime || '-'}</td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        m.isScheduled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {m.isScheduled ? 'Scheduled' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">📅 Schedule All Matches</h2>
              <button
                onClick={() => !schedulingMatches && setShowScheduleModal(false)}
                disabled={schedulingMatches}
                className="text-2xl hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {error && <Alert variant="error" message={error} className="mb-4" />}

    <div className="space-y-6">
              {/* Instructions */}
              <Alert
                variant="info"
                message="📅 Set a start date, match time, and venue. All matches will be distributed automatically across dates (2 matches per day)."
              />

              {/* Schedule Settings */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-4 flex items-center">
                  <FaCalendarAlt className="mr-2 text-blue-600" />
                  Schedule Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Date Input */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Start Date</label>
                    <input
                      type="date"
                      value={defaultDate}
                      onChange={(e) => setDefaultDate(e.target.value)}
                      disabled={schedulingMatches}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-600 mt-1">When to start scheduling matches</p>
                  </div>

                  {/* Time Input */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Match Time</label>
                    <input
                      type="time"
                      value={defaultTime}
                      onChange={(e) => setDefaultTime(e.target.value)}
                      disabled={schedulingMatches}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-600 mt-1">Time for all matches</p>
                  </div>

                  {/* Venue Selector */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Venue</label>
                    {venues.length > 0 ? (
                      <>
                        <select
                          value={defaultVenue}
                          onChange={(e) => setDefaultVenue(e.target.value)}
                          disabled={schedulingMatches}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select venue...</option>
                          {venues.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-600 mt-1">Where matches take place</p>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          disabled
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                          value="No venues configured"
                        />
                        <p className="text-xs text-amber-600 mt-1">No venues found. Matches will be scheduled without a venue.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Schedule Preview */}
              <div>
                <h3 className="font-semibold text-lg mb-3">
                  Preview: {bracketStatus?.matches?.length} Matches to Schedule
                </h3>

                <div className="bg-gray-50 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-100">
                        <th className="text-left py-2 px-3">Round</th>
                        <th className="text-left py-2 px-3">Player 1</th>
                        <th className="text-left py-2 px-3">Player 2</th>
                        <th className="text-left py-2 px-3">Date (Preview)</th>
                        <th className="text-left py-2 px-3">Time</th>
                        <th className="text-left py-2 px-3">Venue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bracketStatus?.matches?.map((m, idx) => {
                        const scheduleDate = new Date(defaultDate);
                        scheduleDate.setDate(scheduleDate.getDate() + Math.floor(idx / 2));
                        return (
                          <tr key={m.id} className="border-b hover:bg-white">
                            <td className="py-2 px-3 font-medium">R{m.roundNumber}</td>
                            <td className="py-2 px-3">{m.player1?.name || 'TBD'}</td>
                            <td className="py-2 px-3">{m.player2?.name || 'TBD'}</td>
                            <td className="py-2 px-3">
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                {scheduleDate.toLocaleDateString()}
                              </span>
                            </td>
                            <td className="py-2 px-3">{defaultTime}</td>
                            <td className="py-2 px-3">
                              {venues.find(v => v.id === defaultVenue)?.name || 'TBD'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-gray-600 mt-2">
                  💡 Note: Matches will be distributed across multiple days starting from your selected date
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={handleApplySchedule}
                  disabled={schedulingMatches || !defaultDate || (venues.length > 0 && !defaultVenue)}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {schedulingMatches ? (
                    <>
                      <FaSpinner className="mr-2 animate-spin" />
                      Scheduling in progress...
                    </>
                  ) : (
                    <>
                      <FaCheck className="mr-2" />
                      Apply Schedule ({bracketStatus?.matches?.length} matches)
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => setShowScheduleModal(false)}
                  disabled={schedulingMatches}
                  className="flex-1 bg-gray-300 hover:bg-gray-400"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
