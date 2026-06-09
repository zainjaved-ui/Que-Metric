import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import JoinCodeModal from '../../components/Tournament/JoinCodeModal';
import TournamentMatchesModal from '../../components/Tournaments/TournamentMatchesModal';
import Loader from '../../components/ui/Loader';
import { isRegistrationOpenUTC } from '../../lib/utils/registrationWindow';
import {
  FaTrophy,
  FaSearch,
  FaUserCheck,
  FaChevronRight,
  FaInfoCircle,
  FaClock,
} from 'react-icons/fa';

const BASE_SPORTS = ['snooker', 'pool', 'pooker'];

function normalizeSport(value) {
  return String(value || '').trim().toLowerCase();
}

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timeout = setTimeout(onClose, 4000);
    return () => clearTimeout(timeout);
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

function StatusBadge({ status }) {
  const key = String(status || 'registration').toLowerCase();
  const map = {
    draft: 'bg-yellow-100 text-yellow-800',
    registration: 'bg-blue-50 text-blue-800',
    registration_closed: 'bg-amber-100 text-amber-800',
    fixtures_generated: 'bg-teal-100 text-teal-800',
    in_progress: 'bg-green-100 text-green-800',
    completed: 'bg-[#FDF2D1] text-[#BA995D]',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${map[key] || 'bg-gray-100 text-gray-700'}`}>
      {key.replace(/_/g, ' ')}
    </span>
  );
}

function getJoinState(tournament, alreadyJoined) {
  if (alreadyJoined) {
    return { canJoin: false, reason: null, variant: 'enrolled', showCodeOption: false };
  }

  const visibility = String(tournament.visibility || 'public').toLowerCase();
  if (visibility === 'invite') {
    return {
      canJoin: false,
      reason: 'Use the invite code provided by the organizer',
      variant: 'disabled',
      showCodeOption: true,
    };
  }

  if (visibility === 'private') {
    return {
      canJoin: false,
      reason: 'This tournament is private. Contact organizer for access.',
      variant: 'closed',
      showCodeOption: false,
    };
  }

  const status = String(tournament.status || '').toLowerCase();
  const isFull = tournament.maxParticipants
    ? (Number(tournament.currentParticipantCount || 0) >= Number(tournament.maxParticipants || 0))
    : false;

  if (isFull) {
    return {
      canJoin: false,
      reason: 'Tournament is full. No slots are currently available.',
      variant: 'closed',
      showCodeOption: false,
    };
  }

  if (!isRegistrationOpenUTC(tournament)) {
    return {
      canJoin: false,
      reason: 'Registration window is closed for this tournament.',
      variant: 'closed',
      showCodeOption: false,
    };
  }

  if (!['registration', 'registration_closed'].includes(status)) {
    return {
      canJoin: false,
      reason: 'Tournament is not accepting new participants.',
      variant: 'closed',
      showCodeOption: false,
    };
  }

  return { canJoin: true, reason: null, variant: 'active', showCodeOption: false };
}

function TournamentCard({
  tournament,
  participationStatus,
  alreadyJoined,
  onJoin,
  onView,
  onViewHistory,
  onCodeRequest,
  joining,
  viewLabel,
}) {
  const { canJoin, reason, variant, showCodeOption } = getJoinState(tournament, alreadyJoined);

  const btnStyles = {
    active: 'bg-[#BA995D] hover:bg-[#A68952] text-white shadow-xl shadow-[#BA995D]/20',
    enrolled: 'bg-[#FDF2D1] text-[#BA995D] border border-[#BA995D]/20 cursor-default',
    closed: 'bg-gray-100 text-gray-400 cursor-not-allowed',
    disabled: 'bg-yellow-50 text-yellow-700 cursor-not-allowed',
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/5 border border-gray-50 p-5 flex flex-col gap-4 hover:shadow-[#132F45]/15 hover:-translate-y-1 transition-all duration-500 group cursor-pointer outline-[#FDF2D1] outline"
      onClick={onView}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="space-y-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-[7.5px] font-black text-[#BA995D] uppercase tracking-widest">{tournament.sport || 'N/A'}</span>
            <div className="w-0.5 h-0.5 bg-gray-200 rounded-full" />
            <StatusBadge status={tournament.status} />
            {participationStatus === 'pending' && (
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-100">
                Waiting
              </span>
            )}
          </div>
          <h3 className="font-black text-[#132F45] text-sm leading-tight group-hover:text-[#BA995D] transition-colors uppercase tracking-tight truncate">{tournament.name}</h3>
        </div>
        <div className="w-8 h-8 bg-[#FAFAFA] rounded-xl flex items-center justify-center text-[#132F45] group-hover:bg-[#132F45] group-hover:text-white transition-all shrink-0">
          <FaTrophy className={`text-[10px] ${alreadyJoined ? 'text-[#BA995D]' : ''}`} />
        </div>
      </div>

      <div className="space-y-3 flex-1">
        <div className="grid grid-cols-2 gap-2 bg-[#FAFAFA] p-2.5 rounded-xl border border-gray-50">
          <div className="space-y-0.5">
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block">Organizer</span>
            <p className="text-[9.5px] font-black text-[#132F45] truncate">{tournament.organization?.organizationName || tournament.organizer?.organizationName || 'TBD'}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest block">Players</span>
            <p className="text-[9.5px] font-black text-[#132F45]">{tournament.currentParticipantCount ?? 0} / <span className="text-[#BA995D]">{tournament.maxParticipants || '∞'}</span></p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {!!tournament.tier && (
            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border bg-blue-50 text-blue-700 border-blue-100">
              {tournament.tier}
            </span>
          )}
          {tournament.ranked && (
            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-[#FDF2D1] text-[#BA995D] border border-[#BA995D]/20">
              Ranked
            </span>
          )}
        </div>

        {reason && !alreadyJoined && (
          <div className="flex items-start gap-2.5 p-3 bg-amber-50/50 rounded-xl border border-amber-100/50">
            <FaInfoCircle className="text-amber-500 mt-0.5 shrink-0" size={12} />
            <p className="text-[8.5px] font-bold text-amber-700 leading-relaxed uppercase tracking-tight">{reason}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 pt-2.5 border-t border-gray-50">
        {!alreadyJoined && canJoin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJoin();
            }}
            disabled={joining}
            className={`w-full py-2.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all shadow-md ${btnStyles[variant] || 'bg-red-600 text-white'}`}
          >
            Register Tournament
          </button>
        )}

        {showCodeOption && !alreadyJoined && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCodeRequest?.();
            }}
            disabled={joining}
            className="w-full py-2.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all bg-[#FDF2D1] text-[#BA995D] hover:bg-[#BA995D] hover:text-white border border-[#BA995D]/20 shadow-md"
          >
            Enter Invite Code
          </button>
        )}

        {alreadyJoined ? (
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
              className="flex-1 py-2.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all bg-[#132F45] text-white shadow-lg hover:scale-[1.01] flex items-center justify-center gap-2"
            >
              View Results
              <FaChevronRight size={7} className="text-[#BA995D]" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewHistory?.();
              }}
              className="flex-1 py-2.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all border-2 border-[#132F45] text-[#132F45] hover:bg-[#132F45] hover:text-white shadow-md flex items-center justify-center gap-2"
            >
              View History
              <FaChevronRight size={7} />
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="w-full py-2.5 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 text-[#132F45] hover:bg-[#FAFAFA]"
          >
            {viewLabel || 'View Details'}
            <FaChevronRight size={7} className="text-gray-300" />
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-gray-50 shadow-xl shadow-[#132F45]/5 outline-[#FDF2D1] outline flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-24 h-24 bg-[#FAFAFA] rounded-br-[10rem]" />
      <div className="text-5xl mb-6 opacity-40 grayscale relative z-10">{icon}</div>
      <h3 className="text-lg font-black text-[#132F45] mb-2 uppercase tracking-tight relative z-10">{title}</h3>
      <p className="text-gray-400 font-bold text-[10px] max-w-sm leading-relaxed relative z-10 uppercase tracking-widest">{subtitle}</p>
    </div>
  );
}

export default function AllTournamentsPage() {
  const navigate = useNavigate();
  const [selectedSport, setSelectedSport] = useState(BASE_SPORTS[0]);
  const [discoverTournaments, setDiscoverTournaments] = useState([]);
  const [myTournaments, setMyTournaments] = useState([]);
  const [pendingTournaments, setPendingTournaments] = useState([]);
  const [activeTab, setActiveTab] = useState('discover');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [matchesModalOpen, setMatchesModalOpen] = useState(false);
  const [selectedTournamentForMatches, setSelectedTournamentForMatches] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const timestamp = Date.now();
      const discoverParams = new URLSearchParams({
        limit: '120',
        offset: '0',
        status: 'registration',
        _t: String(timestamp),
      });

      if (selectedSport) discoverParams.append('sport', selectedSport);

      const [mineResponse, discoverResponse] = await Promise.all([
        apiClient.get(`/player/tournaments?_t=${timestamp}`),
        apiClient.get(`/tournaments/discover?${discoverParams.toString()}`),
      ]);

      const mineRows = Array.isArray(mineResponse.data?.data) ? mineResponse.data.data : [];
      const discoverRows = Array.isArray(discoverResponse.data?.data) ? discoverResponse.data.data : [];

      const approved = mineRows.filter((row) => String(row?.status || '').toLowerCase() === 'approved');
      const pending = mineRows.filter((row) => String(row?.status || '').toLowerCase() === 'pending');

      const joinedIds = new Set(mineRows.map((row) => row?.tournament?.id).filter(Boolean));

      const visibleDiscover = discoverRows.filter((row) => {
        const sport = normalizeSport(row?.sport);
        const visibility = String(row?.visibility || 'public').toLowerCase();
        if (joinedIds.has(row?.id)) return false;
        if (visibility !== 'public') return false;
        if (selectedSport && sport !== selectedSport) return false;
        return true;
      });

      const filterMineBySport = (row) => {
        const sport = normalizeSport(row?.tournament?.sport);
        if (!selectedSport) return true;
        return sport === selectedSport;
      };

      setDiscoverTournaments(visibleDiscover);
      setMyTournaments(approved.filter(filterMineBySport));
      setPendingTournaments(pending.filter(filterMineBySport));
    } catch (error) {
      console.error('[AllTournaments] Failed to fetch tournaments:', error);
      setDiscoverTournaments([]);
      setMyTournaments([]);
      setPendingTournaments([]);
      showToast(error.response?.data?.error || 'Failed to load tournaments', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedSport, showToast]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  if (loading) return <Loader text="Loading Tournaments..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative">
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}

      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#BA995D]/5 rounded-bl-[30rem] -mr-24 -mt-24" />
        <div className="max-w-6xl mx-auto relative z-10 text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-black text-white mb-2 uppercase tracking-tighter">
            All <span className="text-[#BA995D]">Tournaments</span>
          </h1>
          <p className="text-[#FDF2D1] font-black text-[7.5px] uppercase tracking-[0.2em] max-w-xl mx-auto md:mx-0 leading-relaxed opacity-80">
            Find and join tournaments, or track your active registrations.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-8 relative z-20 pb-16">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
          <div className="flex bg-white p-1.5 rounded-2xl shadow-xl shadow-[#132F45]/10 border border-gray-50 overflow-x-auto no-scrollbar outline-[#FDF2D1] outline">
            <button
              onClick={() => setActiveTab('discover')}
              className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'discover' ? 'bg-[#132F45] text-white shadow-lg' : 'text-gray-400 hover:text-[#132F45]'}`}
            >
              <FaSearch className={`text-xs ${activeTab === 'discover' ? 'text-[#BA995D]' : ''}`} /> Find Tournaments
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'my' ? 'bg-[#132F45] text-white shadow-lg' : 'text-gray-400 hover:text-[#132F45]'}`}
            >
              <FaUserCheck className={`text-xs ${activeTab === 'my' ? 'text-[#BA995D]' : ''}`} /> My Tournaments
              {myTournaments.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${activeTab === 'my' ? 'bg-[#BA995D] text-[#132F45]' : 'bg-gray-100 text-gray-500'}`}>
                  {myTournaments.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'pending' ? 'bg-[#132F45] text-white shadow-lg' : 'text-gray-400 hover:text-[#132F45]'}`}
            >
              <FaClock className={`text-xs ${activeTab === 'pending' ? 'text-[#BA995D]' : ''}`} /> Waiting
              {pendingTournaments.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${activeTab === 'pending' ? 'bg-amber-400 text-[#132F45]' : 'bg-gray-100 text-gray-500'}`}>
                  {pendingTournaments.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative w-full sm:w-48 group">
              <label className="absolute -top-4 left-0 text-[7px] font-black text-gray-400 uppercase tracking-widest">Sport</label>
              <select
                className="w-full bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-lg shadow-[#132F45]/5 font-black text-[#132F45] text-[8.5px] uppercase tracking-widest appearance-none outline-none focus:ring-2 focus:ring-[#132F45]/10"
                value={selectedSport}
                onChange={(e) => setSelectedSport(e.target.value)}
              >
                {BASE_SPORTS.map((sport) => (
                  <option key={sport} value={sport}>{sport}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#BA995D]">
                <FaChevronRight className="rotate-90 text-[7px]" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeTab === 'discover' ? (
            discoverTournaments.length === 0 ? (
              <EmptyState icon={<FaTrophy className="text-gray-200" />} title="No Tournaments Available" subtitle="Check back later for new tournaments in this sport." />
            ) : (
              discoverTournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  alreadyJoined={false}
                  joining={false}
                  onJoin={() => navigate(`/player/tournament/${tournament.id}/register`, { state: { tournament } })}
                  onView={() => {
                    setSelectedTournamentForMatches({ id: tournament.id, name: tournament.name });
                    setMatchesModalOpen(true);
                  }}
                  onViewHistory={() => navigate(`/player/tournament/${tournament.id}/history`)}
                  onCodeRequest={() => setCodeModalOpen(true)}
                />
              ))
            )
          ) : activeTab === 'my' ? (
            myTournaments.length === 0 ? (
              <EmptyState icon={<FaUserCheck className="text-gray-200" />} title="No Enrolled Tournaments" subtitle="Your active tournaments will appear here once joined." />
            ) : (
              myTournaments.map((row) => (
                <TournamentCard
                  key={row.id || row.tournament?.id}
                  tournament={row.tournament || {}}
                  participationStatus={row.status}
                  alreadyJoined={true}
                  joining={false}
                  onJoin={() => {}}
                  onView={() => navigate(`/player/tournament/${row.tournament?.id}/results`)}
                  onViewHistory={() => navigate(`/player/tournament/${row.tournament?.id}/history`)}
                  viewLabel="View Results"
                  onCodeRequest={() => setCodeModalOpen(true)}
                />
              ))
            )
          ) : (
            pendingTournaments.length === 0 ? (
              <EmptyState icon={<FaClock className="text-gray-200" />} title="No Pending Requests" subtitle="Your tournament requests awaiting approval will appear here." />
            ) : (
              pendingTournaments.map((row) => (
                <TournamentCard
                  key={row.id || row.tournament?.id}
                  tournament={row.tournament || {}}
                  participationStatus={row.status}
                  alreadyJoined={true}
                  joining={false}
                  onJoin={() => {}}
                  onView={() => {
                    setSelectedTournamentForMatches({ id: row.tournament?.id, name: row.tournament?.name });
                    setMatchesModalOpen(true);
                  }}
                  onViewHistory={() => navigate(`/player/tournament/${row.tournament?.id}/history`)}
                  onCodeRequest={() => setCodeModalOpen(true)}
                />
              ))
            )
          )}
        </div>

        <JoinCodeModal
          isOpen={codeModalOpen}
          onClose={() => setCodeModalOpen(false)}
          onSuccess={() => {
            setCodeModalOpen(false);
            fetchTournaments();
            showToast('Tournament joined successfully', 'success');
          }}
        />

        <TournamentMatchesModal
          isOpen={matchesModalOpen}
          tournamentId={selectedTournamentForMatches?.id}
          tournamentName={selectedTournamentForMatches?.name}
          onClose={() => {
            setMatchesModalOpen(false);
            setSelectedTournamentForMatches(null);
          }}
        />
      </div>
    </div>
  );
}
