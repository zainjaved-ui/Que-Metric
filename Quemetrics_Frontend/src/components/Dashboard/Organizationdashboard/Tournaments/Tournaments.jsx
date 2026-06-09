/**
 * Tournaments Component - Main Tournament Management Page
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  EyeIcon,
  ArrowPathIcon,
  TrophyIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useTournament } from './useTournament';
import TournamentCreationWizard from './TournamentCreationWizard';
import TournamentPrerequisiteGuard from './TournamentPrerequisiteGuard';
import TournamentDashboard from './TournamentDashboard';

function formatTournamentFormat(tournament) {
  const raw = tournament?.format?.type ?? tournament?.formatId ?? '';
  if (!raw) return '—';
  return String(raw)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sportBadgeStyles(sport) {
  const s = (sport || '').toLowerCase();
  if (s.includes('snooker')) return 'bg-emerald-50 text-emerald-800 border-emerald-100';
  if (s.includes('pool')) return 'bg-sky-50 text-sky-800 border-sky-100';
  if (s.includes('poker')) return 'bg-violet-50 text-violet-800 border-violet-100';
  return 'bg-gray-50 text-gray-700 border-gray-100';
}

/** Human-readable label from API status (e.g. in_progress → "In progress"). */
function humanizeTournamentStatus(status) {
  if (status == null || status === '') return 'Unknown';
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Primary status pill on cards: reflects API `tournament.status` (humanized). When `isArchived` is
 * true, the pill shows Archived regardless of status string.
 */
function statusBadgeForTournament(tournament) {
  const raw = tournament?.status || 'draft';
  const status = String(raw).toLowerCase();
  const archived =
    tournament?.isArchived === true ||
    tournament?.isArchived === 1 ||
    status === 'archived';

  if (archived) {
    return {
      label: 'Archived',
      className: 'bg-gray-100 text-gray-700 border border-gray-200/80',
    };
  }

  const label = humanizeTournamentStatus(raw);

  if (status === 'in_progress' || status === 'fixtures_generated') {
    return { label, className: 'bg-green-100 text-green-800 border border-green-200/80' };
  }
  if (status === 'completed') {
    return { label, className: 'bg-gray-100 text-gray-800 border border-gray-200/80' };
  }
  if (status === 'cancelled') {
    return { label, className: 'bg-red-100 text-red-800 border border-red-200/80' };
  }
  if (status === 'draft' || status === 'registration') {
    return { label, className: 'bg-blue-100 text-blue-800 border border-blue-200/80' };
  }
  return {
    label,
    className: 'bg-gray-100 text-gray-800 border border-gray-200/80',
  };
}

export default function Tournaments() {
  const { tournaments, getTournaments, loading, error, getWithdrawalsFeed } = useTournament();
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [wizardTournament, setWizardTournament] = useState(null); // null => create flow, not-null => resume flow
  const [showDashboard, setShowDashboard] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [dashboardInitialTab, setDashboardInitialTab] = useState('overview');
  const [withdrawalRows, setWithdrawalRows] = useState([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalsError, setWithdrawalsError] = useState('');

  useEffect(() => {
    getTournaments();
  }, [getTournaments]);

  useEffect(() => {
    if (filterStatus !== 'withdrawals') return undefined;
    let cancelled = false;
    (async () => {
      setWithdrawalsLoading(true);
      setWithdrawalsError('');
      try {
        const rows = await getWithdrawalsFeed();
        if (!cancelled) setWithdrawalRows(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (!cancelled) setWithdrawalsError(e?.message || 'Failed to load withdrawals');
      } finally {
        if (!cancelled) setWithdrawalsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterStatus, getWithdrawalsFeed]);

  const filteredTournaments =
    filterStatus === 'all' || filterStatus === 'withdrawals'
      ? tournaments
      : tournaments.filter((t) => t.status === filterStatus);

  const handleTournamentCreated = async () => {
    await getTournaments();
    setShowCreateWizard(false);
    setWizardTournament(null);
  };

  const handleSelectTournament = (tournament) => {
    // Resume wizard for "unfinished draft" tournaments created after Step 2 (Basic Info).
    const hasFormat = Boolean(tournament?.format?.type || tournament?.formatId);
    const hasScoring = Boolean(
      tournament?.scoringRules?.pointsWin != null ||
        tournament?.scoringRulesId
    );
    const hasPersistedCompletion = tournament?.setupCompleted === true;
    const wizardComplete = tournament?.status === "draft"
      ? (hasPersistedCompletion || (hasFormat && hasScoring))
      : true;

    const shouldResume = tournament?.status === "draft" && !wizardComplete;

    if (shouldResume) {
      setWizardTournament(tournament);
      setSelectedTournament(null);
      setShowDashboard(false);
      setShowCreateWizard(true);
      return;
    }

    setSelectedTournament(tournament);
    setDashboardInitialTab('overview');
    setShowDashboard(true);
  };

  const handleCloseDashboard = () => {
    setShowDashboard(false);
    setSelectedTournament(null);
    getTournaments();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <style>{`
        @keyframes tournamentModalIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes tournamentsShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .tournaments-shimmer {
          background: linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%);
          background-size: 200% 100%;
          animation: tournamentsShimmer 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div className="relative rounded-[2rem] overflow-hidden bg-gradient-to-br from-[#0B1A28] via-[#132F45] to-[#1A3F5C] p-8 sm:p-10 shadow-2xl shadow-blue-900/20 border border-white/10 mb-10 text-white">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#FDE68A] border border-white/10">
              <TrophyIcon className="h-4 w-4 text-[#FDE68A]" aria-hidden />
              Tournament Center
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight drop-shadow-md">Tournaments</h1>
            <p className="max-w-2xl text-sm sm:text-base text-blue-100/80 font-medium leading-relaxed">
              Manage and organize all tournaments efficiently — create events, track registration, and open each tournament dashboard when you are ready.
            </p>
          </div>
{/* Original header button preserved for revert:
          <button
            type="button"
            onClick={() => { setWizardTournament(null); setShowCreateWizard(true); }}
            className="group inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-black text-sm uppercase tracking-wide shadow-lg hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] shrink-0 self-start lg:self-center border border-blue-400/30 overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
            <PlusIcon className="h-6 w-6 relative z-10" aria-hidden />
            <span className="relative z-10">Create Tournament</span>
          </button>
*/}
          <TournamentPrerequisiteGuard
            compact
            onAllowed={() => {
              setWizardTournament(null);
              setShowCreateWizard(true);
            }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md overflow-hidden"
            >
              <div className="h-6 w-3/4 tournaments-shimmer rounded-lg mb-4" />
              <div className="flex gap-2 mb-4">
                <div className="h-7 w-20 tournaments-shimmer rounded-full" />
                <div className="h-7 w-24 tournaments-shimmer rounded-full" />
              </div>
              <div className="h-4 w-full tournaments-shimmer rounded mb-2" />
              <div className="h-4 w-2/3 tournaments-shimmer rounded mb-6" />
              <div className="h-10 w-full tournaments-shimmer rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Filter Tabs */}
          <div className="flex gap-2 sm:gap-3 mb-8 overflow-x-auto pb-4 scrollbar-hide">
            {['all', 'draft', 'registration', 'in_progress', 'completed', 'archived', 'withdrawals'].map((status) => (
              <button
                type="button"
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`shrink-0 px-5 py-2.5 text-sm font-bold rounded-full transition-all duration-300 shadow-sm active:scale-95 ${
                  filterStatus === status
                    ? 'bg-blue-600 text-white shadow-blue-500/30'
                    : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-100 hover:shadow-md'
                }`}
              >
                {status === 'withdrawals'
                  ? 'Withdrawals'
                  : status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              </button>
            ))}
          </div>

          {filterStatus === 'withdrawals' && (
            <div className="mb-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
                <h2 className="text-lg font-semibold text-gray-900">Player withdrawals</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Players who withdrew from your tournaments (newest first). Contact them or adjust the draw in the tournament dashboard if needed.
                </p>
              </div>
              {withdrawalsLoading ? (
                <div className="p-10 text-center text-gray-500 text-sm">Loading…</div>
              ) : withdrawalsError ? (
                <div className="p-6 text-center text-red-600 text-sm">{withdrawalsError}</div>
              ) : withdrawalRows.length === 0 ? (
                <div className="p-10 text-center text-gray-500 text-sm">No withdrawals yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-700">
                        <th className="px-4 py-3 font-semibold">Player</th>
                        <th className="px-4 py-3 font-semibold">Tournament</th>
                        <th className="px-4 py-3 font-semibold">Tournament status</th>
                        <th className="px-4 py-3 font-semibold">Stage</th>
                        <th className="px-4 py-3 font-semibold">Withdrawn</th>
                        <th className="px-4 py-3 font-semibold">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawalRows.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                          <td className="px-4 py-3 text-gray-900 font-medium">{row.playerName || '—'}</td>
                          <td className="px-4 py-3 text-gray-800">{row.tournamentName || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 capitalize">{String(row.tournamentStatus || '').replace(/_/g, ' ') || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 capitalize">{String(row.withdrawalStage || '').replace(/_/g, ' ') || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {row.withdrawnDate
                              ? new Date(row.withdrawnDate).toLocaleString()
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={row.withdrawalReason || ''}>
                            {row.withdrawalReason || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tournament Grid */}
          {filterStatus !== 'withdrawals' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTournaments.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-16 px-4 text-center">
                {/*
                  REVERT NOTE: original empty-state content was:
                    <div ...trophy/>  <h2>No tournaments found</h2>
                    <p>{filterStatus==='all' ? 'Create your first tournament to get started'
                        : 'No tournaments match the "<filter>" filter.'}</p>
                    {filterStatus==='all' && (
                       button: setWizardTournament(null); setShowCreateWizard(true);
                       -> later replaced by <TournamentPrerequisiteGuard onAllowed=... />)}
                  Restore that block to undo this empty-state change.
                */}
                {filterStatus === 'all' ? (
                  // Default view, no tournaments: the prerequisite guard IS the
                  // empty state — full "Complete These Steps..." panel when a
                  // club/venue is missing, or the Create Tournament button when ready.
                  <div className="w-full max-w-xl">
                    <TournamentPrerequisiteGuard
                      onAllowed={() => {
                        setWizardTournament(null);
                        setShowCreateWizard(true);
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl bg-gray-100 p-5 mb-5 text-gray-500">
                      <TrophyIcon className="h-12 w-12 mx-auto" aria-hidden />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">No tournaments found</h2>
                    <p className="mt-2 text-gray-600 text-sm max-w-md">
                      {`No tournaments match the “${filterStatus.replace('_', ' ')}” filter.`}
                    </p>
                  </>
                )}
              </div>
            ) : (
              filteredTournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} onSelect={handleSelectTournament} />
              ))
            )}
          </div>
          )}
        </>
      )}

      {/* Create Tournament Modal */}
      {showCreateWizard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-auto animate-[tournamentModalIn_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <TournamentCreationWizard
              tournamentToResume={wizardTournament}
              onComplete={handleTournamentCreated}
              onDraftCreated={() => getTournaments()}
              onClose={() => {
                setShowCreateWizard(false);
                setWizardTournament(null);
                getTournaments();
              }}
            />
          </div>
        </div>
      )}

      {/* Tournament Dashboard Modal */}
      {showDashboard && selectedTournament && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto my-auto animate-[tournamentModalIn_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <TournamentDashboard
              tournament={selectedTournament}
              onClose={handleCloseDashboard}
              onTournamentUpdated={(t) => t && setSelectedTournament(t)}
              initialTab={dashboardInitialTab}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tournament Card Component
 */
function TournamentCard({ tournament, onSelect }) {
  const navigate = useNavigate();
  const venueApprovalState = tournament?.venueRequestStatus || "none";
  const venueApprovalBadge = (() => {
    if (venueApprovalState === "pending") return { bg: "bg-amber-50 text-amber-900 border border-amber-100", text: "Pending Venue Approval" };
    if (venueApprovalState === "approved") return { bg: "bg-green-50 text-green-800 border border-green-100", text: "Approved" };
    if (venueApprovalState === "rejected") return { bg: "bg-red-50 text-red-800 border border-red-100", text: "Venue Rejected" };
    return null;
  })();

  const tierColors = {
    tier1: 'bg-yellow-100 text-yellow-900 border border-yellow-200/80',
    tier2: 'bg-gray-200 text-gray-900 border border-gray-300/80',
    tier3: 'bg-orange-100 text-orange-900 border border-orange-200/80',
  };

  // Helper function to check if a join code is expired
  const isCodeExpired = (code) => {
    if (!code.joinCodeExpiresAt) return false;
    return new Date() > new Date(code.joinCodeExpiresAt);
  };

  // Filter only non-expired join codes
  const activeNonExpiredCodes = (tournament?.activeJoinCodes || []).filter((code) => !isCodeExpired(code));

  const hasFormat = Boolean(tournament?.format?.type || tournament?.formatId);
  const hasScoring = Boolean(
    tournament?.scoringRules?.pointsWin != null || tournament?.scoringRulesId
  );
  const hasPersistedCompletion = tournament?.setupCompleted === true;
  const wizardComplete = tournament?.status === "draft"
    ? (hasPersistedCompletion || (hasFormat && hasScoring))
    : true;

  const blockCardClick =
    tournament?.status === "draft" && !wizardComplete && venueApprovalState === "pending";

  const startLabel = tournament.startDate
    ? new Date(tournament.startDate).toLocaleDateString()
    : '—';
  const endLabel = tournament.endDate
    ? new Date(tournament.endDate).toLocaleDateString()
    : '—';
  const registrationDeadlineLabel = tournament.registrationDeadline
    ? new Date(tournament.registrationDeadline).toLocaleDateString()
    : '—';

  const statusBadge = statusBadgeForTournament(tournament);
  const sportStr =
    typeof tournament.sport === 'string'
      ? tournament.sport
      : tournament.sport != null
        ? String(tournament.sport)
        : '';
  const sportDisplay =
    sportStr && sportStr.length > 0
      ? sportStr.charAt(0).toUpperCase() + sportStr.slice(1).toLowerCase()
      : 'Sport';

  return (
    <div
      className="group bg-white rounded-[1.5rem] border border-gray-100 p-6 shadow-sm hover:shadow-2xl hover:shadow-blue-900/10 transition-all duration-500 flex flex-col h-full relative overflow-hidden bg-clip-padding backdrop-filter backdrop-blur-xl"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col gap-3 mb-5">
        <div className="flex flex-wrap items-start gap-2 justify-between">
          <h3 className="text-xl font-bold text-gray-900 leading-snug pr-2 flex-1 min-w-48 group-hover:text-blue-700 transition-colors duration-300">
            {tournament.name}
          </h3>
          <span
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mt-1">
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${sportBadgeStyles(sportStr)}`}
          >
            {sportDisplay}
          </span>
          {venueApprovalBadge && (
            <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${venueApprovalBadge.bg}`}>
              {venueApprovalBadge.text}
            </span>
          )}
          {tournament.ranked && tournament.tier && (
            <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${tierColors[tournament.tier] ?? tierColors.tier2}`}>
              {tournament.tier.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="relative z-10 mb-5 rounded-2xl bg-gray-50/80 border border-gray-100/80 p-4 text-sm group-hover:bg-white group-hover:border-blue-100 transition-all duration-300 shadow-inner group-hover:shadow-sm">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">Schedule</p>
        <div className="flex flex-wrap items-center gap-2 text-gray-800 font-bold">
          <span>{startLabel}</span>
          <ChevronRightIcon className="h-4 w-4 text-blue-400 shrink-0" aria-hidden />
          <span>{endLabel}</span>
        </div>
        <p className="mt-2.5 text-xs text-gray-500 font-medium">
          Registration closes: <span className="font-bold text-gray-900">{registrationDeadlineLabel}</span>
        </p>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-4 text-sm mb-5">
        <div className="p-3 rounded-xl bg-gray-50 group-hover:bg-blue-50/30 transition-colors duration-300">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">Format</p>
          <p className="text-gray-900 font-bold">{formatTournamentFormat(tournament)}</p>
        </div>
        <div className="p-3 rounded-xl bg-gray-50 group-hover:bg-blue-50/30 transition-colors duration-300">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">Players</p>
          <p className="text-gray-900 font-bold">
            {tournament.currentParticipantCount} / {tournament.maxParticipants || '∞'}
          </p>
        </div>
      </div>

      {tournament.allowLateRegistration && (
        <div className="mb-4 text-xs text-blue-700 bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2">
          Late registration allowed
          {tournament.lateRegistrationDeadline
            ? ` until ${new Date(tournament.lateRegistrationDeadline).toLocaleDateString()}`
            : ''}
        </div>
      )}

      {tournament.entryFee && (
        <div className="mb-4 p-3 bg-green-50 rounded-xl border border-green-100">
          <p className="text-xs font-medium text-green-800 uppercase tracking-wide">Entry fee</p>
          <p className="text-sm font-semibold text-green-900 mt-0.5">£{tournament.entryFee}</p>
        </div>
      )}

      {activeNonExpiredCodes.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-xs font-semibold text-blue-700 mb-2">Join code available</p>
          <p className="font-mono font-bold text-lg text-blue-600">{activeNonExpiredCodes[0].joinCode}</p>
          <p className="text-xs text-blue-600 mt-1">
            Expires: {new Date(activeNonExpiredCodes[0].joinCodeExpiresAt).toLocaleDateString()}
          </p>
        </div>
      )}

      <div className="relative z-10 mt-auto pt-3">
        {tournament?.status === "draft" && !wizardComplete ? (
          <button
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold hover:shadow-[0_4px_15px_rgba(37,99,235,0.4)] transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none active:scale-95 overflow-hidden group/btn relative"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/organization/tournaments/${tournament.id}`);
            }}
            disabled={venueApprovalState === "pending"}
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 ease-in-out"></div>
            <ArrowPathIcon className="h-5 w-5 shrink-0 relative z-10 group-hover/btn:rotate-180 transition-transform duration-500" aria-hidden />
            <span className="relative z-10">{venueApprovalState === "pending" ? "Waiting for venue approval" : "Continue setup"}</span>
          </button>
        ) : (
          <button
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold hover:shadow-[0_4px_15px_rgba(37,99,235,0.4)] transition-all duration-300 active:scale-95 overflow-hidden group/btn relative"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/organization/tournaments/${tournament.id}`);
            }}
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 ease-in-out"></div>
            <EyeIcon className="h-5 w-5 shrink-0 relative z-10 group-hover/btn:scale-110 transition-transform duration-300" aria-hidden />
            <span className="relative z-10">View Details</span>
          </button>
        )}
      </div>
    </div>
  );
}
