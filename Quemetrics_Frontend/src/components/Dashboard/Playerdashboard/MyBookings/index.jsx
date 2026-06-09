import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTrophy, FaClock, FaCheck, FaTimesCircle, FaCheckCircle,
  FaCalendarDay, FaUsers, FaTag, FaFilter, FaChevronDown,
  FaMedal, FaSpinner, FaBullseye, FaCircle, FaDice, FaArrowRight,
  FaShieldAlt, FaCalendarAlt
} from 'react-icons/fa';
import apiClient from '../../../../contexts/apiClient';
import Loader from '../../../../components/ui/Loader';

// ---------- IMAGE IMPORTS FOR GAME TABS ----------
import snookerIcon from '../../../../assets/snooker.png';
import poolIcon from '../../../../assets/pool.png';
import pookerIcon from '../../../../assets/pooker.png';

// ---------- HELPER FUNCTIONS ----------
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
  return new Date(dateString).toLocaleDateString('en-US', options);
};

const getStatusConfig = (status) => {
  if (!status) status = 'pending';
  const configs = {
    confirmed: {
      bg: 'bg-blue-50 text-blue-700 border-blue-100',
      dot: 'bg-blue-400',
      icon: <FaCheckCircle />,
      label: 'Confirmed',
    },
    pending: {
      bg: 'bg-amber-50 text-amber-700 border-amber-100',
      dot: 'bg-amber-400 animate-pulse',
      icon: <FaClock />,
      label: 'Pending',
    },
    rejected: {
      bg: 'bg-red-50 text-red-700 border-red-100',
      dot: 'bg-red-400',
      icon: <FaTimesCircle />,
      label: 'Rejected',
    },
    cancelled: {
      bg: 'bg-gray-50 text-gray-500 border-gray-100',
      dot: 'bg-gray-300',
      icon: <FaTimesCircle />,
      label: 'Cancelled',
    },
    completed: {
      bg: 'bg-[#FDF2D1] text-[#BA995D] border-[#BA995D]/20',
      dot: 'bg-[#BA995D]',
      icon: <FaTrophy />,
      label: 'Completed',
    },
  };
  return configs[status] || configs.pending;
};

const GAME_CONFIG = {
  snooker: { icon: snookerIcon, sport: FaBullseye, gradient: 'from-red-600 to-red-800', accentLight: 'bg-red-50 text-red-700' },
  pool:    { icon: poolIcon,    sport: FaCircle,    gradient: 'from-[#BA995D] to-[#8c7144]',  accentLight: 'bg-[#FDF2D1] text-[#BA995D]' },
  pooker:  { icon: pookerIcon,  sport: FaDice,      gradient: 'from-blue-600 to-blue-800',accentLight: 'bg-blue-50 text-blue-700' },
};

// ---------- MAIN COMPONENT ----------
const MyBookingPage = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const [gameStats, setGameStats] = useState({
    snooker: 0, pool: 0, pooker: 0, poker: 0,
    pendingSnooker: 0, pendingPool: 0, pendingPooker: 0, pendingPoker: 0,
  });
  const [statsLoaded, setStatsLoaded] = useState(false);

  const [selectedGame, setSelectedGame] = useState(null);
  const [activeTab, setActiveTab] = useState('leagues');
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalState, setModalState] = useState({ isOpen: false, title: '', message: '', requireInput: false, onConfirm: null, onCancel: null, inputValue: '' });

  useEffect(() => {
    loadBookings();
    loadGameStats();
  }, []);

  const loadGameStats = async () => {
    try {
      const response = await apiClient.get('/bookings/game-stats');
      if (response.data.success) {
        setGameStats(response.data.data);
        setStatsLoaded(true);
      }
    } catch (err) {
      console.error('Failed to load game stats:', err);
    }
  };

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/bookings/my-bookings');
      if (response.data.success) {
        const transformed = response.data.data.map((booking) => ({
          id: booking.id,
          title: booking.league?.name || booking.tournament?.name || booking.contextName || 'Unnamed',
          leagueName: booking.league?.name || booking.contextName || (booking.leagueId ? `League ${String(booking.leagueId).slice(0, 8)}` : null),
          tournamentName: booking.tournament?.name || booking.contextName || null,
          date: booking.bookingDate,
          status: booking.status,
          description: booking.notes || 'No description',
          gameType: booking.sport || 'snooker',
          bookingType: booking.bookingType || (booking.leagueId ? 'league' : (booking.tournamentId ? 'tournament' : 'league')),
          tournamentType: booking.tournament?.type || null,
          tableNumber: booking.tableName || `Table ${booking.tableNumber || 'N/A'}`,
          venueName: booking.venue?.venueName || 'Unknown Venue',
          startTime: booking.startTime,
          endTime: booking.endTime,
          opponentName: booking.opponentName || booking.displayOpponent?.name || booking.opponent?.name || 'TBD',
          isCreator: booking.isCreator,
          needsAction: booking.needsAction,
          fixtureId: booking.fixtureId,
          leagueId: booking.leagueId,
          sport: booking.sport,
          booking: booking,
        }));
        setBookings(transformed);
      }
    } catch (err) {
      console.error('Error loading bookings:', err);
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    setActiveTab('leagues');
    setSelectedLeague(null);
    setShowLeagueDropdown(false);
    setStatusFilter('all');
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedLeague(null);
    setShowLeagueDropdown(false);
    setStatusFilter('all');
  };

  const handleLeagueSelect = (leagueName) => {
    setSelectedLeague(leagueName);
    setShowLeagueDropdown(false);
  };

  const handleConfirmBooking = (bookingId) => {
    setModalState({
      isOpen: true,
      title: 'Confirm Booking',
      message: 'Are you sure you want to confirm this booking?',
      requireInput: false,
      inputValue: '',
      onConfirm: async () => {
        setModalState(s => ({ ...s, isOpen: false }));
        setActionLoadingId(bookingId);
        try {
          const response = await apiClient.put(`/bookings/${bookingId}/confirm`);
          if (response.data.success) { toast.success('Booking confirmed successfully!'); loadBookings(); }
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to confirm booking');
        } finally { setActionLoadingId(null); }
      },
      onCancel: () => setModalState(s => ({ ...s, isOpen: false }))
    });
  };

  const handleRejectBooking = (bookingId) => {
    setModalState({
      isOpen: true,
      title: 'Reject Booking',
      message: 'Please provide a reason for rejection (optional):',
      requireInput: true,
      inputValue: '',
      onConfirm: async (reason) => {
        setModalState(s => ({ ...s, isOpen: false }));
        setActionLoadingId(bookingId);
        try {
          const response = await apiClient.put(`/bookings/${bookingId}/reject`, { reason: reason || '' });
          if (response.data.success) { toast.success('Booking rejected successfully!'); loadBookings(); }
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to reject booking');
        } finally { setActionLoadingId(null); }
      },
      onCancel: () => setModalState(s => ({ ...s, isOpen: false }))
    });
  };

  const handleCancelBooking = (bookingId) => {
    setModalState({
      isOpen: true,
      title: 'Cancel Booking',
      message: 'Please provide a reason for cancellation:',
      requireInput: true,
      inputValue: '',
      onConfirm: async (reason) => {
        if (!reason) { toast.error('Reason is required for cancellation'); return; }
        setModalState(s => ({ ...s, isOpen: false }));
        setActionLoadingId(bookingId);
        try {
          const response = await apiClient.put(`/bookings/${bookingId}/cancel`, { reason });
          if (response.data.success) { toast.success('Booking cancelled successfully!'); loadBookings(); }
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to cancel booking');
        } finally { setActionLoadingId(null); }
      },
      onCancel: () => setModalState(s => ({ ...s, isOpen: false }))
    });
  };

  const getAvailableLeagues = () => {
    if (!selectedGame) return [];
    const leagueBookings = bookings.filter((b) => b.gameType === selectedGame && b.bookingType === 'league');
    return [...new Set(leagueBookings.map((b) => b.leagueName))].filter(Boolean);
  };

  const getFilteredBookings = () => {
    let filtered = bookings;
    if (selectedGame) filtered = filtered.filter((b) => b.gameType === selectedGame);
    if (activeTab === 'leagues') {
      filtered = filtered.filter((b) => b.bookingType === 'league');
      if (selectedLeague) filtered = filtered.filter((b) => b.leagueName === selectedLeague);
    } else if (activeTab === 'tournament') {
      filtered = filtered.filter((b) => b.bookingType === 'tournament');
    }
    if (statusFilter !== 'all') filtered = filtered.filter((b) => b.status === statusFilter);
    return filtered;
  };

  const filteredBookings = getFilteredBookings();
  const confirmedBookings  = filteredBookings.filter((b) => b.status === 'confirmed');
  const pendingBookings    = filteredBookings.filter((b) => b.status === 'pending');
  const rejectedBookings   = filteredBookings.filter((b) => b.status === 'rejected');
  const completedBookings  = filteredBookings.filter((b) => b.status === 'completed');
  const actionRequiredBookings = bookings.filter(
    (b) =>
      b.gameType === selectedGame &&
      b.bookingType === 'league' &&
      b.needsAction &&
      b.status === 'pending'
  );
  const availableLeagues = getAvailableLeagues();

  // Aggregate counts for hero
  const totalConfirmed = bookings.filter((b) => b.status === 'confirmed').length;
  const totalPending   = bookings.filter((b) => b.status === 'pending').length;
  const totalCompleted = bookings.filter((b) => b.status === 'completed').length;

  if (loading) return <Loader text="Loading Bookings..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative">
      {actionLoadingId && <Loader text="Processing request..." />}

            {/* ── Hero Header ──────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-4 md:py-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[24rem] h-[24rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-tr-[4rem] -ml-16 -mb-16 pointer-events-none" />
 
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <span className="text-[7.5px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-1.5 flex items-center gap-2.5"><span className="w-5 h-[1px] bg-[#BA995D] inline-block" /> Engagement History</span>
              <h1 className="text-[18px] md:text-[22px] font-black text-white uppercase tracking-tighter leading-none">
                My <span className="text-[#BA995D]">Bookings</span>
              </h1>
              <p className="text-white/30 font-black text-[7.5px] uppercase tracking-[0.2em] mt-2.5 max-w-sm leading-relaxed">
                Check and manage your match bookings.
              </p>
            </div>
 
            {/* Stats Strip */}
            <div className="grid grid-cols-3 gap-1 bg-white/5 border border-white/10 rounded-xl p-0.5 backdrop-blur-xl shadow-2xl">
              {[
                { label: 'Confirmed', value: totalConfirmed, color: 'text-emerald-400' },
                { label: 'Pending',   value: totalPending,   color: 'text-amber-400' },
                { label: 'Completed', value: totalCompleted, color: 'text-blue-400' },
              ].map((stat) => (
                <div key={stat.label} className="px-3 py-1 border-r border-white/5 last:border-0 flex flex-col items-center">
                  <span className={`text-sm font-black tracking-tighter ${stat.color}`}>{stat.value}</span>
                  <span className="text-[6px] font-black uppercase tracking-widest text-white/30 mt-0.5">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 md:py-8 flex flex-col gap-6">

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-6 py-4 rounded-3xl font-bold text-sm flex items-center gap-4">
            <FaTimesCircle className="text-red-400 flex-shrink-0" /> {error}
          </div>
        )}

        {/* ── Game Discipline Selector ─────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[8.5px] font-black text-[#132F45] uppercase tracking-[0.2em] flex items-center gap-3">
              <div className="w-1 h-3.5 bg-[#BA995D] rounded-full" /> Select Sport
            </h2>
            {selectedGame && (
              <button
                onClick={() => handleGameSelect(null)}
                className="text-[8px] font-black text-[#BA995D] uppercase tracking-widest hover:text-[#132F45] transition-colors flex items-center gap-1.5"
              >
                Clear <FaTimesCircle size={9} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {['snooker', 'pool', 'pooker'].map((game) => {
              const cfg = GAME_CONFIG[game];
              const sportKey = game.charAt(0).toUpperCase() + game.slice(1);
              const pendingCount = gameStats[`pending${sportKey}`] || 0;
              const isSelected = selectedGame === game;

              return (
                <motion.button
                  key={game}
                  onClick={() => handleGameSelect(game)}
                  whileHover={{ scale: 1.01, y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  className={`relative group rounded-xl overflow-hidden border-2 transition-all duration-500 text-left ${
                    isSelected
                      ? 'border-[#BA995D] shadow-[0_15px_40px_rgba(186,153,93,0.1)]'
                      : 'border-gray-100 bg-white shadow-lg shadow-[#132F45]/5 hover:border-[#FDF2D1] hover:shadow-xl hover:shadow-[#132F45]/10'
                  }`}
                >
                  <div className={`bg-gradient-to-br ${cfg.gradient} p-3.5 relative overflow-hidden`}>
                    <div className="absolute -right-2 -bottom-2 opacity-20">
                      <img src={cfg.icon} alt={game} className="w-14 h-14 object-contain" />
                    </div>
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-bl-full" />
                    <p className="text-[7px] font-black uppercase tracking-widest text-white/40 mb-1">Sport</p>
                    <h3 className="text-[16px] font-black text-white uppercase tracking-tighter capitalize">{game}</h3>

                    {statsLoaded && pendingCount > 0 && (
                      <div className="absolute top-2.5 right-2.5 bg-red-500 text-white text-[7.5px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white animate-bounce">
                        {pendingCount}
                      </div>
                    )}
                  </div>

                  <div className={`p-2.5 flex items-center justify-between transition-all duration-500 ${isSelected ? 'bg-[#132F45]' : 'bg-white'}`}>
                    <div>
                      <p className={`text-[7px] font-black uppercase tracking-widest ${isSelected ? 'text-[#BA995D]' : 'text-gray-400'}`}>
                        {bookings.filter(b => b.gameType === game).length} Records
                      </p>
                      <p className={`text-[10px] font-black uppercase tracking-tight mt-0.5 ${isSelected ? 'text-white' : 'text-[#132F45]'}`}>
                        {isSelected ? 'Selected' : 'Tap to filter'}
                      </p>
                    </div>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-500 ${
                      isSelected ? 'bg-[#BA995D] shadow-lg shadow-[#BA995D]/30' : 'bg-[#FAFAFA]'
                    }`}>
                      <FaArrowRight size={6} className={isSelected ? 'text-white' : 'text-gray-300'} />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
            {!selectedGame && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-16 text-center bg-white rounded-3xl border border-dashed border-[#FDF2D1] shadow-lg shadow-[#132F45]/5 flex flex-col items-center gap-5"
              >
                <div className="w-16 h-16 rounded-full bg-[#FDF2D1]/50 flex items-center justify-center">
                  <FaTrophy className="text-2xl text-[#BA995D]/30" />
                </div>
                <div>
                  <p className="text-[#132F45] font-black text-lg uppercase tracking-tight">Select Sport</p>
                  <p className="text-[#BA995D] font-black text-[9px] uppercase tracking-widest mt-1.5">to view scheduled engagements</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Content After Game Selection ─────────────────────────────── */}
        <AnimatePresence>
          {selectedGame && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col gap-12"
            >
              {/* ── Main Tabs ───────────────────────────────────────────── */}
              <div className="space-y-0">
                <div className="flex gap-0 border-b-2 border-[#FDF2D1] overflow-x-auto no-scrollbar">
                  {[
                    { id: 'leagues', label: 'Leagues', icon: FaTrophy },
                    { id: 'tournament', label: 'Tournament', icon: FaMedal },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      className={`relative px-4 py-2 font-black text-[8px] uppercase tracking-widest flex items-center gap-2 whitespace-nowrap transition-all duration-300 ${
                        activeTab === tab.id
                          ? 'text-[#132F45]'
                          : 'text-gray-400 hover:text-[#132F45] hover:bg-[#FAFAFA]'
                      }`}
                    >
                      <tab.icon size={9} className={activeTab === tab.id ? 'text-[#BA995D]' : 'text-gray-300'} />
                      <span className="mt-0.5">{tab.label}</span>
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#BA995D]"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Leagues Tab Content ─────────────────────────────────── */}
              {activeTab === 'leagues' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-10">

                  {/* Action Required Banner */}
                  {actionRequiredBookings.length > 0 && (
                    <div className="bg-[#132F45] rounded-xl p-5 md:p-6 relative overflow-hidden shadow-lg shadow-[#132F45]/10">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA995D]/10 rounded-bl-full -mr-8 -mt-8" />
                      <div className="flex items-center gap-2.5 mb-6 relative z-10">
                        <div className="w-8 h-8 rounded-lg bg-[#BA995D]/20 flex items-center justify-center">
                          <FaClock className="text-[#BA995D] animate-pulse" size={12} />
                        </div>
                        <div>
                          <h2 className="text-[10px] font-black text-white uppercase tracking-widest">Action Needed</h2>
                          <p className="text-[7px] font-black uppercase tracking-widest text-white/30">
                            {actionRequiredBookings.length} pending request{actionRequiredBookings.length > 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="ml-auto bg-[#BA995D] text-[#132F45] px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-[#BA995D]/20">
                          {actionRequiredBookings.length}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
                        {actionRequiredBookings.map((booking) => (
                          <BookingCard
                            key={booking.id}
                            booking={booking}
                            onConfirm={handleConfirmBooking}
                            onReject={handleRejectBooking}
                            onCancel={handleCancelBooking}
                            actionLoadingId={actionLoadingId}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* League Filter Dropdown */}
                  <div className="bg-white p-5 rounded-xl shadow-md border border-gray-50">
                    <div className="text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-4 flex items-center gap-2">
                      <div className="w-0.5 h-3 bg-[#BA995D] rounded-full" /> Filter by League
                    </div>

                    {availableLeagues.length === 0 ? (
                      <div className="py-10 text-center border-2 border-dashed border-[#FDF2D1] rounded-2xl flex flex-col items-center gap-4">
                        <FaTrophy className="text-2xl text-[#FDF2D1]" />
                        <p className="text-gray-400 font-black text-[9px] uppercase tracking-widest leading-relaxed">
                          No {selectedGame} matches found
                        </p>
                      </div>
                    ) : (
                      <div className="relative max-w-md">
                        <button
                          onClick={() => setShowLeagueDropdown(!showLeagueDropdown)}
                          className="w-full bg-[#FAFAFA] border-2 border-[#FDF2D1] rounded-xl px-4 py-2.5 flex items-center justify-between hover:border-[#BA995D]/40 transition-all font-black text-[#132F45] uppercase tracking-tight text-[11px] shadow-sm"
                        >
                          <span className="truncate">{selectedLeague || 'All Leagues'}</span>
                          <FaChevronDown
                            className={`transition-transform text-[#BA995D] ml-3 flex-shrink-0 ${showLeagueDropdown ? 'rotate-180' : ''}`}
                            size={8}
                          />
                        </button>

                        <AnimatePresence>
                          {showLeagueDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              className="absolute z-30 w-full mt-1.5 bg-white border border-[#FDF2D1] rounded-2xl shadow-2xl shadow-[#132F45]/10 overflow-hidden py-1.5"
                            >
                              <button
                                onClick={() => handleLeagueSelect(null)}
                                className="w-full px-5 py-3 text-left hover:bg-[#FDF2D1]/30 transition-colors font-black text-[#BA995D] border-b border-[#FDF2D1] uppercase text-[8px] tracking-widest"
                              >
                                — View All
                              </button>
                              {availableLeagues.map((league) => (
                                <button
                                  key={league}
                                  onClick={() => handleLeagueSelect(league)}
                                  className={`w-full px-5 py-3 text-left hover:bg-[#FDF2D1]/30 transition-colors font-black text-xs tracking-tight ${
                                    selectedLeague === league ? 'bg-[#132F45] text-white' : 'text-[#132F45]'
                                  }`}
                                >
                                  {league}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  {/* Main Booking Feed */}
                  <AnimatePresence>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-10">

                        {/* Filter Bar */}
                        <div className="bg-white border border-gray-50 rounded-xl shadow-md p-1 flex flex-col sm:flex-row items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2 text-[#132F45] font-black text-[8px] uppercase tracking-widest px-3">
                            <FaFilter className="text-[#BA995D]" size={8} /> Filter Bookings
                          </div>
                          <div className="flex flex-wrap gap-0.5 bg-[#FAFAFA] p-0.5 rounded-lg w-full sm:w-auto">
                            {[
                              { key: 'all',       label: 'All' },
                              { key: 'confirmed', label: 'Confirmed' },
                              { key: 'pending',   label: 'Pending' },
                              { key: 'completed', label: 'Played' },
                            ].map((option) => (
                              <button
                                key={option.key}
                                onClick={() => setStatusFilter(option.key)}
                                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                  statusFilter === option.key
                                    ? 'bg-[#132F45] text-white shadow-md'
                                    : 'text-gray-400 hover:text-[#132F45]'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Grouped Booking Lists */}
                        {[
                          { id: 'confirmed', data: confirmedBookings,  title: 'Confirmed',   icon: <FaCheckCircle className="text-blue-500" /> },
                          { id: 'pending',   data: pendingBookings,    title: 'Waiting',  icon: <FaClock className="text-amber-500" /> },
                          { id: 'completed', data: completedBookings,  title: 'Past Matches',          icon: <FaTrophy className="text-[#BA995D]" /> },
                          { id: 'rejected',  data: rejectedBookings,   title: 'Rescheduled',   icon: <FaTimesCircle className="text-red-500" /> },
                        ].map((group) =>
                          group.data.length > 0 && (statusFilter === 'all' || statusFilter === group.id) ? (
                            <div key={group.id} className="flex flex-col gap-4">
                              <div className="flex items-center gap-2.5 px-1">
                                <div className="w-6 h-6 rounded-lg bg-[#FAFAFA] border border-gray-50 flex items-center justify-center text-[9px]">
                                  {group.icon}
                                </div>
                                <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex-1">
                                  {group.title}
                                </h3>
                                <div className="h-[1px] flex-1 bg-[#FDF2D1]" />
                                <span className="bg-[#132F45] text-white px-2.5 py-0.5 rounded-full text-[8px] font-black shadow-sm">
                                  {group.data.length}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {group.data.map((booking) => (
                                  <BookingCard
                                    key={booking.id}
                                    booking={booking}
                                    onConfirm={handleConfirmBooking}
                                    onReject={handleRejectBooking}
                                    onCancel={handleCancelBooking}
                                    actionLoadingId={actionLoadingId}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null
                        )}

                        {filteredBookings.length === 0 && (
                          <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-[#FDF2D1] flex flex-col items-center gap-4">
                            <FaCalendarAlt className="text-2xl text-[#FDF2D1]" />
                            <p className="text-gray-400 font-black uppercase tracking-widest text-[8px]">
                              No {statusFilter !== 'all' ? statusFilter : ''} bookings found
                            </p>
                          </div>
                        )}
                      </motion.div>
                  </AnimatePresence>
                </motion.div>
              )}

               {/* ── Tournament Tab Content ─────────────────────────────────── */}
              {activeTab === 'tournament' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-10">
                  <div className="bg-white border border-gray-50 rounded-2xl shadow-lg shadow-[#132F45]/5 p-1.5 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 text-[#132F45] font-black text-[8.5px] uppercase tracking-widest px-4">
                      <FaFilter className="text-[#BA995D]" size={9} /> Filter Tournament Bookings
                    </div>
                    <div className="flex flex-wrap gap-1 bg-[#FAFAFA] p-1 rounded-xl w-full sm:w-auto">
                      {[
                        { key: 'all',       label: 'All' },
                        { key: 'confirmed', label: 'Confirmed' },
                        { key: 'pending',   label: 'Pending' },
                        { key: 'completed', label: 'Played' },
                      ].map((option) => (
                        <button
                          key={option.key}
                          onClick={() => setStatusFilter(option.key)}
                          className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[8.5px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                            statusFilter === option.key
                              ? 'bg-[#132F45] text-white shadow-lg shadow-[#132F45]/20'
                              : 'text-gray-400 hover:text-[#132F45]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {[
                    { id: 'confirmed', data: confirmedBookings,  title: 'Confirmed',   icon: <FaCheckCircle className="text-blue-500" /> },
                    { id: 'pending',   data: pendingBookings,    title: 'Waiting',     icon: <FaClock className="text-amber-500" /> },
                    { id: 'completed', data: completedBookings,  title: 'Past Matches', icon: <FaTrophy className="text-[#BA995D]" /> },
                    { id: 'rejected',  data: rejectedBookings,   title: 'Rescheduled', icon: <FaTimesCircle className="text-red-500" /> },
                  ].map((group) =>
                    group.data.length > 0 && (statusFilter === 'all' || statusFilter === group.id) ? (
                      <div key={group.id} className="flex flex-col gap-5">
                        <div className="flex items-center gap-3 px-1">
                          <div className="w-7 h-7 rounded-xl bg-[#FAFAFA] border border-gray-50 flex items-center justify-center text-[10px]">
                            {group.icon}
                          </div>
                          <h3 className="text-[9.5px] font-black text-gray-400 uppercase tracking-widest flex-1">
                            {group.title}
                          </h3>
                          <div className="h-[1px] flex-1 bg-[#FDF2D1]" />
                          <span className="bg-[#132F45] text-white px-3 py-1 rounded-full text-[8.5px] font-black shadow-sm">
                            {group.data.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          {group.data.map((booking) => (
                            <BookingCard
                              key={booking.id}
                              booking={booking}
                              onConfirm={handleConfirmBooking}
                              onReject={handleRejectBooking}
                              onCancel={handleCancelBooking}
                              actionLoadingId={actionLoadingId}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}

                  {filteredBookings.length === 0 && (
                    <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-[#FDF2D1] flex flex-col items-center gap-5">
                      <FaMedal className="text-3xl text-[#FDF2D1]" />
                      <p className="text-gray-400 font-black uppercase tracking-widest text-[9px]">
                        No {statusFilter !== 'all' ? statusFilter : ''} tournament bookings found
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Custom Modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalState.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#132F45]/60 backdrop-blur-sm"
              onClick={modalState.onCancel}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-100 z-10"
            >
              <h3 className="text-[18px] font-black text-[#132F45] uppercase tracking-tight mb-1.5">{modalState.title}</h3>
              <p className="text-[12px] font-bold text-gray-500 mb-5">{modalState.message}</p>
              
              {modalState.requireInput && (
                <div className="mb-5">
                  <input 
                    autoFocus
                    type="text" 
                    value={modalState.inputValue}
                    onChange={(e) => setModalState({ ...modalState, inputValue: e.target.value })}
                    className="w-full bg-[#FAFAFA] border-2 border-[#FDF2D1] rounded-xl px-4 py-2.5 font-black text-[11px] text-[#132F45] focus:outline-none focus:border-[#BA995D] focus:ring-4 focus:ring-[#BA995D]/10 transition-all"
                    placeholder="Enter reason..."
                  />
                </div>
              )}
              
              <div className="flex gap-2.5">
                <button
                  onClick={modalState.onCancel}
                  className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-100 text-gray-500 font-black uppercase text-[9px] tracking-widest hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => modalState.onConfirm(modalState.inputValue)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#132F45] text-white font-black uppercase text-[9px] tracking-widest shadow-lg shadow-[#132F45]/20 hover:bg-[#BA995D] transition-all"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------- BOOKING CARD ----------
const BookingCard = ({ booking, onConfirm, onReject, onCancel, actionLoadingId }) => {
  const statusConfig = getStatusConfig(booking.status);
  const isCreator    = booking.isCreator;
  const displayName  = booking.bookingType === 'tournament'
    ? (booking.tournamentName || 'Unnamed Tournament')
    : (booking.leagueName || 'Unnamed League');
  const isLoading    = actionLoadingId === booking.id;

  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(19,47,69,0.08)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="bg-white rounded-[2.5rem] border border-gray-50 overflow-hidden group shadow-xl shadow-[#132F45]/5 flex flex-col"
    >
      {/* Card Header */}
      <div className="p-5 flex-1">
        <div className="flex justify-between items-start mb-6 gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-black text-[#132F45] truncate leading-none uppercase tracking-tight mb-2.5 group-hover:text-[#BA995D] transition-colors duration-300">
              {displayName}
            </h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">
                {booking.bookingType === 'league' ? 'League Match' : 'Tournament Match'}
              </span>
            </div>
          </div>
          <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-[0.1em] border ${statusConfig.bg}`}>
            {React.cloneElement(statusConfig.icon, { size: 10 })}
            {statusConfig.label}
          </span>
        </div>

        {/* Info Rows */}
        <div className="space-y-2.5">
          <InfoRow icon={<FaCalendarDay />} label="Schedule" value={formatDate(booking.date)} />
          <InfoRow icon={<FaClock />} label="Time Slot" value={`${booking.startTime || 'TBD'} – ${booking.endTime || 'TBD'}`} />
          <InfoRow icon={<FaTag />} label="Location" value={`${booking.venueName || 'N/A'} · ${booking.tableNumber}`} />
          {booking.opponentName && booking.opponentName !== 'TBD' && (
            <div className="flex items-center gap-3 p-3.5 bg-[#132F45] rounded-xl shadow-lg shadow-[#132F45]/10 mt-1">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white flex-shrink-0">
                <FaUsers size={12} />
              </div>
              <div className="min-w-0">
                <p className="text-[7px] font-black text-white/30 uppercase tracking-widest mb-0.5">Opponent</p>
                <p className="text-[11px] font-black text-white truncate">{booking.opponentName}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-5 pb-5 pt-3.5 border-t border-gray-50 flex gap-2.5 flex-wrap">
        {!isCreator && booking.status === 'pending' && (
          <>
            <button
              onClick={() => onConfirm(booking.id)}
              disabled={isLoading}
              className={`flex-1 p-3 rounded-xl text-[8.5px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-100'
              }`}
            >
              {isLoading ? <FaSpinner className="animate-spin" /> : <FaCheck />} Accept
            </button>
            <button
              onClick={() => onReject(booking.id)}
              disabled={isLoading}
              className={`flex-1 p-3 rounded-xl text-[8.5px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border-2 border-red-400 text-red-500 hover:bg-red-50'
              }`}
            >
              {isLoading ? <FaSpinner className="animate-spin" /> : <FaTimesCircle />} Reject
            </button>
          </>
        )}

        {booking.status === 'confirmed' && (
          <button
            onClick={() => onCancel(booking.id)}
            disabled={isLoading}
            className={`w-full p-3 rounded-xl text-[8.5px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              isLoading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-500'
            }`}
          >
            <FaTimesCircle size={9} /> Cancel Match
          </button>
        )}

        {(booking.status === 'rejected' || booking.status === 'cancelled') && (
          <button
            onClick={() => {
              const url = `/player/bookingtable?fixtureId=${booking.fixtureId}&leagueId=${booking.leagueId}&sport=${booking.sport || 'snooker'}`;
              window.location.href = url;
            }}
            className="w-full bg-[#BA995D] hover:bg-[#132F45] text-white p-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-[#BA995D]/20 flex items-center justify-center gap-3"
          >
            <FaCalendarDay /> Reschedule
          </button>
        )}

        {isCreator && booking.status === 'pending' && (
          <button
            onClick={() => onCancel(booking.id)}
            disabled={isLoading}
            className={`w-full p-3 rounded-xl text-[8.5px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              isLoading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-[#FDF2D1] text-[#BA995D] hover:bg-[#BA995D] hover:text-white shadow-md'
            }`}
          >
            <FaTimesCircle size={9} /> Withdraw Request
          </button>
        )}
      </div>
    </motion.div>
  );
};

// ---------- INFO ROW ----------
const InfoRow = ({ icon, label, value }) => (
  <div className="flex items-center gap-2.5 p-2 bg-[#FAFAFA] rounded-xl border border-transparent hover:border-[#FDF2D1] transition-all group/row">
    <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-[#BA995D] flex-shrink-0 group-hover/row:scale-105 transition-transform">
      {React.cloneElement(icon, { size: 12 })}
    </div>
    <div className="min-w-0">
      <p className="text-[7px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mb-1">{label}</p>
      <p className="text-[11px] font-black text-[#132F45] truncate">{value}</p>
    </div>
  </div>
);

export default MyBookingPage;
