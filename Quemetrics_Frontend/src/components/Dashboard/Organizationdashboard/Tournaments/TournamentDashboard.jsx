import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FaHome,
  FaUsers,
  FaGamepad,
  FaList,
  FaTrophy,
  FaCog,
  FaChevronDown,
  FaCheck,
  FaTimes,
} from 'react-icons/fa';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTournament } from './useTournament';
import apiClient from '../../../../contexts/apiClient';
import TournamentStatusFlow from './TournamentStatusFlow';
import PlayerManagementTab from './PlayerManagementTab';
import AddPlayerForm from './AddPlayerForm';
import RegistrationLockModal from './RegistrationLockModal';
import SnookerFrameResultForm from './SnookerFrameResultForm';
import MatchDisputeHandler from './MatchDisputeHandler';
import TournamentCompletionModal from './TournamentCompletionModal';
import LiveTournamentProgressionView from './LiveTournamentProgressionView';
import RescheduleMatchModal from './RescheduleMatchModal';
import LateEntryStrategySelector from './LateEntryStrategySelector';
import SeedingDisplay from '../../../Tournament/SeedingDisplay';

function resolveTournamentFormatType(tournament) {
  if (!tournament) return null;
  const f = tournament.format;
  if (f && typeof f === 'object' && f.type != null) return String(f.type).toLowerCase();
  if (typeof f === 'string') return f.toLowerCase();
  return null;
}

/** Knockout/RR synthetic rows from API when includeByes=true; real Swiss byes are DB rows. */
function withoutSyntheticByeMatches(matches) {
  if (!Array.isArray(matches)) return [];
  return matches.filter((m) => !m.isSyntheticBye);
}

/** Matches tab lists only head-to-head fixtures; byes are hidden (still visible elsewhere / in scoring). */
function isByeRowHiddenFromMatchesTab(match) {
  if (!match) return false;
  if (match.isSyntheticBye) return true;
  if (match.bye === true || match.isBye === true) return true;
  if (String(match.status || '').toLowerCase() === 'bye') return true;
  if (match.player2Id == null && match.player1Id != null) return true;
  return false;
}

/**
 * Tournament Dashboard - manage tournament details, participants, brackets, matches, standings
 * Integrates complete tournament lifecycle from creation through archival
 */
export default function TournamentDashboard({ tournament, onClose, onTournamentUpdated, initialTab = 'overview', hideCloseButton = false }) {
  const {
    getParticipants,
    getTournamentById,
    getTournamentMatches,
    getTournamentStandings,
    approveParticipant,
    rejectParticipant,
    removeParticipant,
    generateBracket,
    closeRegistration,
    generateJoinCode,
    registerForTournament,
    createInvitations,
    submitMatchResult,
    updateTournament,
    completeTournament,
    overrideMatchResult,
    exportParticipantsAsPDF,
    autoForfeitOverdue,
    generateNextRound,
  } = useTournament();


  const [activeTab, setActiveTab] = useState(initialTab);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [groupStageView, setGroupStageView] = useState(null);
  const [standings, setStandings] = useState([]);
  const [openRegistrations, setOpenRegistrations] = useState([]);
  const [deadlineRequests, setDeadlineRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [existingJoinCodes, setExistingJoinCodes] = useState([]);

  // Modal states
  const [showAddPlayerForm, setShowAddPlayerForm] = useState(false);
  const [addPlayerModalMode, setAddPlayerModalMode] = useState(null); // 'manual' | 'invite_link' | 'join_code'
  const [showRegistrationLock, setShowRegistrationLock] = useState(false);
  const [showMatchResult, setShowMatchResult] = useState(false);
  const [showDisputeHandler, setShowDisputeHandler] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showLateEntrySelector, setShowLateEntrySelector] = useState(false);
  const [showApplyDeadlineModal, setShowApplyDeadlineModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [selectedDeadlineRequest, setSelectedDeadlineRequest] = useState(null);
  const [forfeiting, setForfeiting] = useState(false);
  const [generatingBracket, setGeneratingBracket] = useState(false);
  const [progressingRound, setProgressingRound] = useState(false);
  const [applyingDeadlineRequestId, setApplyingDeadlineRequestId] = useState(null);

  const approvedParticipantsForLock = (participants || [])
    .filter((p) => p.status === 'approved')
    .map((p) => ({
      id: p.id,
      playerName: p.player?.name || p.playerName || p.player?.displayName || 'Player',
      seed: p.seed ?? p.seedingPosition ?? null,
    }));

  const hasMatchDeadlineDate = Boolean(tournament?.matchDeadlineDate);


  const tabs = [
    { id: 'overview', label: 'Overview', icon: <FaHome /> },
    { id: 'participants', label: 'Participants', icon: <FaUsers /> },
    ...(tournament.status === 'registration' && tournament.allowsOpenRegistration ? [{ id: 'open-registrations', label: 'Open Requests', icon: <FaUsers /> }] : []),
    ...(!['draft', 'registration'].includes(tournament.status) && tournament.status !== 'in_progress' ? [{ id: 'bracket', label: 'Bracket', icon: <FaGamepad /> }] : []),
    ...(tournament.status === 'in_progress' ? [{ id: 'seeding', label: 'Seeding', icon: <FaUsers /> }] : []),
    ...(['fixtures_generated'].includes(tournament.status) ? [{ id: 'matches', label: 'Matches', icon: <FaList /> }] : []),
    ...(['fixtures_generated'].includes(tournament.status) && hasMatchDeadlineDate ? [{ id: 'deadlines', label: 'Deadlines', icon: <FaList /> }] : []),
    ...(!['draft', 'registration', 'in_progress'].includes(tournament.status) ? [{ id: 'standings', label: 'Standings', icon: <FaTrophy /> }] : []),
    { id: 'settings', label: 'Settings', icon: <FaCog /> },
  ];

  const loadTabData = useCallback(async (tab) => {
    // Always request bye/rest rows; TabMatches & stats filter what to show per format.
    const matchParams = { includeByes: true };
    const showGlobalLoading = tab !== 'matches';
    if (showGlobalLoading) setLoading(true);
    try {
      switch (tab) {
        case 'participants': {
          const [parts, mtRes] = await Promise.all([
            getParticipants(tournament.id),
            getTournamentMatches(tournament.id, matchParams).catch(() => ({
              matches: [],
              groupStageView: null,
            })),
          ]);
          setParticipants(parts);
          setMatches(mtRes.matches || []);
          if (mtRes.groupStageView !== undefined) setGroupStageView(mtRes.groupStageView);
          break;
        }
        case 'open-registrations': {
          try {
            const response = await apiClient.get(`/tournaments/${tournament.id}/open-requests`);
            setOpenRegistrations(response.data.data || []);
          } catch (err) {
            console.error('Error loading open registrations:', err);
            setOpenRegistrations([]);
          }
          break;
        }
        case 'bracket': {
          const [mtRes, parts] = await Promise.all([
            getTournamentMatches(tournament.id, matchParams),
            getParticipants(tournament.id),
          ]);
          setMatches(mtRes.matches);
          setGroupStageView(mtRes.groupStageView);
          setParticipants(parts);
          break;
        }
        case 'seeding': {
          const [mtRes, parts] = await Promise.all([
            getTournamentMatches(tournament.id, matchParams),
            getParticipants(tournament.id),
          ]);
          setMatches(mtRes.matches);
          setParticipants(parts);
          break;
        }
        case 'matches': {
          const [mtRes, parts] = await Promise.all([
            getTournamentMatches(tournament.id, matchParams),
            getParticipants(tournament.id),
          ]);
          setMatches(mtRes.matches);
          setGroupStageView(mtRes.groupStageView);
          setParticipants(parts);
          break;
        }
        case 'standings': {
          const std = await getTournamentStandings(tournament.id);
          setStandings(std);
          break;
        }
        case 'deadlines': {
          const response = await apiClient.get(`/tournaments/${tournament.id}/deadline-requests`);
          setDeadlineRequests(Array.isArray(response?.data?.data) ? response.data.data : []);
          break;
        }
      }
    } catch (err) {
      console.error('Error loading tab data:', err);
    } finally {
      if (showGlobalLoading) setLoading(false);
    }
  }, [getParticipants, getTournamentMatches, getTournamentStandings, tournament.id]);

  // Keep latest callback without making the fetch effect re-run every parent render.
  const onTournamentUpdatedRef = useRef(onTournamentUpdated);
  useEffect(() => {
    onTournamentUpdatedRef.current = onTournamentUpdated;
  }, [onTournamentUpdated]);

  // Fetch tournament detail once per selected tournament id (not on every render).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await getTournamentById(tournament.id);
        if (!cancelled && fresh) onTournamentUpdatedRef.current?.(fresh);
      } catch (e) {
        console.warn('[TournamentDashboard] Could not refresh tournament detail:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournament.id, getTournamentById]);

  /** Keep standings in sync when roster changes (add / approve / remove players). */
  const refreshStandingsFromServer = useCallback(async () => {
    try {
      const std = await getTournamentStandings(tournament.id);
      setStandings(Array.isArray(std) ? std : []);
    } catch (e) {
      console.warn("[TournamentDashboard] Could not refresh standings:", e);
    }
  }, [getTournamentStandings, tournament.id]);

  useEffect(() => {
    if (activeTab === 'deadlines' && !hasMatchDeadlineDate) {
      setActiveTab('overview');
      return;
    }
    loadTabData(activeTab);
  }, [activeTab, tournament.id, loadTabData, hasMatchDeadlineDate]);

  // Load participants when registration lock modal opens
  useEffect(() => {
    const loadParticipantsForModal = async () => {
      if (showRegistrationLock) {
        try {
          setLoading(true);
          const parts = await getParticipants(tournament.id);
          setParticipants(parts);
        } catch (err) {
          console.error('Error loading participants for lock modal:', err);
        } finally {
          setLoading(false);
        }
      }
    };

    loadParticipantsForModal();
  }, [showRegistrationLock, tournament.id, getParticipants]);

  // Fetch available players when modal opens
  useEffect(() => {
    const fetchPlayers = async () => {
      if (showAddPlayerForm) {
        setLoadingPlayers(true);
        try {
          const response = await apiClient.get(
            `/organizations/${tournament.organizationId}/players`,
            { params: { tournamentId: tournament.id } }
          );
          // axios returns response.data as the full response object: { success, data: [...], message }
          const allPlayers = response.data?.data || response.data || [];

          console.log('[Tournament] API Response:', response);
          console.log('[Tournament] All players from API:', allPlayers.length);
          console.log('[Tournament] Current participants:', participants.length);

          // Filter out players already in the tournament
          // Try multiple possible field names for player ID
          const participantPlayerIds = new Set();
          participants.forEach((p) => {
            if (p.playerId) participantPlayerIds.add(p.playerId);
            if (p.player?.id) participantPlayerIds.add(p.player.id);
            if (p.id) participantPlayerIds.add(p.id);
          });

          // Show all players except those already in the tournament
          const filteredPlayers = allPlayers.filter(
            (player) => !participantPlayerIds.has(player.id)
          );

          // Map the data to the format expected by AddPlayerForm
          const formattedPlayers = filteredPlayers.map((player) => ({
            id: player.id,
            name: player.name || 'Unknown',
            email: player.user?.email || 'N/A',
          }));

          console.log('[Tournament] Filtered available players:', formattedPlayers.length);
          console.log('[Tournament] Sample player:', formattedPlayers[0]);

          setAvailablePlayers(formattedPlayers);
        } catch (error) {
          console.error('[Tournament] Error fetching players:', error);
          setAvailablePlayers([]);
        } finally {
          setLoadingPlayers(false);
        }
      }
    };

    fetchPlayers();
  }, [showAddPlayerForm, participants]);

  // Set existing join codes from tournament data
  useEffect(() => {
    if (tournament?.activeJoinCodes && Array.isArray(tournament.activeJoinCodes)) {
      setExistingJoinCodes(tournament.activeJoinCodes);
    }
  }, [tournament?.activeJoinCodes]);

  // Player Management Handlers
  const handleAddPlayers = async (playerIds) => {
    setLoading(true);
    console.log(`[TournamentDashboard] Starting handleAddPlayers with playerIds:`, playerIds);
    console.log(`[TournamentDashboard] Tournament ID: ${tournament.id}`);

    try {
      // Register selected players directly as participants (admin/manual add)
      // Use the register endpoint which will create TournamentParticipant rows.
      const registerPromises = playerIds.map((pid) => {
        console.log(`[TournamentDashboard] Registering player ${pid} to tournament ${tournament.id}`);
        return registerForTournament(tournament.id, { playerId: pid, registrationMethod: 'admin' })
          .then(result => {
            console.log(`[TournamentDashboard] Successfully registered player ${pid}:`, result);
            return result;
          })
          .catch(err => {
            console.error(`[TournamentDashboard] Failed to register player ${pid}:`, err);
            throw err;
          });
      });

      const results = await Promise.all(registerPromises);
      console.log(`[TournamentDashboard] All players registered successfully`);

      // Reload participants
      const updatedParticipants = await getParticipants(tournament.id);
      setParticipants(updatedParticipants);
      await refreshStandingsFromServer();
      console.log(`[TournamentDashboard] Updated participants count: ${updatedParticipants.length}`);

      alert(`✓ Successfully added ${playerIds.length} player(s) to tournament!`);
      setShowAddPlayerForm(false);
    } catch (err) {
      console.error(`[TournamentDashboard] Error in handleAddPlayers:`, err);
      alert(`✗ Error adding players: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveParticipant = async (participantId) => {
    try {
      await approveParticipant(tournament.id, participantId, true);
      loadTabData('participants');
      await refreshStandingsFromServer();
    } catch (err) {
      alert('Error approving participant: ' + err.message);
    }
  };

  const handleRejectParticipant = async (participantId) => {
    try {
      await rejectParticipant?.(tournament.id, participantId);
      loadTabData('participants');
      await refreshStandingsFromServer();
    } catch (err) {
      alert('Error rejecting participant: ' + err.message);
    }
  };

  const handleRemoveParticipant = async (participantId) => {
    try {
      const data = await removeParticipant?.(participantId);
      // Always refresh participants and matches after removal
      await Promise.all([
        loadTabData('participants'),
        loadTabData('matches'),
      ]);

      // If bracket was regenerated, also refresh bracket view
      if (data?.bracketRegeneration?.regenerated) {
        await loadTabData('bracket');
        try {
          const fresh = await getTournamentById(tournament.id);
          onTournamentUpdated?.(fresh);
        } catch (e) {
          console.warn('[TournamentDashboard] Could not refresh tournament after fixture regen:', e);
        }
      }

      await refreshStandingsFromServer();
    } catch (err) {
      alert('Error removing participant: ' + err.message);
    }
  };

  // Manual Fixture Generation (when registration locked but no fixtures)
  const handleManualGenerateFixtures = async () => {
    try {
      setGeneratingBracket(true);
      const seedingMethod = tournament?.format?.seeding || 'random';
      await generateBracket(tournament.id, { seedingMethod });

      alert('Fixtures generated successfully!');
      await Promise.all([
        loadTabData('matches'),
        loadTabData('bracket'),
        loadTabData('standings'),
      ]);
      try {
        const fresh = await getTournamentById(tournament.id);
        onTournamentUpdated?.(fresh);
      } catch (e) {
        console.warn('Could not refresh tournament:', e);
      }
    } catch (err) {
      alert('Error generating fixtures: ' + err.message);
      console.error('Fixture generation error:', err);
    } finally {
      setGeneratingBracket(false);
    }
  };

  // Registration Lock & Fixture Generation
  const handleLockRegistration = async (seedingMethod, manualSeeds) => {
    try {
      setGeneratingBracket(true);
      if (tournament.status === 'registration') {
        await closeRegistration(tournament.id, { skipFixtureGeneration: true });
      }
      const body =
        seedingMethod === 'manual' && Array.isArray(manualSeeds) && manualSeeds.length > 0
          ? { seedingMethod, manualSeeds }
          : { seedingMethod };
      await generateBracket(tournament.id, body);

      alert('Fixtures generated successfully! Tournament is now in progress.');
      setShowRegistrationLock(false);
      try {
        const fresh = await getTournamentById(tournament.id);
        onTournamentUpdated?.(fresh);
      } catch (e) {
        console.warn('Could not refresh tournament after bracket generation:', e);
      }
      await loadTabData('bracket');
      await loadTabData('participants');
      await refreshStandingsFromServer();
    } catch (err) {
      alert('Error generating bracket: ' + err.message);
      console.error('Bracket generation error:', err);
    } finally {
      setGeneratingBracket(false);
    }
  };

  // Match Result Submission
  const handleSubmitMatchResult = async (resultData) => {
    try {
      setLoading(true);
      await submitMatchResult(tournament.id, resultData);
      loadTabData('matches');
      loadTabData('standings');
      setShowMatchResult(false);
      setSelectedMatch(null);
      alert('Match result submitted successfully!');
    } catch (err) {
      alert('Error submitting result: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Dispute Handler
  const handleOpenDispute = (match) => {
    setSelectedDispute(match);
    setShowDisputeHandler(true);
  };

  const handleOverrideResult = async (overrideData) => {
    try {
      setLoading(true);
      await overrideMatchResult(tournament.id, overrideData.matchId, overrideData);
      loadTabData('matches');
      loadTabData('standings');
      setShowDisputeHandler(false);
      setSelectedDispute(null);
      alert('Result overridden successfully!');
    } catch (err) {
      console.error('Failed to override result:', err);
      alert('Failed to override result: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Reschedule Handler
  const handleRescheduleMatch = async (rescheduleData) => {
    try {
      setLoading(true);
      // Call backend to reschedule match
      const response = await apiClient.put(
        `/tournaments/${tournament.id}/matches/${rescheduleData.matchId}/reschedule`,
        rescheduleData
      );

      loadTabData('matches');
      loadTabData('bracket');
      setShowRescheduleModal(false);
      setSelectedMatch(null);
      alert('Match rescheduled successfully!');
    } catch (err) {
      console.error('Failed to reschedule match:', err);
      alert('Failed to reschedule match: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyDeadlineRequest = async (request) => {
    setSelectedDeadlineRequest(request);
    setShowApplyDeadlineModal(true);
  };

  const handleConfirmApplyDeadlineRequest = async (request, deadlineDate) => {
    try {
      setApplyingDeadlineRequestId(request.id);
      await apiClient.post(`/tournaments/${tournament.id}/deadline-requests/${request.id}/apply`, {
        deadlineDate,
      });
      await Promise.all([
        loadTabData('deadlines'),
        loadTabData('matches'),
      ]);
      const fresh = await getTournamentById(tournament.id);
      if (fresh) onTournamentUpdated?.(fresh);
      alert('Deadline updated successfully.');
    } catch (err) {
      console.error('Failed to apply deadline request:', err);
      alert('Failed to apply request: ' + (err?.response?.data?.error || err?.message || 'Unknown error'));
    } finally {
      setApplyingDeadlineRequestId(null);
      setShowApplyDeadlineModal(false);
      setSelectedDeadlineRequest(null);
    }
  };

  // Auto-forfeit overdue matches
  const handleAutoForfeit = async () => {
    const overdueCount = matches.filter(
      (m) => m.status === 'scheduled' && m.scheduledDeadline && new Date(m.scheduledDeadline) < new Date()
    ).length;
    if (!window.confirm(`Auto-forfeit ${overdueCount} overdue match(es)? This cannot be undone.`)) return;
    setForfeiting(true);
    const result = await autoForfeitOverdue(tournament.id);
    setForfeiting(false);
    if (result.success) {
      alert(`${result.data?.forfeitedCount || 0} match(es) auto-forfeited.`);
      loadTabData(activeTab);
    } else {
      alert('Failed: ' + result.error);
    }
  };

  // Tournament Completion
  const handleCompleteTournament = async () => {
    try {
      setLoading(true);
      await completeTournament(tournament.id);
      alert('Tournament completed and archived!');
      onClose();
    } catch (err) {
      alert('Error completing tournament: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNextRound = async (opts = {}) => {
    try {
      setProgressingRound(true);
      const response = await generateNextRound(tournament.id, opts);
      await Promise.all([
        loadTabData('matches'),
        loadTabData('bracket'),
        loadTabData('standings'),
      ]);
      try {
        const fresh = await getTournamentById(tournament.id);
        onTournamentUpdated?.(fresh);
      } catch (e) {
        console.warn('Could not refresh tournament after next-round generation:', e);
      }
      alert(response?.message || 'Next round progressed successfully');
    } catch (err) {
      alert('Error generating next round: ' + (err?.message || err));
    } finally {
      setProgressingRound(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 relative w-full max-w-7xl mx-auto" onClick={(e) => e.stopPropagation()}>
      {/* Close Button - Hidden when hideCloseButton is true */}
      {!hideCloseButton && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-white text-gray-600 rounded-xl shadow-md hover:bg-gray-100 hover:text-gray-900 transition-all duration-200 flex items-center justify-center z-50 border border-gray-100 active:scale-95"
          title="Close"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" aria-hidden />
        </button>
      )}

      {/* Tournament Status Flow - Main Component */}
      <TournamentStatusFlow
        tournament={{
          ...tournament,
          pendingParticipantsCount: participants.filter((p) => p.status === 'pending').length,
          approvedParticipants: participants.filter((p) => p.status === 'approved').length,
          completedMatches: Number(tournament.completedMatches) || 0,
          totalMatches: Number(tournament.totalMatches) || 0,
        }}
        onStatusChange={(action) => {
          console.log('TournamentDashboard received action:', action); // Debug log

          // Handle action buttons from status flow
          switch (action) {
            case 'start_registration':
              setLoading(true);
              updateTournament(tournament.id, { status: 'registration' })
                .then((updated) => {
                  alert('Tournament moved to Registration phase!');
                  onTournamentUpdated?.(updated);
                  setLoading(false);
                })
                .catch((err) => {
                  alert('Error: ' + (err?.message || 'Failed to start registration'));
                  console.error('Start registration error:', err);
                  setLoading(false);
                });
              break;
            case 'edit_settings':
              // Switch to settings tab
              console.log('Switching to settings tab');
              setActiveTab('settings');
              break;
            case 'add_players':
              // Open manual add player modal
              setAddPlayerModalMode('manual');
              setShowAddPlayerForm(true);
              break;
            case 'invite_players':
              // Open invite players modal
              setAddPlayerModalMode('invite_link');
              setShowAddPlayerForm(true);
              break;
            case 'generate_join_code':
              // Open join code modal
              setAddPlayerModalMode('join_code');
              setShowAddPlayerForm(true);
              break;
            case 'record_match':
              // Switch to matches tab
              setActiveTab('matches');
              break;
            case 'handle_dispute':
              // Switch to matches tab (disputes shown there)
              setActiveTab('matches');
              break;
            case 'reschedule_match':
              // Switch to matches tab
              setActiveTab('matches');
              break;
            case 'view_bracket':
              setActiveTab('bracket');
              break;
            case 'start_tournament':
              setLoading(true);
              updateTournament(tournament.id, { status: 'in_progress' })
                .then((updated) => {
                  alert('Tournament started!');
                  onTournamentUpdated?.(updated);
                  setLoading(false);
                })
                .catch((err) => {
                  alert('Error: ' + (err?.message || 'Failed to start tournament'));
                  setLoading(false);
                });
              break;
            default:
              console.log('Unknown action:', action);
          }
        }}
        onLockRegistration={() => setShowRegistrationLock(true)}
        onGenerateFixtures={() => setShowRegistrationLock(true)}
        onCompleteTournament={() => setShowCompletionModal(true)}
        onAddLatePlayer={() => setShowLateEntrySelector(true)}
      />

      {/* Tab Navigation */}
      <div className="flex gap-2 sm:gap-3 mb-8 border-b border-gray-100 overflow-x-auto pb-4 scrollbar-hide px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-full transition-all duration-300 shadow-sm active:scale-95 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-blue-500/30'
                : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-100 hover:shadow-md'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-96">
        {loading && activeTab !== 'matches' && (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        )}

        {activeTab === 'overview' && (
          <TabOverview
            tournament={tournament}
            participants={participants}
            matches={matches}
            onAutoForfeit={handleAutoForfeit}
            forfeiting={forfeiting}
          />
        )}

        {activeTab === 'participants' && (
          <PlayerManagementTab
            tournament={tournament}
            participants={participants}
            matches={matches}
            loading={loading}
            existingJoinCodes={existingJoinCodes}
            onAddPlayers={() => { setAddPlayerModalMode('manual'); setShowAddPlayerForm(true); }}
            onInvitePlayers={() => { setAddPlayerModalMode('invite_link'); setShowAddPlayerForm(true); }}
            onGenerateJoinCode={() => { setAddPlayerModalMode('join_code'); setShowAddPlayerForm(true); }}
            onApproveParticipant={handleApproveParticipant}
            onRejectParticipant={handleRejectParticipant}
            onRemoveParticipant={handleRemoveParticipant}
            onLockRegistration={() => setShowRegistrationLock(true)}
            onExportParticipants={exportParticipantsAsPDF}
            onAddLatePlayer={() => setShowLateEntrySelector(true)}
          />
        )}

        {activeTab === 'open-registrations' && (
          <TabOpenRegistrations
            tournament={tournament}
            registrations={openRegistrations}
            loading={loading}
            onRefresh={() => loadTabData('open-registrations')}
            onApprove={handleApproveParticipant}
            onReject={handleRejectParticipant}
          />
        )}

        {activeTab === 'bracket' && (
          <TabBracket
            tournament={tournament}
            participants={participants}
            matches={matches}
            groupStageView={groupStageView}
            onRecordResult={(match) => {
              setSelectedMatch(match);
              setShowMatchResult(true);
            }}
            onDisputeMatch={handleOpenDispute}
          />
        )}

        {activeTab === 'seeding' && (
          <div className="space-y-6">
            <SeedingDisplay
              tournament={tournament}
              participants={participants}
              rankingSource={tournament.format?.rankingSource || tournament.formatConfig?.rankingSource || 'global'}
            />
          </div>
        )}

        {activeTab === 'matches' && (
          <>
            <SeedingDisplay
              tournament={tournament}
              participants={participants}
              rankingSource={tournament.format?.rankingSource || tournament.formatConfig?.rankingSource || 'global'}
            />
            <TabMatches
              matches={matches}
              tournament={tournament}
              participants={participants}
              groupStageView={groupStageView}
              onGenerateNextRound={handleGenerateNextRound}
              progressingRound={progressingRound}
              onRecordResult={(match) => {
                setSelectedMatch(match);
                setShowMatchResult(true);
              }}
              onDisputeMatch={handleOpenDispute}
              onReschedule={(match) => {
                setSelectedMatch(match);
                setShowRescheduleModal(true);
              }}
              onOverride={(match) => {
                setSelectedDispute(match);
                setShowDisputeHandler(true);
              }}
              onGenerateFixtures={handleManualGenerateFixtures}
              generatingBracket={generatingBracket}
            />
          </>
        )}

        {activeTab === 'standings' && (
          <TabStandings standings={standings} tournament={tournament} />
        )}

        {activeTab === 'deadlines' && (
          <TabDeadlineRequests
            requests={deadlineRequests}
            loading={loading}
            applyingRequestId={applyingDeadlineRequestId}
            onApply={handleApplyDeadlineRequest}
          />
        )}

        {activeTab === 'settings' && (
          <TabSettings tournament={tournament} updateTournament={updateTournament} onTournamentUpdated={onTournamentUpdated} />
        )}
      </div>

      {/* Modals */}
      {showAddPlayerForm && (
        <AddPlayerForm
          tournament={tournament}
          onClose={() => {
            setShowAddPlayerForm(false);
            setAddPlayerModalMode(null);
            // Refresh join codes after modal closes
            if (tournament?.activeJoinCodes?.length > 0) {
              setExistingJoinCodes(tournament.activeJoinCodes);
            }
          }}
          onAddManual={handleAddPlayers}
          onGenerateInviteLink={(emails) => createInvitations(tournament.id, { inviteEmails: emails })}
          onGenerateJoinCode={async (config) => {
            const result = await generateJoinCode(tournament.id, config);
            // After generating join code, fetch updated tournament data to show all active codes
            try {
              const updatedTournament = await getTournamentById(tournament.id);
              if (updatedTournament?.activeJoinCodes && Array.isArray(updatedTournament.activeJoinCodes)) {
                setExistingJoinCodes(updatedTournament.activeJoinCodes);
              } else if (result) {
                // Fallback: use the returned code if full tournament fetch fails
                setExistingJoinCodes([result]);
              }
            } catch (error) {
              console.error('Failed to fetch updated tournament data:', error);
              // Fallback: at least show the newly generated code
              if (result) {
                setExistingJoinCodes([result]);
              }
            }
            return result;
          }}
          availablePlayers={availablePlayers}
          loadingPlayers={loadingPlayers}
          mode={addPlayerModalMode}
        />
      )}

      {showRegistrationLock && (
        <RegistrationLockModal
          tournament={tournament}
          participantCount={participants.filter((p) => p.status === 'approved').length}
          approvedParticipants={approvedParticipantsForLock}
          onConfirm={handleLockRegistration}
          onCancel={() => setShowRegistrationLock(false)}
          loading={loading && !generatingBracket}
          isGeneratingBracket={generatingBracket}
        />
      )}

      {showMatchResult && selectedMatch && (
        <SnookerFrameResultForm
          match={selectedMatch}
          tournament={tournament}
          currentPlayer="You"
          opponentName={selectedMatch.opposingPlayerName}
          onSubmit={handleSubmitMatchResult}
          onClose={() => {
            setShowMatchResult(false);
            setSelectedMatch(null);
          }}
          loading={loading}
        />
      )}

      {showDisputeHandler && selectedDispute && (
        <MatchDisputeHandler
          match={selectedDispute}
          disputeDetails={selectedDispute.disputeDetails}
          onResolveDispute={() => {}}
          onOverride={handleOverrideResult}
          onCancel={() => {
            setShowDisputeHandler(false);
            setSelectedDispute(null);
          }}
          loading={loading}
          isAdmin={true}
        />
      )}

      {showRescheduleModal && selectedMatch && (
        <RescheduleMatchModal
          match={selectedMatch}
          tournament={tournament}
          onReschedule={handleRescheduleMatch}
          onCancel={() => {
            setShowRescheduleModal(false);
            setSelectedMatch(null);
          }}
          loading={loading}
        />
      )}

      {showCompletionModal && (
        <TournamentCompletionModal
          tournament={tournament}
          standings={standings}
          matchStats={{ totalMatches: matches.length }}
          onComplete={handleCompleteTournament}
          onCancel={() => setShowCompletionModal(false)}
          loading={loading}
        />
      )}

      {showLateEntrySelector && (
        <LateEntryStrategySelector
          isOpen={showLateEntrySelector}
          onClose={() => setShowLateEntrySelector(false)}
          tournament={tournament}
          onSuccess={() => {
            loadTabData('participants');
            void loadTabData('matches');
            void loadTabData('bracket');
            void refreshStandingsFromServer();
          }}
        />
      )}

      {showApplyDeadlineModal && selectedDeadlineRequest && (
        <ApplyDeadlineFromVenueModal
          tournament={tournament}
          request={selectedDeadlineRequest}
          loading={applyingDeadlineRequestId === selectedDeadlineRequest.id}
          onCancel={() => {
            if (applyingDeadlineRequestId === selectedDeadlineRequest.id) return;
            setShowApplyDeadlineModal(false);
            setSelectedDeadlineRequest(null);
          }}
          onConfirm={(deadlineDate) => handleConfirmApplyDeadlineRequest(selectedDeadlineRequest, deadlineDate)}
        />
      )}
    </div>
  );
}

// Tab Components

function TabOverview({ tournament, participants, matches, onAutoForfeit, forfeiting }) {
  const overdueCount = matches.filter(
    (m) => m.status === 'scheduled' && m.scheduledDeadline && new Date(m.scheduledDeadline) < new Date()
  ).length;
  const showAutoForfeitBtn =
    tournament.autoForfeitOverdue &&
    ['in_progress', 'fixtures_generated'].includes(tournament.status) &&
    overdueCount > 0;

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-gray-900">Tournament Overview</h3>

      {showAutoForfeitBtn && (
        <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              {overdueCount} overdue match{overdueCount !== 1 ? 'es' : ''} past deadline
            </p>
            <p className="text-xs text-red-600 mt-0.5">These matches can be auto-forfeited.</p>
          </div>
          <button
            onClick={onAutoForfeit}
            disabled={forfeiting}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {forfeiting ? 'Processing…' : 'Auto-forfeit Overdue'}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-600 mb-2">Tournament</h4>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-semibold text-gray-700">Name:</dt>
              <dd className="text-gray-900">{tournament.name}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">Sport:</dt>
              <dd className="text-gray-900">{tournament.sport}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-700">Format:</dt>
              <dd className="text-gray-900">{tournament.format?.type || 'N/A'}</dd>
            </div>
          </dl>
        </div>

        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-600 mb-2">Dates</h4>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-semibold text-gray-700">Start:</dt>
              <dd className="text-gray-900">{new Date(tournament.startDate).toLocaleDateString()}</dd>
            </div>
            {tournament.registrationDeadline && (
              <div>
                <dt className="font-semibold text-gray-700">Registration Closes:</dt>
                <dd className="text-gray-900">{new Date(tournament.registrationDeadline).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-700 mb-2">Participants</h4>
          <p className="text-3xl font-bold text-blue-900">{participants.filter((p) => p.status === 'approved').length}</p>
          <p className="text-xs text-blue-700 mt-1">
            {participants.filter((p) => p.status === 'pending').length} pending approval
          </p>
        </div>

        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 className="text-sm font-semibold text-purple-700 mb-2">Matches</h4>
          <p className="text-3xl font-bold text-purple-900">
            {(() => {
              // Only count playable matches (exclude bye matches where player2Id is null)
              const playableMatches = withoutSyntheticByeMatches(matches)
                .filter((m) => m.player2Id != null);
              const completedCount = playableMatches.filter((m) => m.status === 'completed').length;
              return `${completedCount}/${playableMatches.length}`;
            })()}
          </p>
          <p className="text-xs text-purple-700 mt-1">completed</p>
        </div>
      </div>
    </div>
  );
}

function TabBracket({ tournament, participants, matches, groupStageView, onRecordResult, onDisputeMatch }) {
  // Ensure tournament object has participants for SwissStandingsTable
  const tournamentWithParticipants = {
    ...tournament,
    participants: participants || []
  };

  return (
    <LiveTournamentProgressionView
      matches={matches}
      tournament={tournamentWithParticipants}
      groupStageView={groupStageView}
      onRecordResult={onRecordResult}
      onDisputeMatch={onDisputeMatch}
    />
  );
}

function TabMatches({
  matches,
  tournament,
  participants,
  groupStageView,
  onGenerateNextRound,
  progressingRound,
  onRecordResult,
  onDisputeMatch,
  onReschedule,
  onOverride,
  onGenerateFixtures,
  generatingBracket,
}) {
  const formatFixtureDate = (bookingValue = null) => {
    const effectiveValue = bookingValue;
    if (!effectiveValue) return '-';
    const parsed = new Date(effectiveValue);
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
  };

  const getPlayerName = (player) => {
    if (!player) return 'Unknown';
    return player.name || player.nickname || 'Unknown';
  };

  const formatTypeResolved = resolveTournamentFormatType(tournament);
  const formatType = formatTypeResolved;
  /** Swiss if format says so, any swiss round row exists, or a real (non-knockout-synthetic) bye row is present. */
  const isSwiss =
    formatTypeResolved === 'swiss' ||
    matches.some((m) => {
      if (m?.isSyntheticBye) return false;
      const rt = String(m?.roundType || '').toLowerCase();
      if (rt === 'swiss') return true;
      if (
        m?.player2Id == null &&
        m?.isBye === true &&
        m?.isKnockoutStyleBye !== true
      ) {
        return true;
      }
      return false;
    });

  const isSwissByeMatch = (match) => {
    if (!isSwiss || !match) return false;
    if (match.bye === true || match.isBye === true) return true;
    if (String(match.status || '').toLowerCase() === 'bye') return true;
    if (match.player2Id == null) return true;
    const oppName = match.player2?.name || match.player2Name;
    if (typeof oppName === 'string' && oppName.trim().toUpperCase() === 'BYE') return true;
    return false;
  };

  const renderOpponentDisplay = (match) => {
    // Check if this is a bye match
    const isByeMatch = match.status === 'bye' ||
                       match.isBye === true ||
                       match.bye === true ||
                       match.player2Id == null ||
                       (typeof match.player2?.name === 'string' && match.player2.name.toUpperCase() === 'BYE');

    if (isByeMatch) {
      return (
        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-900 ring-1 ring-inset ring-amber-200/80">
          BYE
        </span>
      );
    }
    return <span className="font-medium text-gray-900">{getPlayerName(match?.player2)}</span>;
  };

  const renderSwissOpponentLine = (match) => {
    if (isSwissByeMatch(match)) {
      return (
        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-900 ring-1 ring-inset ring-amber-200/80">
          BYE
        </span>
      );
    }
    return <span className="font-medium text-gray-900">{getPlayerName(match?.player2)}</span>;
  };

  const getResultDisplay = (match) => {
    if (match.status === 'completed' && match.player1FramesWon !== null && match.player2FramesWon !== null) {
      return `${match.player1FramesWon} - ${match.player2FramesWon}`;
    }
    return '—';
  };

  const matchActionCells = (match) => {
    // Check if this is a bye match (for any format: Swiss, Knockout, etc)
    const isByeMatch = match.status === 'bye' ||
                       match.isBye === true ||
                       match.bye === true ||
                       match.player2Id == null ||
                       (typeof match.player2?.name === 'string' && match.player2.name.toUpperCase() === 'BYE');

    if (isByeMatch || isSwissByeMatch(match)) {
      return (
        <td className="px-6 py-4 text-sm text-gray-500 align-middle" title="Bye — no actions">
          —
        </td>
      );
    }
    return (
    <td className="px-6 py-4 flex flex-wrap gap-2">
      {(match.status === 'scheduled' || match.status === 'in_progress') && (
        <button
          type="button"
          onClick={() => onRecordResult(match)}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition font-medium"
          title="Record match result"
        >
          Record
        </button>
      )}
      {match.status === 'completed' && !match.isDisputed && (
        <button
          type="button"
          onClick={() => onDisputeMatch(match)}
          className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition font-medium"
          title="Dispute this result"
        >
          Dispute
        </button>
      )}
      {match.isDisputed && (
        <button
          type="button"
          onClick={() => onDisputeMatch(match)}
          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition font-medium"
          title="Review dispute details"
        >
          Review
        </button>
      )}
      {(match.status === 'scheduled' || match.status === 'in_progress') && (
        <button
          type="button"
          onClick={() => onReschedule?.(match)}
          className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition font-medium"
          title="Reschedule this match"
        >
          Reschedule
        </button>
      )}
      {match.status === 'completed' && (
        <button
          type="button"
          onClick={() => onOverride?.(match)}
          className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition font-medium"
          title="Override match result (admin)"
        >
          Override
        </button>
      )}
    </td>
    );
  };

  const roundNumbers = [...new Set(matches.map((m) => Number(m.roundNumber)).filter(Number.isFinite))].sort((a, b) => a - b);
  const activeRound = roundNumbers.find((roundNum) =>
    matches
      .filter((m) => Number(m.roundNumber) === roundNum && m.player2Id)
      .some((m) => m.status !== 'completed')
  ) || roundNumbers[roundNumbers.length - 1] || 1;

  const currentRoundMatches = matches.filter((m) => Number(m.roundNumber) === activeRound && m.player2Id);
  const allCurrentRoundCompleted = currentRoundMatches.length > 0 && currentRoundMatches.every((m) => m.status === 'completed');
  const hasNextRoundAlready = matches.some((m) => Number(m.roundNumber) === activeRound + 1);

  const isKnockoutLike = formatType === 'knockout' || formatType === 'groups_knockout';
  const isRoundRobin = formatType === 'round_robin';

  const hasKnockoutMatches = matches.some(
    (m) => m.groupNumber == null && m.roundType !== 'group_stage'
  );
  const isGroupStageOnly =
    formatType === 'groups_knockout' &&
    Array.isArray(groupStageView?.groups) &&
    groupStageView.groups.length > 0 &&
    !hasKnockoutMatches;

  const groupStagePlayable = matches.filter((m) => m.player2Id && m.roundType === 'group_stage');
  const allGroupStageDone =
    groupStagePlayable.length > 0 && groupStagePlayable.every((m) => m.status === 'completed');

  const groupCanAdvance = (g) => {
    if (g.status === 'completed') return false;
    const rm = matches.filter(
      (m) =>
        Number(m.groupNumber) === g.groupNumber &&
        Number(m.roundNumber) === g.currentRound &&
        m.player2Id
    );
    return rm.length > 0 && rm.every((m) => m.status === 'completed');
  };

  const approvedCount = (participants || []).filter((p) => p?.status === 'approved').length;
  const computedTotalRounds = tournament?.format?.maxRounds || Math.ceil(Math.log2(Math.max(approvedCount, 2)));
  const canHaveNextRound = isSwiss ? activeRound < computedTotalRounds : true;
  const maxRound = roundNumbers[roundNumbers.length - 1] || activeRound;
  const canUnlockRoundRobin = isRoundRobin && activeRound < maxRound;
  const showProgressButton =
    !isGroupStageOnly &&
    (isKnockoutLike ||
      canUnlockRoundRobin ||
      (isSwiss && canHaveNextRound && allCurrentRoundCompleted && !hasNextRoundAlready));
  const disableProgressButton =
    progressingRound ||
    !allCurrentRoundCompleted ||
    (hasNextRoundAlready && (isKnockoutLike || isSwiss));
  const progressButtonLabel = isRoundRobin ? 'Unlock Next Round' : 'Generate Next Round';

  // Include ALL matches for display in the tab, including bye matches
  const tableMatches = matches;
  const showGroupColumn = formatType === 'groups_knockout' && !isGroupStageOnly;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h3 className="text-2xl font-bold text-gray-900">Matches</h3>
        {showProgressButton && (
          <button
            type="button"
            onClick={() => onGenerateNextRound({})}
            disabled={disableProgressButton}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title={
              allCurrentRoundCompleted
                ? (isKnockoutLike && hasNextRoundAlready ? 'Next round already generated' : progressButtonLabel)
                : `Complete all Round ${activeRound} matches first`
            }
          >
            {progressingRound ? 'Processing...' : progressButtonLabel}
          </button>
        )}
      </div>

      {isGroupStageOnly && (
        <div className="space-y-8">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={!allGroupStageDone || progressingRound}
              onClick={() => onGenerateNextRound({ startKnockout: true })}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title={
                allGroupStageDone
                  ? 'Generate the knockout bracket from group qualifiers'
                  : 'Complete every group-stage match first'
              }
            >
              {progressingRound ? 'Processing...' : 'Start knockout bracket'}
            </button>
          </div>

          {groupStageView.groups.map((g) => (
            <div key={g.groupNumber} className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h4 className="text-lg font-bold text-gray-900">{g.groupName}</h4>
                  <p className="text-sm text-gray-600">
                    Active round {g.currentRound}
                    {g.maxRounds ? ` / ${g.maxRounds}` : ''}
                    {g.status === 'completed' ? ' · Group complete' : ''}
                  </p>
                </div>
                {groupCanAdvance(g) && (
                  <button
                    type="button"
                    disabled={progressingRound}
                    onClick={() => onGenerateNextRound({ groupNumber: g.groupNumber })}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {progressingRound
                      ? 'Processing...'
                      : g.currentRound >= g.maxRounds
                        ? 'Mark group complete'
                        : 'Next round for this group'}
                  </button>
                )}
              </div>

              {g.rounds.map((round) => (
                <div key={`${g.groupNumber}-${round.roundNumber}`} className="space-y-2">
                  <h5 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                    Round {round.roundNumber}
                  </h5>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Match</th>
                          <th className="px-4 py-2 text-center font-semibold text-gray-700">Scheduled</th>
                          <th className="px-4 py-2 text-center font-semibold text-gray-700">Status</th>
                          <th className="px-4 py-2 text-center font-semibold text-gray-700">Result</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {round.matches
                          .map((match) => (
                          <tr key={match.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{getPlayerName(match.player1)}</p>
                              <p className="text-gray-500 text-xs">vs</p>
                              <div className="mt-0.5">{renderOpponentDisplay(match)}</div>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-700">
                              {formatFixtureDate(match.bookingDate)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                                match.status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : match.status === 'disputed'
                                  ? 'bg-red-100 text-red-800'
                                  : match.status === 'in_progress'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : match.status === 'bye'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                              >
                                {match.status === 'bye' ? 'BYE' : match.status === 'scheduled' && !match.bookingDate ? 'pending' : match.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-800">{getResultDisplay(match)}</td>
                            {matchActionCells(match)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {!isGroupStageOnly && tableMatches.length === 0 ? (
        <div className="p-8 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-gray-600 mb-4">
            {tournament?.status === 'registration'
              ? 'No matches generated yet. Lock registration to generate bracket and matches.'
              : 'No matches found. Generate fixtures for the approved participants.'}
          </p>
          {tournament?.status !== 'registration' && approvedCount >= 2 && (
            <button
              type="button"
              onClick={onGenerateFixtures}
              disabled={generatingBracket}
              className="px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition inline-flex items-center gap-2"
            >
              {generatingBracket ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating Fixtures...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Generate Fixtures
                </>
              )}
            </button>
          )}
          {tournament?.status !== 'registration' && approvedCount < 2 && (
            <p className="text-sm text-amber-600 mt-2">
              Need at least 2 approved participants to generate fixtures.
            </p>
          )}
        </div>
      ) : !isGroupStageOnly ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                {showGroupColumn && (
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Group</th>
                )}
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Round</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Match</th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">Scheduled</th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">Result</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableMatches.map((match) => (
                <tr key={match.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                  {showGroupColumn && (
                    <td className="px-6 py-4 text-sm font-medium text-gray-700">
                      {match.groupNumber != null
                        ? `Group ${String.fromCharCode(64 + Number(match.groupNumber))}`
                        : '—'}
                    </td>
                  )}
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">
                    Round {match.roundNumber}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <p className="font-medium text-gray-900">{getPlayerName(match.player1)}</p>
                      <p className="text-gray-500 text-xs">vs</p>
                      <div className="mt-0.5">{renderOpponentDisplay(match)}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {formatFixtureDate(match.bookingDate)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      match.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : match.status === 'disputed'
                        ? 'bg-red-100 text-red-800'
                        : match.status === 'in_progress'
                        ? 'bg-yellow-100 text-yellow-800'
                        : match.status === 'bye'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {match.status === 'bye' ? 'BYE' : match.status === 'scheduled' && !match.bookingDate ? 'pending' : match.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm font-medium text-gray-700">
                    {getResultDisplay(match)}
                  </td>
                  {matchActionCells(match)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function TabStandings({ standings }) {
  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-gray-900">Tournament Standings</h3>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">Position</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">Player</th>
              <th className="px-6 py-3 text-center font-semibold text-gray-700">Matches</th>
              <th className="px-6 py-3 text-center font-semibold text-gray-700">Wins</th>
              <th className="px-6 py-3 text-center font-semibold text-gray-700">Losses</th>
              <th className="px-6 py-3 text-center font-semibold text-gray-700">Points</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((player, idx) => (
              <tr
                key={player.playerId ?? player.id ?? `standing-${idx}`}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-6 py-4 text-sm font-bold text-gray-900">#{idx + 1}</td>
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{player.playerName || "—"}</p>
                    {(player.playerEmail || player.email) && (
                      <p className="text-xs text-gray-600 mt-0.5">{player.playerEmail || player.email}</p>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-center text-gray-900">{player.matchesPlayed || 0}</td>
                <td className="px-6 py-4 text-center font-medium text-green-700">
                  {player.matchesWon ?? player.wins ?? 0}
                </td>
                <td className="px-6 py-4 text-center font-medium text-red-700">
                  {player.matchesLost ?? player.losses ?? 0}
                </td>
                <td className="px-6 py-4 text-center font-bold text-blue-900">{player.points ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabDeadlineRequests({ requests, loading, applyingRequestId, onApply }) {
  const formatDateValue = (value) => {
    if (!value) return "Not provided";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-gray-900">Deadline Requests</h3>
      <p className="text-sm text-gray-600">
        Players can request deadline extension when venue slots are unavailable on the current deadline date.
      </p>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
          No deadline requests yet.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    Round {req.roundNumber || '-'} · Match {req.matchNumber || '-'} · {req.player1Name} vs {req.player2Name}
                  </p>
                  <p className="text-sm text-gray-700 mt-1">
                    Requested deadline: <span className="font-semibold">{formatDateValue(req.requestedDeadline)}</span>
                  </p>
                  {req.appliedDeadline && (
                    <p className="text-sm text-green-700 mt-1">
                      New deadline: <span className="font-semibold">{formatDateValue(req.appliedDeadline)}</span>
                    </p>
                  )}
                  {req.contextDate && (
                    <p className="text-xs text-gray-500 mt-1">No slots found on: {req.contextDate}</p>
                  )}
                  {req.reason && (
                    <p className="text-xs text-gray-600 mt-1">Reason: {req.reason}</p>
                  )}
                  <p className="text-xs mt-2">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      req.status === 'applied' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {req.status === 'applied' ? 'Applied' : 'Pending'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={req.status === 'applied' || applyingRequestId === req.id}
                  onClick={() => onApply?.(req)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applyingRequestId === req.id ? 'Applying...' : req.status === 'applied' ? 'Applied' : 'Apply Deadline'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabSettings({ tournament, updateTournament, onTournamentUpdated }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scoring, setScoring] = useState({
    pointsWin: tournament.scoringRules?.pointsWin ?? 3,
    pointsDraw: tournament.scoringRules?.pointsDraw ?? 1,
    pointsLoss: tournament.scoringRules?.pointsLoss ?? 0,
  });

  const [format, setFormat] = useState({
    type: tournament.format?.type ?? 'knockout',
    bestOfFrames: tournament.format?.bestOfFrames ?? 3,
    seeding: tournament.format?.seeding ?? 'random',
  });

  const [entryMethods, setEntryMethods] = useState({
    allowsSelfRegistration: tournament.allowsSelfRegistration ?? true,
    allowsInvitations: tournament.allowsInvitations ?? true,
    allowsJoinCodes: tournament.allowsJoinCodes ?? true,
    allowsAdminEntry: tournament.allowsAdminEntry ?? true,
    allowsOpenRegistration: tournament.allowsOpenRegistration ?? false,
  });

  useEffect(() => {
    setScoring({
      pointsWin: tournament.scoringRules?.pointsWin ?? 3,
      pointsDraw: tournament.scoringRules?.pointsDraw ?? 1,
      pointsLoss: tournament.scoringRules?.pointsLoss ?? 0,
    });
    setFormat({
      type: tournament.format?.type ?? 'knockout',
      bestOfFrames: tournament.format?.bestOfFrames ?? 3,
      seeding: tournament.format?.seeding ?? 'random',
    });
    setEntryMethods({
      allowsSelfRegistration: tournament.allowsSelfRegistration ?? true,
      allowsInvitations: tournament.allowsInvitations ?? true,
      allowsJoinCodes: tournament.allowsJoinCodes ?? true,
      allowsAdminEntry: tournament.allowsAdminEntry ?? true,
      allowsOpenRegistration: tournament.allowsOpenRegistration ?? false,
    });
  }, [
    tournament.id,
    tournament.scoringRules?.pointsWin,
    tournament.scoringRules?.pointsDraw,
    tournament.scoringRules?.pointsLoss,
    tournament.format?.type,
    tournament.format?.bestOfFrames,
    tournament.format?.seeding,
    tournament.allowsSelfRegistration,
    tournament.allowsInvitations,
    tournament.allowsJoinCodes,
    tournament.allowsAdminEntry,
    tournament.allowsOpenRegistration,
  ]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateTournament(tournament.id, {
        scoringRules: {
          pointsWin: Number(scoring.pointsWin),
          pointsDraw: Number(scoring.pointsDraw),
          pointsLoss: Number(scoring.pointsLoss),
        },
        format: {
          type: format.type,
          bestOfFrames: Number(format.bestOfFrames),
          seeding: format.seeding,
        },
        allowsSelfRegistration: entryMethods.allowsSelfRegistration,
        allowsInvitations: entryMethods.allowsInvitations,
        allowsJoinCodes: entryMethods.allowsJoinCodes,
        allowsAdminEntry: entryMethods.allowsAdminEntry,
        allowsOpenRegistration: entryMethods.allowsOpenRegistration,
      });
      onTournamentUpdated?.(updated);
      alert('Tournament settings updated');
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating settings:', err);
      alert('Failed to update settings: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-gray-900">Tournament Settings</h3>
        <div>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              Edit Settings
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-2 bg-gray-200 text-gray-900 rounded-lg font-semibold hover:bg-gray-300 transition"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Scoring Rules</h4>
          {!isEditing ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-gray-700">Win Points:</dt>
                <dd className="text-gray-900">{scoring.pointsWin}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">Draw Points:</dt>
                <dd className="text-gray-900">{scoring.pointsDraw}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">Loss Points:</dt>
                <dd className="text-gray-900">{scoring.pointsLoss}</dd>
              </div>
            </dl>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-sm font-medium text-gray-700">Win Points</label>
                <input
                  type="number"
                  value={scoring.pointsWin}
                  onChange={(e) => setScoring((s) => ({ ...s, pointsWin: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Draw Points</label>
                <input
                  type="number"
                  value={scoring.pointsDraw}
                  onChange={(e) => setScoring((s) => ({ ...s, pointsDraw: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Loss Points</label>
                <input
                  type="number"
                  value={scoring.pointsLoss}
                  onChange={(e) => setScoring((s) => ({ ...s, pointsLoss: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Format Configuration</h4>
          {!isEditing ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-gray-700">Type:</dt>
                <dd className="text-gray-900">{format.type}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">Best Of:</dt>
                <dd className="text-gray-900">{format.bestOfFrames}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">Seeding:</dt>
                <dd className="text-gray-900">{format.seeding}</dd>
              </div>
            </dl>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={format.type}
                  onChange={(e) => setFormat((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="knockout">Knockout</option>
                  <option value="round_robin">Round Robin</option>
                  <option value="swiss">Swiss</option>
                  <option value="groups_knockout">Groups + Knockout</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Best Of (frames)</label>
                <input
                  type="number"
                  value={format.bestOfFrames}
                  onChange={(e) => setFormat((f) => ({ ...f, bestOfFrames: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Seeding</label>
                <select
                  value={format.seeding}
                  onChange={(e) => setFormat((f) => ({ ...f, seeding: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="random">Random</option>
                  <option value="ranked">Ranked</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Entry Methods Section */}
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Entry Methods</h4>
        {!isEditing ? (
          <ul className="space-y-3">
            <li className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Self-Registration</p>
                <p className="text-sm text-gray-600">Players can register themselves</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${entryMethods.allowsSelfRegistration ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {entryMethods.allowsSelfRegistration ? 'Enabled' : 'Disabled'}
              </span>
            </li>
            <li className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Invitation Links</p>
                <p className="text-sm text-gray-600">Players can be invited via email links</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${entryMethods.allowsInvitations ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {entryMethods.allowsInvitations ? 'Enabled' : 'Disabled'}
              </span>
            </li>
            <li className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Join Codes</p>
                <p className="text-sm text-gray-600">Players can register using unique join codes</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${entryMethods.allowsJoinCodes ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {entryMethods.allowsJoinCodes ? 'Enabled' : 'Disabled'}
              </span>
            </li>
            <li className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Admin Entry</p>
                <p className="text-sm text-gray-600">Admin can add players directly</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${entryMethods.allowsAdminEntry ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {entryMethods.allowsAdminEntry ? 'Enabled' : 'Disabled'}
              </span>
            </li>
            <li className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div>
                <p className="font-medium text-gray-900">Open Registration</p>
                <p className="text-sm text-gray-600">Players can request to join directly</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${entryMethods.allowsOpenRegistration ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {entryMethods.allowsOpenRegistration ? 'Enabled' : 'Disabled'}
              </span>
            </li>
          </ul>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-white rounded-lg border border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={entryMethods.allowsSelfRegistration}
                  onChange={(e) => setEntryMethods(m => ({ ...m, allowsSelfRegistration: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div>
                  <p className="font-medium text-gray-900">Self-Registration</p>
                  <p className="text-sm text-gray-600">Players can register themselves</p>
                </div>
              </label>
            </div>
            <div className="p-3 bg-white rounded-lg border border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={entryMethods.allowsInvitations}
                  onChange={(e) => setEntryMethods(m => ({ ...m, allowsInvitations: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div>
                  <p className="font-medium text-gray-900">Invitation Links</p>
                  <p className="text-sm text-gray-600">Players can be invited via email links</p>
                </div>
              </label>
            </div>
            <div className="p-3 bg-white rounded-lg border border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={entryMethods.allowsJoinCodes}
                  onChange={(e) => setEntryMethods(m => ({ ...m, allowsJoinCodes: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div>
                  <p className="font-medium text-gray-900">Join Codes</p>
                  <p className="text-sm text-gray-600">Players can register using unique join codes</p>
                </div>
              </label>
            </div>
            <div className="p-3 bg-white rounded-lg border border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={entryMethods.allowsAdminEntry}
                  onChange={(e) => setEntryMethods(m => ({ ...m, allowsAdminEntry: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div>
                  <p className="font-medium text-gray-900">Admin Entry</p>
                  <p className="text-sm text-gray-600">Admin can add players directly</p>
                </div>
              </label>
            </div>
            <div className="p-3 bg-white rounded-lg border border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={entryMethods.allowsOpenRegistration}
                  onChange={(e) => setEntryMethods(m => ({ ...m, allowsOpenRegistration: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div>
                  <p className="font-medium text-gray-900">Open Registration</p>
                  <p className="text-sm text-gray-600">Players can request to join directly</p>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ApplyDeadlineFromVenueModal({ tournament, request, loading, onCancel, onConfirm }) {
  const formatDateValue = (value) => {
    if (!value) return "Not provided";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString();
  };

  const [venues, setVenues] = useState([]);
  const [slots, setSlots] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [selectedTableName, setSelectedTableName] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(
    request?.requestedDeadline ? String(request.requestedDeadline).slice(0, 10) : ''
  );
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const selectedVenue = venues.find((v) => String(v.id) === String(selectedVenueId)) || null;
  const venueTables = Array.isArray(selectedVenue?.tables)
    ? selectedVenue.tables.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const normalizedSlotRows = Array.isArray(selectedVenue?.slots) ? selectedVenue.slots : [];
  const availableSlots = normalizedSlotRows.filter((slot) => {
    if (!deadlineDate) return false;
    const dayName = new Date(`${deadlineDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
    const slotDay = String(slot?.day || '').trim().toLowerCase();
    const requestedDay = String(dayName || '').trim().toLowerCase();
    const tableNameMatches = selectedTableName
      ? String(slot?.tableName || '').trim().toLowerCase() === String(selectedTableName).trim().toLowerCase()
      : true;
    return tableNameMatches && slotDay === requestedDay;
  });

  useEffect(() => {
    const loadVenues = async () => {
      setLoadingVenues(true);
      try {
        const response = await apiClient.get('/bookings/venues', { params: { tournamentId: tournament.id } });
        const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
        setVenues(rows);
        if (rows.length > 0) {
          const firstVenue = rows[0];
          const firstId = firstVenue?.id || '';
          setSelectedVenueId(firstId);
          const firstTables = Array.isArray(firstVenue?.tables)
            ? firstVenue.tables.map((t) => String(t).trim()).filter(Boolean)
            : [];
          setSelectedTableName(firstTables[0] || '');
        }
      } catch (err) {
        console.error('Failed to load tournament venues for deadline modal:', err);
        setVenues([]);
      } finally {
        setLoadingVenues(false);
      }
    };
    loadVenues();
  }, [tournament.id]);

  useEffect(() => {
    if (!selectedVenueId) {
      setSelectedTableName('');
      return;
    }
    const selected = venues.find((v) => String(v.id) === String(selectedVenueId));
    const tablesFromVenue = Array.isArray(selected?.tables)
      ? selected.tables.map((t) => String(t).trim()).filter(Boolean)
      : [];
    setSelectedTableName(tablesFromVenue[0] || '');
  }, [selectedVenueId]);

  useEffect(() => {
    if (!selectedVenueId || !deadlineDate) {
      setSlots([]);
      return;
    }
    const dayName = new Date(`${deadlineDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
    const loadSlots = async () => {
      setLoadingSlots(true);
      try {
        // Keep a lightweight request to align with existing slot APIs, but use venue slots as source of truth.
        const response = await apiClient.get('/bookings/venues', { params: { tournamentId: tournament.id } });
        const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
        setVenues(rows);
        const selected = rows.find((v) => String(v.id) === String(selectedVenueId));
        const daySlots = (Array.isArray(selected?.slots) ? selected.slots : []).filter(
          (s) => String(s?.day || '').trim().toLowerCase() === String(dayName).trim().toLowerCase()
        );
        setSlots(daySlots);
      } catch (err) {
        console.error('Failed to load slots for deadline modal:', err);
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };
    loadSlots();
  }, [selectedVenueId, deadlineDate, tournament.id]);

  const canApply = Boolean(deadlineDate && availableSlots.length > 0 && !loading);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        <div className="sticky top-0 bg-blue-600 text-white px-6 py-4 flex justify-between items-center rounded-t-lg">
          <div>
            <h3 className="text-xl font-bold">Apply Deadline</h3>
            <p className="text-blue-100 text-sm mt-1">
              Pick a deadline date based on available tournament venue slots.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-white text-xl disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-gray-800">
              Round {request?.roundNumber || '-'} · Match {request?.matchNumber || '-'} · {request?.player1Name || 'Player 1'} vs {request?.player2Name || 'Player 2'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Requested deadline: {formatDateValue(request?.requestedDeadline)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Venue</label>
              <select
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={loadingVenues || loading}
              >
                <option value="">Select venue</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name || v.venueName || v.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Table</label>
              <select
                value={selectedTableName}
                onChange={(e) => setSelectedTableName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={!selectedVenueId || loading}
              >
                <option value="">Select table</option>
                {venueTables.map((tableName) => (
                  <option key={tableName} value={tableName}>{tableName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Deadline Date</label>
              <input
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={loading}
              />
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-gray-800 mb-2">Available slots on selected deadline</p>
            {loadingSlots ? (
              <p className="text-sm text-gray-600">Loading slots...</p>
            ) : availableSlots.length === 0 ? (
              <p className="text-sm text-amber-700">
                No available slots for this date/table. Pick another date from venue availability.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableSlots.map((slot, idx) => (
                  <span key={slot.id || `${slot.startTime}-${slot.endTime}-${idx}`} className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">
                    {String(slot?.tableName || selectedTableName).trim()}: {slot.startTime} - {slot.endTime}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-5 py-2 border border-gray-300 rounded-lg font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={() => onConfirm?.(deadlineDate)}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Applying...' : 'Apply Deadline'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabOpenRegistrations({ tournament, registrations, loading, onRefresh, onApprove, onReject }) {
  const [processingId, setProcessingId] = useState(null);

  const handleApprove = async (registrationId) => {
    setProcessingId(registrationId);
    try {
      // Call the provided onApprove handler with just the participantId
      await onApprove(registrationId);
      onRefresh();
    } catch (err) {
      alert('Error approving registration: ' + (err?.message || err));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (registrationId) => {
    setProcessingId(registrationId);
    try {
      // Call the provided onReject handler with just the participantId
      await onReject(registrationId);
      onRefresh();
    } catch (err) {
      alert('Error rejecting registration: ' + (err?.message || err));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-gray-900">Open Registration Requests</h3>
        <button
          onClick={onRefresh}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading && <p className="text-center text-gray-600 py-8">Loading registration requests...</p>}

      {!loading && registrations.length === 0 && (
        <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <FaUsers className="mx-auto text-4xl text-gray-400 mb-4" />
          <h4 className="text-lg font-semibold text-gray-900 mb-2">No pending requests</h4>
          <p className="text-gray-600">Players who request to join will appear here</p>
        </div>
      )}

      {!loading && registrations.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Player</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Email</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Requested</th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((reg) => (
                <tr key={reg.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{reg.player?.name || reg.playerName || 'N/A'}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {reg.player?.user?.email || reg.player?.email || reg.playerEmail || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {reg.registrationDate ? new Date(reg.registrationDate).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                      Pending
                    </span>
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button
                      onClick={() => handleApprove(reg.id)}
                      disabled={processingId === reg.id}
                      className="px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition text-sm font-medium disabled:opacity-50"
                    >
                      <FaCheck className="inline-block mr-1" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(reg.id)}
                      disabled={processingId === reg.id}
                      className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition text-sm font-medium disabled:opacity-50"
                    >
                      <FaTimes className="inline-block mr-1" />
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Helper Components

function MatchResultForm({ match, onSubmit }) {
  const [formData, setFormData] = useState({ player1Frames: 0, player2Frames: 0 });

  const handleSubmit = async () => {
    await onSubmit(match.tournamentId, match.id, formData);
  };

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <h5 className="text-lg font-bold text-gray-900">Submit Match Result</h5>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-600">{match.player1?.name || 'Player 1'} Frames</label>
          <input
            type="number"
            min="0"
            value={formData.player1Frames}
            onChange={(e) => setFormData((p) => ({ ...p, player1Frames: parseInt(e.target.value) }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-600">{match.player2?.name || 'Player 2'} Frames</label>
          <input
            type="number"
            min="0"
            value={formData.player2Frames}
            onChange={(e) => setFormData((p) => ({ ...p, player2Frames: parseInt(e.target.value) }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      <button onClick={handleSubmit} className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition">
        Submit Result
      </button>
    </div>
  );
}

function InvitePlayersForm({ tournament, onClose, onSubmit }) {
  const [emails, setEmails] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const emailList = emails
      .split('\n')
      .map((e) => e.trim())
      .filter((e) => e);

    if (emailList.length === 0) {
      alert('Please enter at least one email address');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(tournament.id, { emails: emailList, message });
      alert('Invitations sent successfully!');
      onClose();
    } catch (err) {
      alert('Error sending invitations: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-gray-900">Invite Players</h3>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Email Addresses (one per line)</label>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="player1@example.com&#10;player2@example.com"
          rows="6"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Message (optional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a personal message to the invitation..."
          rows="3"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex gap-3 pt-4">
        <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg font-semibold hover:bg-gray-300 transition">
          Cancel
        </button>
        <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition" disabled={loading}>
          {loading ? 'Sending...' : 'Send Invitations'}
        </button>
      </div>
    </div>
  );
}
