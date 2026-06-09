import React, { useState, useEffect, useContext, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaSearch,
  FaCheck,
  FaTrophy,
  FaCircle,
  FaBullseye,
  FaDice,
  FaBuilding,
} from "react-icons/fa";
import { LeagueContext } from "../../../../contexts/LeagueContext";
import { usePlayer } from "../../../../contexts/PlayerContext";
import { toast } from "react-hot-toast";
import Loader from "../../../../components/ui/Loader";

const MatchListing = () => {
  const { getLeagues, joinLeague, leaveLeague } = useContext(LeagueContext);
  const { player } = usePlayer();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [activeSport, setActiveSport] = useState("all");
  const [activeFormat, setActiveFormat] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [modalState, setModalState] = useState({ isOpen: false, title: "", message: "", onConfirm: null, onCancel: null });

  const loadLeagues = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getLeagues();
      if (res.success) {
        // Filter out completed leagues for first impression, but keep all active/upcoming ones
        const activeLeagues = res.data.filter(l => l.status !== 'completed' && l.status !== 'cancelled' && l.status !== 'archived');
        setLeagues(activeLeagues);
      }
    } catch (err) {
      setError("Failed to load available leagues");
    } finally {
      setLoading(false);
    }
  }, [getLeagues]);

  useEffect(() => {
    loadLeagues();
  }, [loadLeagues]);

  const handleJoinLeave = (leagueId, isJoining) => {
    if (!player) {
      toast.error("Please complete your profile first");
      return;
    }

    setModalState({
      isOpen: true,
      title: isJoining ? "Join League" : "Leave League",
      message: isJoining 
        ? "Are you sure you want to join this league?"
        : "Are you sure you want to leave this league? This action cannot be undone if matches are generated.",
      onConfirm: async () => {
        setModalState(s => ({ ...s, isOpen: false }));
        setIsUpdating(true);
        try {
          const res = isJoining 
            ? await joinLeague(leagueId, { playerId: player.id })
            : await leaveLeague(leagueId);
          
          if (res.success) {
            toast.success(isJoining ? "Joined successfully!" : "Left successfully!");
            loadLeagues();
          } else {
            toast.error(res.error || "Action failed");
          }
        } catch (err) {
          toast.error("Action failed");
        } finally {
          setIsUpdating(false);
        }
      },
      onCancel: () => setModalState(s => ({ ...s, isOpen: false }))
    });
  };

  const filteredLeagues = leagues.filter((league) => {
    const matchesSearch = league.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSport = activeSport === "all" || league.sport.toLowerCase() === activeSport;
    
    let matchesFormat = true;
    if (activeFormat !== "all") {
       const structure = typeof league.structure === 'string' ? JSON.parse(league.structure) : (league.structure || {});
       const format = structure.format || league.format || '';
       matchesFormat = format === activeFormat;
    }

    return matchesSearch && matchesSport && matchesFormat;
  });

  if (loading) return <Loader text="Loading matches..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative">
      {isUpdating && <Loader text="Processing entry..." />}

      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[30rem] h-[30rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <span className="text-[7.5px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-2.5 flex items-center gap-2.5"><span className="w-5 h-[1px] bg-[#BA995D] inline-block" /> Match Registry</span>
          <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
            Find <span className="text-[#BA995D]">Matches</span>
          </h1>
          <p className="text-white/30 font-black text-[7.5px] uppercase tracking-[0.2em] mt-3 max-w-lg leading-relaxed">
            Find and join leagues at your local clubs.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 -mt-5 pb-10">
        {/* Filters Bar */}
        <div className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/10 p-3 md:p-4 flex flex-col md:flex-row gap-3 items-center border border-gray-50">
          <div className="w-full md:flex-1 relative">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[#BA995D] w-3 h-3" />
            <input
              type="text"
              placeholder="Search leagues..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#FAFAFA] border-2 border-[#FDF2D1] rounded-xl focus:ring-4 focus:ring-[#BA995D]/10 focus:border-[#BA995D] font-black text-[8px] uppercase tracking-widest transition-all placeholder:text-gray-300 placeholder:normal-case placeholder:tracking-normal placeholder:font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
 
          <div className="flex items-center gap-1 w-full md:w-auto bg-[#FAFAFA] border border-gray-100 p-1 rounded-2xl">
            {[
              { id: 'all', label: 'All', icon: FaTrophy },
              { id: 'snooker', label: 'Snooker', icon: FaBullseye },
              { id: 'pool', label: 'Pool', icon: FaCircle },
              { id: 'pooker', label: 'Pooker', icon: FaDice }
            ].map(sport => (
              <button
                key={sport.id}
                onClick={() => setActiveSport(sport.id)}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all duration-500 flex items-center justify-center gap-2 ${
                  activeSport === sport.id
                    ? 'bg-[#132F45] text-white shadow-md'
                    : 'text-gray-400 hover:text-[#132F45] hover:bg-white'
                }`}
              >
                <sport.icon className={`w-2.5 h-2.5 ${activeSport === sport.id ? 'text-[#BA995D]' : ''}`} />
                <span className="hidden sm:inline">{sport.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Results Info */}
        <div className="flex items-center justify-between mt-8 mb-6 px-1">
          <h2 className="text-[9px] font-black text-[#132F45] uppercase tracking-[0.3em] flex items-center gap-3">
            <div className="w-1 h-3 bg-[#BA995D] rounded-full" />
            {filteredLeagues.length} Leagues
          </h2>
          <div className="flex gap-1.5">
            {['round_robin', 'knockout', 'groupsKnockout'].map(fmt => (
              <button
                key={fmt}
                onClick={() => setActiveFormat(activeFormat === fmt ? 'all' : fmt)}
                className={`text-[7.5px] font-black uppercase px-3 py-1.5 rounded-xl border transition-all tracking-widest ${
                  activeFormat === fmt
                    ? 'bg-[#132F45] text-white border-[#132F45] shadow-lg shadow-[#132F45]/20'
                    : 'bg-white text-gray-400 border-gray-100 hover:border-[#BA995D] hover:text-[#BA995D]'
                }`}
              >
                {fmt.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Listings Grid */}
        {filteredLeagues.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLeagues.map((league) => (
              <ArenaCard
                key={league.id}
                league={league}
                currentUserId={player?.id}
                onAction={handleJoinLeave}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-[#FDF2D1] shadow-lg shadow-[#132F45]/5 flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-[#FDF2D1]/30 flex items-center justify-center">
              <FaTrophy className="text-2xl text-[#BA995D]/30" />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#132F45] uppercase tracking-tight">No Leagues Found</h3>
              <p className="text-[#BA995D] font-black text-[9px] uppercase tracking-widest mt-1.5">Adjust filters or check back later</p>
            </div>
          </div>
        )}
      </div>

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
              className="relative bg-white rounded-[2rem] shadow-2xl p-8 max-w-md w-full border border-gray-100 z-10"
            >
              <h3 className="text-xl font-black text-[#132F45] uppercase tracking-tight mb-2">{modalState.title}</h3>
              <p className="text-sm font-bold text-gray-500 mb-6">{modalState.message}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={modalState.onCancel}
                  className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-100 text-gray-500 font-black uppercase text-[10px] tracking-widest hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={modalState.onConfirm}
                  className="flex-1 px-4 py-3 rounded-xl bg-[#132F45] text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-[#132F45]/20 hover:bg-[#BA995D] transition-all"
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

const ArenaCard = ({ league, currentUserId, onAction }) => {
  const activePlayers = (league.leaguePlayers || []).filter(lp => lp.status !== 'withdrawn');
  const isJoined = activePlayers.some(lp => lp.playerId === currentUserId);
  const playerCount = activePlayers.length || 0;
  
  const structure = typeof league.structure === 'string' ? JSON.parse(league.structure) : (league.structure || {});
  const format = structure.format || league.format || 'Standard';
  const maxPlayers = structure.maxPlayers || league.maxPlayers || '∞';
  
  const statusColors = {
    upcoming: 'bg-blue-50 text-blue-600 border-blue-100',
    active: 'bg-green-50 text-green-600 border-green-100',
    draft: 'bg-gray-50 text-gray-500 border-gray-100'
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-lg shadow-[#132F45]/5 hover:shadow-xl hover:shadow-[#BA995D]/10 transition-all duration-500 border border-gray-100 group flex flex-col h-full">
      {/* Visual Header */}
      <div className="h-1.5 rounded-full mx-6 mt-5 bg-gradient-to-r from-[#132F45] via-[#BA995D] to-[#132F45]"></div>      <div className="p-4 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-[#BA995D]/10 text-[#BA995D] p-2 rounded-xl group-hover:bg-[#132F45] group-hover:text-white transition-all duration-500">
               {league.sport?.toLowerCase() === 'snooker' ? <FaBullseye className="w-3.5 h-3.5"/> : 
                league.sport?.toLowerCase() === 'pool' ? <FaCircle className="w-3.5 h-3.5"/> : <FaDice className="w-3.5 h-3.5"/>}
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest border ${statusColors[league.status] || statusColors.draft}`}>
               {league.status}
            </span>
          </div>
 
          <h3 className="text-[14.5px] font-black text-[#132F45] leading-none mb-2 uppercase tracking-tight group-hover:text-[#BA995D] transition-colors">{league.name}</h3>
          <p className="text-[8.5px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <FaBuilding className="text-[#BA995D] w-2.5 h-2.5"/> {league.venue?.name || league.venue?.venueName || 'Local Arena'}
          </p>
 
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-[#FAFAFA] p-2.5 rounded-xl border border-transparent group-hover:border-[#FDF2D1] transition-all">
               <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Format</p>
               <p className="text-[9.5px] font-black text-[#132F45] uppercase truncate">{format.replace('_', ' ')}</p>
            </div>
            <div className="bg-[#FAFAFA] p-2.5 rounded-xl border border-transparent group-hover:border-[#FDF2D1] transition-all">
               <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Capacity</p>
               <p className="text-[9.5px] font-black text-[#132F45]">{playerCount} / {maxPlayers}</p>
            </div>
          </div>
 
          <div className="mt-auto pt-3 border-t border-gray-50">
             {isJoined ? (
               <div className="space-y-2">
                  <div className="bg-green-50 text-green-700 py-2 rounded-xl text-[8.5px] font-black uppercase text-center tracking-widest flex items-center justify-center gap-1.5">
                    <FaCheck /> Joined
                  </div>
                  <button
                    onClick={() => onAction(league.id, false)}
                    className="w-full text-red-300 hover:text-red-500 font-black text-[8px] uppercase tracking-widest py-1 transition-colors"
                  >
                    Leave League
                  </button>
               </div>
             ) : (
               <button
                 onClick={() => onAction(league.id, true)}
                 disabled={league.status !== 'upcoming'}
                 className={`w-full py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-md
                   ${league.status === 'upcoming' 
                     ? 'bg-[#132F45] text-white hover:bg-[#BA995D] hover:scale-[1.01] shadow-[#132F45]/10' 
                     : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}
               >
                  {league.status === 'upcoming' ? 'Join League' : 'Joined'}
                </button>
             )}
          </div>
      </div>
    </div>
  );
};

export default MatchListing;