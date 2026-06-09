import React, { useState, useEffect, useCallback, useContext, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { getImageUrl } from "../../../../utils/imageUtils";
import { motion, AnimatePresence } from "framer-motion";
import { LeagueContext } from "../../../../contexts/LeagueContext";
import { MatchResultContext } from "../../../../contexts/MatchResultContext";
import { OrganizationContext } from "../../../../contexts/OrganizationContext";
import apiClient from "../../../../contexts/apiClient";

import {
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaClock,
  FaTrophy,
  FaEye,
  FaChevronRight,
  FaPencilAlt,
  FaHistory,
  FaSpinner,
  FaGlobeAmericas,
  FaUserPlus,
  FaLock,
  FaRegCopy,
  FaImage,
  FaTimes,
  FaCheck,
  FaList,
  FaProjectDiagram,
  FaStar,
  FaArrowDown,
  FaCrown,
  FaInfoCircle,
  FaShieldAlt,
  FaClipboardList,
  FaCogs,
  FaChartLine,
  FaUserShield,
  FaBullseye
} from "react-icons/fa";

// Game icons
import Snooker from "../../../../assets/snooker.png";
import Poker from "../../../../assets/pooker.png";
import Pool from "../../../../assets/pool.png";

// Components
import StandingsOverrideModal from "../LeagueManagement/StandingsOverrideModal";
import PendingWalkoverModal from "./PendingWalkoverModal";
import LeagueBracketView, { ChampionBanner } from "./LeagueBracketView";

// Helper functions (moved from service)
const transformFixturesToMatches = (fixtures, divisionId, league, divisions) => {
  if (!fixtures || !Array.isArray(fixtures)) return [];

  return fixtures.map(fixture => {
    const division = divisions?.find(d => d.id === fixture.divisionId) || fixture.division || {};

    // Determine the score string based on sport and results
    let score = "0-0";
    if (fixture.status === 'completed' || fixture.status === 'walkover') {
      const sportName = String(league?.sport || league?.basicInfo?.sport || fixture.sport || '').toLowerCase();
      if (sportName === 'pool') {
        score = `${fixture.player1RackWins ?? 0}-${fixture.player2RackWins ?? 0}`;
      } else {
        score = `${fixture.player1Frames ?? 0}-${fixture.player2Frames ?? 0}`;
      }
    }

    // PRIORITIZE BOOKING DATA ONLY: User wants to see "TBA" unless a table is actually booked or scheduled by organizer.
    let matchDate = "TBA";
    let startTime = "TBA";

    // Only pick the first booking if it exists and is in a valid status
    if (fixture.bookings && fixture.bookings.length > 0) {
      const b = fixture.bookings[0];
      const isValidStatus = !['cancelled', 'rejected'].includes(b.status);

      if (isValidStatus) {
        if (b.bookingDate) matchDate = b.bookingDate;
        if (b.startTime) {
          startTime = typeof b.startTime === 'string' ? b.startTime.substring(0, 5) : "TBA";
        }
      }
    }

    // Fallback to fixture.scheduledDate if explicitly scheduled by the organizer/admin
    let resDataObj = {};
    if (fixture.resultData) {
      try {
        resDataObj = typeof fixture.resultData === 'string' ? JSON.parse(fixture.resultData) : fixture.resultData;
      } catch (e) {
        resDataObj = {};
      }
    }
    const isOrganizerScheduled = resDataObj?.isOrganizerScheduled || fixture.additionalData?.resultData?.isOrganizerScheduled || fixture.additionalData?.isOrganizerScheduled;
    
    let hasExplicitDate = isOrganizerScheduled;
    if (!hasExplicitDate && fixture.scheduledDate && league?.leagueStartDate) {
      try {
        const start = new Date(league.leagueStartDate);
        if (!isNaN(start.getTime())) {
          start.setDate(start.getDate() + ((fixture.round || 1) - 1) * 7);
          const generatedStr = start.toISOString().split('T')[0];
          const scheduledStr = new Date(fixture.scheduledDate).toISOString().split('T')[0];
          if (generatedStr !== scheduledStr) {
            hasExplicitDate = true;
          }
        }
      } catch (e) {}
    }

    if (matchDate === "TBA" && hasExplicitDate && fixture.scheduledDate) {
      const sDate = new Date(fixture.scheduledDate);
      if (!isNaN(sDate.getTime())) {
        matchDate = sDate.toISOString().split('T')[0];
        // Convert to HH:MM format for startTime (local timezone matching)
        const hrs = String(sDate.getHours()).padStart(2, '0');
        const mins = String(sDate.getMinutes()).padStart(2, '0');
        startTime = `${hrs}:${mins}`;
      }
    }

    // Determine home/away names properly, masking withdrawn players
    const getPlayerName = (player, defaultName) => {
      const lp = player?.leaguePlayers?.[0];
      const name = player?.name || (player?.nickname ? `@${player.nickname}` : defaultName);
      if (lp?.status === 'withdrawn') return `${name} (Withdrawn)`;
      return name;
    };

    const homeName = getPlayerName(fixture.player1, 'TBD');
    const awayName = fixture.status === 'bye' ? 'BYE' : getPlayerName(fixture.player2, 'TBD');

    // Extract venue/table name from first booking or additional data if available
    let tableName = "TBA";
    if (fixture.bookings && fixture.bookings.length > 0) {
      const b = fixture.bookings[0];
      const isValidStatus = !['cancelled', 'rejected'].includes(b.status);
      if (isValidStatus) {
        const venueNameStr = b.venue?.venueName || b.venue?.name;
        if (venueNameStr && b.tableName) {
          tableName = `${venueNameStr} (${b.tableName})`;
        } else if (venueNameStr) {
          tableName = venueNameStr;
        } else if (b.tableName) {
          tableName = b.tableName;
        }
      }
    }

    if (tableName === "TBA") {
      let addDataRes = fixture.additionalData?.resultData || {};
      if (typeof addDataRes === 'string') {
        try { addDataRes = JSON.parse(addDataRes); } catch (e) { addDataRes = {}; }
      }
      tableName = resDataObj?.tableName || addDataRes?.tableName || fixture.tableName || fixture.additionalData?.tableName || (fixture.tableNumber ? `Table ${fixture.tableNumber}` : "TBA");
    }

    // Map frame details from fixture or matchResult for all game types
    const mr = fixture.matchResult || fixture.additionalData?.matchResult || {};
    let frameDetails = [];

    if (fixture.resultData) {
      if (Array.isArray(fixture.resultData)) {
        frameDetails = fixture.resultData;
      } else if (typeof fixture.resultData === 'object' && fixture.resultData !== null) {
        frameDetails = fixture.resultData.frameDetails || 
                       fixture.resultData.snookerFrameDetails || 
                       fixture.resultData.poolRackDetails || 
                       fixture.resultData.pookerFrameDetails || [];
      } else if (typeof fixture.resultData === 'string') {
        try {
          const parsed = JSON.parse(fixture.resultData);
          if (Array.isArray(parsed)) {
            frameDetails = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
            frameDetails = parsed.frameDetails || 
                           parsed.snookerFrameDetails || 
                           parsed.poolRackDetails || 
                           parsed.pookerFrameDetails || [];
          }
        } catch (e) {
          frameDetails = [];
        }
      }
    }

    if (!Array.isArray(frameDetails) || frameDetails.length === 0) {
      const fallback = fixture.frameDetails || mr.pookerFrameDetails || mr.snookerFrameDetails || mr.poolRackDetails || [];
      frameDetails = typeof fallback === 'string' ? (() => {
        try {
          const parsed = JSON.parse(fallback);
          return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } catch { return []; }
      })() : fallback;
    }

    // Determine if this match was disputed and resolved by an admin
    const isDisputed = !!mr.disputeReason || mr.resultStatus === 'Disputed' || !!fixture.additionalData?.disputeReason;

    // Identify walkover/forfeit
    const isWalkover = mr.isWalkover === true ||
                       mr.isWalkover === 'true' ||
                       !!mr.walkoverScore ||
                       fixture.isWalkover === true ||
                       fixture.isWalkover === 'true' ||
                       !!(resDataObj?.isWalkover || resDataObj?.isManualWalkover || resDataObj?.isAutoForfeit || resDataObj?.walkoverApprovedAt || resDataObj?.walkoverConfirmed) ||
                       fixture.status === 'walkover' ||
                       fixture.detailedStatus === 'WALKOVER';

    // Identify whitewash
    const isDraw = !isWalkover && fixture.status === 'completed' && (() => {
      const sportName = String(league?.sport || league?.basicInfo?.sport || fixture.sport || '').toLowerCase();
      const s1 = Number(sportName === 'pool' ? (fixture.player1RackWins ?? fixture.player1Frames) : fixture.player1Frames) || 0;
      const s2 = Number(sportName === 'pool' ? (fixture.player2RackWins ?? fixture.player2Frames) : fixture.player2Frames) || 0;
      return s1 === s2 && s1 > 0 && !fixture.winnerId;
    })();

    const isWhitewash = !isDraw && (fixture.detailedStatus === 'WHITEWASH' || (!isWalkover && (fixture.status === 'completed' || fixture.status === 'walkover') && (() => {
      const sportName = String(league?.sport || league?.basicInfo?.sport || fixture.sport || '').toLowerCase();
      const s1 = Number(sportName === 'pool' ? (fixture.player1RackWins ?? fixture.player1Frames) : fixture.player1Frames) || 0;
      const s2 = Number(sportName === 'pool' ? (fixture.player2RackWins ?? fixture.player2Frames) : fixture.player2Frames) || 0;
      return (s1 > 0 && s2 === 0) || (s2 > 0 && s1 === 0);
    })()));

    // Identify if awaiting admin approval
    const isAwaitingAdmin = mr.resultStatus === 'Awaiting Admin Approval';

    // Determine if match is truly scheduled (has booking) vs just upcoming
    const isActuallyScheduled = fixture.status === 'scheduled' && matchDate !== "TBA";
    const finalStatus = isActuallyScheduled ? 'scheduled' : (fixture.status === 'scheduled' ? 'upcoming' : (fixture.status || 'upcoming'));

    return {
      ...fixture,
      date: matchDate,
      startTime: startTime,
      homeTeam: homeName,
      awayTeam: awayName,
      score: score,
      divisionId: fixture.divisionId,
      divisionName: division.name || 'Main Division',
      additionalData: fixture.additionalData || fixture.resultData || {},
      status: finalStatus,
      detailedStatus: isWalkover ? 'WALKOVER' : (isAwaitingAdmin ? 'PENDING APPROVAL' : (isDraw ? 'DRAW' : (isWhitewash ? 'WHITEWASH' : (fixture.detailedStatus || (finalStatus === 'scheduled' ? 'SCHEDULED' : finalStatus?.toUpperCase()))))),
      tableName: tableName,
      frameDetails: Array.isArray(frameDetails) ? frameDetails : [],
      isDisputed: isDisputed,
      isWalkover: isWalkover,
      isAwaitingAdmin: isAwaitingAdmin,
      resolutionNotes: mr.notes || "",
      gameType: league?.sport?.toLowerCase() || league?.gameName?.toLowerCase() || fixture.sport?.toLowerCase() || "snooker"
    };
  });
};

// Helper functions
const statusStyles = {
  upcoming: "bg-blue-100 text-blue-800",
  ongoing: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  pending: "bg-orange-100 text-orange-800",
};

const formatDate = (dateString) => {
  if (!dateString || dateString === "TBA" || dateString === "TBD") return "TBA";
  try {
    // Force local parsing by replacing hyphens with slashes for YYYY-MM-DD strings
    const sanitized = typeof dateString === 'string' && !dateString.includes('T') ? dateString.replace(/-/g, '/') : dateString;
    const date = new Date(sanitized);
    if (isNaN(date.getTime())) return "TBA";
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "TBA";
  }
};

const formatTime = (timeString) => {
  if (!timeString || timeString === "TBA" || timeString === "--:--") return "TBA";
  // If it's already a short time (HH:MM), just return it
  if (timeString.length === 5 && timeString.includes(':')) return timeString;

  try {
    // If it's a full ISO string
    if (timeString.includes('T')) {
      const date = new Date(timeString);
      return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    // If it's just a time string HH:MM:SS
    const date = new Date(`2000-01-01T${timeString}`);
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return timeString;
  }
};

const getGameIcon = (gameName) => {
  if (!gameName) return Snooker;
  const name = gameName.toLowerCase().trim();
  if (name === "snooker") return Snooker;
  if (name === "poker" || name === "pooker") return Poker;
  if (name === "pool") return Pool;
  return Snooker;
};
/**
 * Helper to construct full image URL for uploaded results
 */
const getFullImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;

  // Get API base URL
  let baseUrl = import.meta.env.VITE_API_URL || '';

  // NORMALIZE: Images are usually served from the root-level /uploads directory, 
  // while the API might be under /api. Strip /api if present for image paths.
  const rootUrl = baseUrl.replace(/\/api\/?$/, '');

  // Normalize slashes and prepend root URL
  const normalizedPath = url.replace(/\\/g, '/');
  return `${rootUrl.replace(/\/$/, '')}/${normalizedPath.replace(/^\//, '')}`;
};

const getLeagueGameName = (league) => {
  if (!league) return '';
  const gameName = league.season?.game?.name || league.gameName || league.gameId || league.basicInfo?.gameName || league.basicInfo?.gameId || league.sport || '';
  return typeof gameName === 'string' ? gameName.trim() : String(gameName).trim();
};

// --- Fixture Card Component (for List View) ---
const FixtureCard = ({ match, onViewDetails, canEditFixtures, canEditResults, onEditFixture, onEditResult, canWalkover, onWalkover, promoRegInfo, effectiveFormat, champion, leagueStatus }) => {
  const isTBD = match.homeTeam === 'TBD' && match.awayTeam === 'TBD';
  const isCompleted = match.status === 'completed' || match.status === 'walkover';
  const isBye = match.status === 'bye' || match.detailedStatus === 'BYE';
  const isPendingConfirmation = match.matchResult?.resultStatus === 'Pending';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)" }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all p-4 md:p-5 mb-4 flex flex-col md:flex-row items-center gap-5 group relative overflow-hidden"
    >





      {/* Status Accent Line */}
      <div className={`absolute top-0 left-0 w-1 h-full ${isCompleted || isBye ? 'bg-green-500' : 'bg-blue-500'
        }`} />

      {/* Date and Time Container */}
      <div className="flex flex-row md:flex-col items-center justify-center min-w-[120px] border-b md:border-b-0 md:border-r border-gray-100 pb-3 md:pb-0 md:pr-6 w-full md:w-auto">
        <div className="flex flex-col items-center">
          <div className="text-[10px] md:text-[11px] font-black text-blue-600 uppercase tracking-widest mb-1">
            {formatDate(match.date).replace(/ \d{4}$/, '')}
          </div>
          <div className="text-sm md:text-base font-black text-[#132F45] tracking-tight">
            <FaClock className="inline mr-2 text-[10px] opacity-40" />
            {match.startTime}
          </div>
        </div>
      </div>

      {/* Players/Teams Section - The "Showcase" */}
      <div className="flex-1 flex items-center justify-between gap-4 md:gap-8 w-full py-1">
        {/* Player 1 */}
        <div className="flex-1 flex flex-col items-end text-right min-w-0">
          <span className={`text-sm md:text-[15px] font-black truncate w-full transition-colors ${(isCompleted && (() => {
              const [s1, s2] = (match.score || "0-0").split(/[- :]/).map(s => parseInt(s) || 0);
              // If scores are different, use them as ground truth
              if (s1 !== s2) return s1 > s2;
              // If scores are same (tie-break/forfeit), use winnerId
              if (match.winnerId && match.additionalData?.player1Id) {
                return String(match.winnerId) === String(match.additionalData.player1Id);
              }
              return false;
            })()) || (isBye && match.homeTeam && match.homeTeam !== 'TBD' && match.homeTeam !== 'BYE') ? 'text-[#132F45]' : 'text-gray-400'
            }`}>
            {match.homeTeam}
          </span>
          {/* Promotion/Relegation/Champion Tags for Player 1 */}
          <div className="flex items-center gap-1 mt-0.5">
            {champion && leagueStatus === 'completed' && (match.player1?.id === champion.playerId || match.additionalData?.player1Id === champion.playerId) && (
              <span className="flex items-center gap-0.5 text-[7px] font-black text-yellow-600 tracking-tighter uppercase whitespace-nowrap px-1 bg-yellow-50 rounded border border-yellow-100">
                <FaCrown className="text-[6px]"/> Champion
              </span>
            )}
            {leagueStatus === 'completed' && ['round_robin', 'roundrobin', 'homeaway', 'home_away', 'swiss'].includes(effectiveFormat.toLowerCase()) && match.player1 && promoRegInfo?.promoted?.some(p => p.player?.id === match.player1?.id || p.playerId === (match.additionalData?.player1Id || match.player1?.id)) && (
              <span className="flex items-center gap-0.5 text-[7px] font-black text-green-600 tracking-tighter uppercase whitespace-nowrap px-1 bg-green-50 rounded border border-green-100">
                <FaStar className="text-[6px]"/> Promoted
              </span>
            )}
            {leagueStatus === 'completed' && ['round_robin', 'roundrobin', 'homeaway', 'home_away', 'swiss'].includes(effectiveFormat.toLowerCase()) && match.player1 && promoRegInfo?.relegated?.some(p => p.player?.id === match.player1?.id || p.playerId === (match.additionalData?.player1Id || match.player1?.id)) && (
              <span className="flex items-center gap-0.5 text-[7px] font-black text-red-600 tracking-tighter uppercase whitespace-nowrap px-1 bg-red-50 rounded border border-red-100">
                <FaArrowDown className="text-[6px]"/> Relegated
              </span>
            )}
          </div>
          <div className="text-[9px] text-gray-300 font-bold uppercase tracking-tighter">Home</div>
        </div>

        {/* Score/Status Divider - Premium Look */}
        <div className="flex flex-col items-center min-w-[80px] md:min-w-[110px]">
          {isCompleted ? (
            <div className="flex flex-col items-center w-full">
              <div className="bg-[#132F45] text-white px-4 py-1.5 rounded-xl font-black text-sm md:text-base shadow-lg shadow-blue-900/20 ring-4 ring-blue-50 transition-transform group-hover:scale-110">
                {match.score}
              </div>
              <div className={`mt-2 text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-lg border ${match.detailedStatus === 'WALKOVER' ? 'bg-orange-50 text-orange-600 border-orange-100 shadow-sm shadow-orange-100' :
                  match.detailedStatus === 'PENDING APPROVAL' ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm shadow-amber-100' :
                    match.detailedStatus === 'FORFEIT' ? 'bg-red-50 text-red-600 border-red-100 shadow-sm shadow-red-100' :
                      match.detailedStatus === 'DRAW' ? 'bg-teal-50 text-teal-600 border-teal-100 shadow-sm shadow-teal-100' :
                        match.detailedStatus === 'WHITEWASH' ? 'bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm shadow-indigo-100' :
                          match.detailedStatus === 'TIE-BREAK' ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm shadow-amber-100' :
                            'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm shadow-emerald-100'
                }`}>
                {match.detailedStatus || 'COMPLETE'}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {match.isAwaitingAdmin && (
                <div className="text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-lg border bg-amber-50 text-amber-600 border-amber-100 shadow-sm shadow-amber-100 mb-1">
                  PENDING APPROVAL
                </div>
              )}
              {match.isWalkover && (
                <div className="text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-lg border bg-orange-50 text-orange-600 border-orange-100 shadow-sm shadow-orange-100">
                  WALKOVER
                </div>
              )}
              {match.detailedStatus && match.detailedStatus !== 'SCHEDULED' && !match.isWalkover && (
                <div className={`text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-lg border ${match.detailedStatus === 'READY TO PLAY' ? 'bg-blue-50 text-blue-600 border-blue-100 shadow-sm shadow-blue-100' :
                    match.detailedStatus === 'ONGOING' ? 'bg-yellow-50 text-yellow-600 border-yellow-100 shadow-sm shadow-yellow-100' :
                      isBye ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm shadow-emerald-100' :
                        'bg-gray-50 text-gray-400 border-gray-100'
                  }`}>
                  {match.detailedStatus}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Player 2 */}
        <div className="flex-1 flex flex-col items-start text-left min-w-0">
          <span className={`text-sm md:text-[15px] font-black truncate w-full transition-colors ${(isCompleted && (() => {
              const [s1, s2] = (match.score || "0-0").split(/[- :]/).map(s => parseInt(s) || 0);
              // If scores are different, use them as ground truth
              if (s1 !== s2) return s2 > s1;
              // If scores are same (tie-break/forfeit), use winnerId
              if (match.winnerId && match.additionalData?.player2Id) {
                return String(match.winnerId) === String(match.additionalData.player2Id);
              }
              return false;
            })()) || (isBye && match.awayTeam && match.awayTeam !== 'TBD' && match.awayTeam !== 'BYE') ? 'text-[#132F45]' : 'text-gray-400'
            }`}>
            {match.awayTeam}
          </span>
          {/* Promotion/Relegation/Champion Tags for Player 2 */}
          <div className="flex items-center gap-1 mt-0.5">
            {champion && leagueStatus === 'completed' && (match.player2?.id === champion.playerId || match.additionalData?.player2Id === champion.playerId) && (
              <span className="flex items-center gap-0.5 text-[7px] font-black text-yellow-600 tracking-tighter uppercase whitespace-nowrap px-1 bg-yellow-50 rounded border border-yellow-100">
                <FaCrown className="text-[6px]"/> Champion
              </span>
            )}
            {leagueStatus === 'completed' && ['round_robin', 'roundrobin', 'homeaway', 'home_away', 'swiss'].includes(effectiveFormat.toLowerCase()) && match.player2 && promoRegInfo?.promoted?.some(p => p.player?.id === match.player2?.id || p.playerId === (match.additionalData?.player2Id || match.player2?.id)) && (
              <span className="flex items-center gap-0.5 text-[7px] font-black text-green-600 tracking-tighter uppercase whitespace-nowrap px-1 bg-green-50 rounded border border-green-100">
                <FaStar className="text-[6px]"/> Promoted
              </span>
            )}
            {leagueStatus === 'completed' && ['round_robin', 'roundrobin', 'homeaway', 'home_away', 'swiss'].includes(effectiveFormat.toLowerCase()) && match.player2 && promoRegInfo?.relegated?.some(p => p.player?.id === match.player2?.id || p.playerId === (match.additionalData?.player2Id || match.player2?.id)) && (
              <span className="flex items-center gap-0.5 text-[7px] font-black text-red-600 tracking-tighter uppercase whitespace-nowrap px-1 bg-red-50 rounded border border-red-100">
                <FaArrowDown className="text-[6px]"/> Relegated
              </span>
            )}
          </div>
          <div className="text-[9px] text-gray-300 font-bold uppercase tracking-tighter">Away</div>
        </div>
      </div>

      {/* Metadata & Actions - Polished Layout */}
      <div className="flex flex-row items-center justify-between md:justify-end gap-6 md:pl-6 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 w-full md:w-auto">
        <div className="flex flex-col text-left md:text-right min-w-[100px]">
          <div className="text-[9px] md:text-[10px] uppercase font-black text-blue-600/60 tracking-widest mb-0.5">
            {match.additionalData?.groupName || match.additionalData?.group || match.additionalData?.division?.name || 'Main Division'}
          </div>
          <div className="flex items-center md:justify-end gap-1.5 text-[10px] font-bold text-gray-400">
            <FaMapMarkerAlt className="text-[9px] opacity-50" />
            {match.tableName || "TBA"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isTBD && (
            <button
              onClick={() => onViewDetails(match)}
              className="p-2.5 bg-gray-50 text-[#132F45] rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
              title="View Details"
            >
              <FaEye size={14} />
            </button>
          )}

          {!isTBD && canEditFixtures && match.status !== 'completed' && (
            <button
              onClick={() => onEditFixture(match)}
              className="p-2.5 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm"
              title="Reschedule Match"
            >
              <FaPencilAlt size={14} />
            </button>
          )}

          {!isTBD && canEditResults && (
            <button
              onClick={() => onEditResult(match)}
              className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
              title={match.status === 'completed' ? "Edit Match Result" : "Record Match Result"}
            >
              <FaTrophy size={14} />
            </button>
          )}

          {!isTBD && canWalkover && !isCompleted && (
            <button
              onClick={() => onWalkover(match)}
              disabled={isPendingConfirmation}
              className={`px-3 py-2 rounded-xl transition-all shadow-sm ${
                isPendingConfirmation 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'
              }`}
              title={isPendingConfirmation ? "Awaiting score confirmation" : "Record Walkover"}
            >
              <span className="text-[10px] font-black uppercase tracking-tighter">Walkover</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// --- Standings Table Component ---
const StandingsTable = ({ leagueId, divisionId, standingsDisplay, advancedSettings, leagueStatus, sport, effectiveFormat, structure }) => {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPlayerForOverride, setSelectedPlayerForOverride] = useState(null);
  const { getLeagueStandings, overridePlayerStandings, withdrawPlayer } = useContext(LeagueContext);
  const [actionLoading, setActionLoading] = useState(false);

  const leagueStructure = useMemo(() => {
    if (!structure) return {};
    try {
      return typeof structure === 'string' ? JSON.parse(structure) : structure;
    } catch (e) {
      return {};
    }
  }, [structure]);

  const promotionCount = effectiveFormat === 'knockout' ? 0 : (leagueStructure.promotionCount || leagueStructure.divisions?.promotions || leagueStructure.groups?.qualifiers || 0);
  const relegationCount = effectiveFormat === 'knockout' ? 0 : (leagueStructure.relegationCount || leagueStructure.divisions?.relegations || 0);

  const fetchStandings = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await getLeagueStandings(leagueId, { divisionId });
    if (result.success) {
      // Handle new response format: { standings: [...], standingsDisplay: {...} }
      // Or fallback to old format: [...]
      const data = result.data;
      if (data && data.standings) {
        setStandings(data.standings);
      } else {
        setStandings(data || []);
      }
    } else {
      console.error('[LeagueMatches] fetchStandings error:', result.error);
      setError(result.error || "Failed to load standings");
    }

    setLoading(false);
  }, [leagueId, divisionId, getLeagueStandings]);

  useEffect(() => {
    if (leagueId) {
      fetchStandings();
    }
  }, [leagueId, divisionId, fetchStandings]);

  const handleOverride = async (leaguePlayerId, data) => {
    setActionLoading(true);
    try {
      const result = await overridePlayerStandings(leagueId, leaguePlayerId, data);
      if (result.success) {
        await fetchStandings();
      } else {
        alert(result.error);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async (leaguePlayer) => {
    if (window.confirm(`Are you sure you want to withdraw ${leaguePlayer.player?.name} from the league?`)) {
      setActionLoading(true);
      try {
        const result = await withdrawPlayer(leagueId, leaguePlayer.id);
        if (result.success) {
          await fetchStandings();
        } else {
          alert(result.error);
        }
      } finally {
        setActionLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <FaSpinner className="animate-spin text-3xl text-[#132F45]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 opacity-70">
        <FaTrophy className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p className="text-red-600">Error loading standings: {error}</p>
        <button
          onClick={fetchStandings}
          className="mt-4 px-4 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#0f2333]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className="text-center py-12 opacity-70">
        <FaTrophy className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p>No statistics available yet.</p>
      </div>
    );
  }

  // Parse columns to display
  // Support both object format (legacy) and array format (new wizard)
  const isColumnVisible = (colKey) => {
    const sportName = sport?.toLowerCase() || '';
    const isSnooker = sportName === 'snooker';
    const isPool = sportName.includes('pool');
    const isPooker = sportName === 'pooker';

    // 1. Strict Sport-based hard exclusions (NEVER show these for these sports)
    if (isPool) {
      if (['highestBreak', 'hb', 'breaks50Plus', 'breaks100Plus'].includes(colKey)) return false;
    }
    if (isSnooker) {
      if (['ballsPotted', 'sevenBallWins', 'blackFinishes', 'whitewashWins', 'sbw', 'bf', 'www'].includes(colKey)) return false;
    }
    if (isPooker) {
      if (['highestBreak', 'hb', 'sevenBallWins', 'sbw'].includes(colKey)) return false;
    }

    // 2. If no configuration is provided, use sport-specific defaults
    if (!standingsDisplay?.columns || (Array.isArray(standingsDisplay.columns) && standingsDisplay.columns.length === 0)) {
      const common = ['matchesPlayed', 'wins', 'losses', 'draws', 'points', 'framesWon', 'framesLost', 'frameDifference', 'winPercent', 'streak'];
      if (isSnooker) return [...common, 'highestBreak', 'whitewashes'].includes(colKey);
      if (isPool) return [...common, 'ballsPotted', 'sevenBallWins'].includes(colKey);
      if (isPooker) return [...common, 'ballsPotted', 'blackFinishes', 'whitewashWins'].includes(colKey);
      return true; // Fallback for unknown sports
    }

    // 3. Use explicit configuration if available
    let isVisible = true;
    if (Array.isArray(standingsDisplay.columns)) {
      isVisible = standingsDisplay.columns.includes(colKey);
    } else if (standingsDisplay?.columns) {
      isVisible = standingsDisplay.columns[colKey] !== false;
    }

    // 4. FORCE essential sport-specific columns even if not in explicit config
    if (isPool && ['ballsPotted', 'sevenBallWins', 'sbw'].includes(colKey)) return true;
    if (isPooker && ['ballsPotted', 'blackFinishes', 'bf', 'whitewashWins', 'www'].includes(colKey)) return true;
    if (isSnooker && ['highestBreak', 'hb', 'whitewashes', 'ww'].includes(colKey)) return true;

    return isVisible;
  };

  const visibleCols = {
    matchesPlayed: isColumnVisible('matchesPlayed'),
    wins: isColumnVisible('wins'),
    losses: isColumnVisible('losses'),
    draws: isColumnVisible('draws'),
    framesWon: isColumnVisible('framesWon'),
    framesConceded: isColumnVisible('framesConceded') || isColumnVisible('framesLost'),
    frameDifference: isColumnVisible('frameDifference') || isColumnVisible('frameDiff'),
    whitewashes: isColumnVisible('whitewashes') || isColumnVisible('ww'),
    highestBreak: isColumnVisible('highestBreak') || isColumnVisible('hb'),
    winPercentage: isColumnVisible('winPercent') || isColumnVisible('winPercentage'),
    streak: isColumnVisible('streak'),
    ballsPotted: isColumnVisible('ballsPotted') || isColumnVisible('totalBallsPotted'),
    sevenBallWins: isColumnVisible('sevenBallWins') || isColumnVisible('sbw'),
    blackFinishes: isColumnVisible('blackFinishes') || isColumnVisible('bf'),
    whitewashWins: isColumnVisible('whitewashWins') || isColumnVisible('www'),
    points: true, // Points always visible per user request
  };

  // determine whether any admin action should be visible based on league settings
  const showOverrideAction = !!advancedSettings?.adminOverrideStandings;
  // Always show actions column in org dashboard because 'Withdraw Player' is a fundamental admin action
  const showActions = true;

  return (
    <div className="relative overflow-x-auto shadow-sm border border-gray-100 rounded-lg">
      {/* Action Loading Overlay */}
      {actionLoading && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 rounded-lg">
          <FaSpinner className="animate-spin text-2xl text-[#132F45] mb-2" />
          <span className="text-xs font-bold text-[#132F45] uppercase tracking-widest">Processing...</span>
        </div>
      )}
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-[#F8FAFC]">
          <tr>
            <th className="px-3 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider w-8">#</th>
            <th className="px-4 py-3 text-left text-[10px] font-black text-[#132F45] uppercase tracking-wider min-w-[150px]">Player</th>
            {visibleCols.matchesPlayed && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">MP</th>}
            {visibleCols.wins && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">W</th>}
            {visibleCols.losses && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">L</th>}
            {visibleCols.draws && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">D</th>}
            {visibleCols.framesWon && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">FW</th>}
            {visibleCols.framesConceded && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">FC</th>}
            {visibleCols.ballsPotted && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">Balls</th>}
            {visibleCols.sevenBallWins && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">7B</th>}
            {visibleCols.blackFinishes && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">BF</th>}
            {visibleCols.whitewashWins && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">WW</th>}
            {visibleCols.highestBreak && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">HB</th>}
            {visibleCols.frameDifference && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">FD</th>}
            {visibleCols.whitewashes && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">WW</th>}
            {visibleCols.winPercentage && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">Win%</th>}
            {visibleCols.streak && <th className="px-2 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider">Streak</th>}
            {visibleCols.points && <th className="px-4 py-3 text-center text-[10px] font-black text-white bg-[#132F45] uppercase tracking-wider">Points</th>}
            {showActions && <th className="px-4 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-wider rounded-tr-lg">Actions</th>}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {standings.map((player, idx) => (
            <tr key={player.id} className={idx < 3 ? "bg-blue-50/30" : ""}>
              <td className="px-4 py-4 whitespace-nowrap text-sm font-black text-gray-400">
                {idx + 1}
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-[#132F45] font-bold text-xs border border-blue-200">
                    {player.player?.avatarUrl && player.status !== 'withdrawn' ? (
                      <img src={getImageUrl(player.player.avatarUrl)} alt="" className="h-full w-full rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="text-gray-400 font-bold text-xs uppercase">
                        {player.status === 'withdrawn' ? '?' : (player.player?.name || "P").charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="ml-3">
                    <div className="text-sm font-bold text-[#132F45] flex items-center gap-2">
                      {player.status === 'withdrawn' ? (
                        <span className="text-gray-400 italic">Unknown Player</span>
                      ) : (
                        player.player?.name
                      )}
                      {player.title && player.status !== 'withdrawn' && (
                        (leagueStatus === 'completed' && ['Promoted', 'Qualified', 'Relegated'].includes(player.title)) ||
                        ['Champion', 'Runner-up'].includes(player.title)
                      ) && (
                        // Hide Champion/Runner-up for Divisional Formats (RR, Swiss, H&A) to prioritize Promo/Reg badges
                        !( ['round_robin', 'roundrobin', 'homeaway', 'home_away', 'swiss'].includes(effectiveFormat.toLowerCase()) && 
                           ['Champion', 'Runner-up'].includes(player.title) )
                      ) && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${player.title === 'Champion'
                            ? (leagueStatus === 'completed' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-blue-100 text-blue-800 border-blue-200')
                            : player.title === 'Runner-up' ? 'bg-gray-100 text-gray-800 border-gray-200'
                            : (player.title === 'Promoted' || player.title === 'Qualified') ? 'bg-green-100 text-green-800 border-green-200'
                            : player.title === 'Relegated' ? 'bg-red-100 text-red-800 border-red-200'
                            : 'bg-gray-100 text-gray-800 border-gray-200'
                          }`}>
                          {player.title === 'Champion' ? <FaTrophy className={leagueStatus === 'completed' ? 'text-yellow-600' : 'text-blue-600'} /> : 
                           (player.title === 'Promoted' || player.title === 'Qualified') ? <FaStar className="text-green-600" /> :
                           player.title === 'Relegated' ? <FaArrowDown className="text-red-600" /> : null}
                          {player.title === 'Champion' ? (leagueStatus === 'completed' ? 'Champion' : 'Current Leader') : player.title}
                        </span>
                      )}
                      
                      {player.status !== 'withdrawn' && (
                        <>
                          {/* Promotion/Qualification Tags (Only for non-tournament formats) */}
                          {leagueStatus === 'completed' && !['knockout', 'groupsKnockout'].includes(effectiveFormat) && idx < promotionCount && (!player.title || !['Promoted', 'Qualified'].includes(player.title)) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border bg-green-100 text-green-800 border-green-200 ml-1">
                              <FaStar className="text-green-600" />
                              {effectiveFormat === 'groupsKnockout' ? 'Qualified' : 'Promoted'}
                            </span>
                          )}
                          
                          {/* Relegation Tag (Shown for Round Robin formats) */}
                          {leagueStatus === 'completed' && !['knockout', 'groupsKnockout'].includes(effectiveFormat) && relegationCount > 0 && idx >= standings.length - relegationCount && (!player.title || player.title !== 'Relegated') && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border bg-red-50 text-red-700 border-red-100 ml-1">
                              <FaArrowDown className="text-red-600" />
                              Relegated
                            </span>
                          )}

                          {/* Default Champion Tag (For Round Robin / Swiss / Groups - based on rank 1) */}
                          {idx === 0 && !['knockout', 'groupsKnockout', 'round_robin', 'roundRobin', 'homeAway', 'homeaway', 'swiss'].includes(effectiveFormat) && promotionCount === 0 && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${leagueStatus === 'completed'
                                ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                                : 'bg-blue-100 text-blue-800 border-blue-200'
                              }`}>
                              <FaTrophy className={leagueStatus === 'completed' ? 'text-yellow-600' : 'text-blue-600'} />
                              {leagueStatus === 'completed' ? 'Champion' : 'Current Leader'}
                            </span>
                          )}
                        </>
                      )}
                      {player.status === 'withdrawn' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase border bg-red-50 text-red-600 border-red-100">
                          Withdrawn
                        </span>
                      )}
                    </div>
                    {player.status !== 'withdrawn' && <div className="text-xs text-gray-500">{player.player?.nickname}</div>}
                  </div>
                </div>
              </td>
              {visibleCols.matchesPlayed && <td className="px-2 py-4 whitespace-nowrap text-center text-xs font-bold text-[#132F45]">{player.matchesPlayed ?? 0}</td>}
              {visibleCols.wins && <td className="px-2 py-4 whitespace-nowrap text-center text-xs text-green-600 font-black">{player.matchesWon ?? 0}</td>}
              {visibleCols.losses && <td className="px-2 py-4 whitespace-nowrap text-center text-xs text-red-600 font-bold">{player.matchesLost ?? 0}</td>}
              {visibleCols.draws && <td className="px-2 py-4 whitespace-nowrap text-center text-xs text-gray-500 font-medium">{player.draws ?? 0}</td>}
              {visibleCols.framesWon && <td className="px-2 py-4 whitespace-nowrap text-center text-xs text-[#132F45] font-medium">{player.framesWon ?? 0}</td>}
              {visibleCols.framesConceded && <td className="px-2 py-4 whitespace-nowrap text-center text-xs font-medium text-gray-500">{player.framesLost ?? 0}</td>}
              {visibleCols.ballsPotted && <td className="px-2 py-4 whitespace-nowrap text-center text-xs font-medium text-emerald-600">{player.ballsPotted ?? 0}</td>}
              {visibleCols.sevenBallWins && <td className="px-2 py-4 whitespace-nowrap text-center text-xs font-bold text-yellow-600">{player.sevenBallWins ?? 0}</td>}
              {visibleCols.blackFinishes && <td className="px-2 py-4 whitespace-nowrap text-center text-xs font-bold text-gray-800">{player.blackFinishes ?? 0}</td>}
              {visibleCols.whitewashWins && <td className="px-2 py-4 whitespace-nowrap text-center text-xs font-bold text-indigo-600">{player.whitewashWins ?? 0}</td>}
              {visibleCols.highestBreak && <td className="px-2 py-4 whitespace-nowrap text-center text-xs italic font-medium text-blue-600">{player.highestBreak || "-"}</td>}
              {visibleCols.frameDifference && <td className="px-2 py-4 whitespace-nowrap text-center text-xs font-bold font-mono">
                <span className={(player.frameDifference || 0) > 0 ? "text-green-600" : (player.frameDifference || 0) < 0 ? "text-red-500" : "text-gray-400"}>
                  {(player.frameDifference || 0) > 0 ? `+${player.frameDifference}` : (player.frameDifference || 0)}
                </span>
              </td>}
              {visibleCols.whitewashes && <td className="px-2 py-4 whitespace-nowrap text-center text-xs text-purple-600 font-black">{player.whitewashes || 0}</td>}
              {visibleCols.winPercentage && <td className="px-2 py-4 whitespace-nowrap text-center text-xs font-bold text-gray-600">{Math.round(player.winPercentage || 0)}%</td>}
              {visibleCols.streak && <td className="px-2 py-4 whitespace-nowrap text-center text-xs">
                <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${player.streak?.startsWith('W') ? 'bg-green-100 text-green-700' :
                  player.streak?.startsWith('L') ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                  {player.streak || "-"}
                </span>
              </td>}
              {visibleCols.points && <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-black text-[#132F45] bg-blue-50/50">{player.points ?? 0}</td>}
              {showActions && (
                <td className="px-4 py-4 whitespace-nowrap text-center space-x-2">
                  {showOverrideAction && (
                    <button
                      onClick={() => setSelectedPlayerForOverride(player)}
                      disabled={actionLoading}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Override Standings"
                    >
                      {actionLoading ? <FaSpinner className="animate-spin" size={12} /> : <FaPencilAlt size={12} />}
                    </button>
                  )}
                  {player.status !== 'withdrawn' && (
                    <button
                      onClick={() => handleWithdraw(player)}
                      disabled={actionLoading}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Withdraw Player"
                    >
                      {actionLoading ? <FaSpinner className="animate-spin" size={12} /> : <FaUserPlus className="rotate-45" size={12} />}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <StandingsOverrideModal
        isOpen={!!selectedPlayerForOverride}
        onClose={() => setSelectedPlayerForOverride(null)}
        player={selectedPlayerForOverride}
        onOverride={handleOverride}
      />
    </div>
  );
};

export default function LeagueMatches() {
  const [searchParams] = useSearchParams();
  const leagueIdFromUrl = searchParams.get('leagueId');
  const {
    getLeagues,
    getLeagueById,
    getFixtures,
    getLeagueDivisions,
    getLeagueStandings,
    finalizeLeague,
    advanceToNextRound,
    advanceToKnockout,
    generateFixtures
  } = useContext(LeagueContext);
  const { getGames, getPendingWalkoversByLeague } = useContext(MatchResultContext);
  const { getClubs } = useContext(OrganizationContext);

  // ---------- State ----------
  const [clubs, setClubs] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);

  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [allGames, setAllGames] = useState([]);

  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [allLeagues, setAllLeagues] = useState([]);

  // Admin action permissions (configured per-league in advanced settings)
  const canEditFixtures = selectedLeague?.advanced?.adminEditFixtures;
  const canEditResults = selectedLeague?.advanced?.adminEditResults;
  const canOverrideStandings = selectedLeague?.advanced?.adminOverrideStandings;

  // Walkover permissions (based on match rules)
  const walkoverRule = selectedLeague?.matchRules?.walkover?.rule;
  const canRecordWalkover = walkoverRule === 'admin';

  const [divisions, setDivisions] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState(null);

  const [matches, setMatches] = useState([]);
  const [filteredMatches, setFilteredMatches] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all"); // 'all' | 'current' | number
  const [viewMode, setViewMode] = useState("list"); // 'list' | 'bracket'

  // Next-round advancement state
  const [isAdvancingRound, setIsAdvancingRound] = useState(false);

  // Helper to ensure we have an array from potentially stringified/double-stringified data
  const ensureArray = (val, defaults = []) => {
    if (Array.isArray(val)) return val;
    if (!val) return defaults;
    if (typeof val === 'string') {
      try {
        let parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'string') {
          let doubleParsed = JSON.parse(parsed);
          if (Array.isArray(doubleParsed)) return doubleParsed;
        }
      } catch (e) {
        return defaults;
      }
    }
    return defaults;
  };


  const [nextRoundError, setNextRoundError] = useState(null);
  const [nextRoundSuccess, setNextRoundSuccess] = useState(false);

  // Group → Knockout advancement state
  const [isAdvancingKnockout, setIsAdvancingKnockout] = useState(false);
  const [knockoutError, setKnockoutError] = useState(null);
  const [knockoutSuccess, setKnockoutSuccess] = useState(false);

  const [selectedMatch, setSelectedMatch] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selectedFixtureForEdit, setSelectedFixtureForEdit] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedFixtureForEditResult, setSelectedFixtureForEditResult] = useState(null);
  const [isEditResultModalOpen, setIsEditResultModalOpen] = useState(false);

  // Walkover Modal State
  const [selectedFixtureForWalkover, setSelectedFixtureForWalkover] = useState(null);
  const [isWalkoverModalOpen, setIsWalkoverModalOpen] = useState(false);

  // Pending Walkovers State
  const [pendingWalkovers, setPendingWalkovers] = useState([]);
  const [loadingPendingWalkovers, setLoadingPendingWalkovers] = useState(false);
  const [selectedPendingWalkover, setSelectedPendingWalkover] = useState(null);
  const [isPendingWalkoverModalOpen, setIsPendingWalkoverModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState("fixtures"); // "stats", "fixtures", "history", "pending-walkovers"

  // Loading states
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [loadingGames, setLoadingGames] = useState(false);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingDivisions, setLoadingDivisions] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [champion, setChampion] = useState(null);
  const [promoRegInfo, setPromoRegInfo] = useState(null);
  const [leagueStandings, setLeagueStandings] = useState([]);
  const [loadingChampion, setLoadingChampion] = useState(false);

  const [error, setError] = useState(null);

  const fetchChampion = useCallback(async () => {
    if (!selectedLeague) {
      setChampion(null);
      setPromoRegInfo(null);
      return;
    }

    setLoadingChampion(true);
    try {
      // Determine format
      const topLevelFormat = selectedLeague?.format;
      let structureFormat = null;
      try {
        const s = selectedLeague?.structure;
        structureFormat = (typeof s === 'string' ? JSON.parse(s) : s)?.format;
      } catch { }
      const effectiveFormat = structureFormat || topLevelFormat || '';

      const isKnockoutFormat = ['knockout', 'groupsKnockout'].includes(effectiveFormat);

      if (isKnockoutFormat) {
        // Find the Grand Final winner
        if (matches && matches.length > 0) {
          // Identify knockout stage matches
          const knockoutMatches = matches.filter(m => m.stage !== 'group' && m.stage !== 'round_robin');
          if (knockoutMatches.length > 0) {
            // Find highest round
            const rounds = knockoutMatches.map(m => m.additionalData?.round || m.round || 1);
            const finalRound = Math.max(...rounds);

            // Find the winner of the last round (Grand Final)
            const finalRoundMatches = knockoutMatches.filter(m => (m.additionalData?.round || m.round || 1) === finalRound);
            const finalMatch = finalRoundMatches.length === 1 ? finalRoundMatches.find(m => m.status === 'completed') : null;

            if (finalMatch && finalMatch.winnerId) {
              const winnerPlayer = finalMatch.winnerId === finalMatch.additionalData?.player1Id || finalMatch.winnerId === finalMatch.player1?.id
                ? finalMatch.player1
                : finalMatch.player2;

              setChampion({
                name: winnerPlayer?.name || (finalMatch.winnerId === finalMatch.player1?.id ? finalMatch.homeTeam : finalMatch.awayTeam),
                avatarUrl: winnerPlayer?.avatarUrl,
                playerId: finalMatch.winnerId,
                format: effectiveFormat
              });
              setLoadingChampion(false);
              return;
            }
          }
        }

        // If it's a knockout format and no grand final winner is found yet, there is no champion
        setChampion(null);
        setLoadingChampion(false);
        return;
      }

      // Default (Round Robin) or fallback for incomplete knockouts: Use standings
      const result = await getLeagueStandings(selectedLeague.id);
      if (result.success) {
        const data = result.data;
        const standings = data.standings || (Array.isArray(data) ? data : []);
        setLeagueStandings(standings);
        if (standings.length > 0) {
          // Skip withdrawn players when determining the champion from standings
          const topPlayer = standings.find(p => p.status !== 'withdrawn') || standings[0];
          
          if (!isKnockoutFormat) {
            // For Round Robin, store promotion/relegation info
            const structure = selectedLeague.structure || {};
            const pCount = structure.promotionCount || structure.divisions?.promotions || structure.groups?.qualifiers || 0;
            const rCount = structure.relegationCount || structure.divisions?.relegations || 0;
            
            const promoted = standings.slice(0, pCount).filter(p => p.status !== 'withdrawn');
            const relegated = rCount > 0 ? standings.slice(-rCount).filter(p => p.status !== 'withdrawn') : [];
            
            setPromoRegInfo({ promoted, relegated });
            // For Round Robin, we don't set 'champion' state if user wants to prioritize Promo/Reg
            // But we keep it if they want to show "Winner" as well. 
            // Based on user request "show promoton and regulation for round robin not champion", we'll use promoRegInfo.
          }

          setChampion({
            name: topPlayer.player?.name,
            avatarUrl: topPlayer.player?.avatarUrl,
            playerId: topPlayer.player?.id || topPlayer.playerId || topPlayer.id,
            format: effectiveFormat
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch champion:", err);
    } finally {
      setLoadingChampion(false);
    }
  }, [selectedLeague, getLeagueStandings, matches]);

  // When league changes, load both divisions AND fixtures for that league
  const loadLeagueData = useCallback(async () => {
    if (selectedLeague) {
      try {
        setError(null);

        // Load divisions for this league
        setLoadingDivisions(true);
        const divisionsResult = await getLeagueDivisions(selectedLeague.id);

        let processedDivisions = [];
        if (divisionsResult.success) {
          const divisionsData = divisionsResult.data;
          console.log(`[LeagueMatches] ✅ Loaded ${divisionsData.length} divisions for league "${selectedLeague.name}" (ID: ${selectedLeague.id})`);

          processedDivisions = divisionsData;
          if (divisionsData && divisionsData.length > 0) {
            console.log('[LeagueMatches] Division Details:', divisionsData.map(d => ({ id: d.id, name: d.name, status: d.status })));
          } else {
            // If no divisions exist, create a default "Main Division"
            processedDivisions = [{
              id: 'default',
              name: 'Main Division',
              status: 'active',
              isDefault: true
            }];
            console.log('[LeagueMatches] 📝 No divisions found, using default "Main Division"');
          }
        }

        setDivisions(processedDivisions);

        // Load all fixtures for this league (without division filter)
        setLoadingMatches(true);
        const fixturesResult = await getFixtures(selectedLeague.id);

        if (fixturesResult.success) {
          const fixturesData = fixturesResult.data;
          console.log(`[LeagueMatches] ✅ Loaded ${fixturesData.length} fixtures for league "${selectedLeague.name}"`);

          const transformedMatches = transformFixturesToMatches(
            fixturesData,
            null, // No specific division when loading all
            selectedLeague,
            processedDivisions // Pass divisions for name lookup
          );

          console.log(`[LeagueMatches] ✅ Transformed to ${transformedMatches.length} matches`);
          setMatches(transformedMatches);
        } else {
          setError(`Failed to load fixtures: ${fixturesResult.error}`);
        }

        setSelectedDivision(null);

      } catch (err) {
        console.error("Error loading league data:", err);
        console.error("League Selected:", selectedLeague);
        setError(`Failed to load league data: ${err.message || 'Please try again.'}`);
        setDivisions([]);
        setMatches([]);
      } finally {
        setLoadingDivisions(false);
        setLoadingMatches(false);
      }
    } else {
      setDivisions([]);
      setSelectedDivision(null);
      setMatches([]);
    }
  }, [selectedLeague, getLeagueDivisions, getFixtures]);

  // Fetch pending walkovers for the selected league
  const loadPendingWalkovers = useCallback(async () => {
    if (selectedLeague) {
      setLoadingPendingWalkovers(true);
      try {
        const result = await getPendingWalkoversByLeague(selectedLeague.id);
        if (result.success) {
          setPendingWalkovers(result.data || []);
        }
      } catch (err) {
        console.error("[LeagueMatches] Error loading pending walkovers:", err);
      } finally {
        setLoadingPendingWalkovers(false);
      }
    } else {
      setPendingWalkovers([]);
    }
  }, [selectedLeague, getPendingWalkoversByLeague]);

  useEffect(() => {
    // Fetch champion and promo/reg info for both active and completed leagues
    if (selectedLeague?.id) {
      fetchChampion();
    } else {
      setChampion(null);
      setPromoRegInfo(null);
    }
  }, [selectedLeague?.id, selectedLeague?.status, fetchChampion]);

  // ---------- Effects ----------
  // Effect 1: Load initial data (clubs and games) - only once on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setError(null);

        // Load clubs - Filter for active clubs only
        setLoadingClubs(true);
        const clubsResult = await getClubs();
        if (clubsResult.success) {
          const activeClubs = (clubsResult.data || []).filter(c => c.status === 'active');
          console.log(`[LeagueMatches] Loaded ${clubsResult.data.length} clubs, showing ${activeClubs.length} active clubs`);
          setClubs(activeClubs);
        }

        // Load all games
        setLoadingGames(true);
        const gamesResult = await getGames();
        if (gamesResult.success) {
          console.log(`[LeagueMatches] Loaded ${gamesResult.data.length} games`);
          setAllGames(Array.isArray(gamesResult.data) ? gamesResult.data : []);
        }

        // Load all leagues
        setLoadingLeagues(true);
        const leaguesResult = await getLeagues();
        if (leaguesResult.success) {
          const normalizeField = (field) => {
            if (!field) return {};
            if (typeof field === 'string') {
              try {
                let parsed = JSON.parse(field);
                // Handle double stringification
                if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                return parsed;
              } catch (e) {
                return {};
              }
            }
            return field;
          };

          const normalizedLeagues = (leaguesResult.data || []).map(l => ({
            ...l,
            basicInfo: normalizeField(l.basicInfo),
            structure: normalizeField(l.structure),
            matchRules: normalizeField(l.matchRules),
            pointsSystem: normalizeField(l.pointsSystem),
            standingsDisplay: normalizeField(l.standingsDisplay),
            scheduling: normalizeField(l.scheduling),
            reporting: normalizeField(l.reporting),
            advanced: normalizeField(l.advanced),
          }));
          console.log(`[LeagueMatches] Loaded and normalized ${normalizedLeagues.length} leagues`);
          setAllLeagues(normalizedLeagues);
        }

      } catch (err) {
        console.error("Error loading initial data:", err);
        setError("Failed to load clubs and games. Please refresh the page.");
      } finally {
        setLoadingClubs(false);
        setLoadingGames(false);
        setLoadingLeagues(false);
      }
    };

    loadInitialData();
  }, [getClubs, getGames, getLeagues]); // Mount only + Context methods

  // Handle deep-linking from URL leagueId
  useEffect(() => {
    if (leagueIdFromUrl && allLeagues.length > 0 && !selectedLeague) {
      const targetLeague = allLeagues.find(l => String(l.id) === String(leagueIdFromUrl));
      if (targetLeague) {
        console.log(`[LeagueMatches] 🎯 Deep-linking to league: ${targetLeague.name} (ID: ${targetLeague.id})`);
        setSelectedLeague(targetLeague);
        
        // Auto-select club and game to populate dropdowns correctly if they exist
        if (clubs.length > 0) {
          const club = clubs.find(c => c.id === targetLeague.clubId);
          if (club) setSelectedClub(club);
        }
        
        if (allGames.length > 0) {
          const game = allGames.find(g => g.name === targetLeague.basicInfo?.gameName);
          if (game) setSelectedGame(game);
        }
      }
    }
  }, [leagueIdFromUrl, allLeagues, clubs, allGames, selectedLeague]);

  // Effect 2: Listen for league data changes (e.g., when players are added)
  // This depends on selectedLeague to correctly refresh the current selection
  useEffect(() => {

    // Listen for league data changes (e.g., when players are added)
    const handleLeagueDataChanged = (event) => {
      const { leagueId, action } = event.detail;
      console.log(`[LeagueMatches] League data changed: ${action} for league ${leagueId}`);
      if (selectedLeague && selectedLeague.id === leagueId) {
        if (action === 'wizard-updated') {
          // For wizard updates, fetch the latest league data directly
          getLeagueById(leagueId).then(result => {
            if (result.success) {
              const l = result.data;
              const normalizeField = (field) => {
                if (!field) return {};
                if (typeof field === 'string') {
                  try {
                    let parsed = JSON.parse(field);
                    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                    return parsed;
                  } catch (e) { return {}; }
                }
                return field;
              };

              const normalized = {
                ...l,
                basicInfo: normalizeField(l.basicInfo),
                structure: normalizeField(l.structure),
                matchRules: normalizeField(l.matchRules),
                pointsSystem: normalizeField(l.pointsSystem),
                standingsDisplay: normalizeField(l.standingsDisplay),
                scheduling: normalizeField(l.scheduling),
                reporting: normalizeField(l.reporting),
                advanced: normalizeField(l.advanced),
              };
              setSelectedLeague(normalized);
              console.log(`[LeagueMatches] Updated and normalized selected league data for ${leagueId}`);
            }
          }).catch(err => console.error('Failed to refresh league data:', err));
        } else {
          // For other changes, refresh data for the currently selected league
          loadLeagueData();
        }
      } else {
        // Refresh the leagues list in case league metadata changed
        getLeagues().then(result => {
          if (result.success) {
            const normalizeField = (field) => {
              if (!field) return {};
              if (typeof field === 'string') {
                try {
                  let parsed = JSON.parse(field);
                  if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                  return parsed;
                } catch (e) { return {}; }
              }
              return field;
            };

            const normalized = (result.data || []).map(l => ({
              ...l,
              basicInfo: normalizeField(l.basicInfo),
              structure: normalizeField(l.structure),
              matchRules: normalizeField(l.matchRules),
              pointsSystem: normalizeField(l.pointsSystem),
              standingsDisplay: normalizeField(l.standingsDisplay),
              scheduling: normalizeField(l.scheduling),
              reporting: normalizeField(l.reporting),
              advanced: normalizeField(l.advanced),
            }));
            setAllLeagues(normalized);
            // Update selected league if it exists in the new list
            if (selectedLeague) {
              const updatedLeague = normalized.find(l => l.id === selectedLeague.id);
              if (updatedLeague) {
                setSelectedLeague(updatedLeague);
              }
            }
          }
        }).catch(err => console.error('Failed to refresh leagues after data change:', err));
      }
    };

    window.addEventListener('leagueDataChanged', handleLeagueDataChanged);
    return () => window.removeEventListener('leagueDataChanged', handleLeagueDataChanged);
  }, [selectedLeague, getLeagues, getLeagueById, loadLeagueData]);

  // When club changes, update available games and leagues
  useEffect(() => {
    if (selectedClub) {
      // Filter leagues by the selected club (league.clubId should match the selected club id)
      // Fall back to using clubName if clubId is missing.
      const clubLeagues = allLeagues.filter(l => {
        if (!l) return false;
        if (l.clubId && selectedClub.id) {
          return l.clubId === selectedClub.id;
        }
        if (l.clubName && selectedClub.name) {
          return l.clubName === selectedClub.name;
        }
        return false;
      });

      // If no leagues are tied directly to this club, fall back to showing all leagues
      const leaguesToUse = clubLeagues.length > 0 ? clubLeagues : allLeagues;

      // Get unique games from the filtered leagues
      const gameSet = new Set();
      leaguesToUse.forEach(league => {
        const leagueGameName = getLeagueGameName(league);
        if (leagueGameName) {
          gameSet.add(leagueGameName.toLowerCase());
        }
      });

      const availableGames = (Array.isArray(allGames) ? allGames : []).filter(game => {
        const gameName = (game.name || game.id || '').toString().trim().toLowerCase();
        return gameName && gameSet.has(gameName);
      });

      setGames(availableGames.length > 0 ? availableGames : allGames);
      setLeagues(leaguesToUse);
      setSelectedGame(null);
      setSelectedLeague(null);
      setSelectedDivision(null);
      setMatches([]);
    } else {
      setGames([]);
      setLeagues([]);
      setSelectedGame(null);
    }
  }, [selectedClub, allGames, allLeagues]);

  // When game changes, update leagues
  useEffect(() => {
    if (selectedClub && selectedGame) {
      // Filter leagues by both the selected club and selected game
      const clubGameLeagues = allLeagues.filter(league => {
        const clubMatch =
          (league.clubId && selectedClub.id && league.clubId === selectedClub.id) ||
          (league.clubName && selectedClub.name && league.clubName === selectedClub.name);
        const leagueGameName = getLeagueGameName(league).toLowerCase();
        const selectedGameName = selectedGame?.name?.toString().trim().toLowerCase() || '';
        const gameMatch = selectedGameName && leagueGameName === selectedGameName;
        return clubMatch && gameMatch;
      });

      // If no leagues match both club AND game, but some match the game, show those as a fallback
      // This helps if the league is not explicitly linked to the selected club but belongs to the game
      if (clubGameLeagues.length === 0 && selectedGame) {
        const gameOnlyLeagues = allLeagues.filter(league => {
          const leagueGameName = getLeagueGameName(league).toLowerCase();
          const selectedGameName = selectedGame?.name?.toString().trim().toLowerCase() || '';
          return selectedGameName && leagueGameName === selectedGameName;
        });
        setLeagues(gameOnlyLeagues);
      } else {
        setLeagues(clubGameLeagues);
      }
      setSelectedLeague(null);
      setSelectedDivision(null);
      setMatches([]);
    } else {
      setLeagues([]);
      setSelectedLeague(null);
    }
  }, [selectedClub, selectedGame, allLeagues]);



  useEffect(() => {
    loadLeagueData();
    loadPendingWalkovers();
  }, [loadLeagueData, loadPendingWalkovers]);

  // Reset viewMode when league format changes
  useEffect(() => {
    if (selectedLeague) {
      // Check if league supports bracket view
      let structureFormat = null;
      try {
        const s = selectedLeague.structure;
        structureFormat = (typeof s === 'string' ? JSON.parse(s) : s)?.format;
      } catch (e) { }

      const format = structureFormat || selectedLeague.format;
      const supportsBracket = ['knockout', 'groupsKnockout'].includes(format);

      // If current mode is bracket but new league doesn't support it, switch to list
      if (!supportsBracket && viewMode === 'bracket') {
        console.log(`[LeagueMatches] Resetting viewMode to list for format: ${format}`);
        setViewMode('list');
      }
    }
  }, [selectedLeague?.id, viewMode]);

  // When division is selected, filter fixtures for that division
  useEffect(() => {
    if (selectedDivision && matches.length > 0) {
      const selectedDivisionData = divisions.find(d => d.id === selectedDivision);

      // If it's the default division, show all matches
      if (selectedDivisionData?.isDefault) {
        console.log(`[LeagueMatches] 📊 Showing all ${matches.length} matches for default division`);
        setFilteredMatches(matches);
      } else {
        const divisionMatches = matches.filter(m => m.divisionId === selectedDivision);
        console.log(`[LeagueMatches] 🔍 Filtering to ${divisionMatches.length} matches for division "${selectedDivisionData?.name}" (ID: ${selectedDivision})`);
        setFilteredMatches(divisionMatches);
      }
    } else if (!selectedDivision && matches.length > 0) {
      // Show all matches if no division is selected
      console.log(`[LeagueMatches] 📊 Showing all ${matches.length} matches across all divisions`);
      setFilteredMatches(matches);
    } else {
      setFilteredMatches([]);
    }
  }, [selectedDivision, matches, divisions]);

  // Handlers
  const handleViewDetails = (match) => {
    setSelectedMatch(match);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedMatch(null);
  };

  const handleEditFixture = (fixture) => {
    console.log("[LeagueMatches] Opening edit modal for fixture:", fixture);
    setSelectedFixtureForEdit(fixture);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedFixtureForEdit(null);
  };

  const handleEditResult = (fixture) => {
    console.log("[LeagueMatches] Opening edit result modal for fixture:", fixture);
    setSelectedFixtureForEditResult(fixture);
    setIsEditResultModalOpen(true);
  };

  const closeEditResultModal = () => {
    setIsEditResultModalOpen(false);
    setSelectedFixtureForEditResult(null);
  };

  const handleWalkover = (fixture) => {
    console.log("[LeagueMatches] Opening walkover modal for fixture:", fixture);
    setSelectedFixtureForWalkover(fixture);
    setIsWalkoverModalOpen(true);
  };

  const closeWalkoverModal = () => {
    setIsWalkoverModalOpen(false);
    setSelectedFixtureForWalkover(null);
  };

  const handlePendingWalkover = (walkover) => {
    console.log("[LeagueMatches] Opening pending walkover modal:", walkover);
    setSelectedPendingWalkover(walkover);
    setIsPendingWalkoverModalOpen(true);
  };

  const closePendingWalkoverModal = () => {
    setIsPendingWalkoverModalOpen(false);
    setSelectedPendingWalkover(null);
  };
  const handleRegenerateFixtures = async () => {
    if (!selectedLeague) return;
    if (window.confirm("Add missing matches for late-joining players? Existing confirmed/booked matches will not be affected.")) {
      setLoadingMatches(true);
      try {
        const result = await generateFixtures(selectedLeague.id, { mode: 'incremental' });
        if (result.success) {
          alert("Fixtures updated successfully!");
          loadLeagueData();
        } else {
          alert(result.error || "Failed to update fixtures");
        }
      } catch (err) {
        alert("An error occurred while updating fixtures");
      }
      setLoadingMatches(false);
    }
  };

  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState(null);

  const handleFinalizeLeagueClick = () => {
    setIsFinalizeModalOpen(true);
    setFinalizeResult(null);
  };

  const confirmFinalizeLeague = async () => {
    if (!selectedLeague) return;

    setIsFinalizing(true);
    setError(null);
    try {
      const result = await finalizeLeague(selectedLeague.id);
      setFinalizeResult(result.data); // holds { league, moves }
      // Reload league data to reflect completed status and updated standings
      await loadLeagueData();
    } catch (err) {
      setError(err?.error || err?.message || 'Failed to finalize league.');
    } finally {
      setIsFinalizing(false);
    }
  };

  const closeFinalizeModal = () => {
    setIsFinalizeModalOpen(false);
    setFinalizeResult(null);
  };

  // Handle advancing to next round
  const handleNextRound = async () => {
    if (!selectedLeague) return;
    setIsAdvancingRound(true);
    setNextRoundError(null);
    setNextRoundSuccess(false);
    try {
      const result = await advanceToNextRound(selectedLeague.id);
      if (result.success) {
        setNextRoundSuccess(true);
        // Reload to show new fixtures
        await loadLeagueData();
        // Also refresh league data to get updated currentRound
        const refreshed = await getLeagueById(selectedLeague.id);
        if (refreshed.success) setSelectedLeague(refreshed.data);
        setTimeout(() => setNextRoundSuccess(false), 4000);
      } else {
        setNextRoundError(result.error || 'Failed to advance to next round.');
      }
    } catch (err) {
      setNextRoundError(err.message || 'Failed to advance to next round.');
      setTimeout(() => setNextRoundError(null), 6000);
    } finally {
      setIsAdvancingRound(false);
    }
  };

  // Handle advancing Group Stage → Knockout Bracket
  const handleAdvanceToKnockout = async () => {
    if (!selectedLeague) return;
    setIsAdvancingKnockout(true);
    setKnockoutError(null);
    setKnockoutSuccess(false);
    try {
      const result = await advanceToKnockout(selectedLeague.id);
      if (result.success) {
        setKnockoutSuccess(true);
        await loadLeagueData();
        setTimeout(() => setKnockoutSuccess(false), 5000);
      } else {
        setKnockoutError(result.error || 'Failed to advance to knockout bracket.');
      }
    } catch (err) {
      setKnockoutError(err.message || 'Failed to advance to knockout bracket.');
      setTimeout(() => setKnockoutError(null), 7000);
    } finally {
      setIsAdvancingKnockout(false);
    }
  };

  // Determine if this is a format that supports or is a knockout
  const leagueStructureFormat = (() => {
    try {
      const s = selectedLeague?.structure;
      return (typeof s === 'string' ? JSON.parse(s) : s)?.format;
    } catch { return null; }
  })();
  const effectiveFormat = leagueStructureFormat || selectedLeague?.format || '';
  const isKnockout = effectiveFormat === 'knockout';
  const isSwiss = effectiveFormat === 'swiss';
  const isGroupsKnockout = effectiveFormat === 'groupsKnockout';

  // Any format that can eventually have a bracket (including those that start with one)
  const canHaveKnockout = ['groupsKnockout', 'knockout'].includes(effectiveFormat);

  // Derive the unique round numbers available in the current fixture list
  const availableRounds = [...new Set(
    matches
      .map(m => m.additionalData?.round || m.round)
      .filter(r => r !== null && r !== undefined)
  )].sort((a, b) => a - b);
  const maxRound = availableRounds.length > 0 ? Math.max(...availableRounds) : 0;

  const knockoutRound1Matches = matches.filter(m => {
    const stage = String(m.stage || m.additionalData?.stage || '').toLowerCase();
    const isKnockoutStage = ['knockout', 'groupsknockout', 'playoff', 'final', 'championship'].includes(stage) || (canHaveKnockout && !stage && !m.divisionId);
    return isKnockoutStage && (m.round === 1 || m.additionalData?.round === 1);
  });
  const knockoutAlreadySeeded = knockoutRound1Matches.some(m => m.player1Id || m.player2Id || m.homeTeam !== 'TBD' || m.awayTeam !== 'TBD');

  // Expected total rounds for tournament formats
  const totalConfiguredRounds = (() => {
    try {
      const s = selectedLeague?.structure;
      const structureObj = typeof s === 'string' ? JSON.parse(s) : s;
      const explicitRounds = structureObj?.rounds || structureObj?.swiss?.rounds || structureObj?.swissConfig?.rounds || structureObj?.totalRounds;
      if (explicitRounds) return parseInt(explicitRounds, 10);

      // Fallback for Knockout: calculate expected rounds based on matches in Round 1
      if ((isKnockout || isGroupsKnockout) && knockoutRound1Matches.length > 0) {
        return Math.ceil(Math.log2(knockoutRound1Matches.length * 2));
      }
      return 0;
    } catch { return 0; }
  })();

  // Qualifying matches are those in any non-knockout stage
  const qualifyingMatches = matches.filter(m => 
    ['group', 'round_robin', 'roundRobin', 'homeAway', 'swiss'].includes(m.stage) || 
    ['group', 'round_robin', 'roundRobin', 'homeAway', 'swiss'].includes(m.additionalData?.stage) ||
    (!m.stage && ['roundRobin', 'homeAway', 'swiss'].includes(effectiveFormat))
  );
  const allQualifyingMatchesDone = qualifyingMatches.length > 0 && qualifyingMatches.every(m => ['completed', 'bye', 'walkover'].includes(m.status));
  
  // Check if all matches in the league are completed
  const allMatchesCompleted = (() => {
    if (matches.length === 0) return false;
    // Include completed, bye, and walkover as valid completed states
    const allCurrentDone = matches.every(m => ['completed', 'bye', 'walkover'].includes(m.status));
    if (!allCurrentDone) return false;

    // For knockout/swiss, ensure we've reached the final round
    const effectiveTotalRounds = Math.max(maxRound, totalConfiguredRounds);
    if (isKnockout || isSwiss) {
      if (effectiveTotalRounds > 0 && maxRound < effectiveTotalRounds) return false;
    }

    return true;
  })();

  // Apply status filter - this should be applied to division-filtered matches
  const applyStatusFilter = (matchesToFilter) => {
    if (statusFilter === "all") {
      return matchesToFilter;
    }
    if (statusFilter === 'draw') {
      return matchesToFilter.filter(m => m.detailedStatus === 'DRAW');
    }
    if (statusFilter === 'whitewash') {
      return matchesToFilter.filter(m => m.detailedStatus === 'WHITEWASH');
    }
    if (statusFilter === 'walkover') {
      return matchesToFilter.filter(m => m.detailedStatus === 'WALKOVER');
    }
    return matchesToFilter.filter((m) => m.status === statusFilter);
  };

  // Apply round filter
  const applyRoundFilter = (matchesToFilter) => {
    if (roundFilter === 'all') return matchesToFilter;
    const currentRound = selectedLeague?.currentRound ?? 1;
    const targetRound = roundFilter === 'current' ? currentRound : Number(roundFilter);
    return matchesToFilter.filter(m => (m.additionalData?.round || m.round) === targetRound);
  };

  // Compute history matches (completed) from division-filtered matches
  const historyMatches = applyStatusFilter(matches).filter(m => m.status === "completed" || m.status === "walkover");

  // Get displayable matches based on division, round and status filters
  const displayMatches = applyRoundFilter(applyStatusFilter(filteredMatches));


  return (
    <div className="min-h-screen bg-[#FFFBF4] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-[#132F45]">
            League Matches
          </h1>
          <p className="text-[#132F45] opacity-70 mt-1 text-sm">
            Select a club, game, and league to view details
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Selection Section */}
        <div className="bg-white rounded-xl border border-[#D1D5DB] p-4 md:p-6 shadow-sm mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {/* Club Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-[#132F45] mb-2">
                Select Club
              </label>
              <div className="relative">
                <select
                  value={selectedClub?.id || ""}
                  onChange={(e) => {
                    const club = clubs.find(c => c.id === e.target.value);
                    setSelectedClub(club || null);
                  }}
                  disabled={loadingClubs}
                  className="w-full px-4 py-3 bg-white border border-[#D1D5DB] rounded-lg text-sm text-[#132F45] focus:outline-none focus:ring-2 focus:ring-[#132F45] disabled:opacity-50"
                >
                  <option value="">-- Choose Club --</option>
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.name}
                    </option>
                  ))}
                </select>
                {loadingClubs && <FaSpinner className="absolute right-3 top-3.5 animate-spin text-[#132F45]" />}
              </div>
            </div>

            {/* Game Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-[#132F45] mb-2">
                Select Game
              </label>
              <div className="relative">
                <select
                  value={selectedGame?.id || selectedGame?.name || ""}
                  onChange={(e) => {
                    const selectedValue = e.target.value;
                    const game = games.find(g => String(g.id) === selectedValue || g.name === selectedValue);
                    setSelectedGame(game || null);
                  }}
                  disabled={!selectedClub || loadingGames || games.length === 0}
                  className="w-full px-4 py-3 bg-white border border-[#D1D5DB] rounded-lg text-sm text-[#132F45] focus:outline-none focus:ring-2 focus:ring-[#132F45] disabled:bg-gray-100 disabled:opacity-50"
                >
                  <option value="">-- Choose Game --</option>
                  {games.map((game) => (
                    <option key={game.id || game.name} value={game.id || game.name}>
                      {game.name}
                    </option>
                  ))}
                </select>
                {loadingGames && <FaSpinner className="absolute right-3 top-3.5 animate-spin text-[#132F45]" />}
              </div>
            </div>

            {/* League Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-[#132F45] mb-2">
                Select League
              </label>
              <div className="relative">
                <select
                  value={selectedLeague?.id || ""}
                  onChange={(e) => {
                    const league = leagues.find(l => l.id === e.target.value);
                    setSelectedLeague(league || null);
                  }}
                  disabled={!selectedGame || loadingLeagues || leagues.length === 0}
                  className="w-full px-4 py-3 bg-white border border-[#D1D5DB] rounded-lg text-sm text-[#132F45] focus:outline-none focus:ring-2 focus:ring-[#132F45] disabled:bg-gray-100 disabled:opacity-50"
                >
                  <option value="">-- Choose League --</option>
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.name}
                    </option>
                  ))}
                </select>
                {loadingLeagues && <FaSpinner className="absolute right-3 top-3.5 animate-spin text-[#132F45]" />}
              </div>
            </div>

            {/* Division Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-[#132F45] mb-2">
                Select Division <span className="text-xs text-gray-500 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <select
                  value={selectedDivision || ""}
                  onChange={(e) => {
                    setSelectedDivision(e.target.value || null);
                  }}
                  disabled={!selectedLeague || loadingDivisions || divisions.length === 0}
                  className="w-full px-4 py-3 bg-white border border-[#D1D5DB] rounded-lg text-sm text-[#132F45] focus:outline-none focus:ring-2 focus:ring-[#132F45] disabled:bg-gray-100 disabled:opacity-50"
                >
                  <option value="">-- All Divisions --</option>
                  {divisions.map((div) => (
                    <option key={div.id} value={div.id}>
                      {div.name} {div.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
                {loadingDivisions && <FaSpinner className="absolute right-3 top-3.5 animate-spin text-[#132F45]" />}
              </div>
            </div>
          </div>
        </div>

        {/* League Info Summary */}
        {selectedLeague && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${selectedLeague.visibility === 'public'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : selectedLeague.visibility === 'invite'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}>
              <span className="flex items-center gap-1">
                {selectedLeague.visibility === 'public' ? <FaGlobeAmericas /> : selectedLeague.visibility === 'invite' ? <FaUserPlus /> : <FaLock />}
                {selectedLeague.visibility?.toUpperCase() || 'PUBLIC'}
              </span>
            </span>

            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${selectedLeague.joinAllowed
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
              }`}>
              {selectedLeague.joinAllowed ? 'Registration Open' : 'Registration Closed'}
            </span>

            {selectedLeague.lateJoinAllowed && (
              <span className="px-3 py-1 rounded-full text-xs font-bold border bg-orange-50 text-orange-700 border-orange-200">
                Late Join Enabled
              </span>
            )}

            {!['completed', 'cancelled'].includes(selectedLeague.status) && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-3 py-1 rounded-full text-xs font-bold border bg-[#132F45] text-white hover:bg-[#1e4669] transition-colors flex items-center gap-1"
              >
                <FaUserPlus size={10} /> {selectedLeague.visibility === 'public' ? 'Share League' : 'Invite Players'}
              </button>
            )}

            {selectedLeague.status === 'active' && selectedLeague.lateJoinAllowed && !['round_robin', 'roundRobin', 'homeAway'].includes(effectiveFormat) && (
              <button
                onClick={handleRegenerateFixtures}
                className="px-3 py-1 rounded-full text-xs font-bold border-2 border-dashed border-[#BA995D] text-[#BA995D] hover:bg-[#BA995D] hover:text-white transition-all flex items-center gap-1 shadow-sm"
              >
                <FaProjectDiagram size={10} /> Regenerate Fixtures
              </button>
            )}

            {/* Finalize League Button - Only show when all matches are completed */}
            {selectedLeague.status === 'active' && allMatchesCompleted && (
              <button
                onClick={handleFinalizeLeagueClick}
                className="px-3 py-1 rounded-full text-xs font-bold border bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1 shadow-sm"
              >
                <FaTrophy size={10} /> Finalize League
              </button>
            )}

            {/* Disabled Finalize Button - Show when league is active but matches not all completed */}
            {selectedLeague.status === 'active' && !allMatchesCompleted && (
              <button
                disabled
                title="All matches must be completed before finalizing the league"
                className="px-3 py-1 rounded-full text-xs font-bold border bg-gray-200 text-gray-400 cursor-not-allowed flex items-center gap-1 shadow-sm"
              >
                <FaTrophy size={10} /> Finalize League
              </button>
            )}

            {/* Generate Knockout Bracket Button — for all multi-stage formats */}
            {selectedLeague.status === 'active' && canHaveKnockout && effectiveFormat !== 'knockout' && !knockoutAlreadySeeded && (
              <button
                onClick={handleAdvanceToKnockout}
                disabled={isAdvancingKnockout || !allQualifyingMatchesDone}
                title={!allQualifyingMatchesDone ? 'All qualifying matches must be completed first' : 'Seed qualifiers into Knockout Bracket'}
                className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 shadow-sm transition-all ${allQualifyingMatchesDone
                    ? 'bg-purple-600 text-white hover:bg-purple-700 cursor-pointer'
                    : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  } disabled:opacity-60`}
              >
                {isAdvancingKnockout ? (
                  <><FaSpinner size={10} className="animate-spin" /> Generating...</>
                ) : (
                  <><FaProjectDiagram size={10} /> Generate Knockout Bracket</>
                )}
              </button>
            )}

            {/* Knockout already seeded badge — converted to a Sync/Refresh button for repairs */}
            {selectedLeague.status === 'active' && canHaveKnockout && (knockoutAlreadySeeded || effectiveFormat === 'knockout') && (
              <button
                onClick={handleAdvanceToKnockout}
                disabled={isAdvancingKnockout}
                title="Sync/Repair Bracket: Ensure all winners and byes are correctly advanced to their next slots."
                className="px-3 py-1 rounded-full text-xs font-bold border bg-purple-50 text-purple-700 border-purple-200 flex items-center gap-1 hover:bg-purple-100 transition-colors shadow-sm disabled:opacity-50"
              >
                {isAdvancingKnockout ? (
                  <><FaSpinner size={10} className="animate-spin" /> Syncing...</>
                ) : (
                  <><FaProjectDiagram size={10} /> Sync Bracket</>
                )}
              </button>
            )}

            {/* Knockout generation feedback */}
            {knockoutError && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                ⚠ {knockoutError}
              </span>
            )}
            {knockoutSuccess && (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                ✓ Knockout Bracket Generated!
              </span>
            )}

            {selectedLeague.visibility !== 'private' && (
              <div className="ml-auto text-xs text-gray-500 font-medium">
                Join Code: <span className="font-mono bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded uppercase">{selectedLeague.joinCode || 'N/A'}</span>
              </div>
            )}
          </div>
        )}


        {/* Finalize League Modal */}
        <AnimatePresence>
          {isFinalizeModalOpen && selectedLeague && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-gray-100 max-h-[90vh] flex flex-col"
              >
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                  <h3 className="text-xl font-bold text-red-600 flex items-center gap-2">
                    <FaTrophy className="text-red-500" />
                    {finalizeResult ? "League Finalized" : "Finalize League"}
                  </h3>
                  <button onClick={closeFinalizeModal} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2">
                  {!finalizeResult ? (
                    <div className="space-y-4">
                      <div className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-lg">
                        <p className="font-bold flex items-center gap-2 mb-2">
                          <span className="text-xl">⚠️</span> Warning: This action is irreversible.
                        </p>
                        <p className="text-sm">
                          Finalizing the league will permanently set its status to "Completed".
                          No further matches can be played or scores edited.
                        </p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg">
                        <p className="font-bold mb-2">What happens next?</p>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          <li>Final standings will be locked in.</li>
                          <li>If divisions are configured, automatic promotions and relegations will be applied based on the final standings.</li>
                        </ul>
                      </div>
                      <p className="text-[#132F45] font-semibold text-center mt-6">
                        Are you sure you want to finalize <strong>{selectedLeague?.name}</strong>?
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg text-center">
                        <p className="font-bold text-lg mb-1">🎉 League Finalized Successfully!</p>
                        <p className="text-sm">The league status is now "Completed".</p>
                      </div>

                      {finalizeResult.moves && finalizeResult.moves.length > 0 ? (
                        <div>
                          <h4 className="font-bold text-[#132F45] mb-3 border-b border-gray-100 pb-2">
                            Promotion & Relegation Results ({finalizeResult.moves.length} moves)
                          </h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {finalizeResult.moves.map((move, idx) => (
                              <div key={idx} className={`p-3 rounded-lg border text-sm flex items-center justify-between ${move.type === 'promotion' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                                }`}>
                                <div className="font-bold text-[#132F45]">{move.playerName}</div>
                                <div className="flex items-center gap-2 text-gray-600 text-xs">
                                  <span>{move.fromDivisionName}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider" style={{ background: move.type === 'promotion' ? '#16a34a' : '#dc2626' }}>
                                    {move.type}
                                  </span>
                                  <span>{move.toDivisionName}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-200 text-gray-600 p-4 rounded-lg text-center">
                          <p className="font-medium">No players were promoted or relegated.</p>
                          <p className="text-xs mt-1">This may be because there are not enough divisions, no promotions/relegations configured, or all qualifying players were manually assigned.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4 mt-6 flex justify-end gap-3">
                  {!finalizeResult ? (
                    <>
                      <button
                        onClick={closeFinalizeModal}
                        disabled={isFinalizing}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmFinalizeLeague}
                        disabled={isFinalizing}
                        className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold flex items-center gap-2 shadow-sm disabled:opacity-50"
                      >
                        {isFinalizing ? (
                          <><FaSpinner className="animate-spin" /> Finalizing...</>
                        ) : (
                          "Confirm & Finalize"
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={closeFinalizeModal}
                      className="px-6 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#1a4263] transition-colors font-bold"
                    >
                      Done
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Invite Modal */}
        <AnimatePresence>
          {showInviteModal && selectedLeague && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-100"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-[#132F45] flex items-center gap-2">
                    <FaUserPlus className="text-blue-500" /> Invite Players
                  </h3>
                  <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">League Code</label>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-gray-50 border-2 border-dashed border-blue-200 rounded-lg p-3 text-center text-2xl font-black text-blue-700 tracking-widest font-mono">
                        {selectedLeague.joinCode || 'GENERATING...'}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedLeague.joinCode);
                          // Show toast would be nice here
                        }}
                        className="bg-blue-50 text-blue-600 p-3 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Copy Code"
                      >
                        <FaRegCopy size={20} />
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 italic text-center">Players can enter this code in the search box to join.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Shareable Join Link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/join/league/${selectedLeague.generalInviteToken}`}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-600 outline-none"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/league/${selectedLeague.generalInviteToken}`)}
                        className="bg-gray-50 text-gray-600 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                        title="Copy Link"
                      >
                        <FaRegCopy size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-600 mb-4 font-medium italic text-center">
                      Share this code or link with players you want to join this league.
                    </p>
                    <button
                      onClick={() => setShowInviteModal(false)}
                      className="w-full py-3 bg-[#132F45] text-white rounded-lg font-bold hover:shadow-lg transform hover:-translate-y-0.5 transition-all"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Tabs Navigation */}
        {selectedLeague && (
          <div className="flex border-b border-[#D1D5DB] mb-6 overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap">
            <button
              onClick={() => setActiveTab("stats")}
              className={`px-4 md:px-6 py-3 text-sm font-bold transition-colors ${activeTab === "stats"
                ? "border-b-2 border-[#132F45] text-[#132F45]"
                : "text-gray-400 hover:text-[#132F45]"
                }`}
            >
              Standings
            </button>
            <button
              onClick={() => setActiveTab("fixtures")}
              className={`px-4 md:px-6 py-3 text-sm font-bold transition-colors ${activeTab === "fixtures"
                ? "border-b-2 border-[#132F45] text-[#132F45]"
                : "text-gray-400 hover:text-[#132F45]"
                }`}
            >
              Fixtures
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 md:px-6 py-3 text-sm font-bold transition-colors ${activeTab === "history"
                ? "border-b-2 border-[#132F45] text-[#132F45]"
                : "text-gray-400 hover:text-[#132F45]"
                }`}
            >
              Match History
            </button>
            <button
              onClick={() => setActiveTab("bracket")}
              className={`px-4 md:px-6 py-3 text-sm font-bold transition-colors ${activeTab === "bracket"
                ? "border-b-2 border-[#132F45] text-[#132F45]"
                : "text-gray-400 hover:text-[#132F45]"
                }`}
            >
              Bracket
            </button>
            <button
              onClick={() => setActiveTab("rules")}
              className={`px-4 md:px-6 py-3 text-sm font-bold transition-colors ${activeTab === "rules"
                ? "border-b-2 border-[#132F45] text-[#132F45]"
                : "text-gray-400 hover:text-[#132F45]"
                }`}
            >
              Rules
            </button>
          </div>
        )}

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "stats" && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-xl border border-[#D1D5DB] p-4 md:p-6 shadow-sm overflow-hidden"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <h2 className="text-lg font-bold text-[#132F45] flex items-center gap-2">
                  <FaTrophy className="text-yellow-500" />
                  League Standings
                  {selectedDivision && <span className="text-sm font-normal text-gray-500">- {divisions.find(d => d.id === selectedDivision)?.name}</span>}
                </h2>
                <div className="text-[10px] text-gray-400 italic">
                  * Standings update automatically after match confirmation
                </div>
              </div>
              <div className="overflow-x-auto no-scrollbar -mx-4 md:mx-0 px-4 md:px-0">

                {selectedLeague ? (
                  <StandingsTable
                    leagueId={selectedLeague.id}
                    divisionId={selectedDivision}
                    standingsDisplay={selectedLeague.standingsDisplay}
                    advancedSettings={selectedLeague.advanced}
                    leagueStatus={selectedLeague.status}
                    sport={selectedLeague.sport}
                    effectiveFormat={effectiveFormat}
                    structure={selectedLeague.structure}
                  />
                ) : (
                  <div className="text-center py-12 opacity-70">
                    <FaTrophy className="mx-auto h-12 w-12 mb-4 opacity-30" />
                    <p>Select a league to view standings.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "fixtures" && (
            <motion.div
              key="fixtures"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {selectedLeague && (
                <div className="mb-4 space-y-3">
                  {/* Next Round feedback banners */}
                  {nextRoundError && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
                      <span>⚠️</span>
                      <span>{nextRoundError}</span>
                    </div>
                  )}
                  {nextRoundSuccess && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
                      <span>✅</span>
                      <span>Advanced to Round {selectedLeague?.currentRound ?? '?'}! New fixtures loaded.</span>
                    </div>
                  )}

                  {/* Status Tabs Filter Bar */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {[
                      { id: 'all', label: 'All Matches' },
                      { id: 'scheduled', label: 'Upcoming' },
                      { id: 'in_progress', label: 'Ongoing' },
                      { id: 'completed', label: 'Completed' },
                      { id: 'draw', label: 'Draws' },
                      { id: 'whitewash', label: 'Whitewashes' },
                      { id: 'walkover', label: 'Walkovers' },
                      { id: 'cancelled', label: 'Cancelled' },
                      { id: 'bye', label: 'Byes' }
                    ].map(tab => {
                      const isActive = statusFilter === tab.id;
                      const count = filteredMatches.filter(m => {
                        if (tab.id === 'all') return true;
                        if (tab.id === 'draw') return m.detailedStatus === 'DRAW';
                        if (tab.id === 'whitewash') return m.detailedStatus === 'WHITEWASH';
                        if (tab.id === 'walkover') return m.detailedStatus === 'WALKOVER';
                        return m.status === tab.id;
                      }).length;
                      
                      // Don't render low-frequency tabs if count is 0, to keep the UI clean
                      if (['draw', 'whitewash', 'walkover', 'bye', 'cancelled'].includes(tab.id) && count === 0) return null;

                      return (
                        <button
                          key={tab.id}
                          onClick={() => setStatusFilter(tab.id)}
                          className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 ${
                            isActive 
                              ? 'bg-[#132F45] text-white shadow-md shadow-[#132F45]/10 scale-[1.02]' 
                              : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'
                          }`}
                        >
                          {tab.label}
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${
                            isActive ? 'bg-[#BA995D] text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
                    <div className="flex flex-wrap gap-3 items-center">
                      
                      {/* Round filter — only when there are multiple rounds */}
                      {availableRounds.length > 1 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Round:</span>
                          <select
                            value={roundFilter}
                            onChange={(e) => setRoundFilter(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs font-semibold text-[#132F45] focus:outline-none focus:border-[#BA995D] transition-colors"
                          >
                            <option value="current">Current Round ({selectedLeague?.currentRound ?? 1})</option>
                            <option value="all">All Rounds</option>
                            {availableRounds.map(r => (
                              <option key={r} value={r}>Round {r}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {selectedDivision && (
                        <span className="text-xs bg-[#FAFAFA] border border-gray-100 px-3 py-2 rounded-xl text-[#132F45] font-semibold">
                          Division: <strong>{divisions.find(d => d.id === selectedDivision)?.name || '—'}</strong>
                        </span>
                      )}
                    </div>

                    {/* Next Round button — for active round-by-round OR knockout leagues */}
                    {(() => {
                      const isActive = selectedLeague?.status === 'active';
                      const isRoundByRound = selectedLeague?.fixtureStrategy === 'round_by_round';
                      const topLevelFormat = selectedLeague?.format;
                      let structureFormat = null;
                      try {
                        const s = selectedLeague?.structure;
                        structureFormat = (typeof s === 'string' ? JSON.parse(s) : s)?.format;
                      } catch { }
                      const effectiveFormat = structureFormat || topLevelFormat || '';
                      const isKnockout = effectiveFormat === 'knockout';
                      const isGK = effectiveFormat === 'groupsKnockout';
                      const isSwiss = effectiveFormat === 'swiss';

                       // totalConfiguredRounds is now calculated at the component top-level to support allMatchesCompleted logic
                      const hasNextRound = (selectedLeague?.currentRound || 1) < Math.max(maxRound, totalConfiguredRounds) && !allMatchesCompleted;

                      // For GK: only show Next Round button AFTER knockout has been seeded (bracket is active)
                      if (isGK) {
                        return isActive && knockoutAlreadySeeded && hasNextRound;
                      }
                      return isActive && (isRoundByRound || isKnockout || isSwiss) && hasNextRound;
                    })() && (
                        <button
                          onClick={handleNextRound}
                          disabled={isAdvancingRound}
                          title="Advance to the next round. All current-round matches must be completed first."
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#1A3F5C] transition-colors text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAdvancingRound ? (
                            <><FaSpinner className="animate-spin" /> Advancing...</>
                          ) : (
                            <>⏭ Next Round</>
                          )}
                        </button>
                      )}
                  </div>

                </div>
              )}

              {loadingMatches && selectedLeague ? (
                <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaSpinner className="animate-spin text-4xl text-[#132F45]" />
                </div>
              ) : selectedLeague && applyStatusFilter(filteredMatches).length > 0 ? (
                <>
                  {(() => {
                    const format = selectedLeague.format;
                    let structureFormat = null;
                    try {
                      const s = selectedLeague.structure;
                      structureFormat = (typeof s === 'string' ? JSON.parse(s) : s)?.format;
                    } catch (e) { }
                    const effectiveFormatStr = (structureFormat || format || '').toLowerCase();
                    const isKnockout = ['knockout', 'groupsknockout'].includes(effectiveFormatStr);

                    {(() => {
                      if (!champion && (!promoRegInfo || (promoRegInfo.promoted.length === 0 && promoRegInfo.relegated.length === 0))) return null;

                      return (
                        <div className="mb-10 w-full max-w-4xl mx-auto">
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-gradient-to-br from-[#132F45] to-[#1A3F5C] rounded-[2.5rem] p-6 md:p-8 shadow-2xl border border-blue-900/50 relative overflow-hidden"
                          >
                            {/* Background Decorations */}
                            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                              <FaTrophy className="text-9xl text-white -rotate-12" />
                            </div>

                            <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-6 relative z-10">
                              <div className="bg-yellow-400/20 p-3 rounded-2xl shadow-inner shadow-yellow-400/10">
                                <FaTrophy className="text-yellow-400 text-2xl" />
                              </div>
                              <div>
                                <h3 className="text-white font-black text-2xl tracking-tight uppercase">League Season Results</h3>
                                <p className="text-blue-300/60 text-[10px] font-black uppercase tracking-[0.2em]">Official Completion Summary</p>
                              </div>
                            </div>
                            
                            <div className="space-y-8 relative z-10">
                              {/* Champion Spotlight Section */}
                              {champion && (
                                <div className="p-1 bg-gradient-to-r from-yellow-400/40 via-amber-500/40 to-yellow-400/40 rounded-[2rem]">
                                  <div className="bg-[#132F45]/90 backdrop-blur-sm rounded-[1.9rem] p-5 md:p-6 flex items-center justify-between group hover:bg-[#1A3F5C] transition-all">
                                    <div className="flex items-center gap-5 md:gap-8">
                                      <div className="relative">
                                        <motion.div 
                                          animate={{ scale: [1, 1.05, 1] }}
                                          transition={{ duration: 4, repeat: Infinity }}
                                          className="h-16 w-16 md:h-24 md:w-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 p-1 shadow-xl shadow-yellow-900/40 ring-4 ring-yellow-400/20"
                                        >
                                          <div className="h-full w-full rounded-xl overflow-hidden bg-blue-900/20">
                                            {champion.avatarUrl ? (
                                              <img src={getImageUrl(champion.avatarUrl)} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                              <div className="h-full w-full flex items-center justify-center text-white text-3xl font-black">
                                                {champion.name?.charAt(0) || '?'}
                                              </div>
                                            )}
                                          </div>
                                        </motion.div>
                                        <div className="absolute -top-3 -right-3 bg-yellow-400 text-[#132F45] h-8 w-8 flex items-center justify-center rounded-full text-xs font-black shadow-lg border-2 border-[#132F45]">
                                          <FaCrown />
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <div className="text-yellow-400/80 text-[10px] font-black uppercase tracking-[0.3em] mb-2 flex items-center gap-2">
                                          <FaStar className="text-[8px] animate-pulse" /> Official Champion
                                        </div>
                                        <div className="text-white text-2xl md:text-4xl font-black tracking-tight group-hover:text-yellow-400 transition-colors">
                                          {champion.name}
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                           <span className="text-blue-300/40 text-[9px] font-bold uppercase tracking-widest">Victory Confirmed</span>
                                           <div className="h-1 w-1 rounded-full bg-blue-300/40" />
                                           <span className="text-yellow-400/40 text-[9px] font-bold uppercase tracking-widest">Season Champion</span>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="hidden lg:flex flex-col items-end">
                                       <div className="text-right px-6 py-3 bg-white/5 rounded-2xl border border-white/10">
                                          <div className="text-yellow-400 font-black text-3xl leading-none">#1</div>
                                          <div className="text-white/40 text-[9px] font-black uppercase tracking-widest mt-1">League Leader</div>
                                       </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Divisional Results (Promoted/Relegated) */}
                              {promoRegInfo && (promoRegInfo.promoted.length > 0 || promoRegInfo.relegated.length > 0) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                                  {promoRegInfo.promoted.length > 0 && (
                                    <div className="space-y-4">
                                      <div className="flex items-center gap-3 text-green-400 text-xs font-black uppercase tracking-[0.2em] bg-green-400/5 py-2 px-4 rounded-xl border border-green-400/10 w-fit">
                                        <FaStar className="animate-bounce" /> Promoted Players
                                      </div>
                                      <div className="grid grid-cols-1 gap-2.5">
                                        {promoRegInfo.promoted.map((p, i) => (
                                          <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-5 py-4 group hover:bg-white/10 transition-all">
                                            <div className="flex items-center gap-4">
                                              <div className="text-white/20 font-black italic text-xl w-6">#{i+1}</div>
                                              <div className="text-white font-bold tracking-wide group-hover:text-green-400 transition-colors">{p.player?.name}</div>
                                            </div>
                                            <div className="bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-green-500/20">
                                              Moving Up
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {promoRegInfo.relegated.length > 0 && (
                                    <div className="space-y-4">
                                      <div className="flex items-center gap-3 text-red-400 text-xs font-black uppercase tracking-[0.2em] bg-red-400/5 py-2 px-4 rounded-xl border border-red-400/10 w-fit">
                                        <FaArrowDown className="animate-bounce" /> Relegated Players
                                      </div>
                                      <div className="grid grid-cols-1 gap-2.5">
                                        {promoRegInfo.relegated.map((p, i) => (
                                          <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-5 py-4 group hover:bg-white/10 transition-all">
                                            <div className="text-white font-bold tracking-wide group-hover:text-red-400 transition-colors">{p.player?.name}</div>
                                            <div className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-red-500/20">
                                              Relegated
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </div>
                      );
                    })()}
                    return null;
                  })()}
                  {viewMode === "bracket" ? (
                    <div className="mt-4">
                      <LeagueBracketView
                        matches={applyStatusFilter(filteredMatches)}
                        onViewDetails={handleViewDetails}
                        winner={champion}
                        promoRegInfo={promoRegInfo}
                        effectiveFormat={(() => {
                          const format = selectedLeague.format;
                          let structureFormat = null;
                          try {
                            const s = selectedLeague.structure;
                            structureFormat = (typeof s === 'string' ? JSON.parse(s) : s)?.format;
                          } catch (e) { }
                          return (structureFormat || format || '').toLowerCase();
                        })()}
                      />
                    </div>
                  ) : (
                    <div className="space-y-12">
                      {(() => {
                        const format = selectedLeague.format || '';

                        // Partition matches by Stage with mutual exclusion
                        const knockoutMatches = displayMatches.filter(m => {
                          const stage = String(m.stage || '').toLowerCase();
                          const addStage = String(m.additionalData?.stage || '').toLowerCase();
                          const validStages = ['knockout', 'playoff', 'final', 'groupsknockout', 'championship'];
                          const isExplicitKnockout = validStages.includes(stage) || validStages.includes(addStage);
                          // FALLBACK: Treat empty stage as knockout ONLY if it has no divisionId AND it's a format that supports knockouts
                          const isLikelyKnockout = canHaveKnockout && !m.stage && !m.divisionId && (m.round > 1 || (format === 'groupsKnockout'));
                          return isExplicitKnockout || isLikelyKnockout;
                        }).filter(m => {
                          // VISIBILITY RULE: Show if it has players, OR if it's a "Final" or "Semi-Final", OR if it's the next reachable round
                          const hasPlayers = m.player1Id || m.player2Id || m.status === 'bye' || m.status === 'completed' || m.status === 'walkover';
                          const isMajorRound = m.round >= 2 || m.matchNumber === 1; // High rounds like Final (R2/R3)
                          return hasPlayers || isMajorRound;
                        });

                        const groupMatches = displayMatches.filter(m => 
                          (!m.stage || m.stage === 'group' || m.stage === 'round_robin' || m.stage === 'swiss') &&
                          (m.player1Id || m.player2Id || m.status === 'bye' || m.status === 'completed' || m.status === 'walkover') &&
                          !knockoutMatches.some(km => km.id === m.id) // Ensure mutual exclusion
                        );
                        const isMultiStage = format === 'groupsKnockout' || (groupMatches.length > 0 && knockoutMatches.length > 0);

                        const renderStageSection = (title, matches, isKnockout = false, showBanner = true) => {
                          if (matches.length === 0) return null;

                          const roundGroups = {};
                          matches.forEach(m => {
                            const r = m.additionalData?.round || m.round || 1;
                            if (!roundGroups[r]) roundGroups[r] = [];
                            roundGroups[r].push(m);
                          });

                          const rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);

                          return (
                            <div className="space-y-8">
                              {/* Stage Header - Only show if it's a multi-stage competition */}
                              {showBanner && (
                                <div className="relative flex flex-col items-center">
                                  <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>
                                  <div className={`relative z-10 px-8 py-2 rounded-2xl border flex flex-col items-center shadow-sm ${isKnockout
                                      ? 'bg-gradient-to-br from-[#132F45] to-[#1A3F5C] border-blue-900 text-white'
                                      : 'bg-white border-gray-100 text-[#132F45]'
                                    }`}>
                                    <span className={`text-[10px] font-black uppercase tracking-[0.3em] mb-1 ${isKnockout ? 'text-blue-300' : 'text-blue-600'}`}>
                                      {isKnockout ? 'Championship Phase' : 'Opening Phase'}
                                    </span>
                                    <h2 className="text-lg md:text-xl font-black uppercase tracking-tight">{title}</h2>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-10">
                                  {rounds.map(r => {
                                    // Determine display name for the round
                                    let roundName = `Round ${r}`;
                                    if (isKnockout) {
                                      // Get all unique round numbers in this specific knockout stage
                                      const stageRounds = [...new Set(matches.map(m => m.additionalData?.round || m.round))].sort((a, b) => a - b);
                                      const firstRoundInStage = stageRounds[0] || 1;
                                      const lastRoundInStage = stageRounds[stageRounds.length - 1] || 1;

                                      // How many rounds do we expect based on the size of the first round in this stage?
                                      const r1MatchesInStage = matches.filter(m => (m.additionalData?.round || m.round) === firstRoundInStage);
                                      const expectedRoundsFromSize = r1MatchesInStage.length > 0 ? Math.ceil(Math.log2(r1MatchesInStage.length * 2)) : 0;

                                      // The effective final round number for this knockout phase
                                      // If we have R1 and it implies 3 rounds total, then final round is R1 + 3 - 1 = R3.
                                      const stageFinalRound = Math.max(lastRoundInStage, firstRoundInStage + expectedRoundsFromSize - 1);

                                      const roundsRemaining = stageFinalRound - r;
                                      if (roundsRemaining === 0) roundName = "Grand Final";
                                      else if (roundsRemaining === 1) roundName = "Semi-Finals";
                                      else if (roundsRemaining === 2) roundName = "Quarter-Finals";
                                      else if (roundsRemaining === 3) roundName = "Round of 16";
                                      else if (roundsRemaining === 4) roundName = "Round of 32";
                                      else if (roundsRemaining === 5) roundName = "Round of 64";
                                      else roundName = `Knockout Round ${r}`;
                                    }

                                  return (
                                    <div key={`stage-${title}-round-${r}`}>
                                      <div className="flex items-center gap-4 mb-5 sticky top-0 bg-[#FFFBF4]/80 backdrop-blur-md py-2 z-10 transition-all">
                                        <div className={`h-[2px] w-8 rounded-full ${isKnockout ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                                        <h3 className={`text-xs md:text-sm font-black uppercase tracking-widest ${isKnockout ? 'text-blue-700' : 'text-[#132F45]'}`}>
                                          {roundName}
                                        </h3>
                                        <div className="h-[2px] flex-1 bg-gradient-to-r from-gray-200 to-transparent"></div>
                                      </div>
                                      <div className="grid grid-cols-1 gap-4">
                                        {roundGroups[r].map(match => (
                                          <FixtureCard
                                            key={match.id}
                                            match={match}
                                            onViewDetails={handleViewDetails}
                                            canEditFixtures={canEditFixtures}
                                            canEditResults={false}
                                            onEditFixture={handleEditFixture}
                                            onEditResult={handleEditResult}
                                            canWalkover={canRecordWalkover}
                                            onWalkover={handleWalkover}
                                            promoRegInfo={promoRegInfo}
                                            effectiveFormat={format}
                                            champion={champion}
                                            leagueStatus={selectedLeague?.status}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        };

                        if (displayMatches.length === 0) {
                          return (
                            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                              <FaTrophy className="mx-auto h-12 w-12 text-[#132F45] opacity-10 mb-4" />
                              <p className="text-[#132F45] opacity-50 font-bold uppercase tracking-widest text-xs">No fixtures found for selected filters</p>
                            </div>
                          );
                        }

                        return (
                          <>
                            {renderStageSection("Group Stage", groupMatches, false, isMultiStage)}
                            {renderStageSection("Knockout Bracket", knockoutMatches, true, isMultiStage)}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </>
              ) : selectedLeague && !loadingMatches ? (
                <div className="text-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaTrophy className="mx-auto h-12 w-12 text-[#132F45] opacity-30" />
                  <p className="mt-4 text-[#132F45] opacity-70">No fixtures found for the selected league and filters.</p>
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaTrophy className="mx-auto h-12 w-12 text-[#132F45] opacity-30" />
                  <p className="mt-4 text-[#132F45] opacity-70">Select a league to view fixtures.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {loadingMatches && selectedLeague ? (
                <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaSpinner className="animate-spin text-4xl text-[#132F45]" />
                </div>
              ) : selectedLeague && historyMatches.length > 0 ? (
                <div className="bg-white rounded-xl border border-[#D1D5DB] p-4 md:p-6 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-[#132F45]">
                      Match History
                    </h2>
                    <span className="text-xs text-[#132F45] bg-[#FFFBF4] px-3 py-1 rounded-full border border-[#D1D5DB] font-bold">
                      {historyMatches.length} Matches
                    </span>
                  </div>
                  <div className="overflow-x-auto no-scrollbar -mx-4 md:mx-0 px-4 md:px-0">
                    <table className="min-w-full divide-y divide-[#D1D5DB]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-[10px] font-black text-[#132F45] uppercase tracking-widest">Group</th>
                          <th className="px-4 py-3 text-left text-[10px] font-black text-[#132F45] uppercase tracking-widest text-nowrap">Date / Time</th>
                          <th className="px-4 py-3 text-left text-[10px] font-black text-[#132F45] uppercase tracking-widest">Home</th>
                          <th className="px-4 py-3 text-left text-[10px] font-black text-[#132F45] uppercase tracking-widest">Away</th>
                          <th className="px-4 py-3 text-left text-[10px] font-black text-[#132F45] uppercase tracking-widest text-nowrap">Score</th>
                          <th className="px-4 py-3 text-left text-[10px] font-black text-[#132F45] uppercase tracking-widest">Winner</th>
                          <th className="px-4 py-3 text-right text-[10px] font-black text-[#132F45] uppercase tracking-widest">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-[#D1D5DB]">
                        {historyMatches.map((match) => {
                          const scoreStr = match.score || '0-0';
                          // Handle multiple delimiters (-, :, –)
                          const scores = scoreStr.split(/[-:–]/).map(val => parseInt(val, 10));
                          const homeScore = isNaN(scores[0]) ? 0 : scores[0];
                          const awayScore = isNaN(scores[1]) ? 0 : scores[1];

                          const isTieBreak = match.winnerId && homeScore === awayScore;
                          const winner = match.winnerId
                            ? (match.winnerId === (match.additionalData?.player1Id || match.player1Id) ? match.homeTeam : match.awayTeam)
                            : (homeScore > awayScore ? match.homeTeam : awayScore > homeScore ? match.awayTeam : "Draw");
                          const winnerDisplay = isTieBreak && winner !== "Draw" ? `${winner} (TB)` : winner;
                          return (
                            <tr key={match.id} className="hover:bg-[#FFFBF4]">
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-[#132F45]">
                                {match.additionalData?.groupName || match.additionalData?.group || match.additionalData?.division?.name || "Main Division"}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-[#132F45]">
                                <div>{formatDate(match.date)}</div>
                                <div className="text-xs opacity-70">{formatTime(match.startTime)}</div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-[#132F45]">
                                {match.homeTeam}
                                {match.additionalData?.resultData?.isAutoForfeit && (
                                  <div className="text-[10px] text-red-600 font-bold uppercase mt-1">Forfeited</div>
                                )}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-[#132F45]">{match.awayTeam}</td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-[#132F45]">
                                <div className="flex flex-col">
                                  <span>{match.score}</span>
                                  {match.isWalkover && (
                                    <span className="text-[9px] text-orange-600 font-black uppercase mt-1 px-1.5 py-0.5 bg-orange-50 rounded border border-orange-100 w-fit">
                                      WALKOVER
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-[#132F45]">
                                <span className={`font-semibold ${winner === "Draw" ? "text-gray-400" : "text-green-600"}`}>{winnerDisplay}</span>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleViewDetails(match)}
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-[#132F45] text-white rounded hover:bg-[#1A3F5C] transition-colors text-xs"
                                  >
                                    <FaEye />
                                    View
                                  </button>
                                  {canEditResults && (
                                    <button
                                      onClick={() => handleEditResult(match)}
                                      className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors text-xs"
                                      title="Edit Result"
                                    >
                                      <FaTrophy />
                                      Edit Result
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
              ) : selectedLeague && !loadingMatches ? (
                <div className="text-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaHistory className="mx-auto h-12 w-12 text-[#132F45] opacity-30" />
                  <p className="mt-4 text-[#132F45] opacity-70">No completed matches found for the selected league.</p>
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaHistory className="mx-auto h-12 w-12 text-[#132F45] opacity-30" />
                  <p className="mt-4 text-[#132F45] opacity-70">Select a league to view match history.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "pending-walkovers" && (
            <motion.div
              key="pending-walkovers"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {loadingPendingWalkovers && selectedLeague ? (
                <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaSpinner className="animate-spin text-4xl text-[#132F45]" />
                </div>
              ) : selectedLeague && pendingWalkovers.length > 0 ? (
                <div className="bg-white rounded-xl border border-[#D1D5DB] p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-[#132F45] flex items-center gap-2">
                      ⚠️ Pending Walkovers
                    </h2>
                    <span className="text-sm text-white bg-red-600 px-3 py-1 rounded-full border border-red-700 font-bold">
                      {pendingWalkovers.length} pending
                    </span>
                  </div>
                  <div className="space-y-4">
                    {pendingWalkovers.map((walkover) => (
                      <div key={walkover.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50 hover:bg-orange-100 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="font-bold text-[#132F45]">
                                {walkover.player1?.name || "Player 1"} vs {walkover.player2?.name || "Player 2"}
                              </div>
                              <span className="px-2 py-1 bg-orange-200 text-orange-800 rounded text-xs font-bold uppercase">
                                {walkover.status === 'Pending' ? 'Awaiting Approval' : walkover.status}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 mb-2">
                              Submitted by: <span className="font-semibold text-[#132F45]">{walkover.submittedByName || walkover.submittedBy?.name || "Unknown"}</span>
                            </div>
                            <div className="text-sm text-gray-600">
                              Submitted: <span className="font-mono text-[#132F45]">{walkover.submittedAt ? new Date(walkover.submittedAt).toLocaleString() : "N/A"}</span>
                            </div>
                            {walkover.notes && (
                              <div className="mt-2 p-2 bg-white rounded border border-orange-100 text-sm text-gray-700">
                                <strong>Notes:</strong> {walkover.notes}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handlePendingWalkover(walkover)}
                            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium whitespace-nowrap"
                          >
                            Review
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedLeague && !loadingPendingWalkovers ? (
                <div className="text-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaTrophy className="mx-auto h-12 w-12 text-[#132F45] opacity-30" />
                  <p className="mt-4 text-[#132F45] opacity-70">No pending walkovers for the selected league.</p>
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
                  <FaTrophy className="mx-auto h-12 w-12 text-[#132F45] opacity-30" />
                  <p className="mt-4 text-[#132F45] opacity-70">Select a league to view pending walkovers.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "bracket" && (
            <motion.div
              key="bracket"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-xl border border-[#D1D5DB] p-4 md:p-6 shadow-sm overflow-hidden"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <h2 className="text-lg font-bold text-[#132F45] flex items-center gap-2">
                  <FaProjectDiagram className="text-blue-500" />
                  League Bracket
                  {selectedDivision && <span className="text-sm font-normal text-gray-500">- {divisions.find(d => d.id === selectedDivision)?.name}</span>}
                </h2>
              </div>

              {selectedLeague ? (
                <div className="mt-4">
                  <LeagueBracketView
                    matches={filteredMatches}
                    onViewDetails={handleViewDetails}
                    winner={champion}
                    promoRegInfo={promoRegInfo}
                    effectiveFormat={effectiveFormat}
                    leagueStatus={selectedLeague?.status}
                    standings={leagueStandings}
                  />
                </div>
              ) : (
                <div className="text-center py-12 opacity-70">
                  <FaProjectDiagram className="mx-auto h-12 w-12 mb-4 opacity-30" />
                  <p>Select a league to view bracket.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "rules" && selectedLeague && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-[#F8FAFC] rounded-[2.5rem] border border-slate-200/60 p-1 shadow-2xl shadow-slate-200/50"
            >
              <div className="bg-white rounded-[2.2rem] p-8 md:p-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pb-8 border-b border-slate-100">
                  <div className="flex items-center gap-5">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-4 rounded-2xl shadow-lg shadow-blue-200">
                      <FaClipboardList className="text-white text-2xl" />
                    </div>
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black text-[#132F45] tracking-tight">League Rules & Format</h2>
                      <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                        <span className="w-8 h-[1px] bg-slate-200"></span>
                        Configuration Details
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="px-5 py-2.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-[#132F45] uppercase tracking-widest">Active Configuration</span>
                     </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
                  {/* 1. Registration & Visibility */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <FaGlobeAmericas />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Registration</h3>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: 'Visibility', value: selectedLeague.visibility || 'Public', accent: true },
                        { label: 'League Type', value: selectedLeague.leagueType || 'Fixed' },
                        { label: 'Join Allowed', value: selectedLeague.joinAllowed ? 'Yes' : 'No', color: selectedLeague.joinAllowed ? 'text-green-600' : 'text-red-600' },
                        { label: 'Late Join', value: selectedLeague.lateJoinAllowed ? 'Enabled' : 'Disabled', color: selectedLeague.lateJoinAllowed ? 'text-blue-600' : 'text-slate-400' }
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">{item.label}:</span>
                          <span className={`font-black tracking-tight ${item.color || 'text-[#132F45]'} ${item.accent ? 'bg-slate-100 px-2 py-0.5 rounded text-[10px]' : ''}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 2. League Format */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                        <FaProjectDiagram />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Format & Structure</h3>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: 'Format', value: ((selectedLeague.structure?.format || selectedLeague.format || 'ROUND_ROBIN').replace(/_/g, ' ')), accent: true },
                        { label: 'Sport', value: selectedLeague.sport || 'N/A' },
                        { label: 'Strategy', value: (selectedLeague.fixtureStrategy || 'Full Schedule').replace(/_/g, ' ') },
                        { label: 'Bye Logic', value: selectedLeague.byeLogic || 'Random' }
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">{item.label}:</span>
                          <span className={`font-black tracking-tight text-[#132F45] uppercase ${item.accent ? 'bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px]' : ''}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. Points System */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                        <FaStar />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Points System</h3>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: 'Win', value: `${selectedLeague.pointsSystem?.win || 3} pts` },
                        { label: 'Draw', value: `${selectedLeague.pointsSystem?.draw || 1} pts` },
                        { label: 'Loss', value: `${selectedLeague.pointsSystem?.loss || 0} pts` },
                        { label: 'Bonus', value: selectedLeague.pointsSystem?.bonus ? 'Enabled' : 'Disabled', color: selectedLeague.pointsSystem?.bonus ? 'text-emerald-600' : 'text-slate-400' }
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">{item.label}:</span>
                          <span className={`font-black tracking-tight ${item.color || 'text-[#132F45]'}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 4. Advancement & Results */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">
                        <FaBullseye />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Advancement</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">Promotion:</span>
                        <span className="font-black tracking-tight text-[#132F45]">
                          {selectedLeague.structure?.promotionCount || selectedLeague.structure?.divisions?.promotions || selectedLeague.structure?.groups?.qualifiers || 0} spots
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">Relegation:</span>
                        <span className="font-black tracking-tight text-[#132F45]">
                          {selectedLeague.structure?.relegationCount || selectedLeague.structure?.divisions?.relegations || 0} spots
                        </span>
                      </div>
                      
                      {selectedLeague?.status === 'completed' && promoRegInfo && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                          {promoRegInfo.promoted.length > 0 && (
                            <div>
                              <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Promoted Players
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {promoRegInfo.promoted.map((p, i) => (
                                  <span key={i} className="bg-emerald-50 text-emerald-700 text-[9px] px-2.5 py-1 rounded-lg border border-emerald-100 font-black">
                                    {p.player?.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {promoRegInfo.relegated.length > 0 && (
                            <div>
                              <div className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Relegated Players
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {promoRegInfo.relegated.map((p, i) => (
                                  <span key={i} className="bg-red-50 text-red-700 text-[9px] px-2.5 py-1 rounded-lg border border-red-100 font-black">
                                    {p.player?.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 5. Match Rules */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-violet-50 group-hover:text-violet-600 transition-colors">
                        <FaCogs />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Match Rules</h3>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: 'Frames', value: `Best of ${selectedLeague.matchRules?.bestOf || 3}`, accent: true },
                        { label: 'Walkover', value: `${(Math.ceil((selectedLeague.matchRules?.bestOf || 3) / 2))} – 0` },
                        { label: 'Draws', value: selectedLeague.matchRules?.allowDraws ? 'Allowed' : 'Not Allowed', color: selectedLeague.matchRules?.allowDraws ? 'text-violet-600' : 'text-slate-400' },
                        { label: 'Handicaps', value: selectedLeague.matchRules?.useHandicaps ? 'Enabled' : 'Disabled', color: selectedLeague.matchRules?.useHandicaps ? 'text-violet-600' : 'text-slate-400' }
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">{item.label}:</span>
                          <span className={`font-black tracking-tight ${item.color || 'text-[#132F45]'} ${item.accent ? 'bg-violet-50 text-violet-700 px-2 py-0.5 rounded text-[10px]' : ''}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 6. Standing Logic */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-rose-50 group-hover:text-rose-600 transition-colors">
                        <FaChartLine />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Standings Logic</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3">
                        <span className="text-slate-400 font-medium text-xs">Tie-break Priority:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {ensureArray(selectedLeague.tieBreakPriority, ["Head to Head", "Frame Diff", "Wins"]).map((tb, i) => (
                            <span key={i} className="bg-rose-50/50 text-rose-700 text-[9px] px-2.5 py-1 rounded-lg border border-rose-100 font-black uppercase">
                              {i + 1}. {typeof tb === 'string' ? (tb.replace(/([A-Z])/g, ' $1').trim()) : tb}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">H2H:</span>
                        <span className="font-black tracking-tight text-[#132F45]">{selectedLeague.standingsDisplay?.useHeadToHead ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 7. Scheduling */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-cyan-50 group-hover:text-cyan-600 transition-colors">
                        <FaClock />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Scheduling</h3>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: 'Interval', value: `${selectedLeague.scheduling?.matchInterval || 60} mins` },
                        { label: 'Auto Forfeit', value: selectedLeague.scheduling?.autoForfeit ? 'Enabled' : 'Disabled', color: selectedLeague.scheduling?.autoForfeit ? 'text-red-600' : 'text-slate-400' },
                        { label: 'Reschedule', value: selectedLeague.scheduling?.allowReschedule ? 'Allowed' : 'Locked', color: selectedLeague.scheduling?.allowReschedule ? 'text-cyan-600' : 'text-slate-400' },
                        { label: 'Venue', value: typeof selectedLeague.venue === 'object' ? selectedLeague.venue?.name : (selectedLeague.venue || 'N/A'), accent: true }
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">{item.label}:</span>
                          <span className={`font-black tracking-tight ${item.color || 'text-[#132F45]'} ${item.accent ? 'bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded text-[10px] truncate max-w-[100px]' : ''}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 8. Reporting & Permissions */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-purple-50 group-hover:text-purple-600 transition-colors">
                        <FaShieldAlt />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Reporting</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">Method:</span>
                        <span className="font-black tracking-tight text-[#132F45] text-[10px] bg-slate-100 px-2 py-0.5 rounded">
                          {selectedLeague.reporting?.method === 'bothConfirm' ? 'BOTH CONFIRM' : 
                           selectedLeague.reporting?.method === 'oneSubmit' ? 'SINGLE SUBMISSION' : 'STANDARD'}
                        </span>
                      </div>
                      {[
                        { label: 'Admin Approval', value: selectedLeague.reporting?.adminApproval ? 'Required' : 'None', color: selectedLeague.reporting?.adminApproval ? 'text-purple-600' : 'text-slate-400' },
                        { label: 'Photo Proof', value: selectedLeague.reporting?.photoProof ? 'Allowed' : 'Disabled', color: selectedLeague.reporting?.photoProof ? 'text-purple-600' : 'text-slate-400' }
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">{item.label}:</span>
                          <span className={`font-black tracking-tight ${item.color || 'text-[#132F45]'}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                      {selectedLeague.reporting?.dispute?.enabled && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">Dispute Window:</span>
                          <span className="font-black tracking-tight text-red-600">{selectedLeague.reporting.dispute.timeLimit} hrs</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 9. Advanced Settings */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors">
                        <FaUserShield />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Advanced</h3>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: 'Withdrawal', value: (selectedLeague.advanced?.withdrawal || 'voidAll').replace(/([A-Z])/g, ' $1'), accent: true },
                        { label: 'Auto Accept', value: selectedLeague.advanced?.registration?.autoAccept ? 'Yes' : 'No' },
                        { label: 'Admin Edit', value: selectedLeague.advanced?.adminEditResults ? 'Yes' : 'No' },
                        { label: 'Keep Lifetime', value: selectedLeague.advanced?.keepLifetime ? 'Yes' : 'No' }
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">{item.label}:</span>
                          <span className={`font-black tracking-tight text-[#132F45] ${item.accent ? 'bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-[10px] uppercase' : ''}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 10. Standings Display */}
                  <div className="group bg-white hover:bg-slate-50/50 rounded-3xl p-6 border border-slate-100 transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/40">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                        <FaList />
                      </div>
                      <h3 className="text-[11px] font-black text-[#132F45] uppercase tracking-[0.2em]">Standings Table</h3>
                    </div>
                    <div className="flex flex-col gap-3">
                      <span className="text-slate-400 font-medium text-xs">Enabled Columns:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(() => {
                          const cols = selectedLeague.standingsDisplay?.columns;
                          if (Array.isArray(cols)) return cols;
                          if (typeof cols === 'string') {
                            const parsed = ensureArray(cols);
                            if (parsed.length > 0) return parsed;
                          }
                          if (typeof cols === 'object' && cols !== null) {
                            return Object.keys(cols).filter(k => cols[k] !== false);
                          }
                          return ["P", "W", "L", "D", "Pts"];
                        })().map((col, i) => (
                          <span key={i} className="bg-teal-50/50 text-teal-700 text-[9px] px-2.5 py-1 rounded-lg border border-teal-100 font-black uppercase">
                            {typeof col === 'string' ? (col.replace(/([A-Z])/g, ' $1').trim()) : col}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced/Additional Notes */}
                {(selectedLeague.basicInfo?.description || selectedLeague.advanced?.terms) && (
                  <div className="mt-16 pt-10 border-t border-slate-100">
                    <div className="flex items-center gap-3 mb-6">
                       <FaInfoCircle className="text-slate-300" />
                       <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Organizer Notes & Terms</h3>
                    </div>
                    <div className="bg-slate-50/50 rounded-[2rem] p-8 text-slate-600 text-sm leading-relaxed whitespace-pre-line border border-slate-100 italic relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-slate-200"></div>
                      {selectedLeague.basicInfo?.description || selectedLeague.advanced?.terms}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Match Detail Modal */}
      <AnimatePresence>
        {isModalOpen && selectedMatch && (
          <MatchDetailsModal
            match={selectedMatch}
            onClose={closeModal}
            statusStyles={statusStyles}
            formatDate={formatDate}
            formatTime={formatTime}
          />
        )}
      </AnimatePresence>

      {/* Edit Fixture Modal */}
      <AnimatePresence>
        {isEditModalOpen && selectedFixtureForEdit && (
          <EditFixtureModal
            fixture={selectedFixtureForEdit}
            league={selectedLeague}
            advancedSettings={selectedLeague?.advanced}
            onClose={closeEditModal}
            onUpdate={loadLeagueData}
            formatDate={formatDate}
            formatTime={formatTime}
          />
        )}
      </AnimatePresence>

      {/* Edit Result Modal */}
      <AnimatePresence>
        {isEditResultModalOpen && selectedFixtureForEditResult && (
          <EditResultModal
            fixture={selectedFixtureForEditResult}
            advancedSettings={selectedLeague?.advanced}
            onClose={closeEditResultModal}
            onUpdate={loadLeagueData}
          />
        )}
      </AnimatePresence>

      {/* Walkover Modal */}
      <AnimatePresence>
        {isWalkoverModalOpen && selectedFixtureForWalkover && (
          <WalkoverModal
            fixture={selectedFixtureForWalkover}
            onClose={closeWalkoverModal}
            onUpdate={loadLeagueData}
          />
        )}
      </AnimatePresence>

      {/* Pending Walkover Modal */}
      <AnimatePresence>
        {isPendingWalkoverModalOpen && selectedPendingWalkover && (
          <PendingWalkoverModal
            walkover={selectedPendingWalkover}
            onClose={closePendingWalkoverModal}
            onUpdate={() => {
              closePendingWalkoverModal();
              loadPendingWalkovers();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// MatchDetailsModal component
function MatchDetailsModal({ match, onClose, statusStyles, formatDate, formatTime }) {
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
        className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#132F45] text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Match Details</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg">✕</button>
        </div>
        <div className="p-6 space-y-6">
          <div className="border-b border-[#D1D5DB] pb-4">
            <div className="flex items-center gap-2 text-sm text-[#132F45] opacity-70 mb-4 flex-wrap">
              <FaCalendarAlt /><span>{formatDate(match.date)}</span>
              <FaClock /><span>{formatTime(match.startTime)}</span>
              <FaMapMarkerAlt /><span>{match.tableName || match.tableNumber || "TBA"}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className="text-center bg-blue-50 p-4 rounded-lg">
                <p className="text-xs text-[#132F45] opacity-70 uppercase font-semibold mb-2">Home Team</p>
                <p className="text-lg font-bold text-[#132F45]">{match.homeTeam}</p>
              </div>
              <div className="text-center bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-[#132F45] opacity-70 uppercase font-semibold mb-2">Score</p>
                <p className="text-3xl font-bold text-[#132F45]">{match.score}</p>
              </div>
              <div className="text-center bg-green-50 p-4 rounded-lg">
                <p className="text-xs text-[#132F45] opacity-70 uppercase font-semibold mb-2">Away Team</p>
                <p className="text-lg font-bold text-[#132F45]">{match.awayTeam}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#132F45]">Match Status</span>
              {match.isDisputed && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-100 animate-pulse">
                  <FaExclamationTriangle size={10} /> RESOLVED DISPUTE
                </span>
              )}
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2 ${
              match.isWalkover || match.detailedStatus === 'WALKOVER'
                ? 'bg-orange-50 text-orange-600 border border-orange-100'
                : match.detailedStatus === 'DRAW'
                ? 'bg-teal-50 text-teal-600 border border-teal-100'
                : match.detailedStatus === 'WHITEWASH'
                ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                : match.detailedStatus === 'TIE-BREAK'
                ? 'bg-amber-50 text-amber-600 border border-amber-100'
                : match.detailedStatus === 'FORFEIT'
                ? 'bg-red-50 text-red-600 border border-red-100'
                : match.detailedStatus === 'PENDING APPROVAL'
                ? 'bg-yellow-50 text-yellow-600 border border-yellow-100'
                : match.status === 'completed'
                ? 'bg-green-50 text-green-600 border border-green-100'
                : (statusStyles[match.status] || statusStyles.pending)
            }`}>
              {match.isWalkover || match.detailedStatus === 'WALKOVER' ? (
                <><FaTrophy size={14} /> WALKOVER</>
              ) : match.detailedStatus === 'DRAW' ? (
                '🤝 DRAW'
              ) : match.detailedStatus === 'WHITEWASH' ? (
                'WHITEWASH'
              ) : match.detailedStatus === 'TIE-BREAK' ? (
                'TIE-BREAK'
              ) : match.detailedStatus === 'FORFEIT' ? (
                'FORFEIT'
              ) : match.detailedStatus === 'PENDING APPROVAL' ? (
                'PENDING APPROVAL'
              ) : (
                match.detailedStatus || (match.status?.charAt(0).toUpperCase() + (match.status?.slice(1) || 'Pending'))
              )}
            </span>
          </div>
          {/* Frame-by-frame details for all game types (snooker, poker, pool) */}
          {match.frameDetails && (match.gameType === "snooker" || match.gameType === "pooker" || match.gameType === "pool") && (() => {
            let frameData = match.frameDetails;
            if (typeof frameData === 'string') {
              try {
                frameData = JSON.parse(frameData);
                // Handle double stringification from backend JSON blobs
                if (typeof frameData === 'string') {
                  frameData = JSON.parse(frameData);
                }
              } catch (e) {
                console.error('Failed to parse frame details:', e);
              }
            }

            const isWalkover = frameData && typeof frameData === 'object' && !Array.isArray(frameData) &&
              (frameData.isManualWalkover || frameData.walkoverScore || frameData.walkoverApprovedAt || frameData.isAutoForfeit);

            // Determine label based on game type
            const gameLabel = match.gameType === 'pooker' ? 'Frame' : match.gameType === 'pool' ? 'Rack' : 'Frame';
            const gameLabelLower = gameLabel.toLowerCase();

            return (
              <div className="border-t border-[#D1D5DB] pt-4">
                <h3 className="text-base font-bold text-[#132F45] mb-4">Frame-by-Frame Breakdown</h3>

                {isWalkover ? (
                  <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
                      <FaTrophy className="text-xl" />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#132F45]">Walkover Victory</h4>
                      {match.score && match.score !== '0-0' && (
                        <p className="text-sm text-[#132F45]">
                          <strong>Score:</strong> {match.score}
                        </p>
                      )}
                      {(frameData.note || frameData.walkoverApprovedAt || frameData.walkoverScore) && (
                        <p className="text-xs text-gray-500 mt-1 italic">
                          {frameData.note || (frameData.walkoverApprovedAt ? `Approved at ${new Date(frameData.walkoverApprovedAt).toLocaleString()}` : 'Match awarded by walkover.')}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                    {Array.isArray(frameData) ? frameData.map((frame, idx) => {
                      const isPool = match.gameType === 'pool';
                      const isPooker = match.gameType === 'pooker';
                      const isSnooker = match.gameType === 'snooker';

                      return (
                        <div key={idx} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-100">
                            <span className="text-xs font-black text-[#132F45] uppercase tracking-wider">
                              {gameLabel} {frame.frameNumber || frame.rackNumber || idx + 1}
                            </span>
                            <div className="flex gap-2">
                              {frame.isSevenBallWin && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[9px] font-black rounded uppercase border border-yellow-200">7-Ball Win</span>
                              )}
                              {frame.isBlackFinish && (
                                <span className="px-2 py-0.5 bg-gray-800 text-white text-[9px] font-black rounded uppercase">Black Finish</span>
                              )}
                              {frame.isWhitewash && (
                                <span className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded uppercase tracking-tighter">Whitewash</span>
                              )}
                            </div>
                          </div>
                          <div className="p-4 grid grid-cols-2 gap-8 relative">
                            {/* Score Divider */}
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300 italic">VS</div>

                            {/* Player 1 Details */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">P1 Score</span>
                                <span className="text-lg font-black text-[#132F45]">{frame.player1Score ?? frame.player1Points ?? "-"}</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(frame.player1Break || frame.p1Break) && (
                                  <span className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg border border-blue-100 flex items-center gap-1">
                                    <div className="w-1 h-1 bg-blue-400 rounded-full" />
                                    Break: {frame.player1Break || frame.p1Break}
                                  </span>
                                )}
                                {(isPool || isPooker) && (frame.player1BallsPotted !== undefined || frame.pottedBallsPlayer1 !== undefined) && (
                                  <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-lg border border-emerald-100 flex items-center gap-1">
                                    <div className="w-1 h-1 bg-emerald-400 rounded-full" />
                                    Potted: {frame.player1BallsPotted ?? frame.pottedBallsPlayer1}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Player 2 Details */}
                            <div className="space-y-2 text-right">
                              <div className="flex items-center justify-between flex-row-reverse">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">P2 Score</span>
                                <span className="text-lg font-black text-[#132F45]">{frame.player2Score ?? frame.player2Points ?? "-"}</span>
                              </div>
                              <div className="flex flex-wrap gap-2 justify-end">
                                {(frame.player2Break || frame.p2Break) && (
                                  <span className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg border border-blue-100 flex items-center gap-1 flex-row-reverse">
                                    <div className="w-1 h-1 bg-blue-400 rounded-full" />
                                    Break: {frame.player2Break || frame.p2Break}
                                  </span>
                                )}
                                {(isPool || isPooker) && (frame.player2BallsPotted !== undefined || frame.pottedBallsPlayer2 !== undefined) && (
                                  <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-lg border border-emerald-100 flex items-center gap-1 flex-row-reverse">
                                    <div className="w-1 h-1 bg-emerald-400 rounded-full" />
                                    Potted: {frame.player2BallsPotted ?? frame.pottedBallsPlayer2}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                        <p className="text-sm text-[#132F45] opacity-70 italic">No frame details available for this match.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {!match.frameDetails && (
            <div className="border-t border-[#D1D5DB] pt-4">
              <p className="text-sm text-[#132F45] opacity-70 text-center py-4">
                {match.status === "upcoming"
                  ? "Detailed match information will be available after the match is played."
                  : "Frame/Rack details will be displayed here once available."}
              </p>
            </div>
          )}
          {match.imageUrl && (
            <div className="border-t border-[#D1D5DB] pt-4">
              <h3 className="text-base font-bold text-[#132F45] mb-4 flex items-center gap-2">
                <FaImage className="text-[#132F45]/70" />
                Match Result Image
              </h3>
              <div className="relative group rounded-xl overflow-hidden border border-[#D1D5DB] bg-gray-50">
                <img
                  src={getFullImageUrl(match.imageUrl)}
                  alt="Match Result"
                  className="w-full max-h-[400px] object-contain hover:scale-[1.02] transition-transform duration-300 cursor-zoom-in"
                  onClick={() => window.open(getFullImageUrl(match.imageUrl), '_blank')}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://via.placeholder.com/800x400?text=Image+Load+Error';
                  }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <span className="text-white font-medium px-4 py-2 bg-black/50 rounded-lg backdrop-blur-sm">
                    Click to view full size
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#D1D5DB] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-[#132F45] text-white rounded-lg hover:bg-[#1A3F5C] transition-colors font-medium">
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// EditFixtureModal component
function EditFixtureModal({ fixture, league, advancedSettings = {}, onClose, onUpdate, formatDate }) {
  const { updateFixture } = useContext(LeagueContext);

  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedVenueTable, setSelectedVenueTable] = useState(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);

  const [timeSlots, setTimeSlots] = useState([]);
  const [monthlyAvailability, setMonthlyAvailability] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [fetchingSlots, setFetchingSlots] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load league dates to focus calendar
  useEffect(() => {
    if (league?.leagueStartDate) {
      const startDate = new Date(league.leagueStartDate);
      setCalendarMonth(startDate.getMonth());
      setCalendarYear(startDate.getFullYear());
    }
  }, [league?.leagueStartDate]);

  // Load venues for league
  useEffect(() => {
    const leagueId = fixture.leagueId || league?.id;
    if (leagueId) {
      loadVenues(leagueId);
    }
  }, [fixture.leagueId, league?.id]);

  const loadVenues = async (leagueId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/bookings/venues`, { params: { leagueId } });
      if (response.data.success) {
        const normalizedVenues = (response.data.data || []).map((venue) => {
          const rawTableCount = Number(venue.numberOfTables) || 0;
          const isExternal = Boolean(venue.isExternalVenue);
          const tableCount = rawTableCount > 0 ? rawTableCount : (isExternal ? 1 : 2);
          const tables = Array.isArray(venue.tables) && venue.tables.length > 0
            ? venue.tables
            : (isExternal ? [{ id: `external-${venue.id}-1`, name: 'External Table' }] : []);
          return {
            ...venue,
            numberOfTables: tableCount,
            tables,
          };
        });
        setVenues(normalizedVenues);

        // Pre-select existing venue if it matches
        if (fixture.tableName && fixture.tableName !== 'TBA') {
          const matchedVenue = normalizedVenues.find(v => {
            const vName = v.venueName || v.name || '';
            return fixture.tableName.toLowerCase().includes(vName.toLowerCase());
          });
          if (matchedVenue) {
            setSelectedVenue(matchedVenue);
          }
        }
      }
    } catch (err) {
      setError('Failed to load venues for this league');
      setVenues([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyAvailability = async (venueId, month, year) => {
    try {
      setLoadingAvailability(true);
      const response = await apiClient.get('/bookings/monthly-availability', {
        params: { venueId, month: month + 1, year }
      });
      if (response.data.success) {
        setMonthlyAvailability(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load monthly availability:', err);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const loadTimeSlots = async (venueId, date) => {
    try {
      setFetchingSlots(true);
      setLoading(true);
      setError(null);
      const actualMonth = String(calendarMonth + 1).padStart(2, '0');
      const formattedDate = `${calendarYear}-${actualMonth}-${String(date).padStart(2, '0')}`;
      const response = await apiClient.get(`/bookings/time-slots`, { params: { venueId, date: formattedDate } });
      if (response.data.success) {
        const slots = response.data.data.timeSlots || [];
        setTimeSlots(slots);
      }
    } catch {
      setError('Failed to load time slots');
    } finally {
      setFetchingSlots(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedVenue && calendarMonth !== undefined && calendarYear) {
      loadMonthlyAvailability(selectedVenue.id, calendarMonth, calendarYear);
    }
  }, [selectedVenue, calendarMonth, calendarYear]);

  const handleCalendarPrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleCalendarNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const handleVenueSelect = (venue) => {
    setSelectedVenue(venue);
    setSelectedVenueTable(null);
    setSelectedTimeSlot(null);
    setTimeSlots([]);
    setSelectedDate(null);
  };

  const handleDateSelect = (day) => {
    if (day && !day.disabled) {
      setSelectedDate(day.day);
      setSelectedVenueTable(null);
      setSelectedTimeSlot(null);
      setTimeSlots([]);
      if (selectedVenue) {
        loadTimeSlots(selectedVenue.id, day.day);
      }
    }
  };

  const handleVenueTableSelect = (tableIndex, tableName, tableId = null) => {
    setSelectedVenueTable({ index: tableIndex, name: tableName, id: tableId });
    setSelectedTimeSlot(null);
  };

  const handleTimeSlotSelect = (slot, tableInfo) => {
    setSelectedTimeSlot({
      startTime: slot.startTime,
      endTime: slot.endTime,
      tableNumber: tableInfo.tableNumber,
      displayTime: slot.displayTime || `${slot.startTime} - ${slot.endTime}`
    });
  };

  const getCalendarRange = () => {
    let rangeStartDate = null;
    let rangeEndDate = null;

    if (league?.leagueStartDate) {
      rangeStartDate = new Date(league.leagueStartDate);
      rangeStartDate.setHours(0, 0, 0, 0);
    }
    if (league?.leagueEndDate) {
      rangeEndDate = new Date(league.leagueEndDate);
      rangeEndDate.setHours(0, 0, 0, 0);
    } else if (rangeStartDate) {
      rangeEndDate = new Date(rangeStartDate);
      rangeEndDate.setFullYear(rangeEndDate.getFullYear() + 1);
    }

    return { rangeStartDate, rangeEndDate };
  };

  const generateCalendarDays = () => {
    const days = [];
    const { rangeStartDate, rangeEndDate } = getCalendarRange();

    if (!rangeStartDate || !rangeEndDate) {
      const defaultStart = new Date(calendarYear, calendarMonth, 1);
      const defaultEnd = new Date(calendarYear, calendarMonth + 1, 0);
      const startDay = (defaultStart.getDay() + 6) % 7;
      const daysInMonth = defaultEnd.getDate();

      for (let i = 0; i < startDay; i++) days.push({ day: null, disabled: true });
      for (let i = 1; i <= daysInMonth; i++) days.push({ day: i, disabled: false });

      return days;
    }

    const monthStart = new Date(calendarYear, calendarMonth, 1);
    const monthEnd = new Date(calendarYear, calendarMonth + 1, 0);
    const startDay = (monthStart.getDay() + 6) % 7;
    const daysInMonth = monthEnd.getDate();

    for (let i = 0; i < startDay; i++) days.push({ day: null, disabled: true });

    for (let i = 1; i <= daysInMonth; i++) {
      const year = calendarYear;
      const month = String(calendarMonth + 1).padStart(2, '0');
      const day = String(i).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const currentDate = new Date(calendarYear, calendarMonth, i);
      let isDisabled = currentDate < rangeStartDate || currentDate > rangeEndDate;

      if (selectedVenue) {
        const hasSlots = monthlyAvailability?.[dateStr];
        if (hasSlots !== true) {
          isDisabled = true;
        }
      }

      days.push({
        day: i,
        disabled: isDisabled,
        noSlots: selectedVenue && monthlyAvailability?.[dateStr] === false
      });
    }

    return days;
  };

  const calendarDays = generateCalendarDays();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedVenue || !selectedDate || !selectedVenueTable || !selectedTimeSlot) {
      setError("Please complete all 4 scheduling steps before saving.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const leagueId = fixture.leagueId || fixture.additionalData?.leagueId || league?.id;
      const fixtureId = fixture.id || fixture.fixtureId;

      if (!leagueId) {
        throw new Error("Missing league ID");
      }

      const actualMonth = String(calendarMonth + 1).padStart(2, '0');
      const formattedDate = `${calendarYear}-${actualMonth}-${String(selectedDate).padStart(2, '0')}`;
      let startTime = selectedTimeSlot.startTime || "";
      if (startTime.split(':').length === 2) {
        startTime = `${startTime}:00`;
      }
      const dateTimeStr = `${formattedDate}T${startTime}`;
      const localScheduledDate = new Date(dateTimeStr);

      let existingResultData = {};
      if (fixture.resultData) {
        try {
          existingResultData = typeof fixture.resultData === 'string' ? JSON.parse(fixture.resultData) : fixture.resultData;
        } catch (e) {}
      }

      const updatePayload = {
        scheduledDate: localScheduledDate.toISOString(),
        startTime: selectedTimeSlot.startTime,
        endTime: selectedTimeSlot.endTime,
        resultData: {
          ...existingResultData,
          isOrganizerScheduled: true,
          venueId: selectedVenue.id,
          tableNumber: selectedVenueTable.index || 1,
          venueTableId: selectedVenueTable.id,
          venueTableName: selectedVenueTable.name,
          venueName: selectedVenue.venueName || selectedVenue.name,
          tableName: `${selectedVenue.venueName || selectedVenue.name} (${selectedVenueTable.name})`
        }
      };

      const result = await updateFixture(leagueId, fixtureId, updatePayload);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          if (onUpdate) onUpdate();
          onClose();
        }, 1500);
      } else {
        setError(result.error || "Failed to update fixture");
      }
    } catch (err) {
      console.error("[EditFixtureModal] Error saving fixture:", err);
      setError(err.message || "Failed to save fixture");
    } finally {
      setSubmitting(false);
    }
  };

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
        className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-orange-600 text-white px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-xl font-bold uppercase tracking-tight">Reschedule Match</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg">✕</button>
        </div>

        {success && (
          <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium flex items-center gap-2">
            <FaCheck /> Match rescheduled successfully!
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
            ✕ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {/* Match Info & Current Schedule */}
          <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200/60">
            <h3 className="text-xs font-black text-[#132F45] uppercase tracking-wider mb-3">Match Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Home Player</p>
                <p className="text-sm font-black text-[#132F45] uppercase tracking-tight">{fixture.homeTeam}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Away Player</p>
                <p className="text-sm font-black text-[#132F45] uppercase tracking-tight">{fixture.awayTeam}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Current Schedule</p>
                <p className="text-xs font-black text-orange-600 uppercase tracking-tight">
                  {fixture.date && fixture.date !== 'TBA' ? `${formatDate(fixture.date).replace(/ \d{4}$/, '')} @ ${fixture.startTime || ''}` : 'Not scheduled (TBA)'}
                </p>
                <p className="text-[10px] font-bold text-gray-400 mt-0.5">{fixture.tableName && fixture.tableName !== 'TBA' ? fixture.tableName : ''}</p>
              </div>
            </div>
          </div>

          <div className="space-y-10">
            {/* Step 1: Venue Selection */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3">
                <div className="w-1.5 h-3 bg-orange-500 rounded-full" /> STEP 1: SELECT VENUE
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {venues.length === 0 && !loading && (
                  <div className="col-span-full text-gray-400 text-center text-sm py-8 bg-[#FAFAFA] rounded-xl border border-dashed border-gray-200 uppercase font-black tracking-widest">
                    No venues available for this league.
                  </div>
                )}
                {venues.map((venue) => (
                  <button
                    type="button"
                    key={venue.id}
                    onClick={() => handleVenueSelect(venue)}
                    className={`p-4 rounded-xl border transition-all duration-300 text-left relative group overflow-hidden ${
                      selectedVenue?.id === venue.id
                        ? 'border-orange-500 bg-orange-50/20 text-[#132F45] shadow-lg shadow-orange-500/5'
                        : 'border-gray-100 bg-white hover:border-orange-200 text-[#132F45] shadow-sm hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-3 relative z-10">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedVenue?.id === venue.id ? 'bg-orange-500' : 'bg-gray-50'}`}>
                        <FaMapMarkerAlt className={`text-xs ${selectedVenue?.id === venue.id ? 'text-white' : 'text-orange-500'}`} />
                      </div>
                      <div>
                        <p className="font-black text-xs uppercase tracking-tight">{venue.venueName || venue.name}</p>
                        <p className={`text-[8.5px] font-black uppercase tracking-widest mt-0.5 ${selectedVenue?.id === venue.id ? 'text-orange-600' : 'text-gray-400'}`}>
                          {venue.numberOfTables} Stations
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 & 3: Calendar and Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Calendar (Step 2) */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3">
                  <div className="w-1.5 h-3 bg-orange-500 rounded-full" /> STEP 2: SELECT DATE
                </h3>
                
                <div className="bg-white border border-gray-200/60 rounded-2xl p-4 shadow-sm max-w-[280px] mx-auto w-full">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      type="button"
                      onClick={handleCalendarPrevMonth}
                      className="w-7 h-7 bg-[#FAFAFA] border border-gray-100 rounded-lg flex items-center justify-center text-[#132F45] hover:bg-orange-500 hover:text-white transition-all shadow-sm"
                    >
                      <FaChevronRight className="rotate-180 text-[8px]" />
                    </button>
                    <div className="text-center">
                      <h4 className="text-xs font-black text-[#132F45] uppercase tracking-tighter leading-none">
                        {new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={handleCalendarNextMonth}
                      className="w-7 h-7 bg-[#FAFAFA] border border-gray-100 rounded-lg flex items-center justify-center text-[#132F45] hover:bg-orange-500 hover:text-white transition-all shadow-sm"
                    >
                      <FaChevronRight className="text-[8px]" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                      <div key={idx} className="text-center text-[7.5px] font-black text-gray-300 uppercase py-1">
                        {day}
                      </div>
                    ))}
                    {calendarDays.map((day, index) => (
                      <div
                        key={index}
                        onClick={() => handleDateSelect(day)}
                        className={`aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all relative ${
                          day.day === null
                            ? 'bg-transparent cursor-default pointer-events-none'
                            : day.disabled
                              ? 'bg-gray-50/50 text-gray-200 cursor-not-allowed opacity-30'
                              : selectedDate === day.day
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20 scale-105 ring-1 ring-orange-500/30'
                                : 'bg-white border border-gray-100 hover:border-orange-500/30 text-[#132F45]'
                        }`}
                      >
                        <span className="text-[9px] font-black">{day.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table (Step 3) */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3">
                  <div className="w-1.5 h-3 bg-orange-500 rounded-full" /> STEP 3: SELECT TABLE
                </h3>

                {selectedVenue ? (
                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const realTables = Array.isArray(selectedVenue.tables) && selectedVenue.tables.length > 0
                        ? selectedVenue.tables
                        : Array.from({
                            length: Math.max(1, Number(selectedVenue.numberOfTables) || 2)
                          }).map((_, i) => ({
                            tableNumber: i + 1,
                            name: `Table ${i + 1}`
                          }));

                      return realTables.map((table, i) => {
                        const tableIndex = typeof table === 'object' ? (table.tableNumber || i + 1) : (i + 1);
                        const tableName = typeof table === 'string' ? table : (table.name || table.label || `Table ${tableIndex}`);
                        const tableId = typeof table === 'object' ? table.id : null;
                        const isSelected = selectedVenueTable?.index === tableIndex;

                        const isTableAvailable = timeSlots.length === 0 || timeSlots.some((slot) =>
                          slot.tables?.some(
                            (t) => Number(t.tableNumber) === Number(tableIndex) && t.status === 'available'
                          )
                        );

                        const hasNoAvailableSlots = selectedDate && !loading && timeSlots.length > 0 && !isTableAvailable;

                        return (
                          <button
                            type="button"
                            key={tableIndex}
                            onClick={() => !hasNoAvailableSlots && handleVenueTableSelect(tableIndex, tableName, tableId)}
                            disabled={hasNoAvailableSlots}
                            className={`p-4 rounded-xl border transition-all duration-300 text-center ${
                              hasNoAvailableSlots
                                ? 'bg-gray-50 border-transparent opacity-30 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
                                  : 'bg-white border-gray-100 text-[#132F45] shadow-sm hover:border-orange-500/20'
                            }`}
                          >
                            <p className="font-black text-[9px] uppercase tracking-widest">{tableName}</p>
                          </button>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Select a venue first.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Step 4: Time Slot Selection */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3">
                <div className="w-1.5 h-3 bg-orange-500 rounded-full" /> STEP 4: SELECT TIME
              </h3>

              <div className="bg-white border border-gray-200/60 rounded-2xl p-6 shadow-sm">
                {!selectedDate || !selectedVenue || !selectedVenueTable ? (
                  <div className="py-8 text-center">
                    <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
                      <FaClock size={12} />
                    </div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Select venue, date, and table to see available times.</p>
                  </div>
                ) : loading ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-gray-100 border-t-orange-500 animate-spin" />
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Loading times...</span>
                  </div>
                ) : timeSlots.length === 0 ? (
                  <div className="py-8 text-center flex flex-col items-center gap-2">
                    <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">No available times for this date/table.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {timeSlots.map((slot, idx) => {
                      const tableInfo = slot.tables.find(t => t.tableNumber === selectedVenueTable.index);
                      if (!tableInfo) return null;
                      const isSelected = selectedTimeSlot?.startTime === slot.startTime;
                      const isAvailable = tableInfo.status === 'available';

                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => handleTimeSlotSelect(slot, tableInfo)}
                          disabled={!isAvailable}
                          className={`p-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 shadow-sm ${
                            isSelected
                              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                              : isAvailable
                                ? 'bg-white border border-gray-200 text-[#132F45] hover:border-orange-500'
                                : 'bg-gray-50 text-gray-300 border-transparent cursor-not-allowed opacity-40'
                          }`}
                        >
                          {slot.displayTime}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-[#D1D5DB] pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#D1D5DB] text-[#132F45] rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedVenue || !selectedDate || !selectedVenueTable || !selectedTimeSlot}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <FaSpinner className="animate-spin" />
                  Saving Changes...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// EditResultModal component
function EditResultModal({ fixture, advancedSettings = {}, onClose, onUpdate }) {
  const { recordMatchResult } = useContext(LeagueContext);
  const isSnooker = fixture.gameType === 'snooker';
  const isPooker = fixture.gameType === 'pooker';
  const isPool = fixture.gameType === 'pool';

  // Get matchResult from transformed data - check multiple locations for compatibility
  const mr = fixture.matchResult || fixture.additionalData?.matchResult || {};
  const [formData, setFormData] = useState({
    player1Frames: mr.player1Frames ?? fixture.additionalData?.player1Frames ?? fixture.player1Frames ?? "",
    player2Frames: mr.player2Frames ?? fixture.additionalData?.player2Frames ?? fixture.player2Frames ?? "",
    player1RackWins: mr.player1RackWins ?? fixture.additionalData?.player1RackWins ?? fixture.player1RackWins ?? "",
    player2RackWins: mr.player2RackWins ?? fixture.additionalData?.player2RackWins ?? fixture.player2RackWins ?? "",
    player1Handicap: mr.player1Handicap ?? fixture.additionalData?.resultData?.handicaps?.player1 ?? 0,
    player2Handicap: mr.player2Handicap ?? fixture.additionalData?.resultData?.handicaps?.player2 ?? 0,
    frameDetails: (() => {
      // Get frameDetails from multiple possible locations
      let details = fixture.frameDetails || mr.pookerFrameDetails || mr.snookerFrameDetails || mr.poolRackDetails || [];
      if (typeof details === 'string') {
        try { details = JSON.parse(details); } catch (e) { details = []; }
      }
      return Array.isArray(details) ? details : [];
    })(),
    tieBreakWinnerId: mr.resultData?.tieBreakWinnerId || "",
    tieBreakMethod: mr.resultData?.tieBreakMethod || "deciding_frame"
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log("[EditResultModal] Saving match result with data:", formData);
      const leagueId = fixture.leagueId || fixture.additionalData?.leagueId;
      const fixtureId = fixture.id || fixture.fixtureId;

      if (!leagueId) {
        throw new Error("Missing league ID");
      }

      // Record Result
      const resultPayload = {
        player1Frames: formData.player1Frames !== "" ? parseInt(formData.player1Frames, 10) : undefined,
        player2Frames: formData.player2Frames !== "" ? parseInt(formData.player2Frames, 10) : undefined,
        player1RackWins: formData.player1RackWins !== "" ? parseInt(formData.player1RackWins, 10) : undefined,
        player2RackWins: formData.player2RackWins !== "" ? parseInt(formData.player2RackWins, 10) : undefined,
        player1Handicap: parseInt(formData.player1Handicap, 10) || 0,
        player2Handicap: parseInt(formData.player2Handicap, 10) || 0,
        frameDetails: formData.frameDetails,
        tieBreakWinnerId: formData.tieBreakWinnerId || undefined,
        tieBreakMethod: formData.tieBreakMethod || undefined
      };

      // Ensure frameDetails are sent in the correct field for the backend
      if (isSnooker) resultPayload.snookerFrameDetails = formData.frameDetails;
      if (isPooker) resultPayload.pookerFrameDetails = formData.frameDetails;
      if (isPool) resultPayload.poolRackDetails = formData.frameDetails;

      const result = await recordMatchResult(leagueId, fixtureId, resultPayload);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          if (onUpdate) onUpdate();
          onClose();
        }, 1500);
      } else {
        setError(result.error || "Failed to record result");
      }
    } catch (err) {
      console.error("[EditResultModal] Error saving match result:", err);
      setError(err.message || "Failed to save result");
    } finally {
      setLoading(false);
    }
  };

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
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-emerald-600 text-white px-6 py-4 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">
              {fixture.status === 'completed' ? "Edit Match Result" : "Record Match Result"}
            </h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg">✕</button>
        </div>

        {success && (
          <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium flex items-center gap-2">
            <FaCheck /> Match result recorded successfully!
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
            ✕ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Match Info */}
          <div className="bg-gray-50 p-4 rounded-lg border border-[#D1D5DB]">
            <h3 className="text-sm font-bold text-[#132F45] mb-3">Match Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#132F45] opacity-70 font-medium mb-1">Home Team</p>
                <p className="text-sm font-bold text-[#132F45]">{fixture.homeTeam}</p>
              </div>
              <div>
                <p className="text-xs text-[#132F45] opacity-70 font-medium mb-1">Away Team</p>
                <p className="text-sm font-bold text-[#132F45]">{fixture.awayTeam}</p>
              </div>
            </div>
          </div>

          {/* Dynamic Result Section based on Sport */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 rounded text-emerald-600"><FaTrophy size={14} /></span>
                {fixture.gameType.toUpperCase()} Result Details
              </h3>
            </div>

            {/* Overall Scores */}
            <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">{fixture.homeTeam} (P1)</label>
                <input
                  type="number"
                  name={isPool ? "player1RackWins" : "player1Frames"}
                  value={isPool ? formData.player1RackWins : formData.player1Frames}
                  onChange={handleInputChange}
                  className="w-full text-2xl font-black px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="0"
                />
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Handicap</span>
                  <input
                    type="number"
                    name="player1Handicap"
                    value={formData.player1Handicap}
                    onChange={handleInputChange}
                    className="flex-1 bg-transparent text-sm font-bold text-gray-700 outline-none"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">{fixture.awayTeam} (P2)</label>
                <input
                  type="number"
                  name={isPool ? "player2RackWins" : "player2Frames"}
                  value={isPool ? formData.player2RackWins : formData.player2Frames}
                  onChange={handleInputChange}
                  className="w-full text-2xl font-black px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="0"
                />
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Handicap</span>
                  <input
                    type="number"
                    name="player2Handicap"
                    value={formData.player2Handicap}
                    onChange={handleInputChange}
                    className="flex-1 bg-transparent text-sm font-bold text-gray-700 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Tie-breaker Resolution Section */}
            {(() => {
              const s1 = parseInt(isPool ? formData.player1RackWins : formData.player1Frames) || 0;
              const s2 = parseInt(isPool ? formData.player2RackWins : formData.player2Frames) || 0;
              const isTie = s1 === s2 && (isPool ? formData.player1RackWins !== "" : formData.player1Frames !== "");
              const allowDraw = fixture.additionalData?.league?.matchRules?.allowDraw !== false;

              if (!isTie || allowDraw) return null;

              return (
                <div className="bg-amber-50 p-5 rounded-2xl border-2 border-amber-100 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center gap-2 text-amber-700">
                    <FaTrophy size={16} />
                    <h4 className="text-xs font-black uppercase tracking-widest">Tie-breaker Resolution Required</h4>
                  </div>
                  <p className="text-[11px] text-amber-600 font-bold leading-relaxed">
                    This league does not allow draws. Please select the tie-break winner and the resolution method used.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-amber-700/60 uppercase tracking-wider">Select Winner</label>
                      <select
                        name="tieBreakWinnerId"
                        value={formData.tieBreakWinnerId}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl text-sm font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 outline-none"
                      >
                        <option value="">-- Select Winner --</option>
                        <option value={fixture.additionalData?.player1Id}>{fixture.homeTeam}</option>
                        <option value={fixture.additionalData?.player2Id}>{fixture.awayTeam}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-amber-700/60 uppercase tracking-wider">Resolution Method</label>
                      <select
                        name="tieBreakMethod"
                        value={formData.tieBreakMethod}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl text-sm font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 outline-none"
                      >
                        <option value="deciding_frame">Deciding Frame/Rack</option>
                        <option value="highest_break">Highest Break</option>
                        <option value="black_ball">Black Ball Shootout</option>
                        <option value="coin_toss">Coin Toss / Luck</option>
                        <option value="admin_decision">Admin Decision</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Granular Frame Details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {isPool ? 'Rack' : 'Frame'}-by-{isPool ? 'Rack' : 'Frame'} Breakdown
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      frameDetails: [...prev.frameDetails, {
                        frameNumber: prev.frameDetails.length + 1,
                        player1Score: 0,
                        player2Score: 0,
                        player1Break: 0,
                        player2Break: 0,
                        player1BallsPotted: isPool ? 7 : (isPooker ? 15 : 0),
                        player2BallsPotted: isPool ? 0 : 0,
                        isSevenBallWin: false,
                        isBlackFinish: false,
                        isWhitewash: false
                      }]
                    }))
                  }}
                  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  + Add {isPool ? 'Rack' : 'Frame'}
                </button>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                {formData.frameDetails.map((item, idx) => (
                  <div key={idx} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        {isPool ? 'Rack' : 'Frame'} {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const newDetails = formData.frameDetails.filter((_, i) => i !== idx);
                          setFormData(p => ({ ...p, frameDetails: newDetails }));
                        }}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <FaTimes size={10} />
                      </button>
                    </div>

                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-4 relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] font-black text-gray-200">VS</div>

                        {/* Player 1 Inputs */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-gray-400 uppercase w-8">Score</span>
                            <input
                              type="number"
                              value={item.player1Score}
                              onChange={(e) => {
                                const newDetails = [...formData.frameDetails];
                                newDetails[idx] = { ...newDetails[idx], player1Score: parseInt(e.target.value) || 0 };
                                setFormData(p => ({ ...p, frameDetails: newDetails }));
                              }}
                              className="flex-1 text-center py-1 bg-blue-50 border border-transparent rounded-lg text-sm font-black text-blue-700 outline-none focus:bg-white focus:border-blue-500"
                              placeholder={fixture.homeTeam || "P1"}
                            />
                          </div>
                          {(isSnooker || isPooker) && (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-gray-400 uppercase w-8">Break</span>
                              <input
                                type="number"
                                value={item.player1Break || 0}
                                onChange={(e) => {
                                  const newDetails = [...formData.frameDetails];
                                  newDetails[idx] = { ...newDetails[idx], player1Break: parseInt(e.target.value) || 0 };
                                  setFormData(p => ({ ...p, frameDetails: newDetails }));
                                }}
                                className="flex-1 text-center py-1 bg-gray-50 border border-transparent rounded-lg text-xs font-bold text-[#132F45] outline-none focus:bg-white focus:border-orange-500"
                                placeholder="Break"
                              />
                            </div>
                          )}
                          {(isPool || isPooker) && (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-gray-400 uppercase w-8">Potted</span>
                              <input
                                type="number"
                                value={item.player1BallsPotted || 0}
                                onChange={(e) => {
                                  const newDetails = [...formData.frameDetails];
                                  newDetails[idx] = { ...newDetails[idx], player1BallsPotted: parseInt(e.target.value) || 0 };
                                  setFormData(p => ({ ...p, frameDetails: newDetails }));
                                }}
                                className="flex-1 text-center py-1 bg-emerald-50 border border-transparent rounded-lg text-xs font-bold text-emerald-700 outline-none focus:bg-white focus:border-emerald-500"
                                placeholder="Balls"
                              />
                            </div>
                          )}
                        </div>

                        {/* Player 2 Inputs */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-row-reverse">
                            <span className="text-[9px] font-bold text-gray-400 uppercase w-8 text-right">Score</span>
                            <input
                              type="number"
                              value={item.player2Score}
                              onChange={(e) => {
                                const newDetails = [...formData.frameDetails];
                                newDetails[idx] = { ...newDetails[idx], player2Score: parseInt(e.target.value) || 0 };
                                setFormData(p => ({ ...p, frameDetails: newDetails }));
                              }}
                              className="flex-1 text-center py-1 bg-red-50 border border-transparent rounded-lg text-sm font-black text-red-700 outline-none focus:bg-white focus:border-red-500"
                              placeholder={fixture.awayTeam || "P2"}
                            />
                          </div>
                          {(isSnooker || isPooker) && (
                            <div className="flex items-center gap-2 flex-row-reverse">
                              <span className="text-[9px] font-bold text-gray-400 uppercase w-8 text-right">Break</span>
                              <input
                                type="number"
                                value={item.player2Break || 0}
                                onChange={(e) => {
                                  const newDetails = [...formData.frameDetails];
                                  newDetails[idx] = { ...newDetails[idx], player2Break: parseInt(e.target.value) || 0 };
                                  setFormData(p => ({ ...p, frameDetails: newDetails }));
                                }}
                                className="flex-1 text-center py-1 bg-gray-50 border border-transparent rounded-lg text-xs font-bold text-[#132F45] outline-none focus:bg-white focus:border-orange-500"
                                placeholder="Break"
                              />
                            </div>
                          )}
                          {(isPool || isPooker) && (
                            <div className="flex items-center gap-2 flex-row-reverse">
                              <span className="text-[9px] font-bold text-gray-400 uppercase w-8 text-right">Potted</span>
                              <input
                                type="number"
                                value={item.player2BallsPotted || 0}
                                onChange={(e) => {
                                  const newDetails = [...formData.frameDetails];
                                  newDetails[idx] = { ...newDetails[idx], player2BallsPotted: parseInt(e.target.value) || 0 };
                                  setFormData(p => ({ ...p, frameDetails: newDetails }));
                                }}
                                className="flex-1 text-center py-1 bg-emerald-50 border border-transparent rounded-lg text-xs font-bold text-emerald-700 outline-none focus:bg-white focus:border-emerald-500"
                                placeholder="Balls"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Special Win Toggles (Pool/Pooker) */}
                      {(isPool || isPooker) && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50">
                          <button
                            type="button"
                            onClick={() => {
                              const newDetails = [...formData.frameDetails];
                              newDetails[idx].isSevenBallWin = !newDetails[idx].isSevenBallWin;
                              setFormData(p => ({ ...p, frameDetails: newDetails }));
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all border ${item.isSevenBallWin ? 'bg-yellow-500 text-white border-yellow-600 shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100'
                              }`}
                          >
                            7-Ball Win
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newDetails = [...formData.frameDetails];
                              newDetails[idx].isBlackFinish = !newDetails[idx].isBlackFinish;
                              setFormData(p => ({ ...p, frameDetails: newDetails }));
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all border ${item.isBlackFinish ? 'bg-gray-900 text-white border-black shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100'
                              }`}
                          >
                            Black Finish
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newDetails = [...formData.frameDetails];
                              newDetails[idx].isWhitewash = !newDetails[idx].isWhitewash;
                              setFormData(p => ({ ...p, frameDetails: newDetails }));
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all border ${item.isWhitewash ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100'
                              }`}
                          >
                            Whitewash
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-[#D1D5DB] pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#D1D5DB] text-[#132F45] rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <FaSpinner className="animate-spin" />
                  Saving Result...
                </>
              ) : (
                "Save Result"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// WalkoverModal component
function WalkoverModal({ fixture, onClose, onUpdate }) {
  const { recordWalkover } = useContext(LeagueContext);
  const [winnerPlayerId, setWinnerPlayerId] = useState("");
  const [customScore, setCustomScore] = useState("");
  const [useCustomScore, setUseCustomScore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Fallback to match directly, as not all properties might be inside additionalData
  // Robust ID detection from both root object (transformed match) and additionalData
  const p1Id = fixture.player1?.id || fixture.player1Id || fixture.additionalData?.player1?.id || fixture.additionalData?.player1Id;
  const p2Id = fixture.player2?.id || fixture.player2Id || fixture.additionalData?.player2?.id || fixture.additionalData?.player2Id;

  // Get league walkover rule configuration
  const leagueMatchRules = fixture.additionalData?.matchRules;
  let matchRulesObj = leagueMatchRules;
  if (typeof matchRulesObj === 'string') {
    try { matchRulesObj = JSON.parse(matchRulesObj); } catch (e) { matchRulesObj = {}; }
  }
  const walkoverRule = matchRulesObj?.walkover?.rule || 'autoBestOf';
  const isAdminMode = walkoverRule === 'admin';

  const bestOfVal = matchRulesObj?.bestOf === 'custom' ? matchRulesObj?.customFrames : (matchRulesObj?.bestOf || 3);

  // Calculate dynamic walkover score based on match rules
  const getWalkoverScore = () => {
    // Priority: matchRules.bestOf -> league.matchFormat -> division.numberOfFrames
    let totalFrames = parseInt(bestOfVal) || 3;

    if (!matchRulesObj?.bestOf) {
      // Try to parse from matchFormat string (e.g., "Best of 5")
      const matchFormatStr = fixture.additionalData?.matchFormat || "";
      const m = matchFormatStr.match(/\d+/);
      if (m) {
        totalFrames = parseInt(m[0]);
      } else if (fixture.division?.numberOfFrames) {
        totalFrames = fixture.division.numberOfFrames;
      } else if (fixture.division?.raceLength) {
        totalFrames = fixture.division.raceLength * 2 - 1;
      }
    }
    return totalFrames;
  };

  const dynamicScore = Math.ceil(getWalkoverScore() / 2);

  useEffect(() => {
    // Default to custom score input when admin mode is enabled, otherwise use auto.
    setUseCustomScore(isAdminMode);
  }, [isAdminMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!winnerPlayerId) {
      setError("Please select the winning player.");
      return;
    }

    // If admin mode, validate custom score
    if (isAdminMode) {
      if (!customScore.trim()) {
        setError("Please enter a custom score (format: X–Y or X-Y).");
        return;
      }
      // Validate score format: X-Y or X–Y
      if (!/^[0-9]+[–\-][0-9]+$/.test(customScore)) {
        setError("Invalid score format. Use format like '3-0' or '4-2'.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const leagueId = fixture.leagueId || fixture.additionalData?.leagueId;
      const fixtureId = fixture.id || fixture.fixtureId;

      if (!leagueId) throw new Error("Missing league ID");

      const payload = { winnerPlayerId };
      if (useCustomScore && customScore) {
        payload.customScore = customScore.trim();
      }

      const result = await recordWalkover(leagueId, fixtureId, payload);

      if (result.success) {
        if (onUpdate) onUpdate();
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(result.error || "Failed to record walkover");
      }
    } catch (err) {
      console.error("[WalkoverModal] Error recording walkover:", err);
      // Try to parse the error message if it's an API Error object structure
      const msg = err.message || "Failed to record walkover";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

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
        className="bg-white rounded-xl max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-red-600 text-white px-6 py-4 flex justify-between items-center rounded-t-xl">
          <h2 className="text-xl font-bold flex items-center gap-2">
            Mark Walkover (No-Show)
          </h2>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg">✕</button>
        </div>

        {success && (
          <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
            ✓ Walkover recorded successfully!
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
            ✕ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-red-50 border border-red-100 p-4 rounded-lg">
            <p className="text-sm text-red-800">
              Recording a walkover will immediately end this match and award default points to the player present according to your league rules. <strong>This action cannot be easily undone.</strong>
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-[#132F45] mb-3">
              Who is the winner (the player present)?
            </label>
            <div className="space-y-3">
              <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${String(winnerPlayerId) === String(p1Id) ? 'border-red-600 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="winnerPlayerId"
                  value={String(p1Id || "")}
                  checked={String(winnerPlayerId) === String(p1Id)}
                  onChange={(e) => setWinnerPlayerId(e.target.value)}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-600"
                />
                <span className="ml-3 font-semibold text-[#132F45]">{fixture.homeTeam}</span>
              </label>

              <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${String(winnerPlayerId) === String(p2Id) ? 'border-red-600 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="winnerPlayerId"
                  value={String(p2Id || "")}
                  checked={String(winnerPlayerId) === String(p2Id)}
                  onChange={(e) => setWinnerPlayerId(e.target.value)}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-600"
                />
                <span className="ml-3 font-semibold text-[#132F45]">{fixture.awayTeam}</span>
              </label>
            </div>
          </div>

          <div className="border-t border-[#D1D5DB] pt-6">
            <label className="block text-sm font-bold text-[#132F45] mb-3">
              Walkover Result Type
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="walkoverMode"
                  value="auto"
                  checked={!useCustomScore}
                  onChange={() => setUseCustomScore(false)}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-600"
                />
                <span className="text-sm">Best of {bestOfVal} ({dynamicScore}–0)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="walkoverMode"
                  value="custom"
                  checked={useCustomScore}
                  onChange={() => setUseCustomScore(true)}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-600"
                />
                <span className="text-sm">Custom Score</span>
              </label>
            </div>

            {useCustomScore ? (
              <div className="mt-4">
                <p className="text-xs text-gray-600 mb-2">
                  Enter the score as "Winner–Loser" (e.g., 3-0, 4-2). This will override the default walkover score.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customScore}
                    onChange={(e) => setCustomScore(e.target.value)}
                    placeholder="e.g., 3–0"
                    className="flex-1 px-4 py-2 border border-[#D1D5DB] rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 text-[#132F45]"
                  />
                  <span className="text-xs text-gray-500 font-medium">format: X–Y</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 bg-blue-50 border border-blue-100 p-3 rounded-lg flex items-start gap-3">
                <div className="mt-0.5 p-1.5 bg-blue-100 rounded-full text-blue-600">
                  <FaCheck size={10} />
                </div>
                <div>
                  <p className="text-xs text-blue-800 leading-relaxed font-medium">
                    <strong>Best Of Mode:</strong> Using the league rule for walkovers. The result will be recorded as <strong>{dynamicScore}–0</strong> in favor of <strong>{String(winnerPlayerId) === String(p1Id) ? fixture.homeTeam : fixture.awayTeam}</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[#D1D5DB] pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#D1D5DB] text-[#132F45] rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !winnerPlayerId || (isAdminMode && !customScore)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <FaSpinner className="animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Walkover"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}