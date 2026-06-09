import React, { useState, useEffect, useCallback, useContext } from 'react';
import { TournamentContext } from '../../../../contexts/TournamentContext';
import BaseStandingsTable from '../../../shared/StandingsTable/BaseStandingsTable';

/**
 * TournamentStandingsTable Component
 * Tournament-specific standings display using shared BaseStandingsTable
 *
 * Features:
 * - Fetches standings from TournamentContext
 * - Supports group filtering for groups_knockout format
 * - Shows qualified status for players
 * - Displays format-specific information (Swiss Buchholz, etc.)
 * - Matches League Standings visual design
 */
const TournamentStandingsTable = ({
  tournamentId,
  tournament,
  currentUserId = null,
  onPlayerClick = null,
}) => {
  const { getTournamentStandings } = useContext(TournamentContext);
  const [standings, setStandings] = useState([]);
  const [standingsDisplay, setStandingsDisplay] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);

  const fetchStandings = useCallback(async () => {
    if (!tournamentId) return;

    setLoading(true);
    setError(null);

    try {
      const params = {};
      if (activeGroup !== null) {
        params.groupNumber = activeGroup;
      }

      const result = await getTournamentStandings(tournamentId, params);

      if (result.success) {
        setStandings(result.data || []);
        setStandingsDisplay(result.standingsDisplay || null);
      } else {
        setError(result.error || 'Failed to load standings');
      }
    } catch (err) {
      console.error('[TournamentStandingsTable] fetchStandings error:', err);
      setError(err.message || 'Failed to load standings');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, activeGroup, getTournamentStandings]);

  useEffect(() => {
    fetchStandings();
  }, [fetchStandings]);

  const handleGroupChange = (groupNumber) => {
    setActiveGroup(groupNumber);
  };

  const handleRetry = () => {
    fetchStandings();
  };

  // Determine if we should show group filtering
  const showGroupFilter = tournament?.format?.type === 'groups_knockout' && tournament?.groups?.length > 0;

  // Get groups for filtering
  const groups = tournament?.groups || [];

  // Determine empty message based on tournament status
  let emptyMessage = 'No standings available yet.';
  if (tournament?.status === 'draft' || tournament?.status === 'registration') {
    emptyMessage = 'Tournament has not started yet. Standings will be available once matches begin.';
  } else if (tournament?.status === 'completed') {
    emptyMessage = 'No match results recorded.';
  }

  // Determine if tournament is completed
  const isCompleted = tournament?.status === 'completed';

  // Get sport from tournament
  const sport = tournament?.sport || 'snooker';

  return (
    <div className="space-y-4">
      {/* Tournament Info Banner (optional) */}
      {tournament?.format?.type === 'swiss' && standings.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold">Swiss Format:</span>
            <span>Rankings include Buchholz tie-break scores for players with equal points.</span>
          </div>
        </div>
      )}

      {/* Standings Table */}
      <BaseStandingsTable
        standings={standings}
        standingsDisplay={standingsDisplay}
        loading={loading}
        error={error}
        sport={sport}
        isCompleted={isCompleted}
        currentUserId={currentUserId}
        onPlayerClick={onPlayerClick}
        onRetry={handleRetry}
        emptyMessage={emptyMessage}
        showGroupFilter={showGroupFilter}
        groups={groups}
        activeGroup={activeGroup}
        onGroupChange={handleGroupChange}
      />

      {/* Swiss Standings Additional Info */}
      {tournament?.format?.type === 'swiss' && standings.length > 0 && (
        <div className="text-xs text-gray-500 text-center mt-4">
          <p>Tie-break order: Buchholz → Sonneborn-Berger → Head-to-Head → Frame Difference → Frames Won</p>
        </div>
      )}

      {/* Qualified Players Info */}
      {showGroupFilter && standings.some(s => s.qualified) && (
        <div className="text-xs text-gray-500 text-center mt-4">
          <p>Players marked with ✓ Qualified have advanced to the knockout stage</p>
        </div>
      )}
    </div>
  );
};

export default TournamentStandingsTable;
