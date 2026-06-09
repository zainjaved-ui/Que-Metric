import React, { useState, useEffect } from "react";
import { FaExclamationTriangle, FaCheck, FaTimes, FaSpinner } from "react-icons/fa";
import Card from "../../../ui/Card";
import Button from "../../../ui/Button";
import Loader from "../../../ui/Loader";
import apiClient from "../../../../contexts/apiClient";
import { useNotification } from "../../../../contexts/NotificationContext";

const VoidedMatchesManager = ({ tournamentId, onResolved }) => {
  const { showToast } = useNotification();
  const [voidedMatches, setVoidedMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [resolutionAction, setResolutionAction] = useState("promote_player");
  const [selectedWinner, setSelectedWinner] = useState("player1");
  const [selectedAlternate, setSelectedAlternate] = useState("");
  const [availableAlternates, setAvailableAlternates] = useState([]);

  // Fetch voided matches on mount
  useEffect(() => {
    if (tournamentId) {
      fetchVoidedMatches();
    }
  }, [tournamentId]);

  const fetchVoidedMatches = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(
        `/tournaments/${tournamentId}/voided-matches`
      );
      if (response.data?.success) {
        setVoidedMatches(response.data.data?.voidedMatches || []);
        setAvailableAlternates(response.data.data?.availableAlternates || []);
      }
    } catch (error) {
      console.error("Error fetching voided matches:", error);
      showToast("Failed to load voided matches", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResolveMatch = async (matchId, action, payload) => {
    setResolving(matchId);
    try {
      const response = await apiClient.post(
        `/tournaments/${tournamentId}/matches/${matchId}/resolve-void`,
        {
          action,
          ...payload,
        }
      );

      if (response.data?.success) {
        showToast(response.data.data?.message || "Match resolved successfully", "success");

        // Refresh voided matches list
        await fetchVoidedMatches();

        // Reset form
        setSelectedMatch(null);
        setSelectedWinner("player1");
        setSelectedAlternate("");

        // Notify parent
        if (onResolved) {
          onResolved();
        }
      }
    } catch (error) {
      console.error("Error resolving voided match:", error);
      showToast(
        error.response?.data?.error || "Failed to resolve match",
        "error"
      );
    } finally {
      setResolving(null);
    }
  };

  const handlePromotePlayer = (match) => {
    setSelectedMatch(match);
    setResolutionAction("promote_player");
    setSelectedWinner("player1");
  };

  const handlePromoteAlternate = (match) => {
    setSelectedMatch(match);
    setResolutionAction("promote_alternate");
    setSelectedAlternate("");
  };

  const handleReschedule = (match) => {
    setSelectedMatch(match);
    setResolutionAction("reschedule");
  };

  const submitResolution = () => {
    if (!selectedMatch) return;

    const payload = {};
    if (resolutionAction === "promote_player") {
      payload.winnerPlayerId = selectedWinner;
    } else if (resolutionAction === "promote_alternate") {
      payload.alternatePlayerId = selectedAlternate;
    }

    handleResolveMatch(selectedMatch.id, resolutionAction, payload);
  };

  if (loading && voidedMatches.length === 0) {
    return <Loader />;
  }

  if (voidedMatches.length === 0) {
    return (
      <Card className="p-6 text-center text-gray-600">
        <FaCheck className="mx-auto text-3xl mb-3 text-green-500" />
        <p>No voided matches to resolve</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <FaExclamationTriangle className="text-2xl text-yellow-500" />
        <div>
          <h3 className="text-xl font-semibold text-gray-800">Voided Matches</h3>
          <p className="text-gray-600">
            {voidedMatches.length} match{voidedMatches.length !== 1 ? "es" : ""} need{voidedMatches.length === 1 ? "s" : ""} admin resolution
          </p>
        </div>
      </div>

      {/* Voided Matches List */}
      <div className="grid gap-4">
        {voidedMatches.map((match) => (
          <Card key={match.id} className="p-4 border-l-4 border-yellow-500">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm text-gray-600 mb-2">
                  <strong>{match.roundType?.replace(/_/g, " ").toUpperCase()}</strong> - Match {match.matchNumber}
                </div>

                {/* Withdrawal Status */}
                {match.withdrawnPlayerName && (
                  <div className="mb-3 p-2 bg-red-100 border border-red-300 rounded">
                    <p className="text-xs text-red-700 font-semibold">
                      ⚠️ {match.withdrawnPlayerName} (Player {match.withdrawnPlayer === "player1" ? "1" : "2"}) - Withdrawn
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    <p className="font-semibold text-gray-800">
                      {match.player1?.name || "Unknown"}
                    </p>
                    <span className="text-xs text-gray-600">Player 1</span>
                  </div>
                  <span className="text-gray-600 font-bold">VS</span>
                  <div className="text-center">
                    <p className="font-semibold text-gray-800">
                      {match.player2?.name || "Unknown"}
                    </p>
                    <span className="text-xs text-gray-600">Player 2</span>
                  </div>
                </div>
                {match.adminOverride && (
                  <p className="text-xs text-gray-600 mt-2">
                    <em>Reason: {match.overrideReason}</em>
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 ml-4">
                <Button
                  variant="primary"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => handlePromotePlayer(match)}
                  disabled={selectedMatch?.id === match.id}
                >
                  Promote Player
                </Button>
                {/* <Button
                  variant="secondary"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => handlePromoteAlternate(match)}
                  disabled={selectedMatch?.id === match.id}
                >
                  Promote Alternate
                </Button> */}
                {/* <Button
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => handleReschedule(match)}
                  disabled={selectedMatch?.id === match.id}
                >
                  Reschedule
                </Button> */}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Resolution Form Modal */}
      {selectedMatch && (
        <Card className="p-6 bg-blue-50 border-2 border-blue-300">
          <h4 className="text-lg font-semibold mb-4 text-gray-800">
            Resolve Match: {selectedMatch.player1?.name} vs {selectedMatch.player2?.name}
          </h4>

          {/* Action Selection - Only Promote Player is enabled */}

          {resolutionAction === "promote_player" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Promote to Next Round
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded hover:bg-blue-100">
                    <input
                      type="radio"
                      value="player1"
                      checked={selectedWinner === "player1"}
                      onChange={(e) => setSelectedWinner(e.target.value)}
                    />
                    <span className="font-medium">{selectedMatch.player1?.name}</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded hover:bg-blue-100">
                    <input
                      type="radio"
                      value="player2"
                      checked={selectedWinner === "player2"}
                      onChange={(e) => setSelectedWinner(e.target.value)}
                    />
                    <span className="font-medium">{selectedMatch.player2?.name}</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            <Button
              variant="primary"
              onClick={submitResolution}
              disabled={resolving === selectedMatch.id}
            >
              {resolving === selectedMatch.id ? (
                <>
                  <FaSpinner className="animate-spin mr-2" />
                  Resolving...
                </>
              ) : (
                "Confirm Resolution"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedMatch(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default VoidedMatchesManager;
