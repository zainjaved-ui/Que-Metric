import React, { useState, useEffect, useMemo } from "react";
import {
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaClock,
  FaTrophy,
  FaEye,
  FaPencilAlt,
  FaSpinner,
  FaClipboard,
  FaExclamationTriangle,
  FaNetworkWired,
} from "react-icons/fa";
import Card from "../../../ui/Card";
import Button from "../../../ui/Button";
import Loader from "../../../ui/Loader";
import apiClient from "../../../../contexts/apiClient";
import { useNotification } from "../../../../contexts/NotificationContext";
import KnockoutBracketView, {
  formatKnockoutRoundLabel,
} from "./KnockoutBracketView";
import TournamentStandingsTable from "./TournamentStandingsTable";
import VoidedMatchesManager from "./VoidedMatchesManager";

const TournamentMatchManagement = () => {
  const { showToast } = useNotification();
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [participantApprovedCount, setParticipantApprovedCount] = useState(0);
  const [generatingNextRound, setGeneratingNextRound] = useState(false);
  const [activeView, setActiveView] = useState("matches"); // 'matches' | 'fixtures' | 'standings' | 'bracket' | 'voided-matches'
  const [voidedMatchCount, setVoidedMatchCount] = useState(0);
  const [tournamentDetail, setTournamentDetail] = useState(null);
  const [groupStageView, setGroupStageView] = useState(null);
  const [matchPageTournament, setMatchPageTournament] = useState(null);
  const [activeGroupTab, setActiveGroupTab] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedRound, setSelectedRound] = useState("all");
  const [bookingMatchId, setBookingMatchId] = useState(null);

  // Fetch tournaments on mount
  useEffect(() => {
    const fetchTournaments = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get("/tournaments");
        // API returns { success: true, data: [...] }
        const orgTournaments = (response.data?.data || []).filter(
          (t) => t.status !== "archived" && t.status !== "cancelled"
        );
        setTournaments(orgTournaments);
        // DO NOT auto-select - let user choose
      } catch (error) {
        showToast("Failed to fetch tournaments", "error");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchTournaments();
  }, []);

  // Fetch matches and standings when tournament changes
  useEffect(() => {
    if (selectedTournamentId) {
      fetchTournamentData();
    }
  }, [selectedTournamentId]);

  // Fresh filters when switching tournament (avoid stale round filter hiding all rows)
  useEffect(() => {
    setSelectedRound("all");
    setFilterStatus("all");
    setMatchPageTournament(null);
    setActiveGroupTab(null);
    setActiveView("matches");
  }, [selectedTournamentId]);

  useEffect(() => {
    const list = matchPageTournament?.groups;
    if (!list?.length) {
      setActiveGroupTab(null);
      return;
    }
    setActiveGroupTab((prev) => {
      if (prev != null && list.some((g) => g.groupNumber === prev)) return prev;
      return list[0].groupNumber;
    });
  }, [matchPageTournament]);

  // Listen for dispute resolution to refresh tournament data
  useEffect(() => {
    const handler = (evt) => {
      const tournamentId = evt?.detail?.tournamentId;
      if (!tournamentId || !selectedTournamentId) return;
      if (String(tournamentId) !== String(selectedTournamentId)) return;
      console.log('[TournamentMatchManagement] Dispute resolved, refreshing tournament data');
      void fetchTournamentData();
    };
    window.addEventListener('disputeResolved', handler);
    return () => window.removeEventListener('disputeResolved', handler);
  }, [selectedTournamentId]);

  const fetchTournamentData = async () => {
    setLoading(true);
    try {
      const [matchesResponse, standingsResponse, tournamentResponse, participantsResponse, voidedResponse] = await Promise.all([
        apiClient.get(`/tournaments/${selectedTournamentId}/matches`, {
          params: { includeByes: true },
        }),
        apiClient.get(`/tournaments/${selectedTournamentId}/standings`),
        apiClient.get(`/tournaments/${selectedTournamentId}`),
        apiClient.get(`/tournaments/${selectedTournamentId}/participants`),
        apiClient.get(`/tournaments/${selectedTournamentId}/voided-matches`).catch(() => ({ data: { data: { voidedMatches: [] } } })),
      ]);

      const matchesData = Array.isArray(matchesResponse.data?.data)
        ? matchesResponse.data.data
        : Array.isArray(matchesResponse.data)
        ? matchesResponse.data
        : matchesResponse.data?.data || [];
      // Include BYE / auto-advance rows (player2Id null) + synthetic knockout byes from API
      const normalized = matchesData
        .filter((m) => Boolean(m.player1Id))
        .map((m) => ({
          ...m,
          roundNumber:
            m.roundNumber != null && m.roundNumber !== ""
              ? Number(m.roundNumber)
              : null,
          matchNumber:
            m.matchNumber != null && m.matchNumber !== ""
              ? Number(m.matchNumber)
              : null,
        }));
      setMatches(normalized);

      const standingsData = Array.isArray(standingsResponse.data?.data)
        ? standingsResponse.data.data
        : Array.isArray(standingsResponse.data)
        ? standingsResponse.data
        : standingsResponse.data?.data || [];

      // Trust server-calculated position field (includes proper tiebreaker logic)
      // Sort by position if available, otherwise by points as fallback
      const sortedData = [...standingsData].sort((a, b) => {
        // Use server position if available (already includes tiebreaker logic)
        if (a.position != null && b.position != null) {
          return (a.position || 0) - (b.position || 0);
        }
        // Fallback for legacy data without position field (should not occur)
        return (b.points || 0) - (a.points || 0);
      });

      setStandings(sortedData);

      setTournamentDetail(tournamentResponse.data?.data || null);
      setGroupStageView(matchesResponse.data?.groupStageView || null);
      setMatchPageTournament(matchesResponse.data?.tournament || null);

      const participantsData = participantsResponse?.data?.data || participantsResponse?.data?.data || [];
      const approvedCount = Array.isArray(participantsData)
        ? participantsData.filter((p) => p?.status === "approved").length
        : 0;
      setParticipantApprovedCount(approvedCount);

      // Track voided matches count
      const voidedMatches = voidedResponse.data?.data?.voidedMatches || [];
      setVoidedMatchCount(voidedMatches.length);
    } catch (error) {
      showToast("Failed to fetch tournament data", "error");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Keep this page in sync when late-entry is confirmed elsewhere in the app.
  useEffect(() => {
    const handler = (evt) => {
      const updatedTournamentId = evt?.detail?.tournamentId;
      if (!updatedTournamentId || !selectedTournamentId) return;
      if (String(updatedTournamentId) !== String(selectedTournamentId)) return;
      void fetchTournamentData();
    };
    window.addEventListener("tournamentLateEntryUpdated", handler);
    return () => window.removeEventListener("tournamentLateEntryUpdated", handler);
  }, [selectedTournamentId]);

  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId);
  const formatType =
    tournamentDetail?.format?.type || selectedTournament?.format?.type;
  const showKnockoutBracket = formatType === "knockout" || formatType === "round_robin" || formatType === "swiss" || formatType === "groups_knockout";
  const isKnockoutLike = formatType === "knockout" || formatType === "groups_knockout";
  const isRoundRobin = formatType === "round_robin";
  const isSwiss = formatType === "swiss";
  const isGroupsKnockoutFormat = formatType === "groups_knockout";
  const schedulingConfig = tournamentDetail?.schedulingConfig || {
    autoGenerateFixtures: true,
    flexibleScheduling: false,
    enforceDeadlines: true,
    autoForfeit: false,
  };
  /** Swiss + Groups & Knockout: show literal "BYE" as opponent (other formats keep REST/auto-advance copy). */
  const showByeAsOpponentLabel = isSwiss || isGroupsKnockoutFormat;

  const matchRowIsBye = (match) => {
    if (!match) return false;
    const p2 = match.player2Id;
    const p2IsByeToken = typeof p2 === "string" && String(p2).toUpperCase() === "BYE";
    return (
      match.bye === true ||
      match.isBye === true ||
      match.isSyntheticBye === true ||
      match.status === "bye" ||
      match.status === "rest" ||
      p2IsByeToken ||
      (match.player1Id != null && (p2 == null || p2 === ""))
    );
  };

  const totalRoundsForSwiss =
    tournamentDetail?.format?.maxRounds ||
    Math.ceil(Math.log2(Math.max(participantApprovedCount || 0, 2)));

  const sortedRoundNumbers = useMemo(
    () =>
      [
        ...new Set(
          matches
            .map((m) => m.roundNumber)
            .filter((n) => n != null && Number.isFinite(Number(n)) && Number(n) >= 0)
            .map((n) => Number(n))
        ),
      ].sort((a, b) => a - b),
    [matches]
  );

  const activeRound =
    sortedRoundNumbers.find((roundNum) =>
      matches
        .filter((m) => Number(m.roundNumber) === roundNum)
        .some((m) => m.status !== "completed" && m.status !== "bye")
    ) ?? sortedRoundNumbers[sortedRoundNumbers.length - 1] ?? 1;

  const isHeadToHead = (m) =>
    Boolean(m?.player1Id && m?.player2Id && !m?.isSyntheticBye);
  const currentRoundMatches = matches.filter(
    (m) => Number(m.roundNumber) === activeRound
  );
  const allCurrentRoundCompleted =
    currentRoundMatches.length > 0 && currentRoundMatches.every((m) => m.status === "completed" || m.status === "bye");
  const hasNextRoundAlready = matches.some(
    (m) => Number(m.roundNumber) === activeRound + 1
  );

  const hasKnockoutMatches = matches.some(
    (m) => m.groupNumber == null && m.roundType !== "group_stage"
  );
  const isGroupStageOnly =
    formatType === "groups_knockout" &&
    Array.isArray(groupStageView?.groups) &&
    groupStageView.groups.length > 0 &&
    !hasKnockoutMatches;

  const canHaveNextRound = isSwiss ? activeRound < totalRoundsForSwiss : true;
  const maxRound = sortedRoundNumbers[sortedRoundNumbers.length - 1] || activeRound;
  const canUnlockRoundRobin = isRoundRobin && activeRound < maxRound;
  const showProgressButton =
    !isGroupStageOnly &&
    (isKnockoutLike ||
      canUnlockRoundRobin ||
      (isSwiss && canHaveNextRound && allCurrentRoundCompleted && !hasNextRoundAlready));
  const hideProgressButtonForKnockout = formatType === "knockout";
  const disableProgressButton =
    generatingNextRound ||
    !allCurrentRoundCompleted ||
    (hasNextRoundAlready && (isKnockoutLike || isSwiss));
  const progressButtonLabel = isRoundRobin ? "Unlock Next Round" : "Generate Next Round";

  const groupStagePlayable = matches.filter((m) => m.player2Id && m.roundType === "group_stage");
  const allGroupStageDone =
    groupStagePlayable.length > 0 && groupStagePlayable.every((m) => m.status === "completed");

  const groupCanAdvance = (g) => {
    if (g.status === "completed") return false;
    const rm = matches.filter(
      (m) =>
        Number(m.groupNumber) === g.groupNumber &&
        Number(m.roundNumber) === g.currentRound &&
        m.player2Id
    );
    return rm.length > 0 && rm.every((m) => m.status === "completed");
  };

  const handleGenerateNextRound = async (body = {}) => {
    if (!selectedTournamentId) return;
    try {
      setGeneratingNextRound(true);
      await apiClient.post(`/tournaments/${selectedTournamentId}/generate-next-round`, body);
      await fetchTournamentData();
    } catch (e) {
      showToast(e?.response?.data?.error || "Failed to generate next round", "error");
      console.error(e);
    } finally {
      setGeneratingNextRound(false);
    }
  };

  const resolveMatchFromState = (matchId) =>
    matchId ? matches.find((m) => String(m.id) === String(matchId)) : null;

  const getDisplayStatus = (matchLike) => {
    const statusRaw = String(matchLike?.status || "").toLowerCase();
    const derivedRaw = String(matchLike?.derivedStatus || "").toLowerCase();

    // If it's voided (withdrawal void rule), show voided status - NO POINTS awarded
    if (statusRaw === "voided") {
      return "voided";
    }

    // If it's a walkover, show that status
    if (matchLike?.isWalkover === true) {
      return "walkover";
    }

    // If backend sources disagree, "completed" must win for UI display.
    if (statusRaw === "completed" || derivedRaw === "completed") {
      return "completed";
    }

    const raw = String(derivedRaw || statusRaw || "pending").toLowerCase();

    // BYE/REST rows should always show a BYE-style status.
    if (matchRowIsBye(matchLike)) {
      return raw === "completed" ? "completed" : "bye";
    }

    // Backend can send status=scheduled while isScheduled=false (not actually booked yet).
    // In that case show pending in UI to avoid misleading "scheduled" badges.
    if (raw === "scheduled" && matchLike?.isScheduled === false) {
      return "pending";
    }

    return raw;
  };

  const showGroupMatchPageTabs =
    isGroupStageOnly &&
    Array.isArray(matchPageTournament?.groups) &&
    matchPageTournament.groups.length > 0;
  const showGroupMatchPageLegacy =
    isGroupStageOnly && !showGroupMatchPageTabs && groupStageView?.groups?.length > 0;
  const hideStandardMatchFilters = showGroupMatchPageTabs || showGroupMatchPageLegacy;

  const selectedPageGroup =
    matchPageTournament?.groups?.find((g) => g.groupNumber === activeGroupTab) || null;
  const currentRoundData = selectedPageGroup
    ? selectedPageGroup.rounds?.find((r) => r.roundNumber === selectedPageGroup.currentRound)
    : null;

  useEffect(() => {
    if (!showKnockoutBracket && activeView === "bracket") {
      setActiveView("matches");
    }
  }, [showKnockoutBracket, activeView]);

  const roundFilterOptions = useMemo(
    () =>
      sortedRoundNumbers.map((rn) => {
        const inRound = matches.filter((m) => Number(m.roundNumber) === rn);
        const sample = inRound[0];
        const count = inRound.length;
        return {
          value: String(rn),
          label: `${formatKnockoutRoundLabel(rn, sample?.roundType)} — ${count} match${
            count !== 1 ? "es" : ""
          }`,
        };
      }),
    [matches, sortedRoundNumbers]
  );

  // Filter matches based on status and round (by round number)
  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      const statusMatch =
        filterStatus === "all" || match.status === filterStatus;
      const rn = match.roundNumber;
      const roundMatch =
        selectedRound === "all" ||
        (rn != null && String(Number(rn)) === selectedRound);
      return statusMatch && roundMatch;
    });
  }, [matches, filterStatus, selectedRound]);

  const filteredMatchesDeduped = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of filteredMatches) {
      const k = String(m.id ?? `${m.roundNumber}-${m.matchNumber}-${m.player1Id}`);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
    return out;
  }, [filteredMatches]);

  // Bracket order: round asc, then match number asc (R1: 1 game, R2: 2 games, …)
  const matchesGroupedByRound = useMemo(() => {
    const map = new Map();
    for (const m of filteredMatchesDeduped) {
      const rn =
        m.roundNumber != null && Number.isFinite(Number(m.roundNumber))
          ? Number(m.roundNumber)
          : 0;
      if (!map.has(rn)) map.set(rn, []);
      map.get(rn).push(m);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === 0 && b === 0) return 0;
      if (a === 0) return 1;
      if (b === 0) return -1;
      return a - b;
    });
    return keys.map((k) => {
      const list = map.get(k);
      list.sort(
        (a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0)
      );
      return { roundKey: k, matches: list };
    });
  }, [filteredMatchesDeduped]);

  const bracketViewMatches = useMemo(
    () =>
      matches.filter((m) =>
        Boolean(
          m?.player1Id &&
            (m?.player2Id || m?.isBye) &&
            m?.status !== "rest"
        )
      ),
    [matches]
  );

  /** Fixtures tab: only real pairings — BYE / auto-advance rows are hidden */
  const fixturesGroupedByRound = useMemo(
    () =>
      matchesGroupedByRound
        .map(({ roundKey, matches: roundMatches }) => ({
          roundKey,
          matches: roundMatches.filter((m) =>
            Boolean(
              m?.player1Id &&
                m?.player2Id &&
                !m?.isSyntheticBye &&
                !m?.isBye &&
                m?.status !== "bye" &&
                m?.status !== "rest"
            )
          ),
        }))
        .filter((g) => g.matches.length > 0),
    [matchesGroupedByRound]
  );

  const defaultBestOf = tournamentDetail?.format?.bestOfFrames ?? null;
  const effectiveBestOf = (match) => {
    const v = match.bestOfFrames;
    if (v != null && Number(v) > 0) return Number(v);
    if (defaultBestOf != null && Number(defaultBestOf) > 0)
      return Number(defaultBestOf);
    return null;
  };

  const renderFrameDetails = (match) => {
    if (!match.player1FrameDetails && !match.player2FrameDetails) {
      return null;
    }

    let frameDetails = match.player1FrameDetails || match.player2FrameDetails;
    // Parse JSON string if needed (can come back as string from DB)
    if (typeof frameDetails === 'string') {
      try {
        frameDetails = JSON.parse(frameDetails);
      } catch (_e) {
        return null;
      }
    }
    if (!Array.isArray(frameDetails) || frameDetails.length === 0) return null;

    return (
      <div className="mt-4 bg-blue-50 rounded-lg p-3 text-sm">
        <div className="font-bold text-blue-900 mb-2 flex items-center gap-1">
          <FaClipboard className="text-blue-600" />
          Frame-by-Frame
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-blue-100">
              <tr>
                <th className="p-1 text-left">Frame</th>
                <th className="p-1 text-center">{match.player1?.name || "Player 1"}</th>
                <th className="p-1 text-center">{match.player2?.name || "Player 2"}</th>
                {match.sport === "snooker" && (
                  <>
                    <th className="p-1 text-center">P1 Break</th>
                    <th className="p-1 text-center">P2 Break</th>
                  </>
                )}
                <th className="p-1 text-center">Winner</th>
              </tr>
            </thead>
            <tbody>
              {frameDetails.map((frame, idx) => {
                const p1Score = parseInt(frame.player1Score) || parseInt(frame.player1) || 0;
                const p2Score = parseInt(frame.player2Score) || parseInt(frame.player2) || 0;
                const p1Name = match.player1?.name || "P1";
                const p2Name = match.player2?.name || "P2";
                const winner =
                  p1Score > p2Score ? p1Name : p2Score > p1Score ? p2Name : "Draw";
                const winnerColor =
                  p1Score > p2Score ? "text-blue-600" : p2Score > p1Score ? "text-red-600" : "text-gray-600";
                return (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-blue-50"}>
                    <td className="p-1 font-semibold text-gray-700">#{frame.frameNumber || (idx + 1)}</td>
                    <td className="p-1 text-center text-blue-600">{p1Score}</td>
                    <td className="p-1 text-center text-red-600">{p2Score}</td>
                    {match.sport === "snooker" && (
                      <>
                        <td className="p-1 text-center text-gray-600">
                          {frame.player1Break || "-"}
                        </td>
                        <td className="p-1 text-center text-gray-600">
                          {frame.player2Break || "-"}
                        </td>
                      </>
                    )}
                    <td className={`p-1 text-center font-bold ${winnerColor}`}>{winner}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const getStatusStyles = (status) => {
    const styles = {
      pending: "bg-orange-100 text-orange-800",
      scheduled: "bg-blue-100 text-blue-800",
      in_progress: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
      forfeit: "bg-rose-100 text-rose-800",
      bye: "bg-emerald-100 text-emerald-800",
      rest: "bg-emerald-100 text-emerald-800",
      pending_confirmation: "bg-orange-100 text-orange-800",
      disputed: "bg-red-100 text-red-800",
      walkover: "bg-purple-100 text-purple-800",
      voided: "bg-gray-100 text-gray-800",
    };
    return styles[status] || "bg-gray-100 text-gray-800";
  };

  const formatFixtureDate = (bookingValue = null) => {
    if (!bookingValue) return "-";
    try {
      // Handle ISO date string (YYYY-MM-DD) or full datetime
      const parsed = new Date(bookingValue);
      if (Number.isNaN(parsed.getTime())) return "-";
      return parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (_e) {
      return "-";
    }
  };

  const resolveMatchDate = (match) => {
    // ONLY return bookingDate - no fallback to bookingTime or any other field
    // If bookingDate is null, formatFixtureDate will return "-"
    return match?.bookingDate || null;
  };

  const handleBookMatch = async (match) => {
    const bookingTime = window.prompt("Enter booking date/time (YYYY-MM-DDTHH:mm)");
    if (!bookingTime) return;
    try {
      setBookingMatchId(match.id);
      await apiClient.post(`/tournaments/${selectedTournamentId}/matches/${match.id}/book`, {
        bookingTime,
      });
      await fetchTournamentData();
      showToast("Match booked successfully", "success");
    } catch (error) {
      showToast(error?.response?.data?.error || "Failed to book match", "error");
    } finally {
      setBookingMatchId(null);
    }
  };

  if (loading && tournaments.length === 0) {
    return <Loader text="Loading Tournaments..." />;
  }

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 w-full">
      <div className="rounded-[2rem] overflow-hidden bg-gradient-to-r from-[#132F45] to-[#1A3F5C] p-8 shadow-2xl border border-[#132F45]/10 mb-10 text-white">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#FDE68A] border border-white/10">
              <FaTrophy className="text-[#FDE68A]" />
              Tournament Operations
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Tournament Match Management</h1>
            <p className="max-w-2xl text-sm md:text-base text-[#E5E7EB] font-medium leading-relaxed">
              Track, update, and manage tournament match results and standings from one place.
            </p>
          </div>
        </div>
      </div>

      {/* Tournament Selector */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-md shadow-[#132F45]/5 p-5 md:p-6 mb-8">
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-0.5">
          Select Tournament
        </label>
        <select
          value={selectedTournamentId || ""}
          onChange={(e) => {
            const value = e.target.value;
            if (value) {
              setSelectedTournamentId(value);
            }
          }}
          className="w-full md:max-w-md bg-[#FAFAFA] border border-gray-200 rounded-2xl px-4 py-3 text-sm font-semibold text-[#132F45] outline-none focus:ring-2 focus:ring-[#132F45]/15 focus:border-[#BA995D]/40 transition"
        >
          <option value="">-- Select a Tournament --</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.format?.bestOfFrames ? `BO${t.format.bestOfFrames}` : ""}
              {t.sport ? ` - ${t.sport.charAt(0).toUpperCase() + t.sport.slice(1)}` : ""})
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="w-full">
        {!selectedTournamentId ? (
          // No tournament selected - show placeholder
          <Card className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center shadow-sm">
            <FaTrophy className="text-6xl text-[#132F45]/20 mx-auto mb-4" />
            <p className="text-gray-600 text-lg font-semibold">
              Select a tournament to view matches and standings
            </p>
          </Card>
        ) : loading ? (
          // Tournament selected but loading data
          <div className="flex justify-center items-center min-h-[24rem] rounded-2xl border border-gray-100 bg-white/80">
            <Loader text="Loading tournament data..." />
          </div>
        ) : !selectedTournament ? (
          // Tournament not found
          <Card className="bg-white border-2 border-dashed border-gray-300 p-12 text-center">
            <FaTrophy className="text-6xl text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">
              Tournament not found
            </p>
          </Card>
        ) : (
          <>
            {/* View Tabs */}
            <div className="flex flex-wrap gap-2 mb-6 bg-white rounded-2xl p-1.5 w-fit border border-gray-100 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveView("matches")}
                className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  activeView === "matches"
                    ? "bg-[#132F45] text-[#BA995D] shadow-md"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <FaCalendarAlt className="inline mr-2" />
                Matches ({matches.length}
                {filteredMatches.length !== matches.length
                  ? ` · ${filteredMatches.length} shown`
                  : ""}
                )
              </button>
              <button
                type="button"
                onClick={() => setActiveView("fixtures")}
                className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  activeView === "fixtures"
                    ? "bg-[#132F45] text-[#BA995D] shadow-md"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <FaClipboard className="inline mr-2" />
                Fixtures
              </button>
              <button
                type="button"
                onClick={() => setActiveView("standings")}
                className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  activeView === "standings"
                    ? "bg-[#132F45] text-[#BA995D] shadow-md"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <FaTrophy className="inline mr-2" />
                Standings
              </button>
              {showKnockoutBracket && (
                <button
                  type="button"
                  onClick={() => setActiveView("bracket")}
                  className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                    activeView === "bracket"
                      ? "bg-[#132F45] text-[#BA995D] shadow-md"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <FaNetworkWired className="inline mr-2" />
                  Bracket
                </button>
              )}
              {voidedMatchCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveView("voided-matches")}
                  className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all relative ${
                    activeView === "voided-matches"
                      ? "bg-[#132F45] text-[#BA995D] shadow-md"
                      : "text-yellow-600 hover:bg-yellow-50 border border-yellow-300"
                  }`}
                >
                  <FaExclamationTriangle className="inline mr-2" />
                  Voided ({voidedMatchCount})
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {voidedMatchCount}
                  </span>
                </button>
              )}
            </div>

            {activeView === "bracket" && showKnockoutBracket && (
              <KnockoutBracketView
                matches={bracketViewMatches}
                tournamentName={tournamentDetail?.name || selectedTournament?.name || ""}
              />
            )}

            {/* Fixtures: round-wise list — pairings only (BYE / auto-advance hidden) */}
            {activeView === "fixtures" && (
              <div className="space-y-8">
                {!schedulingConfig.autoGenerateFixtures && (
                  <Card className="bg-amber-50 border border-amber-200 p-4 text-amber-900">
                    Auto-generate fixtures is disabled for this tournament. Generate fixtures manually to populate this view.
                  </Card>
                )}
                <p className="text-sm text-gray-600">
                  Fixtures grouped by round (scheduled pairings only). BYE and auto-advance slots are not listed here — use the Matches tab to see them.
                </p>
                {fixturesGroupedByRound.length === 0 ? (
                  <Card className="bg-white border-2 border-dashed border-gray-300 p-8 text-center">
                    <FaClipboard className="text-4xl text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No pairing fixtures for the current filters</p>
                  </Card>
                ) : (
                  fixturesGroupedByRound.map(({ roundKey, matches: roundMatches }) => (
                    <section key={`fx-${roundKey || "unset"}`} className="space-y-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-teal-200 pb-2">
                        <h3 className="text-lg font-black text-gray-900">
                          {roundKey != null && Number(roundKey) >= 0
                            ? formatKnockoutRoundLabel(
                                roundKey,
                                roundMatches[0]?.roundType
                              )
                            : "Round"}
                        </h3>
                        <span className="text-sm font-semibold text-gray-500">
                          {roundMatches.length} match{roundMatches.length !== 1 ? "es" : ""}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {roundMatches.map((match) => {
                          const p1 =
                            match.player1?.name ||
                            match.Player1?.name ||
                            "Player";
                          const p2 =
                            match.player2?.name ||
                            match.Player2?.name ||
                            "";
                          return (
                            <li
                              key={String(match.id)}
                              className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm"
                            >
                              <span className="font-semibold text-gray-900">{p1}</span>
                              <span className="text-gray-400 font-bold">vs</span>
                              <span className="font-semibold text-gray-900">{p2}</span>
                          <span className="text-xs text-gray-500 ml-auto capitalize">
                                {getDisplayStatus(match).replace(/_/g, " ")}
                              </span>
                              <span className="text-xs text-gray-600 w-full sm:w-auto sm:ml-0">
                                {formatFixtureDate(resolveMatchDate(match))}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            )}

            {/* Matches View */}
            {activeView === "matches" && (
              <>
                {!hideStandardMatchFilters && (
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                    <h3 className="text-2xl font-bold text-gray-900">Matches</h3>
                    {showProgressButton && !hideProgressButtonForKnockout && (
                      <button
                        type="button"
                        onClick={() => handleGenerateNextRound({})}
                        disabled={disableProgressButton}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
                        title={
                          allCurrentRoundCompleted
                            ? isKnockoutLike && hasNextRoundAlready
                              ? "Next round already generated"
                              : progressButtonLabel
                            : `Complete all Round ${activeRound} matches first`
                        }
                      >
                        {generatingNextRound ? "Processing..." : progressButtonLabel}
                      </button>
                    )}
                  </div>
                )}

                {showGroupMatchPageTabs && (
                  <div className="mb-8 space-y-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-xl font-black text-gray-900">Group stage</h2>
                        <p className="text-sm text-gray-600">
                          {matchPageTournament.name?.trim() || selectedTournament?.name} · Select a group, then manage
                          the active round. Each group advances independently.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!allGroupStageDone || generatingNextRound}
                        onClick={() => handleGenerateNextRound({ startKnockout: true })}
                        className="shrink-0 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        title={
                          allGroupStageDone
                            ? "Create knockout bracket from group results"
                            : "Finish all group-stage matches first"
                        }
                      >
                        {generatingNextRound ? "Processing..." : "Start knockout bracket"}
                      </button>
                    </div>

                    <div
                      className="flex flex-wrap gap-2 border-b border-gray-200 pb-3"
                      role="tablist"
                      aria-label="Groups"
                    >
                      {matchPageTournament.groups.map((g) => {
                        const active = g.groupNumber === activeGroupTab;
                        return (
                          <button
                            key={g.groupNumber}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setActiveGroupTab(g.groupNumber)}
                            className={`px-4 py-2 rounded-t-lg text-sm font-bold transition border-b-2 -mb-px ${
                              active
                                ? "border-blue-600 text-blue-700 bg-white shadow-sm"
                                : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                            }`}
                          >
                            {g.groupName}
                            <span className="ml-2 text-xs font-semibold opacity-80">
                              R{g.currentRound}/{g.maxRounds || "—"}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedPageGroup && (
                      <div className="space-y-6" role="tabpanel">
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Players</span>
                          {selectedPageGroup.players.map((name, idx) => (
                            <span
                              key={`${selectedPageGroup.groupNumber}-p-${idx}`}
                              className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold border border-gray-200"
                            >
                              {name}
                            </span>
                          ))}
                        </div>

                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between bg-linear-to-r from-blue-50 to-white border border-blue-100 rounded-xl p-4">
                          <div>
                            <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">
                              Current round (all matches)
                            </p>
                            <h3 className="text-lg font-black text-gray-900">
                              {selectedPageGroup.groupName} — Round {selectedPageGroup.currentRound}
                              {selectedPageGroup.maxRounds
                                ? ` of ${selectedPageGroup.maxRounds}`
                                : ""}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                              Every pairing (and rest row, if any) for this round in this group.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            {groupCanAdvance(selectedPageGroup) && (
                              <button
                                type="button"
                                disabled={generatingNextRound}
                                onClick={() =>
                                  handleGenerateNextRound({ groupNumber: selectedPageGroup.groupNumber })
                                }
                                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap"
                              >
                                {generatingNextRound
                                  ? "Processing..."
                                  : selectedPageGroup.currentRound >= selectedPageGroup.maxRounds
                                    ? "Mark group complete"
                                    : "Next round (this group)"}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          {(currentRoundData?.matches || []).length === 0 ? (
                            <Card className="border-dashed border-gray-300 p-8 text-center text-gray-600">
                              No fixtures for this round yet.
                            </Card>
                          ) : (
                            (currentRoundData?.matches || []).map((entry, idx) => {
                              if (entry.isRest) {
                                return (
                                  <Card
                                    key={`rest-${selectedPageGroup.groupNumber}-r${selectedPageGroup.currentRound}-${idx}`}
                                    className="border-2 border-emerald-200 bg-emerald-50/40"
                                  >
                                    <div className="p-6 space-y-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-black uppercase tracking-wide text-emerald-900 bg-emerald-200/90 px-2 py-1 rounded">
                                          BYE
                                        </span>
                                        <span className="text-xs font-semibold text-gray-600">
                                          No opponent this round
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-center gap-4 bg-white/70 border border-emerald-100 rounded-lg p-4">
                                        <div className="text-center">
                                          <div className="text-sm text-gray-500">Player</div>
                                          <div className="font-bold text-gray-900">{entry.p1}</div>
                                        </div>
                                        <div className="text-2xl font-black text-gray-300">VS</div>
                                        <div className="text-center min-w-24">
                                          <div className="text-sm text-gray-500">Opponent</div>
                                          <span className="inline-flex mt-1 items-center justify-center rounded-full bg-emerald-100 text-emerald-900 px-3 py-1 text-sm font-black tracking-wide">
                                            BYE
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </Card>
                                );
                              }
                              const match =
                                resolveMatchFromState(entry.matchId) || entry.match || {};
                              const badgeStatus = getDisplayStatus({
                                ...match,
                                status: entry.status || match.status,
                                derivedStatus: match?.derivedStatus || entry.status,
                              });
                              return (
                                <Card
                                  key={entry.matchId || idx}
                                  className="bg-white border border-gray-200 hover:shadow-lg transition-all"
                                >
                                  <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                      <div>
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                          {formatKnockoutRoundLabel(
                                            selectedPageGroup.currentRound,
                                            match.roundType || "group_stage"
                                          )}{" "}
                                          · {selectedTournament.sport?.toUpperCase()}
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900">Match {idx + 1}</h3>
                                      </div>
                                      <span
                                        className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusStyles(
                                          badgeStatus
                                        )}`}
                                      >
                                        {badgeStatus.replace(/_/g, " ")}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                      <div className="flex items-center justify-center gap-4 bg-gray-50 rounded-lg p-4">
                                        <div className="text-center">
                                          <div className="text-sm text-gray-500">Player 1</div>
                                          <div className="font-bold text-gray-900">
                                            {match.player1?.name ||
                                              match.Player1?.name ||
                                              entry.p1 ||
                                              "Player 1"}
                                          </div>
                                          <div className="text-2xl font-black text-blue-600 mt-2">
                                            {match.player1FramesWon || 0}
                                          </div>
                                        </div>
                                        <div className="text-2xl font-black text-gray-300">VS</div>
                                        <div className="text-center">
                                          <div className="text-sm text-gray-500">Player 2</div>
                                          <div className="font-bold text-gray-900">
                                            {match.player2?.name ||
                                              match.Player2?.name ||
                                              entry.p2 ||
                                              "Player 2"}
                                          </div>
                                          <div className="text-2xl font-black text-red-600 mt-2">
                                            {match.player2FramesWon || 0}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                          <FaCalendarAlt className="text-blue-600 text-lg" />
                                          <div>
                                            <div className="text-xs text-gray-500 font-bold">DATE</div>
                                            <div className="font-medium text-gray-900">
                                              {formatFixtureDate(resolveMatchDate(match))}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    {renderFrameDetails(match)}
                                  </div>
                                </Card>
                              );
                            })
                          )}
                        </div>

                        <details className="group border border-gray-200 rounded-xl bg-white overflow-hidden">
                          <summary className="cursor-pointer px-4 py-3 font-bold text-gray-800 bg-gray-50 list-none flex items-center justify-between">
                            <span>Other rounds</span>
                            <span className="text-xs font-semibold text-gray-500">
                              {(selectedPageGroup.rounds || []).filter(
                                (r) => r.roundNumber !== selectedPageGroup.currentRound
                              ).length}{" "}
                              round(s)
                            </span>
                          </summary>
                          <div className="p-4 space-y-8 border-t border-gray-100">
                            {(selectedPageGroup.rounds || [])
                              .filter((rne) => rne.roundNumber !== selectedPageGroup.currentRound)
                              .sort((a, b) => a.roundNumber - b.roundNumber)
                              .map((rne) => (
                                <div key={`other-r-${rne.roundNumber}`} className="space-y-3">
                                  <h4 className="text-sm font-black text-gray-700 border-b border-gray-100 pb-2">
                                    Round {rne.roundNumber}{" "}
                                    {rne.roundNumber < selectedPageGroup.currentRound ? "· completed" : "· upcoming"}
                                  </h4>
                                  <ul className="space-y-2 text-sm text-gray-700">
                                    {(rne.matches || []).map((row, j) => (
                                      <li
                                        key={row.matchId || `r${rne.roundNumber}-${j}`}
                                        className="flex flex-wrap gap-2 items-center py-2 border-b border-gray-50 last:border-0"
                                      >
                                        {row.isRest ? (
                                          <>
                                            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-900 px-2 py-0.5 text-xs font-black">
                                              BYE
                                            </span>
                                            <span className="font-medium">{row.p1}</span>
                                            <span className="text-gray-400 font-bold">vs</span>
                                            <span className="font-semibold text-emerald-800">BYE</span>
                                          </>
                                        ) : (
                                          <>
                                            <span className="font-medium">{row.p1}</span>
                                            <span className="text-gray-400">vs</span>
                                            <span className="font-medium">{row.p2}</span>
                                            <span className="text-xs text-gray-500 ml-auto capitalize">
                                              {row.status}
                                            </span>
                                          </>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}

                {showGroupMatchPageLegacy && (
                  <div className="mb-6 space-y-6">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={!allGroupStageDone || generatingNextRound}
                        onClick={() => handleGenerateNextRound({ startKnockout: true })}
                        className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        title={
                          allGroupStageDone
                            ? "Create knockout bracket from group results"
                            : "Finish all group-stage matches first"
                        }
                      >
                        {generatingNextRound ? "Processing..." : "Start knockout bracket"}
                      </button>
                    </div>
                    {groupStageView.groups.map((g) => (
                      <div
                        key={g.groupNumber}
                        className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 shadow-sm"
                      >
                        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-gray-100 pb-3">
                          <div>
                            <h3 className="text-lg font-black text-gray-900">{g.groupName}</h3>
                            <p className="text-sm text-gray-600">
                              Active round {g.currentRound}
                              {g.maxRounds ? ` / ${g.maxRounds}` : ""}
                              {g.status === "completed" ? " · Complete" : ""}
                            </p>
                          </div>
                          {groupCanAdvance(g) && (
                            <button
                              type="button"
                              disabled={generatingNextRound}
                              onClick={() => handleGenerateNextRound({ groupNumber: g.groupNumber })}
                              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition"
                            >
                              {generatingNextRound
                                ? "Processing..."
                                : g.currentRound >= g.maxRounds
                                  ? "Mark group complete"
                                  : "Next round for this group"}
                            </button>
                          )}
                        </div>
                        {g.rounds.map(({ roundNumber, matches: roundMatches }) => (
                          <div key={`${g.groupNumber}-r${roundNumber}`} className="space-y-3">
                            <h4 className="text-sm font-bold text-gray-800">Round {roundNumber}</h4>
                            <div className="space-y-4 pl-0">
                              {roundMatches.map((match, matchIndexInRound) => (
                                <Card
                                  key={match.id}
                                  className="bg-white border border-gray-200 hover:shadow-lg transition-all"
                                >
                                  <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                      <div>
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                          {formatKnockoutRoundLabel(match.roundNumber, match.roundType)} ·{" "}
                                          {selectedTournament.sport?.toUpperCase()}
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900">
                                          Match {matchIndexInRound + 1}
                                        </h3>
                                      </div>
                                      <span
                                        className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusStyles(
                                          match.status
                                        )}`}
                                      >
                                        {(match.status || "unknown").replace(/_/g, " ")}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                      <div className="flex items-center justify-center gap-4 bg-gray-50 rounded-lg p-4">
                                        <div className="text-center">
                                          <div className="text-sm text-gray-500">Player 1</div>
                                          <div className="font-bold text-gray-900">
                                            {match.player1?.name ||
                                              match.Player1?.name ||
                                              match.Player1?.firstName ||
                                              "Player 1"}
                                          </div>
                                          <div className="text-2xl font-black text-blue-600 mt-2">
                                            {match.player1FramesWon || 0}
                                          </div>
                                        </div>
                                        <div className="text-2xl font-black text-gray-300">VS</div>
                                        <div className="text-center">
                                          <div className="text-sm text-gray-500">Player 2</div>
                                          <div className="font-bold text-gray-900">
                                            {match.player2?.name ||
                                              match.Player2?.name ||
                                              match.Player2?.firstName ||
                                              "Player 2"}
                                          </div>
                                          <div className="text-2xl font-black text-red-600 mt-2">
                                            {match.player2FramesWon || 0}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                          <FaCalendarAlt className="text-blue-600 text-lg" />
                                          <div>
                                            <div className="text-xs text-gray-500 font-bold">DATE</div>
                                            <div className="font-medium text-gray-900">
                                              {formatFixtureDate(resolveMatchDate(match))}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    {renderFrameDetails(match)}
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Filters */}
                <div className={`bg-white rounded-xl p-4 mb-6 border border-gray-200 flex flex-wrap gap-4 ${hideStandardMatchFilters ? "hidden" : ""}`}>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      Round
                    </label>
                    <select
                      value={selectedRound}
                      onChange={(e) => setSelectedRound(e.target.value)}
                      className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="all">All rounds ({matches.length})</option>
                      {roundFilterOptions.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="all">All Statuses</option>
                      <option value="bye">Bye</option>
                      <option value="rest">Rest</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="pending_confirmation">Pending Confirmation</option>
                      <option value="disputed">Disputed</option>
                    </select>
                  </div>
                </div>

                <p className={`text-sm text-gray-600 mb-4 ${hideStandardMatchFilters ? "hidden" : ""}`}>
                  Showing{" "}
                  <span className="font-bold text-gray-900">
                    {filteredMatches.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-bold text-gray-900">{matches.length}</span>{" "}
                  bracket entries (includes BYE / auto-advance rows)
                </p>

                {/* Matches List — grouped by round, ordered by match number within round */}
                <div className={`space-y-8 ${hideStandardMatchFilters ? "hidden" : ""}`}>
                  {filteredMatches.length === 0 ? (
                    <Card className="bg-white border-2 border-dashed border-gray-300 p-8 text-center">
                      <FaCalendarAlt className="text-4xl text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">
                        No matches found for selected filters
                      </p>
                    </Card>
                  ) : (
                    matchesGroupedByRound.map(({ roundKey, matches: roundMatches }) => (
                      <section key={roundKey || "unset"} className="space-y-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-2">
                          <h3 className="text-lg font-black text-gray-900">
                            {roundKey != null && Number(roundKey) >= 0
                              ? formatKnockoutRoundLabel(
                                  roundKey,
                                  roundMatches[0]?.roundType
                                )
                              : "Round not set"}
                          </h3>
                          <span className="text-sm font-semibold text-gray-500">
                            {roundMatches.length} match
                            {roundMatches.length !== 1 ? "es" : ""} this round
                          </span>
                        </div>
                        <div className="space-y-4 pl-0">
                          {roundMatches.map((match, matchIndexInRound) => {
                            const byeDisplay = matchRowIsBye(match);
                            // For Swiss format, always use AUTO ADVANCE layout (not VS layout)
                            const byeVsLayout = byeDisplay && showByeAsOpponentLabel && !isSwiss;
                            const displayStatus = getDisplayStatus(match);
                            return (
                      <Card
                        key={match.id}
                        className={`bg-white border border-gray-200 hover:shadow-lg transition-all ${
                          byeDisplay ? "border-2 border-emerald-300 bg-emerald-50/40" : ""
                        }`}
                      >
                        <div className="p-6">
                          {/* Match Header — display 1..N within round; DB matchNumber is bracket pair slot */}
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                {formatKnockoutRoundLabel(match.roundNumber, match.roundType)}
                                {" "}
                                · {selectedTournament.sport?.toUpperCase()}
                              </div>
                              <h3 className="text-lg font-bold text-gray-900">
                                {byeDisplay
                                  ? (showByeAsOpponentLabel && !isSwiss)
                                    ? "BYE"
                                    : "REST (BYE)"
                                  : `Match ${matchIndexInRound + 1}`}
                                {match.bracketPosition != null && match.bracketPosition !== "" && (
                                  <span className="text-sm font-semibold text-gray-500">
                                    {" "}
                                    ({match.bracketPosition})
                                  </span>
                                )}
                              </h3>
                              {showKnockoutBracket &&
                                match.matchNumber != null &&
                                Number(match.matchNumber) !== matchIndexInRound + 1 && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    Bracket pair slot: {match.matchNumber}
                                  </p>
                                )}
                              <div className="flex gap-2 mt-1">
                                {effectiveBestOf(match) != null && (
                                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                                    Best of {effectiveBestOf(match)}
                                  </span>
                                )}
                                {match.handicapApplied && (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Handicap Applied</span>
                                )}
                              </div>
                            </div>
                            <span className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusStyles(displayStatus)}`}>
                              {displayStatus.replace(/_/g, " ")}
                            </span>
                          </div>

                          {/* Match Details Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                            {/* Players & Score */}
                            {byeVsLayout ? (
                              <div className="flex flex-col gap-3 md:col-span-2 bg-gray-50 rounded-lg p-4 border border-gray-100">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-black uppercase tracking-wide text-emerald-900 bg-emerald-200/80 px-2 py-1 rounded">
                                    BYE
                                  </span>
                                  {isSwiss && (
                                    <span className="text-xs font-semibold text-emerald-800">
                                      Pairing bye (awarded win)
                                    </span>
                                  )}
                                  {isGroupsKnockoutFormat && !isSwiss && (
                                    <span className="text-xs font-semibold text-emerald-800">
                                      No head-to-head opponent this round
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-center gap-4 bg-white/80 rounded-lg p-4 border border-emerald-100/80">
                                  <div className="text-center">
                                    <div className="text-sm text-gray-500">Player 1</div>
                                    <div className="font-bold text-gray-900">
                                      {match.player1?.name ||
                                        match.Player1?.name ||
                                        match.Player1?.firstName ||
                                        "Player 1"}
                                    </div>
                                    {match.handicapPlayer1 > 0 && (
                                      <div className="text-xs text-amber-600 font-medium">
                                        +{match.handicapPlayer1} frames
                                      </div>
                                    )}
                                    <div className="text-2xl font-black text-blue-600 mt-2">
                                      {match.player1FramesWon ?? 0}
                                    </div>
                                  </div>
                                  <div className="text-2xl font-black text-gray-300">VS</div>
                                  <div className="text-center min-w-24">
                                    <div className="text-sm text-gray-500">Player 2</div>
                                    <span className="inline-flex mt-1 items-center justify-center rounded-full bg-emerald-100 text-emerald-900 px-3 py-1 text-sm font-black tracking-wide">
                                      BYE
                                    </span>
                                    <div className="text-2xl font-black text-gray-400 mt-2">—</div>
                                  </div>
                                </div>
                              </div>
                            ) : byeDisplay ? (
                              <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:col-span-2 bg-emerald-50/60 border-2 border-emerald-300 rounded-lg p-5">
                                <span className="text-xs font-black uppercase tracking-wide text-emerald-800 bg-emerald-200/80 px-3 py-1 rounded w-fit">
                                  AUTO ADVANCE
                                </span>
                                <div className="font-bold text-gray-900 text-lg">
                                  {match.player1?.name || match.Player1?.name || match.Player1?.firstName || "Player"}
                                </div>
                                <div className="text-emerald-700 font-semibold">
                                  → REST (BYE)
                                </div>
                              </div>
                            ) : (
                            <div className="flex items-center justify-center gap-4 bg-gray-50 rounded-lg p-4">
                              <div className="text-center">
                                <div className="text-sm text-gray-500">Player 1</div>
                                <div className="font-bold text-gray-900">
                                  {match.player1?.name || match.Player1?.name || match.Player1?.firstName || "Player 1"}
                                </div>
                                {match.handicapPlayer1 > 0 && (
                                  <div className="text-xs text-amber-600 font-medium">+{match.handicapPlayer1} frames</div>
                                )}
                                <div className="text-2xl font-black text-blue-600 mt-2">
                                  {match.player1FramesWon || 0}
                                </div>
                              </div>
                              <div className="text-2xl font-black text-gray-300">VS</div>
                              <div className="text-center">
                                <div className="text-sm text-gray-500">Player 2</div>
                                <div className="font-bold text-gray-900">
                                  {match.player2?.name || match.Player2?.name || match.Player2?.firstName || "Player 2"}
                                </div>
                                {match.handicapPlayer2 > 0 && (
                                  <div className="text-xs text-amber-600 font-medium">+{match.handicapPlayer2} frames</div>
                                )}
                                <div className="text-2xl font-black text-red-600 mt-2">
                                  {match.player2FramesWon || 0}
                                </div>
                              </div>
                            </div>
                            )}

                            {/* Match Info */}
                            <div className="space-y-3">
                              {!matchRowIsBye(match) && (
                                <div className="flex items-center gap-3">
                                  <FaCalendarAlt className="text-blue-600 text-lg" />
                                  <div>
                                    <div className="text-xs text-gray-500 font-bold">DATE</div>
                                    <div className="font-medium text-gray-900">
                                      {formatFixtureDate(resolveMatchDate(match))}
                                      {match.scheduledTime && match.scheduledDate ? ` at ${match.scheduledTime}` : ""}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {match.Venue && (
                                <div className="flex items-center gap-3">
                                  <FaMapMarkerAlt className="text-red-600 text-lg" />
                                  <div>
                                    <div className="text-xs text-gray-500 font-bold">VENUE</div>
                                    <div className="font-medium text-gray-900">
                                      {match.Venue?.venueName}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {schedulingConfig.enforceDeadlines && (
                                <div className="flex items-center gap-3">
                                  <FaClock className="text-orange-600 text-lg" />
                                  <div>
                                    <div className="text-xs text-gray-500 font-bold">DEADLINE</div>
                                    <div className="font-medium text-gray-900">
                                      {match.deadline ? formatFixtureDate(match.deadline) : "-"}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Frame Details if available (never for BYE/rest rows) */}
                          {!byeDisplay && renderFrameDetails(match)}

                          {/* Actions */}
                          {match.status === "pending_confirmation" && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-sm text-blue-700 font-medium mb-3">
                                ℹ️ Awaiting player confirmation
                              </p>
                              <Button
                                variant="primary"
                                className="bg-blue-600 text-white flex items-center gap-2"
                              >
                                <FaEye /> View Details
                              </Button>
                            </div>
                          )}
                          {/* {schedulingConfig.flexibleScheduling && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <Button
                                variant="primary"
                                className="bg-indigo-600 text-white"
                                onClick={() => handleBookMatch(match)}
                                disabled={!match.canBook || bookingMatchId === match.id}
                              >
                                {bookingMatchId === match.id ? "Booking..." : "Book Match"}
                              </Button>
                            </div>
                          )} */}
                        </div>
                      </Card>
                          );
                          })}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              </>
            )}

            {/* Standings View */}
            {activeView === "standings" && (
              <Card className="bg-white border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <FaTrophy className="text-yellow-500" />
                    Tournament Standings
                  </h2>
                </div>
                <div className="p-6">
                  <TournamentStandingsTable
                    tournamentId={selectedTournamentId}
                    tournament={matchPageTournament}
                    currentUserId={null}
                    onPlayerClick={(player) => {
                      console.log('Player clicked:', player);
                      // Add navigation or modal logic here if needed
                    }}
                  />
                </div>
              </Card>
            )}

            {/* Voided Matches View */}
            {activeView === "voided-matches" && (
              <div className="bg-white rounded-lg">
                <VoidedMatchesManager
                  tournamentId={selectedTournamentId}
                  onResolved={fetchTournamentData}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TournamentMatchManagement;
