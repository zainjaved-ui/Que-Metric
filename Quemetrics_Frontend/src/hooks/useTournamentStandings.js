import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../../../contexts/apiClient';

/**
 * Custom hook for fetching and managing tournament standings
 * Provides real-time sorting by points with automatic refetch after match results
 *
 * @param {string} tournamentId - Tournament ID
 * @param {number} refetchInterval - Auto-refetch interval in ms (0 = disabled)
 * @returns {Object} { standings, isLoading, error, refetch, lastUpdated }
 */
export function useTournamentStandings(tournamentId, refetchInterval = 0) {
  const [standings, setStandings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const inFlightRef = useRef(false);

  // Fetch standings from API
  const fetchStandings = useCallback(async () => {
    if (!tournamentId) {
      setError('Tournament ID required');
      return;
    }

    if (inFlightRef.current) {
      console.log('[useTournamentStandings] Skipping fetch - request already in flight');
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/tournaments/${tournamentId}/standings`);

      if (response.data && response.data.success) {
        const data = response.data.data || [];

        // Auto-sort by points (descending)
        const sorted = [...data].sort((a, b) => {
          // Primary: points (highest first)
          if (b.points !== a.points) {
            return b.points - a.points;
          }

          // Secondary: frame difference
          const frameDiffA = (a.framesWon || 0) - (a.framesLost || 0);
          const frameDiffB = (b.framesWon || 0) - (b.framesLost || 0);
          if (frameDiffB !== frameDiffA) {
            return frameDiffB - frameDiffA;
          }

          // Tertiary: frames won
          if ((b.framesWon || 0) !== (a.framesWon || 0)) {
            return (b.framesWon || 0) - (a.framesWon || 0);
          }

          // Keep original order as fallback
          return 0;
        });

        // Add rank change indicators
        const withRankChanges = sorted.map((entry, idx) => ({
          ...entry,
          currentPosition: idx + 1,
          previousPosition: entry.position || idx + 1,
          positionChange: (entry.position || idx + 1) - (idx + 1),
        }));

        setStandings(withRankChanges);
        setLastUpdated(new Date());
      } else {
        throw new Error(response.data?.error || 'Failed to fetch standings');
      }
    } catch (err) {
      console.error('[useTournamentStandings] Error:', err);
      setError(err.message || 'Failed to fetch standings');
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, [tournamentId]);

  // Fetch standings on mount
  useEffect(() => {
    fetchStandings();
  }, [fetchStandings]);

  // Setup auto-refetch interval (if enabled)
  useEffect(() => {
    if (refetchInterval <= 0) return;

    const interval = setInterval(() => {
      console.log('[useTournamentStandings] Auto-refetching standings...');
      fetchStandings();
    }, refetchInterval);

    return () => clearInterval(interval);
  }, [refetchInterval, fetchStandings]);

  return {
    standings,
    isLoading,
    error,
    refetch: fetchStandings,
    lastUpdated,
  };
}

export default useTournamentStandings;
