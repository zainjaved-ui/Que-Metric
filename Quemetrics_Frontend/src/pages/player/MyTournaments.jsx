import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import { AuthContext } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Modal, { ModalBody, ModalFooter } from '../../components/ui/Modal';
import Loader from '../../components/ui/Loader';
import LiveTournamentProgressionView from '../../components/Dashboard/Organizationdashboard/Tournaments/LiveTournamentProgressionView';
import { FaCalendarAlt, FaCheckCircle, FaClock, FaTimesCircle, FaArrowRight } from 'react-icons/fa';

export default function MyTournaments() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedParticipation, setSelectedParticipation] = useState(null);
  const [participantCounts, setParticipantCounts] = useState({ approved: null, pending: null, total: null });
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [bracketTournament, setBracketTournament] = useState(null);
  const [bracketMatches, setBracketMatches] = useState([]);
  const [bracketLoading, setBracketLoading] = useState(false);
  const [bracketError, setBracketError] = useState(null);

  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState(null);
  const [withdrawalInfo, setWithdrawalInfo] = useState(null);
  const [withdrawInfoLoading, setWithdrawInfoLoading] = useState(false);

  const location = useLocation();

  const parseWithdrawalRules = (tournament) => {
    const wr = tournament?.withdrawalRules;
    if (wr == null) return { beforeStart: 'remove' };
    if (typeof wr === 'string') {
      try {
        return JSON.parse(wr);
      } catch {
        return { beforeStart: 'remove' };
      }
    }
    return typeof wr === 'object' ? wr : { beforeStart: 'remove' };
  };

  // Get withdrawal stage and applicable rule
  const getWithdrawalRuleInfo = (tournament) => {
    const rules = parseWithdrawalRules(tournament);

    // Determine stage
    let stage = 'before_start';
    let stageLabel = 'Before Start';
    let applicableRule = rules.beforeStart || 'remove';

    if (tournament.status === 'in_progress') {
      // For now, assume knockout stage if in_progress
      stage = 'during_knockout';
      stageLabel = 'Knockout Stage';
      applicableRule = rules.duringKnockout || rules.knockout || 'walkover';
    } else if (tournament.status === 'registration' || tournament.status === 'registration_closed') {
      stage = 'before_start';
      stageLabel = 'Before Start';
      applicableRule = rules.beforeStart || 'remove';
    }

    // Get rule details
    const ruleDetails = {
      'remove': {
        label: 'Remove',
        color: 'text-blue-700',
        bullets: [
          'You will be removed from the tournament',
          'Bracket will be recalculated',
          'Your matches will not be recorded',
          'No penalties applied'
        ]
      },
      'forfeit': {
        label: 'Forfeit',
        color: 'text-orange-700',
        bullets: [
          'You will be marked as forfeit',
          'All your matches recorded as losses',
          'Opponents receive automatic wins',
          'Affects standings and rankings'
        ]
      },
      '50_percent_rule': {
        label: '50% Rule',
        color: 'text-yellow-700',
        bullets: [
          'If < 50% of group matches played: all voided',
          'If ≥ 50% of group matches played: results kept',
          'Remaining matches recorded as losses',
          'Affects group standings'
        ]
      },
      'walkover': {
        label: 'Walkover',
        color: 'text-red-700',
        bullets: [
          'All remaining matches: automatic losses',
          'Opponents receive automatic wins',
          'Affects bracket progression',
          'May eliminate you from tournament'
        ]
      },
      'void': {
        label: 'Void',
        color: 'text-red-700',
        bullets: [
          'Matches are cancelled',
          'Organizer decides outcome',
          'Bracket progression may be affected',
          'No automatic winner/loser'
        ]
      },
      'remove_all': {
        label: 'Remove All',
        color: 'text-red-700',
        bullets: [
          'All group stage matches voided',
          'You are removed from bracket',
          'No points or standings impact',
          'Bracket recalculated'
        ]
      }
    };

    return {
      stage,
      stageLabel,
      applicableRule,
      ruleDetail: ruleDetails[applicableRule] || ruleDetails.remove
    };
  };

  /** Player can withdraw if tournament is active/registration and they're approved */
  const canWithdrawParticipation = (participation, tournament) => {
    if (!participation || !tournament) return false;
    if (participation.status !== 'approved') return false;
    if (['completed', 'cancelled', 'archived'].includes(tournament.status)) return false;

    // Allow withdrawal in any of these tournament states
    // Players can now withdraw at ANY stage with consequences determined by configured rules
    if (!['registration', 'registration_closed', 'fixtures_generated', 'in_progress'].includes(tournament.status)) {
      return false;
    }

    return true;
  };

  /** Check if tournament uses REMOVE mode (organizer removes players, not self-withdrawal) */
  const isTournamentRemoveMode = (tournament) => {
    const rules = parseWithdrawalRules(tournament);
    const beforeStartRule = String(rules.beforeStart ?? rules.before_start ?? 'remove').toLowerCase();
    return beforeStartRule === 'remove';
  };
  const closeDetailsModal = () => {
    // Remove any details query param when closing modal
    navigate('/player/my-tournaments', { replace: true });
    setShowDetailsModal(false);
    setSelectedParticipation(null);
  };

  const openBracketModal = async (tournament) => {
    setBracketTournament(tournament);
    setShowBracketModal(true);
    setBracketLoading(true);
    setBracketError(null);
    try {
      const resp = await apiClient.get(`/tournaments/${tournament.id}/matches`);
      setBracketMatches(resp.data.data || []);
      console.log('[MyTournaments] Loaded bracket matches:', (resp.data.data || []).length);
    } catch (err) {
      console.error('[MyTournaments] Failed to load bracket matches:', err);
      setBracketError(err.response?.data?.error || err.message || 'Failed to load bracket');
      setBracketMatches([]);
    } finally {
      setBracketLoading(false);
    }
  };

  const closeBracketModal = () => {
    setShowBracketModal(false);
    setBracketTournament(null);
    setBracketMatches([]);
    setBracketError(null);
    setBracketLoading(false);
  };

  const openWithdrawConfirm = (participation) => {
    setWithdrawError(null);
    setWithdrawTarget(participation);
    // Fetch withdrawal info from backend for proper stage detection
    setWithdrawInfoLoading(true);
    const tid = participation?.tournament?.id;
    if (tid) {
      apiClient
        .get(`/tournaments/${tid}/withdrawal-info`)
        .then((res) => {
          setWithdrawalInfo(res.data?.data || null);
        })
        .catch((err) => {
          console.error('[MyTournaments] Failed to fetch withdrawal-info:', err);
          // Fallback to local calculation if API fails
          const fallback = getWithdrawalRuleInfo(participation.tournament);
          setWithdrawalInfo(fallback);
        })
        .finally(() => setWithdrawInfoLoading(false));
    }
  };

  const closeWithdrawConfirm = () => {
    if (withdrawSubmitting) return;
    setWithdrawTarget(null);
    setWithdrawError(null);
    setWithdrawalInfo(null);
    setWithdrawInfoLoading(false);
  };

  const confirmWithdraw = async () => {
    const tid = withdrawTarget?.tournament?.id;
    const tournSnapshot = withdrawTarget?.tournament;
    if (!tid) return;
    setWithdrawSubmitting(true);
    setWithdrawError(null);
    try {
      await apiClient.post(`/tournaments/${tid}/withdraw`, { reason: '' });
      await loadTournaments();
      setWithdrawTarget(null);
      setWithdrawalInfo(null);
      setShowDetailsModal(false);
      setSelectedParticipation(null);
      if (showBracketModal && bracketTournament?.id === tid && tournSnapshot) {
        await openBracketModal(tournSnapshot);
      }
    } catch (e) {
      setWithdrawError(e.response?.data?.error || e.message || 'Withdrawal failed');
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  // If a direct link with ?details=<id> is opened, fetch player tournaments and open modal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const detailsId = params.get('details');
    if (!detailsId) return;

    (async () => {
      try {
        const resp = await apiClient.get('/player/tournaments');
        const parts = resp.data.data || [];
        setTournaments(parts);
        const participation = parts.find((p) => String(p.tournament?.id) === String(detailsId));
        if (participation) {
          setSelectedParticipation(participation);
          setShowDetailsModal(true);
        }
      } catch (e) {
        console.debug('Failed to open details from query param', e?.message || e);
      }
    })();
  }, [location.search]);

  // When modal opens for a tournament, fetch participants to compute counts
  useEffect(() => {
    const tournamentId = selectedParticipation?.tournament?.id;
    if (!showDetailsModal || !tournamentId) {
      setParticipantCounts({ approved: null, pending: null, total: null });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setParticipantsLoading(true);
        const resp = await apiClient.get(`/tournaments/${tournamentId}/participants`);
        if (cancelled) return;
        const parts = resp.data.data || [];
        const approved = parts.filter((p) => p.status === 'approved').length;
        const pending = parts.filter((p) => p.status === 'pending').length;
        const total = parts.length;
        setParticipantCounts({ approved, pending, total });
      } catch (err) {
        console.debug('Failed to load participants for modal', err?.message || err);
        setParticipantCounts({ approved: null, pending: null, total: null });
      } finally {
        if (!cancelled) setParticipantsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showDetailsModal, selectedParticipation]);

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      setError(null);
      // Add cache-busting timestamp parameter to ensure fresh data
      const timestamp = Date.now();
      console.log('[MyTournaments] Fetching tournaments with timestamp:', timestamp);

      const response = await apiClient.get(`/player/tournaments?_t=${timestamp}`);
      console.log('[MyTournaments] API Response:', response.data);

      const data = response.data.data || [];
      console.log('[MyTournaments] Tournaments data:', data);
      console.log('[MyTournaments] Number of tournaments:', data.length);

      if (data.length > 0) {
        console.log('[MyTournaments] First tournament:', data[0]);
      }

      setTournaments(data);
    } catch (err) {
      console.error('[MyTournaments] Error loading tournaments:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to load tournaments';
      setError(errorMsg);
      setTournaments([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      approved: {
        bg: 'bg-green-100',
        text: 'text-green-800',
        icon: FaCheckCircle,
        label: 'Approved',
      },
      pending: {
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        icon: FaClock,
        label: 'Pending Approval',
      },
      rejected: {
        bg: 'bg-red-100',
        text: 'text-red-800',
        icon: FaTimesCircle,
        label: 'Rejected',
      },
      withdrawn: {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        icon: FaTimesCircle,
        label: 'Withdrawn',
      },
    };

    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        <Icon className="text-lg" />
        {badge.label}
      </div>
    );
  };

  const getTournamentStatusBadge = (status) => {
    const map = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' },
      registration: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Registration Open' },
      registration_closed: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Registration Closed' },
      fixtures_generated: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Fixtures Ready' },
      in_progress: { bg: 'bg-green-100', text: 'text-green-700', label: 'In Progress' },
      completed: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Completed' },
      archived: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Archived' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
    };
    const s = map[status] || map.draft;
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  const getParticipantStatusBadge = (participantStatus) => {
    if (!participantStatus) return null;
    const map = {
      registered: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Registered' },
      playing: { bg: 'bg-green-100', text: 'text-green-700', label: '🏃 Playing' },
      eliminated: { bg: 'bg-red-100', text: 'text-red-700', label: '❌ Eliminated' },
      champion: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '🏆 Champion' },
      runner_up: { bg: 'bg-blue-100', text: 'text-blue-700', label: '🥈 Runner-up' },
    };
    const s = map[participantStatus] || map.registered;
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  const filteredTournaments = tournaments.filter((participation) => {
    if (filterStatus === 'all') return true;
    // participation.status is the participation status, not tournament.status
    return participation.status === filterStatus;
  });

  const statusCounts = {
    all: tournaments.length,
    approved: tournaments.filter((t) => t.status === 'approved').length,
    pending: tournaments.filter((t) => t.status === 'pending').length,
    rejected: tournaments.filter((t) => t.status === 'rejected').length,
    withdrawn: tournaments.filter((t) => t.status === 'withdrawn').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">My Tournaments</h1>
            <p className="text-gray-600">View your tournament registrations and status</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-8">
            <Button
              onClick={() => navigate('/player/tournaments')}
              className="flex items-center gap-2"
            >
              <FaArrowRight className="text-sm" />
              All Tournaments
            </Button>
          </div>

          {/* Status Filter Tabs */}
          <div className="bg-white rounded-lg shadow-md p-4 mb-8 border-b border-gray-200">
            <div className="flex gap-4 overflow-x-auto flex-wrap">
              {[
                { key: 'all', label: 'All', icon: '📋' },
                { key: 'approved', label: 'Approved', icon: '✓' },
                { key: 'pending', label: 'Pending', icon: '⏳' },
                { key: 'rejected', label: 'Rejected', icon: '✗' },
                { key: 'withdrawn', label: 'Withdrawn', icon: '↩️' },
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterStatus === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {icon} {label} ({statusCounts[key]})
                </button>
              ))}
            </div>
          </div>

          {/* Loading State */}
          {loading && <Loader />}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
              <button
                onClick={loadTournaments}
                className="mt-3 text-red-600 hover:text-red-700 font-medium"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && tournaments.length === 0 && (
            <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <FaCalendarAlt className="mx-auto text-4xl text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No tournaments yet</h3>
              <p className="text-gray-600 mb-6">You haven't registered for any tournaments</p>
              <Button
                onClick={() => navigate('/player/tournaments')}
                className="inline-flex items-center gap-2"
              >
                <FaArrowRight className="text-sm" />
                Go to All Tournaments
              </Button>
            </div>
          )}

          {/* Tournaments List */}
          {!loading && filteredTournaments.length > 0 && (
            <div className="space-y-4">
              {filteredTournaments.map((participation) => {
                const tournament = participation.tournament;
                const startDate = new Date(tournament.startDate);
                const now = new Date();
                const isUpcoming = startDate > now;

                return (
                  <div
                    key={participation.id}
                    className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-l-4 border-blue-500"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                      {/* Tournament Info */}
                      <div className="md:col-span-2">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{tournament.name}</h3>

                        <div className="space-y-2 text-sm text-gray-600 mb-4">
                          {/* Date */}
                          <div className="flex items-center gap-2">
                            <FaCalendarAlt className="text-blue-600 shrink-0" />
                            <span>
                              {startDate.toLocaleDateString('en-GB', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                              {isUpcoming && (
                                <span className="ml-2 text-xs font-semibold text-green-600">
                                  (Upcoming)
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Tournament Status */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {getTournamentStatusBadge(tournament.status)}
                            {participation.participantStatus && getParticipantStatusBadge(participation.participantStatus)}
                            {tournament.status === 'in_progress' && tournament.currentRound > 0 && (
                              <span className="text-xs text-gray-500">Round {tournament.currentRound}</span>
                            )}
                          </div>

                          {/* Organizer */}
                          {tournament.organizer && (
                            <p className="text-xs font-medium text-gray-500">
                              Organized by: {tournament.organizer.organizationName}
                            </p>
                          )}

                          {/* Sport & Tier */}
                          <div className="flex gap-2 flex-wrap">
                            <span className="bg-gray-100 px-2 py-1 rounded text-xs font-medium capitalize">
                              {tournament.sport}
                            </span>
                            {tournament.ranked && (
                              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
                                Ranked - {tournament.tier ? tournament.tier.charAt(0).toUpperCase() + tournament.tier.slice(1) : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Registration Details */}
                        <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                          <p>
                            <span className="font-semibold text-gray-700">Registered: </span>
                            <span className="text-gray-600">{formatDate(participation.registrationDate)}</span>
                          </p>
                          {participation.status === 'approved' && participation.approvedDate && (
                            <p>
                              <span className="font-semibold text-gray-700">Approved: </span>
                              <span className="text-gray-600">{formatDate(participation.approvedDate)}</span>
                            </p>
                          )}
                          {participation.registrationMethod && (
                            <p>
                              <span className="font-semibold text-gray-700">Entry Method: </span>
                              <span className="text-gray-600 capitalize">
                                {participation.registrationMethod.replace(/_/g, ' ')}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status & Action */}
                      <div className="flex flex-col gap-3">
                        {getStatusBadge(participation.status)}

                        <Button
                          onClick={() => {
                            setSelectedParticipation(participation);
                            setShowDetailsModal(true);
                          }}
                          variant="secondary"
                          className="w-full text-center"
                        >
                          View Details
                        </Button>

                        {canWithdrawParticipation(participation, tournament) && (
                          <Button
                            type="button"
                            variant="danger"
                            className="w-full text-center text-sm"
                            onClick={() => openWithdrawConfirm(participation)}
                            disabled={withdrawSubmitting}
                          >
                            {withdrawSubmitting ? 'Processing...' : 'Withdraw'}
                          </Button>
                        )}

                        {participation.status === 'approved' && isUpcoming && (
                          <Button
                            onClick={() => openBracketModal(tournament)}
                            variant="primary"
                            className="w-full text-center text-sm"
                          >
                            View Bracket
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* No results for filter */}
          {!loading && tournaments.length > 0 && filteredTournaments.length === 0 && (
            <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <FaCalendarAlt className="mx-auto text-4xl text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No {filterStatus} tournaments
              </h3>
              <p className="text-gray-600">
                Try selecting a different filter or browse available tournaments
              </p>
            </div>
          )}

          {/* Details Modal */}
          <Modal
            isOpen={showDetailsModal}
            onClose={closeDetailsModal}
            title={selectedParticipation?.tournament?.name || 'Tournament Details'}
            size="lg"
          >
            <ModalBody>
              {selectedParticipation && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700">{selectedParticipation.tournament?.description || 'No description'}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-600">Start Date</p>
                      <p className="font-medium text-gray-900">{formatDate(selectedParticipation.tournament?.startDate)}</p>
                    </div>
                    {selectedParticipation.tournament?.endDate && (
                      <div>
                        <p className="text-xs text-gray-600">End Date</p>
                        <p className="font-medium text-gray-900">{formatDate(selectedParticipation.tournament?.endDate)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-600">Organizer</p>
                      <p className="font-medium text-gray-900">{selectedParticipation.tournament?.organizer?.organizationName || selectedParticipation.tournament?.organization?.organizationName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Participants</p>
                      <div>
                        {participantsLoading ? (
                          <p className="font-medium text-gray-900">Loading...</p>
                        ) : participantCounts.approved !== null ? (
                          <>
                            <p className="font-medium text-gray-900">
                              {participantCounts.approved}{selectedParticipation.tournament?.maxParticipants ? ` / ${selectedParticipation.tournament.maxParticipants}` : ''}
                            </p>
                            {participantCounts.pending > 0 && (
                              <p className="text-xs text-gray-500">Pending: {participantCounts.pending}</p>
                            )}
                          </>
                        ) : (
                          <p className="font-medium text-gray-900">{selectedParticipation.tournament?.currentParticipantCount ?? '—'}{selectedParticipation.tournament?.maxParticipants ? ` / ${selectedParticipation.tournament.maxParticipants}` : ''}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 text-xs">
                    <p className="font-semibold text-gray-700">Your Registration</p>
                    <p className="text-gray-600">Registered: {formatDate(selectedParticipation.registrationDate)}</p>
                    <p className="text-gray-600">Status: {selectedParticipation.status}</p>
                    {selectedParticipation.registrationMethod && (
                      <p className="text-gray-600">Entry Method: {selectedParticipation.registrationMethod.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <div className="flex items-center justify-end gap-2 w-full flex-wrap">
                {selectedParticipation &&
                  canWithdrawParticipation(selectedParticipation, selectedParticipation.tournament) && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => openWithdrawConfirm(selectedParticipation)}
                      disabled={withdrawSubmitting}
                    >
                      {withdrawSubmitting ? 'Processing...' : 'Withdraw'}
                    </Button>
                  )}
                <Button variant="secondary" onClick={closeDetailsModal}>
                  Close
                </Button>
              </div>
            </ModalFooter>
          </Modal>

          {/* Withdraw confirmation */}
          <Modal
            isOpen={Boolean(withdrawTarget)}
            onClose={closeWithdrawConfirm}
            title="Confirm withdrawal"
            size="md"
          >
            <ModalBody>
              {withdrawInfoLoading ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader />
                  <p className="text-sm text-gray-600">Loading withdrawal info...</p>
                </div>
              ) : withdrawTarget?.tournament && withdrawalInfo ? (
                (() => {
                  // Use backend withdrawal info for accurate stage detection
                  const ruleInfo = {
                    stage: withdrawalInfo.stage,
                    stageLabel: withdrawalInfo.stageLabel,
                    applicableRule: withdrawalInfo.applicableRule,
                    ruleDetail: withdrawalInfo.ruleDetail,
                  };
                  return (
                    <div className="space-y-4">
                      {/* Stage Badge */}
                      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <span className="text-2xl">{ruleInfo.stage === 'before_start' ? '🏁' : ruleInfo.stage === 'during_group' ? '👥' : '🥊'}</span>
                        <div>
                          <p className="text-xs text-gray-600">Tournament Stage</p>
                          <p className="font-semibold text-gray-900">{ruleInfo.stageLabel}</p>
                        </div>
                      </div>

                      {/* Applied Rule Badge */}
                      <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                        <span className="text-2xl">{ruleInfo.ruleDetail?.icon || '📋'}</span>
                      <div>
                        <p className="text-xs text-gray-600">Applied Withdrawal Rule</p>
                        <p className={`font-semibold ${ruleInfo.ruleDetail?.color}`}>{ruleInfo.ruleDetail?.label}</p>
                      </div>
                    </div>

                    {/* What will happen */}
                    {/* <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm font-semibold text-red-900 mb-2">⚠️ What will happen:</p>
                      <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                        {ruleInfo.ruleDetail?.bullets?.map((bullet, idx) => (
                          <li key={idx}>{bullet}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-red-700 mt-3 font-semibold">This action cannot be undone!</p>
                    </div> */}

                    {/* Confirmation prompt */}
                    <p className="text-gray-800 font-medium">Are you sure you want to withdraw?</p>

                    {withdrawError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                        {withdrawError}
                      </div>
                    )}
                  </div>
                  );
                })()
              ) : (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">Unable to load withdrawal information. Please try again.</p>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <div className="flex items-center justify-end gap-2 w-full">
                <Button variant="secondary" onClick={closeWithdrawConfirm} disabled={withdrawSubmitting}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmWithdraw} loading={withdrawSubmitting}>
                  Confirm withdrawal
                </Button>
              </div>
            </ModalFooter>
          </Modal>

          {/* Bracket Modal */}
          <Modal
            isOpen={showBracketModal}
            onClose={closeBracketModal}
            title={bracketTournament?.name ? `${bracketTournament.name} — Bracket` : 'Tournament Bracket'}
            size="xl"
          >
            <ModalBody>
              {bracketLoading ? (
                <Loader />
              ) : bracketError ? (
                <div className="text-red-600">{bracketError}</div>
              ) : (
                <LiveTournamentProgressionView
                  matches={bracketMatches}
                  tournament={bracketTournament}
                  onRecordResult={() => {}}
                  onDisputeMatch={() => {}}
                />
              )}
            </ModalBody>
            <ModalFooter>
              <div className="flex items-center justify-end w-full">
                <Button variant="secondary" onClick={closeBracketModal}>Close</Button>
              </div>
            </ModalFooter>
          </Modal>
        </div>
      </div>
  );
}
