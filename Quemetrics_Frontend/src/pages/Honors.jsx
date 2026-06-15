import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaAward,
  FaBullseye,
  FaCalendarAlt,
  FaCircle,
  FaDice,
  FaMedal,
  FaSpinner,
  FaTrophy,
  FaFilter,
} from 'react-icons/fa';
import { AuthContext } from '../contexts/AuthContext';
import { LeagueContext } from '../contexts/LeagueContext';
import { TournamentContext } from '../contexts/TournamentContext';

const normalizeList = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.leagues)) return value.leagues;
  if (Array.isArray(value?.tournaments)) return value.tournaments;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};

const sportOrder = ['all', 'snooker', 'pool', 'pooker'];

const sportLabelMap = {
  all: 'All Sports',
  snooker: 'Snooker',
  pool: 'Pool',
  pooker: 'Pooker',
  
};

const sportIconMap = {
  snooker: FaBullseye,
  pool: FaCircle,
  pooker: FaDice,
 
};

const getSportKey = (value) => String(value || '').toLowerCase();

const getEventDate = (event) => {
  const raw = event?.completedAt || event?.endDate || event?.updatedAt || event?.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getSeasonLabel = (event, fallbackPrefix = 'Season') => {
  const seasonName = event?.season?.name || event?.seasonName || event?.gameSeason?.name;
  if (seasonName) return seasonName;

  const seasonId = event?.seasonId || event?.gameSeasonId;
  if (seasonId) return `${fallbackPrefix} ${String(seasonId).slice(0, 8)}`;

  const date = getEventDate(event);
  if (date) return `${fallbackPrefix} ${date.getFullYear()}`;

  return fallbackPrefix;
};

const getDisplayName = (row) =>
  row?.playerName || row?.name || row?.player?.name || row?.player?.playerName || row?.playerNickname || row?.player?.nickname || 'Unknown Player';

const getPlacementRows = (rows = []) => {
  const sorted = [...rows].sort((left, right) => {
    const leftPos = Number(left?.position || left?.rank || left?.place || 999);
    const rightPos = Number(right?.position || right?.rank || right?.place || 999);
    return leftPos - rightPos;
  });

  const topThree = sorted.slice(0, 3).map((row, index) => ({
    position: Number(row?.position || row?.rank || row?.place || index + 1),
    title: index === 0 ? 'Champion' : index === 1 ? 'Runner-up' : 'Third Place',
    name: getDisplayName(row),
    subtitle: row?.playerEmail || row?.player?.user?.email || row?.playerNickname || (row?.points != null ? `${row?.points ?? 0} pts` : ''),
    avatar: row?.playerAvatarUrl || row?.player?.avatarUrl || null,
  }));

  while (topThree.length < 3) {
    topThree.push({
      position: topThree.length + 1,
      title: topThree.length === 1 ? 'Runner-up' : 'Third Place',
      name: 'Not recorded',
      subtitle: '',
      avatar: null,
    });
  }

  return topThree;
};

const medalStyles = {
  Champion: {
    ring: 'ring-yellow-300/40',
    badge: 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-yellow-950',
    icon: 'text-yellow-600',
  },
  'Runner-up': {
    ring: 'ring-slate-300/40',
    badge: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900',
    icon: 'text-slate-500',
  },
  'Third Place': {
    ring: 'ring-orange-300/40',
    badge: 'bg-gradient-to-br from-orange-200 to-orange-400 text-orange-950',
    icon: 'text-orange-600',
  },
};

function PlacementCard({ placement }) {
  const style = medalStyles[placement.title] || medalStyles['Third Place'];

  return (
    <div className={`rounded-2xl border border-white/60 bg-white p-4 shadow-sm ring-1 ${style.ring}`}>
      <div className="flex items-start gap-3">
        <div className={`h-11 w-11 rounded-2xl ${style.badge} flex items-center justify-center shadow-sm`}>
          <FaMedal className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#132F45]/60">{placement.title}</p>
          <p className="mt-1 truncate text-base font-black text-[#132F45]">{placement.name}</p>
          {placement.subtitle ? <p className="mt-1 text-xs font-semibold text-[#132F45]/60">{placement.subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}

function EventCard({ event }) {
  const sportKey = getSportKey(event.sport);
  const SportIcon = sportIconMap[sportKey] || FaTrophy;
  const placements = event.placements || [];
  const date = getEventDate(event);
  const navigate = useNavigate();

  const handleOpenLeague = () => {
    if (!event?.id) return;

    const isOrganizerView = String(event?.userRole || '').toLowerCase() !== 'player';
    const eventType = String(event?.eventType || 'league').toLowerCase();

    const targetPath = eventType === 'tournament'
      ? (isOrganizerView ? `/organization/tournaments/${event.id}` : '/player/my-tournaments')
      : (isOrganizerView ? `/organization/leaguematchmanagement?leagueId=${event.id}` : `/player/leagues?leagueId=${event.id}`);

    navigate(targetPath);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleOpenLeague}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpenLeague();
        }
      }}
      className="overflow-hidden rounded-[2rem] border border-[#132F45]/10 bg-white shadow-xl shadow-[#132F45]/5 cursor-pointer transition-transform duration-200 hover:-translate-y-1"
    >
      <div className="bg-gradient-to-r from-[#132F45] to-[#1a4259] px-6 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#BA995D]">
              <SportIcon className="h-4 w-4" />
              <span>{sportLabelMap[sportKey] || event.sport || 'Competition'}</span>
            </div>
            <h3 className="mt-2 truncate text-xl font-black uppercase tracking-tight">{event.name}</h3>
            <p className="mt-1 text-sm text-white/70">
              {event.eventType === 'league' ? 'League' : 'Tournament'} · {event.seasonLabel}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#BA995D]">Completed</p>
            <p className="mt-1 text-sm font-semibold text-white">{date ? date.toLocaleDateString() : 'N/A'}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-3">
        {placements.map((placement) => (
          <PlacementCard key={placement.title} placement={placement} />
        ))}
      </div>
    </motion.div>
  );
}

export default function HonorsPage() {
  const { user } = useContext(AuthContext);
  const { getLeagues, getLeagueStandings } = useContext(LeagueContext);
  const { getTournaments, getTournamentStandings } = useContext(TournamentContext);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [activeSport, setActiveSport] = useState('all');
  const [leagueHonors, setLeagueHonors] = useState([]);
  const [tournamentHonors, setTournamentHonors] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const loadHonors = async () => {
      setLoading(true);
      setError('');

      try {
          const timestamp = Date.now();
          const [leagueResult, tournamentResult] = await Promise.all([
            getLeagues({ status: 'completed', honors: true, cacheBuster: timestamp }),
            getTournaments({ status: 'completed', honors: true, page: 1, limit: 1000, cacheBuster: timestamp }),
          ]);

          if (!isMounted) return;

          if (!leagueResult.success) throw new Error(leagueResult.error || 'Failed to load league honors');
          if (!tournamentResult.success) throw new Error(tournamentResult.error || 'Failed to load tournament honors');

          let leagues = normalizeList(leagueResult.data);
          let tournaments = normalizeList(tournamentResult.data);

          if (leagues.length === 0) {
            const fallbackLeagues = await getLeagues({ honors: true, cacheBuster: timestamp + 1 });
            leagues = normalizeList(fallbackLeagues.data).filter((league) => league?.status === 'completed');
          }

          if (tournaments.length === 0) {
            const fallbackTournaments = await getTournaments({ honors: true, page: 1, limit: 1000, cacheBuster: timestamp + 1 });
            tournaments = normalizeList(fallbackTournaments.data).filter((tournament) => tournament?.status === 'completed');
          }

        const leagueCards = await Promise.allSettled(
          leagues.map(async (league) => {
            const standingsResult = await getLeagueStandings(league.id);
            const standings = standingsResult.success
              ? (standingsResult.data?.standings || standingsResult.data || [])
              : [];

            return {
              id: league.id,
              name: league.name,
              sport: league.sport,
              eventType: 'league',
              userRole: user?.role,
              seasonLabel: getSeasonLabel(league, 'Season'),
              completedAt: getEventDate(league)?.toISOString() || league.updatedAt || league.createdAt,
              placements: getPlacementRows(standings),
            };
          })
        );

        const tournamentCards = await Promise.allSettled(
          tournaments.map(async (tournament) => {
            const standingsResult = await getTournamentStandings(tournament.id);
            const standings = standingsResult.success ? (Array.isArray(standingsResult.data) ? standingsResult.data : []) : [];

            return {
              id: tournament.id,
              name: tournament.name,
              sport: tournament.sport,
              eventType: 'tournament',
              userRole: user?.role,
              seasonLabel: getSeasonLabel(tournament, 'Season'),
              completedAt: getEventDate(tournament)?.toISOString() || tournament.updatedAt || tournament.createdAt,
              placements: getPlacementRows(standings),
            };
          })
        );

        const normalizedLeagues = leagueCards.filter((result) => result.status === 'fulfilled').map((result) => result.value);
        const normalizedTournaments = tournamentCards.filter((result) => result.status === 'fulfilled').map((result) => result.value);

        normalizedLeagues.sort((left, right) => new Date(right.completedAt || 0) - new Date(left.completedAt || 0));
        normalizedTournaments.sort((left, right) => new Date(right.completedAt || 0) - new Date(left.completedAt || 0));

        setLeagueHonors(normalizedLeagues);
        setTournamentHonors(normalizedTournaments);
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load honors');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadHonors();

    return () => {
      isMounted = false;
    };
  }, [getLeagues, getTournamentStandings, getTournaments]);

  const combinedHonors = useMemo(() => {
    const source = [
      ...(activeType === 'all' || activeType === 'league' ? leagueHonors : []),
      ...(activeType === 'all' || activeType === 'tournament' ? tournamentHonors : []),
    ];

    return source.filter((event) => {
      if (activeSport === 'all') return true;
      return getSportKey(event.sport) === activeSport;
    });
  }, [activeSport, activeType, leagueHonors, tournamentHonors]);

  const groupedHonors = useMemo(() => {
    return combinedHonors.reduce((groups, event) => {
      const key = `${event.seasonLabel}__${getSportKey(event.sport)}`;
      if (!groups[key]) {
        groups[key] = {
          title: event.seasonLabel,
          sport: event.sport,
          events: [],
        };
      }
      groups[key].events.push(event);
      return groups;
    }, {});
  }, [combinedHonors]);

  const groupedList = Object.values(groupedHonors).sort((left, right) => left.title.localeCompare(right.title)).reverse();

  const completedCount = leagueHonors.length + tournamentHonors.length;
  const championCount = completedCount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFBF4] via-white to-[#F5F0E8] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#132F45] px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#BA995D] shadow-lg">
                <FaAward className="h-3.5 w-3.5" /> Honors Board
              </div>
              <h1 className="text-4xl font-black tracking-tight text-[#132F45]">Season Honors</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-[#132F45]/70">
                Completed leagues and tournaments with champions, runner-ups, and third-place finishes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#132F45] px-4 py-3 text-white shadow-lg">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#BA995D]">Completed Events</p>
                <p className="mt-1 text-2xl font-black">{completedCount}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-[#132F45]/10">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#132F45]/60">Champions</p>
                <p className="mt-1 text-2xl font-black text-[#132F45]">{championCount}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-[#132F45]/10 col-span-2 sm:col-span-1">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#132F45]/60">Logged in as</p>
                <p className="mt-1 truncate text-sm font-black text-[#132F45]">{user?.playerName || user?.organizationName || user?.name || 'User'}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-[#132F45]/10 bg-white p-4 shadow-lg shadow-[#132F45]/5">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#132F45]/60">
            <FaFilter className="h-3.5 w-3.5 text-[#BA995D]" />
            Filter by type
          </div>
          {[
            { key: 'all', label: 'All' },
            { key: 'league', label: 'Leagues' },
            { key: 'tournament', label: 'Tournaments' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveType(item.key)}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.2em] transition-all ${activeType === item.key ? 'bg-[#132F45] text-white shadow-lg' : 'bg-[#FFFBF4] text-[#132F45] hover:bg-[#132F45]/5'}`}
            >
              {item.label}
            </button>
          ))}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {sportOrder.map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => setActiveSport(sport)}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.2em] transition-all ${activeSport === sport ? 'bg-[#BA995D] text-white shadow-lg' : 'bg-[#FFFBF4] text-[#132F45] hover:bg-[#BA995D]/10'}`}
              >
                {sportLabelMap[sport]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-[2rem] border border-[#132F45]/10 bg-white shadow-xl shadow-[#132F45]/5">
            <div className="flex items-center gap-3 text-[#132F45]">
              <FaSpinner className="h-5 w-5 animate-spin text-[#BA995D]" />
              <span className="text-sm font-semibold uppercase tracking-[0.2em]">Loading honors</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-red-700 shadow-lg">
            <p className="text-sm font-bold uppercase tracking-[0.2em]">Unable to load honors</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : combinedHonors.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-[#132F45]/20 bg-white p-12 text-center shadow-xl shadow-[#132F45]/5">
            <FaTrophy className="mx-auto h-14 w-14 text-[#132F45]/20" />
            <h2 className="mt-4 text-xl font-black text-[#132F45]">No completed honors yet</h2>
            <p className="mt-2 text-sm text-[#132F45]/60">Completed leagues and tournaments will appear here once results are finalized.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeType}-${activeSport}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {groupedList.map((group) => (
                  <div key={group.title} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-black text-[#132F45]">{group.title}</h2>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#132F45]/45">
                          {group.events.length} completed {group.events.length === 1 ? 'event' : 'events'}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-5">
                      {group.events.map((event) => (
                        <EventCard key={event.eventType + event.id} event={event} />
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}