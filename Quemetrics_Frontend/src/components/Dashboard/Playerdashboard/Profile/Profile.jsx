import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTrophy, FaMedal, FaChartLine, FaBullseye, FaCircle,
  FaDice, FaShieldAlt, FaUser, FaExclamationTriangle,
  FaCamera, FaIdCard, FaEnvelope, FaPhone, FaBuilding, FaMapMarkerAlt, FaCalendar
} from 'react-icons/fa';






import { usePlayer } from '../../../../contexts/PlayerContext';
import { LeagueContext } from '../../../../contexts/LeagueContext';
import { AuthContext } from '../../../../contexts/AuthContext';
import apiClient from '../../../../contexts/apiClient';
import { getImageUrl } from '../../../../utils/imageUtils';
import Loader from "../../../../components/ui/Loader";

const StatCard = ({ label, value, icon: Icon }) => (
  <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 hover:border-[#BA995D]/30 transition-all">
    <div className="p-2.5 bg-[#FDF2D1] rounded-lg text-[#BA995D]">
      <Icon className="w-4 h-4" />
    </div>
    <div>
      <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.15em] mb-0.5">{label}</p>
      <p className="text-sm font-black text-[#132F45] tracking-tight">{value}</p>
    </div>
  </div>
);

const Profile = () => {
  const { player, loading: playerLoading, getProfile, updateProfile, uploadAvatar } = usePlayer();
  const { getLeagues } = useContext(LeagueContext);
  const { user } = useContext(AuthContext);

  const [myLeagues, setMyLeagues] = useState([]);
  const [myLeagueChampions, setMyLeagueChampions] = useState({});
  const [loadingExtras, setLoadingExtras] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    nickname: "",
    email: "",
    phoneNumber: "",
    address: "",
    bio: "",
    dateOfBirth: "",
  });
  const [activeTab, setActiveTab] = useState("Snooker");
  const [statsFilter, setStatsFilter] = useState("both");
  const [profileStats, setProfileStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const result = await getProfile();
      if (!result.success) {
        toast.error(result.error || "Failed to load profile");
      }
    };
    if (!player) {
      loadProfile();
    }
  }, [getProfile, player]);

  useEffect(() => {
    if (player) {
      setFormData({
        name: player.name || "",
        nickname: player.nickname || "",
        email: player.user?.email || "",
        phoneNumber: player.phoneNumber || "",
        address: player.address || "",
        bio: player.bio || "",
        dateOfBirth: player.dateOfBirth ? player.dateOfBirth.split('T')[0] : "",
        sports: Array.isArray(player.sports) ? player.sports : [],
      });

      // Set initial active tab from player.sports if available
      if (player.sports && Array.isArray(player.sports) && player.sports.length > 0) {
        const firstSport = player.sports[0];
        const capitalized = firstSport.charAt(0).toUpperCase() + firstSport.slice(1).toLowerCase();
        if (["Snooker", "Pool", "Pooker"].includes(capitalized)) {
          setActiveTab(capitalized);
        }
      }
    }
  }, [player]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Prevent non-numeric characters and limit to 11 digits for phone number
    if (name === 'phoneNumber') {
      const numericValue = value.replace(/\D/g, '').slice(0, 11);
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
      return;
    }

    // Only alphabets and spaces for name, max 50 chars
    if (name === 'name') {
      const filteredValue = value.replace(/[^A-Za-z\s]/g, '').slice(0, 50);
      setFormData((prev) => ({ ...prev, [name]: filteredValue }));
      return;
    }

    // Truncate year in dateOfBirth if it exceeds 4 digits
    if (name === 'dateOfBirth') {
      const parts = value.split('-');
      if (parts[0] && parts[0].length > 4) {
        parts[0] = parts[0].slice(0, 4);
        const correctedValue = parts.join('-');
        setFormData((prev) => ({ ...prev, [name]: correctedValue }));
        return;
      }
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const uploadData = new FormData();
      uploadData.append("avatar", file);

      const result = await uploadAvatar(uploadData);
      if (result.success) {
        toast.success("Avatar updated!");
      } else {
        toast.error(result.error || "Failed to upload avatar");
      }
    }
  };

  const handleSaveChanges = async () => {
    // Validate name if provided
    if (formData.name) {
      if (!/^[A-Za-z\s]+$/.test(formData.name)) {
        toast.error("Name must only contain alphabets and spaces");
        return;
      }
      if (formData.name.length > 50) {
        toast.error("Name must not exceed 50 characters");
        return;
      }
    }

    // Validate phone number if provided
    if (formData.phoneNumber && !/^\d{11}$/.test(formData.phoneNumber)) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }

    setIsSaving(true);
    const result = await updateProfile(formData);
    setIsSaving(false);

    if (result.success) {
      toast.success("Profile updated successfully!");
    } else {
      toast.error(result.error || "Update failed");
    }
  };

  const loadStats = useCallback(async () => {
    if (!player) return;
    setLoadingStats(true);
    setStatsError(null);

    try {
      const response = await apiClient.get(
        `/player/dashboard/filtered-stats?leagueFilter=${statsFilter}&game=${activeTab}`
      );
      if (response.data?.success) {
        setProfileStats(response.data.data);
      } else {
        setStatsError(response.data?.error || "Failed to load stats");
      }
    } catch (error) {
      setStatsError(error.response?.data?.error || "Failed to load stats");
      console.error("Profile stats load error:", error);
    } finally {
      setLoadingStats(false);
    }
  }, [player, activeTab, statsFilter]);

  const loadExtras = useCallback(async () => {
    if (!player) return;
    setLoadingExtras(true);
    try {
      const res = await getLeagues({ playerId: player.id });
      const leagues = res.data || [];
      const playerLeagues = leagues.filter(l => l.leaguePlayers?.some(lp => lp.playerId === player.id));
      setMyLeagues(playerLeagues);
    } catch (e) {
      console.error("Profile extra load error:", e);
    } finally {
      setLoadingExtras(false);
    }
  }, [player, getLeagues]);

  useEffect(() => {
    if (player) loadExtras();
  }, [player, loadExtras]);

  useEffect(() => {
    if (player) loadStats();
  }, [player, loadStats]);

  // Combined Title Logic - Now using consolidated backend data
  const allTitles = useMemo(() => {
    // Backend now provides these accurately in getAggregatedStats
    return (player?.titles || []).filter(t => 
      t.title?.toLowerCase().includes('champ') || 
      t.title?.toLowerCase().includes('winner')
    );
  }, [player?.titles]);

  const titleCount = allTitles.length;

  // Stats mock data (this would eventually come from a stats-specific endpoint/context)
  const defaultStats = {
    snooker: { matches: 0, wins: 0, losses: 0, winRate: 0, highestBreak: 0, frameWins: 0, frameLosses: 0, frameDiff: 0, breaks50: 0, breaks100: 0, whitewashes: 0 },
    pool: { matches: 0, wins: 0, losses: 0, winRate: 0, rackWins: 0, rackLosses: 0, rackDiff: 0, sevenBallWins: 0, ballsPotted: 0, whitewashes: 0 },
    pooker: { matches: 0, wins: 0, losses: 0, winRate: 0, totalPoints: 0, frameWins: 0, frameLosses: 0, ballsPotted: 0, blackFinishes: 0, whitewashes: 0 }
  };

  // Tabs based on player's selected sports (automated from participation)
  const availableTabs = [
    { id: "Snooker", label: "Snooker", icon: FaBullseye },
    { id: "Pool", label: "Pool", icon: FaCircle },
    { id: "Pooker", label: "Pooker", icon: FaDice },
  ].filter(tab => {
    if (!player) return tab.id === "Snooker";
    // Use detected sports from backend if available
    if (Array.isArray(player.detectedSports) && player.detectedSports.length > 0) {
      return player.detectedSports.some(s => s.toLowerCase() === tab.id.toLowerCase());
    }
    // Fallback to Snooker if nothing detected
    return tab.id === "Snooker";
  });


  const getSportStats = (sportId) => {
    const sid = String(sportId).toLowerCase();
    if (profileStats?.stats && profileStats.stats[sid]) {
      return profileStats.stats[sid];
    }
    if (player && player.aggregatedStats && player.aggregatedStats[sid]) {
      return player.aggregatedStats[sid];
    }
    return defaultStats[sid];
  };

  const leagueCount = profileStats?.leagues?.length || 0;
  const tournamentCount = profileStats?.tournaments?.length || 0;

  if (playerLoading || isSaving || loadingExtras) {
    return <Loader text={isSaving ? "Saving..." : "Loading Profile..."} />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative">

            {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="bg-[#132F45] px-4 sm:px-6 py-6 md:py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex items-center justify-between gap-6">
            {player && (
              <div className="flex items-center gap-3.5 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-xl flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-[#BA995D]/20 flex items-center justify-center overflow-hidden">
                  {player?.avatarUrl ? (
                    <img src={getImageUrl(player.avatarUrl)} alt={player.name} className="w-full h-full object-cover" />
                  ) : (
                    <FaUser className="w-4 h-4 text-[#BA995D]" />
                  )}
                </div>
                <div>
                  <p className="text-white font-black text-[11px] uppercase tracking-tight">{player?.name}</p>
                  <p className="text-[#BA995D] font-black text-[7.5px] uppercase tracking-[0.15em] mt-0.5">
                    {player?.badgeType || 'Casual'} · {titleCount > 0 ? `${titleCount}× Champ` : 'Player'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-5">
          {/* ---------- LEFT COLUMN: PERSONAL INFO ---------- */}
          <div className="lg:w-1/2">
            <div className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/5 border border-gray-100 p-5 sm:p-6">
              <h2 className="text-[9px] font-black text-[#132F45] mb-5 flex items-center gap-2.5 uppercase tracking-[0.25em]">
                <FaUser className="text-[#BA995D] text-[10px]" />
                My Details
              </h2>

              {/* Avatar section */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative group">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-[4px] border-[#FDF2D1] shadow-lg bg-[#FAFAFA] flex items-center justify-center relative z-10 transition-transform group-hover:scale-105 duration-500">
                    {player?.avatarUrl ? (
                      <img
                        src={getImageUrl(player.avatarUrl)}
                        alt={player?.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#BA995D]/30 bg-[#FDF2D1]/30">
                        <FaUser className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <label className="absolute -bottom-0.5 -right-0.5 bg-[#132F45] text-white p-2 rounded-full cursor-pointer shadow-lg hover:bg-[#BA995D] transition-colors z-20 border-2 border-white">
                    <FaCamera className="w-2.5 h-2.5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                </div>
                 <div className="mt-5 text-center">
                    <p className="font-black text-xl text-[#132F45] uppercase tracking-tight leading-none">{player?.name}</p>
                    <div className="flex flex-wrap justify-center gap-1.5 mt-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[8.5px] font-black bg-[#FDF2D1] text-[#BA995D] border border-[#BA995D]/20 uppercase tracking-widest">
                         <FaMedal className="w-2.5 h-2.5" />
                         {player?.badgeType || "Casual"}
                      </span>
                      {titleCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[8.5px] font-black bg-[#132F45] text-[#BA995D] border border-[#BA995D]/30 uppercase tracking-widest shadow-lg">
                           <FaTrophy className="w-2.5 h-2.5" />
                           {titleCount}× Champ
                        </span>
                      )}
                    </div>
                 </div>
              </div>

              {/* Form fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1.5 px-1">Full Name</label>
                    <div className="relative">
                      <FaUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#BA995D] w-3.5 h-3.5" />
                      <input
                        name="name"
                        type="text"
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 border-2 border-[#FDF2D1] rounded-xl focus:ring-4 focus:ring-[#BA995D]/10 focus:border-[#BA995D] bg-[#FAFAFA] font-black text-xs text-[#132F45] transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1.5 px-1">Nickname</label>
                    <div className="relative">
                      <FaIdCard className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#BA995D] w-3.5 h-3.5" />
                      <input
                        name="nickname"
                        type="text"
                        placeholder=""
                        value={formData.nickname}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 border-2 border-[#FDF2D1] rounded-xl focus:ring-4 focus:ring-[#BA995D]/10 focus:border-[#BA995D] bg-[#FAFAFA] font-black text-xs text-[#132F45] transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1.5 px-1">Email (Account)</label>
                  <div className="relative text-gray-400">
                    <FaEnvelope className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" />
                    <input
                      type="email"
                      value={formData.email}
                      readOnly
                      className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-100 rounded-xl bg-gray-50 cursor-not-allowed italic font-black text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1.5 px-1">Phone</label>
                    <div className="relative">
                      <FaPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#BA995D] w-3.5 h-3.5" />
                      <input
                        name="phoneNumber"
                        type="tel"
                        value={formData.phoneNumber}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 border-2 border-[#FDF2D1] rounded-xl focus:ring-4 focus:ring-[#BA995D]/10 focus:border-[#BA995D] bg-[#FAFAFA] font-black text-xs text-[#132F45] transition-all"
                      />
                    </div>
                  </div>
                   <div>
                    <label className="block text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1.5 px-1">My Club</label>
                    <div className="relative text-gray-400">
                      <FaBuilding className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" />
                      <input
                        type="text"
                        value={player?.club?.name || "Independent"}
                        readOnly
                        className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-100 rounded-xl bg-gray-50 cursor-not-allowed font-black text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1.5 px-1">Date of Birth</label>
                    <div className="relative">
                      <FaCalendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#BA995D] w-3.5 h-3.5" />
                      <input
                        name="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={handleChange}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full pl-10 pr-4 py-2.5 border-2 border-[#FDF2D1] rounded-xl focus:ring-4 focus:ring-[#BA995D]/10 focus:border-[#BA995D] bg-[#FAFAFA] font-black text-xs text-[#132F45] transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1.5 px-1">Address</label>
                    <div className="relative">
                      <FaMapMarkerAlt className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#BA995D] w-3.5 h-3.5" />
                      <input
                        name="address"
                        type="text"
                        value={formData.address}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-2.5 border-2 border-[#FDF2D1] rounded-xl focus:ring-4 focus:ring-[#BA995D]/10 focus:border-[#BA995D] bg-[#FAFAFA] font-black text-xs text-[#132F45] transition-all"
                      />
                    </div>
                  </div>
                </div>


                <div>
                  <label className="block text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1.5 px-1">Bio</label>
                  <textarea
                    name="bio"
                    rows="2"
                    value={formData.bio}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border-2 border-[#FDF2D1] rounded-xl focus:ring-4 focus:ring-[#BA995D]/10 focus:border-[#BA995D] bg-[#FAFAFA] font-black text-xs text-[#132F45] transition-all resize-none"
                    placeholder="Briefly describe your style of play..."
                  ></textarea>
                </div>
              </div>

              <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="mt-6 w-full bg-[#132F45] text-white font-black py-3.5 rounded-xl hover:bg-[#BA995D] transition-all shadow-lg shadow-[#132F45]/10 flex items-center justify-center gap-2.5 uppercase tracking-widest text-[11px]"
              >
                {isSaving ? "Updating Profile..." : "Save Changes"}
              </button>
            </div>
          </div>

          {/* ---------- RIGHT COLUMN: STATS ---------- */}
          <div className="lg:w-1/2">
            <div className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/5 border border-gray-100 p-5 sm:p-6 h-full flex flex-col">
              <h2 className="text-[9px] font-black text-[#132F45] mb-5 flex items-center gap-2.5 uppercase tracking-[0.25em]">
                <FaChartLine className="text-[#BA995D] text-[10px]" />
                My Stats
              </h2>

              {/* Tabs */}
              <div className="border-b border-[#FDF2D1] mb-6">
                <nav className="flex space-x-6 overflow-x-auto pb-px">
                  {availableTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 py-3 px-1 border-b-[3px] font-black text-[10px] uppercase tracking-widest transition-all ${
                        activeTab === tab.id
                          ? "border-[#BA995D] text-[#132F45]"
                          : "border-transparent text-gray-400 hover:text-[#132F45] hover:border-[#FDF2D1]"
                      }`}
                    >
                      <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'text-[#BA995D]' : ''}`} />
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="mb-6 flex flex-wrap items-center gap-3 text-[9px] uppercase tracking-[0.25em] font-black">
                {['league', 'tournament', 'both'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setStatsFilter(filter)}
                    className={`px-3 py-2 rounded-full transition-all ${
                      statsFilter === filter
                        ? 'bg-[#BA995D] text-white shadow-sm shadow-[#BA995D]/20'
                        : 'bg-[#F4F5F7] text-[#132F45] hover:bg-[#FDF2D1]'
                    }`}
                  >
                    {filter === 'both' ? 'League + Tournament' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
                <span className="text-[#6B7280] lowercase">Showing stats for {statsFilter === 'both' ? 'all competitions' : `${statsFilter} only`}</span>
              </div>
              <div className="mb-6 text-[11px] text-[#475569]">
                <span className="mr-4">Leagues: {leagueCount}</span>
                <span>Tournaments: {tournamentCount}</span>
              </div>

              {loadingStats && (
                <div className="mb-6 rounded-xl border border-[#FDF2D1] bg-[#FAFAFA] p-4 text-center text-sm text-[#6B7280]">
                  Loading updated stats...
                </div>
              )}

              {statsError && (
                <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  {statsError}
                </div>
              )}

              {(availableTabs.length === 0 || (player && Array.isArray(player.detectedSports) && player.detectedSports.length === 0)) ? (
                <div className="flex flex-col items-center justify-center py-24 text-center flex-1">
                  <div className="p-8 bg-[#FAFAFA] rounded-full mb-6 border-2 border-dashed border-[#FDF2D1]">
                    <FaDice className="w-12 h-12 text-[#FDF2D1]" />
                  </div>
                  <p className="text-[#132F45] font-black text-lg uppercase tracking-tight">No active sports detected</p>
                  <p className="text-xs text-[#BA995D] font-bold mt-2 max-w-xs mx-auto uppercase tracking-widest leading-relaxed">
                    Your stats will appear here automatically once you join and play in any league or tournament.
                  </p>
                </div>
              ) : (
                <div className="space-y-8 flex-1">
                  {(() => {
                    const stats = getSportStats(activeTab);
                    if (activeTab === "snooker") {
                      return (
                        <>
                          <div className="bg-[#132F45] rounded-2xl p-6 text-white shadow-xl relative overflow-hidden group">
                            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-[#BA995D]/20 rounded-full blur-2xl group-hover:bg-[#BA995D]/30 transition-all duration-700"></div>
                            <p className="text-[8.5px] font-black uppercase tracking-widest text-[#BA995D] mb-3">Best Break</p>
                            <p className="text-4xl font-black tracking-tighter">{stats.highestBreak || 0}</p>
                            <FaTrophy className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 opacity-5" />
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-[#FAFAFA] p-3 rounded-xl border border-gray-100 flex flex-col items-center justify-center text-center">
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Matches</span>
                              <span className="text-base font-black text-[#132F45]">{stats.matches}</span>
                            </div>
                            <div className="bg-green-50 p-3 rounded-xl border border-green-100 flex flex-col items-center justify-center text-center">
                              <span className="text-[8px] font-black text-green-400 uppercase tracking-widest mb-0.5">Wins</span>
                              <span className="text-base font-black text-green-700">{stats.wins}</span>
                            </div>
                            <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex flex-col items-center justify-center text-center">
                              <span className="text-[8px] font-black text-red-400 uppercase tracking-widest mb-0.5">Losses</span>
                              <span className="text-base font-black text-red-700">{stats.losses}</span>
                            </div>
                            <div className="bg-[#FDF2D1] p-3 rounded-xl border border-[#BA995D]/20 flex flex-col items-center justify-center text-center">
                              <span className="text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-0.5">Win %</span>
                              <span className="text-base font-black text-[#132F45]">{stats.winRate}%</span>
                            </div>
                          </div>

                          <div className="space-y-3 mt-6 pt-6 border-t border-gray-50">
                             <h4 className="text-[8.5px] font-black text-[#132F45] uppercase tracking-widest px-1">Performance Details</h4>
                             <div className="grid grid-cols-2 gap-3">
                                <StatCard label="Frames Won" value={stats.frameWins} icon={FaMedal} />
                                <StatCard label="Frames Lost" value={stats.frameLosses} icon={FaDice} />
                                <StatCard label="50+ Breaks" value={stats.breaks50} icon={FaBullseye} />
                                <StatCard label="100+ Breaks" value={stats.breaks100} icon={FaTrophy} />
                             </div>
                          </div>
                        </>
                      );
                    }
                    if (activeTab === "pool") {
                      return (
                        <div className="space-y-8">
                          <div className="grid grid-cols-2 gap-6">
                          <div className="grid grid-cols-2 gap-5">
                            <div className="bg-[#132F45] rounded-2xl p-6 text-white relative overflow-hidden group">
                              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-bl-[4rem]"></div>
                              <p className="text-[8.5px] font-black text-[#BA995D] mb-3 uppercase tracking-widest">Rack Wins</p>
                              <p className="text-4xl font-black tracking-tighter">{stats.rackWins || 0}</p>
                            </div>
                            <div className="bg-blue-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-lg shadow-blue-500/10">
                              <p className="text-[8.5px] font-black text-blue-200 mb-3 uppercase tracking-widest">Win Percentage</p>
                              <p className="text-4xl font-black tracking-tighter">{stats.winRate}%</p>
                            </div>
                          </div>
                          </div>
                          
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            <StatCard label="Matches" value={stats.matches} icon={FaChartLine} />
                            <StatCard label="Match Wins" value={stats.wins} icon={FaTrophy} />
                            <StatCard label="Match Losses" value={stats.losses} icon={FaChartLine} />
                            <StatCard label="Rack Diff" value={stats.rackDiff >= 0 ? `+${stats.rackDiff}` : stats.rackDiff} icon={FaChartLine} />
                            <StatCard label="7-Ball Wins" value={stats.sevenBallWins} icon={FaBullseye} />
                            <StatCard label="Balls Potted" value={stats.ballsPotted} icon={FaCircle} />
                          </div>
                        </div>
                      );
                    }
                    if (activeTab === "pooker") {
                      return (
                        <div className="space-y-6">
                           <div className="bg-gradient-to-br from-[#132F45] to-[#1a3f5c] rounded-2xl p-7 text-white shadow-xl overflow-hidden relative group">
                             <div className="absolute -right-8 -bottom-8 bg-[#BA995D] w-40 h-40 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-all duration-700"></div>
                             <p className="text-[8.5px] font-black text-[#BA995D] mb-3 uppercase tracking-widest">Total Points</p>
                             <p className="text-5xl font-black tracking-tighter">{stats.totalPoints || 0}</p>
                             <FaDice className="absolute right-8 top-1/2 -translate-y-1/2 w-14 h-14 opacity-5" />
                           </div>

                           <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                              <StatCard label="Leagues" value={stats.matches} icon={FaTrophy} />
                              <StatCard label="Win %" value={`${stats.winRate || 0}%`} icon={FaChartLine} />
                              <StatCard label="Frames Won" value={stats.frameWins} icon={FaMedal} />
                              <StatCard label="Frames Lost" value={stats.frameLosses} icon={FaDice} />
                              <StatCard label="Balls Potted" value={stats.ballsPotted} icon={FaCircle} />
                              <StatCard label="Black Finishes" value={stats.blackFinishes} icon={FaBullseye} />
                           </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {/* Titles & Achievements Section */}
              {allTitles.length > 0 && (
                <div className="mt-8 pt-8 border-t border-gray-50/50">
                  <h3 className="text-[8.5px] font-black text-[#132F45] uppercase tracking-widest mb-5 flex items-center gap-2.5">
                    <FaMedal className="text-[#BA995D] text-xs" /> My Trophies
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {allTitles.map((t, i) => (
                      <div key={i} className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300 ${t.isNew ? 'bg-gradient-to-r from-[#FDF2D1] to-[#FAFAFA] border-[#BA995D]/20 shadow-lg shadow-[#BA995D]/5' : 'bg-[#FAFAFA] border-gray-50 hover:border-[#FDF2D1] hover:shadow-lg hover:shadow-[#132F45]/5'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-lg shadow-sm transition-transform group-hover:scale-110 duration-300 ${t.isNew ? 'bg-[#BA995D] text-white shadow-lg shadow-[#BA995D]/20' : 'bg-[#132F45] text-[#BA995D]'}`}>
                            <FaTrophy className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[11px] font-black text-[#132F45] uppercase tracking-tight leading-tight">
                              {t.title}
                              {t.isNew && <span className="ml-2 vertical-middle text-[7px] bg-[#BA995D] text-white px-1.5 py-0.5 rounded-full font-black animate-pulse shadow-sm shadow-[#BA995D]/30 inline-flex items-center gap-1"><FaTrophy className="text-[6px]" /> NEW</span>}
                            </p>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">{t.leagueName}</p>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <p className="text-[9px] font-black text-[#BA995D] uppercase tracking-widest italic">{t.sport}</p>
                          <p className="text-[9px] text-gray-400 font-bold mt-0.5">{new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
