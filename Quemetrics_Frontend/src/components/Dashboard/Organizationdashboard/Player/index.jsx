import { 
  Users, 
  Search, 
  MapPin, 
  Mail, 
  Phone, 
  Calendar, 
  UserPlus, 
  Trophy,
  Activity,
  UserCheck,
  UserX,
  ChevronRight,
  Filter,
  MoreVertical
} from 'lucide-react';

const PlayerManagement = () => {
  const [activeTab, setActiveTab] = useState("snooker");
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [togglingPlayerId, setTogglingPlayerId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch all players from backend
  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await apiClient.get("/player/all");

        if (data.success) {
          setAllPlayers(data.data || []);
        } else {
          setError(data.error || "Failed to fetch players");
        }
      } catch (err) {
        console.error("Error fetching players:", err);
        setError("Failed to fetch players");
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  // Filter players by selected sport and search term
  const getPlayersByTab = (sport) => {
    return allPlayers.filter((player) => {
      const sports = player.sports || ["snooker"];
      const matchesSport = sports.includes(sport);
      const matchesSearch = !searchTerm || 
        player.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.user?.email?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSport && matchesSearch;
    });
  };

  // Get current players based on active tab
  const playersData = {
    snooker: getPlayersByTab("snooker"),
    poker: getPlayersByTab("pooker"),
    pool: getPlayersByTab("pool"),
  };

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Toggle player status
  const handleToggleStatus = async (playerId, playerName) => {
    setTogglingPlayerId(playerId);
    try {
      const { data } = await apiClient.put(`/player/${playerId}/toggle-status`);

      if (data.success) {
        setAllPlayers((prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === playerId
              ? {
                  ...player,
                  user: {
                    ...player.user,
                    isActive: data.data.newStatus,
                  },
                }
              : player
          )
        );
      } else {
        setError(data.error || "Failed to toggle status");
      }
    } catch (err) {
      console.error("Error toggling player status:", err);
      setError("Failed to toggle status");
    } finally {
      setTogglingPlayerId(null);
    }
  };

  if (loading && allPlayers.length === 0) {
    return (
      <div className="w-full min-h-[400px] flex flex-col items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#132F45] mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#132F45]/40 animate-pulse">Syncing player registry...</p>
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6 lg:p-8 flex flex-col gap-6">
      {/* ── Premium Hero Header ────────────────────────────────────────── */}
      <div className="bg-[#132F45] rounded-3xl p-6 lg:p-8 relative overflow-hidden shadow-2xl shadow-[#132F45]/20 border border-[#BA995D]/10 font-outfit">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#BA995D]/5 rounded-bl-full -mr-16 -mt-16 pointer-events-none transition-transform group-hover:scale-110 duration-700" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-tr-3xl -ml-8 -mb-8 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-br from-transparent via-[#BA995D]/2 to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="max-w-xl">
            <div className="flex items-center gap-2.5 mb-3 group">
              <span className="w-8 h-[2px] bg-[#BA995D] rounded-full transition-all group-hover:w-12" />
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#BA995D]">
                Personnel Directory
              </p>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-3">
              Player <span className="text-[#BA995D] inline-block hover:scale-105 transition-transform cursor-default">Management</span>
            </h1>
            <p className="text-[11px] text-[#DCEAF8]/40 leading-relaxed font-black uppercase tracking-widest max-w-lg">
              Manage the global player database, monitor activity status, and oversee registration profiles across all sport divisions.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-3 px-5 flex flex-col justify-center min-w-[120px]">
                <p className="text-[7px] font-black text-[#BA995D] uppercase tracking-widest mb-1 opacity-60">Total Census</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-white tracking-tighter">{allPlayers.length}</span>
                  <span className="text-[8px] font-black text-white/20 uppercase">Units</span>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-3 px-5 flex flex-col justify-center min-w-[120px]">
                <p className="text-[7px] font-black text-green-400 uppercase tracking-widest mb-1 opacity-60">Operations</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-green-400 tracking-tighter">
                    {allPlayers.filter(p => p.user?.isActive !== false).length}
                  </span>
                  <span className="text-[8px] font-black text-green-400/20 uppercase">Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── High-Density Filter Bar ──────────────────────────────────── */}
      <div className="bg-[#FAFAFA] rounded-2xl border border-gray-100 p-2.5 flex flex-col lg:flex-row lg:items-center gap-3 shadow-sm">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#132F45] transition-colors" size={14} />
          <input
            type="text"
            placeholder="FILTER BY PLAYER NAME OR EMAIL IDENTITY..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#132F45]/5 focus:border-[#132F45]/20 text-[#132F45] text-[10px] font-black uppercase tracking-widest placeholder:text-gray-300 transition-all outline-none"
          />
        </div>

        <div className="flex gap-2 p-1 bg-white border border-gray-100 rounded-xl">
          {[
            { id: 'snooker', img: Snooker, label: 'Snooker' },
            { id: 'poker', img: Poker, label: 'Poker' },
            { id: 'pool', img: Pool, label: 'Pool' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[100px] flex items-center justify-center gap-2.5 px-4 py-2 rounded-lg transition-all duration-300 font-black text-[9px] uppercase tracking-widest ${
                activeTab === tab.id
                  ? "bg-[#132F45] text-[#BA995D] shadow-lg shadow-[#132F45]/20"
                  : "text-gray-400 hover:bg-gray-50 hover:text-[#132F45]"
              }`}
            >
              <img src={tab.img} alt={tab.label} className={`w-3.5 h-3.5 object-contain transition-all ${activeTab === tab.id ? 'brightness-125 scale-110' : 'grayscale opacity-50'}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shadow-sm">
            <Activity size={16} />
          </div>
          <p className="text-[10px] font-black text-red-900 uppercase tracking-widest">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 transition-colors">
            <Mail size={14} />
          </button>
        </div>
      )}

      {/* ── High-Density Data Registry ───────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-xl shadow-[#132F45]/5 border border-gray-100 overflow-hidden">
        {/* ---------- DESKTOP TABLE (lg and up) ---------- */}
        <div className="hidden lg:block">
          {/* Table Header – 5 columns */}
          <div className="grid grid-cols-5 text-gray-500 border-b-2 border-gray-200 text-sm font-medium pb-3">
            <div>Player</div>
            <div>Experience</div>
            <div>Stats</div>
            <div>Status</div>
            <div>Joined</div>
          </div>

          {/* Player Rows */}
          {playersData[activeTab].length > 0 ? (
            playersData[activeTab].map((player) => {
              const isActive = player.user?.isActive ?? true;
              return (
                <div
                  key={player.id}
                  className="grid grid-cols-5 items-center py-4 text-sm border-b border-gray-100 last:border-0"
                >
                  {/* Player */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center">
                      {player.avatarUrl ? (
                        <img 
                          src={getImageUrl(player.avatarUrl)} 
                          alt={player.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-semibold text-gray-700">
                          {player.name?.charAt(0) || "?"}
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-gray-900">
                      {player.name || "Unknown"}
                    </span>
                  </div>

                  {/* Experience */}
                  <div className="text-gray-700">Nil</div>

                  {/* Stats */}
                  <div>
                    <p className="text-gray-900">0 matches</p>
                    <p className="text-gray-500 text-sm">0% win rate</p>
                  </div>

                  {/* Status - Dropdown selector */}
                  <div>
                    <select
                      value={isActive ? "active" : "inactive"}
                      onChange={() => handleToggleStatus(player.id, player.name)}
                      disabled={togglingPlayerId === player.id}
                      className={`px-3 py-1.5 rounded text-xs font-medium border-2 cursor-pointer transition ${
                        isActive
                          ? "bg-green-50 border-green-500 text-green-700"
                          : "bg-red-50 border-red-500 text-red-700"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Joined – date only */}
                  <div>
                    <span className="text-gray-600">
                      {formatDate(player.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-gray-500">
              No players found for {activeTab}
            </div>
          )}
        </div>

        {/* ---------- MOBILE CARD LAYOUT (below lg) ---------- */}
        <div className="lg:hidden p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {playersData[activeTab].length > 0 ? (
            playersData[activeTab].map((player) => {
              const isActive = player.user?.isActive ?? true;
              return (
                <div key={player.id} className="bg-[#FAFAFA] border border-gray-100 rounded-2xl p-4 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl overflow-hidden border-2 border-white shadow-md bg-gray-100 flex items-center justify-center">
                        {player.avatarUrl ? (
                          <img 
                            src={getImageUrl(player.avatarUrl)} 
                            alt={player.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-black text-[14px] text-[#132F45]">
                            {player.name?.charAt(0) || "?"}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-tighter">
                          {player.name || "UNIDENTIFIED UNIT"}
                        </h3>
                        <p className="text-[7.5px] font-black text-gray-300 uppercase tracking-widest">
                          {isActive ? "ACTIVE OPERATIVE" : "OFFLINE / SUSPENDED"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleStatus(player.id, player.name)}
                      className={`p-2.5 rounded-xl shadow-lg transition-all ${
                        isActive
                          ? "bg-green-500 text-white shadow-green-200"
                          : "bg-red-500 text-white shadow-red-200"
                      }`}
                    >
                      {isActive ? <UserCheck size={14} /> : <UserX size={14} />}
                    </button>
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap items-center gap-4 text-sm border-t border-gray-100 pt-3 mt-1">
                    <div>
                      <span className="text-gray-500">Experience:</span>{" "}
                      <span className="font-medium text-gray-900">Nil</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-gray-50">
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Inducted</span>
                      <p className="text-[9px] font-black text-[#132F45]">{formatDate(player.createdAt)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">
                      <Activity size={10} className="text-[#BA995D]" /> 0.0% Win Efficiency
                    </div>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
              No players identified.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerManagement;