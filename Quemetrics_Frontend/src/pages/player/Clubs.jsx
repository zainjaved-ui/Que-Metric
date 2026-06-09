import React, { useState, useEffect, useCallback, useContext } from 'react';
import { Tab } from '@headlessui/react';
import { Users, Check, Search, X, Crown, Calendar, MapPin, ArrowRight, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaArrowRight } from 'react-icons/fa';
import apiClient from '../../contexts/apiClient';
import { AuthContext } from '../../contexts/AuthContext';
const PlayerClubsPage = () => {
  const { user } = useContext(AuthContext);
  const isAuthenticated = !!user;

  // States
  const [clubs, setClubs] = useState([]);
  const [myClubs, setMyClubs] = useState([]);
  const [rejectedClubs, setRejectedClubs] = useState([]);
  const [pendingClubs, setPendingClubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [myClubsLoading, setMyClubsLoading] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [clubCode, setClubCode] = useState('');
  const [foundPrivateClub, setFoundPrivateClub] = useState(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [joiningClub, setJoiningClub] = useState(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [justJoinedClub, setJustJoinedClub] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Toast helper
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  const fetchPublicClubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/clubs?visibility=public&status=active');
      if (res.data.success) {
        const fetched = res.data.data || [];

        // If we have a logged-in user, deterministically move clubs where the
        // user's email appears in the club.players (or creator) into myClubs
        if (user && user.email) {
          const autoMy = fetched.filter((club) => {
            try {
              const players = Array.isArray(club.players) ? club.players : [];
              const normalizedUserEmail = user.email.toLowerCase();
              // Only promote to My Clubs if the user has an ACTIVE membership.
              // Rejected / pending entries must stay in the public list so the
              // correct status badge is shown there.
              return (
                players.some(
                  (p) =>
                    p.email &&
                    p.email.toLowerCase() === normalizedUserEmail &&
                    p.status === 'active'
                ) ||
                (club.creator && club.creator.id === user.id)
              );
            } catch (e) {
              return false;
            }
          });

          const autoMyIds = new Set(autoMy.map((c) => c.id));

          // public list should exclude those auto-promoted clubs
          const filtered = fetched.filter((c) => !autoMyIds.has(c.id));
          setClubs(filtered);

          if (autoMy.length > 0) {
            setMyClubs((prev) => {
              const existingIds = new Set(prev.map((c) => c.id));
              const toAdd = autoMy.filter((c) => !existingIds.has(c.id));
              return [...prev, ...toAdd];
            });
          }
        } else {
          // no logged-in user, just show all public clubs
          setClubs(fetched);
        }
      }
    } catch (err) {
      showToast('Failed to load clubs', 'error');
      console.error('Fetch clubs error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchMyClubs = useCallback(async () => {
    // Only fetch if user is authenticated
    if (!isAuthenticated) {
      console.log('[fetchMyClubs] User not authenticated, clearing clubs');
      setMyClubs([]);
      return;
    }

    setMyClubsLoading(true);
    try {
      const res = await apiClient.get('/clubs/my-clubs');
      console.log('[fetchMyClubs] Response:', res.data);
      if (res.data.success) {
        const clubsData = res.data.data || [];
        console.log('[fetchMyClubs] Setting myClubs with', clubsData.length, 'clubs');
        setMyClubs(clubsData);
      }
    } catch (err) {
      console.error('Fetch my clubs error:', err);
      setMyClubs([]); // Clear state on error
    } finally {
      setMyClubsLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch membership requests to identify rejected and pending clubs
  const fetchMembershipRequests = useCallback(async () => {
    setMembershipLoading(true);
    try {
      const res = await apiClient.get('/clubs/membership-requests');
      if (res.data.success) {
        const requests = res.data.data || [];

        // Separate into rejected and pending
        const rejected = requests.filter(req => req.membershipStatus === 'rejected');
        const pending = requests.filter(req => req.membershipStatus === 'pending');

        setRejectedClubs(rejected);
        setPendingClubs(pending);
      }
    } catch (err) {
      console.error('Fetch membership requests error:', err);
    } finally {
      setMembershipLoading(false);
    }
  }, []);

  // Load clubs on mount
  useEffect(() => {
    fetchPublicClubs();
    fetchMyClubs();
    fetchMembershipRequests();
  }, [fetchPublicClubs, fetchMyClubs, fetchMembershipRequests]);

  // Refresh lists when page/tab becomes visible (user switches back from org dashboard)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible - refresh all lists
        fetchPublicClubs();
        fetchMyClubs();
        fetchMembershipRequests();
      }
    };

    const handleFocus = () => {
      // Window focus - refresh all lists
      fetchPublicClubs();
      fetchMyClubs();
      fetchMembershipRequests();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchPublicClubs, fetchMyClubs, fetchMembershipRequests]);

  // Validate club code and get club info
  const validateClubCode = async () => {
    if (!clubCode.trim()) {
      showToast('Please enter a club code', 'error');
      return;
    }

    setValidatingCode(true);
    setFoundPrivateClub(null);

    try {
      const res = await apiClient.post('/clubs/validate-code', {
        code: clubCode.trim().toUpperCase()
      });

      if (res.data.success) {
        setFoundPrivateClub(res.data.data);
        showToast('Club found! You can now join.', 'success');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Invalid club code';
      showToast(errorMsg, 'error');
      setFoundPrivateClub(null);
    } finally {
      setValidatingCode(false);
    }
  };

  // Join public club
  const joinPublicClub = async (clubId, clubName) => {
    if (!isAuthenticated) {
      showToast('Please login to join clubs', 'error');
      setTimeout(() => {
        window.location.href = `/login?redirect=/player/clubs`;
      }, 1500);
      return;
    }

    setJoiningClub(clubId);

    try {
      const res = await apiClient.post(`/clubs/join/${clubId}`);
      if (res.data.success) {
        // Show success animation
        setJustJoinedClub({ id: clubId, name: clubName });
        setShowSuccessAnimation(true);
        showToast(`⏳ Your request to join ${clubName} is  approved!`, 'info');

        // Refresh all lists after animation
        setTimeout(() => {
          fetchPublicClubs();
          fetchMyClubs();
          fetchMembershipRequests();
          setShowSuccessAnimation(false);
          setJustJoinedClub(null);
        }, 2000);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to join club';
      showToast(errorMsg, 'error');
    } finally {
      setJoiningClub(null);
    }
  };

  // Join private club via code
  const joinPrivateClub = async () => {
    if (!isAuthenticated) {
      showToast('Please login to join clubs', 'error');
      setTimeout(() => {
        window.location.href = `/login?redirect=/player/clubs`;
      }, 1500);
      return;
    }

    if (!clubCode.trim()) {
      showToast('Please enter a club code', 'error');
      return;
    }

    setJoiningClub(foundPrivateClub.id);

    try {
      const res = await apiClient.post(`/clubs/join-by-code`, {
        code: clubCode.trim().toUpperCase()
      });

      if (res.data.success) {
        // Show success animation
        setJustJoinedClub({ id: foundPrivateClub.id, name: foundPrivateClub.name });
        setShowSuccessAnimation(true);
        showToast(`⏳ Your request to join ${foundPrivateClub.name} is  approved!`, 'info');

        // Clear the form and refresh lists
        setTimeout(() => {
          setClubCode('');
          setFoundPrivateClub(null);
          fetchPublicClubs();
          fetchMyClubs();
          fetchMembershipRequests();
          setShowSuccessAnimation(false);
          setJustJoinedClub(null);
        }, 2000);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to join club';
      showToast(errorMsg, 'error');
    } finally {
      setJoiningClub(null);
    }
  };

  const clearPrivateClubSearch = () => {
    setClubCode('');
    setFoundPrivateClub(null);
  };

  // Check if club is already joined or owned by current user
  const isClubJoined = (clubId) => {
    return myClubs.some(club => club.id === clubId);
  };

  // Check if club request was rejected
  const isClubRejected = (clubId) => {
    return rejectedClubs.some(club => club.clubId === clubId);
  };

  // Check if club request is pending
  const isClubPending = (clubId) => {
    return pendingClubs.some(club => club.clubId === clubId);
  };

  // Filter clubs to exclude already joined ones OR clubs where user is creator/member
  const availablePublicClubs = clubs.filter((club) => {
    // If already in myClubs, exclude
    if (isClubJoined(club.id)) return false;

    // If logged in, hide from public list only for creators and ACTIVE members.
    // Rejected / pending members stay in the public list so their status badge
    // ("Rejected" / "Pending Approval") is visible.
    if (user && user.id) {
      // Creator check
      if (club.creator && club.creator.id === user.id) return false;

      // Players array (populated by backend) — only exclude active members
      try {
        const players = Array.isArray(club.players) ? club.players : [];
        if (
          players.some(
            (p) =>
              (p.userId === user.id || p.id === user.id) &&
              p.status === 'active'
          )
        )
          return false;
      } catch (e) {
        // ignore parse errors
      }
    }

    // Show all clubs (including those with rejected/pending requests)
    return true;
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-6 right-6 z-[60] px-6 py-4 rounded-2xl shadow-2xl text-white font-black text-[10px] uppercase tracking-widest animate-slide-in flex items-center gap-3 border-2 ${
          toast.type === 'success' ? 'bg-[#132F45] border-[#BA995D]' : 'bg-red-600 border-red-400'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4 text-[#BA995D]" /> : <X className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-[#132F45] pt-6 pb-12 relative overflow-hidden">
        {/* Abstract background accents */}
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-tr-[5rem] -ml-16 -mb-16 pointer-events-none" />
        
        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D] mb-3 flex items-center gap-3">
                <div className="w-6 h-[1px] bg-[#BA995D]" /> Club Registry & Directory
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-none">
                Community <span className="text-[#BA995D]">Hubs</span>
              </h1>
              <p className="text-white/30 font-black text-[8px] uppercase tracking-[0.2em] mt-3.5 max-w-md leading-relaxed">
                Connect with local venues, join competitive circles, and manage your memberships.
              </p>
            </div>

            {/* Quick Stats Strip */}
            <div className="flex gap-2 flex-wrap pb-1">
              {[
                { label: 'Public Circles', val: clubs.length, icon: Users, color: 'text-blue-400' },
                { label: 'My Memberships', val: myClubs.length, icon: Crown, color: 'text-[#BA995D]' },
              ].map((s, i) => (
                <div key={i} className="bg-white/5 border border-white/10 backdrop-blur-md px-4 py-3 rounded-2xl flex items-center gap-3">
                  <div className={`p-2 rounded-xl bg-white/10 ${s.color}`}>
                    <s.icon size={12} />
                  </div>
                  <div>
                    <p className="text-[7px] font-black uppercase tracking-widest text-white/30 leading-none mb-1">{s.label}</p>
                    <p className="text-sm font-black text-white leading-none">{s.val}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-20 -mt-6">

        {/* Tab Navigation */}
        <Tab.Group>
          <Tab.List className="flex items-center gap-1.5 p-1.5 bg-white border border-gray-100 rounded-3xl shadow-xl shadow-[#132F45]/5 mb-10 w-full overflow-x-auto no-scrollbar">
            {[
              { label: 'Public Circles', count: availablePublicClubs.length },
              { label: 'Invitation Code', count: null },
              { label: 'My Registry', count: myClubs.length }
            ].map((tab, idx) => (
              <Tab
                key={idx}
                className={({ selected }) =>
                  `flex-1 min-w-[120px] py-4 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 outline-none
                  ${selected
                    ? 'bg-[#132F45] text-white shadow-xl shadow-[#132F45]/20 scale-[1.02] z-10'
                    : 'text-gray-400 hover:text-[#132F45] hover:bg-[#FAFAFA]'
                  }`
                }
              >
                <div className="flex items-center justify-center gap-2">
                   {tab.label}
                   {tab.count !== null && (
                     <span className={`px-2 py-0.5 rounded-full text-[7px] ${tab.count > 0 ? 'bg-[#BA995D] text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {tab.count}
                     </span>
                   )}
                </div>
              </Tab>
            ))}
          </Tab.List>

          <Tab.Panels>
            {/* Public Clubs Panel */}
            <Tab.Panel>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : availablePublicClubs.length === 0 ? (
                <div className="bg-white rounded-xl shadow-md p-12 text-center">
                  <Users className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No public clubs available
                  </h3>
                  <p className="text-gray-600">
                    {clubs.length > 0 ? "You've already joined all available public clubs!" : "Check back later or try joining a private club with a code"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availablePublicClubs.map((club) => {
                    let sportTypes = [];
                    try {
                      if (club.sportTypes) {
                        sportTypes = typeof club.sportTypes === 'string' ? JSON.parse(club.sportTypes) : club.sportTypes;
                      }
                    } catch (e) { sportTypes = []; }
                    if (!Array.isArray(sportTypes)) {
                      sportTypes = club.sportType ? [club.sportType] : [];
                    }

                    return (
                      <div
                        key={club.id}
                        className="bg-white rounded-[2.5rem] border border-gray-50 shadow-xl shadow-[#132F45]/5 overflow-hidden group hover:shadow-2xl hover:shadow-[#132F45]/10 outline outline-1 outline-[#FDF2D1] transition-all duration-500"
                      >
                        <div className="p-8">
                          <div className="flex justify-between items-start mb-6">
                             <div className="p-4 bg-[#FAFAFA] rounded-2xl text-[#132F45] group-hover:bg-[#132F45] group-hover:text-[#BA995D] transition-colors duration-500 shadow-inner">
                                <Users size={18} />
                             </div>
                             <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[8px] font-black uppercase tracking-widest border border-blue-100">
                                Public Circle
                             </span>
                          </div>

                          <h2 className="text-xl font-black text-[#132F45] uppercase tracking-tighter mb-2 group-hover:text-[#BA995D] transition-colors">
                            {club.name}
                          </h2>
                          <div className="flex items-center gap-2 mb-6">
                             <Users className="w-3 h-3 text-[#BA995D]" />
                             <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{club.memberCount || 0} Unified Members</span>
                          </div>

                          <p className="text-[10px] text-gray-400 font-bold leading-relaxed mb-8 line-clamp-2 uppercase">
                            {club.description || 'Access exclusive competitive sessions and league standings within this public circle.'}
                          </p>

                          <div className="flex flex-wrap gap-2 mb-8">
                             {sportTypes.map((sport, idx) => (
                               <span key={idx} className="px-3 py-1.5 bg-[#FAFAFA] border border-gray-100 rounded-xl text-[8px] font-black text-[#132F45] uppercase tracking-widest group-hover:border-[#FDF2D1] transition-colors capitalize">
                                  {sport}
                               </span>
                             ))}
                          </div>

                          <button
                            onClick={() => joinPublicClub(club.id, club.name)}
                            disabled={joiningClub === club.id}
                            className={`w-full py-4 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-3 shadow-xl ${
                              joiningClub === club.id 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                : 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/20'
                            }`}
                          >
                            {joiningClub === club.id ? (
                               <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-300 border-t-gray-500" />
                            ) : (
                               <>Request Admission <FaArrowRight size={8} /></>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Tab.Panel>

            {/* Private Clubs Panel */}
            <Tab.Panel>
              <div className="max-w-xl mx-auto py-10">
                <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-2xl shadow-[#132F45]/10 overflow-hidden outline outline-1 outline-[#FDF2D1]">
                  <div className="p-10">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="p-4 bg-[#132F45] rounded-2xl text-[#BA995D]">
                          <Search size={20} />
                       </div>
                       <div>
                          <h3 className="text-xl font-black text-[#132F45] uppercase tracking-tighter leading-none mb-1.5">Search Protocol</h3>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Connect via Private Admission Code</p>
                       </div>
                    </div>

                    <div className="space-y-6">
                      <div className="relative group">
                        <input
                          type="text"
                          value={clubCode}
                          onChange={(e) => setClubCode(e.target.value.toUpperCase())}
                          placeholder="ENTER CIRCLE CODE"
                          className="w-full pl-6 pr-14 py-5 bg-[#FAFAFA] border-2 border-gray-50 rounded-2xl focus:ring-4 focus:ring-[#BA995D]/10 focus:border-[#BA995D] transition-all font-black text-sm uppercase tracking-widest placeholder:text-gray-200 outline-none"
                          maxLength={20}
                          disabled={validatingCode}
                        />
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 bg-white p-2 rounded-lg text-gray-300">
                           <Search size={14} />
                        </div>
                      </div>

                      <button
                        onClick={validateClubCode}
                        disabled={validatingCode || !clubCode.trim()}
                        className={`w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-300 shadow-xl flex items-center justify-center gap-3 ${
                          validatingCode || !clubCode.trim()
                            ? 'bg-gray-50 text-gray-300'
                            : 'bg-[#132F45] text-white hover:bg-[#1c4566] shadow-[#132F45]/20'
                        }`}
                      >
                        {validatingCode ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" /> : 'Initialise Find'}
                      </button>
                    </div>

                    {/* Found Private Club */}
                    <AnimatePresence>
                      {foundPrivateClub && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="mt-10 border-2 border-[#FDF2D1] bg-[#FDF2D1]/20 rounded-3xl p-8 relative"
                        >
                          <button onClick={clearPrivateClubSearch} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors">
                             <X size={16} />
                          </button>

                          <div className="flex items-center gap-4 mb-6">
                             <div className="p-3 bg-[#BA995D] rounded-xl text-white shadow-lg shadow-[#BA995D]/20">
                                <Crown size={16} />
                             </div>
                             <div>
                                <h4 className="font-black text-lg text-[#132F45] uppercase tracking-tighter leading-none mb-1">{foundPrivateClub.name}</h4>
                                <span className="text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Private Admission Circle</span>
                             </div>
                          </div>

                          <div className="space-y-1 mb-8">
                             <div className="flex items-center gap-2">
                                <Users size={10} className="text-gray-400" />
                                <span className="text-[9px] font-extrabold text-gray-500 uppercase tracking-widest">{foundPrivateClub.memberCount || 0} Registered Members</span>
                             </div>
                          </div>

                          <button
                            onClick={joinPrivateClub}
                            disabled={joiningClub === foundPrivateClub.id}
                            className={`w-full py-4 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-3 shadow-xl ${
                              joiningClub === foundPrivateClub.id 
                                ? 'bg-gray-100 text-gray-400' 
                                : 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/20'
                            }`}
                          >
                            {joiningClub === foundPrivateClub.id ? (
                               <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />
                            ) : (
                               <>Confirm Join Request <FaArrowRight size={8} /></>
                            )}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </Tab.Panel>

            {/* My Clubs Panel */}
            <Tab.Panel>
              {myClubsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
                </div>
              ) : myClubs.length === 0 ? (
                <div className="bg-white rounded-xl shadow-md p-12 text-center">
                  <Users className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    You haven't joined any clubs yet
                  </h3>
                  <p className="text-gray-600">
                    Browse public clubs or use a private club code to get started
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {myClubs.map((club) => {
                    let sportTypes = [];
                    try {
                      if (club.sportTypes) {
                        sportTypes = typeof club.sportTypes === 'string' ? JSON.parse(club.sportTypes) : club.sportTypes;
                      }
                    } catch (e) { sportTypes = []; }
                    if (!Array.isArray(sportTypes)) {
                      sportTypes = club.sportType ? [club.sportType] : [];
                    }

                    return (
                      <div
                        key={club.id}
                        className="bg-white rounded-[2.5rem] border-2 border-[#BA995D] shadow-2xl shadow-[#BA995D]/10 overflow-hidden group hover:-translate-y-2 transition-all duration-500"
                      >
                        <div className="p-8">
                          <div className="flex justify-between items-start mb-6">
                             <div className="p-4 bg-[#132F45] rounded-2xl text-[#BA995D] shadow-lg shadow-[#132F45]/20">
                                <Crown size={18} />
                             </div>
                             <span className="px-3 py-1 bg-[#FDF2D1] text-[#BA995D] rounded-full text-[8px] font-black uppercase tracking-widest border border-[#BA995D]/20 flex items-center gap-1.5">
                                <Check size={8} /> Active Membership
                             </span>
                          </div>

                          <h2 className="text-xl font-black text-[#132F45] uppercase tracking-tighter mb-2">
                             {club.name}
                          </h2>
                          <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-6">CM-CIRCLE-#{club.id.toString().slice(-6)}</p>

                          <div className="grid grid-cols-2 gap-3 mb-8">
                             <div className="p-3 bg-[#FAFAFA] rounded-2xl text-center">
                                <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Registry Role</p>
                                <p className="text-[9px] font-black text-[#132F45] uppercase">{club.myRole ? club.myRole.replace('_', ' ') : 'Member'}</p>
                             </div>
                             <div className="p-3 bg-[#FAFAFA] rounded-2xl text-center">
                                <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Admission</p>
                                <p className="text-[9px] font-black text-[#132F45] uppercase">{club.joinedAt ? new Date(club.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'Verified'}</p>
                             </div>
                          </div>

                          <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-[#BA995D] pt-4 border-t border-gray-50">
                             <span className="flex items-center gap-2">
                                <Users size={10} /> {club.memberCount || 0} Unified
                             </span>
                             <span className="text-gray-300 italic">Access Verified</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Tab.Panel>

            {/* Requests Tab - Pending and Rejected */}
            <Tab.Panel>
              {membershipLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
                </div>
              ) : rejectedClubs.length === 0 && pendingClubs.length === 0 ? (
                <div className="bg-white rounded-xl shadow-md p-12 text-center">
                  <Users className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No pending or rejected requests
                  </h3>
                  <p className="text-gray-600">
                    You're all set! All your club requests have been processed.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Rejected Clubs Section */}
                  {rejectedClubs.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 px-2">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Rejected Requests ({rejectedClubs.length})
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {rejectedClubs.map((request) => (
                          <div
                            key={request.membershipId}
                            className="bg-white rounded-xl shadow-md overflow-hidden border-2 border-red-200"
                          >
                            {/* Club Header */}
                            <div className="bg-gradient-to-r from-red-600 to-red-700 p-4 text-white">
                              <div className="flex items-start justify-between">
                                <h2 className="font-bold text-lg mb-1">{request.clubName}</h2>
                                <span className="px-2 py-1 rounded-full text-xs bg-red-300 text-red-900 font-medium flex items-center gap-1">
                                  <X className="h-3 w-3" />
                                  Rejected
                                </span>
                              </div>
                            </div>

                            {/* Club Body */}
                            <div className="p-4">
                              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                                {request.clubDescription || 'No description available'}
                              </p>

                              <div className="bg-red-50 text-red-700 text-center py-3 rounded-lg text-sm font-medium border border-red-200">
                                <div className="flex items-center justify-center gap-2">
                                  <AlertCircle className="h-4 w-4" />
                                  <span>Your join request was rejected</span>
                                </div>
                                {request.updatedAt && (
                                  <p className="text-xs text-red-600 mt-1">
                                    {new Date(request.updatedAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending Clubs Section */}
                  {pendingClubs.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 px-2">
                        <Calendar className="h-5 w-5 text-yellow-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Pending Approval ({pendingClubs.length})
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pendingClubs.map((request) => (
                          <div
                            key={request.membershipId}
                            className="bg-white rounded-xl shadow-md overflow-hidden border-2 border-yellow-200"
                          >
                            {/* Club Header */}
                            <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 p-4 text-white">
                              <div className="flex items-start justify-between">
                                <h2 className="font-bold text-lg mb-1">{request.clubName}</h2>
                                <span className="px-2 py-1 rounded-full text-xs bg-yellow-300 text-yellow-900 font-medium flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Pending
                                </span>
                              </div>
                            </div>

                            {/* Club Body */}
                            <div className="p-4">
                              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                                {request.clubDescription || 'No description available'}
                              </p>

                              <div className="bg-yellow-50 text-yellow-700 text-center py-3 rounded-lg text-sm font-medium border border-yellow-200">
                                <div className="flex items-center justify-center gap-2">
                                  <Calendar className="h-4 w-4" />
                                  <span>Awaiting Club Admin Approval</span>
                                </div>
                                {request.joinedAt && (
                                  <p className="text-xs text-yellow-600 mt-1">
                                    Requested {new Date(request.joinedAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  );
};

export default PlayerClubsPage;
