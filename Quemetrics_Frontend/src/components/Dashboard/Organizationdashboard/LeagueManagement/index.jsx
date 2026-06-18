import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LeagueContext, useLeague } from '../../../../contexts/LeagueContext';
import AssignDivisionModal from './AssignDivisionModal';
import JoinRequestsModal from './JoinRequestsModal';
import VenueApprovalStatus from './VenueApprovalStatus';
import { FaProjectDiagram, FaEye, FaTimes } from 'react-icons/fa';
import LeaguePrerequisiteGuard from './LeaguePrerequisiteGuard';

// Helper function to format date strings (YYYY-MM-DD) without timezone offset issues
const formatDateString = (dateString) => {
  if (!dateString) return 'N/A';
  // Parse the date string as-is without timezone conversion
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Helper function to safely format season dates
const getSeasonDateDisplay = (startDate, endDate) => {
  const start = startDate ? formatDateString(startDate) : 'N/A';
  const end = endDate ? formatDateString(endDate) : 'N/A';
  return `${start} to ${end}`;
};

// ----------------------------------------------------------------------
// Helper Components
// ----------------------------------------------------------------------
const LoadingOverlay = ({ isOpen, message = "Processing..." }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-[9999] transition-all">
      <div className="flex flex-col items-center p-6 bg-white rounded-xl shadow-2xl border border-gray-100">
        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-800 font-semibold text-lg animate-pulse">{message}</p>
        <p className="text-gray-500 text-sm mt-1">Please wait a moment</p>
      </div>
    </div>
  );
};

const ConfirmationModal = ({ isOpen, onConfirm, onCancel, isCreating = false }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Create League</h3>
        <p className="text-gray-600 mb-6">Are you sure you want to create this league with the current settings?</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border rounded hover:bg-gray-100" disabled={isCreating}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isCreating}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

const InviteEmailModal = ({ isOpen, league, onClose }) => {
  const { invitePlayerByEmail } = useContext(LeagueContext);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen || !league) return null;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;

    try {
      setSending(true);
      const result = await invitePlayerByEmail(league.id, { email: email.trim(), name: name.trim() });
      if (result.success) {
        alert('Invite email sent successfully!');
        onClose();
        setEmail('');
        setName('');
      } else {
        alert(result.error || 'Failed to send invite.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send invite.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-2">Send Invite Email</h3>
        <p className="text-gray-600 text-sm mb-4">Send an email invite to join <strong>{league.basicInfo?.leagueName || league.name}</strong>.</p>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Player Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. John Doe" className="w-full border rounded p-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Player Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="e.g. john@example.com" className="w-full border rounded p-2 text-sm" />
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <button type="button" onClick={onClose} disabled={sending} className="px-4 py-2 text-sm border rounded hover:bg-gray-100 transition">Cancel</button>
            <button type="submit" disabled={sending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition">
              {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Main League Management Component
// ----------------------------------------------------------------------
const LeagueManagement = () => {
  const navigate = useNavigate();
  // ---------- Context ----------
  const { leagues, loading, getLeagues, getLeagueById, createWizardLeague, updateWizardLeague, updateLeague: updateLeagueApi, publishLeague, startLeague, advanceToNextRound, deleteLeague, invitePlayerByEmail, getWizardClubs, getWizardGameSeasons, assignPlayerToDivision, generateFixtures } = useContext(LeagueContext);
  // ---------- State ---
  const [error, setError] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [wizardInitialStep, setWizardInitialStep] = useState(1);
  const [newLeagueBasicInfo, setNewLeagueBasicInfo] = useState(null);
  const [addPlayersLeagueId, setAddPlayersLeagueId] = useState(null);
  const [assignDivisionLeagueId, setAssignDivisionLeagueId] = useState(null);
  const [viewingJoinRequestsLeagueId, setViewingJoinRequestsLeagueId] = useState(null);
  const [inviteEmailLeague, setInviteEmailLeague] = useState(null);
  const [editingLeagueDates, setEditingLeagueDates] = useState(null);
  const [selectedGameFilter, setSelectedGameFilter] = useState('all');

  // Fetch leagues on mount
  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const loadLeagues = async () => {
      try {
        setError(null);
        const result = await getLeagues({ signal: controller.signal });
        if (!isMounted) return;
        if (result.cancelled) return; // Silent return for intentional aborts

        if (!result.success) {
          setError(result.error);
        }
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        if (isMounted) {
          console.error('Error fetching leagues:', err);
          setError(err.message || 'Failed to fetch leagues');
        }
      }
    };

    loadLeagues();

    // Listen for league data changes (like when players are added)
    const handleLeagueDataChanged = (event) => {
      const { action } = event.detail || {};
      if (action === 'playersAdded' || action === 'wizard-updated' || action === 'divisionAssigned') {
        loadLeagues(); // Refresh the leagues list
      }
    };

    window.addEventListener('leagueDataChanged', handleLeagueDataChanged);

    return () => {
      isMounted = false;
      controller.abort();
      window.removeEventListener('leagueDataChanged', handleLeagueDataChanged);
    };
  }, [getLeagues]);

  const fetchLeagues = async () => {
    // Standard manual refresh (e.g. after a mutation)
    try {
      setError(null);
      const result = await getLeagues();
      if (!result.success) setError(result.error);
    } catch (err) {
      setError(err.message || 'Failed to fetch leagues');
    }
  };

  const findLeague = (id) => leagues.find(l => l.id === id);

  const updateLeague = (id, rawUpdates) => {
    // Normalize updates if they contain JSON strings
    const normalizedUpdates = {
      ...rawUpdates,
      basicInfo: typeof rawUpdates.basicInfo === 'string' ? (() => { try { return JSON.parse(rawUpdates.basicInfo); } catch { return rawUpdates.basicInfo; } })() : rawUpdates.basicInfo,
      structure: typeof rawUpdates.structure === 'string' ? (() => { try { return JSON.parse(rawUpdates.structure); } catch { return rawUpdates.structure; } })() : rawUpdates.structure,
    };
    setLeagues(prev => prev.map(l => l.id === id ? { ...l, ...normalizedUpdates } : l));
  };

  const openWizard = (leagueId, startStep = 1) => {
    setWizardInitialStep(startStep);
    setSelectedLeagueId(leagueId);
  };

  const handleLeagueCreated = async (basicInfo) => {
    setCreatingLeague(true);
    try {
      const payload = { basicInfo };
      const result = await createWizardLeague(payload);

      if (result.success) {
        setShowCreateModal(false);
        await fetchLeagues();
        // Automatically open wizard at Step 2 since Step 1 (Basic Info) was just completed
        openWizard(result.data.id, 2);
      }
    } catch (err) {
      console.error('[LeagueManagement] Error creating league:', err);

      if (err.response?.status === 201 && err.response?.data?.requiresApproval && err.response?.data?.data?.id) {
        await getLeagueById(err.response.data.data.id);
        setShowCreateModal(false);
        await fetchLeagues();
        const msg = err.response.data.message || 'Draft league created. Some venues require approval.';
        console.info('[LeagueManagement] Draft league created with pending venue approval:', msg);
      } else if (err.response?.status === 400 && err.response?.data?.venueApprovalRequestId && err.response?.data?.leagueId) {
        await getLeagueById(err.response.data.leagueId);
        setShowCreateModal(false);
        await fetchLeagues();
        throw err;
      } else {
        alert(err.response?.data?.error || 'Failed to create league');
      }
    } finally {
      setCreatingLeague(false);
    }
  };

  const handleWizardSave = async (leagueId, updatedData) => {
    try {
      const result = await updateWizardLeague(leagueId, updatedData);
      await fetchLeagues(); // Auto-refresh leagues after creation
      updateLeague(leagueId, result.data);
      // Notify other components that league data has changed
      window.dispatchEvent(new CustomEvent('leagueDataChanged', {
        detail: { leagueId, action: 'wizard-updated' }
      }));
    } catch (err) {
      await fetchLeagues();
      const msg = err?.response?.data?.message || 'Draft league created. Some venues require approval.';
      console.info('[LeagueManagement] Wizard save: pending venue approval:', msg);
    }
  };

  const assignPlayersToDivisions = async (leagueId, divisionIds, playerIds) => {
    for (let i = 0; i < playerIds.length; i++) {
      const divisionIndex = i % divisionIds.length;
      const divisionId = divisionIds[divisionIndex];
      const playerId = playerIds[i];
      try {
        const result = await assignPlayerToDivision(leagueId, divisionId, playerId);
        if (!result.success) {
          console.error(`Failed to assign player ${playerId} to division ${divisionId}:`, result.error);
        }
      } catch (err) {
        console.error(`Failed to assign player ${playerId} to division ${divisionId}:`, err);
        // Continue with other players, but log the error
      }
    }
  };

  const handleWizardComplete = async (leagueId, finalData) => {
    try {
      setCreatingLeague(true);

      let targetId = leagueId;

      if (leagueId === 'new') {
        const createResult = await createWizardLeague(finalData);
        if (!createResult.success) throw new Error(createResult.error || 'Failed to create league');
        targetId = createResult.data.id;
      } else {
        const updateResult = await updateWizardLeague(leagueId, finalData);
        if (!updateResult.success) throw new Error(updateResult.error || 'Failed to update league');
      }

      const publishResult = await publishLeague(targetId);
      if (publishResult.success) {
        alert('League created and finalized successfully! Registration is now open.');
        setSelectedLeagueId(null);
        setNewLeagueBasicInfo(null);
        await fetchLeagues();
      } else {
        throw new Error(publishResult.error || 'Failed to publish league');
      }
    } catch (err) {
      console.error('Wizard completion error:', err);
      alert(err.message || 'An error occurred during league creation');
    } finally {
      setCreatingLeague(false);
    }
  };

  const handlePublish = async (leagueId) => {
    try {
      const result = await publishLeague(leagueId);
      if (result.success) {
        alert('League published! Registration is now open.');
        await fetchLeagues();
      } else {
        alert(result.error || 'Failed to publish league');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to publish league');
    }
  };

  const handleStartLeague = async (leagueId) => {
    if (!window.confirm('Are you sure you want to start the league? This will lock registration and generate the first round of fixtures.')) return;
    try {
      const result = await startLeague(leagueId);
      if (result.success) {
        alert('League started successfully! Fixtures generated.');
        await fetchLeagues();
      } else {
        alert(result.error || 'Failed to start league');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start league');
    }
  };

  const handleNextRound = async (leagueId) => {
    if (!window.confirm('Are you sure you want to generate the next round of fixtures?')) return;
    try {
      const result = await advanceToNextRound(leagueId);
      if (result.success) {
        alert('Next round fixtures generated successfully!');
        await fetchLeagues();
      } else {
        alert(result.error || 'Failed to generate next round');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate next round');
    }
  };

  const handleRegenerateFixtures = async (leagueId) => {
    if (window.confirm("Add missing matches for late-joining players? Existing confirmed/booked matches will not be affected.")) {
      try {
        const result = await generateFixtures(leagueId, { mode: 'incremental' });
        if (result.success) {
          alert(result.message || "Fixtures updated successfully!");
          fetchLeagues();
        } else {
          alert(result.error || "Failed to update fixtures");
        }
      } catch (err) {
        alert("An error occurred while updating fixtures");
      }
    }
  };

  const handleDeleteLeague = async (leagueId) => {
    if (!window.confirm('Are you sure you want to delete this league? This action cannot be undone.')) return;
    try {
      const result = await deleteLeague(leagueId);
      if (result.success) {
        alert('League deleted successfully!');
        await fetchLeagues();
      } else {
        alert(result.error || 'Failed to delete league');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete league');
    }
  };

  const handleUpdateLeagueDates = async (leagueId, dateData) => {
    try {
      const result = await updateLeagueApi(leagueId, dateData);
      if (result.success) {
        alert('League dates updated successfully!');
        await fetchLeagues();
      } else {
        throw new Error(result.error || 'Failed to update dates');
      }
    } catch (err) {
      console.error('[LeagueManagement] Error updating dates:', err);
      throw err;
    }
  };


  const selectedLeague = useMemo(() => {
    if (selectedLeagueId === 'new') {
      return { id: 'new', basicInfo: newLeagueBasicInfo };
    }
    return selectedLeagueId ? findLeague(selectedLeagueId) : null;
  }, [selectedLeagueId, newLeagueBasicInfo, leagues]);

  const filteredLeagues = useMemo(() => {
    if (selectedGameFilter === 'all') return leagues;
    return leagues.filter(league => {
      const gName = (league.basicInfo?.gameName || league.gameName || '').toLowerCase();
      if (selectedGameFilter === 'poker') {
        return gName === 'poker' || gName === 'pooker';
      }
      return gName === selectedGameFilter;
    });
  }, [leagues, selectedGameFilter]);

  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    registration_open: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-purple-100 text-purple-800',
    archived: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="container mx-auto p-6 relative">
      <LoadingOverlay isOpen={loading || creatingLeague} message={loading ? "Loading Leagues..." : "Creating League..."} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Leagues</h1>
        {/* Original header button preserved for revert:
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Create League
        </button> */}

        <LeaguePrerequisiteGuard compact onAllowed={() => setShowCreateModal(true)} />
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading leagues...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {!loading && !error && leagues.length === 0 ? (
        <div className="py-16 flex justify-center">
          {/* REVERT NOTE: original empty state was:
              <p className="text-center text-gray-500">No leagues yet. Click "Create League" to start.</p> */}
          <LeaguePrerequisiteGuard onAllowed={() => setShowCreateModal(true)} />
        </div>
      ) : !loading && !error ? (
        <>
          {/* Game Filter Bar */}
          <div className="flex items-center gap-4 mb-8 bg-[#FAFAFA] p-4 rounded-[2rem] border border-gray-50 shadow-sm text-left">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 pl-2">Filter by game:</span>
            <div className="flex gap-2.5">
              {[
                { id: 'all', label: 'All Leagues' },
                { id: 'snooker', label: 'Snooker' },
                { id: 'pool', label: 'Pool' },
                { id: 'pooker', label: 'Pooker' }
              ].map(game => {
                const isActive = selectedGameFilter === game.id;
                const count = game.id === 'all'
                  ? leagues.length
                  : leagues.filter(l => {
                    const g = (l.basicInfo?.gameName || l.gameName || '').toLowerCase();
                    if (game.id === 'poker') return g === 'poker' || g === 'pooker';
                    return g === game.id;
                  }).length;

                return (
                  <button
                    key={game.id}
                    onClick={() => setSelectedGameFilter(game.id)}
                    className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2.5 ${isActive
                      ? 'bg-[#132F45] text-white shadow-md shadow-[#132F45]/10 scale-[1.03]'
                      : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'
                      }`}
                  >
                    {game.label}
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${isActive ? 'bg-[#BA995D] text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredLeagues.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-[2rem] border border-gray-100/50">
              <p className="text-gray-500 font-semibold text-sm">No leagues found matching the selected game filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLeagues.map(league => (
                <div
                  key={league.id}
                  onClick={() => {
                    if (league.status === 'draft') {
                      if (league.venueApprovalStatus === 'pending' || league.isVenueApprovalPending || (league.venueApprovalRequestId && league.venueApproval?.status !== 'approved')) {
                        const venueNames = league.pendingVenueNames?.length > 0 ? ` for: ${league.pendingVenueNames.join(', ')}` : '';
                        alert(`Venue approval is pending${venueNames}. You cannot modify or activate this league until the venue owners approve your request.`);
                        return;
                      }
                      openWizard(league.id, 1);
                    } else if (league.status === 'active') {
                      setEditingLeagueDates(league);
                    }
                  }}
                  className={`border rounded-lg p-4 shadow hover:shadow-lg transition ${(league.status === 'draft' || league.status === 'active') ? 'cursor-pointer border-blue-200' : 'cursor-default'
                    }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-xl font-semibold">{league.basicInfo?.leagueName || league.name}</h2>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[league.status]}`}>
                        {league.status.charAt(0).toUpperCase() + league.status.slice(1)}
                      </span>

                      {/* Visibility Badge */}
                      <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider border ${league.visibility === 'public' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                        league.visibility === 'invite' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                          'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                        {league.visibility?.toUpperCase() || 'PUBLIC'}
                      </span>

                      {(league.venueApprovalStatus === 'pending' || league.isVenueApprovalPending || (league.venueApprovalRequestId && league.venueApproval?.status !== 'approved')) && (
                        <span
                          className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px] uppercase font-bold tracking-wider border border-yellow-200"
                          title={league.pendingVenueNames?.length > 0 ? `Pending: ${league.pendingVenueNames.join(', ')}` : 'Pending Venue Approval'}
                        >
                          Pending Venue Appr.
                        </span>
                      )}



                    </div>
                  </div>
                  {league.basicInfo?.gameName && <p className="text-gray-600">Game: {league.basicInfo.gameName}</p>}
                  <p className="text-gray-500 text-sm mt-2">
                    <span className="font-semibold">Registration:</span> {league.basicInfo?.registrationOpen || league.registrationOpen || '??'} – {league.basicInfo?.registrationClose || league.registrationClose || '??'}
                  </p>
                  {(league.startDate || league.endDate) && (
                    <p className="text-gray-500 text-sm mt-2">
                      <span className="font-semibold">Season:</span> {league.startDate || '??'} – {league.endDate || '??'}
                    </p>
                  )}
                  {league.visibility !== 'private' && (league.status === 'registration_open' || (league.status === 'active' && league.lateJoinAllowed)) && (
                    <div className="mt-2 text-[11px] font-medium text-gray-500 flex flex-col items-start gap-1">
                      <div className="flex items-center gap-1">
                        Code: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 uppercase">{league.joinCode || 'N/A'}</span>
                        {league.joinCode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(league.joinCode);
                              alert('Join code copied to clipboard!');
                            }}
                            className="text-blue-500 hover:text-blue-700 ml-2 font-bold focus:outline-none transition"
                          >
                            📋 Copy Code
                          </button>
                        )}
                      </div>
                      {league.visibility === 'invite' && league.generalInviteToken && (
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = `${window.location.origin}/join?token=${league.generalInviteToken}&leagueId=${league.id}`;
                              navigator.clipboard.writeText(url);
                              alert('Invite link copied to clipboard!');
                            }}
                            className="text-purple-600 hover:text-purple-800 font-bold focus:outline-none flex items-center gap-1 transition"
                          >
                            🔗 Copy Link
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInviteEmailLeague(league);
                            }}
                            className="text-green-600 hover:text-green-800 font-bold focus:outline-none flex items-center gap-1 ml-2 transition"
                          >
                            ✉️ Invite Email
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between items-center text-gray-500 text-sm mt-3 pt-2 border-t">
                    <div>
                      <span className="font-semibold">Players:</span> {league.totalPlayers || 0}
                    </div>
                    {league.currentRound > 0 && (
                      <div>
                        <span className="font-semibold">Round:</span> {league.currentRound}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    {/* Status-specific lifecycle actions */}
                    {league.status === 'draft' && (
                      <div className="flex flex-col gap-2">

                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openWizard(league.id, 1); }}
                            className="flex-1 px-3 py-1.5 border border-blue-500 text-blue-600 text-xs font-semibold rounded hover:bg-blue-50 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteLeague(league.id); }}
                            className="flex-1 px-3 py-1.5 border border-red-500 text-red-600 text-xs font-semibold rounded hover:bg-red-50 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}

                    {league.status === 'registration_open' && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          {(() => {
                            const isVenuePending = league.venueApprovalStatus === 'pending' || league.isVenueApprovalPending || (league.venueApprovalRequestId && league.venueApproval?.status !== 'approved');
                            return (
                              <div className="relative flex-1 group/start">
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (!isVenuePending) handleStartLeague(league.id); }}
                                  disabled={isVenuePending}
                                  title={isVenuePending ? 'Venue Approval Required before starting the league' : 'Start League'}
                                  className={`w-full px-3 py-2 text-sm font-semibold rounded transition flex items-center justify-center gap-1.5 ${isVenuePending
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-700 cursor-pointer'
                                    }`}
                                >
                                  {isVenuePending ? '🔒' : '▶'} Start League
                                </button>
                                {isVenuePending && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 hidden group-hover/start:flex items-center gap-1.5 bg-gray-800 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap pointer-events-none">
                                    <span>⏳</span> Venue Approval Required
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {league.lateJoinAllowed && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAddPlayersLeagueId(league.id); }}
                              className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded hover:bg-gray-200 transition"
                            >
                              + Players
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openWizard(league.id, 1); }}
                            className="flex-1 px-3 py-1.5 border border-blue-500 text-blue-600 text-xs font-semibold rounded hover:bg-blue-50 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteLeague(league.id); }}
                            className="flex-1 px-3 py-1.5 border border-red-500 text-red-600 text-xs font-semibold rounded hover:bg-red-50 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}

                    {(league.status === 'active' || league.status === 'completed') && (
                      <div className="flex flex-col gap-2">
                        {league.status === 'active' && (
                          <>
                            <div className="flex gap-2">
                              {league.fixtureStrategy === 'round_by_round' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleNextRound(league.id); }}
                                  className="flex-1 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 transition"
                                >
                                  ⏭ Next Round
                                </button>
                              )}

                              {league.lateJoinAllowed && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAddPlayersLeagueId(league.id); }}
                                  className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition"
                                >
                                  + Add Late Joiner
                                </button>
                              )}
                            </div>

                            <div className="flex gap-2">
                              {league.visibility === 'public' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setViewingJoinRequestsLeagueId(league.id); }}
                                  className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded hover:bg-gray-200 transition"
                                >
                                  📋 Join Requests
                                </button>
                              )}
                              {league.lateJoinAllowed && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAssignDivisionLeagueId(league.id); }}
                                  className="flex-1 px-3 py-2 bg-purple-100 text-purple-700 text-sm font-semibold rounded hover:bg-purple-200 transition"
                                >
                                  👤 Divisions
                                </button>
                              )}
                            </div>
                          </>
                        )}

                        <div className="flex gap-2">
                          {league.status === 'active' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingLeagueDates(league); }}
                              className="flex-1 px-3 py-2 border border-blue-500 text-blue-600 text-xs font-semibold rounded hover:bg-blue-50 transition"
                            >
                              Edit Settings
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const clubId = league.basicInfo?.clubId || league.clubId || '';
                              const gameId = league.basicInfo?.gameId || league.gameId || '';
                              const params = new URLSearchParams();
                              params.set('leagueId', league.id);
                              if (clubId) params.set('clubId', clubId);
                              if (gameId) params.set('gameId', gameId);
                              navigate(`/organization/leaguematchmanagement?${params.toString()}`);
                            }}
                            className={`px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition flex items-center justify-center gap-2 ${league.status === 'active' ? 'flex-1' : 'w-full'}`}
                          >
                            <FaEye size={12} className="text-current" /> View Detail
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {showCreateModal && (
        <StepOneModal onClose={() => setShowCreateModal(false)} onLeagueCreated={handleLeagueCreated} />
      )}

      {selectedLeague && (
        <LeagueWizardModal
          league={selectedLeague}
          initialStep={wizardInitialStep}
          onSave={(updated) => handleWizardSave(selectedLeague.id, updated)}
          onComplete={(final) => handleWizardComplete(selectedLeague.id, final)}
          onClose={() => setSelectedLeagueId(null)}
          onOpenAddPlayers={() => setAddPlayersLeagueId(selectedLeague.id)}
        />
      )}

      {addPlayersLeagueId && (
        <AddPlayersModal
          leagueId={addPlayersLeagueId}
          league={findLeague(addPlayersLeagueId)}
          onClose={() => setAddPlayersLeagueId(null)}
          onPlayersAdded={() => {
            setAddPlayersLeagueId(null);
            fetchLeagues();
            // Trigger refresh in other components that might be showing league data
            window.dispatchEvent(new CustomEvent('leagueDataChanged', {
              detail: { leagueId: addPlayersLeagueId, action: 'playersAdded' }
            }));
          }}
        />
      )}

      {assignDivisionLeagueId && (
        <AssignDivisionModal
          leagueId={assignDivisionLeagueId}
          league={findLeague(assignDivisionLeagueId)}
          onClose={() => setAssignDivisionLeagueId(null)}
          onAssignmentComplete={() => {
            setAssignDivisionLeagueId(null);
            fetchLeagues();
            // Trigger refresh in other components that might be showing league data
            window.dispatchEvent(new CustomEvent('leagueDataChanged', {
              detail: { leagueId: assignDivisionLeagueId, action: 'divisionAssigned' }
            }));
          }}
        />
      )}

      {viewingJoinRequestsLeagueId && (
        <JoinRequestsModal
          leagueId={viewingJoinRequestsLeagueId}
          leagueName={findLeague(viewingJoinRequestsLeagueId)?.name || findLeague(viewingJoinRequestsLeagueId)?.basicInfo?.leagueName}
          onClose={() => setViewingJoinRequestsLeagueId(null)}
          onRequestsUpdated={() => {
            // Refresh leagues list after approval/rejection
            fetchLeagues();
          }}
        />
      )}

      <InviteEmailModal
        isOpen={!!inviteEmailLeague}
        league={inviteEmailLeague}
        onClose={() => setInviteEmailLeague(null)}
      />

      {editingLeagueDates && (
        <EditLeagueDatesModal
          league={editingLeagueDates}
          onClose={() => setEditingLeagueDates(null)}
          onSave={(dateData) => handleUpdateLeagueDates(editingLeagueDates.id, dateData)}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// Edit League Dates Modal
// ----------------------------------------------------------------------
const EditLeagueDatesModal = ({ league, onClose, onSave }) => {
  const [startDate, setStartDate] = useState(league?.leagueStartDate || league?.startDate || '');
  const [endDate, setEndDate] = useState(league?.leagueEndDate || league?.endDate || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError('Please fill in both dates');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date must be before end date');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSave({
        leagueStartDate: startDate,
        leagueEndDate: endDate
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update league dates');
    } finally {
      setLoading(false);
    }
  };

  const seasonRangeText = league?.season
    ? `Season: ${league.season.startDate} to ${league.season.endDate}`
    : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#132F45]/30 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[3.5rem] w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 flex flex-col animate-in fade-in zoom-in duration-300">

        {/* Header */}
        <div className="px-8 pt-8 pb-4 border-b border-gray-50 bg-gradient-to-b from-[#FAFAFA] to-white relative text-left">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2 h-5 bg-[#BA995D] rounded-full" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-[#BA995D]">League Settings</h2>
          </div>
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-[#132F45] tracking-tight">Edit <span className="text-[#BA995D]">Dates</span></h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-gray-300 hover:text-[#132F45]">
              <FaTimes className="text-lg" />
            </button>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{league?.name || league?.basicInfo?.leagueName}</p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6 text-left">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-semibold text-red-600">
              ⚠️ {error}
            </div>
          )}

          {seasonRangeText && (
            <div className="p-4 bg-[#FAFAFA] border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-wider text-gray-500">
              📅 {seasonRangeText}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-white border-2 border-gray-100 rounded-2xl px-5 py-3 text-xs font-semibold text-[#132F45] focus:outline-none focus:border-[#BA995D] transition-colors"
              min={league?.season?.startDate}
              max={league?.season?.endDate}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-white border-2 border-gray-100 rounded-2xl px-5 py-3 text-xs font-semibold text-[#132F45] focus:outline-none focus:border-[#BA995D] transition-colors"
              min={startDate || league?.season?.startDate}
              max={league?.season?.endDate}
              required
            />
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl border-2 border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-red-400 hover:border-red-100 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-12 rounded-2xl bg-[#132F45] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#BA995D] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Step 1 Modal (Basic Info with multiple venues)
// ----------------------------------------------------------------------
const StepOneModal = ({ onClose, onLeagueCreated }) => {
  // (Keep your existing StepOneModal code – unchanged)
  const initialFormState = {
    leagueName: '',
    clubId: '',
    clubName: '',
    venueIds: [], // Now an array of venue names/strings
    venueOwnerId: '', // We can keep this for the primary/first venue or last selected, but venueIds is the array
    gameId: '',
    gameName: '',
    gameSeasonId: '',
    visibility: 'public',
    registrationOpen: '',
    registrationClose: '',
    leagueStartDate: '',
    leagueEndDate: '',
  };

  const [formData, setFormData] = useState(initialFormState);

  const [clubs, setClubs] = useState([]);
  const [availableVenues, setAvailableVenues] = useState([]);
  const [allVenuesWithApproval, setAllVenuesWithApproval] = useState([]);
  const [availableGames, setAvailableGames] = useState([]);
  const [activeGamesList, setActiveGamesList] = useState([]);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [newVenueInput, setNewVenueInput] = useState('');
  const [selectedVenue, setSelectedVenue] = useState('');
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [venuesLoading, setVenuesLoading] = useState(true);
  const { getWizardClubs, getWizardGameSeasons, getAllVenues } = useLeague();

  const hasInitialized = useRef(false);

  useEffect(() => {
    // Prevent double fetching in StrictMode by only initializing once
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    (async () => {
      await fetchVenuesWithApprovalStatus();
      await fetchClubs();
    })();
  }, []);

  const fetchClubs = async () => {
    try {
      setLoading(true);
      const result = await getWizardClubs();
      if (result.success) {
        const clubsData = result.data || [];
        setClubs(clubsData);
        if (result.activeGames) {
          setActiveGamesList(result.activeGames);
        }
        return clubsData;
      }
      return [];
    } catch (err) {
      console.error('Error fetching clubs:', err);
      alert('Failed to fetch clubs');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchVenuesWithApprovalStatus = async () => {
    const loadErrorPlaceholder = [
      { id: '__load_error__', name: 'Unable to load venues — please try again later', disabled: true },
    ];
    setVenuesLoading(true);
    try {
      const result = await getAllVenues();
      if (result && result.success) {
        const filtered = (result.data || []).filter(v => v && v.name && String(v.name).trim() !== '');
        setAllVenuesWithApproval(filtered);
        return;
      }
      console.warn("getAllVenues returned no data");
      setAllVenuesWithApproval(loadErrorPlaceholder);
    } catch (err) {
      console.warn("getAllVenues failed:", err?.response?.data || err.message || err);
      setAllVenuesWithApproval(loadErrorPlaceholder);
    } finally {
      setVenuesLoading(false);
    }
  };

  const fetchSeasons = async (gameName) => {
    try {
      const result = await getWizardGameSeasons(gameName);
      if (result.success) {
        setAvailableSeasons(result.data || []);
      }
    } catch (err) {
      console.error('Error fetching seasons:', err);
      alert('Failed to fetch seasons for ' + gameName);
    }
  };

  const handleClubChange = (clubId) => {
    const club = clubs.find(c => c.id === clubId);
    if (club) {
      const venuesArray = Array.isArray(club.venues)
        ? club.venues
        : club.venues && typeof club.venues === 'object'
          ? Object.values(club.venues)
          : [];

      let gamesArray = [];
      if (typeof club.games === 'string') {
        try {
          const parsed = JSON.parse(club.games);
          if (Array.isArray(parsed)) gamesArray = parsed.map(g => (typeof g === 'string' ? g : g.name || g.id || JSON.stringify(g)));
        } catch (e) {
          gamesArray = club.games.split(',').map(g => g.trim()).filter(Boolean);
        }
      } else if (Array.isArray(club.games)) {
        gamesArray = club.games.map(g => (typeof g === 'string' ? g : g.name || g.id || JSON.stringify(g)));
      } else if (club.games && typeof club.games === 'object') {
        gamesArray = Object.values(club.games).map(g => (typeof g === 'string' ? g : g.name || g.id || JSON.stringify(g)));
      }

      setAvailableVenues(venuesArray || []);
      setAvailableGames(gamesArray || []);
      setFormData(prev => ({
        ...prev,
        clubId,
        clubName: club.name,
        venueIds: [],
        gameId: '',
        gameName: '',
        gameSeasonId: '',
      }));
      setAvailableSeasons([]);
    } else {
      setAvailableVenues([]);
      setAvailableGames([]);
      setAvailableSeasons([]);
    }
  };

  const handleGameChange = async (gameName) => {
    setFormData(prev => ({
      ...prev,
      gameName: gameName,
      gameId: prev.gameId && prev.gameName === gameName ? prev.gameId : '', // Don't wipe ID if name hasn't changed, otherwise let backend resolve it      gameSeasonId: '',
    }));

    if (gameName) {
      await fetchSeasons(gameName);
    } else {
      setAvailableSeasons([]);
    }
  };

  const addVenue = () => {
    const valueToAdd = selectedVenue || newVenueInput.trim();
    if (!valueToAdd) return;

    let normalized = valueToAdd;
    if (selectedVenue && availableVenues && availableVenues.length) {
      const found = availableVenues.find(v => v.id === selectedVenue || v.name === selectedVenue);
      if (found) normalized = found.name || found.id;
    }

    if (!formData.venueIds.includes(normalized)) {
      setFormData(prev => ({
        ...prev,
        venueIds: [...prev.venueIds, normalized],
      }));
    }

    setNewVenueInput('');
    setSelectedVenue('');
  };

  const removeVenue = (venue) => {
    setFormData(prev => ({
      ...prev,
      venueIds: prev.venueIds.filter(v => v !== venue),
    }));
  };

  // Check if any selected venue requires approval
  const checkVenuesRequiringApproval = () => {
    if (!formData.venueIds || formData.venueIds.length === 0) return [];

    return formData.venueIds.filter(vId => {
      const venue = allVenuesWithApproval.find(v => v.id === vId);
      return venue && !venue.isOwner; // Venues not owned by current organization require approval
    });
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.leagueName.trim()) newErrors.leagueName = 'League name is required';
    if (!formData.clubId) newErrors.club = 'Please select a club';

    // Check venueIds with detailed logging
    console.log('[LeagueManagement] Validating venues - formData.venueIds:', formData.venueIds, 'length:', formData.venueIds?.length);
    if (!formData.venueIds || formData.venueIds.length === 0) {
      newErrors.venue = 'Please select at least one venue';
    }

    if (!formData.gameId && !formData.gameName) newErrors.game = 'Please select a game';
    if (!formData.gameSeasonId) newErrors.season = 'Please select a season';

    // Get selected season details for date validation
    const selectedSeason = formData.gameSeasonId ? availableSeasons.find(s => s.id === formData.gameSeasonId) : null;

    const regOpen = formData.registrationOpen;
    const regClose = formData.registrationClose;
    const leagueStartDate = formData.leagueStartDate;
    const leagueEndDate = formData.leagueEndDate;

    // Validation sequence: Registration Dates → Season Boundaries → League Dates → Registration → League relationship

    // 1. Registration date order validation
    if (regOpen && regClose && new Date(regClose) <= new Date(regOpen)) {
      newErrors.dates = 'Registration close must be after registration open';
    }

    // 2. Registration dates against season boundaries
    if (selectedSeason && regOpen) {
      const seasonStart = new Date(selectedSeason.startDate);
      const registrationOpen = new Date(regOpen);
      if (registrationOpen < seasonStart) {
        newErrors.dates = `Registration open date cannot be before season start date (${formatDateString(selectedSeason.startDate)})`;
      }
    }

    if (selectedSeason && regClose) {
      const seasonEnd = new Date(selectedSeason.endDate);
      const registrationClose = new Date(regClose);
      if (registrationClose > seasonEnd) {
        newErrors.dates = `Registration close date cannot be after season end date (${formatDateString(selectedSeason.endDate)})`;
      }
    }

    // 3. League start date must be after registration close
    if (leagueStartDate && regClose && new Date(leagueStartDate) <= new Date(regClose)) {
      newErrors.dates = 'League start must be after registration close';
    }

    // 4. League dates against season boundaries
    if (selectedSeason && leagueStartDate) {
      const seasonStart = new Date(selectedSeason.startDate);
      const leagueStart = new Date(leagueStartDate);
      if (leagueStart < seasonStart) {
        newErrors.dates = `League start date cannot be before season start date (${formatDateString(selectedSeason.startDate)})`;
      }
    }

    if (selectedSeason && leagueEndDate) {
      const seasonEnd = new Date(selectedSeason.endDate);
      const leagueEnd = new Date(leagueEndDate);
      if (leagueEnd > seasonEnd) {
        newErrors.dates = `League end date cannot be after season end date (${formatDateString(selectedSeason.endDate)})`;
      }
    }

    // 5. League dates order
    if (leagueStartDate && leagueEndDate && new Date(leagueEndDate) <= new Date(leagueStartDate)) {
      newErrors.dates = 'League end must be after league start';
    }

    // 6. Overall season boundary check
    if (selectedSeason && leagueStartDate && leagueEndDate) {
      const seasonStart = new Date(selectedSeason.startDate);
      const seasonEnd = new Date(selectedSeason.endDate);
      const leagueStart = new Date(leagueStartDate);
      const leagueEnd = new Date(leagueEndDate);

      if (leagueStart < seasonStart || leagueEnd > seasonEnd) {
        newErrors.dates = `League dates must be within the season range (${getSeasonDateDisplay(selectedSeason.startDate, selectedSeason.endDate)})`;
      }
    }

    console.log('[LeagueManagement] Validation errors:', newErrors);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      console.log('[LeagueManagement] Validation failed, not submitting');
      return;
    }

    console.log('[LeagueManagement] Submitting form with formData:', JSON.stringify(formData, null, 2));
    setIsSubmitting(true);
    try {
      await onLeagueCreated(formData);
    } catch (err) {
      console.error('[LeagueManagement] Submit error:', err);
      // If it's the pending approval error, we still want to close the modal and refresh
      if (err.response?.status === 400 && err.response?.data?.venueApprovalRequestId) {
        alert(`${err.response.data.error}\n\nThe draft league has been saved.`);
        if (typeof onClose === 'function') {
          onClose(); // Optional: if onClose is passed to StepOneModal
        }
      } else {
        alert(err.response?.data?.error || 'Failed to create league');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0  backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Create New League – Step 1: Basic Info</h2>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading clubs...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* League Name */}
            <div>
              <label className="block text-sm font-medium mb-1">League Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.leagueName}
                onChange={(e) => setFormData(prev => ({ ...prev, leagueName: e.target.value }))}
                className="w-full border rounded p-2"
                placeholder="e.g. Spring Championship"
              />
              {errors.leagueName && <p className="text-red-500 text-sm">{errors.leagueName}</p>}
            </div>

            {/* Club */}
            <div>
              <label className="block text-sm font-medium mb-1">Club <span className="text-red-500">*</span></label>
              <select
                value={formData.clubId}
                onChange={(e) => handleClubChange(e.target.value)}
                className="w-full border rounded p-2"
              >
                <option value="">Select a club</option>
                {clubs.map(club => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
              {errors.club && <p className="text-red-500 text-sm">{errors.club}</p>}
            </div>

            {/* Venues */}
            <div>
              <label className="block text-sm font-medium mb-1">Venues <span className="text-red-500">*</span></label>
              <p className="text-xs text-gray-600 mb-2">Select venues for this league. You can add venues you own (auto-approved) or request to use venues from other organizations (requires approval from venue owner).</p>
              <div className="bg-blue-50 border border-blue-200 p-2 rounded text-xs text-blue-700 mb-3">
                <strong>ℹ️ Note:</strong> Only venues with established Venue Owner profiles can be requested for approval.
                This dropdown shows only VenueOwner venues from other organizations. Your own venues are auto-approved.
                If a venue doesn't appear, contact the venue owner to create a Venue Owner profile.
              </div>
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedVenueId || ''}
                  onChange={(e) => {
                    const vId = e.target.value;
                    if (!vId) return;

                    const venue = allVenuesWithApproval.find(v => v.id === vId);
                    if (venue) {
                      if (!formData.venueIds.includes(vId)) {
                        setFormData(prev => ({
                          ...prev,
                          venueIds: [...prev.venueIds, vId],
                          // Set venueOwnerId to the first one selected if none exists, or keep as is
                          venueOwnerId: prev.venueOwnerId || vId
                        }));
                      }
                      setSelectedVenueId(''); // Reset for next selection
                    }
                  }}
                  className="w-full border rounded p-2"
                  disabled={venuesLoading}
                >
                  <option value="">-- Select a venue to add --</option>
                  {venuesLoading ? (
                    <option value="" disabled>Loading venues...</option>
                  ) : allVenuesWithApproval && allVenuesWithApproval.length > 0 ? (
                    allVenuesWithApproval
                      .filter(v => {
                        // FILTER 1: Only show venues that can create LeagueVenueRequests (VenueOwner venues)
                        if (v.canCreateLeagueRequest === false) return false; // Skip club venues

                        // FILTER 2: Skip venues already added
                        if (formData.venueIds.includes(v.id)) return false;

                        return true;
                      })
                      .map(v => (
                        <option key={v.id} value={v.id} disabled={formData.venueIds.includes(v.id)}>
                          {v.name} {v.isOwner ? '(Your Venue)' : '(Requires Approval)'}
                        </option>
                      ))
                  ) : (
                    <option value="" disabled>No venues available</option>
                  )}
                </select>
              </div>

              {/* Selected Venues List */}
              {formData.venueIds && formData.venueIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4 p-2 border rounded bg-gray-50">
                  {formData.venueIds.map(vId => {
                    const v = allVenuesWithApproval.find(av => av.id === vId);
                    // For composite VenueOwner IDs (venueOwnerId:venueName), extract the venue name
                    // For club venues, try to find a meaningful name or show fallback
                    let displayName = v ? v.name : vId;
                    if (!v) {
                      if (String(vId).includes(':')) {
                        // VenueOwner composite ID: venueOwnerId:venueName
                        displayName = vId.split(':')[1];
                      } else if (String(vId).startsWith('venue_')) {
                        // Club venue ID: try to extract name or show generic
                        displayName = 'Club Venue';
                      }
                    }
                    const isClubVenue = String(vId).startsWith('venue_');
                    return (
                      <span key={vId} className={`${isClubVenue ? 'bg-red-100 border-red-300 text-red-700 border' : 'bg-blue-100 text-blue-800'} px-3 py-1 rounded-full text-sm flex items-center gap-2`}>
                        {displayName}
                        {isClubVenue && <span className="text-xs font-bold">[Club Venue - Will Fail]</span>}
                        <button
                          type="button"
                          onClick={() => removeVenue(vId)}
                          className={`${isClubVenue ? 'text-red-600 hover:text-red-800' : 'text-blue-500 hover:text-red-700'} font-bold`}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Approval Warning for selected venues requiring approval */}
              {(() => {
                const venuesRequiringApproval = checkVenuesRequiringApproval();

                if (venuesRequiringApproval.length > 0) {
                  return (
                    <div className="mb-3 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                      <p className="text-sm text-yellow-800 font-bold">⚠️ Venue Approval Required - Draft Will Be Pending</p>
                      <p className="text-xs text-yellow-700 mt-1 mb-2">
                        The following venue(s) require approval from their owners. This draft league will be created with <strong>"Pending Approval"</strong> status. You can view it in your leagues list and activate it once all owners approve.
                      </p>
                      <ul className="list-disc ml-5">
                        {venuesRequiringApproval.map(vId => {
                          const v = allVenuesWithApproval.find(av => av.id === vId);
                          return (
                            <li key={vId} className="text-xs text-yellow-700">
                              <strong>{v?.name}</strong> (Owned by {v?.ownerOrganizationName || 'another organizer'})
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                }
                return null;
              })()}

              {errors.venue && <p className="text-red-500 text-sm">{errors.venue}</p>}
            </div>

            {/* Game */}
            {formData.clubId && (
              <div>
                <label className="block text-sm font-medium mb-1">Game <span className="text-red-500">*</span></label>
                <select
                  value={formData.gameName || ''}
                  onChange={(e) => handleGameChange(e.target.value)}
                  className="w-full border rounded p-2"
                >
                  <option value="">Select a game</option>
                  {availableGames.map(game => {
                    const hasActiveSeason = activeGamesList.includes(game);
                    return (
                      <option
                        key={game}
                        value={game}
                        disabled={!hasActiveSeason}
                        className={!hasActiveSeason ? "text-gray-400 bg-gray-50" : ""}
                      >
                        {game} {!hasActiveSeason && "(No active season)"}
                      </option>
                    );
                  })}
                </select>
                {errors.game && <p className="text-red-500 text-sm">{errors.game}</p>}
              </div>
            )}

            {/* Game Season */}
            {formData.gameName && (
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Season <span className="text-red-500">*</span></label>
                  <select
                    value={formData.gameSeasonId}
                    onChange={(e) => setFormData(prev => ({ ...prev, gameSeasonId: e.target.value }))}
                    className="w-full border rounded p-2"
                  >
                    <option value="">Select a season</option>
                    {availableSeasons.map(season => (
                      <option key={season.id} value={season.id}>{season.name}</option>
                    ))}
                  </select>
                  {errors.season && <p className="text-red-500 text-sm">{errors.season}</p>}
                </div>

                {/* Display selected season dates */}
                {formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId) && (
                  <div className="bg-blue-50 border border-blue-300 rounded p-3">
                    {(() => {
                      const selectedSeason = availableSeasons.find(s => s.id === formData.gameSeasonId);
                      const seasonDisplay = getSeasonDateDisplay(selectedSeason?.startDate, selectedSeason?.endDate);
                      return (
                        <div className="text-sm text-blue-900">
                          <strong>📅 Season Duration:</strong> {seasonDisplay}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Visibility */}
            <div>
              <label className="block text-sm font-medium mb-2">Visibility</label>
              <div className="flex gap-4">
                {['public', 'private', 'invite'].map(v => (
                  <label key={v} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="visibility"
                      value={v}
                      checked={formData.visibility === v}
                      onChange={(e) => setFormData(prev => ({ ...prev, visibility: e.target.value }))}
                    /> {v.charAt(0).toUpperCase() + v.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Registration Open</label>
                <input
                  type="date"
                  value={formData.registrationOpen}
                  onChange={(e) => setFormData(prev => ({ ...prev, registrationOpen: e.target.value }))}
                  min={formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId)?.startDate ? new Date(availableSeasons.find(s => s.id === formData.gameSeasonId).startDate).toISOString().split('T')[0] : undefined}
                  max={formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId)?.endDate ? new Date(availableSeasons.find(s => s.id === formData.gameSeasonId).endDate).toISOString().split('T')[0] : undefined}
                  className="w-full border rounded p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Registration Close</label>
                <input
                  type="date"
                  value={formData.registrationClose}
                  onChange={(e) => setFormData(prev => ({ ...prev, registrationClose: e.target.value }))}
                  min={formData.registrationOpen || (formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId)?.startDate ? new Date(availableSeasons.find(s => s.id === formData.gameSeasonId).startDate).toISOString().split('T')[0] : undefined)}
                  max={formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId)?.endDate ? new Date(availableSeasons.find(s => s.id === formData.gameSeasonId).endDate).toISOString().split('T')[0] : undefined}
                  className="w-full border rounded p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">League Start Date</label>
                <input
                  type="date"
                  value={formData.leagueStartDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, leagueStartDate: e.target.value }))}
                  min={formData.registrationClose || (formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId)?.startDate ? new Date(availableSeasons.find(s => s.id === formData.gameSeasonId).startDate).toISOString().split('T')[0] : undefined)}
                  max={formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId)?.endDate ? new Date(availableSeasons.find(s => s.id === formData.gameSeasonId).endDate).toISOString().split('T')[0] : undefined}
                  className="w-full border rounded p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">League End Date</label>
                <input
                  type="date"
                  value={formData.leagueEndDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, leagueEndDate: e.target.value }))}
                  min={formData.leagueStartDate || formData.registrationClose || (formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId)?.startDate ? new Date(availableSeasons.find(s => s.id === formData.gameSeasonId).startDate).toISOString().split('T')[0] : undefined)}
                  max={formData.gameSeasonId && availableSeasons.find(s => s.id === formData.gameSeasonId)?.endDate ? new Date(availableSeasons.find(s => s.id === formData.gameSeasonId).endDate).toISOString().split('T')[0] : undefined}
                  className="w-full border rounded p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            {errors.dates && <p className="text-red-500 text-sm">{errors.dates}</p>}

            {/* Draft Status Note */}
            <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-800 mb-4">
              <strong>📋 Draft Status:</strong> Your league will be created as a <strong>draft</strong>.
              This means it's saved but not yet active. If you've requested venue approvals, you can view the approval status from the leagues list.
              You can activate the league once all venue owners approve your request.
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100">Cancel</button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Draft League'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// League Wizard Modal (embeds the full 9-step wizard)
// ----------------------------------------------------------------------
const LeagueWizardModal = ({ league, onSave, onComplete, onClose, onOpenAddPlayers, initialStep = 1 }) => {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">League Wizard</h3>
          {league && league.status === 'draft' && (
            <button
              onClick={() => typeof onOpenAddPlayers === 'function' && onOpenAddPlayers()}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              + Add Players
            </button>
          )}
        </div> */}
        <LeagueCreationWizard
          initialData={league}
          onSaveDraft={onSave}
          onComplete={onComplete}
          onClose={onClose}
          onOpenAddPlayers={onOpenAddPlayers}
          initialStep={initialStep}
        />
      </div>
    </div>
  );
};

const EnrollmentPreviewModal = ({ isOpen, analysis, selectedCount, onClose, onConfirm, confirming }) => {
  if (!isOpen) return null;

  const playerLabels = analysis?.selectedPlayers?.map(player => player.name || player.nickname || player.email).filter(Boolean) || [];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Enrollment Analysis</h3>
            <p className="text-sm text-gray-500 mt-1">Review the impact before applying the late enrollment.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <div className={`rounded-xl border p-4 ${analysis?.canProceed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`font-semibold ${analysis?.canProceed ? 'text-emerald-700' : 'text-amber-700'}`}>
              {analysis?.canProceed ? 'Enrollment allowed' : 'Enrollment blocked'}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              {analysis?.canProceed
                ? 'This preview keeps existing bookings intact and only applies the new player assignments.'
                : analysis?.blockedReason || 'The selected enrollment cannot be applied from this preview flow.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-bold">Current State</p>
              <p className="mt-2 text-sm text-gray-700">{analysis?.currentPlayerCount ?? 0} players</p>
              <p className="text-sm text-gray-700">{analysis?.completedFixturesCount ?? 0} completed matches</p>
              <p className="text-sm text-gray-700">{analysis?.scheduledFixturesCount ?? 0} scheduled fixtures</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
              <p className="text-xs uppercase tracking-widest text-blue-500 font-bold">After Enrollment</p>
              <p className="mt-2 text-sm text-gray-700">{analysis?.projectedPlayerCount ?? 0} players</p>
              <p className="text-sm text-gray-700">{analysis?.bookingsPreserved ?? 0} bookings preserved</p>
              <p className="text-sm text-gray-700">{selectedCount} player(s) to add</p>
            </div>
          </div>

          {analysis?.division && (
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-bold">Target Division</p>
              <p className="text-sm font-semibold text-gray-800 mt-1">{analysis.division.name}</p>
            </div>
          )}

          {playerLabels.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-2">Players</p>
              <div className="flex flex-wrap gap-2">
                {playerLabels.map(label => (
                  <span key={label} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-700">
              Bookings remain unchanged in this flow. If completed fixtures already exist, this enrollment method is disabled.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition"
              disabled={confirming}
            >
              Close
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming || analysis?.canProceed === false}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {confirming ? 'Applying...' : 'Confirm Enrollment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Add Players Modal (for Draft Leagues)
// ----------------------------------------------------------------------
const AddPlayersModal = ({ leagueId, league, onClose, onPlayersAdded }) => {
  const { getLeagueDivisions, getAllPlayers, getLeaguePlayers, addPlayerToLeague, analyzeLateEnrollment, updateWizardLeague, invitePlayerByEmail } = useLeague();
  const [clubPlayers, setClubPlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewConfirming, setPreviewConfirming] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [currentPlayerCount, setCurrentPlayerCount] = useState(0);
  const [playerSettings, setPlayerSettings] = useState({
    minPlayers: 2,
    maxPlayers: 16,
    lateJoin: false,
    rollingJoin: false
  });
  const [minInput, setMinInput] = useState("2");
  const [maxInput, setMaxInput] = useState("16");
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    // Fetch divisions for this league
    const fetchDivisions = async () => {
      try {
        const result = await getLeagueDivisions(leagueId);
        if (result.success) {
          const divs = result.data || [];
          setDivisions(divs);
        }
      } catch (err) {
        console.warn('Failed to fetch divisions:', err?.message || err);
        // Not critical - continue without divisions
      }
    };

    if (leagueId) {
      fetchDivisions();
    }

    // Initialize player settings from league data
    if (league && league.structure) {
      const struct = typeof league.structure === 'string' ? JSON.parse(league.structure) : league.structure;
      const players = struct.players || {};
      const minVal = players.min || 2;
      const maxVal = players.max || 16;
      setPlayerSettings({
        minPlayers: minVal,
        maxPlayers: maxVal,
        lateJoin: players.lateJoin || false,
        rollingJoin: players.rollingJoin || false
      });
      setMinInput(minVal.toString());
      setMaxInput(maxVal.toString());
    }

    const fetchPlayers = async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch all players (request a large limit to avoid pagination)
        const allPlayersResult = await getAllPlayers({ limit: 1000 });
        if (!allPlayersResult.success) {
          throw new Error(allPlayersResult.error || 'Failed to fetch players');
        }
        let fetchedPlayers = allPlayersResult.data || [];

        // Fetch already-joined players for this league and filter them out
        try {
          const leaguePlayersResult = await getLeaguePlayers(leagueId);
          if (leaguePlayersResult.success) {
            const leaguePlayers = leaguePlayersResult.data || [];
            setCurrentPlayerCount(leaguePlayers.length); // Track current player count
            const joinedIds = leaguePlayers.map(x => x.playerId || (x.player && x.player.id) || x.id).filter(Boolean);
            fetchedPlayers = fetchedPlayers.filter(p => !joinedIds.includes(p.id));
          }
        } catch (e) {
          console.warn('Could not fetch league players to filter players:', e?.message || e);
        }
        setClubPlayers(fetchedPlayers);
      } catch (err) {
        console.error('Error fetching club players:', err);
        setError(err.message || 'Failed to fetch players');
      } finally {
        setLoading(false);
      }
    };

    if (leagueId) {
      fetchPlayers();
    }
  }, [leagueId, league]);

  const handleSelectPlayer = (playerId) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPlayers.length === clubPlayers.length) {
      setSelectedPlayers([]);
      return;
    }
    setSelectedPlayers(clubPlayers.map((p) => p.id));
  };

  const getSelectedDivisionId = () => (selectedDivision && divisions.length > 0 ? selectedDivision : null);
  const selectedDivisionInfo = divisions.find(div => div.id === selectedDivision) || null;
  const selectedDivisionPlayerCount = selectedDivisionInfo?.players?.length || 0;
  const selectedDivisionIsFull = !!selectedDivisionInfo?.maxPlayers && selectedDivisionPlayerCount >= selectedDivisionInfo.maxPlayers;
  const divisionsAreAvailable = divisions.length > 0;

  const savePlayerSettings = async () => {
    try {
      setSavingSettings(true);
      const payload = {
        structure: {
          players: {
            min: playerSettings.minPlayers,
            max: playerSettings.maxPlayers,
            lateJoin: playerSettings.lateJoin,
            rollingJoin: playerSettings.rollingJoin
          }
        }
      };
      const result = await updateWizardLeague(leagueId, payload);
      if (result.success) {
        // Update local league object
        if (league) {
          league.structure = typeof league.structure === 'string' ? JSON.stringify(payload.structure) : payload.structure;
        }
      } else {
        throw new Error(result.error || 'Failed to save player settings');
      }
    } catch (err) {
      console.error('Error saving player settings:', err);
      alert('Failed to save player settings: ' + (err.message || err));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddPlayers = async () => {
    if (selectedPlayers.length === 0) {
      alert('Please select at least one player');
      return;
    }

    if (divisionsAreAvailable && !selectedDivision) {
      alert('Please select a division before adding players.');
      return;
    }

    if (selectedDivisionIsFull) {
      alert(`Division "${selectedDivisionInfo?.name || 'selected division'}" is full. Please choose another division.`);
      return;
    }

    // Validate player count against league requirements
    try {
      const playersRes = await getLeaguePlayers(leagueId);
      const currentPlayerCount = playersRes.success ? (playersRes.data || []).length : 0;
      const totalAfterAdd = currentPlayerCount + selectedPlayers.length;

      if (totalAfterAdd < playerSettings.minPlayers) {
        alert(`Cannot add only ${selectedPlayers.length} player(s). You need at least ${playerSettings.minPlayers} total players. Current: ${currentPlayerCount}, adding: ${selectedPlayers.length}, total: ${totalAfterAdd}.`);
        return;
      }

      if (totalAfterAdd > playerSettings.maxPlayers) {
        alert(`Cannot add ${selectedPlayers.length} players. Maximum is ${playerSettings.maxPlayers}. Current: ${currentPlayerCount}, adding: ${selectedPlayers.length}, total: ${totalAfterAdd}.`);
        return;
      }
    } catch (validationErr) {
      console.warn('Could not validate player count:', validationErr);
      // Continue anyway - backend will catch it
    }

    try {
      setAdding(true);
      setError(null);

      let successCount = 0;
      // Assign the explicitly selected division when one is chosen.
      const sendDivisionId = selectedDivision && divisions.length > 0 ? selectedDivision : null;

      for (const playerId of selectedPlayers) {
        try {
          const payload = { playerId };
          if (sendDivisionId) payload.divisionId = sendDivisionId;

          const playerObj = clubPlayers.find(p => p.id === playerId);
          const result = await addPlayerToLeague(leagueId, payload);
          if (result.success) {
            successCount++;
            // Remove added player from the list so it doesn't show again
            setClubPlayers(prev => prev.filter(p => p.id !== playerId));

            const visibility = league?.basicInfo?.visibility || league?.visibility;
            if (visibility === 'private' && playerObj?.email) {
              try {
                const name = playerObj?.name || playerObj?.username || '';
                const inviteResult = await invitePlayerByEmail(leagueId, { email: playerObj.email, name: name });
                if (!inviteResult.success) {
                  console.error('Failed to send league invitation:', inviteResult.error);
                }
              } catch (inviteErr) {
                console.error('Failed to send league invitation:', inviteErr);
              }
            }
          }
        } catch (err) {
          console.error(`Failed to add player ${playerId}:`, err);
        }
      }

      if (successCount > 0) {
        setSelectedPlayers([]);
        alert(`${successCount} player(s) added successfully`);
        onPlayersAdded();
      } else {
        throw new Error('Failed to add any players to the league');
      }
    } catch (err) {
      console.error('Error adding players:', err);
      setError(err.message || 'Failed to add players');
    } finally {
      setAdding(false);
    }
  };

  const handleAnalyzePreview = async () => {
    if (selectedPlayers.length === 0) {
      alert('Please select at least one player');
      return;
    }

    if (divisionsAreAvailable && !selectedDivision) {
      alert('Please select a division before analyzing enrollment.');
      return;
    }

    if (selectedDivisionIsFull) {
      alert(`Division "${selectedDivisionInfo?.name || 'selected division'}" is full. Please choose another division.`);
      return;
    }

    try {
      setPreviewLoading(true);
      setError(null);

      const payload = {
        playerIds: selectedPlayers,
        divisionId: getSelectedDivisionId()
      };

      const result = await analyzeLateEnrollment(leagueId, payload);
      if (!result.success) {
        throw new Error(result.error || 'Failed to analyze enrollment');
      }

      setPreviewData(result.data);
      setPreviewOpen(true);
    } catch (err) {
      console.error('Error analyzing late enrollment:', err);
      setError(err.message || 'Failed to analyze enrollment');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmPreviewEnrollment = async () => {
    if (!previewData?.canProceed) return;

    if (divisionsAreAvailable && !selectedDivision) {
      alert('Please select a division before confirming enrollment.');
      return;
    }

    if (selectedDivisionIsFull) {
      alert(`Division "${selectedDivisionInfo?.name || 'selected division'}" is full. Please choose another division.`);
      return;
    }

    try {
      setPreviewConfirming(true);
      setError(null);

      let successCount = 0;
      const sendDivisionId = getSelectedDivisionId();

      for (const playerId of selectedPlayers) {
        const payload = { playerId, preserveBookings: true };
        if (sendDivisionId) payload.divisionId = sendDivisionId;

        const result = await addPlayerToLeague(leagueId, payload);
        if (result.success) {
          successCount++;
          setClubPlayers(prev => prev.filter(p => p.id !== playerId));
        } else {
          throw new Error(result.error || 'Failed to add player');
        }
      }

      if (successCount > 0) {
        setSelectedPlayers([]);
        setPreviewOpen(false);
        setPreviewData(null);
        alert(`${successCount} player(s) added successfully using Analyze & Preview`);
        onPlayersAdded();
      }
    } catch (err) {
      console.error('Error applying preview enrollment:', err);
      setError(err.message || 'Failed to apply preview enrollment');
    } finally {
      setPreviewConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto">
      <LoadingOverlay
        isOpen={adding || loading || previewLoading || previewConfirming}
        message={adding ? "Adding Players..." : previewConfirming ? "Confirming Preview Enrollment..." : previewLoading ? "Analyzing Enrollment..." : "Loading..."}
      />
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold">Add Players to {league?.basicInfo?.leagueName || 'League'}</h2>
            <p className="text-sm text-gray-600 mt-1">
              Current: <span className="font-semibold">{currentPlayerCount}</span> players |
              Min required: <span className="font-semibold">{playerSettings.minPlayers}</span> |
              Max allowed: <span className="font-semibold">{playerSettings.maxPlayers}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading club players...</p>
          </div>
        ) : clubPlayers.length === 0 ? (
          <p className="text-center text-gray-600 py-8">No players found in the club</p>
        ) : (
          <div className="space-y-4">
            {/* League Player Limits & Rules */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 shadow-sm">
              <h3 className="text-blue-800 font-semibold mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                League Player Limits & Rules
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Players</label>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={minInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMinInput(val);
                      setPlayerSettings(prev => ({ ...prev, minPlayers: parseInt(val) || 0 }));
                    }}
                    className="w-full border border-gray-300 rounded-md p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Players</label>
                  <input
                    type="number"
                    min="2"
                    max="100"
                    value={maxInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMaxInput(val);
                      setPlayerSettings(prev => ({ ...prev, maxPlayers: parseInt(val) || 0 }));
                    }}
                    className="w-full border border-gray-300 rounded-md p-2"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={playerSettings.lateJoin}
                    onChange={(e) => setPlayerSettings(prev => ({ ...prev, lateJoin: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Allow Late Join</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={playerSettings.rollingJoin}
                    onChange={(e) => setPlayerSettings(prev => ({ ...prev, rollingJoin: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Rolling Join</span>
                </label>
              </div>
              <button
                onClick={savePlayerSettings}
                disabled={savingSettings}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            {/* Division Selection - Show only if league has divisions */}
            {divisions.length > 0 && (
              <div className="bg-purple-50/50 border border-purple-100 rounded-lg p-4 shadow-sm">
                <h3 className="text-purple-800 font-semibold mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Division Assignment for New Players
                </h3>

                <p className="text-xs text-gray-500 mb-2">
                  Select a division first, then choose the player(s) to enroll into that division.
                </p>

                {divisions.every(div => div.maxPlayers && (div.players?.length || 0) >= div.maxPlayers) && (
                  <div className="mb-3 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold">
                    All divisions are currently full. Increase division capacity or add a new division before enrolling more players.
                  </div>
                )}

                <select
                  value={selectedDivision || ''}
                  onChange={(e) => setSelectedDivision(e.target.value || null)}
                  className="w-full border border-purple-200 rounded-md p-2.5 bg-white text-gray-900 font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="">-- Select a division --</option>
                  {divisions.map(div => {
                    const divisionPlayerCount = div.players?.length || 0;
                    const isFull = !!div.maxPlayers && divisionPlayerCount >= div.maxPlayers;
                    return (
                      <option key={div.id} value={div.id} disabled={isFull}>
                        {div.name} ({divisionPlayerCount}{div.maxPlayers ? `/${div.maxPlayers}` : ''} players){isFull ? ' - Full' : ''}
                      </option>
                    );
                  })}
                </select>

                {selectedDivisionInfo && (
                  <div className={`mt-3 text-xs font-semibold rounded-md border p-3 ${selectedDivisionIsFull ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    {selectedDivisionInfo.name}: {selectedDivisionPlayerCount}{selectedDivisionInfo.maxPlayers ? ` / ${selectedDivisionInfo.maxPlayers}` : ''} players
                  </div>
                )}
              </div>
            )}

            <div className="border rounded-lg p-4 max-h-96 overflow-y-auto bg-gray-50/30">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Select players to add</p>
                  <p className="text-xs text-gray-600 italic mt-1">Showing all verified organization players not yet in this league.</p>
                </div>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {selectedPlayers.length === clubPlayers.length ? 'Clear selection' : `Select all (${clubPlayers.length})`}
                </button>
              </div>
              <p className="text-xs text-gray-600 mb-3">{selectedPlayers.length} of {clubPlayers.length} eligible players selected</p>
              <div className="space-y-2">
                {clubPlayers.map(player => (
                  <label key={player.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 rounded-lg cursor-pointer transition-all">
                    <input
                      type="checkbox"
                      checked={selectedPlayers.includes(player.id)}
                      onChange={() => handleSelectPlayer(player.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{player.name || player.username}</p>
                      {player.email && <p className="text-xs text-gray-500">{player.email}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAnalyzePreview}
                disabled={previewLoading || selectedPlayers.length === 0 || (divisionsAreAvailable && !selectedDivision) || selectedDivisionIsFull}
                className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {previewLoading ? 'Analyzing...' : 'Analyze & Preview'}
              </button>
              <button
                onClick={handleAddPlayers}
                disabled={adding || selectedPlayers.length === 0 || (divisionsAreAvailable && !selectedDivision) || selectedDivisionIsFull}
                className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50 transition"
              >
                {adding ? 'Adding...' : 'Simple Enrollment'}
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Simple enrollment keeps the current behavior. Analyze & Preview checks the impact first and keeps bookings untouched.
            </p>
          </div>
        )}
      </div>
      <EnrollmentPreviewModal
        isOpen={previewOpen}
        analysis={previewData}
        selectedCount={selectedPlayers.length}
        onClose={() => setPreviewOpen(false)}
        onConfirm={handleConfirmPreviewEnrollment}
        confirming={previewConfirming}
      />
    </div>
  );
};

// ----------------------------------------------------------------------
// Full 9-Step Wizard (unchanged – keep your existing LeagueCreationWizard)
// ----------------------------------------------------------------------
const LeagueCreationWizard = ({ initialData, onSaveDraft, onComplete, onClose, onOpenAddPlayers, initialStep = 1 }) => {
  const { loading: contextLoading, getWizardClubs, getWizardGameSeasons, updateWizardLeague, getLeaguePlayers, getAllVenues, getAllPlayers, removePlayerFromLeague } = useLeague();
  // (Your existing LeagueCreationWizard code – no changes needed)
  const totalSteps = 10;

  // ---------- State (initialized from props) ----------
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Normalize `initialData` coming from backend (which may be flat or stringified)
  const normalizeInitialData = (data) => {
    const defaults = {
      basicInfo: {
        leagueName: '',
        clubId: '',
        clubName: '',
        venueIds: [],
        gameId: '',
        gameName: '',
        gameSeasonId: '',
        visibility: 'public',
        registrationOpen: '',
        registrationClose: '',
        leagueStartDate: '',
        leagueEndDate: '',
        seasonStart: '',
        seasonEnd: '',
        leagueType: 'fixed',
        joinAllowed: true,
        lateJoinAllowed: false,
      },
      structure: {
        format: 'roundRobin',
        groups: { count: 1, teamsPerGroup: 4, qualifiers: 2 },
        divisions: {
          enabled: false,
          count: 1,
          promotions: 1,
          relegations: 1,
          manualOverride: false,
          assignmentMethod: 'auto',
          maxPlayersPerDivision: [],
        },
        players: { max: 16, min: 2, rollingJoin: false, lateJoin: false },
        swiss: { rounds: 5, pairing: 'swiss', tieBreak: 'buchholz' },
        knockout: { seeding: 'random', protection: false, byeSelection: 'random' },
      },
      matchRules: {
        bestOf: '3',
        customFrames: null,
        scoreDetail: 'overall',
        handicap: { enabled: false, type: 'manual', dynamic: false, fixed: false },
        walkover: { rule: 'autoBestOf', customScore: null, enabled: true },
        noDrawRule: 'none' // 'none', 'respottedBlack', 'mostPoints'
      },
      pointsSystem: {
        win: 3,
        draw: 1,
        loss: 0,
        walkoverWin: 3,
        walkoverLoss: 0,
        bonuses: {
          whitewash: false,
          whitewashPoints: 1,
          breakOverX: false,
          breakValue: 50,
          breakPoints: 1,
          participation: false,
          participationValue: 1
        }
      },
      tieBreakPriority: ['points', 'headToHead', 'frameDifference', 'framesWon', 'highestBreak', 'wins', 'winPercentage', 'swissRanking', 'totalPointsScored', 'totalPointsConceded', 'random'],
      standingsDisplay: { columns: ['matchesPlayed', 'wins', 'losses', 'draws', 'framesWon', 'framesConceded', 'frameDifference', 'whitewashes', 'highestBreak', 'winPercent', 'streak', 'points'] },
      scheduling: { generation: 'auto', deadlineDays: 7, autoForfeit: false, allowReschedule: true },
      reporting: { method: 'bothConfirm', adminApproval: false, photoProof: false, dispute: { enabled: false, timeLimit: 48 } },
      advanced: { withdrawal: 'voidAll', seasonEnd: 'archive', carryRanking: false, resetStats: true, keepLifetime: true, adminEditFixtures: false, adminEditResults: false, adminOverrideStandings: false, registration: { max: null, waitlist: false, autoAccept: true, entryFee: null } },
    };

    if (!data) return defaults;

    const parsed = { ...defaults };

    // helper to safely parse JSON strings
    const tryParse = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch (e) { return null; }
    };

    // basicInfo may be stored stringified or as flat top-level fields
    const basicFromPayload = tryParse(data.basicInfo) || {
      leagueName: data.leagueName || data.name || '',
      clubId: data.clubId || '',
      clubName: data.clubName || '',
      venueIds: tryParse(data.venueIds) || (Array.isArray(data.venueIds) ? data.venueIds : (typeof data.venueIds === 'string' ? (() => { try { return JSON.parse(data.venueIds); } catch { return [data.venueIds]; } })() : [])),
      gameId: data.gameId || (data.basicInfo && data.basicInfo.gameId) || '',
      gameName: data.gameName || (data.basicInfo && data.basicInfo.gameName) || '',
      gameSeasonId: data.gameSeasonId || data.basicInfo?.gameSeasonId || '',
      visibility: data.visibility || 'public',
      registrationOpen: data.registrationOpen || '',
      registrationClose: data.registrationClose || '',
      leagueStartDate: data.leagueStartDate || data.startDate || '',
      leagueEndDate: data.leagueEndDate || data.endDate || '',
      seasonStart: data.leagueStartDate || data.seasonStart || '',
      seasonEnd: data.leagueEndDate || data.seasonEnd || '',
      leagueType: data.leagueType || data.basicInfo?.leagueType || 'fixed',
      joinAllowed: data.joinAllowed !== undefined ? data.joinAllowed : (data.basicInfo?.joinAllowed !== undefined ? data.basicInfo.joinAllowed : (data.structure?.players?.joinAllowed !== undefined ? data.structure.players.joinAllowed : true)),
      lateJoinAllowed: data.lateJoinAllowed !== undefined ? data.lateJoinAllowed : (data.basicInfo?.lateJoinAllowed !== undefined ? data.basicInfo.lateJoinAllowed : (data.structure?.players?.lateJoin !== undefined ? data.structure.players.lateJoin : false)),
    };

    // Ensure structure and basicInfo late join flags are in sync
    if (parsed.structure && parsed.structure.players) {
      parsed.structure.players.lateJoin = parsed.basicInfo.lateJoinAllowed;
    }

    parsed.basicInfo = { ...parsed.basicInfo, ...basicFromPayload };

    // structure
    const struct = tryParse(data.structure) || data.structure || {};
    parsed.structure = { ...parsed.structure, ...struct };
    // make sure knockout.manualOrder exists so the form doesn't break
    if (parsed.structure.knockout) {
      parsed.structure.knockout.manualOrder = parsed.structure.knockout.manualOrder || [];
      parsed.structure.knockout.byeSelection = parsed.structure.knockout.byeSelection || 'random';
    }

    // matchRules, pointsSystem, scheduling, reporting, advanced
    const mr = tryParse(data.matchRules);
    if (mr) {
      parsed.matchRules = { ...parsed.matchRules, ...mr };
      parsed.matchRules.noDrawRule = mr.noDrawRule || 'none';
    }
    const ps = tryParse(data.pointsSystem); if (ps) parsed.pointsSystem = { ...parsed.pointsSystem, ...ps };
    const tb = tryParse(data.tieBreakPriority); if (tb) parsed.tieBreakPriority = Array.isArray(tb) ? tb : parsed.tieBreakPriority;
    const sd = tryParse(data.standingsDisplay); if (sd && sd.columns) parsed.standingsDisplay = { ...parsed.standingsDisplay, ...sd };
    const sch = tryParse(data.scheduling); if (sch) parsed.scheduling = { ...parsed.scheduling, ...sch };
    const rep = tryParse(data.reporting); if (rep) parsed.reporting = { ...parsed.reporting, ...rep };
    const adv = tryParse(data.advanced); if (adv) parsed.advanced = { ...parsed.advanced, ...adv };

    // merge any top-level simple fields
    return parsed;
  };

  const [formData, setFormData] = useState(() => normalizeInitialData(initialData));
  const [initialVenueIds, setInitialVenueIds] = useState(() => {
    const normalized = normalizeInitialData(initialData);
    return normalized.basicInfo.venueIds || [];
  });

  useEffect(() => {
    const normalized = normalizeInitialData(initialData);
    setFormData(normalized);
    // Only update initialVenueIds if this is the first load (no initialData was set before)
    if (!initialData || Object.keys(initialData).length === 0) {
      setInitialVenueIds(normalized.basicInfo.venueIds || []);
    }
  }, [initialData]);

  // Fetch clubs/games/seasons so Step 1 can show existing values when editing a draft
  useEffect(() => {
    let mounted = true;
    const fetchClubs = async () => {
      try {
        const result = await getWizardClubs();
        if (!mounted) return;
        if (result.success) {
          const clubsData = result.data || [];
          setClubs(clubsData);
          // If the current form has a clubId, populate availableVenues and availableGames
          if (formData.basicInfo && formData.basicInfo.clubId) {
            const club = clubsData.find(c => c.id === formData.basicInfo.clubId);
            if (club) {
              const venuesArray = Array.isArray(club.venues) ? club.venues : (club.venues ? Object.values(club.venues) : []);
              let gamesArray = [];
              if (typeof club.games === 'string') {
                try { const parsed = JSON.parse(club.games); if (Array.isArray(parsed)) gamesArray = parsed.map(g => (typeof g === 'string' ? g : g.name || g.id)); } catch { gamesArray = club.games.split(',').map(s => s.trim()); }
              } else if (Array.isArray(club.games)) {
                gamesArray = club.games.map(g => (typeof g === 'string' ? g : g.name || g.id));
              } else if (club.games && typeof club.games === 'object') {
                gamesArray = Object.values(club.games).map(g => (typeof g === 'string' ? g : g.name || g.id));
              }

              const selectedGame = formData.basicInfo.gameName || formData.basicInfo.gameId;
              if (selectedGame && !gamesArray.includes(selectedGame)) {
                gamesArray = [...gamesArray, selectedGame];
              }

              setAvailableVenues(venuesArray || []);
              setAvailableGames(gamesArray || []);
            }
          }
          // If there's a game already selected, fetch its seasons
          if (formData.basicInfo && formData.basicInfo.gameName) {
            try {
              const result = await getWizardGameSeasons(formData.basicInfo.gameName);
              if (result.success) {
                setAvailableSeasons(result.data || []);
              }
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (err) {
        // ignore - wizard can proceed without clubs list
        console.error('Failed to fetch wizard clubs in wizard:', err);
      }
    };

    fetchClubs();
    return () => { mounted = false; };
  }, [initialData, formData.basicInfo && formData.basicInfo.clubId, formData.basicInfo && formData.basicInfo.gameName]);
  // Fetch current league players when editing an existing draft/league
  useEffect(() => {
    let mounted = true;
    const fetchLeaguePlayers = async () => {
      const leagueId = initialData && initialData.id;
      if (!leagueId) return;
      try {
        const result = await getLeaguePlayers(leagueId);
        if (!mounted) return;
        if (result.success) {
          setLeaguePlayers(result.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch league players for wizard:', err);
      }
    };
    if (initialData && initialData.id) {
      fetchLeaguePlayers();
    } else {
      setLeaguePlayers([]);
    }
    return () => { mounted = false; };
  }, [initialData]);

  // Sync formData when initialData changes (e.g. from AddPlayersModal updates)
  // This ensures that changes made in external modals (like Late Join toggle) 
  // are reflected in the wizard's state.
  useEffect(() => {
    if (initialData) {
      const freshData = normalizeInitialData(initialData);
      setFormData(prev => {
        // Sync player-related settings that might change externally
        const playersChanged =
          prev.structure.players.lateJoin !== freshData.structure.players.lateJoin ||
          prev.structure.players.rollingJoin !== freshData.structure.players.rollingJoin ||
          prev.structure.players.max !== freshData.structure.players.max ||
          prev.structure.players.min !== freshData.structure.players.min ||
          prev.basicInfo.lateJoinAllowed !== freshData.basicInfo.lateJoinAllowed;

        if (!playersChanged) return prev;

        return {
          ...prev,
          basicInfo: {
            ...prev.basicInfo,
            lateJoinAllowed: freshData.basicInfo.lateJoinAllowed
          },
          structure: {
            ...prev.structure,
            players: {
              ...prev.structure.players,
              ...freshData.structure.players
            }
          }
        };
      });
    }
  }, [initialData]);
  // For Step 1 dynamic fields used in the wizard
  const [clubs, setClubs] = useState([]);
  const [availableVenues, setAvailableVenues] = useState([]);
  const [availableGames, setAvailableGames] = useState([]);
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [newVenueInput, setNewVenueInput] = useState('');
  const [leaguePlayers, setLeaguePlayers] = useState([]);
  const [errors, setErrors] = useState({});
  const [customFramesInput, setCustomFramesInput] = useState("1");
  const [showModal, setShowModal] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [allVenuesWithApproval, setAllVenuesWithApproval] = useState([]);
  const [venuesLoading, setVenuesLoading] = useState(true);

  // Step 2: Add Players state
  const [clubPlayers, setClubPlayers] = useState([]);
  const [clubPlayersLoading, setClubPlayersLoading] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');

  // Sync customFramesInput when editing an existing league
  useEffect(() => {
    if (formData.matchRules?.customFrames) {
      setCustomFramesInput(String(formData.matchRules.customFrames));
    }
  }, [formData.matchRules?.customFrames]);

  // Fetch all venues with approval status for the venue dropdown in the wizard
  useEffect(() => {
    let mounted = true;
    const fetchVenues = async () => {
      setVenuesLoading(true);
      try {
        const result = await getAllVenues();
        if (!mounted) return;
        if (result.success && result.data) {
          const filtered = result.data.filter(v => v && v.id && v.name);
          setAllVenuesWithApproval(filtered);
        }
      } catch (err) {
        console.warn('Failed to fetch venues in wizard:', err?.message || err);
      } finally {
        if (mounted) setVenuesLoading(false);
      }
    };
    fetchVenues();
    return () => { mounted = false; };
  }, []);

  // Fetch club players when Step 2 becomes active
  useEffect(() => {
    if (currentStep !== 2) return;
    let mounted = true;
    const fetchClubPlayers = async () => {
      setClubPlayersLoading(true);
      try {
        const result = await getAllPlayers({ limit: 1000 });
        if (!mounted) return;
        if (result.success) {
          let players = result.data || [];
          // Filter out already-added league players
          const addedIds = leaguePlayers.map(lp => lp.playerId || lp.player?.id || lp.id).filter(Boolean);
          players = players.filter(p => !addedIds.includes(p.id));
          setClubPlayers(players);
        }
      } catch (err) {
        console.warn('Failed to fetch players for Step 2:', err?.message || err);
      } finally {
        if (mounted) setClubPlayersLoading(false);
      }
    };
    fetchClubPlayers();
    return () => { mounted = false; };
  }, [currentStep, leaguePlayers]);

  // Handlers for Step 1 (simplified - club/game are set at creation and cannot be changed)
  const handleClubChange = (clubId) => {
    const club = clubs.find(c => c.id === clubId);
    if (club) {
      const venuesArray = Array.isArray(club.venues)
        ? club.venues
        : club.venues && typeof club.venues === 'object'
          ? Object.values(club.venues)
          : [];

      let gamesArray = [];
      if (typeof club.games === 'string') {
        try {
          const parsed = JSON.parse(club.games);
          if (Array.isArray(parsed)) gamesArray = parsed.map(g => (typeof g === 'string' ? g : g.name || g.id));
        } catch (e) {
          gamesArray = club.games.split(',').map(g => g.trim()).filter(Boolean);
        }
      } else if (Array.isArray(club.games)) {
        gamesArray = club.games.map(g => (typeof g === 'string' ? g : g.name || g.id));
      } else if (club.games && typeof club.games === 'object') {
        gamesArray = Object.values(club.games).map(g => (typeof g === 'string' ? g : g.name || g.id));
      }

      setAvailableVenues(venuesArray || []);
      setAvailableGames(gamesArray || []);
      setFormData(prev => ({
        ...prev,
        basicInfo: {
          ...prev.basicInfo,
          clubId,
          clubName: club.name,
          venueIds: [],
          gameId: '',
          gameName: '',
          gameSeasonId: '',
        }
      }));
    }
  };

  const handleGameChange = (gameName) => {
    updateBasicInfo('gameName', gameName);
    // Only clear gameId if it was the name, otherwise let backend resolve it
    if (!formData.basicInfo.gameId || formData.basicInfo.gameId === formData.basicInfo.gameName) {
      updateBasicInfo('gameId', '');
    }

    // All three games support both Overall and Frame-by-Frame — no forced override
    // Trigger season fetch
    if (gameName) {
      getWizardGameSeasons(gameName)
        .then(result => {
          if (result.success) {
            setAvailableSeasons(result.data || []);
          }
        })
        .catch(console.error);
    } else {
      setAvailableSeasons([]);
    }
  };

  const addVenue = () => {
    if (newVenueInput.trim() && !formData.basicInfo.venueIds.includes(newVenueInput.trim())) {
      setFormData(prev => ({
        ...prev,
        basicInfo: {
          ...prev.basicInfo,
          venueIds: [...prev.basicInfo.venueIds, newVenueInput.trim()],
        },
      }));
      setNewVenueInput('');
    }
  };

  // helper to move a player up/down in the manual seeding order
  const moveManualOrder = (idx, direction) => {
    setFormData(prev => {
      const current = prev.structure.knockout?.manualOrder || [];
      const arr = [...current];
      const newIdx = idx + (direction === 'up' ? -1 : 1);
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return {
        ...prev,
        structure: {
          ...prev.structure,
          knockout: {
            ...prev.structure.knockout,
            manualOrder: arr,
          },
        },
      };
    });
  };

  // keep manual seeding list in sync with enrolled players
  useEffect(() => {
    if (formData.structure.knockout?.seeding === 'manual') {
      const ids = leaguePlayers.map(lp => lp.playerId || lp.player?.id);
      const existing = formData.structure.knockout.manualOrder || [];
      const filtered = existing.filter(id => ids.includes(id));
      const extra = ids.filter(id => !filtered.includes(id));
      if (extra.length > 0 || filtered.length !== existing.length) {
        updateStructure('knockout', 'manualOrder', [...filtered, ...extra]);
      }
    }
  }, [leaguePlayers]);

  // Roll random byes when selection mode is 'random' or players change
  useEffect(() => {
    const isKnockout = formData.structure.format === 'knockout';
    const isRandomBye = formData.structure.knockout?.byeSelection === 'random';

    if (isKnockout && isRandomBye && leaguePlayers.length > 0) {
      const byeCount = Math.pow(2, Math.ceil(Math.log2(leaguePlayers.length))) - leaguePlayers.length;
      if (byeCount > 0) {
        // Only roll if we don't have exactly 'byeCount' byes stored, 
        // OR if some of the stored byes are for players no longer in the league
        const currentByes = formData.structure.knockout.manualByes || [];
        const playerIds = leaguePlayers.map(lp => lp.playerId || lp.player?.id);
        const validByes = currentByes.filter(id => playerIds.includes(id));

        if (validByes.length !== byeCount || currentByes.length !== validByes.length) {
          const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
          const selected = shuffled.slice(0, byeCount);
          updateStructure('knockout', 'manualByes', selected);
        }
      } else if ((formData.structure.knockout.manualByes || []).length > 0) {
        // No byes needed (perfect power of 2), clear the list
        updateStructure('knockout', 'manualByes', []);
      }
    }
  }, [formData.structure.knockout?.byeSelection, leaguePlayers, formData.structure.format]);

  const removeVenue = (venue) => {
    setFormData(prev => ({
      ...prev,
      basicInfo: {
        ...prev.basicInfo,
        venueIds: prev.basicInfo.venueIds.filter(v => v !== venue),
      },
    }));
  };

  const updateBasicInfo = (field, value) => {
    setFormData(prev => ({
      ...prev,
      basicInfo: { ...prev.basicInfo, [field]: value },
    }));
  };

  const updateStructure = (section, field, value) => {
    setFormData(prev => {
      let newState = { ...prev };

      // If `section` is falsy ('' or null/undefined) treat `field` as a top-level property
      if (!section) {
        newState = {
          ...prev,
          structure: {
            ...prev.structure,
            [field]: value,
          },
        };
      } else {
        newState = {
          ...prev,
          structure: {
            ...prev.structure,
            [section]: { ...(prev.structure[section] || {}), [field]: value },
          },
        };
      }

      // Auto-switch away from knockout if late join is enabled
      if (field === 'lateJoin' && section === 'players' && value === true && newState.structure.format === 'knockout') {
        newState.structure.format = 'roundRobin'; // Default to round robin
      }

      // NEW: Auto-disable divisions if knockout is selected
      if (field === 'format' && value === 'knockout') {
        newState.structure.divisions.enabled = false;
      }

      // SYNC: Ensure late join flags are consistent across sections
      if (field === 'lateJoin' && section === 'players') {
        newState.basicInfo.lateJoinAllowed = !!value;
      }

      // when switching seeding method to manual, initialise manualOrder to current players
      if (section === 'knockout' && field === 'seeding' && value === 'manual') {
        const ids = leaguePlayers.map(lp => lp.playerId || lp.player?.id);
        newState.structure.knockout = {
          ...newState.structure.knockout,
          manualOrder: ids,
        };
      }

      // NEW: Clear assigned players when switching to manual assignment method
      if (section === 'divisions' && field === 'assignmentMethod' && value === 'manual') {
        const count = newState.structure.divisions.count || 1;
        newState.structure.divisions.assignedPlayers = Array.from({ length: count }, () => []);
      }

      // Synchronization for Groups + Knockout
      if (newState.structure.format === 'groupsKnockout') {
        // Auto-enable divisions
        newState.structure.divisions.enabled = true;

        // If updating group count, sync division count
        if (section === 'groups' && field === 'count') {
          const newCount = value;
          const currentMax = newState.structure.divisions.maxPlayersPerDivision || [];
          const currentAssigned = newState.structure.divisions.assignedPlayers || [];
          let newMax = [...currentMax];
          let newAssigned = [...currentAssigned];

          if (newCount > currentMax.length) {
            newMax = newMax.concat(new Array(newCount - currentMax.length).fill(0));
            newAssigned = newAssigned.concat(new Array(newCount - currentAssigned.length).fill([]));
          } else if (newCount < currentMax.length) {
            newMax = newMax.slice(0, newCount);
            newAssigned = newAssigned.slice(0, newCount);
          }

          newState.structure.divisions = {
            ...newState.structure.divisions,
            count: newCount,
            maxPlayersPerDivision: newMax,
            assignedPlayers: newAssigned,
          };
        } else if (field === 'format' && value === 'groupsKnockout') {
          // Initial sync when format is switched - initialize maxPlayersPerDivision array
          const groupCount = newState.structure.groups.count || 1;
          newState.structure.divisions.count = groupCount;
          // Initialize maxPlayersPerDivision array with zeros for each group
          newState.structure.divisions.maxPlayersPerDivision = new Array(groupCount).fill(0);
          newState.structure.divisions.assignedPlayers = Array.from({ length: groupCount }, () => []);
        }
      }

      return newState;
    });
  };

  const updateDivisionMaxPlayers = (index, value) => {
    const newMaxPlayers = [...(formData.structure.divisions.maxPlayersPerDivision || [])];
    newMaxPlayers[index] = value === '' ? '' : (parseInt(value) || 0);
    setFormData(prev => ({
      ...prev,
      structure: {
        ...prev.structure,
        divisions: {
          ...prev.structure.divisions,
          maxPlayersPerDivision: newMaxPlayers,
        },
      },
    }));
  };

  const isPlayerAssigned = (playerId) => {
    const assigned = formData.structure.divisions.assignedPlayers || [];
    return assigned.some(arr => arr.includes(playerId));
  };

  const addPlayerToDivision = (divisionIndex, playerId) => {
    setFormData(prev => {
      const divisions = prev.structure.divisions || {};
      const assigned = divisions.assignedPlayers ? [...divisions.assignedPlayers.map(a => [...a])] : Array.from({ length: divisions.count || 1 }, () => []);

      // Ensure maxPlayersPerDivision array exists (may be empty)
      const maxPer = Array.isArray(divisions.maxPlayersPerDivision) ? divisions.maxPlayersPerDivision : [];

      // Determine capacity for this division: prefer explicit value, fallback to equal distribution
      const explicit = typeof maxPer[divisionIndex] === 'number' && maxPer[divisionIndex] > 0 ? maxPer[divisionIndex] : null;
      const totalPlayersMax = prev.structure.players && prev.structure.players.max ? parseInt(prev.structure.players.max, 10) : 0;
      const divisionCount = divisions.count || 1;
      const fallbackCapacity = totalPlayersMax > 0 ? Math.max(1, Math.ceil(totalPlayersMax / divisionCount)) : Infinity;
      const capacity = explicit || fallbackCapacity;

      // Defensive init for this division's array
      if (!assigned[divisionIndex]) assigned[divisionIndex] = [];

      // Prevent adding if already assigned
      if (assigned[divisionIndex].includes(playerId)) return prev;

      // Enforce capacity
      if (capacity !== Infinity && assigned[divisionIndex].length >= capacity) {
        alert(`Division ${divisionIndex + 1} is full (max ${capacity} players).`);
        return prev;
      }

      // Add the player
      assigned[divisionIndex].push(playerId);

      return {
        ...prev,
        structure: {
          ...prev.structure,
          divisions: {
            ...prev.structure.divisions,
            assignedPlayers: assigned,
            maxPlayersPerDivision: divisions.maxPlayersPerDivision || [],
          },
        },
      };
    });
  };

  const removePlayerFromDivision = (divisionIndex, playerId) => {
    setFormData(prev => {
      const assigned = prev.structure.divisions.assignedPlayers ? [...prev.structure.divisions.assignedPlayers.map(a => [...a])] : [];
      if (assigned[divisionIndex]) assigned[divisionIndex] = assigned[divisionIndex].filter(id => id !== playerId);
      return {
        ...prev,
        structure: {
          ...prev.structure,
          divisions: {
            ...prev.structure.divisions,
            assignedPlayers: assigned,
          },
        },
      };
    });
  };

  const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const computeDivisionAssignments = useCallback((method, players, divisionCount) => {
    const count = Number(divisionCount) || 1;
    const assignments = Array.from({ length: count }, () => []);
    if (!Array.isArray(players) || players.length === 0) return assignments;

    let playerItems = players
      .map(lp => {
        const playerId = lp.playerId || lp.player?.id || lp.id;
        const skill = lp.player?.ranking || lp.ranking || 0;
        return playerId ? { id: playerId, skill } : null;
      })
      .filter(Boolean);

    if (method === 'skill') {
      playerItems = playerItems.sort((a, b) => (b.skill || 0) - (a.skill || 0));
    } else {
      playerItems = shuffleArray(playerItems);
    }

    playerItems.forEach((item, idx) => {
      let divisionIndex;
      if (method === 'skill') {
        const playersPerDiv = Math.ceil(playerItems.length / count);
        divisionIndex = Math.min(Math.floor(idx / playersPerDiv), count - 1);
      } else {
        divisionIndex = idx % count;
      }
      assignments[divisionIndex].push(item.id);
    });

    return assignments;
  }, []);

  useEffect(() => {
    if (!formData.structure.divisions.enabled) return;

    const method = formData.structure.divisions.assignmentMethod || 'auto';
    if (method === 'manual') return;

    const divisionCount = formData.structure.divisions.count || 1;
    const assignedPlayers = computeDivisionAssignments(method, leaguePlayers, divisionCount);

    setFormData(prev => ({
      ...prev,
      structure: {
        ...prev.structure,
        divisions: {
          ...prev.structure.divisions,
          assignedPlayers,
        },
      },
    }));
  }, [formData.structure.divisions.assignmentMethod, formData.structure.divisions.count, leaguePlayers, formData.structure.divisions.enabled, computeDivisionAssignments]);

  const updateMatchRules = (field, value) => {
    setFormData(prev => ({
      ...prev,
      matchRules: { ...prev.matchRules, [field]: value },
    }));
  };

  const updatePointsSystem = (field, value) => {
    setFormData(prev => ({
      ...prev,
      pointsSystem: { ...prev.pointsSystem, [field]: value },
    }));
  };

  const updateTieBreak = (newPriority) => {
    setFormData(prev => ({ ...prev, tieBreakPriority: newPriority }));
  };

  const moveTieBreakItem = (index, direction) => {
    const newPriority = [...formData.tieBreakPriority];
    if (direction === 'up' && index > 0) {
      [newPriority[index - 1], newPriority[index]] = [newPriority[index], newPriority[index - 1]];
    } else if (direction === 'down' && index < newPriority.length - 1) {
      [newPriority[index], newPriority[index + 1]] = [newPriority[index + 1], newPriority[index]];
    } else {
      return;
    }
    updateTieBreak(newPriority);
  };

  const updateStandingsDisplay = (column) => {
    setFormData(prev => {
      const current = prev.standingsDisplay.columns;
      const newColumns = current.includes(column)
        ? current.filter(c => c !== column)
        : [...current, column];
      return { ...prev, standingsDisplay: { columns: newColumns } };
    });
  };

  const updateScheduling = (field, value) => {
    setFormData(prev => ({
      ...prev,
      scheduling: { ...prev.scheduling, [field]: value },
    }));
  };

  const updateReporting = (field, value) => {
    setFormData(prev => {
      const nextReporting = { ...prev.reporting, [field]: value };
      return {
        ...prev,
        reporting: nextReporting,
      };
    });
  };

  const updateAdvancedField = (field, value) => {
    setFormData(prev => ({ ...prev, advanced: { ...prev.advanced, [field]: value } }));
  };

  const updateAdvancedRegistration = (field, value) => {
    setFormData(prev => ({
      ...prev,
      advanced: {
        ...prev.advanced,
        registration: { ...prev.advanced.registration, [field]: value },
      },
    }));
  };

  // Validation
  const validateStep = (step) => {
    const newErrors = {};

    // --- STRAIGHT KNOCKOUT MANUAL BYE VALIDATION ---
    if (step === 2 && formData.structure.format === 'knockout' && formData.structure.knockout.byeSelection === 'manual') {
      const totalPlayers = leaguePlayers.length;
      const byesNeeded = Math.pow(2, Math.ceil(Math.log2(totalPlayers))) - totalPlayers;
      const manualByes = formData.structure.knockout.manualByes || [];
      if (byesNeeded > 0 && manualByes.length !== byesNeeded) {
        newErrors.manualByes = `You must select exactly ${byesNeeded} player(s) for a bye. Currently selected: ${manualByes.length}.`;
      }
    }

    switch (step) {
      case 1:
        if (!formData.basicInfo.leagueName.trim()) newErrors.basicInfo = 'League name is required';
        if (!formData.basicInfo.clubId) newErrors.club = 'Please select a club';
        if (!formData.basicInfo.venueIds || formData.basicInfo.venueIds.length === 0) newErrors.venue = 'Please add at least one venue';
        if (!formData.basicInfo.gameId && !formData.basicInfo.gameName) newErrors.game = 'Please select a game';
        if (!formData.basicInfo.gameSeasonId) newErrors.season = 'Please select a season';

        // Get selected season details for date validation
        const selectedSeason = formData.basicInfo.gameSeasonId ? availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId) : null;

        const regOpen = formData.basicInfo.registrationOpen;
        const regClose = formData.basicInfo.registrationClose;
        const leagueStartDate = formData.basicInfo.leagueStartDate;
        const leagueEndDate = formData.basicInfo.leagueEndDate;

        // Validation sequence: Registration Dates → Season Boundaries → League Dates → Registration → League relationship

        // 1. Registration date order validation
        if (regOpen && regClose && new Date(regClose) <= new Date(regOpen)) {
          newErrors.dates = 'Registration close must be after registration open';
        }

        // 2. Registration dates against season boundaries
        if (selectedSeason && regOpen) {
          const seasonStart = new Date(selectedSeason.startDate);
          const registrationOpen = new Date(regOpen);
          if (registrationOpen < seasonStart) {
            newErrors.dates = `Registration open date cannot be before season start date (${formatDateString(selectedSeason.startDate)})`;
          }
        }

        if (selectedSeason && regClose) {
          const seasonEnd = new Date(selectedSeason.endDate);
          const registrationClose = new Date(regClose);
          if (registrationClose > seasonEnd) {
            newErrors.dates = `Registration close date cannot be after season end date (${formatDateString(selectedSeason.endDate)})`;
          }
        }

        // 3. League start date must be after registration close
        if (leagueStartDate && regClose && new Date(leagueStartDate) <= new Date(regClose)) {
          newErrors.dates = 'League start must be after registration close';
        }

        // 4. League dates against season boundaries
        if (selectedSeason && leagueStartDate) {
          const seasonStart = new Date(selectedSeason.startDate);
          const leagueStart = new Date(leagueStartDate);
          if (leagueStart < seasonStart) {
            newErrors.dates = `League start date cannot be before season start date (${formatDateString(selectedSeason.startDate)})`;
          }
        }

        if (selectedSeason && leagueEndDate) {
          const seasonEnd = new Date(selectedSeason.endDate);
          const leagueEnd = new Date(leagueEndDate);
          if (leagueEnd > seasonEnd) {
            newErrors.dates = `League end date cannot be after season end date (${formatDateString(selectedSeason.endDate)})`;
          }
        }

        // 5. League dates order
        if (leagueStartDate && leagueEndDate && new Date(leagueEndDate) <= new Date(leagueStartDate)) {
          newErrors.dates = 'League end must be after league start';
        }

        // 6. Overall season boundary check
        if (selectedSeason && leagueStartDate && leagueEndDate) {
          const seasonStart = new Date(selectedSeason.startDate);
          const seasonEnd = new Date(selectedSeason.endDate);
          const leagueStart = new Date(leagueStartDate);
          const leagueEnd = new Date(leagueEndDate);

          if (leagueStart < seasonStart || leagueEnd > seasonEnd) {
            newErrors.dates = `League dates must be within the season range (${getSeasonDateDisplay(selectedSeason.startDate, selectedSeason.endDate)})`;
          }
        }
        break;

      case 2:
        const { min, max } = formData.structure.players;
        if (min < 2) newErrors.players = 'Minimum players must be at least 2';
        else if (min > max && max !== 0) newErrors.players = 'Minimum players cannot exceed maximum';
        else if (leaguePlayers.length > 0 && leaguePlayers.length < min) {
          newErrors.players = `Minimum ${min} players required. Currently: ${leaguePlayers.length}`;
        }
        else if (max > 0 && leaguePlayers.length > max) {
          newErrors.players = `Maximum ${max} players allowed. Currently: ${leaguePlayers.length}`;
        }
        break;

      case 3:
        if (formData.structure.format === 'groupsKnockout') {
          const { teamsPerGroup, qualifiers } = formData.structure.groups;
          if (qualifiers > teamsPerGroup) newErrors.structure = 'Qualifiers cannot exceed teams per group';
        }
        if (formData.structure.format === 'swiss') {
          if (formData.structure.swiss.rounds < 3) newErrors.structure = 'Swiss format requires at least 3 rounds';
        }
        if (formData.structure.divisions.enabled) {
          const { promotions, relegations, count, maxPlayersPerDivision } = formData.structure.divisions;
          if (promotions + relegations > 2) newErrors.structure = 'Promotions + relegations exceed plausible division size';
          const totalMaxPlayers = maxPlayersPerDivision.reduce((sum, val) => sum + (val || 0), 0);
          if (totalMaxPlayers > formData.structure.players.max) {
            newErrors.structure = 'Sum of max players per division cannot exceed total max players';
          }
          if (maxPlayersPerDivision.length !== count) {
            newErrors.structure = 'Number of division max player entries must match division count';
          }
        }
        // Conflict detection
        if (formData.structure.divisions.enabled && formData.structure.format === 'knockout') {
          newErrors.conflict = 'Divisions and knockout format are incompatible';
        }
        if (formData.structure.players.lateJoin && formData.structure.format === 'knockout') {
          newErrors.conflict = 'Late join not allowed in knockout format';
        }
        if (formData.structure.players.rollingJoin && formData.scheduling.generation === 'weekly') {
          newErrors.conflict = 'Rolling join conflicts with fixed weekly schedule';
        }
        break;

      case 4:
        const bestOf = formData.matchRules.bestOf;
        if (bestOf !== 'custom') {
          const num = parseInt(bestOf, 10);
          if (num % 2 === 0) newErrors.matchRules = 'Best Of must be an odd number';
        } else {
          const custom = formData.matchRules.customFrames;
          if (custom && custom % 2 === 0) newErrors.matchRules = 'Custom frames must be odd';
        }
        break;

      case 7:
        if (formData.scheduling.deadlineDays < 1) newErrors.scheduling = 'Deadline must be at least 1 day';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Helper function to get data key for current step
  const getStepDataKey = (step) => {
    const keyMap = {
      1: 'basicInfo',
      2: 'leaguePlayers',
      3: 'structure',
      4: 'matchRules',
      5: 'pointsSystem',
      6: 'standingsDisplay',
      7: 'scheduling',
      8: 'reporting',
      9: 'advanced',
      10: 'summary'
    };
    return keyMap[step] || null;
  };

  // Auto-save current step data before moving to next
  const autoSaveCurrentStep = async () => {
    // Only auto-save if this is an existing draft/league (has an ID)
    if (!initialData?.id) return true;

    const dataKey = getStepDataKey(currentStep);
    if (!dataKey || dataKey === 'summary') return true; // Don't save summary page

    try {
      setIsSaving(true);
      setSaveError(null);

      const payload = {};
      if (dataKey === 'basicInfo') {
        payload.basicInfo = formData.basicInfo;
      } else if (dataKey === 'tieBreakPriority') {
        payload.tieBreakPriority = formData.tieBreakPriority;
      } else if (dataKey === 'leaguePlayers') {
        payload.leaguePlayers = leaguePlayers;
      } else {
        payload[dataKey] = formData[dataKey];
      }

      const result = await updateWizardLeague(initialData.id, payload);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save step');
      }

      return true;
    } catch (error) {
      console.error(`Failed to auto-save step ${currentStep}:`, error);
      setSaveError(`Failed to save: ${error.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Navigation
  const nextStep = async () => {
    if (validateStep(currentStep)) {
      // If manual byes error, block next step and show alert
      if (
        currentStep === 2 &&
        formData.structure.format === 'knockout' &&
        formData.structure.knockout.byeSelection === 'manual' &&
        errors.manualByes
      ) {
        alert(errors.manualByes);
        return;
      }
      // Auto-save current step before moving to next
      const saved = await autoSaveCurrentStep();
      if (!saved) {
        // If save failed, show error and don't move forward
        return;
      }
      setCompletedSteps(prev => new Set(prev).add(currentStep));
      if (currentStep < totalSteps) setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const goToStep = (step) => {
    if (completedSteps.has(step) || step < currentStep) setCurrentStep(step);
  };

  const [draftToast, setDraftToast] = useState(null);

  const showDraftToast = (msg) => {
    setDraftToast(msg);
    setTimeout(() => setDraftToast(null), 3000);
  };

  const saveDraft = async () => {
    if (initialData?.id) {
      const saved = await autoSaveCurrentStep();
      if (saved) showDraftToast('✓ Draft saved');
    } else if (onSaveDraft) {
      onSaveDraft(formData);
      showDraftToast('✓ Draft saved');
    }
  };

  // Auto-save when user closes the wizard (if league already exists as a draft)
  const handleClose = async () => {
    if (initialData?.id) {
      try {
        await updateWizardLeague(initialData.id, {
          ...formData,
          leaguePlayers,
        });
      } catch (err) {
        console.info('[Wizard] Auto-save on close failed silently:', err?.message);
      }
    }
    if (onClose) onClose();
  };

  // Warn browser-level navigation (tab close / refresh) if wizard is open with data
  useEffect(() => {
    const hasData = initialData?.id || formData.basicInfo.leagueName;
    if (!hasData) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [initialData?.id, formData.basicInfo.leagueName]);

  const createLeague = () => {
    if (validateStep(currentStep) && Object.keys(errors).length === 0) setShowModal(true);
  };

  const confirmCreate = async () => {
    setIsSaving(true);
    try {
      if (onComplete) {
        const finalPayload = {
          ...formData,
          leaguePlayers: leaguePlayers
        };
        await onComplete(finalPayload);
      }
    } finally {
      setIsSaving(false);
      setShowModal(false);
    }
  };

  // Fixture Preview (unchanged)
  const calculateFixtureStats = () => {
    const format = formData.structure.format;
    const players = formData.structure.players.max || 0;
    if (players < 2) return { matches: 0, weeks: 0 };

    let matches = 0, weeks = 0;
    switch (format) {
      case 'roundRobin':
        matches = (players * (players - 1)) / 2;
        weeks = Math.ceil(matches / Math.floor(players / 2));
        break;
      case 'homeAway':
        matches = players * (players - 1);
        weeks = matches / Math.floor(players / 2);
        break;
      case 'knockout':
        matches = players - 1;
        weeks = Math.ceil(Math.log2(players));
        break;
      case 'swiss':
        matches = (players * formData.structure.swiss.rounds) / 2;
        weeks = formData.structure.swiss.rounds;
        break;
      case 'groupsKnockout':
        const groups = formData.structure.groups.count;
        const teamsPerGroup = formData.structure.groups.teamsPerGroup;
        const groupMatches = groups * (teamsPerGroup * (teamsPerGroup - 1)) / 2;
        const qualifiers = formData.structure.groups.qualifiers * groups;
        const knockoutMatches = qualifiers - 1;
        matches = groupMatches + knockoutMatches;
        weeks = Math.ceil(groupMatches / (groups * Math.floor(teamsPerGroup / 2))) + Math.ceil(Math.log2(qualifiers));
        break;
      default:
        matches = 0;
    }
    return { matches, weeks };
  };

  // Standings Preview (unchanged)
  const StandingsPreview = () => {
    const sampleData = [
      {
        rank: 1, name: 'Player A',
        mp: 5, w: 4, l: 1, d: 0, fw: 12, fc: 6, fd: 6, ww: 1, hb: 87, winp: 80, streak: 'W3', pts: 12,
        // Snooker-specific
        breaks50Plus: 3, breaks100Plus: 1,
        // Pool-specific
        ballsPotted: 42, ballsConceded: 28, sevenBallWins: 2,
        // Pooker-specific
        blackFinishes: 4, whitewashWins: 1,
      },
      {
        rank: 2, name: 'Player B',
        mp: 5, w: 3, l: 2, d: 0, fw: 10, fc: 8, fd: 2, ww: 0, hb: 65, winp: 60, streak: 'L1', pts: 9,
        // Snooker-specific
        breaks50Plus: 1, breaks100Plus: 0,
        // Pool-specific
        ballsPotted: 35, ballsConceded: 33, sevenBallWins: 1,
        // Pooker-specific
        blackFinishes: 2, whitewashWins: 0,
      },
    ];
    const columns = formData.standingsDisplay.columns;

    // Build ordered list of all possible columns with their header labels and data keys
    const allCols = [
      { key: 'matchesPlayed', label: 'MP', dataKey: 'mp' },
      { key: 'wins', label: 'W', dataKey: 'w' },
      { key: 'losses', label: 'L', dataKey: 'l' },
      { key: 'draws', label: 'D', dataKey: 'd' },
      { key: 'framesWon', label: 'FW', dataKey: 'fw' },
      { key: 'framesConceded', label: 'FC', dataKey: 'fc' },
      { key: 'frameDifference', label: 'FD', dataKey: 'fd' },
      { key: 'whitewashes', label: 'WW', dataKey: 'ww' },
      { key: 'highestBreak', label: 'HB', dataKey: 'hb' },
      { key: 'winPercent', label: 'Win%', dataKey: 'winp' },
      { key: 'streak', label: 'Streak', dataKey: 'streak' },
      { key: 'points', label: 'Pts', dataKey: 'pts' },
      // Game-specific
      { key: 'breaks50Plus', label: '50+', dataKey: 'breaks50Plus' },
      { key: 'breaks100Plus', label: '100+', dataKey: 'breaks100Plus' },
      { key: 'ballsPotted', label: 'BP', dataKey: 'ballsPotted' },
      { key: 'ballsConceded', label: 'BC', dataKey: 'ballsConceded' },
      { key: 'sevenBallWins', label: '7BW', dataKey: 'sevenBallWins' },
      { key: 'blackFinishes', label: 'BF', dataKey: 'blackFinishes' },
      { key: 'whitewashWins', label: 'WWin', dataKey: 'whitewashWins' },
    ];

    const activeCols = allCols.filter(c => columns.includes(c.key));

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 mt-2">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-gray-500 uppercase tracking-wider font-semibold">Rank</th>
              <th className="px-3 py-2 text-left text-gray-500 uppercase tracking-wider font-semibold">Player</th>
              {activeCols.map(col => (
                <th key={col.key} className="px-3 py-2 text-center text-gray-500 uppercase tracking-wider font-semibold">{col.label}</th>
              ))}
              {activeCols.length === 0 && (
                <th className="px-3 py-2 text-center text-gray-400 italic">No columns selected</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sampleData.map((row, i) => (
              <tr key={i} className={i === 0 ? 'bg-yellow-50/40' : ''}>
                <td className="px-3 py-2 font-bold text-center">{row.rank}</td>
                <td className="px-3 py-2 font-semibold text-gray-800">{row.name}</td>
                {activeCols.map(col => (
                  <td key={col.key} className="px-3 py-2 text-center text-gray-600">{row[col.dataKey] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {activeCols.length === 0 && (
          <div className="text-center py-4 text-gray-400 text-xs">Enable at least one column above to see the preview.</div>
        )}
      </div>
    );
  };

  const isStepDisabled = (step) => {
    if (step === 5 && formData.structure.format === 'knockout') return true;
    if (step === 6 && formData.structure.format === 'knockout') return true;
    return false;
  };

  // Render step content (Step 1 updated, Step 2 updated with division method)
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Basic Information</h2>
            </div>

            {/* WARNING: Check for newly added club venues (exclude existing ones from initial data) */}
            {formData.basicInfo.venueIds && formData.basicInfo.venueIds.some(v =>
              String(v).startsWith('venue_') && !initialVenueIds.includes(v)
            ) && (
                <div className="bg-red-50 border border-red-200 p-3 rounded text-sm text-red-800">
                  <strong>⚠️ Error:</strong> You have selected club venues which cannot send approval requests.
                  Please remove the red-marked venues below and select only VenueOwner venues from other organizations.
                </div>
              )}

            <div>
              <label className="block text-sm font-medium mb-1">League Name <span className="text-red-500">*</span></label>
              <span className="block text-xs text-gray-500 mb-1">Enter a unique name for your league.</span>
              <input type="text" value={formData.basicInfo.leagueName} onChange={(e) => updateBasicInfo('leagueName', e.target.value)} className="w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Club <span className="text-red-500">*</span></label>
              <span className="block text-xs text-gray-500 mb-1">Select the club that will host this league.</span>
              <select
                value={formData.basicInfo.clubId || ''}
                onChange={(e) => handleClubChange(e.target.value)}
                className="w-full border rounded p-2"
              >
                <option value="">Select a club</option>
                {clubs.map(club => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>
            </div>
            {formData.basicInfo.clubId && (
              <div>
                <label className="block text-sm font-medium mb-1">Venues <span className="text-red-500">*</span></label>
                <p className="text-xs text-gray-600 mb-2">Select venues for this league. You can add venues you own (auto-approved) or request to use venues from other organizations (requires approval from venue owner).</p>
                <div className="bg-blue-50 border border-blue-200 p-2 rounded text-xs text-blue-700 mb-3">
                  <strong>ℹ️ Note:</strong> Select venues for this league. Venues you own are auto-approved.
                  Venues from other organizations require approval from the venue owner.
                  If a venue doesn't appear, contact the venue owner to create a Venue Owner profile.
                </div>
                <div className="flex gap-2 mb-2">
                  <select
                    value={selectedVenueId || ''}
                    onChange={(e) => {
                      const venueCompositeId = e.target.value;
                      if (!venueCompositeId) {
                        setSelectedVenueId('');
                        return;
                      }

                      const selectedV = allVenuesWithApproval.find(v => v.id === venueCompositeId);

                      if (selectedV && selectedV.id) {
                        setSelectedVenueId(venueCompositeId);
                        // Use the ID directly - it's already in correct format: venueOwnerId:venueId
                        const compositeId = selectedV.id;
                        if (!formData.basicInfo.venueIds.includes(compositeId)) {
                          setFormData(prev => ({
                            ...prev,
                            basicInfo: {
                              ...prev.basicInfo,
                              venueIds: [...prev.basicInfo.venueIds, compositeId],
                            },
                          }));
                        }
                        setSelectedVenueId(''); // Reset for next selection
                      }
                    }}
                    className="w-full border rounded p-2"
                  >
                    <option value="">-- Select a venue to add --</option>
                    {venuesLoading ? (
                      <option value="" disabled>Loading venues...</option>
                    ) : allVenuesWithApproval && allVenuesWithApproval.length > 0 ? (
                      allVenuesWithApproval
                        .filter(v => {
                          // FILTER 1: Only show venues that can create LeagueVenueRequests (VenueOwner venues)
                          if (!v.canCreateLeagueRequest) return false; // Skip club venues

                          // FILTER 2: Show all VenueOwner venues (owned and external)
                          // Owned venues are auto-approved, external require approval
                          return true;

                          // FILTER 3: Skip venues already added
                          if (formData.basicInfo.venueIds.includes(v.id)) return false;

                          return true;
                        })
                        .map(v => (
                          <option key={v.id} value={v.id} disabled={v.disabled}>
                            {v.name} ({v.ownerOrganizationName}) - {v.isOwner ? 'Auto-approved' : 'Requires Approval'}
                          </option>
                        ))
                    ) : (
                      <option value="" disabled>No venues available</option>
                    )}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 mb-2 mt-3">
                  {formData.basicInfo.venueIds && formData.basicInfo.venueIds.map(vId => {
                    // Try to find by composite ID (venueId:venueName) or by venueId
                    let displayName = null;
                    let isClubVenue = false;
                    let venueIdOnly = vId;
                    if (String(vId).includes(':')) {
                      // Composite format: venueId:venueName
                      const parts = vId.split(':');
                      venueIdOnly = parts[0];
                      displayName = parts[1];
                    }
                    // Try to find the venue in allVenuesWithApproval
                    const v = allVenuesWithApproval.find(av => av.id === venueIdOnly || av.id === vId);
                    if (v && v.name) {
                      displayName = v.name;
                    }
                    if (!displayName) {
                      if (String(vId).startsWith('venue_')) {
                        displayName = 'Club Venue';
                        isClubVenue = true;
                      } else {
                        displayName = vId;
                      }
                    }
                    isClubVenue = isClubVenue || String(vId).startsWith('venue_');
                    return (
                      <div key={vId} className={isClubVenue ? 'opacity-60' : ''}>
                        <span className={`${isClubVenue ? 'bg-red-100 border-red-300 text-red-700' : 'bg-blue-100 border-blue-200 text-blue-800'} border px-3 py-1 rounded flex items-center gap-2`}>
                          {displayName}
                          {isClubVenue && <span className="text-xs font-bold">[Club Venue - Will Fail]</span>}
                          <button type="button" onClick={() => removeVenue(vId)} className={`${isClubVenue ? 'text-red-600 hover:text-red-800' : 'text-blue-500 hover:text-red-600'} font-bold focus:outline-none`}>×</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {formData.basicInfo.clubId && (
              <div>
                <label className="block text-sm font-medium mb-1">Game <span className="text-red-500">*</span></label>
                <span className="block text-xs text-gray-500 mb-1">Select the sport/game for this league (Pool, Snooker, Darts, etc.).</span>
                <select value={formData.basicInfo.gameName || ''} onChange={(e) => handleGameChange(e.target.value)} className="w-full border rounded p-2">
                  <option value="">Select a game</option>
                  {availableGames.map(game => <option key={game} value={game}>{game}</option>)}
                </select>
              </div>
            )}
            {formData.basicInfo.gameId && (
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Season <span className="text-red-500">*</span></label>
                  <span className="block text-xs text-gray-500 mb-1">Select the season this league belongs to.</span>
                  <select value={formData.basicInfo.gameSeasonId} onChange={(e) => updateBasicInfo('gameSeasonId', e.target.value)} className="w-full border rounded p-2">
                    <option value="">Select a season</option>
                    {availableSeasons.map(season => (
                      <option key={season.id || season} value={season.id || season}>{season.name || season}</option>
                    ))}
                  </select>
                </div>

                {/* Display selected season dates */}
                {formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId) && (
                  <div className="bg-blue-50 border border-blue-300 rounded p-3">
                    {(() => {
                      const selectedSeason = availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId);
                      const seasonDisplay = getSeasonDateDisplay(selectedSeason?.startDate, selectedSeason?.endDate);
                      return (
                        <div className="text-sm text-blue-900">
                          <strong>📅 Season Duration:</strong> {seasonDisplay}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">Visibility</label>
              <div className="flex flex-col gap-2">
                <div className="flex gap-4">
                  {['public', 'private', 'invite'].map(v => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="visibility"
                        value={v}
                        checked={formData.basicInfo.visibility === v}
                        onChange={(e) => updateBasicInfo('visibility', e.target.value)}
                      />
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </label>
                  ))}
                </div>
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded border">
                  {formData.basicInfo.visibility === 'public' && "Public leagues are visible to everyone in the system."}
                  {formData.basicInfo.visibility === 'invite' && "Invite-only leagues are hidden from general search."}
                  {formData.basicInfo.visibility === 'private' && "Private leagues are visible only to joined members."}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="block text-sm font-medium mb-1">Registration Open</label><input type="date" value={formData.basicInfo.registrationOpen} onChange={(e) => updateBasicInfo('registrationOpen', e.target.value)} min={formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.startDate ? new Date(availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId).startDate).toISOString().split('T')[0] : undefined} max={formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.endDate ? new Date(availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId).endDate).toISOString().split('T')[0] : undefined} className="w-full border rounded p-2" /></div>
              <div><label className="block text-sm font-medium mb-1">Registration Close</label><input type="date" value={formData.basicInfo.registrationClose} onChange={(e) => updateBasicInfo('registrationClose', e.target.value)} min={formData.basicInfo.registrationOpen || (formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.startDate ? new Date(availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId).startDate).toISOString().split('T')[0] : undefined)} max={formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.endDate ? new Date(availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId).endDate).toISOString().split('T')[0] : undefined} className="w-full border rounded p-2" /></div>
              <div><label className="block text-sm font-medium mb-1">League Start</label><input type="date" value={formData.basicInfo.leagueStartDate} onChange={(e) => updateBasicInfo('leagueStartDate', e.target.value)} min={formData.basicInfo.registrationClose || (formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.startDate ? new Date(availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId).startDate).toISOString().split('T')[0] : undefined)} max={formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.endDate ? new Date(availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId).endDate).toISOString().split('T')[0] : undefined} className="w-full border rounded p-2 disabled:opacity-50 disabled:cursor-not-allowed" /></div>
              <div><label className="block text-sm font-medium mb-1">League End</label><input type="date" value={formData.basicInfo.leagueEndDate} onChange={(e) => updateBasicInfo('leagueEndDate', e.target.value)} min={formData.basicInfo.leagueStartDate || formData.basicInfo.registrationClose || (formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.startDate ? new Date(availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId).startDate).toISOString().split('T')[0] : undefined)} max={formData.basicInfo.gameSeasonId && availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.endDate ? new Date(availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId).endDate).toISOString().split('T')[0] : undefined} className="w-full border rounded p-2 disabled:opacity-50 disabled:cursor-not-allowed" /></div>
            </div>

            {/* Display Venue Approval Status if initialData has venue approval information */}
            {initialData && (initialData.venueApprovalBreakdown || initialData.isVenueApprovalPending) && (
              <div>
                <VenueApprovalStatus league={initialData} />
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Add Players</h2>
              <div className="text-sm text-gray-500">
                Added: <span className="font-semibold text-blue-700">{leaguePlayers.length}</span> players
              </div>
            </div>

            {errors.players && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                <span className="block sm:inline">{errors.players}</span>
              </div>
            )}

            {/* Players Configuration */}
            <div className="border p-4 rounded bg-gray-50 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Max Players</label>
                  <input type="number" value={formData.structure.players.max} onChange={(e) => updateStructure('players', 'max', parseInt(e.target.value) || 0)} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Min Players</label>
                  <input type="number" value={formData.structure.players.min} onChange={(e) => updateStructure('players', 'min', parseInt(e.target.value) || 0)} className="w-full border rounded p-2" />
                </div>
              </div>
            </div>

            {/* Joining Settings */}
            <div className="bg-gray-50 border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-2 bg-white rounded border">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Late Join</p>
                  <p className="text-xs text-gray-500">Allow players to join after league starts</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={formData.structure.players.lateJoin}
                    onChange={(e) => {
                      const val = e.target.checked;
                      updateStructure('players', 'lateJoin', val);
                      updateBasicInfo('lateJoinAllowed', val);
                      if (val) updateBasicInfo('joinAllowed', true);
                    }}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Rolling Join</p>
                  <p className="text-xs text-gray-500">Allow joining even after fixtures are generated</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={formData.structure.players.rollingJoin}
                    onChange={(e) => updateStructure('players', 'rollingJoin', e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            <div className="space-y-4">
              {/* Search Box */}
              <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex-1">Search &amp; Select Players</h3>
                  {selectedPlayerIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const toAdd = clubPlayers.filter(p => selectedPlayerIds.includes(p.id));
                        const newEntries = toAdd.map(p => ({
                          id: `temp-${p.id}`,
                          playerId: p.id,
                          player: { id: p.id, name: p.name || p.username, nickname: p.nickname, email: p.email }
                        }));
                        setLeaguePlayers(prev => [...prev, ...newEntries]);
                        setClubPlayers(prev => prev.filter(p => !selectedPlayerIds.includes(p.id)));
                        setSelectedPlayerIds([]);
                      }}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 font-semibold"
                    >
                      + Add {selectedPlayerIds.length} Selected
                    </button>
                  )}
                </div>
                <div className="p-3">
                  <input
                    type="text"
                    placeholder="Search players by name or email..."
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    className="w-full border rounded p-2 text-sm mb-3"
                  />
                  <div className="max-h-64 overflow-y-auto border rounded bg-white">
                    {clubPlayersLoading ? (
                      <div className="p-6 text-center text-gray-500 text-sm">
                        <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mb-2"></div>
                        <p>Loading players...</p>
                      </div>
                    ) : (() => {
                      const filtered = clubPlayers.filter(p => {
                        if (!playerSearch) return true;
                        const term = playerSearch.toLowerCase();
                        return (p.name || '').toLowerCase().includes(term) ||
                          (p.nickname || '').toLowerCase().includes(term) ||
                          (p.email || '').toLowerCase().includes(term);
                      });
                      if (filtered.length === 0) return (
                        <p className="p-4 text-center text-gray-500 text-sm italic">
                          {playerSearch ? 'No players match your search.' : 'All available players have been added.'}
                        </p>
                      );
                      return (
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="p-2 text-left w-10">
                                <input
                                  type="checkbox"
                                  checked={filtered.length > 0 && filtered.every(p => selectedPlayerIds.includes(p.id))}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPlayerIds(prev => [...new Set([...prev, ...filtered.map(p => p.id)])]);
                                    } else {
                                      setSelectedPlayerIds(prev => prev.filter(id => !filtered.map(p => p.id).includes(id)));
                                    }
                                  }}
                                />
                              </th>
                              <th className="p-2 text-left font-medium text-gray-600">Name</th>
                              <th className="p-2 text-left font-medium text-gray-600">Email</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {filtered.map(p => (
                              <tr key={p.id} className={`hover:bg-blue-50 cursor-pointer ${selectedPlayerIds.includes(p.id) ? 'bg-blue-50' : ''}`} onClick={() => {
                                setSelectedPlayerIds(prev =>
                                  prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                );
                              }}>
                                <td className="p-2">
                                  <input type="checkbox" checked={selectedPlayerIds.includes(p.id)} onChange={() => { }} />
                                </td>
                                <td className="p-2 font-medium text-gray-800">{p.name || p.username || 'Unknown'}</td>
                                <td className="p-2 text-gray-500 text-xs">{p.email || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* League Roster */}
              {leaguePlayers.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-green-800 mb-2">
                    League Roster ({leaguePlayers.length} players)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {leaguePlayers.map(lp => (
                      <span key={lp.id || lp.playerId} className="bg-white border border-green-300 px-2 py-1 rounded-md text-xs flex items-center gap-1.5 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
                        {(lp.player && (lp.player.name || lp.player.nickname)) || lp.playerId}
                        <button
                          type="button"
                          onClick={async () => {
                            const isTemp = typeof lp.id === 'string' && lp.id.startsWith('temp-');
                            const backendLeaguePlayerId = !isTemp && lp.id ? lp.id : null;

                            if (backendLeaguePlayerId && initialData?.id) {
                              try {
                                const result = await removePlayerFromLeague(initialData.id, backendLeaguePlayerId);
                                if (!result.success) {
                                  alert(result.error || 'Failed to remove player from league');
                                  return;
                                }
                              } catch (err) {
                                console.error('Error removing player:', err);
                                alert('An error occurred while removing the player.');
                                return;
                              }
                            }

                            const removedPlayer = lp.player ? { id: lp.playerId, name: lp.player.name, nickname: lp.player.nickname, email: lp.player.email } : null;
                            if (removedPlayer) setClubPlayers(prev => [...prev, removedPlayer]);
                            setLeaguePlayers(prev => prev.filter(x => (x.id || x.playerId) !== (lp.id || lp.playerId)));
                          }}
                          className="text-red-400 hover:text-red-600 font-bold leading-none"
                        >&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Structure</h2>

            {/* League Format */}
            <div>
              <label className="block text-sm font-medium mb-2">League Format</label>
              <span className="block text-xs text-gray-500 mb-2">Choose how the competition will be structured (everyone plays everyone, knockout stages, or Swiss rounds).</span>
              <div className="grid grid-cols-2 gap-2">
                {['roundRobin', 'homeAway', 'groupsKnockout', 'knockout', 'swiss'].map((fmt) => {
                  const isKnockoutDisabled = fmt === 'knockout' && (formData.structure.players.lateJoin || formData.basicInfo.lateJoinAllowed);
                  return (
                    <label key={fmt} className={`flex items-center gap-2 ${isKnockoutDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="format"
                        value={fmt}
                        checked={formData.structure.format === fmt}
                        onChange={(e) => updateStructure('', 'format', e.target.value)}
                        disabled={isKnockoutDisabled}
                      />
                      <span className={isKnockoutDisabled ? 'text-gray-400' : ''}>
                        {fmt === 'roundRobin' ? 'Round Robin (Single)' : fmt === 'homeAway' ? 'Round Robin (Home/Away)' : fmt === 'groupsKnockout' ? 'Groups + Knockout' : fmt === 'knockout' ? 'Straight Knockout' : fmt === 'swiss' ? 'Swiss' : 'Custom Structure'}
                        {isKnockoutDisabled && <span className="text-xs text-red-500 ml-1">(Not available with Late Join)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Groups */}
            {formData.structure.format === 'groupsKnockout' && (
              <div className="border p-4 rounded bg-gray-50 space-y-3">
                <h3 className="font-medium">Groups Configuration</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-sm">Number of groups</label><input type="number" min="1" value={formData.structure.groups.count} onChange={(e) => updateStructure('groups', 'count', parseInt(e.target.value) || 1)} className="w-full border rounded p-2" /></div>
                  <div><label className="block text-sm">Teams per group</label><input type="number" min="2" value={formData.structure.groups.teamsPerGroup} onChange={(e) => updateStructure('groups', 'teamsPerGroup', parseInt(e.target.value) || 2)} className="w-full border rounded p-2" /></div>
                  <div><label className="block text-sm">Top X qualify</label><input type="number" min="1" value={formData.structure.groups.qualifiers} onChange={(e) => updateStructure('groups', 'qualifiers', parseInt(e.target.value) || 1)} className="w-full border rounded p-2" /></div>
                </div>
              </div>
            )}

            {/* Knockout seeding */}
            {formData.structure.format === 'knockout' && (
              <div className="border p-4 rounded bg-gray-50 space-y-3">
                <h3 className="font-medium">Knockout Seeding</h3>
                <div><label className="block text-sm mb-1">Seeding method</label><select value={formData.structure.knockout.seeding} onChange={(e) => updateStructure('knockout', 'seeding', e.target.value)} className="w-full border rounded p-2"><option value="random">Random</option><option value="ranking">Ranking‑based</option><option value="manual">Manual</option></select></div>
                <div><label className="block text-sm mb-1">Bye Selection</label><select value={formData.structure.knockout.byeSelection} onChange={(e) => updateStructure('knockout', 'byeSelection', e.target.value)} className="w-full border rounded p-2"><option value="random">Random</option><option value="ranked">Lowest Ranked Players</option><option value="manual">Manual Selection</option></select></div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.structure.knockout.protection} onChange={(e) => updateStructure('knockout', 'protection', e.target.checked)} /> Protect top seeds (no meeting before final)</label>

                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <h4 className="text-sm font-medium mb-2">
                    {formData.structure.knockout.byeSelection === 'manual' ? 'Manual Bye Selection' :
                      formData.structure.knockout.byeSelection === 'ranked' ? 'Auto Bye Selection (Lowest Ranked)' :
                        'Auto Bye Selection (Random)'}
                  </h4>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-gray-600">
                      {formData.structure.knockout.byeSelection === 'manual'
                        ? 'Select which players should receive a bye into the next round.'
                        : 'These players will automatically receive byes:'}
                      {leaguePlayers.length > 0 && ` Current players: ${leaguePlayers.length}. Byes needed: ${Math.pow(2, Math.ceil(Math.log2(leaguePlayers.length))) - leaguePlayers.length}`}
                    </p>
                    {formData.structure.knockout.byeSelection === 'random' && leaguePlayers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const playerIds = leaguePlayers.map(lp => lp.playerId || lp.player?.id);
                          const byeCount = Math.pow(2, Math.ceil(Math.log2(leaguePlayers.length))) - leaguePlayers.length;
                          const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
                          updateStructure('knockout', 'manualByes', shuffled.slice(0, byeCount));
                        }}
                        className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded border border-blue-300 font-medium transition-colors"
                      >
                        Roll Again 🎲
                      </button>
                    )}
                  </div>
                  {errors.manualByes && (
                    <div className="text-xs text-red-600 font-semibold mb-2">{errors.manualByes}</div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {leaguePlayers.map((lp, i) => {
                      const pid = lp.playerId || lp.player?.id;
                      const byeCount = Math.pow(2, Math.ceil(Math.log2(leaguePlayers.length))) - leaguePlayers.length;

                      let isBye = false;
                      if (formData.structure.knockout.byeSelection === 'manual' || formData.structure.knockout.byeSelection === 'random') {
                        isBye = (formData.structure.knockout.manualByes || []).includes(pid);
                      } else if (formData.structure.knockout.byeSelection === 'ranked') {
                        const sortedIds = [...leaguePlayers]
                          .sort((a, b) => {
                            const rA = parseFloat(a.player?.ranking || a.ranking || 0);
                            const rB = parseFloat(b.player?.ranking || b.ranking || 0);
                            if (rA !== rB) return rA - rB;
                            const idA = (a.playerId || a.player?.id || '').toString();
                            const idB = (b.playerId || b.player?.id || '').toString();
                            return idA > idB ? 1 : (idA < idB ? -1 : 0);
                          })
                          .map(lp => lp.playerId || lp.player?.id);
                        const bypassIds = sortedIds.slice(0, byeCount);
                        isBye = bypassIds.includes(pid);
                      }

                      return (
                        <label key={pid} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={isBye}
                            disabled={formData.structure.knockout.byeSelection !== 'manual'}
                            onChange={(e) => {
                              const current = formData.structure.knockout.manualByes || [];
                              const next = e.target.checked ? [...current, pid] : current.filter(id => id !== pid);
                              updateStructure('knockout', 'manualByes', next);
                            }}
                          />
                          {(lp.player && (lp.player.name || lp.player.nickname)) || lp.playerId}
                        </label>
                      );
                    })}
                  </div>
                </div>


                <div className="mt-3">
                  <label className="block text-sm font-medium mb-1">Explicit bracket order</label>
                  <ul className="list-decimal pl-5 space-y-1">
                    {(formData.structure.knockout.manualOrder && formData.structure.knockout.manualOrder.length > 0
                      ? formData.structure.knockout.manualOrder
                      : leaguePlayers.map(lp => lp.playerId || lp.player?.id))
                      .map((pid, idx) => {
                        const playerObj = leaguePlayers.find(lp => (lp.playerId || lp.player?.id) === pid);
                        const display = playerObj ? (playerObj.player?.name || playerObj.player?.nickname || pid) : pid;
                        return (
                          <li key={pid} className="flex items-center justify-between">
                            <span className="text-sm">{display}</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={idx === 0 || formData.structure.knockout.seeding !== 'manual'}
                                onClick={() => moveManualOrder(idx, 'up')}
                                className="text-xs text-blue-500"
                              >↑</button>
                              <button
                                type="button"
                                disabled={idx === ((formData.structure.knockout.manualOrder || []).length - 1) || formData.structure.knockout.seeding !== 'manual'}
                                onClick={() => moveManualOrder(idx, 'down')}
                                className={`text-xs ${formData.structure.knockout.seeding === 'manual' ? 'text-blue-500' : 'text-gray-400'}`}
                              >↓</button>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                  {formData.structure.knockout.seeding === 'manual' && leaguePlayers.length > 0 && formData.structure.knockout.manualOrder && formData.structure.knockout.manualOrder.length !== leaguePlayers.length && (
                    <p className="text-xs text-red-500 mt-1">
                      Manual order does not include every player; missing players will be added automatically.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Swiss settings */}
            {formData.structure.format === 'swiss' && (
              <div className="border p-4 rounded bg-gray-50 space-y-3">
                <h3 className="font-medium">Swiss System Settings</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-sm">Number of rounds</label><input type="number" min="3" value={formData.structure.swiss.rounds} onChange={(e) => updateStructure('swiss', 'rounds', parseInt(e.target.value) || 3)} className="w-full border rounded p-2" /></div>
                  <div><label className="block text-sm">Pairing system</label><select value={formData.structure.swiss.pairing} onChange={(e) => updateStructure('swiss', 'pairing', e.target.value)} className="w-full border rounded p-2"><option value="swiss">Standard Swiss</option><option value="accelerated">Accelerated Swiss</option></select></div>
                  <div><label className="block text-sm">Swiss Ranking Method</label><select value={formData.structure.swiss.tieBreak} onChange={(e) => updateStructure('swiss', 'tieBreak', e.target.value)} className="w-full border rounded p-2"><option value="buchholz">Buchholz</option><option value="median">Median</option><option value="sonneborn">Sonneborn‑Berger</option></select></div>
                </div>
              </div>
            )}

            {/* Divisions - show for all formats */}
            <div>
              {leaguePlayers.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-300 p-3 rounded text-sm text-yellow-800 mb-4">
                  <strong>📋 Info:</strong> Add players first to enable divisions and configure division settings.
                </div>
              )}
              <label className={`flex items-center gap-2 ${leaguePlayers.length === 0 || formData.structure.format === 'knockout' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={formData.structure.divisions.enabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    const count = formData.structure.divisions.count;
                    const initialMaxPlayers = enabled ? new Array(count).fill(0) : [];
                    const initialAssigned = enabled ? Array.from({ length: count }, () => []) : [];
                    setFormData(prev => ({
                      ...prev,
                      structure: {
                        ...prev.structure,
                        divisions: {
                          ...prev.structure.divisions,
                          enabled,
                          maxPlayersPerDivision: initialMaxPlayers,
                          assignedPlayers: initialAssigned,
                        },
                      },
                    }));
                  }}
                  disabled={leaguePlayers.length === 0 || formData.structure.format === 'knockout'}
                  className="w-4 h-4"
                />
                <span className={`font-medium ${leaguePlayers.length === 0 || formData.structure.format === 'knockout' ? 'text-gray-400' : ''}`}>Enable Divisions</span>
              </label>

              {formData.structure.divisions.enabled && (
                <div className="ml-6 mt-2 space-y-3 border-l-2 pl-4">
                  <div className="grid grid-cols-3 gap-3">
                    {formData.structure.format !== 'groupsKnockout' ? (
                      <div>
                        <label className="block text-sm">Number of divisions</label>
                        <input type="number" min="1" value={formData.structure.divisions.count === '' ? '' : formData.structure.divisions.count} onChange={(e) => {
                          const val = e.target.value;
                          const newCount = val === '' ? '' : (parseInt(val) || 1);
                          const currentMaxPlayers = formData.structure.divisions.maxPlayersPerDivision || [];
                          let newMaxPlayers = [...currentMaxPlayers];
                          const currentAssigned = formData.structure.divisions.assignedPlayers || [];
                          let newAssigned = [...currentAssigned];

                          if (typeof newCount === 'number') {
                            if (newCount > currentMaxPlayers.length) {
                              newMaxPlayers = newMaxPlayers.concat(new Array(newCount - currentMaxPlayers.length).fill(0));
                              newAssigned = newAssigned.concat(new Array(newCount - currentAssigned.length).fill([]));
                            } else if (newCount < currentMaxPlayers.length) {
                              newMaxPlayers = newMaxPlayers.slice(0, newCount);
                              newAssigned = newAssigned.slice(0, newCount);
                            }
                          }

                          setFormData(prev => ({
                            ...prev,
                            structure: {
                              ...prev.structure,
                              divisions: {
                                ...prev.structure.divisions,
                                count: newCount,
                                maxPlayersPerDivision: newMaxPlayers,
                                assignedPlayers: newAssigned,
                              },
                            },
                          }));
                        }} className="w-full border rounded p-2" />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm">Groups</label>
                        <input type="text" readOnly value={`${formData.structure.groups.count} (linked to format)`} className="w-full border rounded p-2 bg-gray-50" />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm">Promotion spots</label>
                      <input type="number" min="0" value={formData.structure.divisions.promotions === '' ? '' : formData.structure.divisions.promotions} onChange={(e) => {
                        const val = e.target.value;
                        updateStructure('divisions', 'promotions', val === '' ? '' : (parseInt(val) || 0));
                      }} className="w-full border rounded p-2" />
                    </div>
                    <div>
                      <label className="block text-sm">Relegation spots</label>
                      <input type="number" min="0" value={formData.structure.divisions.relegations === '' ? '' : formData.structure.divisions.relegations} onChange={(e) => {
                        const val = e.target.value;
                        updateStructure('divisions', 'relegations', val === '' ? '' : (parseInt(val) || 0));
                      }} className="w-full border rounded p-2" />
                    </div>
                  </div>

                  {/* Division Assignment Method */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Division Assignment Method</label>
                    <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-lg border">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="assignmentMethod"
                          value="auto"
                          checked={formData.structure.divisions.assignmentMethod === 'auto'}
                          onChange={() => updateStructure('divisions', 'assignmentMethod', 'auto')}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-gray-800">Auto Assign (Random)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="assignmentMethod"
                          value="skill"
                          checked={formData.structure.divisions.assignmentMethod === 'skill'}
                          onChange={() => updateStructure('divisions', 'assignmentMethod', 'skill')}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-gray-800">Skill Based Assign</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="assignmentMethod"
                          value="manual"
                          checked={formData.structure.divisions.assignmentMethod === 'manual'}
                          onChange={() => updateStructure('divisions', 'assignmentMethod', 'manual')}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-gray-800">Admin Assign (Manual)</span>
                      </label>
                    </div>
                  </div>

                  {/* Currently enrolled league players (when divisions enabled) */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Enrolled Players</label>
                    {leaguePlayers && leaguePlayers.length > 0 ? (
                      <ul className="list-disc pl-5">
                        {leaguePlayers.map(lp => (
                          <li key={lp.id} className="text-sm">{(lp.player && (lp.player.name || lp.player.nickname)) || lp.playerId}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">No players enrolled yet.</p>
                    )}
                  </div>
                  {/* Auto/Skill assignment preview (non-manual) */}
                  {formData.structure.divisions.assignmentMethod !== 'manual' && (
                    <div className="mt-3 border rounded p-3 bg-blue-50">
                      <h4 className="font-medium mb-2">Division assignment preview ({formData.structure.divisions.assignmentMethod === 'skill' ? 'Skill Based' : 'Auto Random'})</h4>
                      {formData.structure.divisions.assignedPlayers && formData.structure.divisions.assignedPlayers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {formData.structure.divisions.assignedPlayers.map((players, di) => (
                            <div key={di} className="border rounded p-2 bg-white">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold">Division {di + 1}</span>
                                <span className="text-xs text-gray-500">{players.length} players</span>
                              </div>
                              <ul className="list-disc pl-5 text-sm">
                                {players.length > 0 ? players.map(pid => {
                                  const playerObj = leaguePlayers.find(lp => (lp.playerId && lp.playerId.toString() === pid.toString()) || (lp.player?.id && lp.player.id.toString() === pid.toString()));
                                  const display = playerObj ? (playerObj.player?.name || playerObj.player?.nickname || playerObj.playerId || playerObj.id) : pid;
                                  return <li key={`${di}-${pid}`}>{display}</li>;
                                }) : <li className="text-gray-500">No players assigned yet.</li>}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">No assignment data yet. Add league players to see division distribution (or switch to Manual).</p>
                      )}
                    </div>
                  )}

                  {/* Manual assignment UI (with Max Players per Division shown first when admin assigns manually) */}
                  {formData.structure.divisions.assignmentMethod === 'manual' && (
                    <div className="mt-3">
                      {/* Max players per division */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Max Players per Division</label>
                        {Array.from({ length: formData.structure.divisions.count }, (_, i) => (
                          <div key={i} className="flex items-center gap-2 mb-2">
                            <span className="text-sm w-24">Division {i + 1}:</span>
                            <input
                              type="number"
                              min="0"
                              value={formData.structure.divisions.maxPlayersPerDivision[i] === '' ? '' : (formData.structure.divisions.maxPlayersPerDivision[i] ?? 0)}
                              onChange={(e) => updateDivisionMaxPlayers(i, e.target.value)}
                              className="w-20 border rounded p-1"
                            />
                          </div>
                        ))}
                        <p className="text-xs text-gray-500 mt-1">
                          Sum of max players across divisions should not exceed total max players ({formData.structure.players.max}).
                        </p>
                      </div>

                      <h4 className="font-medium mb-2">Manual Assignment</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Array.from({ length: formData.structure.divisions.count }, (_, di) => (
                          <div key={di} className="border rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <strong>Division {di + 1}</strong>
                              <small className="text-xs text-gray-500">Max: {formData.structure.divisions.maxPlayersPerDivision[di] || 0}</small>
                            </div>
                            <div className="mb-2">
                              <div className="text-sm font-medium">Assigned Players</div>
                              <ul className="mt-1 list-disc pl-5">
                                {(formData.structure.divisions.assignedPlayers && formData.structure.divisions.assignedPlayers[di] && formData.structure.divisions.assignedPlayers[di].length > 0) ? (
                                  formData.structure.divisions.assignedPlayers[di].map(pid => {
                                    const playerObj = leaguePlayers.find(lp => lp.playerId === pid) || leaguePlayers.find(lp => lp.player && lp.player.id === pid);
                                    const display = playerObj ? (playerObj.player?.name || playerObj.player?.nickname || playerObj.playerId) : pid;
                                    return (
                                      <li key={pid} className="flex items-center justify-between">
                                        <span className="text-sm">{display}</span>
                                        <button type="button" onClick={() => removePlayerFromDivision(di, pid)} className="text-red-500 text-xs">Remove</button>
                                      </li>
                                    );
                                  })
                                ) : (
                                  <li className="text-sm text-gray-500">No players assigned.</li>
                                )}
                              </ul>
                            </div>

                            <div>
                              <label className="block text-sm mb-1">Add player</label>
                              <select className="w-full border rounded p-2" onChange={(e) => { if (e.target.value) { addPlayerToDivision(di, e.target.value); e.target.value = ''; } }}>
                                <option value="">Select player to add</option>
                                {leaguePlayers.filter(lp => !isPlayerAssigned(lp.playerId)).map(lp => (
                                  <option key={lp.playerId} value={lp.playerId}>{lp.player?.name || lp.player?.nickname || 'Unknown'}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                </div>
              )}

            </div>

            {/* Player Settings */}
            {/* Player Settings */}
            <div className="border-t pt-4 mt-6">
            </div>
          </div>
        );

      // Steps 3-9 remain exactly as in the original code (unchanged)
      // For brevity, I'm including placeholders – in the final answer you would copy the full JSX from the earlier code.
      case 4:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Match Rules</h2>
            {/* Best Of */}
            <div>
              <label className="block text-sm font-medium mb-2">Best Of</label>
              <select
                value={formData.matchRules.bestOf}
                onChange={(e) => updateMatchRules('bestOf', e.target.value)}
                className="border rounded p-2"
              >
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="7">7</option>
                <option value="9">9</option>
                <option value="custom">Custom</option>
              </select>
              {formData.matchRules.bestOf === 'custom' && (
                <input
                  type="number"
                  min="1"
                  value={customFramesInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomFramesInput(val);
                    updateMatchRules('customFrames', parseInt(val) || 1);
                  }}
                  placeholder="Enter frames"
                  className="ml-2 border rounded p-2 w-24"
                />
              )}
            </div>

            {/* Score Detail */}
            <div>
              <label className="block text-sm font-medium mb-2">Score Detail Level</label>
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all group">
                  <input
                    type="radio"
                    name="scoreDetail"
                    value="overall"
                    checked={formData.matchRules.scoreDetail === 'overall' || !formData.matchRules.scoreDetail}
                    onChange={(e) => updateMatchRules('scoreDetail', e.target.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-medium text-gray-800 group-hover:text-blue-700">Overall</span>
                    <p className="text-xs text-gray-500 mt-0.5">Record only the final match score (e.g. 3‑1). No frame‑by‑frame breakdown required.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all group">
                  <input
                    type="radio"
                    name="scoreDetail"
                    value="frame_by_frame"
                    checked={formData.matchRules.scoreDetail === 'frame_by_frame'}
                    onChange={(e) => updateMatchRules('scoreDetail', e.target.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-medium text-gray-800 group-hover:text-blue-700">Frame‑by‑Frame</span>
                    <p className="text-xs text-gray-500 mt-0.5">Record points for every single frame and highest breaks. Available for all three games.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* No Draw Rule */}
            <div>
              <label className="block text-sm font-medium mb-2">Draw Resolution Rule</label>
              <span className="block text-xs text-gray-500 mb-1">Choose how to decide the winner if a match ends in a draw.</span>
              <select
                value={formData.matchRules.noDrawRule}
                onChange={(e) => updateMatchRules('noDrawRule', e.target.value)}
                className="w-full border rounded p-2 max-w-xs"
              >
                <option value="none">Allow Draws</option>
                <option value="highestBreak">Highest Break Overall</option>
                <option value="respottedBlack">Re-spotted Black (Snooker/Pool)</option>
                <option value="mostPoints">Most Points Scored (Total)</option>
                <option value="blackFinish">Black Ball Finish (Pooker)</option>
              </select>
            </div>

            {/* Handicap */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.matchRules.handicap.enabled}
                  onChange={(e) => updateMatchRules('handicap', { ...formData.matchRules.handicap, enabled: e.target.checked })}
                />
                <span className="font-medium">Enable Handicap</span>
              </label>
              {formData.matchRules.handicap.enabled && (
                <div className="ml-6 mt-2 space-y-2">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="handicapType"
                        value="manual"
                        checked={formData.matchRules.handicap.type === 'manual'}
                        onChange={(e) => updateMatchRules('handicap', { ...formData.matchRules.handicap, type: e.target.value })}
                      /> Manual
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="handicapType"
                        value="auto"
                        checked={formData.matchRules.handicap.type === 'auto'}
                        onChange={(e) => updateMatchRules('handicap', { ...formData.matchRules.handicap, type: e.target.value })}
                      /> Auto Rating Based
                    </label>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={formData.matchRules.handicap.dynamic}
                        onChange={(e) => updateMatchRules('handicap', { ...formData.matchRules.handicap, dynamic: e.target.checked })}
                      /> Dynamic Weekly
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={formData.matchRules.handicap.fixed}
                        onChange={(e) => updateMatchRules('handicap', { ...formData.matchRules.handicap, fixed: e.target.checked })}
                      /> Fixed for season
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Walkover */}
            <div>
              <label className="block text-sm font-medium mb-2">Walkover Rules (player no‑show)</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="walkover"
                    value="autoBestOf"
                    checked={formData.matchRules.walkover.rule === 'autoBestOf'}
                    onChange={(e) => updateMatchRules('walkover', { ...formData.matchRules.walkover, rule: e.target.value })}
                  /> Auto (based on Best Of)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="walkover"
                    value="admin"
                    checked={formData.matchRules.walkover.rule === 'admin'}
                    onChange={(e) => updateMatchRules('walkover', { ...formData.matchRules.walkover, rule: e.target.value })}
                  /> Admin decides (at match time)
                </label>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Points & Tie‑Break</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm">Points for Win</label><input type="number" value={formData.pointsSystem.win === '' ? '' : (formData.pointsSystem.win ?? 0)} onChange={(e) => updatePointsSystem('win', e.target.value === '' ? '' : (parseInt(e.target.value) || 0))} className="w-full border rounded p-2" /></div>
              <div><label className="block text-sm">Points for Draw</label><input type="number" value={formData.pointsSystem.draw === '' ? '' : (formData.pointsSystem.draw ?? 0)} onChange={(e) => updatePointsSystem('draw', e.target.value === '' ? '' : (parseInt(e.target.value) || 0))} className="w-full border rounded p-2" /></div>
              <div><label className="block text-sm">Points for Loss</label><input type="number" value={formData.pointsSystem.loss === '' ? '' : (formData.pointsSystem.loss ?? 0)} onChange={(e) => updatePointsSystem('loss', e.target.value === '' ? '' : (parseInt(e.target.value) || 0))} className="w-full border rounded p-2" /></div>

              <div className="col-span-2 text-sm text-gray-600">Walkover points are based on your walkover rule configuration. Configure walkover score rules in Step 4 (Match Rules).</div>
              <label className="block text-sm font-medium mb-2 col-span-2">Bonus Points</label>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={formData.pointsSystem.bonuses.whitewash} onChange={(e) => updatePointsSystem('bonuses', { ...formData.pointsSystem.bonuses, whitewash: e.target.checked })} />
                    Whitewash Bonus
                  </label>
                  {formData.pointsSystem.bonuses.whitewash && (
                    <div className="flex items-center gap-2">
                      <input type="number" className="w-16 border rounded p-1" value={formData.pointsSystem.bonuses.whitewashPoints === '' ? '' : (formData.pointsSystem.bonuses.whitewashPoints ?? 0)} onChange={(e) => updatePointsSystem('bonuses', { ...formData.pointsSystem.bonuses, whitewashPoints: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })} />
                      <span className="text-xs">pts</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={formData.pointsSystem.bonuses.breakOverX} onChange={(e) => updatePointsSystem('bonuses', { ...formData.pointsSystem.bonuses, breakOverX: e.target.checked })} />
                    Break over X
                  </label>
                  {formData.pointsSystem.bonuses.breakOverX && (
                    <div className="flex items-center gap-2">
                      <input type="number" placeholder="X" className="w-16 border rounded p-1" value={formData.pointsSystem.bonuses.breakValue === '' ? '' : (formData.pointsSystem.bonuses.breakValue ?? 0)} onChange={(e) => updatePointsSystem('bonuses', { ...formData.pointsSystem.bonuses, breakValue: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })} />
                      <span className="text-xs">target</span>
                      <input type="number" placeholder="Pts" className="w-16 border rounded p-1" value={formData.pointsSystem.bonuses.breakPoints === '' ? '' : (formData.pointsSystem.bonuses.breakPoints ?? 0)} onChange={(e) => updatePointsSystem('bonuses', { ...formData.pointsSystem.bonuses, breakPoints: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })} />
                      <span className="text-xs">pts</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={formData.pointsSystem.bonuses.participation} onChange={(e) => updatePointsSystem('bonuses', { ...formData.pointsSystem.bonuses, participation: e.target.checked })} />
                    Participation Bonus
                  </label>
                  {formData.pointsSystem.bonuses.participation && (
                    <div className="flex items-center gap-2">
                      <input type="number" className="w-16 border rounded p-1" value={formData.pointsSystem.bonuses.participationValue === '' ? '' : (formData.pointsSystem.bonuses.participationValue ?? 0)} onChange={(e) => updatePointsSystem('bonuses', { ...formData.pointsSystem.bonuses, participationValue: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })} />
                      <span className="text-xs">pts</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tie-Break Priority (Manual Reorder) */}
            <div>
              <label className="block text-sm font-medium mb-2">Standings Ranking Priority (Reorder with buttons)</label>
              <ul className="border rounded divide-y">
                {formData.tieBreakPriority.map((item, index) => (
                  <li key={item} className="p-2 flex items-center justify-between">
                    <span>{index + 1}. {item.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                    <div className="space-x-2">
                      <button type="button" onClick={() => moveTieBreakItem(index, 'up')} disabled={index === 0} className="px-2 py-1 text-xs border rounded disabled:opacity-50">↑</button>
                      <button type="button" onClick={() => moveTieBreakItem(index, 'down')} disabled={index === formData.tieBreakPriority.length - 1} className="px-2 py-1 text-xs border rounded disabled:opacity-50">↓</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Standings Display Settings</h2>
            <div>
              <p className="text-sm text-gray-600 mb-2">Select columns to appear in the standings table:</p>
              <span className="block text-xs text-gray-500 mb-3">Choose which statistics are visible to players and spectators in the league standings.</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { key: 'matchesPlayed', label: 'Matches Played' },
                { key: 'wins', label: 'Wins' },
                { key: 'losses', label: 'Losses' },
                { key: 'draws', label: 'Draws' },
                { key: 'framesWon', label: 'Frames Won' },
                { key: 'framesConceded', label: 'Frames Conceded' },
                { key: 'frameDifference', label: 'Frame Difference' },
                { key: 'whitewashes', label: 'Whitewashes' },
                { key: 'highestBreak', label: 'Highest Break' },
                { key: 'winPercent', label: 'Win %' },
                { key: 'streak', label: 'Streak' },
                { key: 'points', label: 'Total Points' },
              ].map(col => (
                <label key={col.key} className="flex items-center gap-2">
                  <input type="checkbox" checked={formData.standingsDisplay.columns.includes(col.key)} onChange={() => updateStandingsDisplay(col.key)} />
                  {col.label}
                </label>
              ))}
            </div>

            {/* Game Specific Stats */}
            <div className="mt-4">
              <h3 className="font-medium mb-2 uppercase text-xs text-gray-500 tracking-wider">
                {formData.basicInfo.gameName?.charAt(0).toUpperCase() + formData.basicInfo.gameName?.slice(1)} Specific Stats
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {(formData.basicInfo.gameName || '').toLowerCase() === 'snooker' && (
                  <>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.standingsDisplay.columns.includes('breaks50Plus')} onChange={() => updateStandingsDisplay('breaks50Plus')} />
                      50+ Breaks
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.standingsDisplay.columns.includes('breaks100Plus')} onChange={() => updateStandingsDisplay('breaks100Plus')} />
                      100+ Breaks
                    </label>
                  </>
                )}
                {(formData.basicInfo.gameName || '').toLowerCase() === 'pool' && (
                  <>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.standingsDisplay.columns.includes('ballsPotted')} onChange={() => updateStandingsDisplay('ballsPotted')} />
                      Balls Potted
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.standingsDisplay.columns.includes('ballsConceded')} onChange={() => updateStandingsDisplay('ballsConceded')} />
                      Balls Conceded
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.standingsDisplay.columns.includes('sevenBallWins')} onChange={() => updateStandingsDisplay('sevenBallWins')} />
                      7-Ball Wins
                    </label>
                  </>
                )}
                {((formData.basicInfo.gameName || '').toLowerCase() === 'pooker' || (formData.basicInfo.gameName || '').toLowerCase() === 'poker') && (
                  <>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.standingsDisplay.columns.includes('ballsPotted')} onChange={() => updateStandingsDisplay('ballsPotted')} />
                      Balls Potted
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.standingsDisplay.columns.includes('blackFinishes')} onChange={() => updateStandingsDisplay('blackFinishes')} />
                      Black Finishes
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formData.standingsDisplay.columns.includes('whitewashWins')} onChange={() => updateStandingsDisplay('whitewashWins')} />
                      Whitewash Wins
                    </label>
                  </>
                )}
              </div>
            </div>
            <div className="mt-6 border-t pt-4">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="font-semibold text-gray-800">Live Preview</h3>
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-green-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block"></span>
                  Live
                </span>
                <span className="text-xs text-gray-400">Updates instantly as you toggle columns above</span>
              </div>
              <StandingsPreview />
            </div>
          </div>
        );

      case 7:
        const fixtureStats = calculateFixtureStats();
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Scheduling Engine</h2>
            <div>
              <label className="block text-sm font-medium mb-2">Fixture Generation</label>
              <span className="block text-xs text-gray-500 mb-2">Auto-generate all matches at once, or allow players to schedule matches anytime.</span>
              <div className="space-y-2">
                <label className="flex items-center gap-2"><input type="radio" name="generation" value="auto" checked={formData.scheduling.generation === 'auto'} onChange={(e) => updateScheduling('generation', e.target.value)} /> Auto generate all fixtures</label>
                <label className="flex items-center gap-2"><input type="radio" name="generation" value="flexible" checked={formData.scheduling.generation === 'flexible'} onChange={(e) => updateScheduling('generation', e.target.value)} /> Flexible play anytime</label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Deadline Rules</label>
              <div className="flex items-center gap-4"><span>Match must be played within</span><input type="number" min="1" value={formData.scheduling.deadlineDays === '' ? '' : (formData.scheduling.deadlineDays || 1)} onChange={(e) => {
                const val = e.target.value;
                updateScheduling('deadlineDays', val === '' ? '' : (parseInt(val) || 1));
              }} className="w-20 border rounded p-2" /><span>days</span></div>
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.scheduling.autoForfeit} onChange={(e) => updateScheduling('autoForfeit', e.target.checked)} /> <span>Auto forfeit if overdue<span className="text-xs text-gray-500 ml-2">(Automatic loss for missed deadline)</span></span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.scheduling.allowReschedule} onChange={(e) => updateScheduling('allowReschedule', e.target.checked)} /> <span>Allow reschedule<span className="text-xs text-gray-500 ml-2">(Players can request new dates)</span></span></label>
              </div>
            </div>

            {/* Fixture Preview */}
            <div className="border p-4 rounded bg-gray-50">
              <h3 className="font-medium mb-2">Fixture Preview</h3>
              <p>Estimated total matches: <strong>{fixtureStats.matches}</strong></p>
              <p>Approximate season duration: <strong>{fixtureStats.weeks} weeks</strong></p>
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Match Reporting System</h2>
            <div>
              <label className="block text-sm font-medium mb-2">Result Confirmation</label>
              <span className="block text-xs text-gray-500 mb-2">Choose who must confirm match results before they're recorded in the standings.</span>
              <div className="space-y-2">
                <label className="flex items-center gap-2"><input type="radio" name="reportingMethod" value="bothConfirm" checked={formData.reporting.method === 'bothConfirm'} onChange={(e) => updateReporting('method', e.target.value)} /> <span>Both players confirm result<span className="text-xs text-gray-500 ml-2">(Both must agree)</span></span></label>
                <label className="flex items-center gap-2"><input type="radio" name="reportingMethod" value="oneSubmit" checked={formData.reporting.method === 'oneSubmit'} onChange={(e) => updateReporting('method', e.target.value)} /> <span>Single player submits<span className="text-xs text-gray-500 ml-2">(Recorded on submission)</span></span></label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Organizer Control</label>
              <span className="block text-xs text-gray-500 mb-2">Enable additional oversight by the league administrator.</span>
              <div className="space-y-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.reporting.adminApproval} onChange={(e) => updateReporting('adminApproval', e.target.checked)} /> <span className="font-medium text-blue-700">Require Organizer Approval<span className="text-xs text-gray-500 ml-2">(Admin must verify all results)</span></span></label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Additional Options</label>
              <span className="block text-xs text-gray-500 mb-2">Enable photo uploads and/or allow disputes for contested results.</span>
              <div className="space-y-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.reporting.photoProof} onChange={(e) => updateReporting('photoProof', e.target.checked)} /> <span>Allow photo proof<span className="text-xs text-gray-500 ml-2">(Upload match photos for evidence)</span></span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.reporting.dispute.enabled} onChange={(e) => updateReporting('dispute', { ...formData.reporting.dispute, enabled: e.target.checked })} /> <span>Allow dispute button<span className="text-xs text-gray-500 ml-2">(Challenge disputed results)</span></span></label>
                {formData.reporting.dispute.enabled && <div className="ml-6"><label className="block text-sm">Dispute time limit (hours)</label><input type="number" min="1" value={formData.reporting.dispute.timeLimit === '' ? '' : (formData.reporting.dispute.timeLimit || 1)} onChange={(e) => {
                  const val = e.target.value;
                  updateReporting('dispute', { ...formData.reporting.dispute, timeLimit: val === '' ? '' : (parseInt(val) || 1) });
                }} className="w-24 border rounded p-2" /></div>}
              </div>
            </div>
          </div>
        );

      case 9:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Advanced Settings</h2>
            <div>
              <h3 className="font-medium mb-2">Withdrawal Behaviour</h3>
              <span className="block text-xs text-gray-500 mb-2">Define what happens to a player's matches if they withdraw from the league.</span>
              <div className="space-y-2">
                <label className="flex items-center gap-2"><input type="radio" name="withdrawal" value="voidAll" checked={formData.advanced.withdrawal === 'voidAll'} onChange={(e) => updateAdvancedField('withdrawal', e.target.value)} /> <span>Void all matches<span className="text-xs text-gray-500 ml-2">(All matches cancelled)</span></span></label>
                <label className="flex items-center gap-2"><input type="radio" name="withdrawal" value="keepPlayed" checked={formData.advanced.withdrawal === 'keepPlayed'} onChange={(e) => updateAdvancedField('withdrawal', e.target.value)} /> <span>Keep played matches<span className="text-xs text-gray-500 ml-2">(Count results, void remaining)</span></span></label>
              </div>
            </div>
            <div>
              <h3 className="font-medium mb-2">Season Behaviour</h3>
              <span className="block text-xs text-gray-500 mb-2">Control score handling and archival at the end of each season.</span>
              <div className="space-y-2">
                <label className="flex items-center gap-2"><input type="radio" name="seasonEnd" value="archive" checked={formData.advanced.seasonEnd === 'archive'} onChange={(e) => updateAdvancedField('seasonEnd', e.target.value)} /> <span>Auto archive after completion<span className="text-xs text-gray-500 ml-2">(Close league after end date)</span></span></label>
                <label className="flex items-center gap-2"><input type="radio" name="seasonEnd" value="carry" checked={formData.advanced.seasonEnd === 'carry'} onChange={(e) => updateAdvancedField('seasonEnd', e.target.value)} /> <span>Carry ranking points<span className="text-xs text-gray-500 ml-2">(Points carry to next season)</span></span></label>
                <div className="ml-6 space-y-1">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formData.advanced.resetStats} onChange={(e) => updateAdvancedField('resetStats', e.target.checked)} /> <span>Reset stats each season<span className="text-xs text-gray-500 ml-2">(Clear W/L/D totals)</span></span></label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formData.advanced.keepLifetime} onChange={(e) => updateAdvancedField('keepLifetime', e.target.checked)} /> <span>Keep lifetime stats<span className="text-xs text-gray-500 ml-2">(Preserve all-time records)</span></span></label>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-medium mb-2">Admin Controls</h3>
              <span className="block text-xs text-gray-500 mb-2">Choose which admin actions are permitted in this league.</span>
              <div className="space-y-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.advanced.adminEditFixtures} onChange={(e) => updateAdvancedField('adminEditFixtures', e.target.checked)} /> <span>Allow admin to edit fixtures<span className="text-xs text-gray-500 ml-2">(Reschedule matches)</span></span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.advanced.adminEditResults} onChange={(e) => updateAdvancedField('adminEditResults', e.target.checked)} /> <span>Allow admin to edit results<span className="text-xs text-gray-500 ml-2">(Change recorded scores)</span></span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.advanced.adminOverrideStandings} onChange={(e) => updateAdvancedField('adminOverrideStandings', e.target.checked)} /> <span>Allow admin to override standings<span className="text-xs text-gray-500 ml-2">(Manually adjust rankings)</span></span></label>
              </div>
            </div>
          </div>
        );

      case 10:
        const { matches: estMatches, weeks: estWeeks } = calculateFixtureStats();
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800">Review & Create</h2>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                  {estMatches} Matches
                </span>
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                  ~{estWeeks} Weeks
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Info Card */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                  <span className="text-blue-600 font-bold">1</span>
                  <h3 className="font-semibold text-gray-700">Basic Information</h3>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">League Name</span><span className="font-medium">{formData.basicInfo.leagueName || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Club</span><span className="font-medium text-blue-600">{formData.basicInfo.clubName || '—'}</span></div>
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-500">Venues</span>
                    <div className="flex flex-wrap gap-1">
                      {formData.basicInfo.venueIds.length > 0 ? formData.basicInfo.venueIds.map(v => {
                        let displayVenueName = v && typeof v === 'string' && v.includes(':') ? v.split(':')[1] : v;
                        const foundVenue = allVenuesWithApproval?.find(av => av.id === v);
                        if (foundVenue && foundVenue.name) {
                          displayVenueName = foundVenue.name;
                        }
                        return (
                          <span key={v} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] border">{displayVenueName}</span>
                        );
                      }) : '—'}
                    </div>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">Game & Season</span><span className="font-medium">{formData.basicInfo.gameName} ({availableSeasons.find(s => s.id === formData.basicInfo.gameSeasonId)?.name || initialData?.season?.name || '—'})</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Visibility</span><span className="capitalize px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-medium">{formData.basicInfo.visibility}</span></div>
                  <div className="pt-2 border-t mt-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] uppercase text-gray-400 font-bold">Registration</span>
                      <span className="text-xs font-mono">{formData.basicInfo.registrationOpen || '—'} to {formData.basicInfo.registrationClose || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] uppercase text-gray-400 font-bold">League Duration</span>
                      <span className="text-xs font-mono font-bold text-blue-700">{formData.basicInfo.leagueStartDate || '—'} to {formData.basicInfo.leagueEndDate || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Structure Card */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                  <span className="text-blue-600 font-bold">3</span>
                  <h3 className="font-semibold text-gray-700">Structure & Players</h3>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Format</span>
                    <span className="font-medium px-2 py-0.5 bg-green-50 text-green-700 rounded">
                      {formData.structure.format === 'roundRobin' ? 'Round Robin' :
                        formData.structure.format === 'homeAway' ? 'Home & Away' :
                          formData.structure.format === 'groupsKnockout' ? 'Groups + Knockout' :
                            formData.structure.format === 'knockout' ? 'Straight Knockout' :
                              formData.structure.format === 'swiss' ? 'Swiss System' : 'Custom'}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">Min/Max Players</span><span className="font-medium">{formData.structure.players.min} — {formData.structure.players.max}</span></div>

                  {formData.structure.divisions.enabled ? (
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 mt-2">
                      <div className="flex justify-between mb-1"><span className="text-purple-700 font-medium">Divisions Enabled</span><span className="font-bold text-purple-800">{formData.structure.divisions.count}</span></div>
                      <div className="flex justify-between text-xs text-purple-600"><span>Assignment</span><span>{formData.structure.divisions.assignmentMethod}</span></div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {formData.structure.divisions.maxPlayersPerDivision.map((m, i) => (
                          <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border border-purple-200">D{i + 1}: max {m}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-400 italic text-xs">Divisions Disabled</div>
                  )}

                  {formData.structure.format === 'swiss' && (
                    <div className="bg-orange-50 p-2 rounded text-xs border border-orange-100">
                      <p><strong>Swiss:</strong> {formData.structure.swiss.rounds} Rounds | {formData.structure.swiss.pairing} Pairing</p>
                    </div>
                  )}
                  {formData.structure.format === 'groupsKnockout' && (
                    <div className="bg-blue-50 p-2 rounded text-xs border border-blue-100">
                      <p><strong>Groups:</strong> {formData.structure.groups.count} Groups | {formData.structure.groups.teamsPerGroup} per group | Top {formData.structure.groups.qualifiers} Qualify</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Match Rules Card */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                  <span className="text-blue-600 font-bold">4</span>
                  <h3 className="font-semibold text-gray-700">Match Rules</h3>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Best Of</span>
                    <span className="w-8 h-8 flex items-center justify-center bg-gray-800 text-white rounded-full font-bold">
                      {formData.matchRules.bestOf === 'custom' ? formData.matchRules.customFrames : formData.matchRules.bestOf}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">Score Detail</span><span className="font-medium capitalize">{formData.matchRules.scoreDetail === 'frame_by_frame' ? 'Frame-by-Frame' : 'Overall'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Handicap</span><span className={`font-medium ${formData.matchRules.handicap.enabled ? 'text-green-600' : 'text-gray-400'}`}>{formData.matchRules.handicap.enabled ? 'Enabled' : 'Disabled'}</span></div>
                  {formData.matchRules.handicap.enabled && (
                    <div className="ml-4 pl-2 border-l-2 border-green-100 text-xs text-gray-600">
                      Type: {formData.matchRules.handicap.type} | {formData.matchRules.handicap.dynamic ? 'Dynamic' : 'Fixed'}
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <span className="text-xs text-gray-400 font-bold uppercase">Walkover Rule</span>
                    <p className="font-medium text-red-600">
                      {formData.matchRules.walkover.rule === 'autoBestOf' ? `Auto (based on Best Of: ${formData.matchRules.bestOf === 'custom' ? formData.matchRules.customFrames : formData.matchRules.bestOf})` :
                        'Admin Decision'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Points System Card */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                  <span className="text-blue-600 font-bold">5</span>
                  <h3 className="font-semibold text-gray-700">Scoring & Tie-Breaks</h3>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <div className="flex justify-around bg-gray-50 p-2 rounded-lg border border-dashed">
                    <div className="text-center"><div className="text-[10px] text-gray-400 uppercase">Win</div><div className="font-bold text-green-600">+{formData.pointsSystem.win}</div></div>
                    <div className="text-center"><div className="text-[10px] text-gray-400 uppercase">Draw</div><div className="font-bold text-blue-600">+{formData.pointsSystem.draw}</div></div>
                    <div className="text-center"><div className="text-[10px] text-gray-400 uppercase">Loss</div><div className="font-bold text-red-600">{formData.pointsSystem.loss}</div></div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-gray-400 font-bold uppercase">Bonus Points</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`p-1.5 rounded border text-[11px] ${formData.pointsSystem.bonuses.whitewash ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-50'}`}>Whitewash: {formData.pointsSystem.bonuses.whitewashPoints} pts</div>
                      <div className={`p-1.5 rounded border text-[11px] ${formData.pointsSystem.bonuses.breakOverX ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-50'}`}>Break &gt; {formData.pointsSystem.bonuses.breakValue}: {formData.pointsSystem.bonuses.breakPoints} pts</div>
                      <div className={`p-1.5 rounded border text-[11px] ${formData.pointsSystem.bonuses.participation ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-50'}`}>Participation: {formData.pointsSystem.bonuses.participationValue} pts</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <span className="text-xs text-gray-400 font-bold uppercase">Standings Ranking Priority</span>
                    <p className="text-[11px] text-blue-800 font-medium leading-tight mt-1">
                      {formData.tieBreakPriority.map(t => t.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())).join(' → ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Scheduling Card */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                  <span className="text-blue-600 font-bold">7</span>
                  <h3 className="font-semibold text-gray-700">Scheduling & Reporting</h3>
                </div>
                <div className="p-4 space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[11px] text-gray-400 uppercase font-bold">Generation</span>
                      <p className="font-medium text-gray-700 capitalize">{formData.scheduling.generation}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-gray-400 uppercase font-bold">Deadline</span>
                      <p className="font-medium text-gray-700">{formData.scheduling.deadlineDays} Days</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold border ${formData.scheduling.autoForfeit ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-30'}`}>Auto-Forfeit</span>
                    <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold border ${formData.scheduling.allowReschedule ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>Rescheduling</span>
                  </div>

                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Reporting Method</span>
                      <span className="font-medium text-blue-700">{formData.reporting.method === 'bothConfirm' ? 'Both Confirm' : 'Single Submit'}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Admin Approval</span>
                      <span className={`font-medium ${formData.reporting.adminApproval ? 'text-blue-600' : 'text-gray-400'}`}>{formData.reporting.adminApproval ? 'Required' : 'Optional'}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-gray-500">Disputes</span>
                      <span className={`font-medium ${formData.reporting.dispute.enabled ? 'text-orange-600' : 'text-gray-400'}`}>
                        {formData.reporting.dispute.enabled ? `${formData.reporting.dispute.timeLimit}h Window` : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced Card */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                  <span className="text-blue-600 font-bold">9</span>
                  <h3 className="font-semibold text-gray-700">Advanced / Admin</h3>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Withdrawal Rule</span>
                    <span className="font-medium text-gray-700">{formData.advanced.withdrawal === 'voidAll' ? 'Void All Matches' : 'Keep Played'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Season End</span>
                    <span className="font-medium text-gray-700">{formData.advanced.seasonEnd === 'archive' ? 'Auto-Archive' : 'Carry Ranking'}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <span className="text-[11px] text-gray-400 uppercase font-bold">Permissions</span>
                    <div className="grid grid-cols-1 gap-1 mt-1">
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${formData.advanced.adminEditFixtures ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        Admin edit fixtures
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${formData.advanced.adminEditResults ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        Admin edit results
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${formData.advanced.adminOverrideStandings ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        Admin override standings
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
              <div className="bg-blue-600 text-white p-1 rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <div className="text-sm">
                <p className="font-semibold text-blue-900 leading-tight">Final Check Required</p>
                <p className="text-blue-700 mt-1">By clicking "Create League", all matches and divisions will be configured based on these settings. You can still save as draft and return later.</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto relative">
      <LoadingOverlay isOpen={isSaving || contextLoading} message={isSaving ? "Saving Progress..." : "Processing..."} />
      <div className="flex justify-end mb-4 items-center gap-3">
        {draftToast && (
          <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full animate-pulse">
            {draftToast}
          </span>
        )}
        <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">&times; Close</button>
      </div>

      <div className="flex items-center justify-between mb-8 overflow-x-auto">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => {
          const disabled = isStepDisabled(step);
          return (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${disabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : step === currentStep ? 'bg-blue-600 text-white cursor-pointer' : completedSteps.has(step) ? 'bg-green-500 text-white cursor-pointer' : 'bg-gray-200 text-gray-600 cursor-pointer'}`} onClick={() => !disabled && goToStep(step)}>{step}</div>
              {step < totalSteps && <div className={`w-12 h-1 mx-1 ${step < currentStep || completedSteps.has(step) ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
          <p className="font-medium">Please fix the following errors:</p>
          <ul className="list-disc list-inside text-sm">{Object.entries(errors).map(([key, msg]) => <li key={key}>{msg}</li>)}</ul>
        </div>
      )}

      {saveError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
          <p className="font-medium">Save Error:</p>
          <p className="text-sm">{saveError}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-1/4 space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(step => {
            const disabled = isStepDisabled(step);
            const labels = {
              1: 'Basic Info', 2: 'Add Players', 3: 'Structure',
              4: 'Match Rules', 5: 'Points & Tie-Break',
              6: 'Standings Display', 7: 'Scheduling', 8: 'Reporting',
              9: 'Advanced', 10: 'Review'
            };
            return (
              <div key={step} className={`p-3 rounded ${disabled ? 'text-gray-400 cursor-not-allowed' : step === currentStep ? 'bg-blue-50 border-l-4 border-blue-600 font-medium cursor-pointer' : completedSteps.has(step) ? 'text-green-600 hover:bg-gray-50 cursor-pointer' : 'text-gray-400'}`} onClick={() => !disabled && goToStep(step)}>
                Step {step}: {labels[step]}
              </div>
            );
          })}
        </div>
        <div className="md:w-3/4">{renderStep()}</div>
      </div>

      <div className="flex justify-between mt-8 pt-4 border-t">
        <button onClick={prevStep} disabled={currentStep === 1 || isSaving} className="px-4 py-2 border rounded disabled:opacity-50">← Back</button>
        <div className="flex gap-3">
          <button onClick={saveDraft} disabled={isSaving} className="px-4 py-2 border rounded bg-yellow-50 disabled:opacity-50">Save Draft</button>
          {currentStep < totalSteps ? <button onClick={nextStep} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 flex items-center gap-2">{isSaving ? (<><span className="inline-block animate-spin">⏳</span>Saving...</>) : ('Next →')}</button> : <button onClick={createLeague} disabled={isSaving} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">Create League</button>}
        </div>
      </div>

      <ConfirmationModal isOpen={showModal} onConfirm={confirmCreate} onCancel={() => setShowModal(false)} isCreating={isSaving} />
    </div>
  );
};

export default LeagueManagement;