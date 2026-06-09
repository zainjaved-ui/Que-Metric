import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FaTimes,
  FaCheck,
  FaSpinner,
  FaExclamationTriangle,
  FaInfo,
  FaUsers,
  FaGamepad,
} from 'react-icons/fa';
import Modal from '../../../ui/Modal';
import Button from '../../../ui/Button';
import Card from '../../../ui/Card';
import Alert from '../../../ui/Alert';
import apiClient from '../../../../contexts/apiClient';
import { getLateEntryGate } from '../../../../lib/utils/registrationWindow';

/**
 * LateEntryStrategySelector Component
 *
 * Allows organizers to add late players to a tournament with strategy selection.
 * Shows impact metrics and provides multiple strategies:
 * - REGENERATE: Recreate all fixtures with new player
 * - QUALIFIER: Create Round 0 qualifier match
 * - WAITLIST: Queue player for later addition
 * - FILL_BYE: Assign to existing BYE slot if available
 */
export default function LateEntryStrategySelector({
  isOpen,
  onClose,
  tournament,
  onSuccess,
}) {
  const [step, setStep] = useState(1); // 1: Select Players, 2: Choose Strategy, 3: Review & Confirm
  const [selectedPlayers, setSelectedPlayers] = useState([]); // Available players to add
  const [allAvailablePlayers, setAllAvailablePlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('regenerate');
  const [reseedStrategy, setReseedStrategy] = useState('random');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState(null);

  const tournamentStarted =
    tournament?.status === "in_progress" || tournament?.status === "completed";
  const lateEntryGate = useMemo(() => getLateEntryGate(tournament), [tournament]);
  const allowedStrategies = useMemo(
    () => lateEntryGate.allowedStrategies || [],
    [lateEntryGate.allowedStrategies]
  );

  const strategyOrder = ['regenerate', 'qualifier', 'waitlist', 'fill_bye'];
  const formatType = tournament?.format?.type || tournament?.formatType || tournament?.type || null;
  const approvedParticipantCount = Number(
    tournament?.currentParticipantCount ?? tournament?.approvedCount ?? 0
  ) || 0;
  const playerCountAfterLateEntry = approvedParticipantCount + selectedPlayers.length;

  const isPowerOfTwo = useCallback((value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && (number & (number - 1)) === 0;
  }, []);

  const qualifierBlockedReason = useMemo(() => {
    if (formatType !== 'knockout') return null;
    if (selectedPlayers.length === 0) return null;
    if (!isPowerOfTwo(playerCountAfterLateEntry)) return null;
    return `Qualifier is not available because ${playerCountAfterLateEntry} players already fill the knockout bracket. Use Fill BYE or Regenerate instead.`;
  }, [formatType, isPowerOfTwo, playerCountAfterLateEntry, selectedPlayers.length]);

  const strategyBlockedMessage = useCallback((strategy) => {
    const mode = lateEntryGate.mode;
    if (mode === 'allow_with_waitlist') return 'Only waitlist strategy is enabled for this tournament.';
    if (mode === 'allow_with_qualifier') return 'Only qualifier and waitlist strategies are enabled for this tournament.';
    if (mode === 'allow_before_fixture') return 'Only pre-fixture late entry is enabled for this tournament.';
    if (strategy === 'qualifier' && qualifierBlockedReason) return qualifierBlockedReason;
    return `Strategy "${strategyTitle(strategy)}" is disabled by tournament late-entry mode.`;
  }, [lateEntryGate.mode, qualifierBlockedReason]);

  useEffect(() => {
    if (!isOpen) return;
    if (allowedStrategies.length === 0) {
      setSelectedStrategy('waitlist');
      return;
    }
    if (!allowedStrategies.includes(selectedStrategy)) {
      setSelectedStrategy(allowedStrategies[0]);
    }
  }, [isOpen, allowedStrategies, selectedStrategy]);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedStrategy === 'qualifier' && qualifierBlockedReason) {
      const fallbackStrategy = ['fill_bye', 'regenerate', 'waitlist'].find(
        (strategy) =>
          allowedStrategies.includes(strategy) &&
          !(strategy === 'regenerate' && tournamentStarted)
      );
      if (fallbackStrategy) {
        setSelectedStrategy(fallbackStrategy);
      }
    }
  }, [
    allowedStrategies,
    isOpen,
    qualifierBlockedReason,
    selectedStrategy,
    tournamentStarted,
  ]);

  // Fetch available players (not yet registered)
  const loadAvailablePlayers = useCallback(async () => {
    setLoadingPlayers(true);
    setError(null);
    try {
      // Fetch all available players for this organization (excluding tournament participants)
      // The backend handles filtering based on tournamentId query parameter
      // Adding debug=true to get detailed filtering information
      const response = await apiClient.get(
        `/organizations/${tournament.organizationId}/players`,
        {
          params: {
            tournamentId: tournament.id,
            debug: true  // Get debug info for troubleshooting
          }
        }
      );

      console.log('Player fetch response:', response.data);

      // Log debug information if available
      if (response.data.debug) {
        console.log(`Debug Info:
          - Total players in org: ${response.data.debug.totalInOrg}
          - Already registered: ${response.data.debug.tournamentRegisteredCount}
          - Available for late entry: ${response.data.debug.availableCount}`);
      }

      const raw = response.data.data || [];
      setAllAvailablePlayers(raw);
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      setError(`Failed to load available players: ${errorMsg}`);
      console.error('Error loading available players:', err);
    } finally {
      setLoadingPlayers(false);
    }
  }, [tournament.organizationId, tournament.id]);

  useEffect(() => {
    if (isOpen && step === 1) {
      loadAvailablePlayers();
    }
  }, [isOpen, step, loadAvailablePlayers]);

  const uniqueAvailablePlayers = useMemo(() => {
    const seenId = new Set();
    const seenName = new Set();
    const out = [];
    for (const p of allAvailablePlayers) {
      if (!p?.id) continue;
      if (seenId.has(p.id)) continue; // IMPORTANT: de-dupe by playerId only
      seenId.add(p.id);
      const nm = String(p.playerName || p.name || "").trim().toLowerCase();
      if (nm) {
        if (seenName.has(nm)) continue;
        seenName.add(nm);
      }
      out.push(p);
    }
    return out;
  }, [allAvailablePlayers]);

  const handlePlayerSelect = (playerId, checked) => {
    if (checked) {
      setSelectedPlayers((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId]
      );
    } else {
      setSelectedPlayers((prev) => prev.filter((id) => id !== playerId));
    }
  };

  const handleStrategyChange = (strategy) => {
    setSelectedStrategy(strategy);
  };

  const handleSubmit = async () => {
    if (!lateEntryGate.enabled) {
      setError(lateEntryGate.reason || 'Late entry is currently disabled for this tournament');
      return;
    }

    if (selectedPlayers.length === 0) {
      setError('Please select at least one player');
      return;
    }

    if (!allowedStrategies.includes(selectedStrategy)) {
      setError(strategyBlockedMessage(selectedStrategy));
      return;
    }

    if (selectedStrategy === 'qualifier' && qualifierBlockedReason) {
      setError(qualifierBlockedReason);
      return;
    }

    if (selectedStrategy === "regenerate" && tournamentStarted) {
      setError("Regenerate is restricted after the tournament has started.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiClient.post(
        `/tournaments/${tournament.id}/late-entry`,
        {
          players: selectedPlayers,
          strategy: selectedStrategy,
          reseedType: reseedStrategy,
        }
      );

      setSuccess(
        `Successfully added ${selectedPlayers.length} late player(s) using "${selectedStrategy}" strategy`
      );
      const payload = response?.data?.data || response?.data || null;

      // Call success callback (argument-safe; caller may ignore it)
      if (onSuccess) onSuccess(payload);

      // Notify open match-management pages to refresh fixtures instantly
      window.dispatchEvent(
        new CustomEvent("tournamentLateEntryUpdated", {
          detail: { tournamentId: tournament?.id },
        })
      );

      setSelectedPlayers([]);
      setStep(1);

      // Close modal after brief delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      const apiError = err.response?.data?.error || err.response?.data?.message || err.message;
      setError(`Failed to add late players: ${apiError}`);
      console.error('Error adding late players:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStrategyDescription = (strategy) => {
    const descriptions = {
      regenerate:
        'Recreate ALL fixtures with the new player(s) included. Only safe if no match has started yet.',
      qualifier:
        'Rebuild bracket with a Round 0 (preliminary) path so late player(s) must win in to enter the main draw.',
      waitlist:
        'Add player(s) to the waitlist (participant record). No fixture changes until you promote them.',
      fill_bye:
        'Place player(s) into an existing BYE slot (player2 empty). If no BYE exists, server falls back to full regeneration when possible.',
    };
    return descriptions[strategy] || '';
  };

  const strategyTitle = (strategy) => {
    const map = {
      regenerate: 'Regenerate',
      qualifier: 'Qualifier',
      waitlist: 'Waitlist',
      fill_bye: 'Fill BYE Slots',
    };
    return map[strategy] || strategy;
  };

  const reseedTitle = (rs) =>
    rs === 'lower_priority' ? 'Lower Priority (recommended)' : 'Random';

  const handleReset = () => {
    setStep(1);
    setSelectedPlayers([]);
    setSelectedStrategy('regenerate');
    setReseedStrategy('random');
    setError(null);
    setSuccess(null);
    setImpactData(null);
    setImpactError(null);
    setImpactLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const selectedPlayerNames = selectedPlayers
    .map((id) => {
      const p = uniqueAvailablePlayers.find((x) => x.id === id);
      return p?.playerName || p?.name;
    })
    .filter(Boolean)
    .join(', ');

  useEffect(() => {
    if (isOpen && tournamentStarted && selectedStrategy === "regenerate") {
      setSelectedStrategy("qualifier");
    }
  }, [isOpen, tournamentStarted, selectedStrategy]);

  // Step 2/3: dynamic impact preview (accurate match-count predictions)
  useEffect(() => {
    const run = async () => {
      if (!isOpen || step < 2) return;
      if (!tournament?.id) return;
      if (!lateEntryGate.enabled) {
        setImpactData(null);
        setImpactError(lateEntryGate.reason || 'Late entry is currently disabled for this tournament.');
        return;
      }
      if (selectedPlayers.length === 0) {
        setImpactData(null);
        setImpactError(null);
        return;
      }

      if (!allowedStrategies.includes(selectedStrategy)) {
        setImpactData(null);
        setImpactError(strategyBlockedMessage(selectedStrategy));
        return;
      }

      if (selectedStrategy === 'qualifier' && qualifierBlockedReason) {
        setImpactData(null);
        setImpactError(qualifierBlockedReason);
        return;
      }

      if (selectedStrategy === "regenerate" && tournamentStarted) {
        setImpactData(null);
        setImpactError("Regenerate is restricted after the tournament has started.");
        return;
      }

      setImpactLoading(true);
      setImpactError(null);
      try {
        const res = await apiClient.post(`/tournaments/${tournament.id}/late-entry`, {
          players: selectedPlayers,
          strategy: selectedStrategy,
          reseedType: reseedStrategy,
          preview: true,
        });
        setImpactData(res?.data?.data?.impact || null);
      } catch (err) {
        const msg = err.response?.data?.error || err.message || "Failed to load impact preview";
        setImpactError(msg);
        setImpactData(null);
      } finally {
        setImpactLoading(false);
      }
    };

    void run();
  }, [
    isOpen,
    step,
    tournament?.id,
    selectedPlayers,
    selectedStrategy,
    reseedStrategy,
    tournamentStarted,
    lateEntryGate.enabled,
    lateEntryGate.reason,
    allowedStrategies,
    qualifierBlockedReason,
    strategyBlockedMessage,
  ]);

  // NOTE: email display intentionally hidden for privacy

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Late Players"
      size="lg"
      closeOnOutsideClick={!loading}
    >
      <div className="space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2">
          <div className={`flex items-center space-x-2 ${step >= 1 ? 'text-[#132F45]' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-[#132F45] text-white' : 'bg-gray-200'}`}>
              1
            </div>
            <span className="font-semibold">Select Players</span>
          </div>
          <div className="h-1 flex-1 mx-2 bg-gray-200" />
          <div className={`flex items-center space-x-2 ${step >= 2 ? 'text-[#132F45]' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-[#132F45] text-white' : 'bg-gray-200'}`}>
              2
            </div>
            <span className="font-semibold">Choose Strategy</span>
          </div>
          <div className="h-1 flex-1 mx-2 bg-gray-200" />
          <div className={`flex items-center space-x-2 ${step >= 3 ? 'text-[#132F45]' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-[#132F45] text-white' : 'bg-gray-200'}`}>
              3
            </div>
            <span className="font-semibold">Confirm</span>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        {!lateEntryGate.enabled && (
          <Alert variant="warning">{lateEntryGate.reason || 'Late entry is disabled for this tournament.'}</Alert>
        )}

        {/* Step 1: Select Players */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Select players to add to "{tournament?.name}" as late entries.
            </p>

            {loadingPlayers && (
              <div className="flex items-center justify-center py-8">
                <FaSpinner className="animate-spin text-2xl text-[#132F45]" />
              </div>
            )}

            {!loadingPlayers && allAvailablePlayers.length === 0 && (
              <div className="space-y-3">
                <Alert variant="info">
                  <div className="flex items-start space-x-3">
                    <FaInfo className="shrink-0 mt-0.5 text-lg" />
                    <div>
                      <p className="font-semibold">No available players</p>
                      <p className="text-sm mt-1">
                        Either all players in this organization are already registered in this tournament,
                        or there are no players yet. You can add new players through the main player management section.
                      </p>
                    </div>
                  </div>
                </Alert>
                <Button
                  onClick={loadAvailablePlayers}
                  variant="secondary"
                  size="sm"
                >
                  Retry Loading
                </Button>
              </div>
            )}

            {!loadingPlayers && uniqueAvailablePlayers.length > 0 && (
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                {uniqueAvailablePlayers.map((player) => (
                  <label
                    key={player.id}
                    className="flex items-center px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlayers.includes(player.id)}
                      onChange={(e) => handlePlayerSelect(player.id, e.target.checked)}
                      className="w-4 h-4 border-gray-300 rounded"
                    />
                    <div className="ml-3 flex-1">
                      <p className="font-semibold text-gray-900">{player.playerName || player.name}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {selectedPlayers.length > 0 && (
              <Card className="bg-blue-50 border-l-4 border-blue-400">
                <div className="flex items-start space-x-2">
                  <FaInfo className="text-blue-600 mt-1" />
                  <div>
                    <p className="font-semibold text-blue-900">
                      {selectedPlayers.length} player(s) selected
                    </p>
                    <p className="text-sm text-blue-700">{selectedPlayerNames}</p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Step 2: Choose Strategy */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Choose how to add the selected {selectedPlayers.length} player(s). Each strategy has different implications for your bracket.
            </p>

            <div className="grid grid-cols-1 gap-3">
              {strategyOrder.map((strategy) => (
                (() => {
                  const modeDisabled = !allowedStrategies.includes(strategy);
                  const qualifierDisabled =
                    strategy === 'qualifier' && Boolean(qualifierBlockedReason);
                  const isRegenerateDisabled =
                    strategy === "regenerate" && tournamentStarted;
                  const isDisabled = modeDisabled || qualifierDisabled || isRegenerateDisabled;
                  return (
                <label
                  key={strategy}
                  className={`
                    p-4 border-2 rounded-lg cursor-pointer transition-all
                    ${
                      isDisabled
                        ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                        : selectedStrategy === strategy
                          ? "border-[#132F45] bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                    }
                  `}
                >
                  <div className="flex items-start space-x-3">
                    <input
                      type="radio"
                      name="strategy"
                      value={strategy}
                      checked={selectedStrategy === strategy}
                      disabled={isDisabled}
                      onChange={(e) => handleStrategyChange(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {strategyTitle(strategy)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {getStrategyDescription(strategy)}
                      </p>
                      {isRegenerateDisabled && (
                        <p className="text-xs text-red-600 mt-2">
                          Regenerate is only allowed before the tournament starts.
                        </p>
                      )}
                      {modeDisabled && (
                        <p className="text-xs text-red-600 mt-2">
                          {strategyBlockedMessage(strategy)}
                        </p>
                      )}
                      {qualifierDisabled && !modeDisabled && (
                        <p className="text-xs text-red-600 mt-2">
                          {qualifierBlockedReason}
                        </p>
                      )}
                    </div>
                  </div>
                </label>
                  );
                })()
              ))}
            </div>

            {/* Reseed: Regenerate + Qualifier (bracket rebuild) */}
            {(selectedStrategy === 'regenerate' || selectedStrategy === 'qualifier') && (
              <Card className="bg-yellow-50 border-l-4 border-yellow-400">
                <div className="space-y-2">
                  <p className="font-semibold text-yellow-900">Reseed strategy</p>
                  <div className="space-y-1 text-sm">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reseed"
                        value="random"
                        checked={reseedStrategy === 'random'}
                        onChange={(e) => setReseedStrategy(e.target.value)}
                      />
                      <span>Random</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reseed"
                        value="lower_priority"
                        checked={reseedStrategy === 'lower_priority'}
                        onChange={(e) => setReseedStrategy(e.target.value)}
                      />
                      <span>Lower Priority (recommended)</span>
                    </label>
                  </div>
                </div>
              </Card>
            )}

            {/* Impact Preview */}
            <Card className="bg-gray-50 space-y-2">
              <p className="font-semibold text-gray-900">Impact Preview</p>
              {impactLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FaSpinner className="animate-spin" />
                  Calculating impact…
                </div>
              )}

              {!impactLoading && impactError && (
                <Alert variant="danger">{impactError}</Alert>
              )}

              {!impactLoading && impactData && (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Player Count</p>
                      <p className="font-semibold text-gray-900">{impactData.playerCountText}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Matches</p>
                      <p className="font-semibold text-gray-900">
                        Regenerated: {impactData.matches?.regenerated ?? 0} · Added:{" "}
                        {impactData.matches?.added ?? 0} · Unchanged:{" "}
                        {impactData.matches?.unchanged ?? 0}
                      </p>
                    </div>
                  </div>
                  {impactData.warning && (
                    <div className="flex items-start space-x-2 mt-3 p-2 bg-orange-50 border-l-2 border-orange-400">
                      <FaExclamationTriangle className="text-orange-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-orange-700">{impactData.warning}</p>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        )}

        {/* Step 3: Review & Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-gray-600">Tournament</p>
                <p className="font-semibold text-gray-900">{tournament?.name}</p>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <p className="text-gray-600">Players to Add</p>
                <p className="font-semibold text-gray-900 mt-1">{selectedPlayers.length} player(s)</p>
                <p className="text-sm text-gray-600 mt-1">{selectedPlayerNames}</p>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <p className="text-gray-600">Strategy</p>
                <p className="font-semibold text-gray-900 mt-1">{strategyTitle(selectedStrategy)}</p>
                <p className="text-sm text-gray-600 mt-1">{getStrategyDescription(selectedStrategy)}</p>
              </div>
              {(selectedStrategy === 'regenerate' || selectedStrategy === 'qualifier') && (
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-gray-600">Reseed strategy</p>
                  <p className="font-semibold text-gray-900 mt-1">{reseedTitle(reseedStrategy)}</p>
                </div>
              )}
            </Card>

            <Card className="bg-gray-50 space-y-2">
              <p className="font-semibold text-gray-900">Impact preview</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Player count</p>
                  <p className="font-semibold text-gray-900">
                    {impactData?.playerCountText || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Matches</p>
                  <p className="font-semibold text-gray-900">
                    Regenerated: {impactData?.matches?.regenerated ?? 0} · Added:{" "}
                    {impactData?.matches?.added ?? 0} · Unchanged:{" "}
                    {impactData?.matches?.unchanged ?? 0}
                  </p>
                </div>
              </div>
              {impactData?.warning && (
                <div className="flex items-start space-x-2 mt-2 p-2 bg-orange-50 border-l-2 border-orange-400">
                  <FaExclamationTriangle className="text-orange-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-orange-700">{impactData.warning}</p>
                </div>
              )}
            </Card>

            <Alert variant="warning">
              {selectedStrategy === 'regenerate'
                ? 'All existing fixtures will be deleted and recreated. Ensure you want to proceed.'
                : 'This action cannot be undone. Please review the details above.'}
            </Alert>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <Button
            variant="secondary"
            onClick={step === 1 ? handleClose : () => setStep(step - 1)}
            disabled={loading}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          <div className="space-x-3">
            {step === 1 && (
              <Button
                variant="primary"
                onClick={() => {
                  if (!lateEntryGate.enabled) {
                    setError(lateEntryGate.reason || 'Late entry is currently disabled for this tournament.');
                    return;
                  }
                  if (selectedPlayers.length === 0) {
                    setError('Please select at least one player');
                    return;
                  }
                  if (!allowedStrategies.includes(selectedStrategy)) {
                    setError(strategyBlockedMessage(selectedStrategy));
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
                disabled={loading || selectedPlayers.length === 0 || !lateEntryGate.enabled}
              >
                Next
              </Button>
            )}

            {step === 2 && (
              <Button
                variant="primary"
                onClick={() => setStep(3)}
                disabled={
                  loading ||
                  !lateEntryGate.enabled ||
                  !allowedStrategies.includes(selectedStrategy) ||
                  Boolean(qualifierBlockedReason && selectedStrategy === 'qualifier')
                }
              >
                Next
              </Button>
            )}

            {step === 3 && (
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={loading}
                disabled={loading || selectedPlayers.length === 0 || !lateEntryGate.enabled || !allowedStrategies.includes(selectedStrategy)}
              >
                <FaCheck className="inline mr-2" />
                Confirm
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
