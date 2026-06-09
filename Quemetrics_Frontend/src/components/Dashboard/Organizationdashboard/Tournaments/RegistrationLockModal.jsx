import React, { useState, useEffect, useMemo } from 'react';
import { FaTimes, FaLock, FaExclamationTriangle } from 'react-icons/fa';

function normalizeSeedingFromFormat(value) {
  if (value == null || value === '') return 'random';
  const v = String(value).toLowerCase();

  if (v === 'random' || v === 'ranked' || v === 'manual') return v;
  return 'random';
}

function buildDefaultManualMap(approvedParticipants) {
  const map = {};
  (approvedParticipants || []).forEach((p, i) => {
    const existing =
      p.seed != null
        ? Number(p.seed)
        : p.seedingPosition != null
          ? Number(p.seedingPosition)
          : null;
    map[p.id] = existing != null && !Number.isNaN(existing) ? existing : i + 1;
  });
  return map;
}

function validateManualSeeds(map, approvedParticipants) {
  const n = approvedParticipants.length;
  if (n < 2) return { ok: false, message: 'Need at least 2 participants' };
  const seeds = approvedParticipants.map((p) => Number(map[p.id]));
  if (seeds.some((s) => !Number.isFinite(s) || s < 1)) {
    return { ok: false, message: 'Each seed must be a positive number' };
  }
  const intSeeds = seeds.map((s) => Math.round(s));
  const sorted = [...intSeeds].sort((a, b) => a - b);
  const valid =
    sorted.length === n && sorted[0] === 1 && sorted[n - 1] === n && new Set(intSeeds).size === n;
  if (!valid) {
    return {
      ok: false,
      message: `Seeds must be integers 1–${n} with no duplicates.`,
    };
  }
  return {
    ok: true,
    payload: approvedParticipants.map((p) => ({
      participantId: p.id,
      seed: Math.round(Number(map[p.id])),
    })),
  };
}

/**
 * RegistrationLockModal Component
 * Confirms locking registration and triggers fixture generation
 *
 * @param {Array<{ id: string, playerName?: string, seed?: number }>} approvedParticipants
 */
export default function RegistrationLockModal({
  tournament,
  participantCount,
  approvedParticipants = [],
  onConfirm,
  onCancel,
  loading = false,
  isGeneratingBracket = false,
}) {
  const [seedingMethod, setSeedingMethod] = useState('random');
  const [confirmed, setConfirmed] = useState(false);
  const [manualSeedById, setManualSeedById] = useState({});

  const formatSeeding = tournament?.format?.seeding;

  useEffect(() => {
    setSeedingMethod(normalizeSeedingFromFormat(formatSeeding));
    setConfirmed(false);
  }, [tournament?.id, formatSeeding]);

  useEffect(() => {
    setManualSeedById(buildDefaultManualMap(approvedParticipants));
  }, [tournament?.id, approvedParticipants]);

  const manualValidation = useMemo(() => {
    if (seedingMethod !== 'manual') return { ok: true };
    return validateManualSeeds(manualSeedById, approvedParticipants);
  }, [seedingMethod, manualSeedById, approvedParticipants]);

  const manualPayload = useMemo(() => {
    if (!manualValidation.ok || seedingMethod !== 'manual') return null;
    return manualValidation.payload || null;
  }, [manualValidation, seedingMethod]);

  // Helper function to get readable format name
  const getFormatName = (formatType) => {
    const formatNames = {
      knockout: 'Knockout',
      group_stage: 'Groups',
      groups_knockout: 'Groups + Knockout',
      round_robin: 'Round Robin',
      swiss: 'Swiss System',
    };
    return formatNames[formatType] || formatType;
  };

  const seedingOptions = [
    {
      value: 'random',
      label: 'Random Draw',
      description: 'Players are randomly placed in bracket positions',
      icon: '🎲',
    },
    {
      value: 'ranked',
      label: 'Ranking Seeded',
      description: 'Top-ranked players get preferred bracket positions',
      icon: '⭐',
    },
    {
      value: 'manual',
      label: 'Manual Placement',
      description: 'You assign seed numbers 1–N; lower numbers get better bracket positions',
      icon: '✋',
    },
  ];

  // Per-round preview for knockout (real contests only in round 1; later rounds full pairings)
  const buildKnockoutRoundPreview = (playerCount) => {
    if (playerCount < 2) return { bracketSize: 0, byes: 0, rounds: [], totalRealMatches: 0 };
    let bracketSize = 1;
    while (bracketSize < playerCount) {
      bracketSize *= 2;
    }
    const byes = bracketSize - playerCount;
    const totalRounds = Math.round(Math.log2(bracketSize));
    const rounds = [];
    for (let r = 1; r <= totalRounds; r++) {
      const matchesInRound =
        r === 1 ? bracketSize / 2 - byes : bracketSize / Math.pow(2, r);
      let label;
      if (totalRounds === 1) label = 'Final';
      else if (r === totalRounds) label = 'Final';
      else if (r === totalRounds - 1) label = 'Semi Final';
      else if (r === totalRounds - 2) label = 'Quarter Final';
      else label = `Round ${r}`;
      rounds.push({ round: r, label, matches: matchesInRound });
    }
    return { bracketSize, byes, rounds, totalRounds };
  };

  // Calculate fixture generation stats
  const getFixtureStats = () => {
    const playerCount = participantCount;
    const format = tournament.format?.type || 'knockout';

    if (format === 'knockout') {
      let bracketSize = 1;
      while (bracketSize < playerCount) {
        bracketSize *= 2;
      }
      const byes = bracketSize - playerCount;
      const totalMatches = bracketSize - 1;
      const koPreview = buildKnockoutRoundPreview(playerCount);

      return {
        bracketSize,
        byes,
        totalMatches,
        rounds: Math.ceil(Math.log2(bracketSize)),
        knockoutRoundPreview: koPreview,
      };
    } else if (format === 'group_stage') {
      const groupCount = tournament.format?.groupCount || 4;
      const playersPerGroup = Math.ceil(playerCount / groupCount);
      const matchesPerGroup = (playersPerGroup * (playersPerGroup - 1)) / 2;
      const groupMatches = matchesPerGroup * groupCount;
      const qualifiersPerGroup = tournament.format?.qualifiersPerGroup || 2;
      const knockoutPlayers = qualifiersPerGroup * groupCount;
      const knockoutMatches = knockoutPlayers - 1;

      return {
        groups: groupCount,
        playersPerGroup,
        groupMatches,
        knockoutMatches,
        totalMatches: groupMatches + knockoutMatches,
      };
    } else if (format === 'groups_knockout') {
      const groupCount = tournament.format?.groupCount || 4;
      const playersPerGroup = Math.ceil(playerCount / groupCount);
      const matchesPerGroup = (playersPerGroup * (playersPerGroup - 1)) / 2;
      const groupMatches = matchesPerGroup * groupCount;
      const qualifiersPerGroup = tournament.format?.qualifiersPerGroup || 1;
      const knockoutPlayers = qualifiersPerGroup * groupCount;
      let bracketSize = 1;
      while (bracketSize < knockoutPlayers) {
        bracketSize *= 2;
      }
      const knockoutMatches = bracketSize - 1;

      return {
        groups: groupCount,
        playersPerGroup,
        groupMatches,
        knockoutMatches,
        totalMatches: groupMatches + knockoutMatches,
      };
    } else if (format === 'round_robin') {
      const totalMatches = (playerCount * (playerCount - 1)) / 2;
      return {
        totalMatches,
        playersPerGroup: playerCount,
        rounds: 1,
      };
    } else if (format === 'swiss') {
      const rounds = Math.ceil(Math.log2(playerCount));
      const totalMatches = rounds * (playerCount / 2);
      return {
        totalMatches,
        rounds,
      };
    }

    return { totalMatches: 0 };
  };

  const stats = getFixtureStats();
  const canProceed =
    confirmed &&
    participantCount >= 2 &&
    (seedingMethod !== 'manual' || manualValidation.ok);

  const handleConfirmClick = () => {
    if (seedingMethod === 'manual' && manualPayload) {
      onConfirm(seedingMethod, manualPayload);
    } else {
      onConfirm(seedingMethod);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FaLock className="text-2xl" />
            <h3 className="text-2xl font-bold">Lock Registration & Generate Fixtures</h3>
          </div>
          <button type="button" onClick={onCancel} className="text-white hover:text-red-100 text-2xl">
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Warning */}
          <div className="p-4 bg-orange-50 border-l-4 border-orange-500 rounded flex gap-3">
            <FaExclamationTriangle className="text-orange-600 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-orange-900">This action is permanent</p>
              <p className="text-sm text-orange-800 mt-1">
                Once you lock registration, no more players can join. The fixture bracket will be automatically
                generated based on your settings. You cannot undo this action.
              </p>
            </div>
          </div>

          {/* Participant Summary */}
          {loading ? (
            <div className="p-8 bg-gray-50 border border-gray-300 rounded-lg text-center">
              <p className="text-gray-600 font-medium">Loading participant data...</p>
              <div className="mt-3 flex justify-center">
                <div className="animate-spin text-2xl">⏳</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Final Participant Count</p>
                <p className="text-3xl font-bold text-blue-900">{participantCount}</p>
                {tournament.maxParticipants && (
                  <p className="text-xs text-blue-700 mt-1">of {tournament.maxParticipants} max</p>
                )}
              </div>

              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-600 font-medium">Tournament Format</p>
                <p className="text-2xl font-bold text-purple-900">{getFormatName(tournament.format?.type)}</p>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Total Matches</p>
                <p className="text-3xl font-bold text-green-900">{stats.totalMatches}</p>
                {stats.rounds && <p className="text-xs text-green-700 mt-1">{stats.rounds} rounds</p>}
              </div>
            </div>
          )}

          {/* Fixture Details */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-3">Fixture Generation Summary</h4>
            <div className="space-y-2 text-sm">
              {tournament.format?.type === 'knockout' && (
                <>
                  <p>
                    🎯 <strong>Bracket Size:</strong> {stats.bracketSize} slots (next power of 2 ≥ players)
                  </p>
                  {stats.byes > 0 && (
                    <p>
                      🎫 <strong>Byes:</strong> {stats.byes} — those players skip round 1 (no match row){' '}
                    </p>
                  )}
                  <p>
                    📊 <strong>Bracket pairings (all rounds):</strong> {stats.totalMatches} (including byes as empty
                    slots). <strong>Real contests generated now:</strong>{' '}
                    {stats.knockoutRoundPreview?.rounds?.[0]?.matches ?? '—'} in round 1
                  </p>
                  {stats.knockoutRoundPreview?.rounds?.length > 0 && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Stage</th>
                            <th className="text-right px-3 py-2 font-semibold">Matches</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.knockoutRoundPreview.rounds.map((row) => (
                            <tr key={row.round} className="border-t border-slate-100">
                              <td className="px-3 py-2">{row.label}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.matches}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50">
                        Round 1 “Matches” is head-to-head games only. Later rounds show full pairings; players who
                        received byes appear in the bracket without a round-1 box.
                      </p>
                    </div>
                  )}
                </>
              )}

              {tournament.format?.type === 'group_stage' && (
                <>
                  <p>
                    🎯 <strong>Groups:</strong> {stats.groups} groups of ~{stats.playersPerGroup} players
                  </p>
                  <p>
                    📊 <strong>Group Matches:</strong> {stats.groupMatches} round-robin matches
                  </p>
                  <p>
                    🏆 <strong>Knockouts:</strong> {stats.knockoutMatches} matches after qualification
                  </p>
                </>
              )}

              {tournament.format?.type === 'groups_knockout' && (
                <>
                  <p>
                    🎯 <strong>Groups:</strong> {stats.groups} groups of ~{stats.playersPerGroup} players
                  </p>
                  <p>
                    📊 <strong>Group Matches:</strong> {stats.groupMatches} matches
                  </p>
                  <p>
                    🏆 <strong>Knockout Matches:</strong> {stats.knockoutMatches} matches
                  </p>
                </>
              )}

              {tournament.format?.type === 'round_robin' && (
                <>
                  <p>
                    🎯 <strong>Format:</strong> Every player plays every other player once
                  </p>
                  <p>
                    📊 <strong>Total Matches:</strong> {stats.totalMatches} matches
                  </p>
                  <p>
                    👥 <strong>Participants:</strong> {stats.playersPerGroup} players in single pool
                  </p>
                </>
              )}

              {tournament.format?.type === 'swiss' && (
                <>
                  <p>
                    🎯 <strong>Format:</strong> Swiss system tournament
                  </p>
                  <p>
                    📊 <strong>Rounds:</strong> {stats.rounds} rounds
                  </p>
                  <p>
                    🏆 <strong>Total Matches:</strong> {stats.totalMatches} matches
                  </p>
                  <p className="text-xs text-gray-600 mt-2">Players are paired based on current standings each round</p>
                </>
              )}

              <p className="mt-3 text-gray-700">
                ✓ Match deadlines will be set based on your scheduling configuration
              </p>
              <p className="text-gray-700">
                ✓ Seeding will be applied using{' '}
                <strong>{seedingOptions.find((s) => s.value === seedingMethod)?.label}</strong> method
              </p>
              {formatSeeding && (
                <p className="text-xs text-gray-500">Saved tournament default: {String(formatSeeding)}</p>
              )}
            </div>
          </div>

          {/* Seeding Method Selection */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">How should players be seeded?</h4>
            <div className="space-y-2">
              {seedingOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                    seedingMethod === option.value
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="seeding"
                    value={option.value}
                    checked={seedingMethod === option.value}
                    onChange={(e) => setSeedingMethod(e.target.value)}
                    className="mt-1 w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {option.icon} {option.label}
                    </p>
                    <p className="text-sm text-gray-600">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {seedingMethod === 'manual' && approvedParticipants.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4 bg-slate-50">
              <h4 className="font-semibold text-gray-900 mb-2">Assign seeds (1 = best)</h4>
              <p className="text-xs text-gray-600 mb-3">
                Enter each number from 1 to {approvedParticipants.length} exactly once.
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {approvedParticipants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    <label className="flex-1 font-medium text-gray-800 truncate">
                      {p.playerName || 'Player'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={approvedParticipants.length}
                      value={manualSeedById[p.id] ?? ''}
                      onChange={(e) =>
                        setManualSeedById((prev) => ({
                          ...prev,
                          [p.id]: e.target.value === '' ? '' : Number(e.target.value),
                        }))
                      }
                      className="w-20 px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                ))}
              </div>
              {!manualValidation.ok && (
                <p className="text-sm text-red-600 mt-2">{manualValidation.message}</p>
              )}
            </div>
          )}

          {/* Confirmation Checkbox */}
          <div className="p-4 border-2 border-red-300 bg-red-50 rounded-lg">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-5 h-5 mt-1 cursor-pointer"
              />
              <div>
                <p className="font-semibold text-red-900">I understand this action is permanent</p>
                <p className="text-sm text-red-800 mt-1">
                  Registration will be locked, fixtures generated, and I cannot undo this action. All {participantCount}{' '}
                  participants will be confirmed and tournament starts after this.
                </p>
              </div>
            </label>
          </div>

          {/* Minimum Players Check */}
          {participantCount < 2 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <FaExclamationTriangle className="text-red-600 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold text-red-900">Not enough participants</p>
                <p className="text-sm text-red-800">You need at least 2 participants to lock registration</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading || isGeneratingBracket}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-900 hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={!canProceed || loading || isGeneratingBracket}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition ${
              canProceed && !loading && !isGeneratingBracket
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-300 text-gray-600 cursor-not-allowed'
            }`}
          >
            {loading || isGeneratingBracket ? (
              <>
                <span className="animate-spin">⏳</span>
                Generating Fixtures...
              </>
            ) : (
              <>
                <FaLock />
                Lock & Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
