import React, { useState, useEffect } from 'react';
import apiClient from '../../../../contexts/apiClient';
import {
  FaUsers,
  FaTrophy,
  FaChevronRight,
  FaTimes,
  FaCheckCircle,
  FaSync,
  FaExclamationTriangle,
  FaArrowRight,
  FaLayerGroup
} from 'react-icons/fa';

const MAIN_DIV_SENTINEL = '__main__';

const AssignDivisionModal = ({ leagueId, league, onClose, onAssignmentComplete }) => {
  const [loading, setLoading] = useState(true);
  const [divisions, setDivisions] = useState([]);
  const [leaguePlayers, setLeaguePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [assignedPlayers, setAssignedPlayers] = useState([]);
  const [error, setError] = useState(null);

  // Parse structure robustly — it may arrive as a JSON string from the API
  const parsedStructure = (() => {
    let s = league?.structure;
    if (typeof s === 'string') {
      try { s = JSON.parse(s); } catch { s = {}; }
    }
    return s || {};
  })();

  const isRollingOrLateJoin =
    league?.lateJoinAllowed ||
    parsedStructure?.players?.rollingJoin ||
    parsedStructure?.players?.lateJoin;

  useEffect(() => {
    if (!isRollingOrLateJoin) {
      setError('Late join is not active for this league.');
      setLoading(false);
      return;
    }
    fetchDivisionsAndPlayers();
  }, [leagueId, isRollingOrLateJoin]);

  const fetchDivisionsAndPlayers = async () => {
    try {
      setLoading(true);
      setError(null);

      let fetchedDivs = [];
      const divsRes = await apiClient.get(`/leagues/${leagueId}/divisions`);
      if (divsRes.data.success) {
        fetchedDivs = divsRes.data.data || [];

        if (fetchedDivs.length === 0) {
          // No division rows in DB = league uses a single "main" pool
          // Inject a synthetic option so the admin still has something to pick
          setDivisions([{
            id: MAIN_DIV_SENTINEL,
            name: 'Main League',
            maxPlayers: null,
            synthetic: true
          }]);
        } else {
          setDivisions(fetchedDivs);
        }
      }

      const playersRes = await apiClient.get(`/leagues/${leagueId}/players`);
      if (playersRes.data.success) {
        // Only load players that need assignment if actual explicit divisions exist.
        // If fetchedDivs.length === 0, the league is just a single main pool, so we skip division assignment.
        const playersNeedingDivision = fetchedDivs.length > 0
          ? (playersRes.data.data || []).filter(lp => !lp.divisionId && lp.approvalStatus === 'approved')
          : [];
        setLeaguePlayers(playersNeedingDivision);
      }
    } catch (err) {
      console.error('Error fetching divisions/players:', err);
      setError(err.response?.data?.error || 'Failed to load player data');
    } finally {
      setLoading(false);
    }
  };

  const togglePlayerSelection = (player) => {
    setSelectedPlayers(prev => {
      const isSelected = prev.some(p => p.id === player.id);
      return isSelected ? prev.filter(p => p.id !== player.id) : [...prev, player];
    });
  };

  const handleAssignAllToDivision = async () => {
    if (selectedPlayers.length === 0 || !selectedDivision) return;

    try {
      setAssigning(true);
      setError(null);

      if (selectedDivision === MAIN_DIV_SENTINEL) {
        // Main League: player already has divisionId: null which is correct.
        // Just mark them as assigned locally so the Regenerate button appears.
        setAssignedPlayers(prev => [...prev, ...selectedPlayers]);
        setLeaguePlayers(prev => prev.filter(lp => !selectedPlayers.some(sp => sp.id === lp.id)));
        setSelectedPlayers([]);
        setSelectedDivision(null);
        return;
      }

      // Real division: call the division players endpoint
      const assignmentPromises = selectedPlayers.map(player =>
        apiClient.post(`/leagues/${leagueId}/divisions/${selectedDivision}/players`, {
          playerId: player.playerId,
          ranking: player.player?.ranking || null,
        })
      );

      const results = await Promise.all(assignmentPromises);
      const allSucceeded = results.every(res => res.data.success);

      if (allSucceeded) {
        setAssignedPlayers(prev => [...prev, ...selectedPlayers]);
        setLeaguePlayers(prev => prev.filter(lp => !selectedPlayers.some(sp => sp.id === lp.id)));
        setSelectedPlayers([]);
        setSelectedDivision(null);
      } else {
        setError('Some assignments failed. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign players');
    } finally {
      setAssigning(false);
    }
  };

  const handleRegenerateFixtures = async () => {
    if (assignedPlayers.length === 0) return;

    try {
      setRegenerating(true);
      setError(null);

      const response = await apiClient.post(`/leagues/${leagueId}/fixtures/generate`, {
        mode: 'incremental',
        playerIds: assignedPlayers.map(p => p.playerId),
      });

      if (response.data.success) {
        setAssignedPlayers([]);
        if (typeof onAssignmentComplete === 'function') onAssignmentComplete();
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update schedule');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#132F45]/30 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[3.5rem] w-full max-w-4xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col animate-in fade-in zoom-in duration-500 max-h-[90vh]">
        {/* Header */}
        <div className="px-12 pt-12 pb-8 border-b border-gray-50 bg-gradient-to-b from-[#FAFAFA] to-white relative shrink-0">
          <div className="absolute top-0 right-0 p-10 opacity-5">
            <FaTrophy className="text-9xl text-[#132F45]" />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2 h-5 bg-[#BA995D] rounded-full" />
            <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-[#BA995D]">Division Assignment</h2>
          </div>
          <div className="flex justify-between items-end">
            <h3 className="text-4xl font-black text-[#132F45] tracking-tight">Assign <span className="text-[#BA995D]">Divisions</span></h3>
            <button onClick={onClose} className="relative z-10 p-4 hover:bg-gray-50 rounded-2xl transition-colors text-gray-300 hover:text-[#132F45]">
              <FaTimes className="text-xl" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-12 overflow-y-auto custom-scrollbar flex flex-col gap-10">
          {!isRollingOrLateJoin ? (
            <div className="p-10 bg-red-50 border-2 border-red-100 rounded-[2.5rem] flex flex-col items-center gap-6 text-center">
              <FaExclamationTriangle className="text-4xl text-red-400" />
              <div className="space-y-2">
                <h4 className="text-[12px] font-black uppercase tracking-widest text-red-700">Not Available</h4>
                <p className="text-[10px] font-medium text-red-600/60 leading-relaxed max-w-sm">
                  Late join is not enabled. Divisions cannot be changed once the league schedule is finalized.
                </p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700">
                  <FaExclamationTriangle className="shrink-0" />
                  <p className="text-[10px] font-black uppercase tracking-widest">{error}</p>
                </div>
              )}

              {loading ? (
                <div className="py-20 flex flex-col items-center gap-6">
                  <div className="w-12 h-12 border-4 border-[#BA995D]/20 border-t-[#BA995D] rounded-full animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132F45]/40 animate-pulse">Syncing Player Data...</p>
                </div>
              ) : (
                <div className="space-y-12">
                  {/* Step 1: Player Selection */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-[#BA995D] text-white flex items-center justify-center text-[10px] font-black">01</span>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132F45]">Select Players</h4>
                      </div>
                      {selectedPlayers.length > 0 && (
                        <span className="bg-[#132F45] text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter">
                          {selectedPlayers.length} PLAYERS SELECTED
                        </span>
                      )}
                    </div>

                    {leaguePlayers.length === 0 ? (
                      <div className="p-12 bg-[#FAFAFA] border-2 border-gray-50 border-dashed rounded-[2.5rem] text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">
                          {assignedPlayers.length > 0
                            ? 'Selection finished'
                            : (divisions.length > 0 && divisions[0].synthetic
                              ? 'No division assignment needed. This league uses a single main pool.'
                              : 'All approved players have been assigned to divisions')}
                        </p>
                        {league.status === 'active' && assignedPlayers.length === 0 && (
                          <div className="mt-6 flex flex-col items-center gap-4">
                            <p className="text-[9px] font-medium text-gray-400 max-w-xs mx-auto">
                              If you recently assigned players but didn't update the schedule, you can do it now.
                            </p>
                            <button
                              onClick={() => setAssignedPlayers([{ id: 'manual-sync', manual: true }])}
                              className="px-6 py-2 border-2 border-gray-100 text-[10px] font-black uppercase tracking-widest text-[#132F45] rounded-xl hover:bg-[#BA995D] hover:text-white hover:border-[#BA995D] transition-all"
                            >
                              Sync Schedule Now
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {leaguePlayers.map(player => (
                          <label
                            key={player.id}
                            className={`group relative flex items-center gap-4 p-5 rounded-[2rem] border-2 transition-all duration-300 cursor-pointer overflow-hidden ${selectedPlayers.some(p => p.id === player.id)
                              ? 'bg-[#132F45] border-[#132F45] shadow-xl translate-y-[-2px]'
                              : 'bg-white border-gray-50 hover:border-gray-200'
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedPlayers.some(p => p.id === player.id)}
                              onChange={() => togglePlayerSelection(player)}
                              className="hidden"
                            />
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${selectedPlayers.some(p => p.id === player.id)
                              ? 'bg-[#BA995D] border-[#BA995D]'
                              : 'bg-[#FAFAFA] border-gray-100'
                              }`}>
                              <FaCheckCircle className={`text-white text-[10px] transition-opacity ${selectedPlayers.some(p => p.id === player.id) ? 'opacity-100' : 'opacity-0'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-black uppercase tracking-widest truncate transition-colors ${selectedPlayers.some(p => p.id === player.id) ? 'text-white' : 'text-[#132F45]'}`}>
                                {player.player?.name || player.player?.nickname}
                              </p>
                              <p className={`text-[8px] font-bold uppercase tracking-tighter transition-colors ${selectedPlayers.some(p => p.id === player.id) ? 'text-[#BA995D]' : 'text-gray-300'}`}>
                                Approved · Unassigned
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step 2: Division Selection */}
                  {selectedPlayers.length > 0 && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-700">
                      <div className="flex items-center gap-3 px-2">
                        <span className="w-8 h-8 rounded-xl bg-[#BA995D] text-white flex items-center justify-center text-[10px] font-black">02</span>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#132F45]">Select Division</h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {divisions.map(division => {
                          const isSynthetic = division.id === MAIN_DIV_SENTINEL;
                          const playerCountInDiv = isSynthetic
                            ? leaguePlayers.filter(p => !p.divisionId).length
                            : leaguePlayers.filter(p => p.divisionId === division.id).length;
                          const projectsFull = !isSynthetic && division.maxPlayers &&
                            (playerCountInDiv + selectedPlayers.length) > division.maxPlayers;

                          return (
                            <label
                              key={division.id}
                              className={`group relative flex flex-col gap-4 p-6 rounded-[2.5rem] border-2 transition-all duration-500 cursor-pointer overflow-hidden ${projectsFull
                                ? 'opacity-40 cursor-not-allowed scale-95 grayscale'
                                : selectedDivision === division.id
                                  ? 'bg-[#132F45] border-[#132F45] shadow-2xl translate-y-[-4px]'
                                  : 'bg-white border-gray-50 hover:border-gray-200'
                                }`}
                            >
                              <input
                                type="radio"
                                name="division"
                                disabled={projectsFull}
                                checked={selectedDivision === division.id}
                                onChange={() => setSelectedDivision(division.id)}
                                className="hidden"
                              />
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    {isSynthetic && (
                                      <FaLayerGroup className={`text-xs ${selectedDivision === division.id ? 'text-[#BA995D]' : 'text-gray-300'}`} />
                                    )}
                                    <h5 className={`text-[12px] font-black uppercase tracking-widest ${selectedDivision === division.id ? 'text-white' : 'text-[#132F45]'}`}>
                                      {division.name}
                                    </h5>
                                  </div>
                                  <p className={`text-[8px] font-bold uppercase tracking-widest ${selectedDivision === division.id ? 'text-[#BA995D]' : 'text-gray-300'}`}>
                                    {isSynthetic
                                      ? 'Single pool — no sub-divisions'
                                      : `Capacity: ${playerCountInDiv} / ${division.maxPlayers || '∞'}`
                                    }
                                  </p>
                                </div>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all ${selectedDivision === division.id ? 'bg-[#BA995D] border-[#BA995D] rotate-90' : 'bg-[#FAFAFA] border-gray-50'}`}>
                                  <FaChevronRight className={`text-[10px] ${selectedDivision === division.id ? 'text-white' : 'text-gray-200'}`} />
                                </div>
                              </div>
                              {projectsFull && (
                                <span className="absolute bottom-4 right-6 text-[7px] font-black uppercase tracking-[0.3em] text-red-500">Over Capacity</span>
                              )}
                            </label>
                          );
                        })}
                      </div>

                      <button
                        onClick={handleAssignAllToDivision}
                        disabled={assigning || !selectedDivision}
                        className="w-full group relative h-16 bg-[#132F45] text-white rounded-2xl overflow-hidden shadow-2xl disabled:opacity-50 transition-all duration-500"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-[#BA995D] to-[#8C7343] translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                        <span className="relative z-10 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4">
                          {assigning
                            ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            : <><FaCheckCircle className="group-hover:scale-125 transition-transform" /> Assign Players</>
                          }
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Step 3: Fixture Sync */}
                  {assignedPlayers.length > 0 && (
                    <div className="p-10 bg-[#BA995D]/10 border-2 border-[#BA995D]/20 rounded-[3rem] space-y-8 animate-in zoom-in duration-700">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-[#BA995D] rounded-[2rem] flex items-center justify-center shrink-0 shadow-lg">
                          <FaCheckCircle className="text-2xl text-white" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-xl font-black text-[#132F45] tracking-tight">
                            {assignedPlayers[0]?.manual ? 'Schedule' : 'Assignment'} <span className="text-[#BA995D]">{assignedPlayers[0]?.manual ? 'Out of Sync' : 'Successful'}</span>
                          </h4>
                          <p className="text-[10px] font-medium text-[#132F45]/60 uppercase tracking-widest">
                            {assignedPlayers[0]?.manual ? 'Manual schedule update required' : `${assignedPlayers.length} Players Assigned to Divisions`}
                          </p>
                        </div>
                      </div>

                      <p className="text-[9px] font-medium text-[#8C7343] leading-relaxed italic border-l-2 border-[#BA995D] pl-6">
                        Next Step: The match schedule needs to be updated. This will add matches for new players while keeping all existing matches.
                      </p>

                      <button
                        onClick={handleRegenerateFixtures}
                        disabled={regenerating}
                        className="w-full group relative h-20 bg-[#132F45] text-white rounded-[2rem] overflow-hidden shadow-2xl disabled:opacity-50 transition-all duration-500"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-green-800 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <span className="relative z-10 text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-4">
                          {regenerating
                            ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            : <>Update Schedule <FaSync className="group-hover:rotate-180 transition-transform duration-700" /></>
                          }
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-12 py-8 bg-[#FAFAFA] border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-300 hover:text-red-500 transition-colors"
          >
            Cancel
          </button>
          {!assignedPlayers.length && (
            <div className="flex items-center gap-2 text-gray-200">
              <FaUsers className="text-xs" />
              <span className="text-[9px] font-black uppercase tracking-widest">Waiting for selection</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssignDivisionModal;
