import { LeagueContext } from '../../../../contexts/LeagueContext';
import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../../../contexts/AuthContext';
import { PlayerContext } from '../../../../contexts/PlayerContext';
import LeagueDetails from './LeagueDetails';
import JoinByCodeModal from './JoinByCodeModal';
import { FaTrophy, FaSearch, FaUserCheck, FaChevronRight, FaInfoCircle, FaClock } from 'react-icons/fa';
import Loader from '../../../ui/Loader';

// ─── Small Toast component ───────────────────────────────────────────────────
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: 'bg-[#BA995D]',
    error: 'bg-red-600',
    info: 'bg-blue-600',
  };

  return (
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg text-white shadow-lg flex items-center gap-3 max-w-sm ${colors[type]}`}>
      <span className="flex-1 text-sm">{message}</span>
      <button onClick={onClose} className="text-white/80 hover:text-white font-bold text-lg leading-none">&times;</button>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    draft: 'bg-yellow-100 text-yellow-800',
    active: 'bg-blue-50 text-blue-800',
    completed: 'bg-amber-100 text-[#BA995D]',
    cancelled: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${map[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

// ─── Determine join button state ────────────────────────────────────────────
function getJoinState(league, alreadyJoined) {
  if (alreadyJoined) {
    return { canJoin: false, label: 'Enrolled', reason: null, variant: 'enrolled', showCodeOption: false };
  }
  if (league.visibility === 'invite') {
    return { canJoin: false, label: 'Invite Only', reason: 'Use the invite code provided by the organizer', variant: 'disabled', showCodeOption: true };
  }
  if (league.visibility === 'private') {
    return { canJoin: false, label: 'Private', reason: 'Contact the league organizer to be added', variant: 'closed', showCodeOption: false };
  }
  // Default joinAllowed to true for public leagues if missing
  const joinAllowed = (typeof league.joinAllowed === 'boolean') ? league.joinAllowed : (league.visibility === 'public' ? true : false);
  
  // Logic for Active Leagues: Prioritize lateJoinAllowed flag
  if (league.status === 'active') {
    if (!league.lateJoinAllowed) {
      const detail = league.leagueType === 'fixed'
        ? 'Fixed league – fixtures are locked and late joining is not allowed.'
        : 'Late joining is currently disabled for this league.';
      return { canJoin: false, label: 'Late Join Off', reason: detail, variant: 'disabled', showCodeOption: false };
    }
    // If lateJoinAllowed is true, it proceeds to return { canJoin: true ... } below
  } else if (!joinAllowed) {
    // For non-active leagues (draft, registration_open), respect joinAllowed
    return { canJoin: false, label: 'Joining Closed', reason: 'The admin has disabled joining for this league.', variant: 'closed', showCodeOption: false };
  }

  if ((league.status === 'completed' || league.status === 'cancelled')) {
    return { canJoin: false, label: 'League Ended', reason: 'This league has already finished.', variant: 'closed', showCodeOption: false };
  }
  return { canJoin: true, label: 'Join League', reason: null, variant: 'active', showCodeOption: false };
}

// ─── Individual league card ───────────────────────────────────────────────────
function LeagueCard({ league, joinedIds, onJoin, onView, joining, onCodeRequest }) {
  const alreadyJoined = joinedIds.has(league.id);
  const { canJoin, label, reason, variant, showCodeOption } = getJoinState(league, alreadyJoined);

  const btnStyles = {
    active: 'bg-[#BA995D] hover:bg-[#A68952] text-white shadow-xl shadow-[#BA995D]/20',
    enrolled: 'bg-[#FDF2D1] text-[#BA995D] border border-[#BA995D]/20 cursor-default',
    closed: 'bg-gray-100 text-gray-400 cursor-not-allowed',
    disabled: 'bg-yellow-50 text-yellow-700 cursor-not-allowed',
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/5 border border-gray-50 p-5 flex flex-col gap-4 hover:shadow-[#132F45]/15 hover:-translate-y-1 transition-all duration-500 group cursor-pointer outline outline-1 outline-[#FDF2D1]"
      onClick={() => onView(league.id)}
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-3">
        <div className="space-y-0.5 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
             <span className="text-[7.5px] font-black text-[#BA995D] uppercase tracking-widest">{league.sport}</span>
             <div className="w-0.5 h-0.5 bg-gray-200 rounded-full" />
             <StatusBadge status={league.status} />
          </div>
          <h3 className="font-black text-[#132F45] text-sm leading-tight group-hover:text-[#BA995D] transition-colors uppercase tracking-tight">{league.name}</h3>
        </div>
        <div className="w-8 h-8 bg-[#FAFAFA] rounded-xl flex items-center justify-center text-[#132F45] group-hover:bg-[#132F45] group-hover:text-white transition-all">
           <FaTrophy className={`text-[10px] ${alreadyJoined ? 'text-[#BA995D]' : ''}`} />
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-3 flex-1">
        <div className="grid grid-cols-2 gap-2 bg-[#FAFAFA] p-2.5 rounded-xl border border-gray-50">
          <div className="space-y-0.5">
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block">Venue</span>
            <p className="text-[9.5px] font-black text-[#132F45] truncate">{league.venue?.name || league.venue || 'TBD'}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block">Players</span>
            <p className="text-[9.5px] font-black text-[#132F45]">{league.playersCount ?? 0} / <span className="text-[#BA995D]">{league.maxPlayers || '∞'}</span></p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${league.leagueType === 'rolling' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
            {league.leagueType === 'rolling' ? 'Rolling' : 'Fixed'}
          </span>
          {league.lateJoinAllowed && (
            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1">
              <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" /> Late Join
            </span>
          )}
        </div>

        {/* Reason tooltip if can't join */}
        {reason && !alreadyJoined && (
          <div className="flex items-start gap-2.5 p-3 bg-amber-50/50 rounded-xl border border-amber-100/50">
            <FaInfoCircle className="text-amber-500 mt-0.5 shrink-0" size={12} />
            <p className="text-[8.5px] font-bold text-amber-700 leading-relaxed uppercase tracking-tight">{reason}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 pt-2.5 border-t border-gray-50">
        {!alreadyJoined && canJoin && (
          <button
            onClick={(e) => { e.stopPropagation(); onJoin(league.id); }}
            disabled={joining === league.id}
            className={`w-full py-2.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all shadow-md ${btnStyles[variant] || 'bg-red-600 text-white'}`}
          >
            {joining === league.id ? 'Joining…' : 'Join League'}
          </button>
        )}

        {showCodeOption && !alreadyJoined && (
          <button
            onClick={(e) => { e.stopPropagation(); onCodeRequest?.(league.id); }}
            disabled={joining === league.id}
            className="w-full py-2.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all bg-[#FDF2D1] text-[#BA995D] hover:bg-[#BA995D] hover:text-white border border-[#BA995D]/20 shadow-md"
          >
            {joining === league.id ? 'Joining…' : 'Enter Invite Code'}
          </button>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onView(league.id); }}
          className={`w-full py-2.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${alreadyJoined ? 'bg-[#132F45] text-white shadow-lg hover:scale-[1.01]' : 'text-[#132F45] hover:bg-[#FAFAFA]'}`}
        >
          {alreadyJoined ? (
            <><FaTrophy className="mb-0.5 text-[#BA995D] text-[10px]" /> View Results</>
          ) : (
            'View Details'
          )}
          <FaChevronRight size={7} className={alreadyJoined ? 'text-[#BA995D]' : 'text-gray-300'} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Player League Page ──────────────────────────────────────────────────
export default function PlayerLeaguePage() {
  const [searchParams] = useSearchParams();
    const [games, setGames] = useState([]);
    const [selectedGameId, setSelectedGameId] = useState(null);
  const { getPublicLeagues, joinLeague, getLeagues, joinByCode, getAvailableGames, getLeaguesByGame, getLeagueById } = useContext(LeagueContext);
  const { user } = useContext(AuthContext);
  const { player, getProfile } = useContext(PlayerContext);

  const [allLeagues, setAllLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [pendingLeagues, setPendingLeagues] = useState([]);
  const [activeTab, setActiveTab] = useState('discover');
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [joining, setJoining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [selectedLeagueForCode, setSelectedLeagueForCode] = useState(null);
  const leagueIdFromUrl = searchParams.get('leagueId');
  const [urlLeague, setUrlLeague] = useState(null);

  // Cache for league data to avoid unnecessary refetches
  const leagueCache = useRef(new Map());
  const gameSelectionTimeoutRef = useRef(null);

  // Fetch games on mount (only once)
  useEffect(() => {
    const fetchGames = async () => {
      try {
        const data = await getAvailableGames();
        console.log('Available games:', data.data);
        setGames(data.data || []);
        // Auto-select first game only when we are not deep-linking into a specific league.
        if (!leagueIdFromUrl && data.data && data.data.length > 0) {
          setSelectedGameId(data.data[0].id);
        } else {
          setSelectedGameId(null);
        }
      } catch (e) {
        showToast('Failed to fetch games', 'error');
        setGames([]);
        setSelectedGameId(null);
      }
    };
    fetchGames();
  }, [getAvailableGames, leagueIdFromUrl]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // Debounced fetch to avoid multiple calls when game changes rapidly
  const fetchLeagues = useCallback(async (gameId) => {
    // Clear existing timeout
    if (gameSelectionTimeoutRef.current) {
      clearTimeout(gameSelectionTimeoutRef.current);
    }

    // Check cache first
    const cacheKey = `game-${gameId}`;
    if (leagueCache.current.has(cacheKey)) {
      console.log('[League] Using cached data for game:', gameId);
      const cached = leagueCache.current.get(cacheKey);
      setAllLeagues(cached.allLeagues);
      setMyLeagues(cached.myLeagues);
      setPendingLeagues(cached.pendingLeagues);
      setLoading(false);
      return;
    }

    // Debounce the actual fetch by 300ms to avoid rapid refetches
    gameSelectionTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        let currentPlayer = player;
        if (!currentPlayer?.id) {
          const profileResult = await getProfile();
          if (profileResult.success) {
            currentPlayer = profileResult.data;
          } else {
            showToast('Failed to load player profile', 'error');
            setLoading(false);
            return;
          }
        }

        // Fetch both in parallel to reduce total load time
        const [myResult, discoverResult] = await Promise.all([
          getLeaguesByGame(gameId, false),
          getLeaguesByGame(gameId, true)
        ]);

        const myLeaguesData = myResult.data || [];
        const discoverData = discoverResult.data || [];

        // Split into approved and pending
        const approved = [];
        const pending = [];

        myLeaguesData.forEach(league => {
          const playerInLeague = league.leaguePlayers?.find(lp => lp.playerId === currentPlayer.id);
          if (playerInLeague?.approvalStatus === 'pending') {
            pending.push(league);
          } else {
            approved.push(league);
          }
        });

        setMyLeagues(approved);
        setPendingLeagues(pending);

        // Filter out leagues player is already member of
        const myLeagueIds = new Set(myLeaguesData.map(l => l.id));
        const filteredDiscover = discoverData.filter(l => !myLeagueIds.has(l.id));
        setAllLeagues(filteredDiscover);

        // Cache the results
        leagueCache.current.set(cacheKey, {
          allLeagues: filteredDiscover,
          myLeagues: approved,
          pendingLeagues: pending
        });

      } catch (e) {
        showToast('Failed to load leagues', 'error');
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [player, getProfile, showToast]);

  // Fetch leagues when selected game changes
  useEffect(() => {
    if (user?.id && selectedGameId) {
      fetchLeagues(selectedGameId);
    }
  }, [user?.id, selectedGameId, fetchLeagues]);

  useEffect(() => {
    if (!leagueIdFromUrl) return;

    const loadLinkedLeague = async () => {
      const leagueResult = await getLeagueById(leagueIdFromUrl);
      if (!leagueResult.success || !leagueResult.data) return;

      const league = leagueResult.data;
      setUrlLeague(league);
      setSelectedLeagueId(league.id);

      const directGameId = league.gameId || league.game?.id || league.season?.gameId || league.season?.game?.id || null;
      if (directGameId) {
        setSelectedGameId(String(directGameId));
        return;
      }

      const leagueSport = String(league.sport || league.gameName || league.season?.gameName || '').toLowerCase();
      const matchingGame = games.find((game) => {
        const gameName = String(game.name || game.gameName || '').toLowerCase();
        return gameName === leagueSport || gameName.includes(leagueSport) || leagueSport.includes(gameName);
      });

      if (matchingGame) {
        setSelectedGameId(String(matchingGame.id));
      }
    };

    loadLinkedLeague();
  }, [leagueIdFromUrl, getLeagueById, games]);

  useEffect(() => {
    if (!leagueIdFromUrl || !urlLeague || selectedGameId) return;

    const directGameId = urlLeague.gameId || urlLeague.game?.id || urlLeague.season?.gameId || urlLeague.season?.game?.id || null;
    if (directGameId) {
      setSelectedGameId(String(directGameId));
      return;
    }

    const leagueSport = String(urlLeague.sport || urlLeague.gameName || urlLeague.season?.gameName || '').toLowerCase();
    const matchingGame = games.find((game) => {
      const gameName = String(game.name || game.gameName || '').toLowerCase();
      return gameName === leagueSport || gameName.includes(leagueSport) || leagueSport.includes(gameName);
    });

    if (matchingGame) {
      setSelectedGameId(String(matchingGame.id));
    }
  }, [leagueIdFromUrl, urlLeague, games, selectedGameId]);

  const handleJoin = async (leagueId) => {
    setJoining(leagueId);
    const result = await joinLeague(leagueId);
    setJoining(null);

    if (result.success) {
      showToast(result.message || 'Successfully joined!', 'success');
      // Clear cache so we refetch with updated data
      leagueCache.current.clear();
      fetchLeagues(selectedGameId);
      // Trigger refresh in other components that might be showing league data
      window.dispatchEvent(new CustomEvent('leagueDataChanged', {
        detail: { leagueId, action: 'playerJoined' }
      }));
    } else {
      showToast(result.error || 'Failed to join league', 'error');
    }
  };

  const handleJoinWithCode = async (code) => {
    // If we have a specific leagueId, use the standard joinLeague with code
    if (selectedLeagueForCode) {
      setJoining(selectedLeagueForCode);
      const result = await joinLeague(selectedLeagueForCode, { joinCode: code });
      setJoining(null);

      if (result.success) {
        showToast(result.message || 'Successfully joined with code!', 'success');
        setCodeModalOpen(false);
        setSelectedLeagueForCode(null);
        leagueCache.current.clear();
        fetchLeagues(selectedGameId);
        window.dispatchEvent(new CustomEvent('leagueDataChanged', {
          detail: { leagueId: selectedLeagueForCode, action: 'playerJoined' }
        }));
      } else {
        showToast(result.error || 'Failed to join league', 'error');
      }
    } else {
      // Global join with just code (no leagueId known)
      setJoining('global');
      const result = await joinByCode(code);
      setJoining(null);

      if (result.success) {
        showToast(result.message || 'Successfully joined via code!', 'success');
        setCodeModalOpen(false);
        leagueCache.current.clear();
        fetchLeagues(selectedGameId);
        window.dispatchEvent(new CustomEvent('leagueDataChanged', {
          detail: { action: 'playerJoined' }
        }));
      } else {
        showToast(result.error || 'Invalid or expired invite code', 'error');
      }
    }
  };

  const handleOpenCodeModal = (leagueId = null) => {
    setSelectedLeagueForCode(leagueId);
    setCodeModalOpen(true);
  };

  const joinedIds = new Set(myLeagues.map(l => l.id));

  // Find the selected league object from either myLeagues or allLeagues
  const selectedLeague = myLeagues.find(l => l.id === selectedLeagueId) ||
                         allLeagues.find(l => l.id === selectedLeagueId);

  if (selectedLeagueId) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <LeagueDetails
            leagueId={selectedLeagueId}
            initialLeague={selectedLeague}
            onBack={() => {
              setSelectedLeagueId(null);
              // Don't refetch - use cached data if available
            }}
          />
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
      </div>
    );
  }

  if (loading) return <Loader text="Loading Leagues..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative">
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}

      {/* Hero Header */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#BA995D]/5 rounded-bl-[30rem] -mr-24 -mt-24"></div>
        <div className="max-w-6xl mx-auto relative z-10 text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-black text-white mb-2 uppercase tracking-tighter">
            Match <span className="text-[#BA995D]">Leagues</span>
          </h1>
          <p className="text-[#FDF2D1] font-black text-[7.5px] uppercase tracking-[0.2em] max-w-xl mx-auto md:mx-0 leading-relaxed opacity-80">
            Find and join leagues at your local clubs.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-8 relative z-20 pb-16">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
          <div className="flex bg-white p-1.5 rounded-2xl shadow-xl shadow-[#132F45]/10 border border-gray-50 overflow-x-auto no-scrollbar outline outline-1 outline-[#FDF2D1]">
            <button
              onClick={() => setActiveTab('discover')}
              className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'discover' ? 'bg-[#132F45] text-white shadow-lg' : 'text-gray-400 hover:text-[#132F45]'}`}
            >
              <FaSearch className={`text-xs ${activeTab === 'discover' ? 'text-[#BA995D]' : ''}`} /> Find Leagues
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'my' ? 'bg-[#132F45] text-white shadow-lg' : 'text-gray-400 hover:text-[#132F45]'}`}
            >
              <FaUserCheck className={`text-xs ${activeTab === 'my' ? 'text-[#BA995D]' : ''}`} /> My Leagues
              {myLeagues.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${activeTab === 'my' ? 'bg-[#BA995D] text-[#132F45]' : 'bg-gray-100 text-gray-500'}`}>
                  {myLeagues.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'pending' ? 'bg-[#132F45] text-white shadow-lg' : 'text-gray-400 hover:text-[#132F45]'}`}
            >
              <FaClock className={`text-xs ${activeTab === 'pending' ? 'text-[#BA995D]' : ''}`} /> Waiting
              {pendingLeagues.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${activeTab === 'pending' ? 'bg-amber-400 text-[#132F45]' : 'bg-gray-100 text-gray-500'}`}>
                  {pendingLeagues.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative w-full sm:w-48 group">
               <label className="absolute -top-4 left-0 text-[7px] font-black text-gray-400 uppercase tracking-widest">Sport</label>
               <select
                 className="w-full bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-lg shadow-[#132F45]/5 font-black text-[#132F45] text-[8.5px] uppercase tracking-widest appearance-none outline-none focus:ring-2 focus:ring-[#132F45]/10"
                 value={selectedGameId || ''}
                 onChange={e => setSelectedGameId(e.target.value)}
                 disabled={games.length === 0}
               >
                 <option value="" disabled>Select Sport...</option>
                 {games.map(game => (
                   <option key={game.id} value={game.id}>{game.name}</option>
                 ))}
               </select>
               <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#BA995D]">
                  <FaChevronRight className="rotate-90 text-[7px]" />
               </div>
            </div>

            <button
              onClick={() => handleOpenCodeModal(null)}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#132F45] text-white rounded-xl font-black text-[8.5px] uppercase tracking-widest hover:bg-[#1c4566] transition-all shadow-lg shadow-[#132F45]/20 flex items-center justify-center gap-2"
            >
              <FaSearch size={9} className="text-[#BA995D]" /> Invite Code
            </button>
          </div>
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeTab === 'discover' ? (
              allLeagues.length === 0 ? (
                <EmptyState icon={<FaTrophy className="text-gray-200" />} title="No Leagues Available" subtitle="Check back later for new competitions in this sport." />
              ) : (
                allLeagues.map((league) => (
                  <LeagueCard
                    key={league.id}
                    league={league}
                    joinedIds={joinedIds}
                    onJoin={handleJoin}
                    onView={setSelectedLeagueId}
                    onCodeRequest={handleOpenCodeModal}
                    joining={joining}
                  />
                ))
              )
            ) : activeTab === 'my' ? (
              myLeagues.length === 0 ? (
                <EmptyState icon={<FaUserCheck className="text-gray-200" />} title="No Enrolled Leagues" subtitle="Your active competitions will appear here once joined." />
              ) : (
                myLeagues.map((league) => (
                  <LeagueCard
                    key={league.id}
                    league={league}
                    joinedIds={joinedIds}
                    onJoin={handleJoin}
                    onView={setSelectedLeagueId}
                    onCodeRequest={handleOpenCodeModal}
                    joining={joining}
                  />
                ))
              )
            ) : (
              // Pending Approval tab
              pendingLeagues.length === 0 ? (
                <EmptyState icon={<FaClock className="text-gray-200" />} title="No Pending Requests" subtitle="Your join requests awaiting approval will appear here." />
              ) : (
                pendingLeagues.map((league) => (
                  <div key={league.id} className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/5 border-2 border-amber-100 p-5 flex flex-col gap-4 relative overflow-hidden outline outline-1 outline-[#FDF2D1]">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full -mr-8 -mt-8"></div>
                    <div className="flex justify-between items-start relative z-10">
                      <div className="space-y-0.5">
                        <h3 className="font-black text-base text-[#132F45] uppercase tracking-tight">{league.name}</h3>
                        <div className="flex items-center gap-2">
                           <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 flex items-center gap-1">
                             <FaClock className="animate-pulse" /> Awaiting Approval
                           </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-[#132F45] font-bold leading-relaxed opacity-70">
                      Your request has been submitted to the admin. You'll be notified via your dashboard once approved.
                    </p>
                    <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                       <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{league.sport}</span>
                       <button onClick={() => setSelectedLeagueId(league.id)} className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline">View Preview</button>
                    </div>
                  </div>
                ))
              )
            )}
          </div>

        {/* Join by Code Modal */}
        <JoinByCodeModal
          isOpen={codeModalOpen}
          onClose={() => {
            setCodeModalOpen(false);
            setSelectedLeagueForCode(null);
          }}
          onJoin={handleJoinWithCode}
          joining={!!joining}
        />
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-gray-50 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1] flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-24 h-24 bg-[#FAFAFA] rounded-br-[10rem]"></div>
      <div className="text-5xl mb-6 opacity-40 grayscale group-hover:grayscale-0 transition-all duration-700 relative z-10">{icon}</div>
      <h3 className="text-lg font-black text-[#132F45] mb-2 uppercase tracking-tight relative z-10">{title}</h3>
      <p className="text-gray-400 font-bold text-[10px] max-w-sm leading-relaxed relative z-10 uppercase tracking-widest">{subtitle}</p>
    </div>
  );
}
