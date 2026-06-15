import React, { useState } from "react";
import { motion } from "framer-motion";
import { FaSpinner, FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import matchResultService from "../../../../Services/matchResultService";

export default function PendingWalkoverModal({ walkover, onClose, onUpdate }) {
  const [action, setAction] = useState(null); // null, 'approve', 'reject'
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);

    try {
      await matchResultService.approveRejectWalkover(walkover.id, "approve", "", customScore || null);
      setSuccess(true);
      setTimeout(() => {
        if (onUpdate) onUpdate();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("[PendingWalkoverModal] Error approving walkover:", err);
      setError(err.error || err.message || "Failed to approve walkover");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError("Please provide a reason for rejection");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await matchResultService.approveRejectWalkover(
        walkover.id,
        "reject",
        rejectionReason
      );
      setSuccess(true);
      setTimeout(() => {
        if (onUpdate) onUpdate();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("[PendingWalkoverModal] Error rejecting walkover:", err);
      setError(err.error || err.message || "Failed to reject walkover");
    } finally {
      setLoading(false);
    }
  };

  const winnerId = walkover.walkoverWinner || walkover.winnerId || (typeof walkover.resultData === 'object' && walkover.resultData?.winnerId);
  const player1Id = walkover.player1?.id || walkover.player1Id;
  const player2Id = walkover.player2?.id || walkover.player2Id;

  const submittedBy =
    walkover.submittedBy?.name || walkover.submittedByName || "Unknown Player";
  const winnerName =
    walkover.winnerId?.name ||
    (winnerId === player1Id
      ? walkover.player1?.name
      : walkover.player2?.name) ||
    "Unknown Player";
  const loserName =
    winnerId === player1Id
      ? walkover.player2?.name
      : walkover.player1?.name || "Unknown Player";

  const [customScore, setCustomScore] = useState("");

  // Parse match rules
  let matchRules = walkover.league?.matchRules || {};
  if (typeof matchRules === "string") {
    try { matchRules = JSON.parse(matchRules); } catch (e) { matchRules = {}; }
  }
  const walkoverRule = matchRules.walkover?.rule || null;

  const getWalkoverRuleScore = () => {
    const customWalkover = matchRules.walkover?.customScore || null;
    let winScore = null;
    let loseScore = 0;

    if (walkoverRule === 'autoBestOf') {
      const bestOf = parseInt(matchRules.bestOf || matchRules.customFrames) || 5;
      winScore = Math.ceil(bestOf / 2);
    } else if (walkoverRule === 'auto2-0') {
      winScore = 2;
    } else if (walkoverRule === 'auto5-0') {
      winScore = 5;
    } else if (walkoverRule === 'custom' && customWalkover) {
      const parts = String(customWalkover).split('-').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        winScore = parts[0];
        loseScore = parts[1];
      }
    }

    if (winScore === null) {
      // Priority: matchRules.bestOf -> league.matchFormat -> division.numberOfFrames
      let totalFrames = 5;
      if (matchRules.bestOf === 'custom') {
        totalFrames = parseInt(matchRules.customFrames) || 5;
      } else if (matchRules.bestOf) {
        totalFrames = parseInt(matchRules.bestOf) || 5;
      } else {
        const matchFormatStr = league?.matchFormat || "";
        const m = matchFormatStr.match(/\d+/);
        if (m) {
          totalFrames = parseInt(m[0]);
        } else if (fixture?.division?.numberOfFrames) {
          totalFrames = fixture.division.numberOfFrames;
        } else if (fixture?.division?.raceLength) {
          totalFrames = fixture.division.raceLength * 2 - 1;
        }
      }
      winScore = totalFrames;
    }

    const isP1Winner = winnerId === player1Id;
    return isP1Winner ? `${winScore}-${loseScore}` : `${loseScore}-${winScore}`;
  };

  const ruleScore = getWalkoverRuleScore();
  const backendScore = (walkover.resultData && typeof walkover.resultData === 'object' && walkover.resultData.walkoverScore) ? walkover.resultData.walkoverScore : walkover.walkoverScore;
  let displayedScore = customScore.trim() || backendScore || ruleScore;
  if (walkover.resultData) {
    const raw = typeof walkover.resultData === 'string' ? (() => { try { return JSON.parse(walkover.resultData); } catch (e) { return {}; } })() : walkover.resultData;
    if (raw && raw.walkoverScore) {
      displayedScore = raw.walkoverScore;
    }
  }

  // Ensure the summary display score is always Win-Loss (e.g., 3-0) 
  // because the layout is explicitly [Winner] [Score] [Loser]
  const scoreParts = displayedScore.split('-').map(s => parseInt(s.trim()) || 0);
  const winLossScore = scoreParts.length === 2 ? `${Math.max(...scoreParts)}-${Math.min(...scoreParts)}` : displayedScore;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white rounded-xl w-full max-w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-yellow-600 text-white px-4 py-3 flex justify-between items-center rounded-t-xl flex-shrink-0">
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            ⚠️ Pending Forfeit Approval
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-lg"
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {success && (
            <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
              ✓ Forfeit processed successfully!
            </div>
          )}

          {error && (
            <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium">
              ✕ {error}
            </div>
          )}

          {/* Walkover Details */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-start gap-3">
              <div>
                <p className="text-[10px] text-orange-800 font-bold uppercase mb-1">
                  Submitted By
                </p>
                <p className="text-xs font-bold text-[#132F45]">{submittedBy}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-orange-800 font-bold uppercase mb-1">
                  Submitted At
                </p>
                <p className="text-xs font-mono text-[#132F45]">
                  {walkover.submittedAt
                    ? new Date(walkover.submittedAt).toLocaleString()
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Match Details */}
          <div className="border border-[#D1D5DB] rounded-lg p-3">
            <h3 className="text-xs font-bold text-[#132F45] mb-3 uppercase tracking-widest">
              Match Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="text-center bg-blue-50 p-2 rounded-lg">
                <p className="text-[9px] text-[#132F45] opacity-70 font-semibold mb-1">
                  Player 1
                </p>
                <p className="text-xs font-bold text-[#132F45]">
                  {walkover.player1?.name || "Player 1"}
                </p>
              </div>
              <div className="text-center bg-gray-50 p-2 rounded-lg">
                <p className="text-xs text-[#132F45] opacity-70 font-semibold mb-1">
                  Result
                </p>
                <p className="text-lg font-black text-orange-600">FORFEIT</p>
              </div>
              <div className="text-center bg-green-50 p-2 rounded-lg">
                <p className="text-[9px] text-[#132F45] opacity-70 font-semibold mb-1">
                  Player 2
                </p>
                <p className="text-xs font-bold text-[#132F45]">
                  {walkover.player2?.name || "Player 2"}
                </p>
              </div>
            </div>
          </div>

          {/* Winner & Score */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-800 font-bold uppercase mb-2">
              Forfeit Outcome
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center text-center">
              <div>
                <p className="text-xs font-bold text-[#132F45]">{winnerName}</p>
                <p className="text-[9px] text-[#132F45] opacity-70">Winner</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-green-600">{winLossScore}</p>
                <p className="text-xs text-green-800 font-bold">Forfeit Score</p>
              </div>
              <div>
                <p className="text-xs font-bold text-[#132F45]">{loserName}</p>
                <p className="text-[9px] text-[#132F45] opacity-70">Loser</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {walkover.notes && (
            <div className="bg-gray-50 border border-[#D1D5DB] rounded-lg p-3">
              <p className="text-[10px] font-bold text-[#132F45] mb-2 uppercase tracking-widest">
                Notes
              </p>
              <p className="text-xs text-[#132F45]">{walkover.notes}</p>
            </div>
          )}

          {/* Decision Section */}
          {!success && (
            <div className="border-t border-[#D1D5DB] pt-4 space-y-3">
              {action === null ? (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-[#132F45] uppercase tracking-widest">
                    Approve or reject?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => setAction("approve")}
                      disabled={loading}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50"
                    >
                      <FaCheckCircle /> Approve Forfeit
                    </button>
                    <button
                      onClick={() => setAction("reject")}
                      disabled={loading}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:opacity-50"
                    >
                      <FaTimesCircle /> Reject Forfeit
                    </button>
                  </div>
                </div>
              ) : action === "approve" ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <p className="text-sm font-bold text-green-800">
                      ✓ Approve Forfeit
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      {winnerName} is proposed to receive {displayedScore} (based on league walkover rule: {walkoverRule === 'autoBestOf' ? 'Best of ' + (parseInt(matchRules.bestOf || matchRules.customFrames) || 5) :
                        walkoverRule === 'auto2-0' ? '2-0' :
                          walkoverRule === 'auto5-0' ? '5-0' :
                            walkoverRule === 'custom' ? 'Custom ' + (matchRules.walkover?.customScore || '3-0') :
                              walkoverRule === 'admin' ? 'Admin decides' : 'Default'}).
                      {(walkoverRule === 'custom' || walkoverRule === 'admin') ? 'You can override the score before approval.' : 'Score is fixed by league rule.'}
                    </p>
                  </div>
                  {(walkoverRule === 'custom' || walkoverRule === 'admin') && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-[#132F45]">Admin override walkover score (optional)</label>
                      <input
                        value={customScore}
                        onChange={(e) => setCustomScore(e.target.value)}
                        placeholder={ruleScore}
                        className="w-full px-3 py-2 border border-[#D1D5DB] rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                      />
                      <p className="text-[10px] text-gray-500">Use X-Y format (e.g., 3-0). Leave blank to use rule score.</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setAction(null)}
                      disabled={loading}
                      className="flex-1 px-4 py-2 border border-[#D1D5DB] text-[#132F45] rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <FaSpinner className="animate-spin" /> Processing...
                        </>
                      ) : (
                        "Confirm Approval"
                      )}
                    </button>
                  </div>
                </div>
              ) : action === "reject" ? (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                    <p className="text-sm font-bold text-red-800">
                      ✕ Reject Forfeit
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      The walkover will be cancelled and the match will remain
                      open for a regular result submission.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#132F45] mb-2">
                      Reason for Rejection *
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Please explain why you're rejecting this forfeit..."
                      className="w-full px-4 py-3 border border-[#D1D5DB] rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-[#132F45] text-sm resize-none"
                      rows="3"
                    />
                    <p className="text-xs text-[#132F45] opacity-70 mt-1">
                      This reason will be recorded in the system.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setAction(null)}
                      disabled={loading}
                      className="flex-1 px-4 py-2 border border-[#D1D5DB] text-[#132F45] rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={loading || !rejectionReason.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <FaSpinner className="animate-spin" /> Processing...
                        </>
                      ) : (
                        "Confirm Rejection"
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
