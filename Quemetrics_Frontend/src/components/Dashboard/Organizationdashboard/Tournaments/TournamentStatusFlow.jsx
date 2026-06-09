import React, { useState } from 'react';
import {
  FaCheckCircle,
  FaCircle,
  FaArrowRight,
  FaClock,
  FaExclamationTriangle,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';
import { getLateEntryGate } from '../../../../lib/utils/registrationWindow';

/**
 * TournamentStatusFlow Component
 * Displays tournament lifecycle progression and available actions per status
 */
export default function TournamentStatusFlow({
  tournament,
  onStatusChange,
  onLockRegistration,
  onCompleteTournament,
  onAddLatePlayer,
  compact = false,
}) {
  const [expandedHistory, setExpandedHistory] = useState(false);

  const venueApprovalState = tournament?.venueRequestStatus || "none";

  const lateEntryGate = getLateEntryGate(tournament);

  // Get entry methods - handle both object and parsed JSON
  const getEntryMethods = () => {
    const methods = tournament.entryMethods;
    if (typeof methods === 'string') {
      try {
        return JSON.parse(methods);
      } catch {
        return {};
      }
    }
    return methods || {};
  };

  const entryMethods = getEntryMethods();

  const statusFlow = [
    {
      status: 'draft',
      label: 'Draft',
      color: 'yellow',
      icon: '📋',
      description: 'Configure tournament settings and rules',
      prerequisites: [],
      allowedActions: [
        { label: 'Edit Settings', action: 'edit_settings', condition: true },
        {
          label: 'Start Registration',
          action: 'start_registration',
          condition: true,
          requires: ['setup_complete', 'venue_approved'],
        },
      ],
    },
    {
      status: 'registration',
      label: 'Registration',
      color: 'blue',
      icon: '🚪',
      description: 'Accept player registrations and manage participant list',
      prerequisites: ['draft'],
      allowedActions: [
        // {
        //   label: 'Add Players',
        //   action: 'add_players',
        //   condition: () => entryMethods.adminEntry,
        //   disabledReason: 'Admin entry is not enabled for this tournament',
        // },
        // {
        //   label: 'Invite Players',
        //   action: 'invite_players',
        //   condition: () => entryMethods.invitationLink,
        //   disabledReason: 'Invitation links are not enabled for this tournament',
        // },
        // {
        //   label: 'Generate Join Code',
        //   action: 'generate_join_code',
        //   condition: () => entryMethods.joinCode,
        //   disabledReason: 'Join codes are not enabled for this tournament',
        // },
        {
          label: 'Lock Registration & Generate Fixtures',
          action: 'lock_and_generate',
          condition: () => (tournament.approvedParticipants || 0) > 1,
          requires: ['participants_approved'],
          confirmText: 'Are you sure? This will lock the participant list and auto-generate all fixtures. This cannot be undone.',
        },
      ],
    },
    {
      status: 'registration_closed',
      label: 'Reg. Closed',
      color: 'orange',
      icon: '🔒',
      description: 'Registration closed — ready to generate fixtures',
      prerequisites: ['registration'],
      allowedActions: [
        {
          label: 'Generate Fixtures',
          action: 'lock_and_generate',
          condition: true,
          confirmText: 'Generate fixtures for the registered players? This cannot be undone.',
        },
      ],
    },
    {
      status: 'fixtures_generated',
      label: 'Fixtures Ready',
      color: 'teal',
      icon: '📅',
      description: 'Fixtures generated — schedule matches and start the tournament',
      prerequisites: ['registration_closed'],
      allowedActions: [
        { label: 'View Bracket', action: 'view_bracket', condition: true },
        {
          label: '⚡ Late Entry',
          action: 'add_late_player',
          condition: () => lateEntryGate.enabled,
          disabledReason: lateEntryGate.reason || 'Late entry is not available for this tournament',
        },
        { label: 'Start Tournament', action: 'start_tournament', condition: true },
      ],
    },
    {
      status: 'in_progress',
      label: 'In Progress',
      color: 'green',
      icon: '⚡',
      description: 'Matches are being played and results are being recorded',
      prerequisites: ['fixtures_generated'],
      allowedActions: [
        // { label: 'Record Match Result', action: 'record_match', condition: true },
        {
          label: '⚡ Late Entry',
          action: 'add_late_player',
          condition: () => lateEntryGate.enabled,
          disabledReason: lateEntryGate.reason || 'Late entry is not available for this tournament',
        },
        // { label: 'Handle Dispute', action: 'handle_dispute', condition: true },
        // { label: 'Reschedule Match', action: 'reschedule_match', condition: true },
      ],
    },
    {
      status: 'completed',
      label: 'Completed',
      color: 'purple',
      icon: '✅',
      description: 'All matches completed, ready to award ranking points',
      prerequisites: ['in_progress'],
      allowedActions: [
        {
          label: tournament.ranked ? 'Award Ranking Points' : 'Archive Tournament',
          action: tournament.ranked ? 'award_points' : 'archive_tournament',
          condition: true,
          requires: tournament.ranked ? ['all_matches_completed'] : [],
          confirmText: 'This action is permanent and cannot be undone.',
        },
      ],
    },
    {
      status: 'archived',
      label: 'Archived',
      color: 'gray',
      icon: '📦',
      description: 'Tournament permanently archived with all historical data locked',
      prerequisites: ['completed'],
      allowedActions: [
        { label: 'View Details', action: 'view_details', condition: true },
        { label: 'Export Results', action: 'export_results', condition: true },
      ],
    },
  ];

  const currentStatusIndex = statusFlow.findIndex((s) => s.status === tournament.status);
  const currentStatusInfo = statusFlow[currentStatusIndex];

  const getStatusColor = (color, isCurrent, isCompleted) => {
    const colors = {
      yellow: isCurrent ? 'bg-yellow-500' : isCompleted ? 'bg-green-500' : 'bg-gray-300',
      blue: isCurrent ? 'bg-blue-500' : isCompleted ? 'bg-green-500' : 'bg-gray-300',
      orange: isCurrent ? 'bg-orange-500' : isCompleted ? 'bg-green-500' : 'bg-gray-300',
      teal: isCurrent ? 'bg-teal-500' : isCompleted ? 'bg-green-500' : 'bg-gray-300',
      green: isCurrent ? 'bg-green-500' : isCompleted ? 'bg-green-500' : 'bg-gray-300',
      purple: isCurrent ? 'bg-purple-500' : isCompleted ? 'bg-green-500' : 'bg-gray-300',
      gray: isCurrent ? 'bg-gray-500' : isCompleted ? 'bg-green-500' : 'bg-gray-300',
    };
    return colors[color];
  };

  const handleActionClick = (action) => {
    if (action.confirmText && !window.confirm(action.confirmText)) {
      return;
    }

    switch (action.action) {
      case 'start_registration':
        onStatusChange?.('start_registration');
        break;
      case 'lock_and_generate':
        if (onLockRegistration) onLockRegistration();
        break;
      case 'award_points':
      case 'archive_tournament':
        onCompleteTournament?.();
        break;
      case 'view_bracket':
        onStatusChange?.('view_bracket');
        break;
      case 'start_tournament':
        onStatusChange?.('start_tournament');
        break;
      case 'add_late_player':
        onAddLatePlayer?.();
        break;
      case 'edit_settings':
      case 'add_players':
      case 'invite_players':
      case 'generate_join_code':
      case 'record_match':
      case 'handle_dispute':
      case 'reschedule_match':
      case 'view_details':
      case 'export_results':
        // These are handled by parent component or separate UI
        onStatusChange?.(action.action);
        break;
      default:
        break;
    }
  };

  const statusHistory = [
    {
      status: 'draft',
      timestamp: tournament.createdAt,
      label: 'Draft',
    },
    ...(tournament.registrationStartedAt
      ? [
          {
            status: 'registration',
            timestamp: tournament.registrationStartedAt,
            label: 'Registration Started',
          },
        ]
      : []),
    ...(tournament.startedAt
      ? [
          {
            status: 'in_progress',
            timestamp: tournament.startedAt,
            label: 'Tournament Started',
          },
        ]
      : []),
    ...(tournament.completedAt
      ? [
          {
            status: 'completed',
            timestamp: tournament.completedAt,
            label: 'Tournament Completed',
          },
        ]
      : []),
    ...(tournament.archivedAt
      ? [
          {
            status: 'archived',
            timestamp: tournament.archivedAt,
            label: 'Tournament Archived',
          },
        ]
      : []),
  ];

  const getPrerequisiteStatus = (action) => {
    if (!action.requires || action.requires.length === 0) return 'met';

    for (const req of action.requires) {
      if (req === 'participants_approved' && tournament.pendingParticipantsCount > 0) {
        return `pending_approval:${tournament.pendingParticipantsCount}`;
      }
      if (req === 'venue_approved') {
        if (tournament.venueRequestStatus === 'pending') return 'pending_venue_approval';
        if (tournament.venueRequestStatus === 'rejected') return 'rejected_venue_approval';
      }
      if (req === 'setup_complete') {
        const explicitComplete = tournament?.setupCompleted === true;
        const steps = Array.isArray(tournament?.setupCompletedSteps)
          ? tournament.setupCompletedSteps.map((s) => Number(s))
          : [];
        const allSteps = [1,2,3,4,5,6,7,8,9,10,11].every((s) => steps.includes(s));
        const fallback = Boolean(tournament?.formatId || tournament?.format?.id) && Boolean(tournament?.scoringRulesId || tournament?.scoringRules?.id);
        if (!(explicitComplete || allSteps || fallback)) return 'setup_incomplete';
      }
      if (req === 'all_matches_completed' && tournament.completedMatches < tournament.totalMatches) {
        return `matches:${tournament.completedMatches}/${tournament.totalMatches}`;
      }
    }
    return 'met';
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-xl shadow-blue-900/5 p-6 sm:p-8 mb-10 border border-white">
      {/* Status Header */}
      <div className="mb-8">
        {(venueApprovalState === 'pending' || venueApprovalState === 'rejected' || venueApprovalState === 'approved') && (
          <div
            className={`mb-6 p-5 rounded-2xl border backdrop-blur-md shadow-sm ${
              venueApprovalState === 'pending'
                ? 'bg-yellow-50/80 border-yellow-200/50'
                : venueApprovalState === 'rejected'
                ? 'bg-red-50/80 border-red-200/50'
                : 'bg-green-50/80 border-green-200/50'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-2xl mt-0.5">
                {venueApprovalState === 'pending' && <div className="p-2 bg-yellow-100 rounded-xl text-yellow-600"><FaExclamationTriangle /></div>}
                {venueApprovalState === 'rejected' && <div className="p-2 bg-red-100 rounded-xl text-red-600"><FaExclamationTriangle /></div>}
                {venueApprovalState === 'approved' && <div className="p-2 bg-green-100 rounded-xl text-green-600"><FaCheckCircle /></div>}
              </div>
              <div>
                <h4 className={`text-lg font-bold ${
                  venueApprovalState === 'pending' ? 'text-yellow-900' : venueApprovalState === 'rejected' ? 'text-red-900' : 'text-green-900'
                }`}>
                  {venueApprovalState === 'pending'
                    ? 'Pending Venue Approval'
                    : venueApprovalState === 'rejected'
                    ? 'Venue Approval Rejected'
                    : 'Venue Approved'}
                </h4>
                <p className={`text-sm mt-1 font-medium ${
                  venueApprovalState === 'pending'
                    ? 'text-yellow-800'
                    : venueApprovalState === 'rejected'
                    ? 'text-red-800'
                    : 'text-green-800'
                }`}>
                  {venueApprovalState === 'pending'
                    ? 'Venue approval required from owner.'
                    : venueApprovalState === 'rejected'
                    ? 'Choose another venue to proceed.'
                    : 'Venue is approved. You can start the tournament flow.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-50 text-3xl shadow-sm border border-blue-100/50">
              {currentStatusInfo.icon}
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">{currentStatusInfo.label}</h3>
              <p className="text-sm font-medium text-gray-500 mt-1">{currentStatusInfo.description}</p>
            </div>
          </div>
          {/* Current Status Badge 
          <div className="shrink-0">
            <span
              className={`inline-flex items-center px-4 py-1.5 rounded-lg font-black text-sm uppercase tracking-widest border-2 ${
                currentStatusInfo.color === 'yellow' ? 'border-yellow-500 text-yellow-600 bg-yellow-50/50' :
                currentStatusInfo.color === 'blue' ? 'border-blue-500 text-blue-600 bg-blue-50/50' :
                currentStatusInfo.color === 'orange' ? 'border-orange-500 text-orange-600 bg-orange-50/50' :
                currentStatusInfo.color === 'teal' ? 'border-teal-500 text-teal-600 bg-teal-50/50' :
                currentStatusInfo.color === 'green' ? 'border-green-500 text-green-600 bg-green-50/50' :
                currentStatusInfo.color === 'purple' ? 'border-purple-500 text-purple-600 bg-purple-50/50' :
                'border-gray-500 text-gray-600 bg-gray-50/50'
              }`}
            >
              {currentStatusInfo.label}
            </span>
          </div>
          */}
        </div>
      </div>

      {/* Status Timeline */}
      <div className="mb-10">
        <h4 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-[0.2em]">Tournament Progress</h4>
        <div className="flex items-center justify-between overflow-x-auto pb-4 scrollbar-hide px-2">
          {statusFlow.map((status, index) => {
            const isCompleted = index < currentStatusIndex;
            const isCurrent = status.status === tournament.status;

            return (
              <React.Fragment key={status.status}>
                {/* Status Node */}
                <div className="flex flex-col items-center relative z-10 shrink-0">
                  <div
                    className={`px-4 py-2 rounded-lg border-2 flex items-center justify-center font-black text-[10px] sm:text-xs uppercase tracking-wider transition-all duration-500 shadow-sm ${
                      isCurrent ? 'border-blue-500 text-blue-600 bg-blue-50/80 scale-105 ring-4 ring-blue-500/20' :
                      isCompleted ? 'border-green-500 text-green-600 bg-green-50/80' :
                      'border-gray-300 text-gray-400 bg-gray-50/50'
                    }`}
                  >
                    {isCompleted && <FaCheckCircle className="mr-2 h-3.5 w-3.5" />}
                    {status.label}
                  </div>
                </div>

                {/* Arrow to Next */}
                {index < statusFlow.length - 1 && (
                  <div className="flex-1 px-2 shrink-0 min-w-[20px] sm:min-w-[40px]">
                    <div
                      className={`h-1.5 rounded-full transition-colors duration-500 ${isCompleted ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-gray-200'}`}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Available Actions for Current Status */}
      {currentStatusInfo.allowedActions && currentStatusInfo.allowedActions.length > 0 && (
        <div className="mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-100">
          <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-widest text-center">Next Actions</h4>
          <div className="flex flex-wrap justify-center gap-4">
            {currentStatusInfo.allowedActions.map((action, idx) => {
              const prereqStatus = getPrerequisiteStatus(action);
              const isBlocked = prereqStatus !== 'met';

              const conditionMet = typeof action.condition === 'function'
                ? action.condition()
                : action.condition;

              const isHidden = !conditionMet;
              const isDisabled = isBlocked || isHidden;
              const disabledMessage = isHidden
                ? action.disabledReason || 'This action is not available'
                : prereqStatus !== 'met'
                ? (prereqStatus === 'pending_venue_approval'
                    ? 'Venue approval required'
                    : prereqStatus === 'rejected_venue_approval'
                    ? 'Venue rejected'
                    : prereqStatus === 'setup_incomplete'
                    ? 'Complete setup first'
                    : prereqStatus.startsWith('pending_approval')
                    ? `Waiting for ${prereqStatus.split(':')[1]} player approvals`
                    : `Waiting: ${prereqStatus.split(':')[1]}`)
                : null;

              if (isHidden) return null;

              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => !isDisabled && handleActionClick(action)}
                    disabled={isDisabled}
                    className={`relative inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold transition-all duration-300 active:scale-95 overflow-hidden group/btn min-w-[200px] shadow-sm ${
                      isDisabled
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-[0_4px_15px_rgba(37,99,235,0.4)]'
                    }`}
                    title={isDisabled ? disabledMessage || 'Action unavailable' : ''}
                  >
                    {!isDisabled && <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 ease-in-out"></div>}
                    <span className="relative z-10 text-sm tracking-wide">{action.label}</span>
                    {!isDisabled && <FaArrowRight className="h-4 w-4 relative z-10 shrink-0 group-hover/btn:translate-x-1 transition-transform duration-300" />}
                  </button>
                  {isDisabled && disabledMessage && (
                    <span className="text-[10px] font-semibold text-orange-600 tracking-wide uppercase mt-1">{disabledMessage}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Transition Requirements */}
      {tournament.status === 'registration' && (
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <FaClock className="text-blue-600" /> Registration Deadline
          </h4>
          <p className="text-sm text-blue-800 mb-2">
            Current participants: <strong>{tournament.approvedParticipants || 0}</strong>
            {tournament.maxParticipants && ` / ${tournament.maxParticipants}`}
          </p>
          <p className="text-sm text-blue-800">
            Deadline: <strong>{new Date(tournament.registrationDeadline).toLocaleDateString()}</strong>
          </p>
        </div>
      )}

      {tournament.status === 'in_progress' && (
        <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
            ⚡ Tournament Progress
          </h4>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div
              className="bg-green-500 h-3 rounded-full transition-all"
              style={{
                width: `${(() => {
                  const done = Number(tournament.completedMatches) || 0;
                  const total = Number(tournament.totalMatches) || 0;
                  return total > 0 ? (done / total) * 100 : 0;
                })()}%`,
              }}
            />
          </div>
          <p className="text-sm text-green-800">
            {Number(tournament.completedMatches) || 0} of {Number(tournament.totalMatches) || 0} matches
            completed (
            {(() => {
              const done = Number(tournament.completedMatches) || 0;
              const total = Number(tournament.totalMatches) || 0;
              return total > 0 ? Math.round((done / total) * 100) : 0;
            })()}
            %)
          </p>
        </div>
      )}

      {/* History Toggle */}
      {statusHistory.length > 1 && (
        <div className="border-t border-gray-200 pt-6">
          <button
            onClick={() => setExpandedHistory(!expandedHistory)}
            className="flex items-center gap-2 font-semibold text-gray-700 hover:text-gray-900 transition mb-4"
          >
            {expandedHistory ? <FaChevronUp /> : <FaChevronDown />}
            Status History ({statusHistory.length})
          </button>

          {expandedHistory && (
            <div className="space-y-3">
              {statusHistory.map((entry, idx) => (
                <div key={idx} className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{entry.label}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
