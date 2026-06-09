import { OrganizationContext } from '../../../../contexts/OrganizationContext';
import { AuthContext } from '../../../../contexts/AuthContext';
import React, { useState, useRef, useEffect, useCallback , useContext } from 'react';
import {
  CheckCircle, AlertCircle, XCircle, MoreVertical, Plus, Search,
  Grid, List, Edit, MapPin, Users, Link as LinkIcon, Key, DoorOpen,
  Trash2, Archive, PauseCircle, PlayCircle, Camera, X, ChevronDown,
  Loader, Mail, Phone, User, Home, Calendar
} from 'lucide-react';


import apiClient from '../../../../contexts/apiClient';
import { getImageUrl } from '../../../../utils/imageUtils';
import { useNavigate } from 'react-router-dom';

const ClubManagement = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  // Context - Backend Integration
  const {
    clubs,
    loading,
    organization,
    getClubs,
    getProfile,
    createClub,
    updateClub,
    archiveClub,
    suspendClub,
    reactivateClub,
    canDeleteClub,
    permanentlyDeleteClub,
    generateInvitationLink,
    updateJoinSettings,
    getClubMembers,
    removeClubMember,
    updateMemberRole,
  } = useContext(OrganizationContext);

  // State
  const [viewMode, setViewMode] = useState('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sportFilter, setSportFilter] = useState('All');
  const [verificationFilter, setVerificationFilter] = useState('All');

  // Games state (dynamic from backend) – used only for dropdown display
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  // UI states
  const [localLoading, setLocalLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingClub, setEditingClub] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showVenuesModal, setShowVenuesModal] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [selectedClub, setSelectedClub] = useState(null);

  // Players/Members state
  const [clubMembers, setClubMembers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  // Venues state
  const [venues, setVenues] = useState([]);
  const [venueForm, setVenueForm] = useState({});
  const [editingVenue, setEditingVenue] = useState(null);
  const [showVenueForm, setShowVenueForm] = useState(false);

  // Dropdown menu state
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  // Form state for create/edit – sportTypes now stores sport names (lowercase)
  const [clubForm, setClubForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    sportTypes: [], // will hold lowercase names e.g. ['snooker', 'pool']
    description: '',
    // logoUrl: '',
    visibility: 'private'
  });

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clubToDelete, setClubToDelete] = useState(null);
  const [superAdminPassword, setSuperAdminPassword] = useState('');

  // Invitation data
  const [invitationData, setInvitationData] = useState(null);

  // Ref to prevent multiple initial loads
  const initialLoadDone = useRef(false);

  // ** New state for page-level loader **
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Helper to truncate address to first two words
  const truncateToTwoWords = (text) => {
    if (!text) return '';
    const words = text.split(' ').filter(word => word.length > 0);
    if (words.length <= 2) return text;
    return words.slice(0, 2).join(' ') + '...';
  };

  // Toast helper
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // Fetch games from backend – we store them for dropdown display only
  const fetchGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const response = await apiClient.get('/organization/games');
      if (response.data?.success) {
        const gamesData = response.data.data || [];
        setGames(gamesData);
      } else {
        console.error('Failed to fetch games:', response.data?.error);
      }
    } catch (err) {
      console.error('Failed to fetch games:', err);
    } finally {
      setGamesLoading(false);
    }
  }, []);

  // Load clubs on mount
  const loadClubs = useCallback(async () => {
    setLoadError(null);
    const result = await getClubs();
    if (!result.success) {
      const msg = result.error || 'Failed to load clubs. Please restart the backend server and try again.';
      setLoadError(msg);
    }
  }, [getClubs]);

  const loadClubMembers = useCallback(async () => {
    if (!selectedClub) return;
    setLocalLoading(true);
    try {
      const result = await getClubMembers(selectedClub.id);
      if (result.success) {
        const normalized = result.data.map(m => ({
          ...m,
          status: m.status || 'pending',
          joinMethod: m.joinMethod || 'public'
        }));
        const approved = normalized.filter(m => m.status === 'active');
        const pending = normalized.filter(m => m.status === 'pending');
        setClubMembers(approved);
        setPendingRequests(pending);
      }
    } catch (err) {
      showToast('Failed to load members', 'error');
    } finally {
      setLocalLoading(false);
    }
  }, [selectedClub, getClubMembers]);

  const loadVenues = useCallback(async () => {
    if (!selectedClub) return;
    setLocalLoading(true);
    try {
      const response = await apiClient.get(`/clubs/${selectedClub.id}/venues`);
      if (response.data.success) {
        setVenues(response.data.data || []);
      }
    } catch (err) {
      showToast('Failed to load venues', 'error');
    } finally {
      setLocalLoading(false);
    }
  }, [selectedClub]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ** Modified: Load clubs and games on mount with page loader **
  useEffect(() => {
    let isMounted = true;
    setPageLoading(true);

    const loadInitialData = async () => {
      try {
        // Wait for both data sources to load
        console.log('[ClubManagement] Starting to load initial data');
        await Promise.all([loadClubs(), fetchGames(), getProfile()]);
        console.log('[ClubManagement] Initial data loaded successfully');
      } catch (error) {
        console.error('Error loading initial data:', error);
        // Optionally show a toast, but existing logic already does that
      } finally {
        if (isMounted) {
          setPageLoading(false);
        }
      }
    };

    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadInitialData();
    } else {
      // If data was already loaded in a previous mount (shouldn't happen),
      // we still need to turn off the loader.
      setPageLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [loadClubs, fetchGames, getProfile]); // Dependencies stay the same

  // Load club members when Players modal opens
  useEffect(() => {
    if (showPlayersModal && selectedClub) {
      (async () => {
        setLocalLoading(true);
        try {
          const result = await getClubMembers(selectedClub.id);
          if (result.success) {
            const normalized = result.data.map(m => ({
              ...m,
              status: m.status || 'pending',
              joinMethod: m.joinMethod || 'public'
            }));
            const approved = normalized.filter(m => m.status === 'active');
            const pending = normalized.filter(m => m.status === 'pending');
            setClubMembers(approved);
            setPendingRequests(pending);
          }
        } catch (err) {
          showToast('Failed to load members', 'error');
        } finally {
          setLocalLoading(false);
        }
      })();
    }
  }, [showPlayersModal, selectedClub, getClubMembers]);

  // Load venues when Venues modal opens
  useEffect(() => {
    if (showVenuesModal && selectedClub) {
      (async () => {
        setLocalLoading(true);
        try {
          const response = await apiClient.get(`/clubs/${selectedClub.id}/venues`);
          if (response.data.success) {
            setVenues(response.data.data || []);
          }
        } catch (err) {
          showToast('Failed to load venues', 'error');
        } finally {
          setLocalLoading(false);
        }
      })();
    }
  }, [showVenuesModal, selectedClub]);

  // Filters
  const filteredClubs = clubs.filter(club => {
    const matchesSearch = club.name.toLowerCase().includes(search.toLowerCase()) ||
                         (club.email || '').toLowerCase().includes(search.toLowerCase()) ||
                         (club.address || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || club.status === statusFilter.toLowerCase();
    // sportTypes is an array of names (lowercase) – compare with sportFilter (which is also a name or 'All')
    const matchesSport = sportFilter === 'All' ||
      (Array.isArray(club.sportTypes) && club.sportTypes.includes(sportFilter.toLowerCase()));
    const matchesVerification = verificationFilter === 'All' ||
      (verificationFilter === 'verified' && club.isVerified) ||
      (verificationFilter === 'pending' && !club.isVerified);

    // Disable the player exclusion check for Organization owners.
    // They own all the clubs they created across the organization.
    return matchesSearch && matchesStatus && matchesSport && matchesVerification;
  });

  console.log(`[ClubManagement] Total clubs: ${clubs.length}, Filtered clubs: ${filteredClubs.length}`);

  // Handlers
  const handleCreateClub = async (e) => {
    e.preventDefault();

    if (!clubForm.sportTypes || clubForm.sportTypes.length === 0) {
      showToast('Please select at least one sport type', 'error');
      return;
    }

    if (clubForm.phone && !/^\d{11}$/.test(clubForm.phone)) {
      showToast('Phone number must be exactly 11 digits', 'error');
      return;
    }

    setLocalLoading(true);
    try {
      await createClub(clubForm);
      setShowCreateModal(false);
      resetClubForm();
      showToast('Club created successfully!');
    } catch (error) {
      showToast(error.message || 'Failed to create club', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleEditClub = async (e) => {
    e.preventDefault();
    if (!editingClub) return;

    if (!clubForm.sportTypes || clubForm.sportTypes.length === 0) {
      showToast('Please select at least one sport type', 'error');
      return;
    }

    if (clubForm.phone && !/^\d{11}$/.test(clubForm.phone)) {
      showToast('Phone number must be exactly 11 digits', 'error');
      return;
    }

    setLocalLoading(true);
    try {
      await updateClub(editingClub.id, clubForm);
      setEditingClub(null);
      setShowCreateModal(false);
      resetClubForm();
      showToast('Club updated successfully!');
    } catch (error) {
      showToast(error.message || 'Failed to update club', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const resetClubForm = () => {
    setClubForm({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      sportTypes: [],
      description: '',
      // logoUrl: '',
      visibility: 'private'
    });
  };

  const openEditModal = (club) => {
    setEditingClub(club);

    // Parse sportTypes – it should already be an array of names (lowercase) from the API
    let parsedSportTypes = [];
    try {
      if (club.sportTypes) {
        parsedSportTypes = typeof club.sportTypes === 'string' ? JSON.parse(club.sportTypes) : club.sportTypes;
      }
    } catch (e) { parsedSportTypes = []; }
    if (!Array.isArray(parsedSportTypes)) {
      parsedSportTypes = club.sportType ? [club.sportType] : [];
    }

    setClubForm({
      name: club.name,
      contactPerson: club.contactPerson || '',
      email: club.email,
      phone: club.phone,
      address: club.address,
      sportTypes: parsedSportTypes,
      description: club.description || '',
      // logoUrl: club.logoUrl || '',
      visibility: club.visibility
    });
    setShowCreateModal(true);
    setOpenMenuId(null);
  };

  const handleStatusChange = async (club, action) => {
    setLocalLoading(true);
    try {
      if (action === 'archive') {
        await archiveClub(club.id);
        showToast('Club archived successfully!');
      } else if (action === 'suspend') {
        await suspendClub(club.id);
        showToast('Club suspended successfully!');
      } else if (action === 'activate') {
        await reactivateClub(club.id);
        showToast('Club activated successfully!');
      }
    } catch (error) {
      showToast(error.message || 'Failed to update club status', 'error');
    } finally {
      setLocalLoading(false);
      setOpenMenuId(null);
    }
  };

  const confirmDelete = async (club) => {
    setLocalLoading(true);
    try {
      const result = await canDeleteClub(club.id);
      if (result.success && result.data.canDelete) {
        setClubToDelete(club);
        setShowDeleteConfirm(true);
      } else {
        showToast(result.data.reason || 'Cannot delete club with existing data', 'error');
      }
    } catch (error) {
      showToast('Failed to check delete eligibility', 'error');
    } finally {
      setLocalLoading(false);
      setOpenMenuId(null);
    }
  };

  const handleDelete = async () => {
    if (!clubToDelete) return;
    if (superAdminPassword !== 'admin123') {
      showToast('Invalid Super Admin credentials', 'error');
      return;
    }
    setLocalLoading(true);
    try {
      await permanentlyDeleteClub(clubToDelete.id);
      setShowDeleteConfirm(false);
      setClubToDelete(null);
      setSuperAdminPassword('');
      showToast('Club deleted permanently.');
    } catch (error) {
      showToast(error.message || 'Failed to delete club', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  // Invitation methods
  const handleGenerateInvitation = async (club) => {
    setLocalLoading(true);
    try {
      const result = await generateInvitationLink(club.id, 7);
      if (result.success) {
        setInvitationData(result.data);
        setSelectedClub(club);
        setShowInviteModal(true);
      }
    } catch (error) {
      showToast(error.message || 'Failed to generate invitation', 'error');
    } finally {
      setLocalLoading(false);
      setOpenMenuId(null);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  };

  const handleApproveRequest = async (clubId, requestId) => {
    setLocalLoading(true);
    try {
      await apiClient.put(`/clubs/${clubId}/members/${requestId}/status`, { status: 'active' });
      await loadClubMembers();
      showToast('Request approved, player is now active.', 'success');
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to approve request', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleRejectRequest = async (clubId, requestId) => {
    setLocalLoading(true);
    try {
      await removeClubMember(clubId, requestId);
      await loadClubMembers();
      showToast('Request rejected.', 'info');
    } catch (error) {
      showToast(error.message || 'Failed to reject request', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleRemovePlayer = async (clubId, playerId) => {
    if (!window.confirm('Remove player? Their historical data will be preserved.')) return;
    setLocalLoading(true);
    try {
      await removeClubMember(clubId, playerId);
      await loadClubMembers();
      showToast('Player removed from club.');
    } catch (error) {
      showToast(error.message || 'Failed to remove player', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleUpdateMemberStatus = async (clubId, memberId, newStatus) => {
    setLocalLoading(true);
    try {
      await apiClient.put(`/clubs/${clubId}/members/${memberId}/status`, { status: newStatus });
      await loadClubMembers();
      showToast(`Member status updated to ${newStatus}`);
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to update member status', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleMakeAdmin = async (clubId, memberId) => {
    if (!window.confirm('Promote this member to club admin?')) return;
    setLocalLoading(true);
    try {
      await updateMemberRole(clubId, memberId, { role: 'club_admin' });
      await loadClubMembers();
      showToast('Member promoted to club admin');
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to promote member', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const toggleOpenRequest = async (clubId, enabled) => {
    setLocalLoading(true);
    try {
      await updateJoinSettings(clubId, {
        method: enabled ? 'request' : 'invite',
        requireApproval: enabled
      });
      showToast(`Open request ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      showToast(error.message || 'Failed to update join settings', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  // Venue management functions
  const handleAddVenue = async () => {
    if (!selectedClub) return;
    setLocalLoading(true);
    try {
      const response = await apiClient.post(`/clubs/${selectedClub.id}/venues`, venueForm);
      if (response.data.success) {
        await loadVenues();
        setShowVenueForm(false);
        setVenueForm({});
        showToast('Venue added successfully!');
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to add venue', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleEditVenue = async () => {
    if (!editingVenue || !selectedClub) return;
    setLocalLoading(true);
    try {
      const response = await apiClient.put(`/clubs/${selectedClub.id}/venues/${editingVenue.id}`, venueForm);
      if (response.data.success) {
        await loadVenues();
        setEditingVenue(null);
        setShowVenueForm(false);
        setVenueForm({});
        showToast('Venue updated successfully!');
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to update venue', 'error');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleDeleteVenue = async (venueId) => {
    if (!selectedClub) return;
    if (window.confirm('Are you sure? This may affect historical data.')) {
      setLocalLoading(true);
      try {
        const response = await apiClient.delete(`/clubs/${selectedClub.id}/venues/${venueId}`);
        if (response.data.success) {
          await loadVenues();
          showToast('Venue deleted.');
        }
      } catch (error) {
        showToast(error.response?.data?.message || 'Failed to delete venue', 'error');
      } finally {
        setLocalLoading(false);
      }
    }
  };

  // Invitation link generators
  const getVenueOwnerInviteLink = (clubId) => {
    return `${window.location.origin}/venue-owner/invite/${clubId}`;
  };

  // Disable handler
  const handleDisable = async (club) => {
    setLocalLoading(true);
    try {
      await updateClub(club.id, { status: 'disabled' });
      showToast('Club disabled successfully!');
    } catch (error) {
      showToast(error.message || 'Failed to disable club', 'error');
    } finally {
      setLocalLoading(false);
      setOpenMenuId(null);
    }
  };

  // Render helpers
  const renderVerificationIcon = (isVerified) => {
    return isVerified ? (
      <CheckCircle className="w-5 h-5 text-green-500" title="Verified" />
    ) : (
      <AlertCircle className="w-5 h-5 text-yellow-500" title="Pending Verification" />
    );
  };

  const renderStatusBadge = (status) => {
    const classes = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      archived: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${classes[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // ** Show full-page loader while initial data is loading **
  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#132F45] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading clubs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-8">
      {/* Error Banner */}
      {loadError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-red-800 font-medium">Failed to load clubs</p>
            <p className="text-red-600 text-sm mt-1">{loadError}</p>
          </div>
          <button
            onClick={() => loadClubs()}
            className="ml-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {/* z-[99999] keeps this toast above the page modals (which are z-50 + backdrop-blur). Was: z-50 */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[99999] px-4 py-2 rounded-lg shadow-lg text-white ${
          toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Club Management</h1>
        <button
          onClick={() => {
            setEditingClub(null);
            const newForm = {
              name: '',
              contactPerson: organization?.contactPersonName || '',
              email: user?.email || '',
              phone: organization?.phoneNumber || '',
              address: '',
              sportTypes: [],
              description: '',
              // logoUrl: '',
              visibility: 'private'
            };
            setClubForm(newForm);
            setShowCreateModal(true);
          }}
          disabled={loading || localLoading}
          className="flex items-center gap-2 px-4 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#1A3F5C] disabled:opacity-50"
        >
          <Plus size={20} />
          Create New Club
        </button>
      </div>

      {/* ── High-Density Filter Bar ──────────────────────────────────── */}
      <div className="bg-[#FAFAFA] rounded-xl border border-gray-100 p-2 flex flex-wrap items-center gap-2 shadow-sm">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-[#132F45] transition-colors" size={14} />
          <input
            type="text"
            placeholder="Search by name, email or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#132F45]/10 focus:border-[#132F45] text-[#132F45] text-[11px] font-medium"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-[#132F45]"
        >
          <option value="All">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Active">Active</option>
          <option value="Archived">Archived</option>
          <option value="Suspended">Suspended</option>
        </select>
        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
        >
          <option value="All">All Sports</option>
          {games.map(game => (
            <option key={game.id} value={game.name.toLowerCase()}>{game.name}</option>
          ))}
        </select>
        <select
          value={verificationFilter}
          onChange={(e) => setVerificationFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
        >
          <option value="All">All Verification</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
        </select>
        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 ${viewMode === 'list' ? 'bg-[#132F45] text-white' : 'bg-white text-[#132F45]'}`}
          >
            <List size={20} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 ${viewMode === 'grid' ? 'bg-[#132F45] text-white' : 'bg-white text-[#132F45]'}`}
          >
            <Grid size={20} />
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl shadow-xl shadow-[#132F45]/5 border border-gray-50 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-50 bg-[#FAFAFA]/50">
                <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Club Entity</th>
                <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Status</th>
                <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Disciplines</th>
                <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Operational Detail</th>
                <th className="text-left py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Location</th>
                <th className="text-right py-2.5 px-3 text-[8px] font-black text-[#BA995D] uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredClubs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    {clubs.length > 0
                      ? 'No clubs match the current filters. Try changing your filter criteria.'
                      : 'No clubs found. Create your first club to get started!'}
                    <button
                      onClick={() => loadClubs()}
                      className="block mx-auto mt-3 px-4 py-2 text-sm text-[#132F45] border border-[#132F45] rounded-lg hover:bg-[#132F45] hover:text-white transition"
                    >
                      Reload Clubs
                    </button>
                  </td>
                </tr>
              ) : (
                filteredClubs.map((club) => (
                  <tr key={club.id} className="hover:bg-[#FAFAFA] transition-colors group">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {club.logoUrl ? (
                            <img src={getImageUrl(club.logoUrl)} alt="" className="w-8 h-8 rounded-lg object-cover ring-1 ring-gray-100 shadow-sm" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[#132F45]/5 flex items-center justify-center text-[#132F45]/30">
                              <Camera size={14} />
                            </div>
                          )}
                          <div className="absolute -top-1 -right-1">
                            {club.isVerified && (
                              <div className="bg-emerald-500 rounded-full p-0.5 ring-2 ring-white">
                                <CheckCircle size={8} className="text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-[#132F45] uppercase tracking-tight">{club.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest ${
                        club.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                        club.status === 'suspended' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
                      }`}>
                        <div className={`w-1 h-1 rounded-full mr-1.5 ${club.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {club.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          let sports = club.sportTypes;
                          if (typeof sports === 'string') {
                            try { sports = JSON.parse(sports); } catch (e) { sports = []; }
                          }
                          const displaySports = Array.isArray(sports) && sports.length > 0
                            ? sports
                            : (club.sportType ? [club.sportType] : []);

                          return displaySports.map(s => (
                            <span key={s} className="bg-[#132F45]/5 text-[#132F45] px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-tighter">
                              {s}
                            </span>
                          ));
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                      {club.contactPerson && <div><span className="font-medium">Person:</span> {club.contactPerson}</div>}
                      <div className="whitespace-nowrap text-ellipsis overflow-hidden"><Mail size={12} className="inline mr-1 text-[#132F45]" />{club.email}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={10} className="text-[#BA995D]" />
                        <span className="text-[10px] font-medium text-gray-500 truncate max-w-[100px]">{truncateToTwoWords(club.address)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => navigate(`/organization/clubmanagement/${club.id}`)}
                        disabled={club.status === 'pending'}
                        className="bg-[#132F45] text-white hover:bg-[#BA995D] px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shadow-sm group-hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#132F45]"
                      >
                        Interface
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredClubs.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-[#FAFAFA] rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-400 font-black uppercase tracking-widest text-[9px]">Registry currently empty</p>
            </div>
          ) : (
            filteredClubs.map((club) => (
              <div key={club.id} className="bg-white rounded-2xl shadow-xl shadow-[#132F45]/5 border border-gray-100 p-5 hover:border-[#BA995D]/40 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#132F45]/[0.02] rounded-bl-full -mr-12 -mt-12 group-hover:bg-[#BA995D]/[0.05] transition-colors" />

                <div className="flex items-start justify-between relative z-10 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {club.logoUrl ? (
                        <img src={getImageUrl(club.logoUrl)} alt="" className="w-12 h-12 rounded-xl object-cover shadow-md ring-1 ring-gray-100" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-[#132F45] flex items-center justify-center text-[#BA995D]">
                          <Home size={20} />
                        </div>
                      )}
                      {club.isVerified && (
                        <div className="absolute -top-1.5 -right-1.5 bg-emerald-500 rounded-full p-1 ring-2 ring-white">
                          <CheckCircle size={10} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-[13px] font-black text-[#132F45] uppercase tracking-tight leading-tight mb-1">{club.name}</h3>
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">Regional Entity</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest ${
                    club.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {club.status}
                  </span>
                </div>

                <div className="space-y-3 relative z-10 py-4 border-y border-gray-50/80 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Main Discipline</span>
                    <span className="text-[9px] font-black text-[#132F45] uppercase tracking-wide text-right">
                      {(() => {
                        let sports = club.sportTypes;
                        if (typeof sports === 'string') {
                          try { sports = JSON.parse(sports); } catch (e) { sports = []; }
                        }
                        if (Array.isArray(sports) && sports.length > 0) {
                          return sports.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
                        }
                        return club.sportType ? club.sportType.charAt(0).toUpperCase() + club.sportType.slice(1) : 'N/A';
                      })()}
                    </span>
                  </div>
                  {club.contactPerson && <p><span className="font-medium">Contact:</span> {club.contactPerson}</p>}
                  <p className="whitespace-nowrap text-ellipsis overflow-hidden"><Mail size={12} className="inline mr-1 text-[#132F45]" />{club.email}</p>
                  <p className="truncate"><Home size={12} className="inline mr-1 text-[#132F45]" />{club.address}</p>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => navigate(`/organization/clubmanagement/${club.id}`)}
                    disabled={club.status === 'pending'}
                    className="flex-1 bg-[#132F45] text-white py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-[#132F45]/10 hover:bg-[#1A3F5C] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#132F45]"
                  >
                    Control Interface
                  </button>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === club.id ? null : club.id)}
                    disabled={club.status === 'pending'}
                    className="p-2.5 rounded-xl border-2 border-gray-100 text-[#132F45] hover:border-[#BA995D]/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create/Edit Club Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-100">
            {/* Modal Header */}
            <div className="relative bg-[#132F45] px-6 py-5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA995D]/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
              <div className="relative z-10 flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest pl-2 border-l-2 border-[#BA995D]">
                    {editingClub ? 'Edit Club' : 'Create Club'}
                  </h2>
                  <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.25em] mt-1 ml-3">
                    Entity Configuration Panel
                  </p>
                </div>
                <button
                  onClick={() => { setShowCreateModal(false); resetClubForm(); setEditingClub(null); }}
                  className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <form onSubmit={editingClub ? handleEditClub : handleCreateClub} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Club Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={clubForm.name}
                    onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#132F45] text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Person <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={clubForm.contactPerson}
                    onChange={(e) => setClubForm({ ...clubForm, contactPerson: e.target.value })}
                    disabled={!editingClub}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 disabled:cursor-not-allowed text-gray-900"
                    title={!editingClub ? 'Auto-filled from your organization profile' : ''}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={clubForm.email}
                      onChange={(e) => setClubForm({ ...clubForm, email: e.target.value })}
                      disabled={!editingClub}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 disabled:cursor-not-allowed text-gray-900"
                      title={!editingClub ? 'Auto-filled from your login account' : ''}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={clubForm.phone}
                      onChange={(e) => {
                        const numericValue = e.target.value.replace(/\D/g, '').slice(0, 11);
                        setClubForm({ ...clubForm, phone: numericValue });
                      }}
                      disabled={!editingClub}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 disabled:cursor-not-allowed text-gray-900"
                      title={!editingClub ? 'Auto-filled from your organization profile' : ''}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    value={clubForm.address}
                    onChange={(e) => setClubForm({ ...clubForm, address: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sport Types <span className="text-red-500">*</span>
                  </label>
                  <div className="border border-gray-300 rounded-lg p-3 bg-white">
                    <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
                      {clubForm.sportTypes.map((sportName) => {
                        const game = games.find((g) => g.name.toLowerCase() === sportName);
                        const displayName = game
                          ? game.name
                          : sportName.charAt(0).toUpperCase() + sportName.slice(1);
                        return (
                          <div
                            key={sportName}
                            className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
                          >
                            {displayName}
                            <button
                              type="button"
                              onClick={() =>
                                setClubForm({
                                  ...clubForm,
                                  sportTypes: clubForm.sportTypes.filter((s) => s !== sportName)
                                })
                              }
                              className="text-[#BA995D] hover:text-white transition-colors"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                      </div>
                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !clubForm.sportTypes.includes(val)) {
                            setClubForm({ ...clubForm, sportTypes: [...clubForm.sportTypes, val] });
                          }
                        }}
                        className="w-full bg-white border-2 border-gray-100 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#132F45] outline-none"
                      >
                        <option value="">+ Add Discipline</option>
                        {games.map((game) => (
                          <option key={game.id} value={game.name.toLowerCase()} disabled={clubForm.sportTypes.includes(game.name.toLowerCase())}>
                            {game.name}
                          </option>
                        ))}
                      </select>
                  </div>
                  {clubForm.sportTypes.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">Select at least one sport type</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Visibility <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={clubForm.visibility}
                    onChange={(e) => setClubForm({ ...clubForm, visibility: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <textarea
                    value={clubForm.description}
                    onChange={(e) => setClubForm({ ...clubForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-5 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={() => { setShowCreateModal(false); resetClubForm(); setEditingClub(null); }}
                    className="px-6 py-2.5 rounded-xl border-2 border-gray-100 text-gray-400 font-black uppercase tracking-widest text-[9px] hover:bg-gray-50 transition-all"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={localLoading}
                    className="px-8 py-2.5 rounded-xl bg-[#132F45] text-white font-black uppercase tracking-widest text-[9px] shadow-xl shadow-[#132F45]/20 hover:bg-[#BA995D] transition-all disabled:opacity-50"
                  >
                    {localLoading ? 'Synchronizing...' : (editingClub ? 'Apply Updates' : 'Confirm Entity')}
                  </button>
                </div>
              </form>
            </div>
          </div>
      )}

      {/* Invite Players Modal */}
      {showInviteModal && selectedClub && invitationData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
            <div className="relative bg-[#132F45] px-6 py-5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA995D]/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
              <div className="relative z-10 flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest pl-2 border-l-2 border-[#BA995D]">
                    Access Credentials
                  </h2>
                  <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.25em] mt-1 ml-3">
                    {selectedClub.name} Registry
                  </p>
                </div>
                <button
                  onClick={() => { setShowInviteModal(false); setInvitationData(null); }}
                  className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[#132F45] uppercase tracking-widest pl-1">Invitation Link</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={invitationData.inviteLink || invitationData.invitationUrl || ''}
                      className="flex-1 bg-[#FAFAFA] border-2 border-gray-100 rounded-xl px-3 py-2 font-bold text-[10px] text-gray-500 outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(invitationData.inviteLink || invitationData.invitationUrl)}
                      className="px-4 py-2 bg-[#132F45] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#BA995D] transition-all"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest ml-1">Expires: {invitationData.expiresAt ? new Date(invitationData.expiresAt).toLocaleDateString() : 'N/A'}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-[#132F45] uppercase tracking-widest pl-1">Direct Join Code</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={invitationData.joinCode || ''}
                      className="flex-1 bg-[#FAFAFA] border-2 border-gray-100 rounded-xl px-3 py-2 font-black text-[12px] text-[#132F45] tracking-[0.5em] text-center outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(invitationData.joinCode)}
                      className="px-4 py-2 bg-[#132F45] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#BA995D] transition-all"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-[#FAFAFA] border-2 border-[#FDF2D1] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] font-black text-[#132F45] uppercase tracking-widest">Inbound Request Layer</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" onChange={(e) => toggleOpenRequest(selectedClub.id, e.target.checked)} />
                      <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#BA995D]"></div>
                    </label>
                  </div>
                  <p className="text-[8px] font-medium text-gray-400 leading-relaxed uppercase">Permit players to request entry directly. Requests manifest in the Player Management interface.</p>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <label className="text-[9px] font-black text-[#132F45] uppercase tracking-widest pl-1 block mb-2">Venue Administrator Invite</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={getVenueOwnerInviteLink(selectedClub.id)}
                      className="flex-1 bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2 font-bold text-[9px] text-gray-400 outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(getVenueOwnerInviteLink(selectedClub.id))}
                      className="px-4 py-2 bg-white border-2 border-[#132F45] text-[#132F45] rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#132F45] hover:text-white transition-all"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => { setShowInviteModal(false); setInvitationData(null); }}
                  className="px-6 py-2.5 rounded-xl border-2 border-gray-100 text-gray-400 font-black uppercase tracking-widest text-[9px] hover:bg-gray-50 transition-all"
                >
                  Close Registry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Players Modal */}
      {showPlayersModal && selectedClub && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-gray-100">
            <div className="relative bg-[#132F45] px-6 py-5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA995D]/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
              <div className="relative z-10 flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest pl-2 border-l-2 border-[#BA995D]">
                    Player Management
                  </h2>
                  <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.25em] mt-1 ml-3">
                    {selectedClub.name} Operational Roster
                  </p>
                </div>
                <button
                  onClick={() => { setShowPlayersModal(false); setClubMembers([]); setPendingRequests([]); }}
                  className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Pending Requests */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle size={14} className="text-[#BA995D]" />
                  <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-widest">Awaiting Verification ({pendingRequests.length})</h3>
                </div>
                {pendingRequests.length === 0 ? (
                  <div className="py-6 text-center bg-[#FAFAFA] rounded-xl border border-dashed border-gray-200">
                    <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">No pending queue</p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {pendingRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between bg-amber-50/50 border border-amber-100 p-3 rounded-xl transition-all hover:bg-amber-50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                            <User size={14} className="text-amber-600" />
                          </div>
                          <div>
                            <p className="text-[11px] font-black text-[#132F45] uppercase tracking-tight">{req.player?.name || req.user?.email}</p>
                            <p className="text-[8px] font-medium text-amber-600 uppercase tracking-widest">Request Logged: {new Date(req.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveRequest(selectedClub.id, req.id)}
                            className="bg-[#132F45] text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-[#BA995D] transition-all"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectRequest(selectedClub.id, req.id)}
                            className="bg-white border border-red-100 text-red-500 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Current Players */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Users size={14} className="text-[#132F45]" />
                  <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-widest">Active Roster ({clubMembers.length})</h3>
                </div>
                {clubMembers.length === 0 ? (
                  <div className="py-12 text-center bg-[#FAFAFA] rounded-xl border border-dashed border-gray-200">
                    <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Registry empty</p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {clubMembers.map(player => (
                      <div key={player.id} className="flex items-center justify-between bg-white border border-gray-50 p-3 rounded-xl hover:shadow-md transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#132F45]/5 flex items-center justify-center text-[#132F45]/20 group-hover:bg-[#132F45] group-hover:text-[#BA995D] transition-all">
                            <User size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[11px] font-black text-[#132F45] uppercase tracking-tight">{player.player?.name || player.user?.email}</p>
                              {player.role === 'club_admin' && (
                                <span className="bg-[#BA995D] text-[#132F45] px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest">Admin</span>
                              )}
                            </div>
                            <p className="text-[8px] font-medium text-gray-400 uppercase tracking-widest italic">Entry Date: {new Date(player.joinedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {player.role !== 'club_admin' && (
                            <select
                              value={player.status}
                              onChange={(e) => handleUpdateMemberStatus(selectedClub.id, player.id, e.target.value)}
                              className="bg-gray-50 border-gray-100 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg outline-none focus:ring-1 focus:ring-[#BA995D]"
                            >
                              <option value="active">Active</option>
                              <option value="suspended">Locked</option>
                              <option value="removed">Expelled</option>
                            </select>
                          )}
                          {player.role !== 'club_admin' && player.status === 'active' && (
                            <button
                              onClick={() => handleMakeAdmin(selectedClub.id, player.id)}
                              className="text-[8px] font-black text-[#BA995D] uppercase tracking-widest hover:text-[#132F45] transition-colors"
                            >
                              Promote
                            </button>
                          )}
                          {player.role !== 'club_admin' && (
                            <button
                              onClick={() => handleRemovePlayer(selectedClub.id, player.id)}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-50 flex justify-end">
              <button
                onClick={() => { setShowPlayersModal(false); setClubMembers([]); setPendingRequests([]); }}
                className="px-6 py-2.5 rounded-xl border-2 border-gray-100 text-gray-400 font-black uppercase tracking-widest text-[9px] hover:bg-gray-50 transition-all"
              >
                Exit Console
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Venues Modal */}
      {showVenuesModal && selectedClub && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100">
            <div className="relative bg-[#132F45] px-6 py-5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#BA995D]/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
              <div className="relative z-10 flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest pl-2 border-l-2 border-[#BA995D]">
                    Facility Infrastructure
                  </h2>
                  <p className="text-[8px] font-black text-white/30 uppercase tracking-[0.25em] mt-1 ml-3">
                    {selectedClub.name} Asset List
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowVenueForm(true); setEditingVenue(null); setVenueForm({}); }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#BA995D] text-[#132F45] font-black uppercase tracking-widest rounded-xl text-[8px] hover:bg-white transition-all shadow-md"
                  >
                    <Plus size={10} /> Add Asset
                  </button>
                  <button
                    onClick={() => { setShowVenuesModal(false); setVenues([]); }}
                    className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {venues.length === 0 ? (
                <div className="py-20 text-center bg-[#FAFAFA] rounded-xl border border-dashed border-gray-200">
                  <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">No assets registered</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {venues.map(venue => (
                    <div key={venue.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-[#BA995D]/30 transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-xl bg-[#132F45] flex items-center justify-center text-[#BA995D] shadow-inner">
                          <MapPin size={18} />
                        </div>
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingVenue(venue); setVenueForm(venue); setShowVenueForm(true); }}
                            className="p-1.5 bg-[#FAFAFA] text-gray-400 hover:text-[#132F45] rounded-lg transition-colors"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteVenue(venue.id)}
                            className="p-1.5 bg-[#FAFAFA] text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-[12px] font-black text-[#132F45] uppercase tracking-tight leading-tight mb-1">{venue.name}</h3>
                      <p className="text-[9px] font-medium text-gray-400 uppercase tracking-widest italic mb-3 truncate">{venue.address}</p>

                      <div className="space-y-2 pt-3 border-t border-gray-50/50">
                        <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                          <span className="text-gray-300 tracking-tighter">Inventory</span>
                          <span className="text-[#132F45]">{venue.tables?.slice(0, 2).join(', ') || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                          <span className="text-gray-300 tracking-tighter">Availability</span>
                          <span className="text-[#132F45] truncate max-w-[80px]">{venue.timeSlots || 'Unspecified'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-50 flex justify-end">
              <button
                onClick={() => { setShowVenuesModal(false); setVenues([]); }}
                className="px-6 py-2.5 rounded-xl border-2 border-gray-100 text-gray-400 font-black uppercase tracking-widest text-[9px] hover:bg-gray-50 transition-all"
              >
                Close Infrastructure
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Venue Form */}
      {showVenueForm && selectedClub && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xl flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
            <div className="p-6">
              <h3 className="text-sm font-black text-[#132F45] uppercase tracking-widest mb-6 flex items-center gap-2">
                <span className="w-6 h-1 bg-[#BA995D] rounded-full" />
                {editingVenue ? 'Revise Asset' : 'New Asset Definition'}
              </h3>
              <form onSubmit={(e) => { e.preventDefault(); editingVenue ? handleEditVenue() : handleAddVenue(); }} className="space-y-5">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1">Venue Identity *</label>
                  <input
                    type="text"
                    required
                    value={venueForm.name || ''}
                    onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                    className="w-full bg-[#FAFAFA] border-2 border-gray-100 rounded-xl px-4 py-2.5 font-black text-[11px] text-[#132F45] focus:border-[#BA995D] outline-none transition-all"
                    placeholder="Grand Central Hall"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1">Geospatial Address *</label>
                  <textarea
                    required
                    value={venueForm.address || ''}
                    onChange={(e) => setVenueForm({ ...venueForm, address: e.target.value })}
                    rows={2}
                    className="w-full bg-[#FAFAFA] border-2 border-gray-100 rounded-xl px-4 py-2.5 font-black text-[11px] text-[#132F45] focus:border-[#BA995D] outline-none transition-all resize-none"
                    placeholder="Unit 12, King George St..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1">Inventory (Tables)</label>
                    <input
                      type="text"
                      value={venueForm.tables?.join(', ') || ''}
                      onChange={(e) => setVenueForm({ ...venueForm, tables: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="T1, T2..."
                      className="w-full bg-[#FAFAFA] border-2 border-gray-100 rounded-xl px-4 py-1.5 font-black text-[11px] text-[#132F45] focus:border-[#BA995D] outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1">Operational Hours</label>
                    <input
                      type="text"
                      value={venueForm.timeSlots || ''}
                      onChange={(e) => setVenueForm({ ...venueForm, timeSlots: e.target.value })}
                      placeholder="Mon-Sun: 24h"
                      className="w-full bg-[#FAFAFA] border-2 border-gray-100 rounded-xl px-4 py-1.5 font-black text-[11px] text-[#132F45] focus:border-[#BA995D] outline-none"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={() => { setShowVenueForm(false); setVenueForm({}); setEditingVenue(null); }}
                    className="px-6 py-2.5 rounded-xl text-gray-400 font-black uppercase tracking-widest text-[9px] hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={localLoading}
                    className="px-8 py-2.5 rounded-xl bg-[#132F45] text-white font-black uppercase tracking-widest text-[9px] shadow-xl shadow-[#132F45]/10 hover:bg-[#BA995D] disabled:opacity-50"
                  >
                    {localLoading ? 'Updating Asset...' : 'Finalize Asset'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && clubToDelete && (
        <div className="fixed inset-0 bg-red-500/10 backdrop-blur-xl flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-100">
            <div className="bg-red-50 px-6 py-5 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-200">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-red-600 uppercase tracking-widest">Permanent Deletion</h2>
                  <p className="text-[8px] font-black text-red-900/40 uppercase tracking-[0.2em] mt-0.5">Termination Protocol Active</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-[11px] text-gray-600 font-medium mb-6 leading-relaxed">
                You are about to expunge the entry for <strong className="text-red-600">{clubToDelete.name}</strong>. This will irrevocably delete all historical records and associated data configurations.
              </p>

              <div className="mb-6">
                <label className="text-[10px] font-black text-[#132F45] uppercase tracking-widest pl-1 block mb-2 cursor-pointer" htmlFor="admin-pass">Terminal Access Password (Super Admin)</label>
                <input
                  id="admin-pass"
                  type="password"
                  value={superAdminPassword}
                  onChange={(e) => setSuperAdminPassword(e.target.value)}
                  className="w-full bg-[#FAFAFA] border-2 border-red-50 rounded-xl px-4 py-3 font-black text-[12px] text-[#132F45] tracking-widest focus:border-red-500 outline-none transition-all placeholder:text-gray-200"
                  placeholder="••••••••••••"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setClubToDelete(null); setSuperAdminPassword(''); }}
                  className="px-6 py-2.5 rounded-xl border-2 border-gray-100 text-gray-400 font-black uppercase tracking-widest text-[9px] hover:bg-gray-50"
                >
                  Abort
                </button>
                <button
                  onClick={handleDelete}
                  disabled={localLoading || !superAdminPassword}
                  className="px-8 py-2.5 rounded-xl bg-red-600 text-white font-black uppercase tracking-widest text-[9px] shadow-xl shadow-red-200 hover:bg-red-700 disabled:opacity-30 disabled:shadow-none transition-all"
                >
                  Confirm Termination
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClubManagement;
