import React, { useState, useEffect, useContext, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FaTrophy, FaCalendarAlt, FaUsers, FaChartBar, FaCheckCircle,
  FaExclamationTriangle, FaBuilding, FaShieldAlt, FaPlus,
  FaArrowRight, FaStar, FaFire, FaCog, FaEye, FaGlobe,
  FaBullseye, FaCircle, FaDice, FaChevronRight, FaClock,
  FaMapMarkerAlt, FaLayerGroup, FaChartLine, FaUserPlus, FaBell, FaMedal
} from 'react-icons/fa';
import { OrganizationContext } from '../../../../contexts/OrganizationContext';
import { LeagueContext } from '../../../../contexts/LeagueContext';
import { TournamentContext } from '../../../../contexts/TournamentContext';
import { AuthContext } from '../../../../contexts/AuthContext';
import apiClient from '../../../../contexts/apiClient';

import Loader from '../../../../components/ui/Loader';
import WelcomeTourModal from './WelcomeTourModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  active:       { label: 'Active',       bg: 'bg-green-500/10',  text: 'text-green-500',  dot: 'bg-green-500' },
  draft:        { label: 'Draft',        bg: 'bg-gray-500/10',   text: 'text-gray-400',   dot: 'bg-gray-400' },
  registration: { label: 'Registration', bg: 'bg-blue-500/10',   text: 'text-blue-500',   dot: 'bg-blue-500' },
  completed:    { label: 'Completed',    bg: 'bg-purple-500/10', text: 'text-purple-500', dot: 'bg-purple-500' },
  cancelled:    { label: 'Cancelled',    bg: 'bg-red-500/10',    text: 'text-red-500',    dot: 'bg-red-500' },
  upcoming:     { label: 'Upcoming',     bg: 'bg-yellow-500/10', text: 'text-yellow-500', dot: 'bg-yellow-500' },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1 h-1 rounded-full ${cfg.dot} animate-pulse`} />
      {cfg.label}
    </span>
  );
};

const SportIcon = ({ sport, className = 'w-4 h-4' }) => {
  const s = (sport || '').toLowerCase();
  if (s === 'snooker') return <FaBullseye className={className} />;
  if (s === 'pool') return <FaCircle className={className} />;
  if (s === 'pooker' || s === 'poker') return <FaDice className={className} />;
  return <FaTrophy className={className} />;
};

const SPORT_GRADIENT = {
  snooker: 'from-red-600 to-red-800',
  pool:    'from-[#BA995D] to-[#8c7144]',
  pooker:  'from-blue-600 to-indigo-800',
  poker:   'from-blue-600 to-indigo-800',
};

// ─── Section header ──────────────────────────────────────────────────────────
const SectionHeader = ({ title, subtitle, linkTo, linkLabel }) => (
  <div className="flex items-center justify-between mb-4 px-1">
    <div>
      <h2 className="text-[9px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
        <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> {title}
      </h2>
      {subtitle && <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
    </div>
    {linkTo && (
      <Link to={linkTo} className="group flex items-center gap-1.5 text-[8px] font-black text-[#BA995D] hover:text-[#132F45] transition-colors uppercase tracking-[0.15em]">
        {linkLabel} <FaArrowRight className="text-[6px] group-hover:translate-x-0.5 transition-transform" />
      </Link>
    )}
  </div>
);

// ─── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, gradient, onClick }) => (
  <div onClick={onClick} className={`bg-gradient-to-br ${gradient} rounded-2xl p-4 text-white shadow-lg relative overflow-hidden group border border-white/5 cursor-pointer`}>
    <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/5 rounded-full blur-xl group-hover:scale-110 transition-transform"></div>
    <div className="flex items-center gap-2 text-[#BA995D] mb-1.5 grayscale group-hover:grayscale-0 transition-all opacity-80">
      {React.cloneElement(typeof Icon === 'function' ? <Icon /> : Icon, { size: 10 })}
      <span className="text-[7px] font-black uppercase tracking-widest leading-none">{label}</span>
    </div>
    <div className="text-2xl font-black tracking-tighter leading-none">{value}</div>
  </div>
);

// ─── League Row ────────────────────────────────────────────────────────────────
const LeagueRow = ({ league }) => {
  const sport = (league.sport || '').toLowerCase();
  const grad = SPORT_GRADIENT[sport] || 'from-[#132F45] to-[#1A3F5C]';
  const playerCount = league.leaguePlayers?.length ?? league.playerCount ?? 0;

  return (
    <Link to="/organization/leaguematchmanagement">
      <div className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-lg transition-all duration-500 group">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform`}>
          <SportIcon sport={sport} className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black text-[#132F45] uppercase truncate group-hover:text-[#BA995D] transition-colors">{league.name}</p>
          <div className="flex items-center gap-2.5 mt-0.5">
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">{league.sport}</p>
            <div className="w-1 h-1 bg-gray-200 rounded-full" />
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">{playerCount} players</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={league.status} />
        </div>
      </div>
    </Link>
  );
};

// ─── Tournament Row ────────────────────────────────────────────────────────────
const TournamentRow = ({ tournament }) => {
  const sport = (tournament.sport || '').toLowerCase();
  const grad = SPORT_GRADIENT[sport] || 'from-orange-500 to-red-600';
  const participantCount = tournament.participants?.length ?? tournament.participantCount ?? 0;
  const dateStr = tournament.startDate
    ? new Date(tournament.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '—';

  return (
    <Link to="/organization/tournaments">
      <div className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-lg transition-all duration-500 group">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform`}>
          <FaCalendarAlt className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black text-[#132F45] uppercase truncate group-hover:text-[#BA995D] transition-colors">{tournament.name}</p>
          <div className="flex items-center gap-2.5 mt-0.5">
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">{sport}</p>
            <div className="w-1 h-1 bg-gray-200 rounded-full" />
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">{dateStr}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={tournament.status} />
        </div>
      </div>
    </Link>
  );
};

// ─── Activity Item ──────────────────────────────────────────────────────
const ActivityItem = ({ icon: Icon, color, title, sub, time }) => (
  <div className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-white transition-colors group">
    <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center text-white flex-shrink-0 shadow-sm transition-transform group-hover:scale-105`}>
      <Icon className="w-3.5 h-3.5" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-black text-[#132F45] uppercase truncate tracking-tight">{title}</p>
      {sub && <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 leading-none">{sub}</p>}
    </div>
    {time && <p className="text-[7.5px] font-black text-gray-300 uppercase tracking-widest mt-1 whitespace-nowrap">{time}</p>}
  </div>
);

// ─── Quick action tile ──────────────────────────────────────────────────────
const ActionTile = ({ icon: Icon, label, to, color, count }) => (
  <Link to={to} className="group">
    <div className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white flex flex-col justify-between border border-white/10 shadow-lg group-hover:scale-[1.02] transition-all duration-500 min-h-[90px] relative overflow-hidden`}>
      <div className="absolute -right-4 -top-4 w-12 h-12 bg-white/5 rounded-full blur-lg group-hover:scale-110 transition-transform"></div>
      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center group-hover:rotate-6 transition-transform relative">
        <Icon size={14} />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 border-2 border-white rounded-full flex items-center justify-center text-[7px] font-black">
            {count}
          </span>
        )}
      </div>
      <div>
        <p className="text-[9px] font-black uppercase tracking-tight leading-none">{label}</p>
      </div>
    </div>
  </Link>
);

// ─── Main Component ──────────────────────────────────────────────────────────
export default function OrganizationDashboard() {
  const { organization, loading: orgLoading, getProfile }         = useContext(OrganizationContext);
  const { leagues, getLeagues }                                   = useContext(LeagueContext);
  const { tournaments, getTournaments }                           = useContext(TournamentContext);
  const { user }                                                  = useContext(AuthContext);

  const [disputedCount, setDisputedCount] = useState(0);
  const [pendingJoinRequests, setPendingJoinRequests] = useState(0);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('leagues');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Use allSettled so one slow/failing call doesn't block the entire dashboard
      const results = await Promise.allSettled([
        getProfile(),
        getLeagues(),
        getTournaments()
      ]);

      // Log any failures for debugging
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const names = ['Profile', 'Leagues', 'Tournaments'];
          console.error(`[Dashboard] ${names[index]} failed to load:`, result.reason);
        }
      });

      // These secondary calls also have their own try-catch to prevent dashboard crashes
      try {
        const disputeRes = await apiClient.get('/match-results/disputes');
        setDisputedCount((disputeRes.data?.data || []).length);
      } catch (err) {
        console.error('[Dashboard] Disputes fetch failed:', err.message);
      }

      try {
        const jrRes = await apiClient.get('/leagues/organization/join-requests/count');
        setPendingJoinRequests(jrRes.data?.data?.count || 0);
      } catch (err) {
        console.error('[Dashboard] Join requests fetch failed:', err.message);
      }
    } catch (err) {
      console.error('[Dashboard] Fatal load error:', err.message);
    } finally {
      setLoading(false); // ALWAYS clears the spinner
    }
  }, [getProfile, getLeagues, getTournaments]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!leagues && !tournaments) return;
    const items = [];
    (leagues || []).slice(0, 4).forEach(l => {
      items.push({
        icon: FaTrophy,
        color: 'bg-[#132F45]',
        title: l.name,
        sub: `${l.sport} league · ${l.status}`,
        time: l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '',
        sort: new Date(l.updatedAt || l.createdAt || 0),
      });
    });
    (tournaments || []).slice(0, 3).forEach(t => {
      items.push({
        icon: FaCalendarAlt,
        color: 'bg-[#BA995D]',
        title: t.name,
        sub: `Tournament · ${t.status}`,
        time: t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '',
        sort: new Date(t.updatedAt || t.createdAt || 0),
      });
    });
    items.sort((a, b) => b.sort - a.sort);
    setRecentActivity(items.slice(0, 6));
  }, [leagues, tournaments]);

  const totalLeagues     = leagues?.length ?? 0;
  const activeLeagues    = leagues?.filter(l => l.status === 'active').length ?? 0;
  const totalTournaments = tournaments?.length ?? 0;
  const totalPlayers     = (leagues || []).filter(l => l.status === 'active').reduce((acc, l) => acc + (l.leaguePlayers?.length ?? 0), 0);

  if (loading && !organization) return <Loader text="Loading Dashboard..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-10">
      <WelcomeTourModal />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-10 flex flex-col gap-8">
        
        {/* Hero Section */}
        <div className="bg-[#132F45] rounded-3xl p-8 lg:p-10 text-white relative overflow-hidden shadow-2xl shadow-[#132F45]/20">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <span className="text-[7.5px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-2.5 flex items-center gap-2.5">
                <span className="w-5 h-[1px] bg-[#BA995D] inline-block" /> Dashboard
              </span>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-3">
                {organization?.organizationName || 'Your Organization'}
              </h1>
              <div className="flex gap-2.5 flex-wrap">
                {organization?.isVerified ? (
                  <span className="inline-flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest">
                    <FaCheckCircle size={8} /> Verified
                  </span>
                ) : (
                  <span className="">
                   
                  </span>
                )}
                {disputedCount > 0 && (
                  <Link to="/organization/disputedmatches" className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest animate-pulse">
                    <FaBell size={8} /> {disputedCount} Disputes Pending
                  </Link>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
               <div className="bg-white/5 backdrop-blur-sm border border-white/5 rounded-2xl p-4 min-w-[120px]">
                 <p className="text-2xl font-black leading-none">{totalLeagues}</p>
                 <p className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40 mt-1.5">Total Leagues</p>
               </div>
               <div className="bg-white/5 backdrop-blur-sm border border-white/5 rounded-2xl p-4 min-w-[120px]">
                 <p className="text-2xl font-black leading-none">{pendingJoinRequests}</p>
                 <p className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40 mt-1.5">Join Requests</p>
               </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={FaTrophy} label="Total Leagues" value={totalLeagues} gradient="from-[#132F45] to-[#1a3f5c]" />
          <StatCard icon={FaFire} label="Active Now" value={activeLeagues} gradient="from-[#BA995D] to-[#8c7144]" />
          <StatCard icon={FaUsers} label="Players Enrolled" value={totalPlayers} gradient="from-[#132F45] to-[#1a3f5c]" />
          <StatCard icon={FaCalendarAlt} label="Tournaments" value={totalTournaments} gradient="from-[#BA995D] to-[#8c7144]" />
        </div>

        <div className="space-y-4">
          <SectionHeader title="Quick Actions" subtitle="Management Hub" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
             <ActionTile icon={FaTrophy} label="Leagues" to="/organization/leaguemanagement" color="bg-[#132F45]" />
             <ActionTile icon={FaChartBar} label="Match Mgmt" to="/organization/leaguematchmanagement" color="bg-[#BA995D]" count={pendingJoinRequests} />
             <ActionTile icon={FaUsers} label="Players" to="/organization/playermanagement" color="bg-[#132F45]" />
             <ActionTile icon={FaExclamationTriangle} label="Disputes" to="/organization/disputedmatches" color="bg-[#BA995D]" count={disputedCount} />
             <ActionTile icon={FaBuilding} label="Clubs" to="/organization/clubmanagement" color="bg-[#132F45]" />
             <ActionTile icon={FaChartLine} label="League Stats" to="/organization/leaguestats" color="bg-[#BA995D]" />
             <ActionTile icon={FaShieldAlt} label="Profile" to="/organization/profile" color="bg-[#132F45]" />
             <ActionTile icon={FaCog} label="Settings" to="/organization/settings" color="bg-[#BA995D]" />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex gap-4">
                   <button onClick={() => setActiveTab('leagues')} className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'leagues' ? 'text-[#132F45]' : 'text-gray-400 hover:text-gray-600'}`}>
                     Leagues {activeTab === 'leagues' && <motion.div layoutId="tab" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#BA995D] rounded-full" />}
                   </button>
                   <button onClick={() => setActiveTab('tournaments')} className={`text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'tournaments' ? 'text-[#132F45]' : 'text-gray-400 hover:text-gray-600'}`}>
                     Tournaments {activeTab === 'tournaments' && <motion.div layoutId="tab" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#BA995D] rounded-full" />}
                   </button>
                </div>
                <Link to={activeTab === 'leagues' ? "/organization/leaguemanagement" : "/organization/tournaments"} className="text-[8px] font-black text-[#BA995D] flex items-center gap-1.5 uppercase tracking-widest hover:text-[#132F45] transition-colors">
                  View All <FaArrowRight size={6} />
                </Link>
              </div>

              <div className="space-y-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3"
                  >
                    {activeTab === 'leagues' ? (
                      (leagues || []).length > 0 ? (
                        leagues.slice(0, 5).map(l => <LeagueRow key={l.id} league={l} />)
                      ) : (
                        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-100 text-gray-400 text-[9px] font-black uppercase tracking-widest">No leagues found</div>
                      )
                    ) : (
                      (tournaments || []).length > 0 ? (
                        tournaments.slice(0, 5).map(t => <TournamentRow key={t.id} tournament={t} />)
                      ) : (
                        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-100 text-gray-400 text-[9px] font-black uppercase tracking-widest">No tournaments found</div>
                      )
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="space-y-8">
             <div className="space-y-4">
               <SectionHeader title="Recent Activity" subtitle="Updates" />
               <div className="bg-white/40 rounded-3xl border border-gray-50 p-3 space-y-1">
                 {recentActivity.length > 0 ? (
                   recentActivity.map((act, i) => <ActivityItem key={i} {...act} />)
                 ) : (
                   <div className="p-8 text-center text-gray-400 text-[8px] font-black uppercase tracking-widest">No recent activity</div>
                 )}
               </div>
             </div>

             <div className="bg-gradient-to-br from-[#132F45] to-[#1a3f5c] rounded-3xl p-6 text-white relative overflow-hidden shadow-xl border border-white/5">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl"></div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-5">Organization Status</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Leagues', value: `${totalLeagues} total`, icon: <FaTrophy /> },
                    { label: 'Players', value: totalPlayers, icon: <FaUsers /> },
                    { label: 'Location', value: organization?.city || 'Not Set', icon: <FaMapMarkerAlt /> },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center group">
                      <div className="flex items-center gap-2.5 opacity-40 group-hover:opacity-100 transition-opacity">
                        <span className="text-[#BA995D]">{React.cloneElement(item.icon, { size: 10 })}</span>
                        <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
                      </div>
                      <span className={`text-[10px] font-black ${item.color || 'text-white'}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
                <button className="mt-8 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-[0.25em] transition-all">Manage Account</button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}