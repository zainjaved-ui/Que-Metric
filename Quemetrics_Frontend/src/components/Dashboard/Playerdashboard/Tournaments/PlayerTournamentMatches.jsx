import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { TournamentContext } from '../../../../contexts/TournamentContext';
import { useAuth } from '../../../../hooks/useAuth';
import Button from '../../../../components/ui/Button';
import Loader from '../../../../components/ui/Loader';
import MatchCard from './MatchCard';
import { FaTrophy, FaCalendarAlt, FaArrowRight } from 'react-icons/fa';

export default function PlayerTournamentMatches() {
  const context = useContext(TournamentContext);
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!context) {
    return <div className="text-center py-12 text-red-600">Tournament context not available</div>;
  }

  const { matches, loading, error } = context;
  const [filterStatus, setFilterStatus] = useState('active');
  const [completedMatches, setCompletedMatches] = useState([]);

  // Update completed matches when matches change
  useEffect(() => {
    const active = matches.filter((m) =>
      ['scheduled', 'in_progress', 'pending_confirmation'].includes(m.status)
    );
    const completed = matches.filter((m) => m.status === 'completed');

    setCompletedMatches(completed);
  }, [matches]);

  const handleSubmitResult = async (matchId, resultData) => {
    try {
      setRefreshing(true);
      const match = matches.find((m) => m.id === matchId);
      if (!match) return;

      const response = await apiClient.post(
        `/tournaments/${match.tournamentId}/matches/${matchId}/result`,
        {
          ...resultData,
          submittedByAdmin: false,
        }
      );

      if (response.data.success) {
        alert('Match result submitted successfully');
        await loadMatches(); // Reload all matches
      }
    } catch (err) {
      console.error('Error submitting result:', err);
      alert(err.response?.data?.error || 'Failed to submit result');
    } finally {
      setRefreshing(false);
    }
  };

  const handleConfirmResult = async (matchId) => {
    try {
      setRefreshing(true);
      const match = matches.find((m) => m.id === matchId);
      if (!match) return;

      const response = await apiClient.post(
        `/tournaments/${match.tournamentId}/matches/${matchId}/confirm`,
        {}
      );

      if (response.data.success) {
        alert('Match result confirmed');
        await loadMatches();
      }
    } catch (err) {
      console.error('Error confirming result:', err);
      alert(err.response?.data?.error || 'Failed to confirm result');
    } finally {
      setRefreshing(false);
    }
  };

  const displayMatches = filterStatus === 'active' ? matches : completedMatches;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <FaTrophy className="text-2xl text-yellow-500" />
            <h1 className="text-4xl font-bold text-gray-900">My Tournament Matches</h1>
          </div>
          <p className="text-gray-600">View your assigned matches and tournament progress</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-8 flex-wrap">
          <Button
            onClick={() => navigate('/player/my-tournaments')}
            className="flex items-center gap-2"
          >
            <FaCalendarAlt />
            View All Tournaments
          </Button>
          <Button
            onClick={loadMatches}
            variant="secondary"
            disabled={loading || refreshing}
            className="flex items-center gap-2"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Matches'}
          </Button>
        </div>

        {/* Status Tabs */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-8 border-b border-gray-200">
          <div className="flex gap-4 overflow-x-auto">
            {[
              { key: 'active', label: 'Active Matches', count: matches.length, icon: '📋' },
              { key: 'completed', label: 'Completed', count: completedMatches.length, icon: '✓' },
            ].map(({ key, label, count, icon }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  filterStatus === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {icon} {label} ({count})
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && <Loader />}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
            <button
              onClick={loadMatches}
              className="mt-3 text-red-600 hover:text-red-700 font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && displayMatches.length === 0 && (
          <>
            {/* Workflow Status Alerts */}
            {workflowStatus.length > 0 && workflowStatus.some(s => !s.isVisible) && (
              <div className="space-y-3 mb-8">
                {workflowStatus
                  .filter(s => !s.isVisible)
                  .map(status => (
                    <div
                      key={status.tournamentId}
                      className="bg-blue-50 border border-blue-200 rounded-lg p-4"
                    >
                      <h4 className="font-semibold text-blue-900 mb-1">{status.tournamentName}</h4>
                      <p className="text-sm text-blue-800">
                        🏟️ {status.message}
                      </p>
                      <p className="text-xs text-blue-600 mt-2">
                        Organizer is{' '}
                        {status.bracketStatus === 'generated'
                          ? 'reviewing the bracket'
                          : status.bracketStatus === 'locked'
                          ? 'scheduling match times and venues'
                          : 'preparing your tournament'}
                        .
                      </p>
                    </div>
                  ))}
              </div>
            )}

            <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <FaTrophy className="mx-auto text-4xl text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {filterStatus === 'active' ? 'No active matches' : 'No completed matches'}
              </h3>
              <p className="text-gray-600 mb-6">
                {filterStatus === 'active'
                  ? 'Once tournament organizers schedule matches, they will appear here'
                  : 'Completed matches will appear in this section'}
              </p>
              <Button
                onClick={() => navigate('/player/my-tournaments')}
                className="inline-flex items-center gap-2"
              >
                <FaArrowRight />
                Browse Your Tournaments
              </Button>
            </div>
          </>
        )}

        {/* Matches Grid */}
        {!loading && displayMatches.length > 0 && (
          <div className="space-y-4">
            {displayMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                tournament={match.tournament}
                round={match.round}
                onSubmitResult={handleSubmitResult}
                onConfirmResult={handleConfirmResult}
              />
            ))}
          </div>
        )}

        {/* Info Box */}
        {!loading && matches.length > 0 && (
          <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-2">ℹ️ About Tournament Matches</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Matches are only visible after organizer completes bracket generation, review, and scheduling</li>
              <li>✓ Your matches are automatically assigned when tournament fixtures are generated</li>
              <li>✓ Matches show opponent information, scheduled date/time, and match format</li>
              <li>✓ After completing a match, your tournament progress updates automatically</li>
              <li>✓ Winners advance to the next round automatically (in knockout tournaments)</li>
              <li>✓ Your player statistics are updated with each match result</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
