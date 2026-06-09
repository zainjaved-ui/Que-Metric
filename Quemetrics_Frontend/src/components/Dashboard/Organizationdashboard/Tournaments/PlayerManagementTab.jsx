import React, { useState } from 'react';
import {
  FaUserPlus,
  FaCheckCircle,
  FaTimesCircle,
  FaUserClock,
  FaTrash,
  FaSearch,
  FaDownload,
  FaLock,
  FaSpinner,
} from 'react-icons/fa';
import { getLateEntryGate, isRegistrationOpenUTC } from '../../../../lib/utils/registrationWindow';

/**
 * PlayerManagementTab Component
 * Manage tournament participants: approve/reject/add/remove players
 */
/** True once any real head-to-head match is underway or finished (excludes bye-only rows with one player). */
function hasCompetitionStarted(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return false;
  return matches.some((m) => {
    if (m.status === 'in_progress') return true;
    if (m.status === 'completed' && m.player1Id && m.player2Id) return true;
    return false;
  });
}

function parseWithdrawalRules(tournament) {
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
}

export default function PlayerManagementTab({
  tournament,
  participants,
  matches = [],
  loading,
  existingJoinCodes = [],
  onAddPlayers,
  onInvitePlayers,
  onGenerateJoinCode,
  onApproveParticipant,
  onRejectParticipant,
  onRemoveParticipant,
  onLockRegistration,
  onExportParticipants,
  onAddLatePlayer,
}) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('joinDate');
  const [selectedParticipants, setSelectedParticipants] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [removingParticipantId, setRemovingParticipantId] = useState(null);

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
  const registrationOpen = isRegistrationOpenUTC(tournament);
  const lateEntryGate = getLateEntryGate(tournament);

  /**
   * Organizer remove (trash) is allowed before the event is truly underway.
   * Uses `completedMatches` from the tournament payload when present so Remove stays available if match rows are not loaded yet.
   */
  const canRemoveApprovedParticipant = (() => {
    const s = tournament?.status;
    const completedFromApi =
      tournament?.completedMatches != null && Number(tournament.completedMatches) > 0;
    const playStarted = hasCompetitionStarted(matches) || completedFromApi;

    if (
      s === 'draft' ||
      s === 'registration' ||
      s === 'registration_closed' ||
      s === 'fixtures_generated'
    ) {
      return true;
    }
    if (s === 'in_progress') return !playStarted;
    return false;
  })();

  const wrParsed = parseWithdrawalRules(tournament);
  const beforeStartRule = String(wrParsed.beforeStart ?? wrParsed.before_start ?? 'remove').toLowerCase();
  /** When "before start" is forfeit, hide organizer delete — exits go through player self-withdraw (forfeit handling). */
  const showOrganizerRemoveButton = beforeStartRule !== 'forfeit';

  // Helper function to check if a join code is expired
  const isCodeExpired = (code) => {
    if (!code.joinCodeExpiresAt) return false;
    return new Date() > new Date(code.joinCodeExpiresAt);
  };

  // Filter only non-expired join codes
  const activeNonExpiredCodes = existingJoinCodes.filter((code) => !isCodeExpired(code));

  // Normalize participant fields to support different backend shapes
  const normalizedParticipants = (participants || []).map((p) => ({
    ...p,
    playerName: p.player?.name || p.playerName || p.player?.displayName || '',
    seedingPosition:
      p.seed ??
      p.seedingPosition ??
      p.seedPosition ??
      p.currentPosition ??
      (p.player && (p.player.seed ?? p.player.currentPosition)) ??
      null,
  }));

  // Filter and sort participants
  const filteredParticipants = normalizedParticipants
    .filter((p) => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (
        searchTerm &&
        !p.playerName.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.playerName || '').localeCompare(b.playerName || '');
        case 'status':
          return a.status.localeCompare(b.status);
        case 'joinDate':
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });
  const statusCounts = {
    pending: normalizedParticipants.filter((p) => p.status === 'pending').length,
    approved: normalizedParticipants.filter((p) => p.status === 'approved').length,
    rejected: normalizedParticipants.filter((p) => p.status === 'rejected').length,
    withdrawn: normalizedParticipants.filter((p) => p.status === 'withdrawn').length,
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedParticipants(new Set(filteredParticipants.map((p) => p.id)));
    } else {
      setSelectedParticipants(new Set());
    }
  };

  const handleSelectParticipant = (participantId, checked) => {
    const newSelection = new Set(selectedParticipants);
    if (checked) {
      newSelection.add(participantId);
    } else {
      newSelection.delete(participantId);
    }
    setSelectedParticipants(newSelection);
  };

  const handleBulkApprove = async () => {
    if (selectedParticipants.size === 0) return;
    if (!window.confirm(`Approve ${selectedParticipants.size} participants?`)) return;

    for (const participantId of selectedParticipants) {
      await onApproveParticipant(participantId);
    }
    setSelectedParticipants(new Set());
  };

  const handleExportParticipants = async () => {
    if (!onExportParticipants) return;
    setExporting(true);
    try {
      await onExportParticipants(tournament.id);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export participants. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⏳' },
      approved: { bg: 'bg-green-100', text: 'text-green-800', icon: '✓' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: '✗' },
      withdrawn: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '👋' },
      disqualified: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌' },
    };
    const badge = badges[status] || badges.pending;
    return badge;
  };

  const getRegistrationMethodBadge = (method) => {
    const methods = {
      admin: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Manual Add' },
      manual: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Manual Add' },
      self: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Self Registered' },
      self_registration: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Self Registered' },
      invitation_link: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Invite Link' },
      invitation: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Invite Link' },
      open_request: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Open Request' },
      join_code: { bg: 'bg-cyan-100', text: 'text-cyan-800', label: 'Join Code' },
    };
    const m = methods[method] || methods.admin;
    return m;
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
        <div>
          <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl shadow-sm"><FaUserPlus className="w-5 h-5" /></div>
            Participant Management
          </h3>
          <p className="text-gray-500 font-medium mt-2">
            Total: <span className="text-gray-900 font-bold">{participants.length}</span> players
            {tournament.maxParticipants && ` / ${tournament.maxParticipants}`}
          </p>
          {!showOrganizerRemoveButton && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
              <span>⚠️</span> This tournament uses "forfeit" before start: players must self-withdraw. Organizer remove is disabled.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {tournament.status === 'registration' && tournament.registrationDeadline && (
            <>
              {entryMethods.adminEntry && (
                <button
                  onClick={onAddPlayers}
                  disabled={!registrationOpen}
                  title={registrationOpen ? 'Add Players' : 'Registration deadline passed. Cannot add players.'}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 ${
                    !registrationOpen
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-[0_4px_15px_rgba(37,99,235,0.4)] hover:-translate-y-0.5'
                  }`}
                >
                  <FaUserPlus /> Add Players
                </button>
              )}
              {entryMethods.invitationLink && (
                <button
                  onClick={onInvitePlayers}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-bold hover:shadow-[0_4px_15px_rgba(168,85,247,0.4)] hover:-translate-y-0.5 transition-all active:scale-95 shadow-sm"
                >
                  📧 Invite
                </button>
              )}
              {entryMethods.joinCode && activeNonExpiredCodes.length === 0 && (
                <button
                  onClick={onGenerateJoinCode}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl font-bold hover:shadow-[0_4px_15px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 transition-all active:scale-95 shadow-sm"
                  title="Generate a new join code"
                >
                  🔗 Join Code
                </button>
              )}
              {/*
              <button
                onClick={onLockRegistration}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-bold hover:shadow-[0_4px_15px_rgba(239,68,68,0.4)] hover:-translate-y-0.5 transition-all active:scale-95 shadow-sm"
              >
                <FaLock /> Lock & Generate
              </button>
              */}
            </>
          )}
          {/* {['fixtures_generated', 'in_progress'].includes(tournament.status) && onAddLatePlayer && lateEntryGate.enabled && (
            <button
              onClick={onAddLatePlayer}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-bold hover:shadow-[0_4px_15px_rgba(245,158,11,0.4)] hover:-translate-y-0.5 transition-all active:scale-95 shadow-sm"
              title={lateEntryGate.reason || 'Add late players with intelligent fixture regeneration'}
            >
              ⚡ Late Entry
            </button>
          )} */}
          {participants.length > 0 && (
            <button
              onClick={handleExportParticipants}
              disabled={exporting}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 hover:shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? <FaSpinner className="animate-spin" /> : <FaDownload />} {exporting ? 'Exporting...' : 'Export'}
            </button>
          )}
        </div>
      </div>

      {/* Existing Join Codes Display */}
      {activeNonExpiredCodes.length > 0 && (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
          <h4 className="font-semibold text-green-900 mb-4 flex items-center gap-2">
            ✓ Active Join Codes
          </h4>
          <div className="space-y-3">
            {activeNonExpiredCodes.map((code) => (
              <div key={code.id} className="bg-white rounded-lg p-3 border border-green-200 flex justify-between items-start">
                <div>
                  <p className="font-mono text-2xl font-bold text-green-600 mb-2">{code.joinCode}</p>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>📅 Expires: {new Date(code.joinCodeExpiresAt).toLocaleDateString()}</p>
                    <p>📊 Uses: {code.usageCount || 0} / {code.maxUsages || '∞'}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(code.joinCode);
                    alert('Join code copied to clipboard!');
                  }}
                  className="px-3 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 transition text-sm"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-green-700 mt-4">💡 Tip: Share these codes with players who want to join the tournament</p>
        </div>
      )}

      {/* Status Filter Tabs & Search Controls Wrapper */}
      <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-gray-100 p-4 shadow-sm mb-6 flex flex-col gap-5">
        {/* Status Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setFilterStatus('all')}
            className={`shrink-0 px-5 py-2.5 text-sm font-bold rounded-full transition-all duration-300 shadow-sm active:scale-95 ${
              filterStatus === 'all'
                ? 'bg-blue-600 text-white shadow-blue-500/30'
                : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-100 hover:shadow-md'
            }`}
          >
            All ({participants.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`shrink-0 px-5 py-2.5 text-sm font-bold rounded-full transition-all duration-300 shadow-sm active:scale-95 flex items-center gap-2 ${
              filterStatus === 'pending'
                ? 'bg-yellow-500 text-white shadow-yellow-500/30'
                : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-yellow-50 hover:border-yellow-200 border border-gray-100 hover:shadow-md'
            }`}
          >
            <span className={filterStatus === 'pending' ? 'text-white' : 'text-yellow-600'}>⏳</span> Pending ({statusCounts.pending})
          </button>
          <button
            onClick={() => setFilterStatus('approved')}
            className={`shrink-0 px-5 py-2.5 text-sm font-bold rounded-full transition-all duration-300 shadow-sm active:scale-95 flex items-center gap-2 ${
              filterStatus === 'approved'
                ? 'bg-green-500 text-white shadow-green-500/30'
                : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-green-50 hover:border-green-200 border border-gray-100 hover:shadow-md'
            }`}
          >
            <span className={filterStatus === 'approved' ? 'text-white' : 'text-green-600'}>✓</span> Approved ({statusCounts.approved})
          </button>
          <button
            onClick={() => setFilterStatus('rejected')}
            className={`shrink-0 px-5 py-2.5 text-sm font-bold rounded-full transition-all duration-300 shadow-sm active:scale-95 flex items-center gap-2 ${
              filterStatus === 'rejected'
                ? 'bg-red-500 text-white shadow-red-500/30'
                : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-red-50 hover:border-red-200 border border-gray-100 hover:shadow-md'
            }`}
          >
            <span className={filterStatus === 'rejected' ? 'text-white' : 'text-red-600'}>✗</span> Rejected ({statusCounts.rejected})
          </button>
          <button
            onClick={() => setFilterStatus('withdrawn')}
            className={`shrink-0 px-5 py-2.5 text-sm font-bold rounded-full transition-all duration-300 shadow-sm active:scale-95 flex items-center gap-2 ${
              filterStatus === 'withdrawn'
                ? 'bg-gray-700 text-white shadow-gray-700/30'
                : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 hover:border-gray-300 border border-gray-100 hover:shadow-md'
            }`}
          >
            <span className={filterStatus === 'withdrawn' ? 'text-white' : 'text-gray-500'}>👋</span> Withdrawn ({statusCounts.withdrawn})
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
              <FaSearch className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Search participants by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm text-sm"
            />
          </div>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full md:w-auto appearance-none bg-white border border-gray-200 text-gray-700 py-3 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm text-sm font-medium cursor-pointer"
            >
              <option value="joinDate">Sort by Join Date</option>
              <option value="name">Sort by Name</option>
              <option value="status">Sort by Status</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedParticipants.size > 0 && filterStatus === 'pending' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
          <p className="text-blue-900 font-medium">{selectedParticipants.size} selected</p>
          <button
            onClick={handleBulkApprove}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
          >
            Approve Selected
          </button>
        </div>
      )}

      {/* Participants Table */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="flex flex-col items-center gap-3">
            <FaSpinner className="animate-spin text-4xl text-blue-500" />
            <p className="text-gray-500 font-medium">Loading participants...</p>
          </div>
        </div>
      ) : filteredParticipants.length === 0 ? (
        <div className="text-center py-20 bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-gray-400">👻</div>
          <p className="text-gray-600 text-lg font-medium">
            {searchTerm ? 'No participants match your search' : 'No participants yet'}
          </p>
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={selectedParticipants.size === filteredParticipants.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 text-left font-bold text-gray-700 uppercase tracking-wider text-xs">Player</th>
                  <th className="px-6 py-4 text-left font-bold text-gray-700 uppercase tracking-wider text-xs">Status</th>
                  <th className="px-6 py-4 text-left font-bold text-gray-700 uppercase tracking-wider text-xs">Method</th>
                  <th className="px-6 py-4 text-left font-bold text-gray-700 uppercase tracking-wider text-xs">Joined</th>
                  <th className="px-6 py-4 text-right font-bold text-gray-700 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredParticipants.map((participant) => {
                  const badge = getStatusBadge(participant.status);
                  const methodBadge = getRegistrationMethodBadge(participant.registrationMethod);

                  return (
                    <tr key={participant.id} className="hover:bg-blue-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedParticipants.has(participant.id)}
                          onChange={(e) => handleSelectParticipant(participant.id, e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Player Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold shrink-0">
                            {participant.playerName.charAt(0).toUpperCase()}
                          </div>
                          <p className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{participant.playerName}</p>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${badge.bg} ${badge.text} border border-white/50 shadow-sm`}>
                          <span>{badge.icon}</span> {participant.status.replace('_', ' ').charAt(0).toUpperCase() + participant.status.slice(1)}
                        </span>
                      </td>

                      {/* Registration Method */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${methodBadge.bg} ${methodBadge.text} border border-white/50`}
                        >
                          {methodBadge.label}
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td className="px-6 py-4 text-gray-500 font-medium">
                        {new Date(participant.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2 transition-opacity">
                          {participant.status === 'pending' && (
                            <>
                              <button
                                onClick={() => onApproveParticipant(participant.id)}
                                className="p-2 bg-white text-green-600 hover:bg-green-50 rounded-lg shadow-sm border border-gray-200 transition-all hover:-translate-y-0.5"
                                title="Approve"
                              >
                                <FaCheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => onRejectParticipant(participant.id)}
                                className="p-2 bg-white text-red-600 hover:bg-red-50 rounded-lg shadow-sm border border-gray-200 transition-all hover:-translate-y-0.5"
                                title="Reject"
                              >
                                <FaTimesCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {participant.status === 'approved' &&
                            canRemoveApprovedParticipant &&
                            showOrganizerRemoveButton && (
                            <button
                              onClick={async () => {
                                setRemovingParticipantId(participant.id);
                                try {
                                  await onRemoveParticipant(participant.id);
                                } finally {
                                  setRemovingParticipantId(null);
                                }
                              }}
                              disabled={removingParticipantId === participant.id}
                              className="p-2 bg-white text-orange-600 hover:bg-orange-50 rounded-lg shadow-sm border border-gray-200 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                              title="Remove from tournament"
                            >
                              {removingParticipantId === participant.id ? (
                                <FaSpinner className="animate-spin w-4 h-4" />
                              ) : (
                                <FaTrash className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {participant.status === 'withdrawn' && (
                            <button
                              onClick={() => onApproveParticipant(participant.id)}
                              className="p-2 bg-white text-blue-600 hover:bg-blue-50 rounded-lg shadow-sm border border-gray-200 transition-all hover:-translate-y-0.5"
                              title="Re-activate"
                            >
                              ⚡
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        <div className="p-5 bg-white/60 backdrop-blur-md border border-white hover:border-blue-200 rounded-2xl shadow-sm hover:shadow-md transition-all group">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Total</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-blue-600 group-hover:scale-105 transition-transform origin-left">{participants.length}</p>
            <span className="text-sm font-medium text-gray-400">Players</span>
          </div>
        </div>
        {statusCounts.approved > 0 && (
          <div className="p-5 bg-white/60 backdrop-blur-md border border-white hover:border-green-200 rounded-2xl shadow-sm hover:shadow-md transition-all group">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Approved</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-green-600 group-hover:scale-105 transition-transform origin-left">{statusCounts.approved}</p>
            </div>
          </div>
        )}
        {statusCounts.pending > 0 && (
          <div className="p-5 bg-white/60 backdrop-blur-md border border-white hover:border-yellow-200 rounded-2xl shadow-sm hover:shadow-md transition-all group">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Pending</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-yellow-600 group-hover:scale-105 transition-transform origin-left">{statusCounts.pending}</p>
            </div>
          </div>
        )}
        {tournament.maxParticipants && (
          <div className="p-5 bg-white/60 backdrop-blur-md border border-white hover:border-purple-200 rounded-2xl shadow-sm hover:shadow-md transition-all group">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Capacity</p>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl font-black text-purple-600 group-hover:scale-105 transition-transform origin-left">{participants.length}</p>
              <span className="text-xl font-bold text-gray-300">/</span>
              <span className="text-xl font-bold text-gray-600">{tournament.maxParticipants}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
