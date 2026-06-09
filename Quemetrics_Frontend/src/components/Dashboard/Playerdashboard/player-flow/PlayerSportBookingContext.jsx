import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
// import { bookingAPI } from '../../../../lib/api';
import { normalizeSport } from './sportUtils';

const PlayerSportBookingContext = createContext(null);

export function PlayerSportBookingProvider({ children }) {
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [tournamentMatchesRaw, setTournamentMatchesRaw] = useState([]);
  const [tournamentMatchesLoading, setTournamentMatchesLoading] = useState(false);
  const [tournamentMatchesError, setTournamentMatchesError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const refetchTournamentMatches = useCallback(async () => {
    setTournamentMatchesLoading(true);
    setTournamentMatchesError(null);
    try {
      // const res = await bookingAPI.getTournamentMatches();
      // if (res.data?.success) {
      //   setTournamentMatchesRaw(Array.isArray(res.data.data) ? res.data.data : []);
      // } else {
      //   setTournamentMatchesRaw([]);
      //   setTournamentMatchesError(res.data?.error || 'Failed to load tournaments');
      // }
      setTournamentMatchesRaw([]);
      setLastFetchedAt(Date.now());
    } catch (e) {
      setTournamentMatchesRaw([]);
      setTournamentMatchesError(e.response?.data?.error || e.message || 'Failed to load tournaments');
    } finally {
      setTournamentMatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedSport) return;
    refetchTournamentMatches();
  }, [selectedSport, refetchTournamentMatches]);

  const tournamentsForSport = useMemo(() => {
    if (!selectedSport) return [];
    return tournamentMatchesRaw.filter(
      (t) => normalizeSport(t.sport) === normalizeSport(selectedSport)
    );
  }, [tournamentMatchesRaw, selectedSport]);

  const validTournamentIds = useMemo(
    () => new Set(tournamentsForSport.map((t) => String(t.id))),
    [tournamentsForSport]
  );

  const bookedTournamentMatchIds = useMemo(() => {
    const ids = new Set();
    for (const t of tournamentsForSport) {
      for (const m of t.matches || []) {
        if (m.hasBooking && m.tournamentMatchId != null) {
          ids.add(String(m.tournamentMatchId));
        }
      }
    }
    return ids;
  }, [tournamentsForSport]);

  // Only validate selection when we have loaded data. During refetch, `tournamentsForSport` can be
  // momentarily empty; clearing here would reset the dropdown and show all tournaments' matches.
  useEffect(() => {
    if (!selectedTournamentId) return;
    if (tournamentMatchesLoading) return;
    if (validTournamentIds.size === 0) return;
    if (!validTournamentIds.has(String(selectedTournamentId))) {
      setSelectedTournamentId('');
    }
  }, [
    validTournamentIds,
    selectedTournamentId,
    tournamentMatchesLoading,
  ]);

  const setSport = useCallback((sport) => {
    setSelectedSport(sport);
    setSelectedTournamentId('');
  }, []);

  const value = useMemo(
    () => ({
      selectedSport,
      setSelectedSport: setSport,
      selectedTournamentId,
      setSelectedTournamentId,
      tournamentMatchesRaw,
      tournamentsForSport,
      validTournamentIds,
      bookedTournamentMatchIds,
      tournamentMatchesLoading,
      tournamentMatchesError,
      lastFetchedAt,
      refetchTournamentMatches,
    }),
    [
      selectedSport,
      setSport,
      selectedTournamentId,
      tournamentMatchesRaw,
      tournamentsForSport,
      validTournamentIds,
      bookedTournamentMatchIds,
      tournamentMatchesLoading,
      tournamentMatchesError,
      lastFetchedAt,
      refetchTournamentMatches,
    ]
  );

  return (
    <PlayerSportBookingContext.Provider value={value}>{children}</PlayerSportBookingContext.Provider>
  );
}

export function usePlayerSportBooking() {
  const ctx = useContext(PlayerSportBookingContext);
  if (!ctx) {
    throw new Error('usePlayerSportBooking must be used within PlayerSportBookingProvider');
  }
  return ctx;
}
