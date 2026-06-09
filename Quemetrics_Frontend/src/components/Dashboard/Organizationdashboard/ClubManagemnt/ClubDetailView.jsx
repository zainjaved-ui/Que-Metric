import { OrganizationContext } from '../../../../contexts/OrganizationContext';
import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, AlertCircle, XCircle, Plus, X, Edit, MapPin, Users,
  LinkIcon, Key, DoorOpen, Trash2, Calendar, ArrowLeft, Save, Loader
} from 'lucide-react';

import apiClient from '../../../../contexts/apiClient';
import { getImageUrl } from '../../../../utils/imageUtils';

// Hour selection runs 1..24 (spec). Hour 24 represents the boundary "24:00"
// (i.e., end-of-day) so a slot like 22:00–24:00 is legal and unambiguous.
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1);
const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fmtHour = (h) => `${String(h).padStart(2, '0')}:00`;

// Pure conflict detector. Inputs are the current venueForm slots/tables.
// Returns:
//   messages           — human-readable lines, one per conflict
//   conflictingSlotIds — Set of slot.id values that should render in red
//   hasConflicts       — convenience boolean used to gate submit
//
// Rules:
//   1. endHour must be strictly greater than startHour
//   2. Two slots on the SAME table + SAME day overlap when
//      a.startHour < b.endHour && a.endHour > b.startHour
//      (slots that merely touch — e.g. 10–12 and 12–14 — do NOT overlap)
//   3. Cross-table comparison is intentionally skipped — different tables
//      may host concurrent sessions.
function detectSlotConflicts(slots, tables) {
  const messages = [];
  const conflictingSlotIds = new Set();
  const safeSlots = Array.isArray(slots) ? slots : [];
  const safeTables = Array.isArray(tables) ? tables : [];
  const tableName = (id) => safeTables.find((t) => t.id === id)?.name?.trim() || 'Untitled table';

  // Rule 1 — order check
  safeSlots.forEach((s) => {
    const sh = Number(s?.startHour);
    const eh = Number(s?.endHour);
    if (Number.isInteger(sh) && Number.isInteger(eh) && sh > 0 && eh > 0 && eh <= sh) {
      messages.push(`${tableName(s.tableId)} — ${s.day || '(no day)'}: end ${fmtHour(eh)} must be after start ${fmtHour(sh)}`);
      conflictingSlotIds.add(s.id);
    }
  });

  // Rule 2 — per-table per-day overlap (only consider slots that are fully
  // valid on their own: have day, integer start, integer end, end > start).
  const byTableDay = new Map();
  safeSlots.forEach((s) => {
    const sh = Number(s?.startHour);
    const eh = Number(s?.endHour);
    if (!s?.day || !Number.isInteger(sh) || !Number.isInteger(eh) || sh <= 0 || eh <= sh) return;
    const key = `${s.tableId}::${s.day}`;
    if (!byTableDay.has(key)) byTableDay.set(key, []);
    byTableDay.get(key).push(s);
  });

  byTableDay.forEach((group) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const aS = Number(a.startHour), aE = Number(a.endHour);
        const bS = Number(b.startHour), bE = Number(b.endHour);
        if (aS < bE && aE > bS) {
          messages.push(
            `${tableName(a.tableId)} — ${a.day}: slot ${fmtHour(aS)}–${fmtHour(aE)} overlaps with ${fmtHour(bS)}–${fmtHour(bE)}`
          );
          conflictingSlotIds.add(a.id);
          conflictingSlotIds.add(b.id);
        }
      }
    }
  });

  return { messages, conflictingSlotIds, hasConflicts: messages.length > 0 };
}

const ClubDetailView = () => {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    getClubMembers,
    approveMemberRequest,
    rejectMemberRequest,
    removeClubMember,
    updateMemberRole,
    generateInvitationLink,
    updateJoinSettings,
  } = useContext(OrganizationContext);

  // Allow callers (e.g., the Tournament/League prerequisite guard's "Go to
  // Venue Setup" button) to deep-link into a specific tab via `?tab=venues`.
  // Only known tab ids are honored; anything else falls back to "edit".
  const initialTab = ['edit', 'players', 'venues', 'invite'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'edit';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // New state for tab-specific loading indicator
  const [tabLoading, setTabLoading] = useState(false);

  // Games state (dynamic from backend) – used only for dropdown display
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  // Edit Club State – sportTypes stores sport names (lowercase)
  const [clubForm, setClubForm] = useState({
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

  // Players State
  const [clubMembers, setClubMembers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  // Venues State
  const [venues, setVenues] = useState([]);
  const [venueForm, setVenueForm] = useState({
    name: '',
    tables: [{ id: Date.now(), name: '' }],
    slots: []
  });
  const [editingVenue, setEditingVenue] = useState(null);
  const [showVenueForm, setShowVenueForm] = useState(false);

  // Invitation State
  const [invitationData, setInvitationData] = useState(null);

  // Live conflict detection — recomputes on every slot/table change so the
  // user sees red borders + an error list immediately, not just on submit.
  const slotConflicts = useMemo(
    () => detectSlotConflicts(venueForm.slots, venueForm.tables),
    [venueForm.slots, venueForm.tables]
  );

  // Fetch games from backend
  const fetchGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const response = await apiClient.get('/organization/games');
      if (response.data?.success) {
        const gamesData = response.data.data || [];
        setGames(gamesData);
      }
    } catch (err) {
      console.error('Failed to fetch games:', err);
    } finally {
      setGamesLoading(false);
    }
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const loadClubDetails = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/clubs/${clubId}`);
      if (response.data.success) {
        const clubData = response.data.data;
        setClub(clubData);

        // Parse sportTypes – it should be an array of names (lowercase)
        let parsedSportTypes = [];
        try {
          if (clubData.sportTypes) {
            parsedSportTypes = typeof clubData.sportTypes === 'string' ? JSON.parse(clubData.sportTypes) : clubData.sportTypes;
          }
        } catch { parsedSportTypes = []; }
        if (!Array.isArray(parsedSportTypes)) {
          parsedSportTypes = clubData.sportType ? [clubData.sportType] : [];
        }

        setClubForm({
          name: clubData.name,
          contactPerson: clubData.contactPerson || '',
          email: clubData.email,
          phone: clubData.phone,
          address: clubData.address,
          sportTypes: parsedSportTypes,
          description: clubData.description || '',
          // logoUrl: clubData.logoUrl || '',
          visibility: clubData.visibility
        });

        if (clubData.venues && Array.isArray(clubData.venues)) {
          setVenues(clubData.venues);
        }
      }
    } catch {
      showToast('Failed to load club details', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  const loadClubMembers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getClubMembers(clubId);
      if (result.success) {
        const normalized = result.data.map(m => ({
          ...m,
          // Normalize: empty string or null becomes 'pending', keep other statuses as-is
          status: !m.status || m.status === '' ? 'pending' : m.status,
          joinMethod: m.joinMethod || 'public'
        }));

        // Filter 1: Only active members
        const approved = normalized.filter(m => m.status === 'active');

        // Filter 2: Only pending requests (exclude rejected, active, and others)
        const pending = normalized.filter(m => m.status === 'pending');

        console.log('[loadClubMembers] API returned', result.data.length, 'members');
        console.log('[loadClubMembers] Statuses:', result.data.map(m => `${m.user?.email}: ${m.status || '(empty)'}`));
        console.log('[loadClubMembers] Active members:', approved.length);
        console.log('[loadClubMembers] Pending requests:', pending.length);

        setClubMembers(approved);
        setPendingRequests(pending);
      }
    } catch {
      showToast('Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubId, getClubMembers]);

  const loadVenues = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/clubs/${clubId}/venues`);
      if (response.data.success) {
        setVenues(response.data.data || []);
      }
    } catch {
      setVenues([]);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  const loadInvitationData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await generateInvitationLink(clubId, 7);
      if (result.success) {
        setInvitationData(result.data);
      }
    } catch {
      showToast('Failed to load invitation data', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubId, generateInvitationLink]);

  // Fetch games and profile only on mount (stable functions)
  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  useEffect(() => {
    loadClubDetails();
  }, [loadClubDetails]);

  // Enhanced tab switching with loading indicator
  useEffect(() => {
    let isMounted = true;
    setTabLoading(true);

    const loadData = async () => {
      try {
        if (activeTab === 'players') {
          await loadClubMembers();
        } else if (activeTab === 'venues') {
          await loadVenues();
        } else if (activeTab === 'invite') {
          await loadInvitationData();
        }
      } finally {
        if (isMounted) {
          setTabLoading(false);
        }
      }
    };

    if (activeTab === 'edit') {
      // No data to load for the edit tab
      setTabLoading(false);
    } else {
      loadData();
    }

    return () => {
      isMounted = false;
    };
  }, [activeTab, loadClubMembers, loadVenues, loadInvitationData]);

  const handleUpdateClub = async (e) => {
    e.preventDefault();

    if (!clubForm.sportTypes || clubForm.sportTypes.length === 0) {
      showToast('Please select at least one sport type', 'error');
      return;
    }

    if (clubForm.phone && !/^\d{11}$/.test(clubForm.phone)) {
      showToast('Phone number must be exactly 11 digits', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.put(`/clubs/${clubId}`, clubForm);
      if (response.data.success) {
        showToast('Club updated successfully!');
        loadClubDetails();
      }
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to update club', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRequest = async (requestId) => {
    setLoading(true);
    try {
      const result = await approveMemberRequest(clubId, requestId);
      if (result.success) {
        // Immediately remove from pending requests and add to active members
        const approvedRequest = pendingRequests.find(req => req.id === requestId);
        if (approvedRequest) {
          setPendingRequests(prev => prev.filter(req => req.id !== requestId));
          setClubMembers(prev => [...prev, { ...approvedRequest, status: 'active' }]);
        }
        showToast('Request approved!', 'success');

        // Then reload to sync with backend
        await loadClubMembers();
      } else {
        showToast(result.error || 'Failed to approve request', 'error');
      }
    } catch (error) {
      showToast(error.message || 'Failed to approve request', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = async (requestId) => {
    setLoading(true);
    try {
      const result = await rejectMemberRequest(clubId, requestId);
      if (result.success) {
        // Immediately remove from pending requests UI
        setPendingRequests(prev => prev.filter(req => req.id !== requestId));
        showToast('Request rejected.', 'info');

        // Then reload to sync with backend
        await loadClubMembers();
      } else {
        showToast(result.error || 'Failed to reject request', 'error');
      }
    } catch (error) {
      showToast(error.message || 'Failed to reject request', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePlayer = async (playerId) => {
    if (!window.confirm('Remove player? Their historical data will be preserved.')) return;
    setLoading(true);
    try {
      await removeClubMember(clubId, playerId);
      await loadClubMembers();
      showToast('Player removed from club.');
    } catch (error) {
      showToast(error.message || 'Failed to remove player', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMemberStatus = async (memberId, newStatus) => {
    setLoading(true);
    try {
      await apiClient.put(`/clubs/${clubId}/members/${memberId}/status`, { status: newStatus });
      await loadClubMembers();
      showToast(`Member status updated to ${newStatus}`);
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to update member status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMakeAdmin = async (memberId) => {
    if (!window.confirm('Promote this member to club admin?')) return;
    setLoading(true);
    try {
      await updateMemberRole(clubId, memberId, { role: 'club_admin' });
      await loadClubMembers();
      showToast('Member promoted to club admin');
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to promote member', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleOpenRequest = async (enabled) => {
    setLoading(true);
    try {
      // Backend parseJoinSettings whitelists method ∈ {invite, code, open} and
      // silently normalises anything else to 'invite'. Previously this sent
      // 'request', which was a no-op for the method field. Use 'open' so the
      // toggle actually flips the join channel as its label promises.
      await updateJoinSettings(clubId, {
        method: enabled ? 'open' : 'invite',
        requireApproval: enabled
      });
      showToast(`Open request ${enabled ? 'enabled' : 'disabled'}`);
      loadInvitationData();
    } catch (error) {
      showToast(error.message || 'Failed to update join settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  };

  // Venue Management
  const addTableField = () => {
    const tableId = Date.now();
    setVenueForm({
      ...venueForm,
      tables: [...(Array.isArray(venueForm.tables) ? venueForm.tables : []), { id: tableId, name: '' }],
      slots: [...(Array.isArray(venueForm.slots) ? venueForm.slots : []), { id: Date.now() + 1, tableId, day: '', startHour: '', endHour: '' }]
    });
  };

  const removeTableField = (id) => {
    setVenueForm({
      ...venueForm,
      tables: Array.isArray(venueForm.tables) ? venueForm.tables.filter(t => t.id !== id) : [],
      slots: Array.isArray(venueForm.slots) ? venueForm.slots.filter(s => s.tableId !== id) : []
    });
  };

  const updateTableField = (id, value) => {
    setVenueForm({
      ...venueForm,
      tables: Array.isArray(venueForm.tables) ? venueForm.tables.map(t => t.id === id ? { ...t, name: value } : t) : []
    });
  };

  const addSlotField = (tableId) => {
    const slotId = Date.now();
    setVenueForm({
      ...venueForm,
      slots: [...(Array.isArray(venueForm.slots) ? venueForm.slots : []), { id: slotId, tableId, day: '', startHour: '', endHour: '' }]
    });
  };

  const removeSlotField = (id) => {
    setVenueForm({
      ...venueForm,
      slots: Array.isArray(venueForm.slots) ? venueForm.slots.filter(t => t.id !== id) : []
    });
  };

  const updateSlotField = (id, field, value) => {
    setVenueForm((prev) => ({
      ...prev,
      slots: Array.isArray(prev.slots)
        ? prev.slots.map((s) => {
            if (s.id !== id) return s;
            // Hour fields are stored as integers (or '' when unset) so the
            // <select>'s placeholder option can be the empty string.
            const nextValue = (field === 'startHour' || field === 'endHour')
              ? (value === '' ? '' : Number(value))
              : value;
            const next = { ...s, [field]: nextValue };
            // If the new start is at or past the existing end, invalidate
            // end so the user re-picks from a fresh > start option list.
            if (
              field === 'startHour'
              && nextValue !== ''
              && next.endHour !== ''
              && Number(next.endHour) <= nextValue
            ) {
              next.endHour = '';
            }
            return next;
          })
        : []
    }));
  };

  const handleAddVenue = async (e) => {
    e.preventDefault();
    if (slotConflicts.hasConflicts) {
      showToast('Resolve slot conflicts before saving', 'error');
      return;
    }
    setLoading(true);
    try {
      const validTables = Array.isArray(venueForm.tables)
        ? venueForm.tables.filter(t => t && t.name && t.name.trim())
        : [];

      const venueData = {
        name: venueForm.name,
        tables: validTables.map(t => t.name),
        // Convert the local integer hour fields back to the server's HH:00
        // string format and strip the local startHour/endHour so the payload
        // shape stays exactly as before.
        slots: Array.isArray(venueForm.slots)
          ? venueForm.slots
              .filter((s) => s && s.day && s.startHour !== '' && s.endHour !== '')
              .map((s) => {
                const matchingTable = validTables.find((t) => t.id === s.tableId);
                const { startHour, endHour, ...rest } = s;
                return {
                  ...rest,
                  startTime: fmtHour(Number(startHour)),
                  endTime: fmtHour(Number(endHour)),
                  tableName: matchingTable ? matchingTable.name : null,
                };
              })
          : []
      };

      const response = await apiClient.post(`/clubs/${clubId}/venues`, venueData);
      if (response.data.success) {
        setVenues((prev) => [...prev, response.data.data]);
        setShowVenueForm(false);
        const newTableId = Date.now();
        setVenueForm({
          name: '',
          tables: [{ id: newTableId, name: '' }],
          slots: [{ id: newTableId + 1, tableId: newTableId, day: '', startHour: '', endHour: '' }]
        });
        const ownership = response.data.data?.ownership;
        if (ownership?.enabled && ownership?.assigned) {
          showToast(
            ownership.createdProfile
              ? 'Venue added and Venue Owner access was created automatically.'
              : ownership.duplicate
                ? 'Venue added and linked to your existing Venue Owner dashboard.'
                : 'Venue added and linked to your Venue Owner dashboard.'
          );
        } else {
          showToast('Venue added successfully!');
        }
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to add venue', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditVenue = async (e) => {
    e.preventDefault();
    if (!editingVenue) return;
    if (slotConflicts.hasConflicts) {
      showToast('Resolve slot conflicts before saving', 'error');
      return;
    }

    setLoading(true);
    try {
      const validTables = Array.isArray(venueForm.tables)
        ? venueForm.tables.filter(t => t && t.name && t.name.trim())
        : [];

      const venueData = {
        name: venueForm.name,
        tables: validTables.map(t => t.name),
        slots: Array.isArray(venueForm.slots)
          ? venueForm.slots
              .filter((s) => s && s.day && s.startHour !== '' && s.endHour !== '')
              .map((s) => {
                const matchingTable = validTables.find((t) => t.id === s.tableId);
                const { startHour, endHour, ...rest } = s;
                return {
                  ...rest,
                  startTime: fmtHour(Number(startHour)),
                  endTime: fmtHour(Number(endHour)),
                  tableName: matchingTable ? matchingTable.name : null,
                };
              })
          : []
      };

      const response = await apiClient.put(`/clubs/${clubId}/venues/${editingVenue.id}`, venueData);
      if (response.data.success) {
        await loadVenues();
        setEditingVenue(null);
        setShowVenueForm(false);
        const newTableId = Date.now();
        setVenueForm({
          name: '',
          tables: [{ id: newTableId, name: '' }],
          slots: [{ id: newTableId + 1, tableId: newTableId, day: '', startHour: '', endHour: '' }]
        });
        showToast('Venue updated successfully!');
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to update venue', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVenue = async (venueId) => {
    if (window.confirm('Are you sure? This may affect historical data.')) {
      setLoading(true);
      try {
        const response = await apiClient.delete(`/clubs/${clubId}/venues/${venueId}`);
        if (response.data.success) {
          await loadVenues();
          showToast('Venue deleted.');
        }
      } catch (error) {
        showToast(error.response?.data?.message || 'Failed to delete venue', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const openEditVenueForm = (venue) => {
    setEditingVenue(venue);
    const mappedTables = Array.isArray(venue.tables) && venue.tables.length > 0
      ? venue.tables.map((t, idx) => ({ id: Date.now() + idx, name: typeof t === 'string' ? t : t.name || '' }))
      : [{ id: Date.now(), name: '' }];

    let mappedSlots = [];
    if (Array.isArray(venue.slots) && venue.slots.length > 0) {
      mappedSlots = venue.slots.map((s, idx) => {
        const tableForSlot = mappedTables.find(t => t.name === s.tableName);
        // Server stores times as "HH:00" strings; the form works in integer
        // hours. Parse both back; blank/invalid values become '' so the
        // dropdown shows the placeholder instead of "NaN".
        const parsedStart = parseInt(String(s.startTime || '').split(':')[0], 10);
        const parsedEnd   = parseInt(String(s.endTime   || '').split(':')[0], 10);
        return {
          ...s,
          id: Date.now() + idx + 1000,
          tableId: tableForSlot ? tableForSlot.id : mappedTables[0].id,
          startHour: Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : '',
          endHour:   Number.isFinite(parsedEnd)   && parsedEnd   > 0 ? parsedEnd   : '',
        };
      });
    } else {
      mappedSlots = [];
    }

    setVenueForm({
      name: venue.name || '',
      tables: mappedTables,
      slots: mappedSlots
    });
    setShowVenueForm(true);
  };

  const tabs = [
    { id: 'edit', label: 'Edit Club', icon: Edit },
    { id: 'players', label: 'Manage Players', icon: Users },
    { id: 'venues', label: 'Manage Venues', icon: MapPin },
    { id: 'invite', label: 'Invite & Settings', icon: LinkIcon }
  ];

  if (loading && !club) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#132F45] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading club details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white ${toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-[#132F45]'
          }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/organization/clubmanagement')}
            className="p-2 hover:bg-gray-200 rounded-lg transition"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{club?.name || 'Club Details'}</h1>
            <p className="text-sm text-gray-500">Manage all aspects of your club</p>
          </div>
        </div>
      </div>

      {/* Tabs - Full width */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex flex-wrap -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-2 flex-1 min-w-[120px] px-6 py-4 border-b-2 font-medium text-sm transition ${activeTab === tab.id
                    ? 'border-[#132F45] text-[#132F45]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  <Icon size={18} className={activeTab === tab.id ? 'text-[#132F45]' : ''} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content - with loader overlay */}
        <div className="p-6 relative">
          {/* Loader overlay for tab switching */}
          {tabLoading && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#132F45]"></div>
            </div>
          )}

          {/* Edit Club Tab */}
          {activeTab === 'edit' && (
            <form onSubmit={handleUpdateClub} className="w-full">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Club Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={clubForm.name}
                    onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#132F45]"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={clubForm.email}
                      onChange={(e) => setClubForm({ ...clubForm, email: e.target.value })}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 disabled:cursor-not-allowed"
                      title="Contact email cannot be changed"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sport Types <span className="text-red-500">*</span>
                  </label>
                  <div className="border border-gray-300 rounded-lg p-3 bg-white">
                    <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
                      {clubForm.sportTypes.map((sportName) => {
                        const game = games.find(g => g.name.toLowerCase() === sportName);
                        const displayName = game ? game.name : sportName.charAt(0).toUpperCase() + sportName.slice(1);
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
                                  sportTypes: clubForm.sportTypes.filter(s => s !== sportName)
                                })
                              }
                              className="text-[#132F45] hover:text-[#0e2a3a] font-bold"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {gamesLoading ? (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader size={16} className="animate-spin" />
                        <span>Loading games...</span>
                      </div>
                    ) : (
                      <select
                        value=""
                        onChange={(e) => {
                          const selectedName = e.target.value;
                          if (selectedName && !clubForm.sportTypes.includes(selectedName)) {
                            setClubForm({
                              ...clubForm,
                              sportTypes: [...clubForm.sportTypes, selectedName]
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-700"
                      >
                        <option value="">+ Add Sport Type</option>
                        {games.map((game) => (
                          <option
                            key={game.id}
                            value={game.name.toLowerCase()}
                            disabled={clubForm.sportTypes.includes(game.name.toLowerCase())}
                          >
                            {game.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Visibility <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={clubForm.visibility}
                    onChange={(e) => setClubForm({ ...clubForm, visibility: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                {/* Logo URL field removed
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL (optional)</label>
                  <input
                    type="url"
                    value={clubForm.logoUrl}
                    onChange={(e) => setClubForm({ ...clubForm, logoUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <textarea
                    value={clubForm.description}
                    onChange={(e) => setClubForm({ ...clubForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#0e2a3a] disabled:opacity-50"
                >
                  <Save size={18} />
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Players Tab */}
          {activeTab === 'players' && (
            <div>
              {/* Pending Requests */}
              <div className="mb-6">
                <h3 className="font-medium text-lg mb-3 flex items-center gap-2">
                  <AlertCircle size={18} className="text-yellow-500" />
                  Pending Requests ({pendingRequests.length})
                </h3>
                {pendingRequests.length === 0 ? (
                  <p className="text-gray-500 text-sm">No pending requests.</p>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                        <div>
                          <p className="font-medium">{req.player?.name || req.player?.nickname || req.user?.email || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">Requested: {new Date(req.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveRequest(req.id)}
                            disabled={loading}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectRequest(req.id)}
                            disabled={loading}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm"
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
              <h3 className="font-medium text-lg mb-3">Current Players ({clubMembers.length})</h3>
              {clubMembers.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No players have joined yet.</p>
              ) : (
                <div className="space-y-3">
                  {clubMembers.map(player => (
                    <div key={player.id} className="flex items-center justify-between border rounded-lg p-4 bg-white">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
                          {player.player?.avatarUrl ? (
                            <img
                              src={getImageUrl(player.player.avatarUrl)}
                              alt={player.player.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Users size={20} className="text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {player.player?.name || player.player?.nickname || player.user?.email || 'Unknown'}
                            {player.role === 'club_admin' && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Admin</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">Joined: {new Date(player.joinedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {player.role !== 'club_admin' && (
                          <>
                            <select
                              value={player.status}
                              onChange={(e) => handleUpdateMemberStatus(player.id, e.target.value)}
                              disabled={loading}
                              className={`text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 focus:ring-[#132F45] ${player.status === 'active'
                                ? 'bg-green-100 text-green-800 border-green-300'
                                : player.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                  : player.status === 'suspended'
                                    ? 'bg-orange-100 text-orange-800 border-orange-300'
                                    : 'bg-red-100 text-red-800 border-red-300'
                                }`}
                            >
                              <option value="pending">Pending</option>
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                              <option value="removed">Removed</option>
                            </select>
                            {player.status === 'active' && (
                              <button
                                onClick={() => handleMakeAdmin(player.id)}
                                disabled={loading}
                                className="text-[#132F45] text-xs px-2 py-1 border border-[#132F45]/30 rounded hover:bg-[#132F45]/10 disabled:opacity-50"
                              >
                                Make Admin
                              </button>
                            )}
                            <button
                              onClick={() => handleRemovePlayer(player.id)}
                              disabled={loading}
                              className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                        {player.role === 'club_admin' && (
                          <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 border border-blue-300">
                            {player.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Venues Tab */}
          {activeTab === 'venues' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-lg">Venues ({venues.length})</h3>
                <button
                  onClick={() => {
                    const newTableId = Date.now();
                    setShowVenueForm(true);
                    setEditingVenue(null);
                    setVenueForm({
                      name: '',
                      tables: [{ id: newTableId, name: '' }],
                      slots: [{ id: newTableId + 1, tableId: newTableId, day: '', startHour: '', endHour: '' }]
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#0e2a3a]"
                >
                  <Plus size={18} /> Create Venue
                </button>
              </div>

              {showVenueForm && (
                <form onSubmit={editingVenue ? handleEditVenue : handleAddVenue} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="font-medium mb-4">{editingVenue ? 'Edit Venue' : 'Add New Venue'}</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name <span className="text-red-600">*</span></label>
                      <input
                        type="text"
                        required
                        value={venueForm.name}
                        onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#132F45]"
                      />
                    </div>

                    {/* Tables and per-table Slots Section */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tables & Time Slots</label>
                      {Array.isArray(venueForm.tables) && venueForm.tables.map((table, index) => (
                        <div key={table.id} className="mb-4 p-3 bg-white rounded-lg border border-gray-200">
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              value={table.name}
                              onChange={(e) => updateTableField(table.id, e.target.value)}
                              placeholder={`Table ${index + 1}`}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                            />
                            {Array.isArray(venueForm.tables) && venueForm.tables.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTableField(table.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded"
                                title="Remove table and its slots"
                              >
                                <X size={18} />
                              </button>
                            )}
                          </div>

                          <div className="space-y-2">
                            {(Array.isArray(venueForm.slots) ? venueForm.slots.filter(s => s.tableId === table.id) : []).map((slot) => {
                              const isConflicting = slotConflicts.conflictingSlotIds.has(slot.id);
                              const startVal = slot.startHour === '' || slot.startHour == null ? '' : Number(slot.startHour);
                              const endVal   = slot.endHour   === '' || slot.endHour   == null ? '' : Number(slot.endHour);
                              // End-hour options: must be strictly greater than the chosen start.
                              const endOptions = startVal === ''
                                ? HOUR_OPTIONS
                                : HOUR_OPTIONS.filter((h) => h > startVal);
                              return (
                                <div
                                  key={slot.id}
                                  className={`flex items-center gap-2 rounded-md ${isConflicting ? 'border border-red-400 bg-red-50/60 p-2' : ''}`}
                                >
                                  <select
                                    value={slot.day}
                                    onChange={(e) => updateSlotField(slot.id, 'day', e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg"
                                  >
                                    <option value="">Day</option>
                                    {DAYS_ORDER.map((d) => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={startVal}
                                    onChange={(e) => updateSlotField(slot.id, 'startHour', e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg"
                                  >
                                    <option value="" disabled>Start</option>
                                    {HOUR_OPTIONS.map((h) => (
                                      <option key={h} value={h}>{fmtHour(h)}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={endVal}
                                    onChange={(e) => updateSlotField(slot.id, 'endHour', e.target.value)}
                                    disabled={startVal === ''}
                                    className="px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
                                  >
                                    <option value="" disabled>End</option>
                                    {endOptions.map((h) => (
                                      <option key={h} value={h}>{fmtHour(h)}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => removeSlotField(slot.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => addSlotField(table.id)}
                              className="flex items-center gap-2 text-[#132F45] hover:text-[#0e2a3a] text-sm"
                            >
                              <Plus size={16} /> Add Slot for this table
                            </button>

                            {/* Per-table summary strip — read-only view of the
                                fully-filled slots, grouped by day in week order. */}
                            {(() => {
                              const tableSlots = (Array.isArray(venueForm.slots) ? venueForm.slots : [])
                                .filter((s) => s.tableId === table.id && s.day && s.startHour !== '' && s.endHour !== '');
                              if (tableSlots.length === 0) return null;
                              const byDay = {};
                              DAYS_ORDER.forEach((d) => { byDay[d] = []; });
                              tableSlots.forEach((s) => {
                                if (DAYS_ORDER.includes(s.day)) {
                                  byDay[s.day].push({ s: Number(s.startHour), e: Number(s.endHour) });
                                }
                              });
                              DAYS_ORDER.forEach((d) => byDay[d].sort((a, b) => a.s - b.s));
                              const populatedDays = DAYS_ORDER.filter((d) => byDay[d].length > 0);
                              if (populatedDays.length === 0) return null;
                              return (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Summary</p>
                                  <div className="space-y-0.5">
                                    {populatedDays.map((d) => (
                                      <div key={d} className="text-xs text-gray-700">
                                        <span className="font-semibold">{d}:</span>{' '}
                                        {byDay[d].map(({ s, e }) => `${fmtHour(s)} – ${fmtHour(e)}`).join(' | ')}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addTableField}
                        className="flex items-center gap-2 text-[#132F45] hover:text-[#0e2a3a] text-sm"
                      >
                        <Plus size={16} /> Add Table
                      </button>
                    </div>
                  </div>

                  {slotConflicts.hasConflicts && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-700">
                      <p className="font-semibold mb-1">Resolve these conflicts before saving:</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {slotConflicts.messages.map((m, i) => (<li key={i}>{m}</li>))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const newTableId = Date.now();
                        setShowVenueForm(false);
                        setEditingVenue(null);
                        setVenueForm({
                          name: '',
                          tables: [{ id: newTableId, name: '' }],
                          slots: [{ id: newTableId + 1, tableId: newTableId, day: '', startHour: '', endHour: '' }]
                        });
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || slotConflicts.hasConflicts}
                      title={slotConflicts.hasConflicts ? 'Resolve slot conflicts first' : undefined}
                      className="px-4 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#0e2a3a] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Saving...' : (editingVenue ? 'Save Changes' : 'Add Venue')}
                    </button>
                  </div>
                </form>
              )}

              {!venues || venues.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No venues added yet.</p>
              ) : (
                <div className="space-y-4">
                  {Array.isArray(venues) && venues.map(venue => (
                    <div key={venue.id} className="border rounded-lg p-4 bg-white">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-lg">{venue.name}</h4>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditVenueForm(venue)}
                            className="text-[#132F45] hover:text-[#0e2a3a]"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteVenue(venue.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      {venue.tables && Array.isArray(venue.tables) && venue.tables.length > 0 && (
                        <div className="mb-2">
                          <span className="text-sm font-medium text-gray-700">Tables:</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {venue.tables.map((table, idx) => {
                              const tableName = typeof table === 'string' ? table : (table?.name || 'Unknown Table');
                              return (
                                <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                  {tableName}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {venue.slots && Array.isArray(venue.slots) && venue.slots.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-gray-700">Time Slots:</span>
                          <div className="mt-1 space-y-1">
                            {venue.slots.map((slot, idx) => (
                              <div key={idx} className="text-sm text-gray-600">
                                {slot.day}: {slot.startTime} - {slot.endTime}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Invite Tab */}
          {activeTab === 'invite' && invitationData && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium flex items-center gap-2 mb-2">
                  <LinkIcon size={18} className="text-[#132F45]" /> Invitation Link
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={invitationData.inviteLink || invitationData.invitationUrl || ''}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(invitationData.inviteLink || invitationData.invitationUrl)}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Link expires: {invitationData.expiresAt ? new Date(invitationData.expiresAt).toLocaleDateString() : 'N/A'}
                </p>
              </div>

              <div>
                <h3 className="font-medium flex items-center gap-2 mb-2">
                  <Key size={18} className="text-[#132F45]" /> Join Code
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={invitationData.joinCode || ''}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(invitationData.joinCode)}
                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-medium flex items-center gap-2 mb-2">
                  <DoorOpen size={18} className="text-[#132F45]" /> Open Request
                </h3>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded text-[#132F45] focus:ring-[#132F45]"
                    onChange={(e) => toggleOpenRequest(e.target.checked)}
                  />
                  <span className="ml-2 text-sm text-gray-700">Allow players to request to join</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Requests will appear in the Player Management tab for approval.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClubDetailView;
