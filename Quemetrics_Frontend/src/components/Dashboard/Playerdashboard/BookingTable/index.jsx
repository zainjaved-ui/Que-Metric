import { AuthContext } from '../../../../contexts/AuthContext';
import { OrganizationContext } from '../../../../contexts/OrganizationContext';
import { LeagueContext } from '../../../../contexts/LeagueContext';
import { TournamentContext } from '../../../../contexts/TournamentContext';
import { useState, useEffect, useContext, useRef } from 'react';
import { PlayerContext } from '../../../../contexts/PlayerContext';
import {
  FaUsers,
  FaTrophy,
  FaCrown,
  FaCalendarAlt,
  FaChevronRight,
  FaChevronDown,
  FaCalendar,
  FaGamepad,
  FaCoins,
  FaChair,
  FaTable,
  FaSpinner,
  FaTimes,               // added for modal close button
  FaArrowLeft,
  FaCheck,
  FaClock,
  FaExclamationTriangle,
  FaCheckCircle,
  FaBell,
  FaMapMarkerAlt,
  FaArrowRight
} from 'react-icons/fa';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../../ui/Button';
import Loader from '../../../ui/Loader';
import apiClient from '../../../../contexts/apiClient';

// ===== IMAGE IMPORTS FOR GAME TABS =====
import snookerIcon from '../../../../assets/snooker.png';
import poolIcon from '../../../../assets/pool.png';
import pookerIcon from '../../../../assets/pooker.png';

export default function BookingTable() {
  const { player } = useContext(PlayerContext);

  // Prevent duplicate API calls in React.StrictMode (development)
  const hasLoadedGameStats = useRef(false);

  // ==================== GAME SELECTION ====================
  const [selectedGame, setSelectedGame] = useState('snooker'); // 'snooker' | 'pool' | 'pooker'

  // ==================== TAB & SELECTION STATE ====================
  const [currentTab, setCurrentTab] = useState(1);
  const [selectedMatchType, setSelectedMatchType] = useState(null);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [expandedLeague, setExpandedLeague] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [refreshedTournamentData, setRefreshedTournamentData] = useState(null);
  const [selectedTournamentMatch, setSelectedTournamentMatch] = useState(null);
  const [playerTournaments, setPlayerTournaments] = useState([]);
  const [expandedTournamentId, setExpandedTournamentId] = useState(null);
  const [tournamentMatchList, setTournamentMatchList] = useState([]);
  const [loadingTournamentMatches, setLoadingTournamentMatches] = useState(false);
  /** Resolved player id for booking when PlayerContext has not loaded yet (same as /player/me). */
  const [profileForBooking, setProfileForBooking] = useState({ id: null, loading: true });
  const [_selectedTable, setSelectedTable] = useState(null);
  const [selectedVenueTable, setSelectedVenueTable] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [tournamentVenue, setTournamentVenue] = useState(null);
  const [tournamentTables, setTournamentTables] = useState([]);
  const [availableSlotDays, setAvailableSlotDays] = useState([]);
  const [filteredSlots, setFilteredSlots] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(2); // March (0-indexed, so 2 = March)
  const [calendarYear, setCalendarYear] = useState(2026);

  // ==================== MODAL STATE ====================
  const [modal, setModal] = useState({ show: false, message: '', isError: false });

  // ==================== API DATA STATE ====================
  const [snookerLeagues, setSnookerLeagues] = useState([]);
  const [poolLeagues, setPoolLeagues] = useState([]);
  const [pookerLeagues, setPookerLeagues] = useState([]);
  const [pendingLeagueId, setPendingLeagueId] = useState(null);
  const [pendingFixtureId, setPendingFixtureId] = useState(null);

  const [leagueMatches, setLeagueMatches] = useState([]);
  const [venues, setVenues] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [error, setError] = useState(null);
  const [gameStats, setGameStats] = useState({ snooker: 0, pool: 0, pooker: 0, poker: 0 });
  const [tournamentStats, setTournamentStats] = useState({ snooker: 0, pool: 0, pooker: 0, poker: 0 });
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [monthlyAvailability, setMonthlyAvailability] = useState({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [fetchingVenue, setFetchingVenue] = useState(false);
  const [fetchingTables, setFetchingTables] = useState(false);
  const [fetchingSlots, setFetchingSlots] = useState(false);
  const [requestingDeadlineChange, setRequestingDeadlineChange] = useState(false);

  const parseDateOnlyLocal = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  /** `YYYY-MM-DD` or ISO strings as local calendar dates (avoids UTC shift from `new Date('2026-04-12')`). */
  const parseYmdLocal = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) {
      const y = Number(ymd[1]);
      const m = Number(ymd[2]);
      const d = Number(ymd[3]);
      const dt = new Date(y, m - 1, d);
      if (Number.isNaN(dt.getTime())) return null;
      dt.setHours(0, 0, 0, 0);
      return dt;
    }
    return parseDateOnlyLocal(value);
  };

  const isSameDate = (a, b) => {
    if (!a || !b) return false;
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  };

  const normalizeWeekday = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const aliases = {
      mon: 'monday',
      tue: 'tuesday',
      tues: 'tuesday',
      wed: 'wednesday',
      thu: 'thursday',
      thur: 'thursday',
      thurs: 'thursday',
      fri: 'friday',
      sat: 'saturday',
      sun: 'sunday',
    };
    return aliases[raw] || raw;
  };

  const getWeekdayFromDate = (dateObj) =>
    normalizeWeekday(dateObj?.toLocaleDateString('en-US', { weekday: 'long' }));

  // Helper function to format available booking days
  const getFormattedBookingDays = (slotDays) => {
    if (!slotDays || slotDays.length === 0) return 'No booking days configured';

    const dayNames = {
      monday: 'Mon',
      tuesday: 'Tue',
      wednesday: 'Wed',
      thursday: 'Thu',
      friday: 'Fri',
      saturday: 'Sat',
      sunday: 'Sun'
    };

    const sortedDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const availableDays = slotDays
      .map(day => normalizeWeekday(day))
      .filter(day => sortedDays.includes(day))
      .sort((a, b) => sortedDays.indexOf(a) - sortedDays.indexOf(b));

    if (availableDays.length === 0) return 'No booking days configured';
    if (availableDays.length === 7) return 'Open all days';

    return availableDays.map(day => dayNames[day] || day).join(', ');
  };

  const parseTournamentVenueIdsField = (venueIds) => {
    if (!venueIds) return [];
    if (Array.isArray(venueIds)) return venueIds.map(String);
    if (typeof venueIds === 'string') {
      try {
        let processedValue = venueIds;
        let safety = 0;
        // Multi-level JSON parsing for double/triple encoded strings
        while (typeof processedValue === 'string' && safety < 10) {
          const trimmed = processedValue.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
            try {
              processedValue = JSON.parse(processedValue);
            } catch (e) {
              break;
            }
          } else {
            break;
          }
          safety++;
        }

        if (Array.isArray(processedValue)) {
          return processedValue.map(String).map(v => {
            // Extract venue name from "venueOwnerId:venueName" format if present
            if (v.includes(':')) {
              const parts = v.split(':');
              return parts[parts.length - 1]; // Return the venue name part
            }
            return v;
          });
        } else if (typeof processedValue === 'object' && processedValue !== null) {
          return Object.values(processedValue).map(String);
        } else if (processedValue) {
          return [String(processedValue)];
        }
      } catch {
        // Fallback: split by comma
        return venueIds
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .map(v => {
            // Extract venue name from format if present
            if (v.includes(':')) {
              const parts = v.split(':');
              return parts[parts.length - 1];
            }
            return v;
          });
      }
    }
    return [String(venueIds)];
  };

  const venueRowMatchesTournamentToken = (venue, token) => {
    if (!venue || !token) return false;
    return String(venue.id) === String(token) || String(venue.venueId) === String(token);
  };

  const handleRequestDeadlineChange = async () => {
    if (!selectedTournamentMatch?.id) return;
    try {
      setRequestingDeadlineChange(true);
      await apiClient.post(
        `/tournaments/${selectedTournament?.id}/matches/${selectedTournamentMatch.id}/deadline-change-request`,
        {}
      );
      setModal({ show: true, message: 'Deadline change request sent.', isError: false });
    } catch (err) {
      setModal({
        show: true,
        message: err.response?.data?.error || 'Failed to request deadline change.',
        isError: true,
      });
    } finally {
      setRequestingDeadlineChange(false);
    }
  };

  const bookingAPI = {
    createTournamentBooking: (payload) => apiClient.post('/bookings/tournament', payload),
    createBooking: (payload) => apiClient.post('/bookings', payload),
    getTournamentVenues: (tournamentId) => apiClient.get(`/bookings/tournament/${tournamentId}/venues`),
    getTablesByVenue: (venueId) => apiClient.get('/tables', { params: { venueId } }),
    getSlotsByTable: (tableId, date, tournamentId) =>
      apiClient.get('/slots', { params: { tableId, date, tournamentId } }),
  };

  useEffect(() => {
    if (player?.id) {
      setProfileForBooking({ id: player.id, loading: false });
      return;
    }
    let cancelled = false;
    setProfileForBooking((prev) => ({ ...prev, loading: true }));
    apiClient
      .get('/player/me')
      .then((r) => {
        if (cancelled) return;
        const id = r.data?.success && r.data?.data?.id ? r.data.data.id : null;
        setProfileForBooking({ id, loading: false });
      })
      .catch(() => {
        if (!cancelled) setProfileForBooking({ id: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [player?.id]);

  // ==================== LOAD GAME STATS & INITIAL SELECTION ====================
  useEffect(() => {
    // Prevent duplicate calls in React.StrictMode (development environment)
    if (hasLoadedGameStats.current) return;
    hasLoadedGameStats.current = true;

    loadGameStats();

    // Parse URL parameters for rescheduling
    const params = new URLSearchParams(window.location.search);
    const fixtureId = params.get('fixtureId');
    const leagueId = params.get('leagueId');
    const sport = params.get('sport');

    if (sport) setSelectedGame(sport);
    if (leagueId) {
      setPendingLeagueId(leagueId);
      setSelectedMatchType('league');
      setCurrentTab(2);
    }
    if (fixtureId) setPendingFixtureId(fixtureId);
  }, []);

  const loadGameStats = async () => {
    try {
      const response = await apiClient.get('/bookings/game-stats');
      if (response.data.success) {
        setGameStats(response.data.data);

        // Load tournaments and count by sport
        try {
          const tournamentsResponse = await apiClient.get('/player/tournaments');
          if (tournamentsResponse.data.success) {
            const tournaments = Array.isArray(tournamentsResponse.data.data) ? tournamentsResponse.data.data : [];

            // Count tournaments by sport
            const tStats = { snooker: 0, pool: 0, pooker: 0, poker: 0 };
            tournaments.forEach(t => {
              const sport = t.tournament?.sport;
              if (sport && tStats.hasOwnProperty(sport.toLowerCase())) {
                tStats[sport.toLowerCase()]++;
              }
            });
            setTournamentStats(tStats);
          }
        } catch (err) {
          console.warn('Failed to load tournament stats:', err);
        }

        // Auto-select first game with active leagues or tournaments if current selectedGame has none
        const sports = ['snooker', 'pool', 'pooker', 'poker'];
        const currentLeagueCount = response.data.data[selectedGame] || 0;
        const currentTournamentCount = tournamentStats[selectedGame] || 0;
        const currentTotal = currentLeagueCount + currentTournamentCount;

        if (currentTotal === 0) {
          const firstActive = sports.find(s =>
            ((response.data.data[s] || 0) + (tournamentStats[s] || 0)) > 0
          );
          if (firstActive) {
            setSelectedGame(firstActive);
          }
        }

        // Set statsLoaded to true AFTER all data has been loaded
        setStatsLoaded(true);
      }
    } catch (err) {
      console.error('Failed to load game stats:', err);
      // Set statsLoaded to true even on error so page doesn't hang
      setStatsLoaded(true);
    }
  };

  const renderHeroHeader = () => (
    <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
      <div className="max-w-5xl mx-auto relative z-10">
        <span className="text-[7.5px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-2.5 flex items-center gap-2.5"><span className="w-5 h-[1px] bg-[#BA995D] inline-block" /> Booking</span>
        <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
          Book <span className="text-[#BA995D]">Table</span>
        </h1>
        <p className="text-white/30 font-black text-[7.5px] uppercase tracking-[0.2em] mt-3 max-w-md leading-relaxed">
          Book a table for your matches.
        </p>
      </div>
    </div>
  );
  // ==================== LOAD SNOOKER LEAGUES ====================
  // Only load leagues when the game changes, NOT on every tab change.
  // Firing on every currentTab change (with currentTab >= 1) caused 4+ concurrent
  // pending requests that clogged the browser connection pool, blocking the booking POST.
  // Only load leagues when selectedMatchType is 'league', not 'tournament'.
  useEffect(() => {
    if (!statsLoaded) return;
    if (selectedMatchType !== 'league') return;
    if (selectedGame === 'snooker' && currentTab >= 1) {
      loadSnookerLeagues();
    } else if (selectedGame === 'pool') {
      loadPoolLeagues();
    } else if (selectedGame === 'pooker' && currentTab >= 1) {
      loadPookerLeagues();
    }
  }, [selectedGame, currentTab, statsLoaded, selectedMatchType]);

  const loadSnookerLeagues = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/bookings/snooker-leagues');
      if (response.data.success) {
        setSnookerLeagues(response.data.data);

        // Auto-expand if we have a pending league, otherwise select first
        if (response.data.data.length > 0) {
          const leagueToExpand = pendingLeagueId
            ? response.data.data.find(l => l.id === pendingLeagueId)
            : response.data.data[0];

          if (leagueToExpand) {
            handleLeagueExpand(leagueToExpand);
          }
        }
      }
    } catch (err) {
      setError('Failed to load snooker leagues');
    } finally {
      setLoading(false);
    }
  };

  // ==================== LOAD POOL LEAGUES ====================
  const loadPoolLeagues = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/bookings/pool-leagues');
      if (response.data.success) {
        setPoolLeagues(response.data.data);

        if (response.data.data.length > 0) {
          const leagueToExpand = pendingLeagueId
            ? response.data.data.find(l => l.id === pendingLeagueId)
            : response.data.data[0];

          if (leagueToExpand) {
            handleLeagueExpand(leagueToExpand);
          }
        }
      }
    } catch {
      setError('Failed to load pool leagues');
    } finally {
      setLoading(false);
    }
  };

  const loadPookerLeagues = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/bookings/pooker-leagues');
      if (response.data.success) {
        setPookerLeagues(response.data.data);

        if (response.data.data.length > 0) {
          const leagueToExpand = pendingLeagueId
            ? response.data.data.find(l => l.id === pendingLeagueId)
            : response.data.data[0];

          if (leagueToExpand) {
            handleLeagueExpand(leagueToExpand);
          }
        }
      }
    } catch (err) {
      setError('Failed to load pooker leagues');
    } finally {
      setLoading(false);
    }
  };

  // ==================== LOAD LEAGUE MATCHES ====================
  const loadLeagueMatches = async (leagueId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/bookings/leagues/${leagueId}/matches`);
      if (response.data.success) {
        setLeagueMatches(response.data.data.matches);
      }
    } catch {
      setError('Failed to load league matches');
    } finally {
      setLoading(false);
    }
  };

  // ==================== LOAD POOL LEAGUE MATCHES ====================
  const loadPoolLeagueMatches = async (leagueId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/bookings/pool-matches/${leagueId}`);
      if (response.data.success) {
        setLeagueMatches(response.data.data.matches);
      }
    } catch {
      setError('Failed to load pool league matches');
    } finally {
      setLoading(false);
    }
  };

  // ==================== LOAD POKER LEAGUE MATCHES ====================
  const loadPookerLeagueMatches = async (leagueId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/bookings/pooker-matches/${leagueId}`);
      if (response.data.success) {
        setLeagueMatches(response.data.data.matches);
      }
    } catch (err) {
      setError('Failed to load pooker league matches');
    } finally {
      setLoading(false);
    }
  };

  const normalizeSportKey = (v) => String(v || '').trim().toLowerCase();

  /** Tournaments the signed-in player is registered for (filtered by current sport tab). */
  const loadPlayerTournaments = async (sportKey = selectedGame) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/player/tournaments');
      if (response.data.success) {
        const rows = Array.isArray(response.data.data) ? response.data.data : [];
        const want = normalizeSportKey(sportKey);
        const filtered = rows.filter((row) => {
          if (row.status && String(row.status).toLowerCase() !== 'approved') return false;
          const sp = row.tournament?.sport;
          if (!sp) return true;
          return normalizeSportKey(sp) === want;
        });
        setPlayerTournaments(filtered);
      } else {
        setPlayerTournaments([]);
      }
    } catch (err) {
      console.error('Failed to load player tournaments:', err);
      setError('Failed to load your tournaments');
      setPlayerTournaments([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTournamentMatchesForPlayer = async (tournamentMeta) => {
    const tid = tournamentMeta?.id;
    if (!tid) {
      setTournamentMatchList([]);
      return;
    }
    let pid = player?.id || profileForBooking.id;
    if (!pid) {
      try {
        const me = await apiClient.get('/player/me');
        if (me.data?.success && me.data?.data?.id) pid = me.data.data.id;
      } catch {
        pid = null;
      }
    }
    if (!pid) {
      setTournamentMatchList([]);
      return;
    }
    try {
      setLoadingTournamentMatches(true);
      setError(null);

      // Refresh tournament data to get latest fields like matchDeadlineDate
      let freshTournamentMeta = tournamentMeta;
      try {
        const tournamentsResponse = await apiClient.get('/player/tournaments');
        if (tournamentsResponse.data?.success) {
          const tournaments = Array.isArray(tournamentsResponse.data.data) ? tournamentsResponse.data.data : [];
          const foundTournament = tournaments.find(t => t.tournament?.id === tid);
          if (foundTournament?.tournament) {
            freshTournamentMeta = foundTournament.tournament;
            console.log('✅ Refreshed tournament data with matchDeadlineDate:', freshTournamentMeta.matchDeadlineDate);
          }
        }
      } catch (refreshErr) {
        console.warn('Could not refresh tournament data, using cached:', refreshErr);
      }

      const res = await apiClient.get(`/tournaments/${tid}/player-matches`);
      if (!res.data.success) {
        setTournamentMatchList([]);
        return;
      }
      const raw = Array.isArray(res.data.data) ? res.data.data : [];
      const nonBookableStatuses = new Set(['completed', 'voided', 'walkover', 'default']);
      const pidStr = String(pid);

      const mapped = raw
        .filter((m) => {
          if (!m) return false;
          if (m.status === 'bye' || m.isBye || m.bye) return false;
          if (String(m.id || '').startsWith('synthetic-bye')) return false;
          if (!m.player1Id || !m.player2Id) return false;
          if (m.status && nonBookableStatuses.has(String(m.status))) return false;
          return String(m.player1Id) === pidStr || String(m.player2Id) === pidStr;
        })
        .map((m) => {
          const isP1 = String(m.player1Id) === pidStr;
          const opp = isP1 ? m.player2 : m.player1;
          const round = m.TournamentRound || m.round || {};
          // Use match deadline if available, otherwise tournament-level deadline, otherwise tournament end
          const matchDeadline = m.scheduledDeadline || freshTournamentMeta?.matchDeadlineDate;
          return {
            ...m,
            tournamentMatchId: m.id,
            tournamentId: m.tournamentId,
            sport: freshTournamentMeta.sport || selectedGame,
            opponentName: opp?.name || 'Opponent',
            startDate: m.scheduledDate || freshTournamentMeta.startDate,
            endDate: matchDeadline || freshTournamentMeta.endDate,
            roundLabel: round.roundType || round.name || m.roundType || '',
            roundNumber: m.roundNumber ?? round.roundNumber,
            roundType: m.roundType ?? round.roundType,
            hasBooking: false,
            bookingStatus: null,
          };
        });

      // Fetch existing bookings for the player to check which matches are already booked
      try {
        const bookingsResponse = await apiClient.get('/bookings/my-bookings');
        if (bookingsResponse.data?.success) {
          const playerBookings = Array.isArray(bookingsResponse.data.data) ? bookingsResponse.data.data : [];

          // Filter tournament bookings for this specific tournament
          const tournamentBookings = playerBookings.filter(
            (booking) => booking.bookingType === 'tournament' && booking.tournamentId === tid
          );

          // Update mapped matches with booking status
          const updatedMapped = mapped.map((match) => {
            const existingBooking = tournamentBookings.find(
              (booking) => booking.tournamentMatchId === match.tournamentMatchId
            );

            if (existingBooking) {
              return {
                ...match,
                hasBooking: true,
                bookingStatus: existingBooking.status || 'pending', // pending or confirmed
              };
            }
            return match;
          });

          setTournamentMatchList(updatedMapped);
          console.log('✅ Tournament matches loaded with booking status:', updatedMapped);
        } else {
          setTournamentMatchList(mapped);
        }
      } catch (bookingsErr) {
        console.warn('Could not fetch bookings, showing all matches as available:', bookingsErr);
        setTournamentMatchList(mapped);
      }
      setRefreshedTournamentData(freshTournamentMeta); // Store refreshed data for later use
    } catch (e) {
      console.error('Failed to load tournament matches:', e);
      setError('Failed to load tournament matches');
      setTournamentMatchList([]);
    } finally {
      setLoadingTournamentMatches(false);
    }
  };

  const handleTournamentExpand = async (row) => {
    const tid = row?.tournament?.id;
    if (!tid) return;
    if (expandedTournamentId === tid) {
      setExpandedTournamentId(null);
      setTournamentMatchList([]);
      return;
    }
    setExpandedTournamentId(tid);
    setExpandedLeague(null);
    setLeagueMatches([]);
    await loadTournamentMatchesForPlayer(row.tournament);
  };

  // ==================== LOAD VENUES FOR SELECTED LEAGUE ====================
  const loadVenues = async (leagueId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/bookings/venues`, { params: { leagueId } });
      if (response.data.success) {
        const normalizedVenues = (response.data.data || []).map((venue) => {
          const rawTableCount = Number(venue.numberOfTables) || 0;
          const isExternal = Boolean(venue.isExternalVenue);
          const tableCount = rawTableCount > 0 ? rawTableCount : (isExternal ? 1 : 2);
          const tables = Array.isArray(venue.tables) && venue.tables.length > 0
            ? venue.tables
            : (isExternal ? [{ id: `external-${venue.id}-1`, name: 'External Table' }] : []);
          return {
            ...venue,
            numberOfTables: tableCount,
            tables,
          };
        });
        setVenues(normalizedVenues);
      }
    } catch {
      setError('Failed to load venues for this league');
      setVenues([]);
    } finally {
      setLoading(false);
    }
  };

  const venueRowFromTournamentApi = (v) => {
    if (!v) return null;
    const tableCount = Array.isArray(v.tables) ? v.tables.length : 0;
    return {
      id: v.id,
      venueName: v.venueName || v.name || 'Tournament Venue',
      name: v.name || v.venueName || 'Tournament Venue',
      numberOfTables: Math.max(Number(v.numberOfTables) || 2, tableCount, 1),
      tables: Array.isArray(v.tables) ? v.tables : [],
      slots: Array.isArray(v.slots) ? v.slots : [],
      isVenueOwnerVenue: v.isVenueOwnerVenue,
      isExternalVenue: v.isExternalVenue,
    };
  };

  const venueRowFromClubApi = (v) => {
    if (!v) return null;
    const tableCount = Array.isArray(v.tables) ? v.tables.length : 0;
    return {
      id: v.id,
      venueName: v.name || v.venueName || 'Club Venue',
      name: v.name || v.venueName || 'Club Venue',
      numberOfTables: Math.max(Number(v.numberOfTables) || 0, tableCount, 1),
      tables: Array.isArray(v.tables) ? v.tables : [],
      slots: Array.isArray(v.slots) ? v.slots : [],
      isClubVenue: true,
    };
  };

  // ==================== LOAD VENUES FOR TOURNAMENT ====================
  const loadTournamentVenueData = async (tournamentId, tournamentMeta = null, calendarDay = null) => {
    try {
      setFetchingVenue(true);
      setFetchingTables(true);
      setError(null);
      const tournamentVenuesResponse = await bookingAPI.getTournamentVenues(tournamentId);
      const tournamentVenues = Array.isArray(tournamentVenuesResponse?.data?.data)
        ? tournamentVenuesResponse.data.data
        : [];

      let effectiveTournamentVenues = tournamentVenues;
      if (effectiveTournamentVenues.length === 0) {
        const clubId =
          tournamentMeta?.clubId ||
          tournamentMeta?.tournament?.clubId ||
          null;

        // Fallback: tournaments without explicit venueIds can still use club venues.
        if (clubId) {
          try {
            const clubVenuesResponse = await apiClient.get(`/clubs/${clubId}/venues`);
            const clubVenues = Array.isArray(clubVenuesResponse?.data?.data)
              ? clubVenuesResponse.data.data
              : [];
            effectiveTournamentVenues = clubVenues.map(venueRowFromClubApi).filter(Boolean);
          } catch {
            effectiveTournamentVenues = [];
          }
        }
      }

      if (effectiveTournamentVenues.length === 0) {
        setVenues([]);
        setTournamentVenue(null);
        setTournamentTables([]);
        setAvailableSlotDays([]);
        setSelectedVenue(null);
        setError('No tournament venue is configured for this event.');
        return;
      }

      const primaryVenueToken =
        tournamentMeta?.venueId ||
        parseTournamentVenueIdsField(tournamentMeta?.venueIds)[0] ||
        null;
      let venueData = effectiveTournamentVenues[0];
      if (primaryVenueToken) {
        const matched = effectiveTournamentVenues.find((v) => venueRowMatchesTournamentToken(v, primaryVenueToken));
        if (matched) venueData = matched;
      }

      const allRows = effectiveTournamentVenues
        .map((v) => (v.isClubVenue ? v : venueRowFromTournamentApi(v)))
        .filter(Boolean);
      setVenues(allRows);

      const resolvedVenue = venueRowFromTournamentApi(venueData);
      setTournamentVenue(resolvedVenue);
      setSelectedVenue(resolvedVenue);
      // Track slot weekdays to disable impossible tournament dates in calendar.
      const days = Array.isArray(resolvedVenue?.slots)
        ? [...new Set(resolvedVenue.slots.map((s) => normalizeWeekday(s?.day)).filter(Boolean))]
        : [];
      setAvailableSlotDays(days);

      let tables = [];
      try {
        const tablesResponse = await bookingAPI.getTablesByVenue(resolvedVenue.id);
        tables = Array.isArray(tablesResponse?.data?.data) ? tablesResponse.data.data : [];
      } catch {
        tables = [];
      }
      if (tables.length === 0 && Array.isArray(venueData.tables) && venueData.tables.length > 0) {
        tables = venueData.tables.map((t, i) => {
          const name =
            typeof t === 'string'
              ? t.trim()
              : String(t?.name || t?.label || `Table ${i + 1}`).trim();
          return {
            id: `${String(resolvedVenue.id)}::${name}`,
            name,
            tableNumber: i + 1,
            venueId: String(resolvedVenue.id),
          };
        });
      }
      setTournamentTables(tables);
      setSelectedVenueTable(null);
      setSelectedTimeSlot(null);
      setFilteredSlots([]);
      setTimeSlots([]);
      if (calendarDay != null && resolvedVenue?.id) {
        await loadTimeSlots(resolvedVenue.id, calendarDay);
      }
    } catch (err) {
      console.error('Error loading tournament venue data:', err);
      setError('Failed to load tournament venue data');
      setVenues([]);
      setTournamentVenue(null);
      setTournamentTables([]);
      setAvailableSlotDays([]);
    } finally {
      setFetchingVenue(false);
      setFetchingTables(false);
    }
  };

  // ==================== LOAD TIME SLOTS ====================
  const loadTimeSlots = async (venueId, date) => {
    try {
      setFetchingSlots(true);
      setLoading(true);
      setError(null);
      // Note: calendarMonth is 0-indexed, so we add 1 for the actual month
      const actualMonth = String(calendarMonth + 1).padStart(2, '0');
      const formattedDate = `${calendarYear}-${actualMonth}-${String(date).padStart(2, '0')}`;
      const response = await apiClient.get(`/bookings/time-slots`, { params: { venueId, date: formattedDate } });
      if (response.data.success) {
        const slots = response.data.data.timeSlots || [];
        setTimeSlots(slots);

        // Note: We no longer overwrite selectedVenue.tables/numberOfTables here.
        // Static venue data (tables/count) is loaded from /venues or tournament setup.
        // Derived tables from slots can be inconsistent if some tables have no slots for that specific day.
      }
    } catch {
      setError('Failed to load time slots');
    } finally {
      setFetchingSlots(false);
      setLoading(false);
    }
  };

  // ==================== LOAD MONTHLY AVAILABILITY ====================
  const loadMonthlyAvailability = async (venueId, month, year) => {
    try {
      setLoadingAvailability(true);
      const response = await apiClient.get('/bookings/monthly-availability', {
        params: { venueId, month: month + 1, year }
      });
      if (response.data.success) {
        console.log('📅 Monthly Availability Loaded:', {
          venueId,
          month: month + 1,
          year,
          bookedDates: Object.entries(response.data.data).filter(([_, available]) => !available).map(([date]) => date)
        });
        setMonthlyAvailability(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load monthly availability:', err);
    } finally {
      setLoadingAvailability(false);
    }
  };

  // Fetch monthly availability when venue or calendar month changes
  useEffect(() => {
    if (selectedVenue && calendarMonth !== undefined && calendarYear) {
      console.log('🔄 Loading monthly availability for:', { venueId: selectedVenue.id, month: calendarMonth + 1, year: calendarYear });
      loadMonthlyAvailability(selectedVenue.id, calendarMonth, calendarYear);
    }
  }, [selectedVenue, calendarMonth, calendarYear]);

  // ==================== CREATE BOOKING ====================
  const createBooking = async () => {
    try {
      setLoading(true);
      setBookingComplete(false);
      setError(null);

      const actualMonth = String(calendarMonth + 1).padStart(2, '0');
      const formattedDate = `${calendarYear}-${actualMonth}-${String(selectedDate).padStart(2, '0')}`;

      let response;

      if (selectedMatchType === 'tournament' && selectedTournamentMatch) {
        // ── Tournament booking ──────────────────────────────────────────────
        const bookingData = {
          tournamentMatchId: selectedTournamentMatch.tournamentMatchId,
          tournamentId: selectedTournamentMatch.tournamentId,
          venueId: String(selectedVenue.id),
          bookingDate: formattedDate,
          startTime: selectedTimeSlot.startTime,
          endTime: selectedTimeSlot.endTime,
          tableNumber: selectedTimeSlot.tableNumber,
          tableName: selectedVenueTable?.name,
          sport: selectedTournamentMatch.sport || selectedGame,
          notes: '',
        };
        console.log('Creating tournament booking:', bookingData);
        response = await bookingAPI.createTournamentBooking(bookingData);
      } else {
        // ── League booking ──────────────────────────────────────────────────
        const bookingData = {
          fixtureId: selectedMatch.fixtureId,
          leagueId: selectedLeague.id,
          venueId: String(selectedVenue.id),
          bookingDate: formattedDate,
          startTime: selectedTimeSlot.startTime,
          endTime: selectedTimeSlot.endTime,
          tableNumber: selectedTimeSlot.tableNumber,
          tableName: selectedVenueTable?.name || selectedTimeSlot?.table || null,
          notes: '',
        };
        console.log('Creating league booking:', bookingData);
        response = await bookingAPI.createBooking(bookingData);
      }

      if (response.data && response.data.success) {
        // Success - show completion state
        setLoading(false);
        setBookingComplete(true);
        setModal({ show: true, message: 'Booking created successfully! Waiting for opponent confirmation.', isError: false });

        // Refresh tournament matches if this was a tournament booking to update booking status
        if (selectedMatchType === 'tournament' && selectedTournament) {
          setTimeout(() => {
            loadTournamentMatchesForPlayer(selectedTournament);
          }, 500);
        }

        // Auto-close modal and reset after 3 seconds
        setTimeout(() => {
          setModal({ show: false, message: '', isError: false });
          setBookingComplete(false);
          handleGameSelect(selectedGame);
        }, 3000);
      } else {
        // Error in response
        setLoading(false);
        const errorMessage = response.data?.error || 'Booking request failed';
        setError(errorMessage);
        setModal({ show: true, message: errorMessage, isError: true });
      }
    } catch (err) {
      // Network or parsing error
      console.error('Error creating booking:', err);
      setLoading(false);
      setBookingComplete(false);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create booking';
      setError(errorMessage);
      setModal({ show: true, message: errorMessage, isError: true });
    }
  };


  // ---------- Match Types per Game ----------
  const matchTypesByGame = {
    snooker: [
      {
        id: 'league',
        icon: <FaUsers />,
        title: 'League Match',
        description: 'League match'
      },
      {
        id: 'tournament',
        icon: <FaTrophy />,
        title: 'Tournament',
        description: 'Tournament match'
      },
      // {
      //   id: 'golden',
      //   icon: <FaCrown />,
      //   title: 'Challenge',
      //   description: 'Special challenge match',
      //   badge: 'Premier'
      // }
      // {
      //   id: 'golden',
      //   icon: <FaCrown className="w-12 h-12 text-[#132F45]" />,
      //   title: 'Golden Tournament',
      //   description: 'Book your Golden Crown match',
      //   badge: 'Special'
      // }
    ],
    pool: [
      {
        id: 'league',
        icon: <FaUsers />,
        title: 'Pool League',
        description: 'Official league match'
      },
      {
        id: 'tournament',
        icon: <FaTrophy />,
        title: 'Tournament',
        description: 'Tournament match'
      }
    ],
    pooker: [
      {
        id: 'league',
        icon: <FaUsers />,
        title: 'Pooker League',
        description: 'Official league match'
      },
      {
        id: 'tournament',
        icon: <FaTrophy />,
        title: 'Tournament',
        description: 'Tournament match'
      }
    ]
  };

  // ==================== CALENDAR ====================

  const getCalendarRange = () => {
    let rangeStartDate = null;
    let rangeEndDate = null;

    if (selectedMatchType === 'tournament' && (selectedTournament || selectedTournamentMatch)) {
      // For calendar display: Always use tournament's actual start/end dates
      // This ensures the full booking window is visible on the calendar
      const tStart = selectedTournament?.startDate || selectedTournamentMatch?.startDate;
      const tEnd = selectedTournament?.endDate || selectedTournamentMatch?.endDate;

      console.log('🗓️ Calendar Range Debug:', {
        tournamentStartDate: selectedTournament?.startDate,
        tournamentEndDate: selectedTournament?.endDate,
        matchDeadline: selectedTournamentMatch?.scheduledDeadline,
        selectedStartDate: tStart,
        selectedEndDate: tEnd
      });

      if (tStart && tEnd) {
        rangeStartDate = parseYmdLocal(tStart);
        rangeEndDate = parseYmdLocal(tEnd);
        console.log('📅 Final Calendar Range:', {
          start: rangeStartDate?.toISOString(),
          end: rangeEndDate?.toISOString()
        });
      }
    } else if (selectedMatch?.leagueStartDate && selectedMatch?.leagueEndDate) {
      rangeStartDate = parseYmdLocal(selectedMatch.leagueStartDate);
      rangeEndDate = parseYmdLocal(selectedMatch.leagueEndDate);
    }

    return { rangeStartDate, rangeEndDate };
  };

  const generateCalendarDays = () => {
    const days = [];

    // Support both league and tournament date ranges
    const { rangeStartDate, rangeEndDate } = getCalendarRange();

    // If no dates, return a default calendar for the current month (all days disabled)
    if (!rangeStartDate || !rangeEndDate) {
      const defaultStart = new Date(calendarYear, calendarMonth, 1);
      const defaultEnd = new Date(calendarYear, calendarMonth + 1, 0);
      // Convert JS day (0=Sun,1=Mon...6=Sat) to Monday-first (0=Mon,1=Tue...6=Sun)
      const startDay = (defaultStart.getDay() + 6) % 7;
      const daysInMonth = defaultEnd.getDate();

      for (let i = 0; i < startDay; i++) days.push({ day: null, disabled: true });
      for (let i = 1; i <= daysInMonth; i++) days.push({ day: i, disabled: false });

      return days;
    }

    // Get the first and last day of the calendar month
    const monthStart = new Date(calendarYear, calendarMonth, 1);
    const monthEnd = new Date(calendarYear, calendarMonth + 1, 0);
    // Convert JS day (0=Sun,1=Mon...6=Sat) to Monday-first (0=Mon,1=Tue...6=Sun)
    const startDay = (monthStart.getDay() + 6) % 7;
    const daysInMonth = monthEnd.getDate();

    // Add empty cells for days before month starts
    for (let i = 0; i < startDay; i++) days.push({ day: null, disabled: true });

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      const year = calendarYear;
      const month = String(calendarMonth + 1).padStart(2, '0');
      const day = String(i).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const currentDate = new Date(calendarYear, calendarMonth, i);

      // Disable dates outside the active booking period (tournament/league start and end dates)
      let isDisabled = currentDate < rangeStartDate || currentDate > rangeEndDate;

      // For LEAGUE bookings: Check monthly availability to prevent overbooking
      // This prevents overbooking when another player has already booked the same date
      if (selectedMatchType !== 'tournament' && selectedVenue) {
        const hasSlots = monthlyAvailability?.[dateStr];
        // Disable if venue is selected but has no available slots
        if (hasSlots !== true) {
          isDisabled = true;
        }
      }

      // For TOURNAMENT bookings: Show all dates within tournament range, don't filter by venue slot days
      // The venue availability check will be shown as a warning when user selects a date
      // This prevents the calendar from appearing to "change" when venue is selected

      days.push({
        day: i,
        disabled: isDisabled,
        noSlots:
          (selectedMatchType !== 'tournament' && selectedVenue && monthlyAvailability?.[dateStr] === false)
      });
    }

    return days;
  };
  const calendarDays = generateCalendarDays();

  const { rangeStartDate, rangeEndDate } = getCalendarRange();
  const atOrBeforeRangeStartMonth =
    rangeStartDate &&
    (calendarYear < rangeStartDate.getFullYear() ||
      (calendarYear === rangeStartDate.getFullYear() && calendarMonth <= rangeStartDate.getMonth()));
  const atOrAfterRangeEndMonth =
    rangeEndDate &&
    (calendarYear > rangeEndDate.getFullYear() ||
      (calendarYear === rangeEndDate.getFullYear() && calendarMonth >= rangeEndDate.getMonth()));

  // ==================== HANDLERS ====================
  const handleGameSelect = (game) => {
    setSelectedGame(game);
    // Reset booking progress
    setCurrentTab(1);
    setSelectedMatchType(null);
    setSelectedLeague(null);
    setSelectedMatch(null);
    setSelectedOpponent(null);
    setSelectedTournament(null);
    setSelectedTournamentMatch(null);
    setSelectedDate(null);
    setSelectedVenue(null);
    setTournamentVenue(null);
    setTournamentTables([]);
    setSelectedTimeSlot(null);
    setSelectedTable(null);
    setSelectedVenueTable(null);
    setSelectedSeat(null);
    setLeagueMatches([]);
    setPlayerTournaments([]);
    setExpandedTournamentId(null);
    setTournamentMatchList([]);
    setAvailableSlotDays([]);
    setVenues([]);
    setTimeSlots([]);
    setError(null);
    setBookingComplete(false);
  };

  const handleMatchTypeSelect = (type) => {
    setSelectedMatchType(type);
    setCurrentTab(2);
    setExpandedLeague(null);
    setLeagueMatches([]);
    setExpandedTournamentId(null);
    setTournamentMatchList([]);
    if (type === 'tournament') {
      loadPlayerTournaments();
    }
  };

  const handleTournamentMatchSelect = (match, tournament) => {
    console.log('Match Data:', match);
    if (match?.isRest || match?.isBookable === false) {
      return;
    }
    setSelectedTournamentMatch(match);
    // Use refreshed tournament data if available, otherwise fall back to passed tournament
    const selectedTour = refreshedTournamentData || tournament;
    setSelectedTournament(selectedTour);
    console.log('✅ Using tournament with matchDeadlineDate:', selectedTour?.matchDeadlineDate);
    setSelectedOpponent(match.opponentName);
    setCurrentTab(3);
    setSelectedDate(null); // Reset date when match changes
    setSelectedTimeSlot(null);
    setSelectedVenue(null);
    setVenues([]);
    setSelectedVenueTable(null);
    setFilteredSlots([]);
    setTimeSlots([]);
    setTournamentVenue(null);
    setTournamentTables([]);

    // ✅ Load tournament venue data immediately when match is selected
    if (selectedTour?.id) {
      loadTournamentVenueData(selectedTour.id, selectedTour);
    }

    // If tournament-level deadline exists, open directly on that month for clarity.
    const deadlineDate = parseDateOnlyLocal(selectedTour?.matchDeadlineDate);
    if (deadlineDate) {
      setCalendarMonth(deadlineDate.getMonth());
      setCalendarYear(deadlineDate.getFullYear());
    } else if (selectedTour?.startDate || match.startDate) {
      const start = parseYmdLocal(selectedTour?.startDate || match.startDate);
      if (start) {
        setCalendarMonth(start.getMonth());
        setCalendarYear(start.getFullYear());
      }
    }
  };

  const handleLeagueExpand = async (league) => {
    if (expandedLeague === league.id) {
      setExpandedLeague(null);
      setLeagueMatches([]);
    } else {
      setExpandedTournamentId(null);
      setTournamentMatchList([]);
      setExpandedLeague(league.id);
      if (selectedGame === 'snooker') {
        await loadLeagueMatches(league.id);
      } else if (selectedGame === 'pool') {
        await loadPoolLeagueMatches(league.id);
      } else if (selectedGame === 'pooker') {
        await loadPookerLeagueMatches(league.id);
      }
    }
  };

  const handleMatchSelect = (match, league) => {
    setSelectedMatch(match);
    setSelectedLeague(league);
    setSelectedOpponent(match.opponentName);
    setCurrentTab(3);

    // Load venues for the selected league
    if (league?.id) {
      loadVenues(league.id);
    }

    // Set calendar to show the league start month
    if (match?.leagueStartDate) {
      const startDate = new Date(match.leagueStartDate);
      setCalendarMonth(startDate.getMonth());
      setCalendarYear(startDate.getFullYear());
    }
  };

  const handleCalendarPrevMonth = () => {
    // Allow free navigation - dates outside league range will be disabled visually
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleCalendarNextMonth = () => {
    // Allow free navigation - dates outside league range will be disabled visually
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const handleDateSelect = (day) => {
    if (day && !day.disabled) {
      setSelectedDate(day.day);
      setSelectedTimeSlot(null); // Reset time slot when date changes
      setFilteredSlots([]);
      setTimeSlots([]); // Clear stale slots immediately so old day's slots don't remain visible
      if (selectedMatchType === 'tournament' && selectedTournament?.id) {
        // Keep selected venue/table, but for tournament always reload via table-aware endpoint
        // to respect weekday slot rules and avoid generic fallback slots.
        if (selectedVenueTable?.id) {
          const actualMonth = String(calendarMonth + 1).padStart(2, '0');
          const formattedDate = `${calendarYear}-${actualMonth}-${String(day.day).padStart(2, '0')}`;
          bookingAPI
            .getSlotsByTable(
              selectedVenueTable.id,
              formattedDate,
              selectedTournament?.id || selectedTournamentMatch?.tournamentId || null
            )
            .then((response) => {
              const slots = Array.isArray(response?.data?.data) ? response.data.data : [];
              setFilteredSlots(slots);
              const normalizedSlots = slots.map((slot) => ({
                startTime: slot.startTime,
                endTime: slot.endTime,
                displayTime: slot.displayTime || `${slot.startTime} - ${slot.endTime}`,
                tables: [
                  {
                    tableNumber: selectedVenueTable.index,
                    tableName: selectedVenueTable.name,
                    status: slot.available ? 'available' : 'booked',
                  },
                ],
              }));
              setTimeSlots(normalizedSlots);
            })
            .catch(() => {
              setFilteredSlots([]);
              setTimeSlots([]);
              setError('Failed to load table slots');
            });
        } else if (selectedVenue?.id) {
          // If no table chosen yet, load venue day slots first; table selection will narrow later.
          loadTimeSlots(selectedVenue.id, day.day);
        } else {
          // If no venue was selected yet, load tournament venue data (which will select the primary venue)
          setTournamentTables([]);
          setSelectedVenueTable(null);
          loadTournamentVenueData(selectedTournament.id, selectedTournament, day.day);
        }
      } else if (selectedVenue) {
        // League flow: reload time slots for this venue + new date
        loadTimeSlots(selectedVenue.id, day.day);
      }
    }
  };

  const handleVenueSelect = (venue) => {
    const isTournamentFixedVenue = selectedMatchType === 'tournament' && venues.length === 1;
    if (isTournamentFixedVenue) return;
    setSelectedVenue(venue);

    // Update available slot days based on new venue's slots
    const days = Array.isArray(venue?.slots)
      ? [...new Set(venue.slots.map((s) => normalizeWeekday(s?.day)).filter(Boolean))]
      : [];
    setAvailableSlotDays(days);

    setSelectedVenueTable(null); // Reset table selection
    setSelectedTimeSlot(null); // Reset time slot when venue changes
    setFilteredSlots([]);
    setTimeSlots([]); // Clear stale slots immediately
    setSelectedDate(null); // Reset selected date

    // If date is already selected, load time slots
    if (selectedDate) {
      loadTimeSlots(venue.id, selectedDate);
    }
  };


  const handleVenueTableSelect = async (tableIndex, tableName, tableId = null) => {
    setSelectedVenueTable({ index: tableIndex, name: tableName, id: tableId });
    setSelectedTimeSlot(null); // Reset time slot when table changes

    // Tournament flow: fetch per-table slots filtered by day from backend
    if (selectedMatchType === 'tournament' && tableId && selectedDate) {
      try {
        setFetchingSlots(true);
        setTimeSlots([]); // Clear stale slots before fetching
        const actualMonth = String(calendarMonth + 1).padStart(2, '0');
        const formattedDate = `${calendarYear}-${actualMonth}-${String(selectedDate).padStart(2, '0')}`;
        const response = await bookingAPI.getSlotsByTable(
          tableId,
          formattedDate,
          selectedTournament?.id || selectedTournamentMatch?.tournamentId || null
        );
        const slots = Array.isArray(response?.data?.data) ? response.data.data : [];
        setFilteredSlots(slots);
        // Normalize per-table slot response to the shared renderer shape used by the slots grid.
        const normalizedSlots = slots.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          displayTime: slot.displayTime || `${slot.startTime} - ${slot.endTime}`,
          tables: [
            {
              tableNumber: tableIndex,
              tableName,
              status: slot.available ? 'available' : 'booked',
            },
          ],
        }));
        setTimeSlots(normalizedSlots);
      } catch {
        setFilteredSlots([]);
        setTimeSlots([]);
        setError('Failed to load table slots');
      } finally {
        setFetchingSlots(false);
      }
      return;
    }

    // League flow: time slots already loaded per-date via loadTimeSlots;
    // just clear the filtered set so the grid re-filters by the new table selection.
    setFilteredSlots([]);
  };

  const handleTimeSlotSelect = (timeSlot, table) => {
    if (table.status === 'available') {
      setSelectedTimeSlot({
        time: timeSlot.displayTime,
        table: table.tableName,
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        tableNumber: table.tableNumber
      });
    }
  };

  const handleContinueToConfirmation = () => {
    if (selectedDate && selectedVenue && selectedVenueTable && selectedTimeSlot) {
      setCurrentTab(4);
    }
  };

  const handleConfirmBooking = async () => {
    // Validate all required fields are selected before proceeding
    if (!selectedDate || !selectedVenue || !selectedVenueTable || !selectedTimeSlot) {
      setModal({ show: true, message: 'Please complete all booking details before confirming.', isError: true });
      return;
    }

    // Set loading state and prevent double-clicks
    setLoading(true);
    await createBooking();
  };

  // ==================== RENDER HELPERS ====================

  // ----- Game Tabs (at the very top) -----
  const renderGameTabs = () => {
    const games = [
      { id: 'snooker', name: 'Snooker', icon: snookerIcon },
      { id: 'pool', name: 'Pool', icon: poolIcon },
      { id: 'pooker', name: 'Pooker', icon: pookerIcon }
    ];

    return (
      <div className="inline-flex flex-wrap gap-1.5 mb-3 p-1 bg-white border border-gray-100 rounded-3xl shadow-lg shadow-[#132F45]/5 self-center">
        {games.map((game) => {
          const leagueCount = gameStats[game.id] || 0;
          const tournamentCount = tournamentStats[game.id] || 0;
          const totalCount = leagueCount + tournamentCount;

          return (
            <button
              key={game.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleGameSelect(game.id);
              }}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl transition-all relative group h-10 ${selectedGame === game.id
                ? 'bg-[#132F45] text-white shadow-lg scale-[1.01] z-10'
                : 'text-[#132F45] hover:bg-[#FAFAFA]'
                }`}
            >
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all ${selectedGame === game.id ? 'bg-[#BA995D] shadow-inner shadow-black/10' : 'bg-[#FAFAFA]'}`}>
                <img src={game.icon} alt={game.name} className="w-3.5 h-3.5 object-contain" />
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="font-black text-[8.5px] uppercase tracking-widest leading-none">{game.name}</span>
                {statsLoaded && (
                  <span className={`text-[6.5px] font-black uppercase tracking-tight mt-0.5 ${selectedGame === game.id ? 'text-[#BA995D]' : 'text-gray-400'}`}>
                    {totalCount} ACTIVE
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // ----- Tab Indicator (unchanged, but stays below game tabs) -----
  const renderTabIndicator = () => {
    const tabs = [
      { number: 1, label: 'Match' },
      { number: 2, label: 'Opponent' },
      { number: 3, label: 'Details' },
      { number: 4, label: 'Confirm' }
    ];

    return (
      <div className="flex items-center justify-center gap-1.5 mb-8">
        {tabs.map((tab, index) => {
          const isActive = currentTab === tab.number;
          const isCompleted = currentTab > tab.number;

          return (
            <React.Fragment key={tab.number}>
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-500 ${isActive
                  ? 'bg-[#132F45] text-white'
                  : isCompleted
                    ? 'text-[#BA995D]'
                    : 'text-gray-300'
                  }`}
              >
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black ${isActive ? 'bg-[#BA995D] text-white' : isCompleted ? 'bg-[#132F45] text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {isCompleted ? <FaCheck className="text-[5px]" /> : tab.number}
                </div>
                <span className="text-[7.5px] font-black uppercase tracking-widest whitespace-nowrap">
                  {tab.label}
                </span>
              </div>
              {index < tabs.length - 1 && (
                <div className={`w-3 h-[1px] ${isCompleted ? 'bg-[#BA995D]' : 'bg-gray-100'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // ==================== TAB 1 – MATCH TYPE ====================
  const renderTab1 = () => {
    const types = matchTypesByGame[selectedGame] || matchTypesByGame.snooker;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
        {types.map((type) => (
          <div
            key={type.id}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMatchTypeSelect(type.id);
            }}
            className={`group relative bg-white border border-gray-50 rounded-2xl p-5 cursor-pointer transition-all duration-500 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#132F45]/10 outline-1 outline-transparent hover:outline-[#FDF2D1] ${type.badge ? 'ring-1 ring-[#BA995D]/20' : ''}`}
          >
            {type.badge && (
              <div className="absolute top-3 right-3 bg-[#BA995D] text-white text-[6.5px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-md z-10">
                {type.badge}
              </div>
            )}

            <div className="flex flex-col items-center text-center relative z-10">
              <div className="mb-3.5 p-3.5 bg-[#FAFAFA] rounded-xl text-[#132F45] group-hover:bg-[#132F45] group-hover:text-[#BA995D] transition-all duration-500 shadow-inner">
                {React.cloneElement(type.icon, { className: "w-5 h-5 transition-colors duration-500" })}
              </div>
              <h3 className="text-[12.5px] font-black mb-1 text-[#132F45] uppercase tracking-tighter group-hover:text-[#BA995D] transition-colors">{type.title}</h3>
              <p className="text-[7.5px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-500 transition-colors">{type.description}</p>

              <div className="mt-4 flex items-center gap-1.5 text-red-600 font-black text-[7px] uppercase tracking-[0.15em] opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
                Initiate <FaArrowRight size={6} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };


  // ==================== TAB 2 – SELECT MATCH / TOURNAMENT ====================
  const renderTab2 = () => {
    if (selectedMatchType === 'tournament') {
      return (
        <div className="mt-8">
          <button
            onClick={() => setCurrentTab(1)}
            className="text-[#132F45] opacity-70 text-sm mb-6 hover:text-[#132F45] hover:opacity-100 flex items-center gap-2"
          >
            <FaArrowLeft /> Back to match type
          </button>

          {loading && (
            <div className="flex justify-center items-center py-8">
              <FaSpinner className="animate-spin text-[#132F45] text-3xl" />
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {!loading && !profileForBooking.loading && !profileForBooking.id && (
            <div className="text-center py-8 text-[#132F45] opacity-70">
              A player profile is required to book tournament matches.
            </div>
          )}

          {!loading && !profileForBooking.loading && profileForBooking.id && playerTournaments.length === 0 && (
            <div className="text-center py-8 text-[#132F45] opacity-70">
              No {selectedGame} tournaments found. Register for a tournament first, or switch sport tabs.
            </div>
          )}

          <div className="space-y-4">
            {playerTournaments.map((row) => {
              const t = row.tournament;
              if (!t?.id) return null;
              const tid = t.id;
              const isExpanded = expandedTournamentId === tid;
              const period =
                t.startDate && t.endDate
                  ? `${String(t.startDate).slice(0, 10)} → ${String(t.endDate).slice(0, 10)}`
                  : null;

              return (
                <div
                  key={tid}
                  className={`group bg-white rounded-xl border transition-all duration-500 overflow-hidden ${isExpanded
                    ? 'border-[#BA995D] shadow-lg shadow-[#132F45]/10'
                    : 'border-gray-50 hover:border-[#FDF2D1] shadow-md shadow-[#132F45]/5 hover:shadow-lg'
                    }`}
                >
                  <div
                    className={`p-4 cursor-pointer relative transition-colors duration-500 ${isExpanded ? 'bg-[#FAFAFA]' : ''}`}
                    onClick={() => handleTournamentExpand(row)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${isExpanded ? 'bg-[#132F45] text-[#BA995D]' : 'bg-[#FAFAFA] text-[#132F45]'}`}>
                          <FaTrophy className="text-sm" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-[#132F45] uppercase tracking-tight">{t.name}</h3>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <div className="flex items-center gap-1">
                              <FaCalendarAlt className="text-[#BA995D] text-[9px]" />
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{period || "Date TBD"}</span>
                            </div>
                            {t.organizer?.organizationName && (
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
                                {t.organizer.organizationName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-500 absolute right-4 top-4 ${isExpanded ? 'bg-[#BA995D] text-white rotate-180' : 'bg-[#FAFAFA] text-[#132F45]'}`}>
                      <FaChevronDown size={10} />
                    </div>
                  </div>

                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-gray-50 bg-[#FAFAFA] p-6"
                    >
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4 no-scrollbar">
                        {loadingTournamentMatches && (
                          <div className="flex justify-center py-4">
                            <FaSpinner className="animate-spin text-[#132F45] text-xl" />
                          </div>
                        )}
                        {!loadingTournamentMatches &&
                          tournamentMatchList.length === 0 && (
                            <p className="text-sm text-[#132F45] opacity-70 text-center py-4">
                              No bookable matches (bye rounds and completed fixtures are hidden).
                            </p>
                          )}
                        {!loadingTournamentMatches &&
                          tournamentMatchList.map((match) => {
                            const isBookable = !match.hasBooking;

                            return (
                              <div
                                key={match.tournamentMatchId || match.id}
                                className={`px-4 py-3 rounded-lg border transition-all duration-300 relative group/match ${isBookable
                                  ? 'bg-white border-white hover:border-[#BA995D]/30 shadow-sm hover:shadow-md cursor-pointer'
                                  : 'bg-[#FAFAFA] border-transparent opacity-60 grayscale cursor-not-allowed'
                                  }`}
                                onClick={() => isBookable && handleTournamentMatchSelect(match, t)}
                              >
                                <div className="flex items-center justify-between relative z-10">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[8px] font-black ${isBookable ? 'bg-[#FAFAFA] text-[#132F45]' : 'bg-[#E5E7EB] text-gray-400'}`}>VS</div>
                                    <div>
                                      <p className={`text-xs font-black uppercase tracking-tight ${isBookable ? 'text-[#132F45]' : 'text-gray-400'}`}>{match.opponentName || "TBD Rival"}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`text-[7px] font-black uppercase tracking-widest ${isBookable ? 'text-gray-400' : 'text-gray-300'}`}>
                                          {match.roundLabel
                                            ? `${String(match.roundLabel).replace(/_/g, ' ')}`
                                            : `RND ${match.roundNumber ?? '—'}`}
                                        </span>
                                        <div className={`w-0.5 h-0.5 rounded-full ${isBookable ? 'bg-gray-200' : 'bg-gray-300'}`} />
                                        <span className={`text-[7px] font-black uppercase tracking-widest ${isBookable ? 'text-gray-400' : 'text-gray-300'}`}>#{match.matchNumber || "—"}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {match.hasBooking ? (
                                      <div className={`px-3 py-1.5 rounded-full text-[7px] font-black uppercase tracking-widest flex items-center gap-1.5 ${match.bookingStatus === 'confirmed'
                                        ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                        : 'bg-amber-50 text-amber-600 border border-amber-100'
                                        }`}>
                                        <div className={`w-1 h-1 rounded-full ${match.bookingStatus === 'confirmed' ? 'bg-blue-500' : 'bg-amber-500 animate-pulse'}`} />
                                        {match.bookingStatus}
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleTournamentMatchSelect(match, t);
                                        }}
                                        className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${isBookable
                                          ? 'bg-[#132F45] text-white hover:bg-[#1c4566] shadow-md shadow-[#132F45]/10'
                                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                                      >
                                        Assemble
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    const leagues = selectedGame === 'pooker'
      ? pookerLeagues
      : selectedGame === 'snooker'
        ? snookerLeagues
        : poolLeagues;

    return (
      <div className="space-y-10 animate-fade-in">
        <button
          onClick={() => setCurrentTab(1)}
          className="group flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-[#132F45] transition-all"
        >
          <div className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
            <FaArrowLeft className="group-hover:-translate-x-0.5 transition-transform text-[10px]" />
          </div>
          Return to match types
        </button>

        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-gray-100 border-t-[#BA995D] animate-spin" />
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Loading matches...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-6 rounded-3xl flex items-center gap-4 animate-shake">
            <div className="w-2 h-10 bg-red-400 rounded-full" />
            <span className="text-[10px] font-black uppercase tracking-widest">{error}</span>
          </div>
        )}

        {!loading && leagues.length === 0 && (
          <div className="p-12 text-center bg-white rounded-[2rem] border border-gray-50 flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-full bg-[#FAFAFA] flex items-center justify-center text-gray-200">
              <FaTrophy className="text-2xl" />
            </div>
            <div className="max-w-xs">
              <h4 className="text-lg font-black text-[#132F45] uppercase tracking-tight">No Leagues</h4>
              <p className="text-gray-400 font-bold text-[9px] uppercase tracking-widest leading-relaxed mt-2">You don't have any active {selectedGame} leagues yet.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {leagues.map((item) => {
            const isExpanded = expandedLeague === item.id;
            const formattedBookingPeriod = item.leagueStartDate && item.leagueEndDate
              ? `${new Date(item.leagueStartDate).toLocaleDateString()} — ${new Date(item.leagueEndDate).toLocaleDateString()}`
              : "Ongoing Season";

            return (
              <div
                key={item.id}
                className={`group bg-white rounded-xl border transition-all duration-500 overflow-hidden ${isExpanded
                  ? 'border-[#BA995D] shadow-lg shadow-[#132F45]/10'
                  : 'border-gray-50 hover:border-[#FDF2D1] shadow-md shadow-[#132F45]/5 hover:shadow-lg'
                  }`}
              >
                <div
                  className={`p-4 cursor-pointer relative transition-colors duration-500 ${isExpanded ? 'bg-[#FAFAFA]' : ''}`}
                  onClick={() => handleLeagueExpand(item)}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${isExpanded ? 'bg-[#132F45] text-[#BA995D]' : 'bg-[#FAFAFA] text-[#132F45]'}`}>
                        <FaTrophy className="text-sm" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-[#132F45] uppercase tracking-tight">{item.name}</h3>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <div className="flex items-center gap-1">
                            <FaCalendarAlt className="text-[#BA995D] text-[9px]" />
                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{formattedBookingPeriod}</span>
                          </div>
                          {/* <span className="text-[7px] font-black uppercase tracking-widest">
                                {parseTournamentVenueIdsField(item.venueIds).length === 1
                                  ? parseTournamentVenueIdsField(item.venueIds)[0]
                                  : `${parseTournamentVenueIdsField(item.venueIds).length} Venues`}
                             </span> */}
                          {item.matchCount !== undefined && (
                            <div className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[7px] font-black uppercase tracking-widest border border-blue-100">
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-500 ${isExpanded ? 'bg-[#BA995D] text-white rotate-180' : 'bg-[#FAFAFA] text-[#132F45]'}`}>
                    <FaChevronDown size={10} />
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-gray-50 bg-[#FAFAFA] p-6"
                    >
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4 no-scrollbar">
                        {/* Venue Information */}


                        {loading && expandedLeague === item.id && (
                          <div className="flex justify-center py-6">
                            <div className="w-6 h-6 rounded-full border-2 border-gray-100 border-t-[#BA995D] animate-spin" />
                          </div>
                        )}

                        {!loading && leagueMatches.length === 0 && expandedLeague === item.id && (
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center py-10">No specific match pairings detected for this division yet.</p>
                        )}

                        {!loading && expandedLeague === item.id && leagueMatches.map((match) => {
                          const isPendingFixture = pendingFixtureId && (String(match.id) === String(pendingFixtureId) || String(match.matchId) === String(pendingFixtureId));
                          const isBookable = !match.hasBooking;

                          return (
                            <div
                              key={match.matchId || match.id}
                              className={`px-4 py-3 rounded-lg border transition-all duration-300 relative group/match ${isBookable
                                ? isPendingFixture
                                  ? 'bg-[#132F45] border-[#BA995D] shadow-lg shadow-[#132F45]/20 cursor-pointer'
                                  : 'bg-white border-white hover:border-[#BA995D]/30 shadow-sm hover:shadow-md cursor-pointer'
                                : 'bg-[#FAFAFA] border-transparent opacity-60 grayscale cursor-not-allowed'
                                }`}
                              onClick={() => isBookable && handleMatchSelect(match, item)}
                            >
                              <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-3">
                                  <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[8px] font-black ${isPendingFixture ? 'bg-[#BA995D] text-white' : 'bg-[#FAFAFA] text-[#132F45]'}`}>VS</div>
                                  <div>
                                    <p className={`text-xs font-black uppercase tracking-tight ${isPendingFixture ? 'text-white' : 'text-[#132F45]'}`}>{match.opponentName || "TBD Rival"}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={`text-[7px] font-black uppercase tracking-widest ${isPendingFixture ? 'text-[#BA995D]' : 'text-gray-400'}`}>RND {match.round || "—"}</span>
                                      <div className={`w-0.5 h-0.5 rounded-full ${isPendingFixture ? 'bg-[#BA995D]' : 'bg-gray-200'}`} />
                                      <span className={`text-[7px] font-black uppercase tracking-widest ${isPendingFixture ? 'text-[#BA995D]' : 'text-gray-400'}`}>#{match.matchNumber || "—"}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {match.hasBooking ? (
                                    <div className={`px-3 py-1.5 rounded-full text-[7px] font-black uppercase tracking-widest flex items-center gap-1.5 ${match.bookingStatus === 'confirmed'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                      : 'bg-amber-50 text-amber-600 border border-amber-100'
                                      }`}>
                                      <div className={`w-1 h-1 rounded-full ${match.bookingStatus === 'confirmed' ? 'bg-blue-500' : 'bg-amber-500 animate-pulse'}`} />
                                      {match.bookingStatus}
                                    </div>
                                  ) : (
                                    <button
                                      className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${isPendingFixture
                                        ? 'bg-white text-[#132F45] shadow-lg'
                                        : 'bg-[#132F45] text-white hover:bg-[#1c4566] shadow-md shadow-[#132F45]/10'}`}
                                    >
                                      Assemble
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ==================== TAB 3 – DATE & TIME / TABLE & SEAT ====================
  const renderTab3 = () => {
    return (
      <div className="space-y-12 animate-fade-in relative">
        <button
          onClick={() => setCurrentTab(2)}
          className="group flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-[#132F45] transition-all"
        >
          <div className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
            <FaArrowLeft className="group-hover:-translate-x-0.5 transition-transform text-[10px]" />
          </div>
          Change Opponent
        </button>

        <div className="bg-[#132F45] p-7 rounded-2xl relative overflow-hidden shadow-xl shadow-[#132F45]/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#BA995D]/5 rounded-bl-[10rem] -mr-16 -mt-16 pointer-events-none"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-[9px] font-black text-[#BA995D] uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="w-4 h-[1px] bg-[#BA995D]" /> Opponent
              </h3>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">{selectedOpponent || "TBD"}</h2>
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mt-3.5 flex items-center gap-2.5">
                <FaTrophy className="text-[#BA995D] text-[10px]" /> {selectedLeague?.name}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 px-5 py-4 rounded-xl backdrop-blur-md">
              <div className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-0.5">Division</div>
              <div className="text-white font-black text-xs uppercase">{selectedLeague?.seasonName || "Main Season"}</div>
            </div>
          </div>
        </div>

        <div className="space-y-10">
          {/* 1. Venue Selection */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3 px-4">
              <div className="w-1.5 h-3 bg-[#BA995D] rounded-full" /> STEP 1: SELECT VENUE
            </h3>
            <div className="bg-white border border-[#D1D5DB] rounded-lg p-4 shadow-xl shadow-[#132F45]/5">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="font-semibold text-[#132F45]">
                  {selectedMatchType === 'tournament' ? 'Venue' : 'Select Venue'}
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {venues.length === 0 && (
                  <div className="col-span-full text-gray-400 text-center text-sm py-8 bg-[#FAFAFA] rounded-xl border border-dashed border-gray-200 uppercase font-black tracking-widest">
                    {selectedMatchType === 'tournament'
                      ? 'No tournament venue is configured for this event.'
                      : 'No venues available for this league.'}
                  </div>
                )}
                {venues.map((venue) => (
                  <button
                    key={venue.id}
                    onClick={() => handleVenueSelect(venue)}
                    className={`p-4.5 rounded-2xl border transition-all duration-500 text-left relative group overflow-hidden ${selectedVenue?.id === venue.id
                      ? 'border-[#BA995D] bg-[#132F45] text-white shadow-xl shadow-[#132F45]/20 scale-[1.02]'
                      : 'border-white bg-white hover:border-[#FDF2D1] text-[#132F45] shadow-lg shadow-[#132F45]/5'
                      }`}
                  >
                    <div className="flex items-center gap-3.5 relative z-10">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${selectedVenue?.id === venue.id ? 'bg-[#BA995D]' : 'bg-[#FAFAFA]'}`}>
                        <FaMapMarkerAlt className={`text-xs ${selectedVenue?.id === venue.id ? 'text-white' : 'text-[#BA995D]'}`} />
                      </div>
                      <div>
                        <p className="font-black text-xs uppercase tracking-tight">{venue.venueName || venue.name}</p>
                        <p className={`text-[8.5px] font-black uppercase tracking-widest mt-0.5 ${selectedVenue?.id === venue.id ? 'text-white/40' : 'text-gray-400'}`}>{venue.numberOfTables} Stations</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
            {/* 2. Calendar Section */}
            <div className="space-y-8">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3 px-4">
                <div className="w-1.5 h-3 bg-[#BA995D] rounded-full" /> STEP 2: SELECT DATE
              </h3>

              {/* Deadline Notice */}
              {selectedMatchType === 'tournament' && selectedTournament?.matchDeadlineDate && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-[280px] mx-auto">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center mt-0.5">
                      <FaClock className="text-white text-[10px]" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wide mb-1">
                        Match Deadline Active
                      </p>
                      <p className="text-[9px] text-amber-800 leading-relaxed">
                        Calendar will block dates after{' '}
                        <span className="font-black text-amber-900">
                          {new Date(selectedTournament.matchDeadlineDate).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                        {' '}based on tournament deadline.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white border border-gray-100 rounded-[2rem] p-5 shadow-xl shadow-[#132F45]/5 max-w-[280px] mx-auto w-full">
                <div className="flex items-center justify-between mb-5">
                  <button
                    onClick={handleCalendarPrevMonth}
                    className="w-7 h-7 bg-[#FAFAFA] border border-gray-100 rounded-lg flex items-center justify-center text-[#132F45] hover:bg-[#132F45] hover:text-white transition-all shadow-sm"
                  >
                    <FaChevronRight className="rotate-180 text-[9px]" />
                  </button>
                  <div className="text-center">
                    <h4 className="text-[13px] font-black text-[#132F45] uppercase tracking-tighter leading-none">
                      {new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h4>
                    <div className="text-[6.5px] font-black text-[#BA995D] uppercase tracking-widest mt-1">Date</div>
                  </div>
                  <button
                    onClick={handleCalendarNextMonth}
                    className="w-7 h-7 bg-[#FAFAFA] border border-gray-100 rounded-lg flex items-center justify-center text-[#132F45] hover:bg-[#132F45] hover:text-white transition-all shadow-sm"
                  >
                    <FaChevronRight className="text-[9px]" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-3">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                    <div key={idx} className="text-center text-[7px] font-black text-gray-300 uppercase py-1">
                      {day}
                    </div>
                  ))}
                  {calendarDays.map((day, index) => (
                    <div
                      key={index}
                      onClick={() => handleDateSelect(day)}
                      className={`aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all relative group ${day.day === null
                        ? 'bg-transparent cursor-default'
                        : day.disabled
                          ? `bg-[#FAFAFA] text-gray-200 cursor-not-allowed ${day.noSlots ? 'opacity-30' : ''}`
                          : selectedDate === day.day
                            ? 'bg-[#132F45] text-white shadow-md shadow-[#132F45]/20 scale-105 ring-1 ring-[#BA995D]/30'
                            : 'bg-white border border-gray-50 hover:border-[#BA995D]/30 text-[#132F45] hover:shadow-sm'
                        }`}
                    >
                      <span className="text-[9px] font-black">{day.day}</span>
                      {day.noSlots && day.day !== null && (
                        <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-red-400" />
                      )}
                      {selectedDate === day.day && (
                        <div className="absolute bottom-1 w-0.5 h-0.5 rounded-full bg-[#BA995D]" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3 & 4. Table and Slot Section */}
            <div className="space-y-10">
              {/* Table Selection */}
              {selectedVenue && (
                <div className="space-y-6 animate-slide-up">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3 px-4">
                    <div className="w-1.5 h-3 bg-[#BA995D] rounded-full" /> STEP 3: SELECT TABLE
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {(() => {
                      const realTables =
                        selectedMatchType === 'tournament'
                          ? tournamentTables
                          : Array.isArray(selectedVenue.tables) && selectedVenue.tables.length > 0
                            ? selectedVenue.tables
                            : Array.from({
                              length: Math.max(1, Number(selectedVenue.numberOfTables) || 2)
                            }).map((_, i) => ({
                              tableNumber: i + 1,
                              name: `Table ${i + 1}`
                            }));

                      return realTables.map((table, i) => {
                        const tableIndex = typeof table === 'object' ? (table.tableNumber || i + 1) : (i + 1);
                        const tableName = typeof table === 'string' ? table : (table.name || table.label || `Table ${tableIndex}`);
                        const tableId = typeof table === 'object' ? table.id : null;
                        const isSelected = selectedVenueTable?.index === tableIndex;

                        // Check slot availability for this table
                        const isTableAvailable = timeSlots.length > 0 && timeSlots.some((slot) =>
                          slot.tables?.some(
                            (t) => Number(t.tableNumber) === Number(tableIndex) && t.status === 'available'
                          )
                        );

                        // Only grey out if we HAVE slots data and none are available
                        const hasNoAvailableSlots =
                          selectedMatchType !== 'tournament' &&
                          selectedDate &&
                          !loading &&
                          timeSlots.length > 0 &&
                          !isTableAvailable;

                        return (
                          <button
                            key={tableIndex}
                            onClick={() =>
                              !hasNoAvailableSlots && handleVenueTableSelect(tableIndex, tableName, tableId)
                            }
                            disabled={hasNoAvailableSlots}
                            className={`relative p-4 rounded-xl border transition-all duration-300 ${hasNoAvailableSlots
                                ? 'bg-[#FAFAFA] border-transparent opacity-30 grayscale blur-[0.5px] cursor-not-allowed'
                                : isSelected
                                  ? 'bg-[#132F45] border-[#BA995D] text-white shadow-xl shadow-[#132F45]/20 ring-1 ring-[#BA995D]/30'
                                  : 'bg-white border-white text-[#132F45] shadow-md hover:shadow-xl hover:border-[#BA995D]/20'
                              }`}
                          >
                            <p className="font-black text-[9px] uppercase tracking-widest">{tableName}</p>
                            {hasNoAvailableSlots && (
                              <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-400" />
                            )}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Time Slot Selection */}
              <div className="space-y-6 animate-slide-up">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3 px-4">
                  <div className="w-1.5 h-3 bg-[#BA995D] rounded-full" /> STEP 4: SELECT TIME
                </h3>
                <div className="bg-white border border-gray-100 rounded-[2rem] p-6 shadow-xl shadow-[#132F45]/5">
                  {!selectedDate || !selectedVenue || !selectedVenueTable ? (
                    <div className="py-8 text-center">
                      <div className="w-10 h-10 bg-[#FAFAFA] rounded-full flex items-center justify-center mx-auto mb-3 text-gray-200">
                        <FaClock size={12} />
                      </div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-relaxed">Select date, venue and table to see available times.</p>
                    </div>
                  ) : loading ? (
                    <div className="py-6 flex flex-col items-center justify-center gap-3">
                      <div className="w-6 h-6 rounded-full border-2 border-gray-100 border-t-[#BA995D] animate-spin" />
                      <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Loading times...</span>
                    </div>
                  ) : timeSlots.length === 0 ? (
                    <div className="py-10 text-center flex flex-col items-center gap-4">
                      <div className="w-10 h-10 bg-red-50 text-red-300 rounded-full flex items-center justify-center animate-shake"><FaTimes /></div>
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">No available times for this selection.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {timeSlots.map((slot, idx) => {
                        const tableInfo = slot.tables.find(t => t.tableNumber === selectedVenueTable.index);
                        if (!tableInfo) return null;
                        const isSelected = selectedTimeSlot?.startTime === slot.startTime;
                        const isAvailable = tableInfo.status === 'available';

                        return (
                          <button
                            key={idx}
                            onClick={() => handleTimeSlotSelect(slot, tableInfo)}
                            disabled={!isAvailable}
                            className={`p-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 shadow-sm ${isSelected
                              ? 'bg-[#132F45] text-white shadow-lg shadow-[#132F45]/20 ring-1 ring-[#BA995D]/30'
                              : isAvailable
                                ? 'bg-white border border-gray-100 text-[#132F45] hover:border-[#BA995D] hover:shadow-md'
                                : 'bg-[#FAFAFA] text-gray-300 border-transparent opacity-40 cursor-not-allowed grayscale'
                              }`}
                          >
                            {slot.displayTime}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 flex justify-center">
          <button
            onClick={handleContinueToConfirmation}
            disabled={!selectedDate || !selectedVenue || !selectedVenueTable || !selectedTimeSlot}
            className={`group px-12 py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.3em] transition-all duration-500 flex items-center gap-5 shadow-2xl ${(selectedDate && selectedVenue && selectedVenueTable && selectedTimeSlot)
              ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/30'
              : 'bg-gray-100 text-gray-300 shadow-none cursor-not-allowed'
              }`}
          >
            Review Booking <FaChevronRight size={10} className={`transition-transform duration-500 ${selectedDate && selectedVenue && selectedVenueTable && selectedTimeSlot ? 'group-hover:translate-x-2' : ''}`} />
          </button>
        </div>
      </div>
    );
  };

  const renderTab4 = () => {
    const monthName = new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { month: 'long' });
    const formattedDateFull = selectedDate ? `${selectedDate} ${monthName} ${calendarYear}` : 'Not selected';
    const bookingDetails = [
      { label: 'Game', value: selectedGame.toUpperCase(), highlight: true },
      { label: 'Match Type', value: selectedMatchType === 'tournament' ? 'TOURNAMENT MATCH' : 'LEAGUE MATCH' },
      { label: selectedMatchType === 'tournament' ? 'Tournament' : 'League', value: selectedMatchType === 'tournament' ? (selectedTournament?.name || 'Unknown') : (selectedLeague?.name || 'Unknown') },
      { label: 'Opponent', value: selectedOpponent || 'Unknown' },
      { label: 'Date', value: formattedDateFull, gold: true },
      { label: 'Time', value: selectedTimeSlot?.time || 'Not selected', gold: true },
      { label: 'Venue', value: selectedVenue?.venueName || selectedVenue?.name || 'Not selected' },
      { label: 'Table', value: selectedVenueTable?.name || selectedTimeSlot?.table || 'Not selected' }
    ];

    return (
      <div className="space-y-12 animate-fade-in">
        <button
          onClick={() => setCurrentTab(3)}
          className="group flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 hover:text-[#132F45] transition-all"
        >
          <div className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center group-hover:border-[#BA995D] transition-colors">
            <FaArrowLeft className="group-hover:-translate-x-0.5 transition-transform text-[10px]" />
          </div>
          Change Details
        </button>

        <div className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-xl shadow-[#132F45]/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#FAFAFA] rounded-bl-full -mr-16 -mt-16 pointer-events-none"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 relative z-10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-[#132F45] flex items-center justify-center text-[#BA995D] shadow-xl shadow-[#132F45]/20">
                <FaCheckCircle className="text-2xl" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[#132F45] uppercase tracking-tighter">Confirm Booking</h2>
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Check your booking details before confirming.</p>
              </div>
            </div>
            <div className="text-white font-black text-[11px] uppercase tracking-widest">SESS-{Math.floor(Math.random() * 9000) + 1000}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 relative z-10">
            {bookingDetails.map((detail, index) => (
              <div key={index} className="flex justify-between items-center py-3.5 border-b border-gray-50 hover:bg-[#FAFAFA] px-3.5 rounded-lg transition-all">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{detail.label}</span>
                <span className={`text-[11px] font-black uppercase tracking-tight ${detail.gold ? 'text-[#BA995D]' : 'text-[#132F45]'}`}>{detail.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-12 p-5 bg-[#FDF2D1]/30 border border-[#FDF2D1] rounded-2xl flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#BA995D] shadow-sm shrink-0">
              <FaBell className="animate-bounce text-xs" />
            </div>
            <div>
              <p className="text-[9px] font-black text-[#132F45] uppercase tracking-widest leading-relaxed">
                Your opponent will get a notification to confirm. Make sure everything is correct.
              </p>
            </div>
          </div>

          <div className="mt-10">
            <button
              onClick={handleConfirmBooking}
              disabled={loading || bookingComplete || modal.show || !selectedDate || !selectedVenue || !selectedVenueTable || !selectedTimeSlot}
              className={`w-full py-4 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] transition-all duration-500 shadow-xl flex items-center justify-center gap-4 ${bookingComplete
                  ? 'bg-green-500 text-white shadow-green-500/30 ring-2 ring-green-400'
                  : loading
                    ? 'bg-blue-600 text-white shadow-blue-500/30 ring-2 ring-blue-400 animate-pulse'
                    : (!selectedDate || !selectedVenue || !selectedVenueTable || !selectedTimeSlot)
                      ? 'bg-gray-100 text-gray-300 shadow-none cursor-not-allowed'
                      : 'bg-[#132F45] text-white hover:bg-[#1c4566] shadow-[#132F45]/30 active:scale-98'
                }`}
            >
              {bookingComplete ? (
                <>
                  <FaCheckCircle className="text-[#FFF] text-xs" />
                  Booking Confirmed!
                </>
              ) : loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  Processing Booking...
                </>
              ) : !selectedDate || !selectedVenue || !selectedVenueTable || !selectedTimeSlot ? (
                <>Complete All Details</>
              ) : (
                <>Confirm Booking <FaCheckCircle className="text-[#BA995D] text-xs" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==================== MAIN RENDER ====================
  if (!statsLoaded) return <Loader text="Loading games..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative">
      {/* Hero Header */}
      <div className="bg-[#132F45] pt-6 pb-12 relative overflow-hidden">
        {/* Abstract background accents */}
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center gap-3">
                <div className="w-6 h-[1px] bg-[#BA995D]" /> Book a Table
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-none">
                Secure <span className="text-[#BA995D]">Your Slot</span>
              </h1>
              <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] mt-3.5 max-w-md leading-relaxed">
                Get a table for your games within the professional network.
              </p>
            </div>

          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-20 -mt-6">
        <div className="mb-10 flex flex-col items-center">
          {renderGameTabs()}
          {renderTabIndicator()}
        </div>

        <motion.div
          layout
          className="relative"
        >
          {currentTab === 1 && renderTab1()}
          {currentTab === 2 && renderTab2()}
          {currentTab === 3 && renderTab3()}
          {currentTab === 4 && renderTab4()}
        </motion.div>
      </div>

      {/* Modal for messages */}
      <AnimatePresence>
        {modal.show && (
          <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#132F45]/60 backdrop-blur-md"
              onClick={() => setModal({ show: false, message: '', isError: false })}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-2xl max-w-xs w-full p-6 shadow-2xl z-10 text-center mx-2 outline-1 outline-[#FDF2D1]"
            >
              <div className="flex justify-between items-center mb-8">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${modal.isError ? 'bg-red-50 text-red-500 shadow-red-500/10' : 'bg-[#FDF2D1] text-[#BA995D] shadow-[#BA995D]/10'}`}>
                  {modal.isError ? <FaExclamationTriangle className="text-lg" /> : <FaCheckCircle className="text-lg" />}
                </div>
                <button
                  onClick={() => setModal({ show: false, message: '', isError: false })}
                  className="w-8 h-8 rounded-full bg-[#FAFAFA] flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
                >
                  <FaTimes size={12} />
                </button>
              </div>

              <h3 className="text-lg font-black text-[#132F45] uppercase tracking-tighter mb-3">
                {modal.isError ? 'Transmission Error' : 'Success Protocol'}
              </h3>
              <p className={`text-[8.5px] font-black uppercase tracking-widest leading-relaxed mb-8 ${modal.isError ? 'text-red-400' : 'text-gray-400'}`}>
                {modal.message}
              </p>

              <button
                onClick={() => setModal({ show: false, message: '', isError: false })}
                className={`w-full py-3.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-xl hover:-translate-y-1 ${modal.isError
                  ? 'bg-red-600 text-white shadow-red-500/20'
                  : 'bg-[#132F45] text-white shadow-[#132F45]/20 hover:bg-[#1c4566]'
                  }`}
              >
                Understand
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


// import React from 'react';
// import { FaWrench } from 'react-icons/fa';
// // import { useEffect } from 'react';
// // import { Link } from 'react-router-dom';
// //
// //
// //
// //
// // import Button from '../../../ui/Button';
// // import Card from '../../../ui/Card';
// // import Loader from '../../../ui/Loader';
// // import EmailVerificationBanner from '../../../EmailVerificationBanner';
// // import {
// //   FaTrophy,
// //   FaCalendarAlt,
// //   FaBuilding,
// //   FaCheckCircle,
// //   FaExclamationCircle,
// //   FaCog,
// //   FaEdit,
// //   FaUsers,
// //   FaChartBar,
// //   FaHome,
// //   FaBell,
// //   FaSearch,
// //   FaEye,
// //   FaPlus,
// //   FaArrowRight,
// //   FaUserCircle
// // } from 'react-icons/fa';

// export default function BookingTable() {
//   // const { user } = useContext(AuthContext);
//   // const { organization, loading, getProfile } = useContext(OrganizationContext);
//   // const { leagues, getLeagues } = useContext(LeagueContext);
//   // const { tournaments, getTournaments } = useContext(TournamentContext);

//   // useEffect(() => {
//   //   getProfile();
//   //   getLeagues();
//   //   getTournaments();
//   //   // eslint-disable-next-line react-hooks/exhaustive-deps
//   // }, []);

//   // if (loading) return <Loader />;

//   return (
//     <div className="min-h-screen flex items-center justify-center bg-gray-50">
//       <div className="bg-white shadow-lg rounded-xl p-10 text-center">
//         <h1 className="text-3xl font-bold text-gray-900 mb-4 flex items-center justify-center">
//           <FaWrench className="inline-block mr-2 text-gray-700" />
//           Under Working
//           <FaWrench className="inline-block ml-2 text-gray-700" />
//         </h1>
//         <p className="text-gray-600 text-lg">
//           The Booking Table section is currently under development. Please check back soon!
//         </p>
//       </div>

//       {/*
//       // Original dashboard code temporarily commented
//       <div className="min-h-screen bg-gray-50 w-full">
//         ...
//         (entire JSX of your original OrganizationDashboard)
//         ...
//       </div>
//       */}
//     </div>
//   );
// }
