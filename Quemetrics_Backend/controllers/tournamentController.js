const { Op, QueryTypes } = require("sequelize");
const PDFDocument = require("pdfkit");
const {
  Tournament,
  Organization,
  TournamentFormat,
  TournamentScoringRules,
  TournamentParticipant,
  TournamentMatch,
  TournamentRound,
  TournamentInvitation,
  TournamentGroup,
  Player,
  PlayerRankingProfile,
  RankingPointsHistory,
  User,
  AuditLog,
  Club,
  ClubMember,
  ClubVenue,
  VenueOwner,
  VenueRequest,
  Booking,
  Fixture,
} = require("../models");
const sequelize = require("../config/db");
const {
  BracketGenerator,
  ScoringEngine,
  RankingEngine,
  WithdrawalHandler,
  RegistrationManager,
} = require("./tournamentManager");
const { sendTournamentInvitation, sendTournamentVenueRequestEmail } = require("../utils/email");
const { v4: uuidv4 } = require("uuid");
const FixtureRegenerationService = require("../services/FixtureRegenerationService");
const { getRegistrationOpenStateUTC } = require("../utils/registrationWindow");
const TournamentSchedulingService = require("../services/TournamentSchedulingService");
const { resolvePlayerProfile } = require("./playerController");
const { validateSeedingConfig } = require("../utils/seedingValidator");
const { validateSeedingByeCompatibility, getSeedingByeError } = require("../utils/seedingCompatibilityValidator");
const rankingPresetService = require("../services/rankingPresetService");
const RankingSnapshotService = require("../services/RankingSnapshotService");

/**
 * Get default standings display configuration based on sport
 */
function getDefaultStandingsDisplay(sport) {
  const baseColumns = {
    matchesPlayed: true,
    wins: true,
    losses: true,
    draws: true,
    framesWon: true,
    framesConceded: true,
    frameDifference: true,
    whitewashes: true,
    highestBreak: true,
    winPercentage: true,
    streak: true,
    points: true,
  };

  const sportSpecificColumns = {
    snooker: {
      ...baseColumns,
      breaks50Plus: true,
      breaks100Plus: true,
    },
    pool: {
      ...baseColumns,
      ballsPotted: true,
      ballsConceded: true,
      sevenBallWins: true,
    },
    pooker: {
      ...baseColumns,
      ballsPotted: true,
      blackFinishes: true,
      whitewashes: true,
    },
    poker: {
      matchesPlayed: true,
      wins: true,
      losses: true,
      points: true,
      winPercentage: true,
      streak: true,
    },
  };

  return {
    columns: sportSpecificColumns[sport] || baseColumns,
  };
}

/** Parse JSON column that may be string or object (future-proof if matchRules is added to DB). */
function parseTournamentJsonField(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeStandingsDisplayConfig(rawConfig, sport) {
  const fallback = getDefaultStandingsDisplay(sport);
  if (rawConfig == null) return fallback;

  let parsed = rawConfig;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return fallback;
    }
  }

  if (Array.isArray(parsed)) {
    return {
      columns: [...new Set(parsed.filter((col) => typeof col === "string" && col.trim() !== ""))],
    };
  }

  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.columns)) {
      return {
        ...parsed,
        columns: [...new Set(parsed.columns.filter((col) => typeof col === "string" && col.trim() !== ""))],
      };
    }

    if (parsed.columns && typeof parsed.columns === "object") {
      return {
        ...parsed,
        columns: parsed.columns,
      };
    }

    const values = Object.values(parsed);
    const looksLikeColumnMap = values.length > 0 && values.every((val) => typeof val === "boolean");
    if (looksLikeColumnMap) {
      return { columns: parsed };
    }
  }

  return fallback;
}

/**
 * Player-submitted results wait for opponent confirm/dispute unless explicitly set to immediate.
 * (Sequelize may not expose matchRules until column exists; default is opponent confirmation.)
 */
function tournamentRequiresOpponentConfirmation(tournament, { submittedByAdmin, isWalkover }) {
  if (submittedByAdmin || isWalkover) return false;
  const matchRules = parseTournamentJsonField(tournament.matchRules);
  if (matchRules?.reporting === "bothConfirm") return true;
  if (matchRules?.reporting === "singleReporter" || matchRules?.reporting === "immediate") {
    return false;
  }
  const privacy = parseTournamentJsonField(tournament.privacySettings);
  if (privacy?.matchResultReporting === "immediate") return false;
  return true;
}

/**
 * Venue approval gate:
 * - 'pending'  => tournament is not runnable / players can't register
 * - 'rejected' => blocked as well (organizer must pick another venue)
 * - 'none'/'approved'/undefined => allowed (backward compatible for older tournaments)
 */
function isVenueApprovalReady(tournament) {
  const state = tournament?.venueRequestStatus;
  if (!state || state === "none" || state === "approved") return true;
  return false;
}

const VALID_LATE_REGISTRATION_MODES = new Set([
  "disabled",
  "allow_before_fixture",
  "allow_with_regeneration",
  "allow_with_qualifier",
  "allow_with_waitlist",
]);

function toBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

/**
 * Keep late-registration mode consistent for legacy/new payloads.
 * If late registration is enabled without an explicit mode, default to regeneration mode.
 */
function normalizeLateRegistrationConfig(input) {
  const allowLateRegistration = toBoolean(input?.allowLateRegistration);
  const rawMode = String(input?.lateRegistrationMode || "").trim();

  if (!allowLateRegistration) {
    return {
      allowLateRegistration: false,
      lateRegistrationMode: "disabled",
      lateRegistrationDeadline: null,
    };
  }

  const effectiveMode = VALID_LATE_REGISTRATION_MODES.has(rawMode) && rawMode !== "disabled"
    ? rawMode
    : "allow_with_regeneration";

  return {
    allowLateRegistration: true,
    lateRegistrationMode: effectiveMode,
    lateRegistrationDeadline: input?.lateRegistrationDeadline || null,
  };
}

/**
 * Check if seeding can be modified for a tournament
 * Seeding cannot be modified once bracket is generated
 * @param {Object} tournament - Tournament instance
 * @returns {boolean} True if seeding can be modified, False if locked
 */
function canModifySeeding(tournament) {
  if (!tournament) return true;
  const bracketStatus = tournament.bracketStatus || "not_generated";
  // Seeding can only be modified before bracket generation
  return bracketStatus === "not_generated";
}

function parseValidDateOrNull(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveTournamentDeadline(tournament) {
  return parseValidDateOrNull(tournament?.matchDeadlineDate);
}

function withSchedulingConfigPayload(tournamentLike) {
  if (!tournamentLike) return tournamentLike;
  const raw = tournamentLike.dataValues || tournamentLike;
  const schedulingConfig = TournamentSchedulingService.getSchedulingConfigFromTournament(raw);
  if (tournamentLike.dataValues) {
    tournamentLike.dataValues.schedulingConfig = schedulingConfig;
    return tournamentLike;
  }
  return { ...raw, schedulingConfig };
}

async function resolveTournamentDefaultFixtureDate(tournament, transaction = null) {
  if (!tournament) return new Date();

  try {
    const booking = await Booking.findOne({
      where: {
        tournamentId: tournament.id,
        bookingType: "tournament",
        bookingDate: { [Op.ne]: null },
      },
      order: [["bookingDate", "ASC"]],
      attributes: ["bookingDate"],
      transaction,
    });

    const bookingDate = parseValidDateOrNull(booking?.bookingDate);
    if (bookingDate) return bookingDate;
  } catch (error) {
    console.warn(
      `[resolveTournamentDefaultFixtureDate] Could not read booking date for tournament ${tournament.id}: ${error?.message}`
    );
  }

  return parseValidDateOrNull(tournament.startDate) || new Date();
}

async function attachBookingDatesToMatches(matchRows, transaction = null) {
  if (!Array.isArray(matchRows) || matchRows.length === 0) return matchRows;

  const matchIds = [...new Set(matchRows.map((m) => m?.id).filter(Boolean))];
  if (matchIds.length === 0) return matchRows;

  const bookings = await Booking.findAll({
    where: {
      bookingType: "tournament",
      tournamentMatchId: { [Op.in]: matchIds },
      bookingDate: { [Op.ne]: null },
    },
    attributes: ["tournamentMatchId", "bookingDate", "createdAt"],
    order: [["createdAt", "ASC"]],
    transaction,
  });

  const bookingDateByMatchId = new Map();
  for (const booking of bookings) {
    const matchId = String(booking.tournamentMatchId);
    if (!bookingDateByMatchId.has(matchId)) {
      bookingDateByMatchId.set(matchId, booking.bookingDate);
    }
  }

  return matchRows.map((m) => ({
    ...m,
    bookingDate:
      m.bookingDate ||
      bookingDateByMatchId.get(String(m.id)) ||
      null,
  }));
}

function getVenueApprovalBlockedError(tournament) {
  const state = tournament?.venueRequestStatus;
  if (state === "pending") {
    return {
      error: "Venue approval required from owner",
      errorCode: "VENUE_APPROVAL_PENDING",
    };
  }
  if (state === "rejected") {
    return {
      error: "Venue request was rejected. Please select another venue.",
      errorCode: "VENUE_APPROVAL_REJECTED",
    };
  }
  return {
    error: "Venue approval required from owner",
    errorCode: "VENUE_APPROVAL_REQUIRED",
  };
}

const SETUP_TOTAL_STEPS = 11;
const SETUP_REQUIRED_STEPS = Array.from({ length: SETUP_TOTAL_STEPS }, (_, idx) => idx + 1);

function normalizeSetupSteps(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = raw.split(",").map((s) => s.trim());
    }
  }
  if (!Array.isArray(arr)) return [];
  const deduped = [...new Set(arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= SETUP_TOTAL_STEPS))];
  deduped.sort((a, b) => a - b);
  return deduped;
}

function normalizeWithdrawalRules(raw) {
  try {
    console.log('[normalizeWithdrawalRules] Input type:', typeof raw, 'Value:', raw);

    if (!raw) {
      console.log('[normalizeWithdrawalRules] Raw is empty, returning null');
      return null;
    }

    if (typeof raw === "string") {
      console.log('[normalizeWithdrawalRules] Parsing string JSON');
      try {
        raw = JSON.parse(raw);
      } catch {
        console.log('[normalizeWithdrawalRules] Failed to parse JSON string, returning null');
        return null;
      }
    }

    if (typeof raw !== "object" || raw === null) {
      console.log('[normalizeWithdrawalRules] Not an object, returning null');
      return null;
    }

    // Clean up the object - keep only valid fields
    const result = {
      beforeStart: raw.beforeStart || "remove",
      duringGroup: raw.duringGroup || "50_percent_rule",
      duringKnockout: raw.duringKnockout || "walkover",
      cancellation: raw.cancellation || "partial",
      fraudVoid: Boolean(raw.fraudVoid),
    };

    console.log('[normalizeWithdrawalRules] Returning cleaned object:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[normalizeWithdrawalRules] ERROR:', err.message);
    throw err;
  }
}

function isSetupComplete(tournament, incoming = {}) {
  const steps = normalizeSetupSteps(
    incoming.setupCompletedSteps !== undefined ? incoming.setupCompletedSteps : tournament?.setupCompletedSteps
  );
  const explicitCompleted =
    incoming.setupCompleted !== undefined
      ? Boolean(incoming.setupCompleted)
      : Boolean(tournament?.setupCompleted);
  const allStepsDone = SETUP_REQUIRED_STEPS.every((s) => steps.includes(s));

  // Backward compatibility: older rows may not have setup metadata populated.
  const legacyComplete = Boolean(tournament?.formatId && tournament?.scoringRulesId);
  return (explicitCompleted && allStepsDone) || legacyComplete;
}

/** Player profiles store email on User, not Player. */
async function getPlayerEmailForNotification(playerId, transaction) {
  const player = await Player.findByPk(playerId, {
    attributes: ["id", "userId", "name", "nickname"],
    transaction,
  });
  if (!player?.userId) return null;
  const user = await User.findByPk(player.userId, {
    attributes: ["email"],
    transaction,
  });
  return user?.email || null;
}

function getKnockoutMatchRoundTypeByPlayers(playersInRound) {
  if (playersInRound <= 2) return "final";
  if (playersInRound <= 4) return "semi_final";
  if (playersInRound <= 8) return "knockout_8";
  return "knockout_16";
}

function getKnockoutRoundDisplayName(playersInRound, roundNumber) {
  if (playersInRound <= 2) return "Final";
  if (playersInRound <= 4) return "Semi Final";
  if (playersInRound <= 8) return "Quarter Final";
  if (playersInRound <= 16) return "Round of 16";
  return `Round ${roundNumber}`;
}

function parseKnockoutRoundDescription(round) {
  if (!round?.description) return null;
  try {
    const o = JSON.parse(round.description);
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

/** API-facing flags for matches with no opponent (BYE / auto-advance). */
function attachByeFlagsToMatchPlain(matchPlain, formatType) {
  const p2Id = matchPlain?.player2Id;
  const p2Name =
    matchPlain?.player2?.name ||
    matchPlain?.player2Name ||
    matchPlain?.p2 ||
    matchPlain?.opponentName ||
    null;

  const p2IsByeId = typeof p2Id === "string" && p2Id.toUpperCase() === "BYE";
  const p2IsByeName = typeof p2Name === "string" && p2Name.toUpperCase() === "BYE";
  const isByeRow = p2Id == null || p2IsByeId || p2IsByeName;

  if (!isByeRow) {
    return { ...matchPlain, isBye: false, isBookable: true, isPlayable: true };
  }
  const rt = String(matchPlain.roundType || "").toLowerCase();
  const isSwiss = formatType === "swiss" || rt === "swiss";
  const isGroupsKnockoutFormat = formatType === "groups_knockout";
  const byeDisplayLabel = isSwiss
    ? "BYE Win"
    : isGroupsKnockoutFormat
      ? "BYE"
      : "Auto Advance (BYE)";
  return {
    ...matchPlain,
    isBye: true,
    bye: true,
    // API-facing normalization: bye/rest rows are not playable/boekable.
    // (DB status remains unchanged; we only adjust the API payload.)
    status: "bye",
    isBookable: false,
    isPlayable: false,
    // Preserve rest intent for legacy UI paths (some builders used status "rest").
    isRest: matchPlain.isRest === true,
    byeDisplayLabel,
    isKnockoutStyleBye: !isSwiss,
  };
}

/**
 * Knockout byes stored only in round metadata (byeByPairIndex) — no DB row.
 * Merge synthetic rows so fixtures / match lists can show auto-advances.
 */
async function buildSyntheticKnockoutByeRowsFromRounds({
  tournamentId,
  formatType,
  existingMatchRows,
  transaction = null,
}) {
  if (formatType !== "knockout" && formatType !== "groups_knockout") {
    return [];
  }

  const rounds = await TournamentRound.findAll({
    where: { tournamentId },
    attributes: ["id", "roundNumber", "roundType", "description"],
    order: [["roundNumber", "ASC"]],
    transaction,
  });

  const playerIds = new Set();
  const pending = [];

  for (const round of rounds) {
    const meta = parseKnockoutRoundDescription(round);
    const byeMap = meta?.byeByPairIndex;
    if (!byeMap || typeof byeMap !== "object") continue;

    // Skip if byeMap is empty (no actual BYEs)
    if (Object.keys(byeMap).length === 0) continue;

    const rn = Number(round.roundNumber);
    if (!Number.isFinite(rn)) continue;

    for (const [pairIdxStr, pid] of Object.entries(byeMap)) {
      if (!pid) continue;
      const pairIdx = Number(pairIdxStr);
      if (!Number.isFinite(pairIdx)) continue;
      const matchNumber = pairIdx + 1;

      const hasDbByeRow = existingMatchRows.some(
        (m) =>
          Number(m.roundNumber) === rn &&
          Number(m.matchNumber) === matchNumber &&
          m.player1Id === pid &&
          m.player2Id == null
      );
      if (hasDbByeRow) continue;

      playerIds.add(pid);
      pending.push({ round, rn, pairIdx, matchNumber, playerId: pid });
    }
  }

  if (pending.length === 0) return [];

  const players = await Player.findAll({
    where: { id: [...playerIds] },
    attributes: ["id", "name"],
    transaction,
  });
  const nameById = Object.fromEntries(players.map((p) => [p.id, p.name || "Player"]));

  const synthetic = [];
  for (const { round, rn, pairIdx, matchNumber, playerId } of pending) {
    const id = `synthetic-bye-${tournamentId}-${rn}-${pairIdx}-${playerId}`;
    synthetic.push({
      id,
      tournamentId,
      roundNumber: rn,
      roundType: round.roundType || "knockout_16",
      matchNumber,
      player1Id: playerId,
      player2Id: null,
      groupNumber: null,
        // API-facing normalization for bye/rest.
        status: "bye",
        isBookable: false,
      winner: "player1",
      player1FramesWon: null,
      player2FramesWon: null,
      isWalkover: false,
      isBye: true,
      bye: true,
      byeDisplayLabel:
        formatType === "groups_knockout" ? "BYE" : "Auto Advance (BYE)",
      isKnockoutStyleBye: true,
      isKnockoutByeAdvance: true,
      isSyntheticBye: true,
      player1: { id: playerId, name: nameById[playerId] || "Player" },
      player2: null,
    });
  }

  return synthetic;
}

/**
 * Round-robin rest (BYE) synthesis:
 * Round-robin fixtures for odd player counts do not have DB match rows for the rest.
 * Those rest slots are stored in `TournamentRound.description` as `byePlayers` when `roundRobin: true`.
 * This converts that metadata into API rows so the frontend can render `REST (BYE)`.
 */
async function buildSyntheticRoundRobinRestRowsFromRounds({
  tournamentId,
  existingMatchRows,
  transaction = null,
}) {
  const rrRoundRows = await TournamentRound.findAll({
    where: { tournamentId },
    attributes: ["roundNumber", "roundType", "description"],
    order: [["roundNumber", "ASC"]],
    transaction,
  });

  if (!rrRoundRows || rrRoundRows.length === 0) return [];

  const byeByRound = new Map(); // rn -> Set(playerId)
  const byeRecipientIds = new Set();

  for (const row of rrRoundRows) {
    const rn = Number(row.roundNumber);
    if (!Number.isFinite(rn)) continue;

    let desc = null;
    if (row.description) {
      try {
        desc = JSON.parse(row.description);
      } catch {
        desc = null;
      }
    }

    if (!desc || desc.roundRobin !== true) continue;
    const byePlayers = Array.isArray(desc.byePlayers) ? desc.byePlayers : [];
    for (const bp of byePlayers) {
      const pid = bp?.playerId;
      if (!pid) continue;
      if (!byeByRound.has(rn)) byeByRound.set(rn, new Set());
      byeByRound.get(rn).add(pid);
      byeRecipientIds.add(pid);
    }
  }

  if (byeByRound.size === 0) return [];

  const playersDb =
    byeRecipientIds.size > 0
      ? await Player.findAll({
          where: { id: { [Op.in]: [...byeRecipientIds] } },
          attributes: ["id", "name"],
          transaction,
        })
      : [];
  const nameById = new Map(playersDb.map((p) => [String(p.id), p.name || "Player"]));

  // Prevent duplicates if DB already has a true rest/BYE row (or if this endpoint is cached).
  const existingByeKeys = new Set(
    (existingMatchRows || [])
      .filter(
        (m) =>
          m &&
          (m.player2Id == null ||
            (typeof m.player2Id === "string" && m.player2Id.toUpperCase() === "BYE"))
      )
      .map((m) => `${String(m.roundNumber)}|${String(m.player1Id)}`)
  );

  const synthetic = [];
  for (const [rn, playerIdSet] of byeByRound.entries()) {
    const rrRow = rrRoundRows.find((r) => Number(r.roundNumber) === rn);
    const roundType = rrRow?.roundType || "group_stage";

    for (const pid of playerIdSet) {
      const key = `${String(rn)}|${String(pid)}`;
      if (existingByeKeys.has(key)) continue;

      synthetic.push({
        id: `synthetic-rr-rest-${tournamentId}-${rn}-${pid}`,
        tournamentId,
        roundNumber: rn,
        roundType,
        matchNumber: null,
        groupNumber: null,
        player1Id: pid,
        player2Id: null,
        status: "bye",
        winner: null,
        player1FramesWon: null,
        player2FramesWon: null,
        isWalkover: false,
        isBye: true,
        isRest: true,
        isBookable: false,
        isPlayable: false,
        isSyntheticBye: true,
        player1: { id: pid, name: nameById.get(String(pid)) || "Player" },
        player2: null,
      });
    }
  }

  return synthetic;
}

/**
 * Pair slots = bracket winners + bye advancers for one knockout layer.
 * byeByPairIndex keys are 0-based pair indices; real matches use matchNumber = pairIndex + 1.
 */
function collectAdvancersForPairCount(pairCountPrev, byeMap, previousMatches, allTournamentMatches = []) {
  const map = new Map();
  for (const m of previousMatches) {
    if (m.player2Id != null && m.matchNumber != null) {
      map.set(Number(m.matchNumber), m);
    }
  }
  const bye = byeMap || {};
  const advancing = [];
  for (let p = 0; p < pairCountPrev; p++) {
    const byeId = bye[String(p)] ?? bye[p];
    if (byeId) {
      advancing.push(byeId);
      continue;
    }
    const m = map.get(p + 1);
    // Consider a match resolved if it's completed OR if it's voided but admin has overridden with a winner
    const isResolved = m && (
      m.status === "completed" ||
      (m.status === "voided" && m.adminOverride === true)
    );
    if (!isResolved) {
      return { advancing: null, incomplete: true };
    }

    // For knockout tournaments, draws must be resolved via adminOverride before progression
    // OR randomly select for auto-progression (for unresolved draws)
    if (m.winner === "draw") {
      // If admin has marked it as resolved (adminOverride=true), winner should be set
      if (m.adminOverride) {
        if (!(m.winner === "player1" || m.winner === "player2")) {
          console.warn(`[collectAdvancersForPairCount] Draw match ${m.id} has adminOverride but no valid winner set`);
          return { advancing: null, incomplete: true };
        }
      } else {
        // Unresolved draw - determine winner via tournament tie-breakers (FD > FW > HB)
        const getStats = (pId) => {
          const pMatches = allTournamentMatches.filter(tm => tm.player1Id === pId || tm.player2Id === pId);
          const fw = pMatches.reduce((sum, tm) => sum + (tm.player1Id === pId ? (tm.player1FramesWon || 0) : (tm.player2FramesWon || 0)), 0);
          const fl = pMatches.reduce((sum, tm) => sum + (tm.player1Id === pId ? (tm.player2FramesWon || 0) : (tm.player1FramesWon || 0)), 0);
          const hb = pMatches.reduce((max, tm) => Math.max(max, (tm.player1Id === pId ? (tm.player1HighestBreak || 0) : (tm.player2HighestBreak || 0))), 0);
          return { fw, fd: fw - fl, hb };
        };

        const s1 = getStats(m.player1Id);
        const s2 = getStats(m.player2Id);

        let winnerId;
        if (s1.fd !== s2.fd) {
          winnerId = s1.fd > s2.fd ? m.player1Id : m.player2Id;
        } else if (s1.fw !== s2.fw) {
          winnerId = s1.fw > s2.fw ? m.player1Id : m.player2Id;
        } else if (s1.hb !== s2.hb) {
          winnerId = s1.hb > s2.hb ? m.player1Id : m.player2Id;
        } else {
          winnerId = m.player1Id; // Fallback
        }

        console.log(`[collectAdvancersForPairCount] Draw match ${m.id} resolved via tournament stats: Advancing ${winnerId}`);
        advancing.push(winnerId);
        continue;
      }
    }

    if (!(m.winner === "player1" || m.winner === "player2")) {
      return { advancing: null, incomplete: true };
    }
    advancing.push(m.winner === "player1" ? m.player1Id : m.player2Id);
  }
  return { advancing, incomplete: false };
}

function computePairCountPrev(bracketSize, knockoutPhaseStartRound, completedRoundNumber) {
  if (
    !bracketSize ||
    !Number.isFinite(bracketSize) ||
    bracketSize < 2 ||
    knockoutPhaseStartRound == null
  ) {
    return { pairCountPrev: null, koIndex: null, invalidMeta: true };
  }
  const koIndex = completedRoundNumber - knockoutPhaseStartRound + 1;
  if (koIndex < 1) {
    return { pairCountPrev: null, koIndex, invalidMeta: true };
  }
  const pairCountPrev = bracketSize / Math.pow(2, koIndex);
  if (!Number.isInteger(pairCountPrev) || pairCountPrev < 1) {
    return { pairCountPrev: null, koIndex, invalidMeta: true };
  }
  return { pairCountPrev, koIndex, invalidMeta: false };
}

/**
 Builds ordered advancers (match winners + bye slots) for a completed knockout round.
 When bracket metadata is missing (legacy tournaments), infers size from participants + format when possible.
 */
async function buildKnockoutAdvancingPlayerIds(tournamentId, completedRoundNumber, transaction) {
  const allRounds = await TournamentRound.findAll({
    where: { tournamentId },
    order: [["roundNumber", "ASC"]],
    transaction,
  });
  let bracketSize = null;
  let knockoutPhaseStartRound = null;
  for (const r of allRounds) {
    const m = parseKnockoutRoundDescription(r);
    if (m?.knockoutBracketSize != null && Number(m.knockoutBracketSize) > 0) {
      const rn = r.roundNumber;
      const bs = Number(m.knockoutBracketSize);
      if (knockoutPhaseStartRound == null || rn < knockoutPhaseStartRound) {
        knockoutPhaseStartRound = rn;
        bracketSize = bs;
      }
    }
  }

  const previousRound = await TournamentRound.findOne({
    where: { tournamentId, roundNumber: completedRoundNumber },
    transaction,
  });
  const prevMeta = parseKnockoutRoundDescription(previousRound);

  const previousMatches = await TournamentMatch.findAll({
    where: { tournamentId, roundNumber: completedRoundNumber },
    order: [["matchNumber", "ASC"]],
    transaction,
  });

  const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction });

  if (
    !(bracketSize && Number.isFinite(bracketSize) && bracketSize > 0 && knockoutPhaseStartRound != null)
  ) {
    const localBs = prevMeta?.knockoutBracketSize ? Number(prevMeta.knockoutBracketSize) : null;
    const participantCount = await TournamentParticipant.count({
      where: { tournamentId, status: "approved" },
      transaction,
    });
    const inferred = Math.pow(2, Math.ceil(Math.log2(Math.max(2, participantCount))));
    bracketSize = localBs || inferred;
    knockoutPhaseStartRound =
      format?.type === "groups_knockout" && format.knockoutStartRound != null
        ? Number(format.knockoutStartRound)
        : 1;
  }

  if (bracketSize && Number.isFinite(bracketSize) && bracketSize > 0 && knockoutPhaseStartRound != null) {
    const { pairCountPrev, invalidMeta } = computePairCountPrev(
      bracketSize,
      knockoutPhaseStartRound,
      completedRoundNumber
    );
    if (invalidMeta || pairCountPrev == null) {
      return {
        advancing: [],
        usedMeta: true,
        invalidMeta: true,
        pairCountPrev: null,
        bracketSize,
        knockoutPhaseStartRound,
      };
    }
    const byeMap = prevMeta?.byeByPairIndex || {};

    // If byeMap is incomplete, try to infer missing byes from previous round results
    if (Object.keys(byeMap).length === 0) {
      // byeMap is completely empty - try to reconstruct from matches and participants
      const completedMatches = previousMatches.filter(m => m.player2Id != null && m.matchNumber != null);
      const usedPlayerIds = new Set();
      for (const m of completedMatches) {
        if (m.player1Id) usedPlayerIds.add(m.player1Id);
        if (m.player2Id) usedPlayerIds.add(m.player2Id);
      }

      // Get all participants to find byes
      const allParticipants = await TournamentParticipant.findAll({
        where: { tournamentId, status: "approved" },
        transaction,
      });

      // Find participants that aren't in any match (they must be byes from previous round)
      const byeParticipants = allParticipants.filter(p => !usedPlayerIds.has(p.playerId));

      // Try to populate missing pairs with bye players
      let byeIndex = 0;
      for (let p = 0; p < pairCountPrev; p++) {
        if (!byeMap[String(p)] && byeIndex < byeParticipants.length) {
          byeMap[String(p)] = byeParticipants[byeIndex].playerId;
          byeIndex++;
        }
      }
    }

    // Fetch all tournament matches to use for tie-breakers if any draws exist
    const allMatches = await TournamentMatch.findAll({
      where: { tournamentId, status: 'completed' },
      transaction
    });

    const { advancing, incomplete } = collectAdvancersForPairCount(
      pairCountPrev,
      byeMap,
      previousMatches,
      allMatches
    );
    if (incomplete) {
      return {
        advancing: null,
        usedMeta: true,
        incomplete: true,
        pairCountPrev,
        bracketSize,
        knockoutPhaseStartRound,
      };
    }
    return {
      advancing,
      usedMeta: true,
      pairCountPrev,
      bracketSize,
      knockoutPhaseStartRound,
    };
  }

  const legacyAdvancing = previousMatches
    .filter((m) => m.player2Id != null && (m.winner === "player1" || m.winner === "player2"))
    .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0))
    .map((m) => (m.winner === "player1" ? m.player1Id : m.player2Id));

  return {
    advancing: legacyAdvancing,
    usedMeta: false,
    pairCountPrev: null,
    bracketSize: null,
    knockoutPhaseStartRound: null,
  };
}

async function sendRoundStartEmails(tournament, roundNumber, transaction = null) {
  const { sendEmail } = require("../utils/email");
  const roundMatches = await TournamentMatch.findAll({
    where: {
      tournamentId: tournament.id,
      roundNumber,
      player1Id: { [Op.ne]: null },
      player2Id: { [Op.ne]: null },
    },
    include: [
      { association: "player1", attributes: ["id", "name", "nickname"] },
      { association: "player2", attributes: ["id", "name", "nickname"] },
    ],
    transaction,
  });

  const recipientMap = new Map();
  for (const m of roundMatches) {
    if (m.player1Id) recipientMap.set(m.player1Id, { opponentName: m.player2?.name || m.player2?.nickname || "Opponent", roundType: m.roundType });
    if (m.player2Id) recipientMap.set(m.player2Id, { opponentName: m.player1?.name || m.player1?.nickname || "Opponent", roundType: m.roundType });
  }

  for (const [playerId, info] of recipientMap.entries()) {
    const email = await getPlayerEmailForNotification(playerId, transaction);
    if (!email) continue;
    await sendEmail({
      to: email,
      subject: `Round ${roundNumber} started: ${tournament.name}`,
      html: `<p>Your next match in <strong>${tournament.name}</strong> is now active.</p><p><strong>Round:</strong> ${roundNumber}<br/><strong>Opponent:</strong> ${info.opponentName}</p>`,
      text: `Your next match in ${tournament.name} is now active.\nRound: ${roundNumber}\nOpponent: ${info.opponentName}`,
    });
  }
}

async function sendRoundCompletedEmails(tournament, roundNumber, transaction = null) {
  const { sendEmail } = require("../utils/email");
  const participants = await TournamentParticipant.findAll({
    where: { tournamentId: tournament.id, status: "approved" },
    attributes: ["playerId"],
    transaction,
  });
  for (const p of participants) {
    const email = await getPlayerEmailForNotification(p.playerId, transaction);
    if (!email) continue;
    await sendEmail({
      to: email,
      subject: `Round ${roundNumber} completed: ${tournament.name}`,
      html: `<p>Round ${roundNumber} has been completed in <strong>${tournament.name}</strong>.</p>`,
      text: `Round ${roundNumber} has been completed in ${tournament.name}.`,
    });
  }
}

// ============================================================================
// TOURNAMENT CRUD OPERATIONS
// ============================================================================

// Helper: normalize entryMethods value to a proper object
function parseEntryMethods(raw, row) {
  const defaults = {
    selfRegistration: true,
    invitationLink: true,
    joinCode: true,
    adminEntry: true,
    openRequestWithApproval: true,
  };

  if (!raw) {
    if (row) {
      return {
        selfRegistration: Boolean(row.allowsSelfRegistration),
        invitationLink: Boolean(row.allowsInvitations),
        joinCode: Boolean(row.allowsJoinCodes),
        adminEntry: Boolean(row.allowsAdminEntry),
        openRequestWithApproval: Boolean(row.allowsOpenRegistration),
      };
    }
    return defaults;
  }

  try {
    // If string, try to parse
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {
        // fallthrough to attempt reconstruction
      }
    }

    if (typeof raw === 'object') {
      // If already contains the expected keys, return a clean object using only those keys
      const keys = ['selfRegistration', 'invitationLink', 'joinCode', 'adminEntry', 'openRequestWithApproval'];
      if (keys.some(k => Object.prototype.hasOwnProperty.call(raw, k))) {
        return {
          selfRegistration: Boolean(raw.selfRegistration),
          invitationLink: Boolean(raw.invitationLink),
          joinCode: Boolean(raw.joinCode),
          adminEntry: Boolean(raw.adminEntry),
          openRequestWithApproval: Boolean(raw.openRequestWithApproval),
        };
      }

      // If object has numeric keys (string was spread into an object), try to rebuild
      const numericKeys = Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
      if (numericKeys.length > 0) {
        const rebuilt = numericKeys.map(k => raw[k]).join('');
        try {
          const parsed = JSON.parse(rebuilt);
          if (parsed && typeof parsed === 'object') {
            // merge any non-numeric keys from raw into parsed
            Object.keys(raw).forEach(k => { if (!/^\d+$/.test(k)) parsed[k] = raw[k]; });
            return parsed;
          }
        } catch (e) {
          // ignore
        }
      }
    }
  } catch (e) {
    // ignore and fallback
  }

  // Fallback to boolean columns on the row if available
  if (row) {
    return {
      selfRegistration: Boolean(row.allowsSelfRegistration),
      invitationLink: Boolean(row.allowsInvitations),
      joinCode: Boolean(row.allowsJoinCodes),
      adminEntry: Boolean(row.allowsAdminEntry),
      openRequestWithApproval: Boolean(row.allowsOpenRegistration),
    };
  }

  return defaults;
}

// Normalize sportTypes stored in DB (can be array, JSON string, comma list, or object)
function normalizeSportTypes(sportTypes) {
  if (!sportTypes) return [];
  if (Array.isArray(sportTypes)) return sportTypes;
  if (typeof sportTypes === 'string') {
    try {
      const parsed = JSON.parse(sportTypes);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // not JSON, fallthrough to comma-split
    }
    return sportTypes.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (typeof sportTypes === 'object') {
    try {
      const vals = Object.values(sportTypes).map((v) => (v == null ? '' : String(v)));
      return vals.filter(Boolean);
    } catch (e) {
      return [];
    }
  }
  return [String(sportTypes)];
}

// Normalize venueIds into an array of ids
function normalizeVenueIds(venueIds) {
  if (!venueIds) return [];
  if (Array.isArray(venueIds)) return venueIds.filter(Boolean);
  if (typeof venueIds === 'string') {
    try {
      const parsed = JSON.parse(venueIds);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (e) {
      // fallthrough to comma split
    }
    return venueIds.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (typeof venueIds === 'object') {
    try {
      const vals = Object.values(venueIds).filter(Boolean);
      return Array.isArray(vals) ? vals : [];
    } catch (e) {
      return [];
    }
  }
  return [String(venueIds)];
}

function parseClubVenuesRaw(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : Object.values(parsed || {});
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") return Object.values(raw);
  return [];
}

/**
 * Convert tournament matches to fixture records and store in fixtures table
 * Allows unified fixture storage across leagues and tournaments
 */
async function storeMatchesAsFixtures(createdMatches, tournamentId, transaction = null) {
  if (!Array.isArray(createdMatches) || createdMatches.length === 0) {
    return [];
  }

  const fixtureRecords = createdMatches.map((match) => {
    // Map round type to fixture stage
    let stage = "knockout";
    if (match.roundType && match.roundType.includes("group")) {
      stage = "group";
    } else if (match.roundType === "swiss" || match.roundType === "swiss_round") {
      stage = "swiss";
    }

    // Determine winner ID if match is completed
    let winnerId = null;
    let loserId = null;
    if (match.winner === "player1" && match.player1Id) {
      winnerId = match.player1Id;
      loserId = match.player2Id;
    } else if (match.winner === "player2" && match.player2Id) {
      winnerId = match.player2Id;
      loserId = match.player1Id;
    }

    return {
      id: uuidv4(),
      tournamentId,
      leagueId: null,
      divisionId: null,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      round: match.roundNumber,
      matchNumber: match.matchNumber,
      scheduledDate: match.scheduledDate,
      date: match.playedDate || null,
      player1Frames: match.player1FramesWon || 0,
      player2Frames: match.player2FramesWon || 0,
      player1RackWins: match.player1FramesWon || 0,
      player2RackWins: match.player2FramesWon || 0,
      winnerId,
      loserId,
      status: match.status === "bye" ? "bye" : (match.status === "completed" ? "completed" : "scheduled"),
      stage,
      matchIndex: match.matchNumber,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  try {
    const createdFixtures = await Fixture.bulkCreate(fixtureRecords, { transaction });
    console.log(`[storeMatchesAsFixtures] Created ${createdFixtures.length} fixture records for tournament ${tournamentId}`);
    return createdFixtures;
  } catch (error) {
    console.error(`[storeMatchesAsFixtures] Error creating fixture records:`, error.message);
    // Don't throw - fixture storage is supplementary, continue even if it fails
    return [];
  }
}

/**
 * Validate tournament ranking configuration
 *
 * Validates ranking settings including tier-scope compatibility,
 * minimum players threshold, and point distribution structure.
 * Returns tier-based point presets and advisory warnings.
 */
exports.validateRankingConfiguration = async (req, res) => {
  try {
    const {
      ranked,
      tier,
      rankingScope,
      minPlayersForRankingPoints,
      rankingPointsPerRound
    } = req.body;

    // Perform comprehensive validation
    const validationResult = rankingPresetService.validateRankingConfiguration({
      ranked: ranked !== undefined ? ranked : true,
      tier,
      rankingScope,
      minPlayersForRankingPoints,
      rankingPointsPerRound
    });

    // Return validation result with tier presets
    return res.status(200).json({
      success: validationResult.valid,
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      recommendations: validationResult.recommendations,
      tierPresets: validationResult.tierPresets,
      recommendedMinimumPlayers: tier
        ? rankingPresetService.getRecommendedMinimumPlayers(tier)
        : null
    });
  } catch (error) {
    console.error("Error validating ranking configuration:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to validate ranking configuration",
      details: error.message
    });
  }
};

/**
 * Create a new tournament
 */
exports.createTournament = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      name,
      sport,
      tier,
      startDate,
      endDate,
      registrationDeadline,
      maxParticipants,
      entryFee,
      format,
      organiserType,
      organizerType,
      clubId,
      venueIds,
      rankingScope,
      scoringRules,
      formatConfig,
      schedulingConfig,
      gameId,
      ...otherData
    } = req.body;

    // Extract entryMethods from payload explicitly to avoid accidental string spreading
    const clientEntryMethods = otherData.entryMethods;
    if (otherData.entryMethods !== undefined) delete otherData.entryMethods;
    const clientStandingsColumns = otherData.standingsColumns;
    if (otherData.standingsColumns !== undefined) delete otherData.standingsColumns;

    if (otherData.standingsDisplay === undefined && clientStandingsColumns !== undefined) {
      otherData.standingsDisplay = { columns: clientStandingsColumns };
    }

    if (otherData.standingsDisplay !== undefined) {
      otherData.standingsDisplay = normalizeStandingsDisplayConfig(otherData.standingsDisplay, sport);
    }

    // Official ranking state is platform-owner controlled only.
    delete otherData.isOfficialRanking;
    delete otherData.officialApprovedBy;
    delete otherData.officialApprovedAt;

    const normalizedScheduling = TournamentSchedulingService.normalizeSchedulingConfig(
      schedulingConfig || {},
      otherData
    );
    delete otherData.schedulingConfig;
    delete otherData.matchDeadlineEnforcement;
    delete otherData.autoForfeitOverdue;

    const normalizedLateRegistration = normalizeLateRegistrationConfig(otherData);
    otherData.allowLateRegistration = normalizedLateRegistration.allowLateRegistration;
    otherData.lateRegistrationMode = normalizedLateRegistration.lateRegistrationMode;
    otherData.lateRegistrationDeadline = normalizedLateRegistration.lateRegistrationDeadline;
    if (otherData.maxFixtureRegenerations != null) {
      const mfr = parseInt(otherData.maxFixtureRegenerations, 10);
      otherData.maxFixtureRegenerations = Number.isFinite(mfr) && mfr > 0 ? mfr : 3;
    }

    // Normalize withdrawal rules (clean up extra fields)
    if (otherData.withdrawalRules) {
      otherData.withdrawalRules = normalizeWithdrawalRules(otherData.withdrawalRules);
    }

    // Validate clubId is provided (tournament MUST belong to a club)
    if (!clubId) {
      return res.status(400).json({ success: false, error: "clubId is required. Tournament must be created under a specific club." });
    }

    // Verify club exists
    const club = await Club.findByPk(clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: "Club not found" });
    }

    // Verify user is a member of the club with proper access
    const clubMembership = await ClubMember.findOne({
      where: {
        clubId,
        userId,
        status: "active",
      },
    });

    if (!clubMembership) {
      return res.status(403).json({ success: false, error: "You do not have access to create tournaments for this club. You must be an active member of the club." });
    }

    // Check if user has appropriate role (admin or manager)
    const allowedRoles = ["club_admin", "assistant_admin", "tournament_manager"];
    if (!allowedRoles.includes(clubMembership.role)) {
      return res.status(403).json({ success: false, error: "You do not have permission to create tournaments for this club. Only club administrators and managers can create tournaments." });
    }

    // Verify organization
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    if (tier === "regional" || tier === "national") {
      return res.status(403).json({
        success: false,
        error: "Organisers can only create Local or County tournaments. Regional and National events require higher-level sanctioning.",
      });
    }

    // Validate that the club's sport types include the selected sport
    const clubSportTypes = normalizeSportTypes(club.sportTypes);
    if (clubSportTypes.length > 0 && sport) {
      const normalizedSport = String(sport).toLowerCase();
      const lowerClubSports = clubSportTypes.map((s) => String(s).toLowerCase());
      if (!lowerClubSports.includes(normalizedSport)) {
        return res.status(400).json({
          success: false,
          error: `Selected sport "${sport}" is not supported by this club. Supported sports: ${clubSportTypes.join(', ')}`
        });
      }
    }

    // Normalize entryMethods and map to individual boolean flags
    const entryMethodsMapping = parseEntryMethods(clientEntryMethods, null);
    const entryMethodsFlags = {
      allowsSelfRegistration: entryMethodsMapping.selfRegistration !== false,
      allowsInvitations: entryMethodsMapping.invitationLink !== false,
      allowsJoinCodes: entryMethodsMapping.joinCode !== false,
      allowsAdminEntry: entryMethodsMapping.adminEntry !== false,
      allowsOpenRegistration: entryMethodsMapping.openRequestWithApproval !== false,
    };

    // Normalize venueIds and determine primary venueId
    const processedVenueIds = normalizeVenueIds(venueIds);
    let primaryVenueId = null;
    if (processedVenueIds.length > 0) {
      primaryVenueId = processedVenueIds[0];
    } else {
      // Try club metadata venues (Club.venues getter handles parsing)
      const clubVenues = Array.isArray(club.venues) ? club.venues : [];
      if (clubVenues.length > 0) {
        const v = clubVenues[0] || {};
        primaryVenueId = v.id || v.venueId || v.venueOwnerId || null;
      }
      // If still not found, check ClubVenue links for a primary linked venue
      if (!primaryVenueId) {
        try {
          const linked = await ClubVenue.findOne({ where: { clubId, isPrimary: true, status: 'active' } });
          if (linked) primaryVenueId = linked.venueOwnerId;
        } catch (e) {
          // ignore DB lookup errors and leave primaryVenueId null
        }
      }
    }

    // Venue ownership / approval logic:
    // - Club embedded venue (venue_* / virtual_*) -> store id in venueIds JSON; venueId column may be null (non-UUID)
    // - Composite ownerId:subVenueRef -> store composite in venueIds; resolve VenueOwner for approval
    // - VenueOwner UUID -> existing behaviour
    let venueRequestStatus = "none";
    let venueIdsForTournament = processedVenueIds;
    let venueIdForTournament =
      primaryVenueId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(primaryVenueId).trim())
        ? primaryVenueId
        : null;
    let pendingVenueOwner = null;

    const clubVenuesList = parseClubVenuesRaw(club.venues);

    if (primaryVenueId) {
      const pv = String(primaryVenueId).trim();
      const isClubToken = pv.startsWith("venue_") || pv.startsWith("virtual_");
      const isComposite = pv.includes(":") && !isClubToken;

      if (isClubToken) {
        const matched = clubVenuesList.find((v) => String(v?.id || v?.venueId || "").trim() === pv);
        if (!matched) {
          return res.status(400).json({
            success: false,
            error: "Selected venue is not part of this club. Choose a venue that belongs to the tournament club.",
            errorCode: "INVALID_CLUB_VENUE",
          });
        }
        venueIdsForTournament = processedVenueIds.length ? processedVenueIds : [pv];
        venueIdForTournament = null;
        if (String(club.organizationId) === String(organization.id)) {
          venueRequestStatus = "approved";
        } else {
          venueRequestStatus = "pending";
          const clubOrgOwner = await VenueOwner.findOne({
            where: { organizationId: club.organizationId, status: "active" },
          });
          if (clubOrgOwner) pendingVenueOwner = clubOrgOwner;
        }
      } else if (isComposite) {
        const [ownerId, venueRef] = pv.split(":");
        const selectedVenueOwner = await VenueOwner.findByPk(ownerId);
        if (!selectedVenueOwner) {
          return res.status(400).json({
            success: false,
            error: "Invalid venue selection.",
            errorCode: "INVALID_COMPOSITE_VENUE",
          });
        }
        let ownerVenues = [];
        try {
          ownerVenues = Array.isArray(selectedVenueOwner.venues)
            ? selectedVenueOwner.venues
            : typeof selectedVenueOwner.venues === "string"
              ? JSON.parse(selectedVenueOwner.venues || "[]")
              : Object.values(selectedVenueOwner.venues || {});
        } catch {
          ownerVenues = [];
        }
        if (!Array.isArray(ownerVenues)) ownerVenues = [];
        const subOk = ownerVenues.some((v) => {
          const vid = String(v?.id || v?.venueId || "").trim();
          const nm = String(v?.name || v?.venueName || "").trim();
          return vid === String(venueRef).trim() || nm === String(venueRef).trim();
        });
        if (ownerVenues.length > 0 && !subOk) {
          return res.status(400).json({
            success: false,
            error: "Selected sub-venue was not found for this venue owner.",
            errorCode: "INVALID_COMPOSITE_SUBVENUE",
          });
        }
        venueIdsForTournament = processedVenueIds.length ? processedVenueIds : [pv];
        venueIdForTournament = null;
        if (selectedVenueOwner.organizationId === organization.id) {
          venueRequestStatus = "approved";
        } else {
          venueRequestStatus = "pending";
          pendingVenueOwner = selectedVenueOwner;
        }
      } else {
        const selectedVenueOwner = await VenueOwner.findByPk(primaryVenueId);
        if (selectedVenueOwner) {
          venueIdForTournament = selectedVenueOwner.id;
          if (selectedVenueOwner.organizationId === organization.id) {
            venueRequestStatus = "approved";
          } else {
            venueRequestStatus = "pending";
            venueIdsForTournament = [];
            venueIdForTournament = null;
            pendingVenueOwner = selectedVenueOwner;
          }
        } else if (processedVenueIds.length > 0) {
          return res.status(400).json({
            success: false,
            error: "Selected venue cannot be used for tournaments. Choose a club venue (venue_…) or a registered venue owner venue.",
            errorCode: "INVALID_TOURNAMENT_VENUE",
          });
        }
      }
    }

    // Check ALL venues (not just primary) for external ownership
    // If ANY venue is external, set status to pending and collect all pending venue owners
    const pendingVenueOwners = [];
    if (processedVenueIds.length > 0) {
      for (const venueIdRaw of processedVenueIds) {
        const vid = String(venueIdRaw).trim();
        if (!vid) continue;

        const isClubToken = vid.startsWith("venue_") || vid.startsWith("virtual_");
        const isComposite = vid.includes(":") && !isClubToken;

        if (isClubToken) {
          // Club venues: check if club's organization is external
          if (String(club.organizationId) !== String(organization.id)) {
            venueRequestStatus = "pending";
            const clubOrgOwner = await VenueOwner.findOne({
              where: { organizationId: club.organizationId, status: "active" },
            });
            if (clubOrgOwner && !pendingVenueOwners.find(pvo => pvo.id === clubOrgOwner.id)) {
              pendingVenueOwners.push(clubOrgOwner);
            }
          }
        } else if (isComposite) {
          // Composite venues: check ownership
          const [ownerId] = vid.split(":");
          const venueOwner = await VenueOwner.findByPk(ownerId);
          if (venueOwner && String(venueOwner.organizationId) !== String(organization.id)) {
            venueRequestStatus = "pending";
            if (!pendingVenueOwners.find(pvo => pvo.id === venueOwner.id)) {
              pendingVenueOwners.push(venueOwner);
            }
          }
        } else {
          // UUID venues: look up VenueOwner
          const venueOwner = await VenueOwner.findByPk(vid);
          if (venueOwner && String(venueOwner.organizationId) !== String(organization.id)) {
            venueRequestStatus = "pending";
            if (!pendingVenueOwners.find(pvo => pvo.id === venueOwner.id)) {
              pendingVenueOwners.push(venueOwner);
            }
          }
        }
      }
    }

    // Update pendingVenueOwner to use the first external venue (for backward compatibility)
    if (pendingVenueOwners.length > 0 && !pendingVenueOwner) {
      pendingVenueOwner = pendingVenueOwners[0];
    }

    const hasFullSetupPayload = Boolean(formatConfig && scoringRules);
    const initialSetupCompletedSteps = hasFullSetupPayload ? SETUP_REQUIRED_STEPS : [1, 2];
    const normalizedOrganiserType = organiserType || organizerType || "official_club";

    // Backend default: ranked tournaments are ON unless caller explicitly sends ranked=false.
    const rankedDefaulted = Object.prototype.hasOwnProperty.call(otherData, "ranked")
      ? (otherData.ranked === true || otherData.ranked === "true" || otherData.ranked === 1 || otherData.ranked === "1")
      : true;

    // Create tournament (include computed venueIds/venueId only when venue is owned)
    const tournament = await Tournament.create({
      organizationId: organization.id,
      clubId: clubId,
      name,
      sport,
      tier,
      startDate,
      endDate,
      registrationDeadline,
      maxParticipants,
      entryFee,
      venueIds: venueIdsForTournament,
      venueId: venueIdForTournament,
      organiserType: normalizedOrganiserType,
      status: "draft",
      venueRequestStatus,
      setupCurrentStep: hasFullSetupPayload ? SETUP_TOTAL_STEPS : 2,
      setupCompletedSteps: initialSetupCompletedSteps,
      setupCompleted: hasFullSetupPayload,
      rankingScope: rankingScope || ["county"],
      gameId,
      ...otherData,
      autoGenerateFixtures: normalizedScheduling.autoGenerateFixtures,
      flexibleScheduling: normalizedScheduling.flexibleScheduling,
      matchDeadlineEnforcement: normalizedScheduling.enforceDeadlines,
      autoForfeitOverdue: normalizedScheduling.autoForfeit,
      ranked: rankedDefaulted,
      entryMethods: entryMethodsMapping,
      ...entryMethodsFlags,
    });

    // Create tournament-specific venue requests for ALL external venues
    if (venueRequestStatus === "pending" && pendingVenueOwners.length > 0) {
      for (const venueOwner of pendingVenueOwners) {
        const existingPending = await VenueRequest.findOne({
          where: {
            tournamentId: tournament.id,
            venueId: venueOwner.id,
            status: "pending",
          },
        });

        if (!existingPending) {
          const venueRequestRow = await VenueRequest.create({
            tournamentId: tournament.id,
            venueId: venueOwner.id,
            requesterOrganizerId: organization.id,
            venueOwnerId: venueOwner.id,
            status: "pending",
          });

          try {
            const venueOwnerUser = venueOwner.userId ? await User.findByPk(venueOwner.userId) : null;
            let recipientEmail = null;
            if (venueOwnerUser && venueOwnerUser.email) recipientEmail = venueOwnerUser.email;
            if (!recipientEmail && venueOwner.email) recipientEmail = venueOwner.email;
            if (!recipientEmail) {
              try {
                const ownerOrg = await Organization.findByPk(venueOwner.organizationId);
                if (ownerOrg && ownerOrg.userId) {
                  const ownerOrgUser = await User.findByPk(ownerOrg.userId);
                  if (ownerOrgUser && ownerOrgUser.email) recipientEmail = ownerOrgUser.email;
                }
              } catch (ownerEmailErr) {
                console.warn("Failed to resolve venue owner org user email:", ownerEmailErr.message || ownerEmailErr);
              }
            }

            if (recipientEmail) {
              const requesterUser = await User.findByPk(userId);
              await sendTournamentVenueRequestEmail({
                recipientEmail,
                recipientName: venueOwner.name || venueOwner.venueName || "Venue Owner",
                venueName: venueOwner.venueName || "Your venue",
                tournamentName: name || "New tournament",
                organizationName: organization.organizationName,
                organizerContactEmail: requesterUser?.email || "noreply@cuemetrics.com",
                requestId: venueRequestRow.id,
              });
            } else {
              console.warn(
                `[createTournament] No recipient email for venue owner ${venueOwner.id}; venue request created but email not sent.`
              );
            }
          } catch (emailErr) {
            console.warn("Failed to send venue request email:", emailErr.message || emailErr);
          }
        }
      }
    } else if (venueRequestStatus === "pending" && pendingVenueOwner) {
      // Fallback for backward compatibility: if pendingVenueOwner is set but pendingVenueOwners is not
      const existingPending = await VenueRequest.findOne({
        where: {
          tournamentId: tournament.id,
          venueId: pendingVenueOwner.id,
          status: "pending",
        },
      });

      if (!existingPending) {
        const venueRequestRow = await VenueRequest.create({
          tournamentId: tournament.id,
          venueId: pendingVenueOwner.id,
          requesterOrganizerId: organization.id,
          venueOwnerId: pendingVenueOwner.id,
          status: "pending",
        });

        try {
          const venueOwnerUser = pendingVenueOwner.userId ? await User.findByPk(pendingVenueOwner.userId) : null;
          let recipientEmail = null;
          if (venueOwnerUser && venueOwnerUser.email) recipientEmail = venueOwnerUser.email;
          if (!recipientEmail && pendingVenueOwner.email) recipientEmail = pendingVenueOwner.email;
          if (!recipientEmail) {
            try {
              const ownerOrg = await Organization.findByPk(pendingVenueOwner.organizationId);
              if (ownerOrg && ownerOrg.userId) {
                const ownerOrgUser = await User.findByPk(ownerOrg.userId);
                if (ownerOrgUser && ownerOrgUser.email) recipientEmail = ownerOrgUser.email;
              }
            } catch (ownerEmailErr) {
              console.warn("Failed to resolve venue owner org user email:", ownerEmailErr.message || ownerEmailErr);
            }
          }

          if (recipientEmail) {
            const requesterUser = await User.findByPk(userId);
            await sendTournamentVenueRequestEmail({
              recipientEmail,
              recipientName: pendingVenueOwner.name || pendingVenueOwner.venueName || "Venue Owner",
              venueName: pendingVenueOwner.venueName || "Your venue",
              tournamentName: name || "New tournament",
              organizationName: organization.organizationName,
              organizerContactEmail: requesterUser?.email || "noreply@cuemetrics.com",
              requestId: venueRequestRow.id,
            });
          } else {
            console.warn(
              `[createTournament] No recipient email for venue owner ${pendingVenueOwner.id}; venue request created but email not sent.`
            );
          }
        } catch (mailErr) {
          console.warn("[createTournament] Tournament venue request email failed:", mailErr.message || mailErr);
        }
      }
    }

    // Create tournament format configuration (and link to tournament)
    let createdFormat = null;
    if (formatConfig) {
      // ── VALIDATE SEEDING CONFIGURATION ───────────────────────────────
      if (formatConfig.seeding === 'manual') {
        const seedingValidation = validateSeedingConfig(
          formatConfig.seeding,
          formatConfig,
          [] // Empty array during tournament creation (no players enrolled yet)
        );

        if (!seedingValidation.isValid) {
          // Log warnings but don't fail - manual seeding will be finalized before fixture generation
          console.warn('[createTournament] Manual seeding warnings:', seedingValidation.errors);
        }
      }

      // ── VALIDATE BYE HANDLING & SEEDING COMPATIBILITY ─────────────────
      // For knockout tournaments, validate bye handling selection
      if (formatConfig.type === 'knockout' && formatConfig.byesHandling) {
        const byeValidation = validateSeedingByeCompatibility(
          formatConfig.byesHandling,
          formatConfig.seeding,
          maxParticipants
        );

        if (!byeValidation.isValid) {
          return res.status(400).json({
            success: false,
            error: byeValidation.errors[0],
            errorCode: 'INVALID_BYE_SEEDING_COMBINATION',
            details: byeValidation.errors,
          });
        }

        if (byeValidation.warnings.length > 0) {
          console.warn('[createTournament] Bye handling warnings:', byeValidation.warnings);
        }
      }

      // ── CLEAR bestOfFrames when useRoundFormats is true ─────────────────
      // When per-round format configuration is enabled, don't use global bestOfFrames
      const formatConfigToCreate = { ...formatConfig };
      if (formatConfigToCreate.useRoundFormats === true || formatConfigToCreate.useRoundFormats === 'true' || formatConfigToCreate.useRoundFormats === 1) {
        formatConfigToCreate.bestOfFrames = null;
      }

      createdFormat = await TournamentFormat.create({
        tournamentId: tournament.id,
        ...formatConfigToCreate,
      });
      await tournament.update({ formatId: createdFormat.id });
    }

    // Create tournament scoring rules (and link to tournament)
    let createdScoring = null;
    if (scoringRules) {
      // Validate scoring rules before creating
      const { pointsWin, pointsDraw, pointsLoss, pointsWalkover } = scoringRules;

      // Check for negative values
      if ((pointsWin ?? 0) < 0 || (pointsDraw ?? 0) < 0 || (pointsLoss ?? 0) < 0 || (pointsWalkover ?? 0) < 0) {
        return res.status(400).json({
          success: false,
          error: "Scoring point values cannot be negative",
        });
      }

      // Check that at least one value is greater than 0
      if (
        (pointsWin ?? 0) === 0 &&
        (pointsDraw ?? 0) === 0 &&
        (pointsLoss ?? 0) === 0 &&
        (pointsWalkover ?? 0) === 0
      ) {
        return res.status(400).json({
          success: false,
          error: "At least one scoring point value must be greater than 0",
        });
      }

      createdScoring = await TournamentScoringRules.create({
        tournamentId: tournament.id,
        ...scoringRules,
      });
      await tournament.update({ scoringRulesId: createdScoring.id });
    }

    // Fetch fresh tournament with associations to return
    const fullTournament = await Tournament.findByPk(tournament.id, {
      include: [
        { association: "organization", attributes: ["id", "organizationName", "contactPersonName"] },
        { association: "club", attributes: ["id", "name", "slug"] },
        { association: "format", attributes: ["id", "tournamentId", "type", "bestOfFrames", "playAllFrames", "seeding", "rankingSource", "manualSeedOrder", "roundFormats", "byesHandling", "preliminaryRoundSize", "groupCount", "playersPerGroup", "qualifiersPerGroup", "knockoutStartRound", "maxRounds"] },
        { association: "scoringRules" },
        { association: "participants", include: [{ association: "player", attributes: ["id", "name"] }] },
      ],
    });

    // Log action
    await AuditLog.create({
      action: "tournament_created",
      entityType: "tournament",
      entityId: tournament.id,
      userId,
      notes: `Tournament "${name}" created under club "${club.name}"`,
    });

    // Normalize entryMethods on response
    try {
      fullTournament.dataValues.entryMethods = parseEntryMethods(fullTournament.entryMethods, fullTournament);
    } catch (e) {
      // ignore
    }
    withSchedulingConfigPayload(fullTournament);

    res.status(201).json({
      success: true,
      data: fullTournament,
      message: "Tournament created successfully for club: " + club.name,
    });
  } catch (error) {
    console.error("createTournament error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get all tournaments (paginated)
 */
exports.getTournaments = async (req, res) => {
  try {
    const { userId, role } = req.user;
    // Parse query parameters with explicit parsing and add debug logging
    let { sport, tier, status, organizationId, ranked, honors } = req.query;
    const honorsView = honors === "true";
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);

    const where = {};
    if (sport) where.sport = sport;
    if (tier) where.tier = tier;
    if (status) where.status = status;
    if (ranked !== undefined) where.ranked = ranked === "true";

    // ROLE-BASED ORGANIZER FILTERING (auto-filter by logged-in organizer's organization)
    // If organizationId is provided in query, use it (override for admin/special cases)
    if (organizationId) {
      where.organizationId = organizationId;
      console.log("[getTournaments] Using query param organizationId:", organizationId);
    } else if (role === "organization" && !honorsView) {
      // For organization users, automatically filter by their organization
      try {
        const organization = await Organization.findOne({ where: { userId } });
        if (organization) {
          where.organizationId = organization.id;
          console.log("[getTournaments] Auto-filtering by user's organization:", organization.id);
        } else {
          console.log("[getTournaments] No organization found for user:", userId);
          return res.json({ success: true, data: [], message: "No organization found for this user" });
        }
      } catch (orgError) {
        console.error("[getTournaments] Organization lookup error:", orgError.message);
        throw orgError;
      }
    } else if (!honorsView && (role === "club_admin" || role === "tournament_manager")) {
      // For club admins and tournament managers, filter to tournaments they manage
      // Get all clubs where this user is an admin/manager
      try {
        const clubMemberships = await ClubMember.findAll({
          where: {
            userId,
            role: { [Op.in]: ["club_admin", "assistant_admin", "tournament_manager"] },
            status: "active",
          },
          attributes: ["clubId"],
        });

        if (clubMemberships.length > 0) {
          const clubIds = clubMemberships.map((m) => m.clubId);
          where.clubId = { [Op.in]: clubIds };
          console.log("[getTournaments] Auto-filtering by user's club memberships:", clubIds);
        } else {
          console.log("[getTournaments] User has no club admin/manager memberships");
          return res.json({ success: true, data: [], message: "You do not manage any clubs" });
        }
      } catch (clubError) {
        console.error("[getTournaments] Club membership lookup error:", clubError.message);
        throw clubError;
      }
    }
    // Super admins and other roles see what's filtered by params only

    const offset = (page - 1) * limit;

    console.log("[getTournaments] params:", { sport, tier, status, organizationId, ranked, page, limit, where, offset });

    let count = 0;
    let rows = [];

    try {
      const result = await Tournament.findAndCountAll({
        where,
        include: [
          { association: "organization", attributes: ["id", "organizationName"], required: false },
          { association: "club", attributes: ["id", "name"], required: false },
          {
            association: "format",
            required: false,
            attributes: [
              "id", "tournamentId", "type", "bestOfFrames", "playAllFrames",
              "seeding", "rankingSource", "manualSeedOrder", "roundFormats",
              "byesHandling", "preliminaryRoundSize", "groupCount", "playersPerGroup",
              "qualifiersPerGroup", "knockoutStartRound", "maxRounds",
              "createdAt", "updatedAt"
            ]
          },
          { association: "scoringRules", required: false },
        ],
        offset,
        limit,
        distinct: true,
        subQuery: false,
      });
      count = result.count;
      rows = result.rows;
    } catch (queryError) {
      console.error("[getTournaments] findAndCountAll error:", queryError.message);
      console.error("[getTournaments] SQL:", queryError.sql);
      throw queryError;
    }

    console.log("[getTournaments] resultCount:", count);

    // Normalize entryMethods and fetch active join codes
    const normalizedRows = await Promise.all(rows.map(async (r) => {
      try {
        const parsed = parseEntryMethods(r.entryMethods, r);
        r.dataValues.entryMethods = parsed;
      } catch (e) {
        // ignore and return original
      }

      // Fetch active join codes for this tournament
      try {
        const joinCodes = await TournamentInvitation.findAll({
          where: {
            tournamentId: r.id,
            type: "join_code",
            status: "sent",
          },
          order: [["createdAt", "DESC"]],
          raw: true,
        });

        // Filter out expired and maxed-out codes
        const activeJoinCodes = joinCodes.filter((code) => {
          const isExpired = code.joinCodeExpiresAt && new Date() > new Date(code.joinCodeExpiresAt);
          const isMaxedOut = code.maxUsages && code.usageCount >= code.maxUsages;
          return !isExpired && !isMaxedOut;
        });

        r.dataValues.activeJoinCodes = activeJoinCodes;
      } catch (joinCodeError) {
        console.error("[getTournaments] Error fetching join codes:", joinCodeError.message);
        r.dataValues.activeJoinCodes = [];
      }

      withSchedulingConfigPayload(r);

      return r;
    }));

    res.json({
      success: true,
      data: normalizedRows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
  } catch (error) {
    console.error("[getTournaments] Error details:", {
      message: error.message,
      code: error.code,
      sql: error.sql,
      stack: error.stack
    });
    res.status(500).json({ success: false, error: "Internal server error", details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

/**
 * GET /api/tournaments/withdrawals-feed
 * All withdrawn participants across this organizer's tournaments (newest first).
 */
exports.getOrganizationWithdrawalsFeed = async (req, res) => {
  try {
    const { userId, role } = req.user;
    if (role !== "organization") {
      return res.status(403).json({ success: false, error: "Organization access required" });
    }
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const rows = await TournamentParticipant.findAll({
      where: { status: "withdrawn" },
      include: [
        {
          association: "tournament",
          where: { organizationId: organization.id },
          required: true,
          attributes: ["id", "name", "status", "startDate", "sport"],
        },
        {
          association: "player",
          required: false,
          attributes: ["id", "name"],
        },
      ],
      order: [["withdrawnDate", "DESC"]],
      limit: 500,
    });

    const data = rows.map((p) => ({
      id: p.id,
      tournamentId: p.tournamentId,
      tournamentName: p.tournament?.name,
      tournamentStatus: p.tournament?.status,
      playerId: p.playerId,
      playerName: p.player?.name || null,
      withdrawnDate: p.withdrawnDate,
      withdrawalReason: p.withdrawalReason,
      withdrawalStage: p.withdrawalStage,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("getOrganizationWithdrawalsFeed error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get tournament details
 */
exports.getTournamentById = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId, {
      include: [
        { association: "organization", attributes: ["id", "organizationName", "contactPersonName"] },
        { association: "format", attributes: ["id", "tournamentId", "type", "bestOfFrames", "playAllFrames", "seeding", "rankingSource", "manualSeedOrder", "roundFormats", "byesHandling", "preliminaryRoundSize", "groupCount", "playersPerGroup", "qualifiersPerGroup", "knockoutStartRound", "maxRounds"] },
        { association: "scoringRules" },
        { association: "participants", include: [{ association: "player", attributes: ["id", "name"] }] },
      ],
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Normalize entryMethods for response
    try {
      tournament.dataValues.entryMethods = parseEntryMethods(tournament.entryMethods, tournament);
    } catch (e) {
      // ignore
    }

    // Fetch current standings if tournament has started
    if (tournament.status !== "draft" && tournament.status !== "registration") {
      const matches = await TournamentMatch.findAll({
        where: { tournamentId, status: "completed" },
      });
      const standings = ScoringEngine.calculateStandings(
        tournament.participants,
        matches,
        tournament.scoringRules
      );
      tournament.dataValues.standings = standings;
    }

    withSchedulingConfigPayload(tournament);

    res.json({ success: true, data: tournament });
  } catch (error) {
    console.error("getTournamentById error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Update tournament settings
 */
exports.updateTournament = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const updateData = { ...(req.body || {}) };
    if (updateData.organiserType === undefined && updateData.organizerType !== undefined) {
      updateData.organiserType = updateData.organizerType;
    }
    delete updateData.organizerType;
    if (updateData.standingsDisplay === undefined && updateData.standingsColumns !== undefined) {
      updateData.standingsDisplay = { columns: updateData.standingsColumns };
    }
    if (updateData.standingsColumns !== undefined) {
      delete updateData.standingsColumns;
    }

    // Official ranking state is platform-owner controlled only.
    delete updateData.isOfficialRanking;
    delete updateData.officialApprovedBy;
    delete updateData.officialApprovedAt;

    // Verify organization ownership
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const tournament = await Tournament.findOne({
      where: { id: tournamentId, organizationId: organization.id },
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found or access denied" });
    }

    if (updateData.standingsDisplay !== undefined) {
      const effectiveSport = updateData.sport || tournament.sport;
      updateData.standingsDisplay = normalizeStandingsDisplayConfig(updateData.standingsDisplay, effectiveSport);
    }

    // Venue gate: organizer cannot move the tournament into runnable phases
    // until the venue approval workflow is accepted.
    if (updateData.status) {
      const nextStatus = String(updateData.status);
      const venueRequiredForStatuses = ["registration", "registration_closed", "fixtures_generated", "in_progress"];
      if (venueRequiredForStatuses.includes(nextStatus) && !isVenueApprovalReady(tournament)) {
        const blocked = getVenueApprovalBlockedError(tournament);
        return res.status(403).json({ success: false, ...blocked });
      }

      // Setup gate: cannot open registration (or later phases) until all wizard steps are complete.
      if (venueRequiredForStatuses.includes(nextStatus) && !isSetupComplete(tournament, updateData)) {
        return res.status(403).json({
          success: false,
          error: "Complete all tournament setup steps before opening registration.",
          errorCode: "SETUP_INCOMPLETE",
        });
      }

      if (nextStatus === "registration") {
        const requiredMissing = [];
        const effectiveName = updateData.name ?? tournament.name;
        const effectiveSport = updateData.sport ?? tournament.sport;
        const effectiveStart = updateData.startDate ?? tournament.startDate;
        const effectiveClub = updateData.clubId ?? tournament.clubId;
        const effectiveRegDeadline = updateData.registrationDeadline ?? tournament.registrationDeadline;
        if (!effectiveName) requiredMissing.push("name");
        if (!effectiveSport) requiredMissing.push("sport");
        if (!effectiveStart) requiredMissing.push("startDate");
        if (!effectiveClub) requiredMissing.push("clubId");
        if (!effectiveRegDeadline) requiredMissing.push("registrationDeadline");

        const formatExists = await TournamentFormat.findOne({ where: { tournamentId } });
        const scoringExists = await TournamentScoringRules.findOne({ where: { tournamentId } });
        if (!formatExists) requiredMissing.push("format");
        if (!scoringExists) requiredMissing.push("scoringRules");

        if (requiredMissing.length > 0) {
          return res.status(403).json({
            success: false,
            error: `Tournament setup incomplete. Missing required items: ${requiredMissing.join(", ")}`,
            errorCode: "SETUP_REQUIRED_FIELDS_MISSING",
          });
        }
      }
    }

    // Prevent changes to certain fields after tournament starts
    if (tournament.status !== "draft" && tournament.status !== "registration") {
      const lockedFields = ["maxParticipants", "startDate", "entryFee"];
      for (const field of lockedFields) {
        if (updateData[field] !== undefined && updateData[field] !== tournament[field]) {
          return res.status(403).json({
            success: false,
            error: `Cannot modify ${field} after tournament has started`,
          });
        }
      }
    }

    const incomingRanked = Object.prototype.hasOwnProperty.call(updateData, "ranked") ? updateData.ranked : undefined;
    const incomingTier = Object.prototype.hasOwnProperty.call(updateData, "tier") ? updateData.tier : undefined;
    const incomingSanctionStatus = Object.prototype.hasOwnProperty.call(updateData, "sanctionStatus")
      ? updateData.sanctionStatus
      : undefined;
    // Prevent organization from changing tier/ranked/sanction after draft (sanctioning workflow).
    delete updateData.tier;
    delete updateData.ranked;
    delete updateData.sanctionStatus;

    const normalizedScheduling = TournamentSchedulingService.normalizeSchedulingConfig(
      updateData.schedulingConfig || {},
      {
        autoGenerateFixtures: updateData.autoGenerateFixtures ?? tournament.autoGenerateFixtures,
        flexibleScheduling: updateData.flexibleScheduling ?? tournament.flexibleScheduling,
        matchDeadlineEnforcement:
          updateData.matchDeadlineEnforcement ?? tournament.matchDeadlineEnforcement,
        autoForfeitOverdue: updateData.autoForfeitOverdue ?? tournament.autoForfeitOverdue,
      }
    );
    if (Object.prototype.hasOwnProperty.call(updateData, "schedulingConfig")) {
      updateData.autoGenerateFixtures = normalizedScheduling.autoGenerateFixtures;
      updateData.flexibleScheduling = normalizedScheduling.flexibleScheduling;
      updateData.matchDeadlineEnforcement = normalizedScheduling.enforceDeadlines;
      updateData.autoForfeitOverdue = normalizedScheduling.autoForfeit;
    }
    delete updateData.schedulingConfig;

    // Extract nested objects that map to separate models
    const { format: formatData, scoringRules: scoringRulesData, ...tournamentFields } = updateData;

    const effectiveLateConfigInput = {
      allowLateRegistration:
        Object.prototype.hasOwnProperty.call(tournamentFields, "allowLateRegistration")
          ? tournamentFields.allowLateRegistration
          : tournament.allowLateRegistration,
      lateRegistrationMode:
        Object.prototype.hasOwnProperty.call(tournamentFields, "lateRegistrationMode")
          ? tournamentFields.lateRegistrationMode
          : tournament.lateRegistrationMode,
      lateRegistrationDeadline:
        Object.prototype.hasOwnProperty.call(tournamentFields, "lateRegistrationDeadline")
          ? tournamentFields.lateRegistrationDeadline
          : tournament.lateRegistrationDeadline,
    };
    const normalizedLateRegistration = normalizeLateRegistrationConfig(effectiveLateConfigInput);
    tournamentFields.allowLateRegistration = normalizedLateRegistration.allowLateRegistration;
    tournamentFields.lateRegistrationMode = normalizedLateRegistration.lateRegistrationMode;
    tournamentFields.lateRegistrationDeadline = normalizedLateRegistration.lateRegistrationDeadline;

    if (Object.prototype.hasOwnProperty.call(tournamentFields, 'maxFixtureRegenerations')) {
      const mfr = parseInt(tournamentFields.maxFixtureRegenerations, 10);
      tournamentFields.maxFixtureRegenerations = Number.isFinite(mfr) && mfr > 0 ? mfr : 3;
    }

    if (tournament.status === "draft") {
      if (incomingRanked !== undefined) {
        tournamentFields.ranked =
          incomingRanked === true || incomingRanked === "true" || incomingRanked === 1 || incomingRanked === "1";
      }
      if (incomingTier != null && incomingTier !== "") {
        tournamentFields.tier = incomingTier;
      }
      if (incomingSanctionStatus != null && incomingSanctionStatus !== "") {
        tournamentFields.sanctionStatus = incomingSanctionStatus;
      }
    }

    // Normalize setup progress fields (if provided).
    if (Object.prototype.hasOwnProperty.call(tournamentFields, "setupCompletedSteps")) {
      tournamentFields.setupCompletedSteps = normalizeSetupSteps(tournamentFields.setupCompletedSteps);
    }
    if (Object.prototype.hasOwnProperty.call(tournamentFields, "setupCurrentStep")) {
      const nextStep = Number(tournamentFields.setupCurrentStep);
      tournamentFields.setupCurrentStep = Number.isInteger(nextStep)
        ? Math.max(1, Math.min(SETUP_TOTAL_STEPS, nextStep))
        : tournament.setupCurrentStep || 1;
    }
    if (Object.prototype.hasOwnProperty.call(tournamentFields, "setupCompleted")) {
      tournamentFields.setupCompleted = Boolean(tournamentFields.setupCompleted);
    }

    // Normalize withdrawal rules (clean up extra fields)
    if (Object.prototype.hasOwnProperty.call(tournamentFields, "withdrawalRules")) {
      console.log('[DEBUG] Before normalization:', JSON.stringify(tournamentFields.withdrawalRules));
      tournamentFields.withdrawalRules = normalizeWithdrawalRules(tournamentFields.withdrawalRules);
      console.log('[DEBUG] After normalization:', JSON.stringify(tournamentFields.withdrawalRules));
    }

    // Sync entry method boolean flags back to entryMethods JSON
    const entryMethodsBooleanFields = [
      'allowsSelfRegistration',
      'allowsInvitations',
      'allowsJoinCodes',
      'allowsAdminEntry',
      'allowsOpenRegistration'
    ];

    let updatedEntryMethods = { ...tournament.entryMethods };
    entryMethodsBooleanFields.forEach(field => {
      if (tournamentFields[field] !== undefined) {
        // Map boolean field back to entryMethods JSON keys
        const mappedKey = {
          allowsSelfRegistration: 'selfRegistration',
          allowsInvitations: 'invitationLink',
          allowsJoinCodes: 'joinCode',
          allowsAdminEntry: 'adminEntry',
          allowsOpenRegistration: 'openRequestWithApproval'
        }[field];
        updatedEntryMethods[mappedKey] = tournamentFields[field];
      }
    });

    // Update entryMethods JSON if any entry method fields were updated
    if (Object.keys(tournamentFields).some(key => entryMethodsBooleanFields.includes(key))) {
      tournamentFields.entryMethods = updatedEntryMethods;
    }

    // Update tournament base fields
    console.log('[DEBUG] Fields to update:', Object.keys(tournamentFields));
    console.log('[DEBUG] Updating tournament:', tournament.id);
    console.log('[DEBUG] Complete fields object:', JSON.stringify({
      setupCurrentStep: tournamentFields.setupCurrentStep,
      setupCompletedSteps: tournamentFields.setupCompletedSteps,
      withdrawalRules: tournamentFields.withdrawalRules,
      allowLateRegistration: tournamentFields.allowLateRegistration,
    }, null, 2));
    try {
      await tournament.update(tournamentFields);
      console.log('[DEBUG] Tournament updated successfully');
    } catch (updateErr) {
      console.error('[DEBUG] Tournament.update() FAILED');
      console.error('[DEBUG] Error message:', updateErr.message);
      console.error('[DEBUG] Error name:', updateErr.name);
      console.error('[DEBUG] Error stack:', updateErr.stack);
      if (updateErr.errors) {
        console.error('[DEBUG] Validation errors:', JSON.stringify(updateErr.errors, null, 2));
      }
      if (updateErr.sql) {
        console.error('[DEBUG] SQL:', updateErr.sql);
      }
      throw updateErr;
    }

    // If global deadline enforcement is enabled with a tournament deadline date,
    // synchronize all existing match deadlines to that single tournament deadline.
    const enforcedScheduling =
      TournamentSchedulingService.getSchedulingConfigFromTournament({
        ...tournament.dataValues,
        ...tournamentFields,
      });
    const syncedTournamentDeadline = resolveTournamentDeadline({
      ...tournament.dataValues,
      ...tournamentFields,
    });
    if (enforcedScheduling.enforceDeadlines && syncedTournamentDeadline) {
      await TournamentMatch.update(
        { scheduledDeadline: syncedTournamentDeadline },
        { where: { tournamentId: tournament.id } }
      );
    }

    // Upsert TournamentFormat if provided
    if (formatData) {
      // ── CLEAR bestOfFrames when useRoundFormats is true ─────────────────
      // When per-round format configuration is enabled, don't use global bestOfFrames
      const formatDataToUpdate = { ...formatData };
      if (formatDataToUpdate.useRoundFormats === true || formatDataToUpdate.useRoundFormats === 'true' || formatDataToUpdate.useRoundFormats === 1) {
        formatDataToUpdate.bestOfFrames = null;
      }

      const existingFormat = await TournamentFormat.findOne({ where: { tournamentId: tournament.id } });
      if (existingFormat) {
        await existingFormat.update(formatDataToUpdate);
      } else {
        await TournamentFormat.create({ tournamentId: tournament.id, ...formatDataToUpdate });
      }
    }

    // Upsert TournamentScoringRules if provided
    if (scoringRulesData) {
      // Validate scoring rules before updating
      const { pointsWin, pointsDraw, pointsLoss, pointsWalkover } = scoringRulesData;

      // Check for negative values
      if ((pointsWin ?? 0) < 0 || (pointsDraw ?? 0) < 0 || (pointsLoss ?? 0) < 0 || (pointsWalkover ?? 0) < 0) {
        return res.status(400).json({
          success: false,
          error: "Scoring point values cannot be negative",
        });
      }

      // Check that at least one value is greater than 0
      if (
        (pointsWin ?? 0) === 0 &&
        (pointsDraw ?? 0) === 0 &&
        (pointsLoss ?? 0) === 0 &&
        (pointsWalkover ?? 0) === 0
      ) {
        return res.status(400).json({
          success: false,
          error: "At least one scoring point value must be greater than 0",
        });
      }

      const existingRules = await TournamentScoringRules.findOne({ where: { tournamentId: tournament.id } });
      if (existingRules) {
        await existingRules.update(scoringRulesData);
      } else {
        await TournamentScoringRules.create({ tournamentId: tournament.id, ...scoringRulesData });
      }
    }

    // If both format + scoring exist after update, promote setup progress to completed.
    const existingFormatAfter = await TournamentFormat.findOne({ where: { tournamentId: tournament.id } });
    const existingScoringAfter = await TournamentScoringRules.findOne({ where: { tournamentId: tournament.id } });
    const hasFormatAfter = Boolean(existingFormatAfter);
    const hasScoringAfter = Boolean(existingScoringAfter);
    if (hasFormatAfter && hasScoringAfter) {
      const mergedSteps = new Set([
        ...normalizeSetupSteps(tournament.setupCompletedSteps),
        ...SETUP_REQUIRED_STEPS,
      ]);
      await tournament.update({
        setupCurrentStep: SETUP_TOTAL_STEPS,
        setupCompletedSteps: [...mergedSteps].sort((a, b) => a - b),
        setupCompleted: true,
      });
    }

    // Fetch fresh tournament with associations
    const updatedTournament = await Tournament.findByPk(tournament.id, {
      include: [
        { association: "organization", attributes: ["id", "organizationName", "contactPersonName"] },
        { association: "format", attributes: ["id", "tournamentId", "type", "bestOfFrames", "playAllFrames", "seeding", "rankingSource", "manualSeedOrder", "roundFormats", "byesHandling", "preliminaryRoundSize", "groupCount", "playersPerGroup", "qualifiersPerGroup", "knockoutStartRound", "maxRounds"] },
        { association: "scoringRules" },
        { association: "participants", include: [{ association: "player", attributes: ["id", "name"] }] },
      ],
    });

    // Log action
    await AuditLog.create({
      action: "tournament_updated",
      entityType: "tournament",
      entityId: tournament.id,
      userId,
      newValue: updateData,
    });

    // Normalize entryMethods on response
    try {
      updatedTournament.dataValues.entryMethods = parseEntryMethods(updatedTournament.entryMethods, updatedTournament);
    } catch (e) {
      // ignore
    }
    withSchedulingConfigPayload(updatedTournament);

    res.json({
      success: true,
      data: updatedTournament,
      message: "Tournament updated successfully",
    });
  } catch (error) {
    console.error("updateTournament CATCH BLOCK error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...(error.sql && { sql: error.sql }),
      ...(error.errors && { validationErrors: error.errors }),
    });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Archive/complete tournament
 */
exports.completeTournament = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const tournament = await Tournament.findOne({
      where: { id: tournamentId, organizationId: organization.id },
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Mark as completed and archived
    await tournament.update({
      status: "completed",
      isArchived: true,
      archivedDate: new Date(),
    });

    // If tournament is ranked, process ranking points using RankingEngine
    if (tournament.ranked) {
      const participants = await TournamentParticipant.findAll({
        where: { tournamentId, status: "approved" },
      });

      const completedMatches = await TournamentMatch.findAll({
        where: { tournamentId, status: "completed" },
      });

      // ── Validate ranking configuration before awarding points ─────────────────
      const rankingConfig = {
        ranked: tournament.ranked,
        tier: tournament.tier,
        rankingScope: tournament.rankingScope || [],
        minPlayersForRankingPoints: tournament.minPlayersForRankingPoints,
        rankingPointsPerRound: tournament.rankingPointsPerRound
      };

      // Check tier-scope compatibility and log warnings
      const tierScopeCheck = rankingPresetService.checkTierScopeCompatibility(
        tournament.tier,
        tournament.rankingScope || []
      );

      if (tierScopeCheck.warnings.length > 0) {
        console.warn(`[completeTournament] Tier-scope compatibility warnings for tournament ${tournamentId}:`, tierScopeCheck.warnings);
      }

      // Validate minimum players threshold - UPDATED: below-threshold tournaments get 50% weighting
      // No longer skip tournaments with fewer than minimum players
      const approvedCount = participants.length;
      const minRequired = tournament.minPlayersForRankingPoints ||
        rankingPresetService.getRecommendedMinimumPlayers(tournament.tier);

      // NEW: Map old tier to new tier level for minimum checking
      const rankingPresetServiceModule = require('../services/rankingPresetService');
      const newTierLevel = rankingPresetServiceModule.mapTier(tournament.tier);
      const tier3Minimum = rankingPresetServiceModule.getTier3MinimumPlayers(newTierLevel);
      const absoluteMinimum = Math.ceil(tier3Minimum / 2);  // 50% weighting means we need at least half the minimum

      if (approvedCount < absoluteMinimum) {
        console.log(`[completeTournament] Tournament ${tournamentId} has ${approvedCount} players, absolute minimum ${absoluteMinimum} required even with 50% weighting. Skipping ranking point award.`);

        // Still mark tournament as completed but skip ranking points
        await AuditLog.create({
          action: "tournament_completed",
          entityType: "tournament",
          entityId: tournament.id,
          userId,
          notes: `Tournament completed but ranking points not awarded (${approvedCount} players < ${absoluteMinimum} absolute minimum for 50% weighting)`,
        });

        return res.json({
          success: true,
          data: tournament,
          message: "Tournament completed and archived",
          rankingPointsSkipped: true,
          reason: `Insufficient players for ranking points even with 50% weighting (${approvedCount}/${absoluteMinimum})`
        });
      }

      if (approvedCount < tier3Minimum) {
        console.log(`[completeTournament] Tournament ${tournamentId} has ${approvedCount} players (below ${tier3Minimum} minimum), ranking points will be awarded at 50% weighting.`);
      }

      // ── Derive finishing positions from bracket results ───────────────────────
      // Only use knockout matches (exclude group-stage matches which have groupNumber set)
      const knockoutMatches = completedMatches.filter(
        (m) => !m.groupNumber && m.roundType !== "group_stage"
      );

      // Map playerId → finishingPosition
      const positionMap = {};

      if (knockoutMatches.length > 0) {
        // Group by roundNumber; process rounds high→low (final first)
        const roundNumbers = [...new Set(knockoutMatches.map((m) => m.roundNumber))]
          .filter(Boolean)
          .sort((a, b) => b - a);

        const finalRound = roundNumbers[0];
        let nextPosition = 1;

        for (const rn of roundNumbers) {
          const roundMatches = knockoutMatches.filter((m) => m.roundNumber === rn);

          if (rn === finalRound) {
            // Final: winner = 1, loser = 2
            const finalMatch = roundMatches[0];
            if (finalMatch?.winner && finalMatch.winner !== 'draw') {
              const winnerId = finalMatch.winner === "player1" ? finalMatch.player1Id : finalMatch.player2Id;
              const loserId = finalMatch.winner === "player1" ? finalMatch.player2Id : finalMatch.player1Id;
              if (winnerId) positionMap[winnerId] = 1;
              if (loserId) positionMap[loserId] = 2;
              nextPosition = 3;
            } else if (finalMatch && (finalMatch.winner === 'draw' || !finalMatch.winner)) {
              // Final is a draw: use overall tournament stats as tie-breaker
              const p1Id = finalMatch.player1Id;
              const p2Id = finalMatch.player2Id;

              // Helper to calculate tournament stats for a player
              const getPlayerStats = (playerId) => {
                const playerMatches = completedMatches.filter(m => m.player1Id === playerId || m.player2Id === playerId);
                const fw = playerMatches.reduce((sum, m) => sum + (m.player1Id === playerId ? (m.player1FramesWon || 0) : (m.player2FramesWon || 0)), 0);
                const fl = playerMatches.reduce((sum, m) => sum + (m.player1Id === playerId ? (m.player2FramesWon || 0) : (m.player1FramesWon || 0)), 0);
                const hb = playerMatches.reduce((max, m) => Math.max(max, (m.player1Id === playerId ? (m.player1HighestBreak || 0) : (m.player2HighestBreak || 0))), 0);
                return { playerId, fw, fd: fw - fl, hb };
              };

              const p1Stats = getPlayerStats(p1Id);
              const p2Stats = getPlayerStats(p2Id);

              // Comparison logic: FD -> FW -> HB -> Random
              let winnerId, loserId;
              if (p1Stats.fd !== p2Stats.fd) {
                winnerId = p1Stats.fd > p2Stats.fd ? p1Id : p2Id;
              } else if (p1Stats.fw !== p2Stats.fw) {
                winnerId = p1Stats.fw > p2Stats.fw ? p1Id : p2Id;
              } else if (p1Stats.hb !== p2Stats.hb) {
                winnerId = p1Stats.hb > p2Stats.hb ? p1Id : p2Id;
              } else {
                winnerId = p1Id; // Fallback to P1 (or could be random)
              }
              loserId = winnerId === p1Id ? p2Id : p1Id;

              console.log(`[completeTournament] Final match ${finalMatch.id} was a draw. Tie-breaker applied: Winner=${winnerId} (FD:${p1Stats.fd} vs ${p2Stats.fd}, FW:${p1Stats.fw} vs ${p2Stats.fw}, HB:${p1Stats.hb} vs ${p2Stats.hb})`);

              if (winnerId) positionMap[winnerId] = 1;
              if (loserId) positionMap[loserId] = 2;
              nextPosition = 3;
            }
          } else {
            // Earlier rounds: all losers share the same tied position
            const losers = roundMatches
              .filter((m) => m.winner)
              .map((m) => (m.winner === "player1" ? m.player2Id : m.player1Id))
              .filter(Boolean);
            for (const loserId of losers) {
              if (!positionMap[loserId]) positionMap[loserId] = nextPosition;
            }
            nextPosition += losers.length;
          }
        }
      } else if (completedMatches.length > 0) {
        // Group/round-robin only: sort by wins then frame diff
        const standings = {};
        for (const p of participants) {
          standings[p.playerId] = { playerId: p.playerId, wins: 0, fd: 0 };
        }
        for (const m of completedMatches) {
          if (standings[m.player1Id]) {
            if (m.winner === "player1") standings[m.player1Id].wins++;
            standings[m.player1Id].fd += (m.player1FramesWon || 0) - (m.player2FramesWon || 0);
          }
          if (standings[m.player2Id]) {
            if (m.winner === "player2") standings[m.player2Id].wins++;
            standings[m.player2Id].fd += (m.player2FramesWon || 0) - (m.player1FramesWon || 0);
          }
        }
        const sorted = Object.values(standings).sort((a, b) =>
          b.wins !== a.wins ? b.wins - a.wins : b.fd - a.fd
        );
        sorted.forEach((s, i) => { positionMap[s.playerId] = i + 1; });
      }

      // Assign nextPosition to any participant not yet mapped (withdrew / eliminated in groups)
      let nextPos = Object.keys(positionMap).length + 1;
      for (const p of participants) {
        if (!positionMap[p.playerId]) positionMap[p.playerId] = nextPos++;
      }

      // Persist finishingPosition on each participant
      for (const p of participants) {
        const pos = positionMap[p.playerId];
        if (pos) await p.update({ finishingPosition: pos });
      }

      // ── Award ranking points with positions now set ───────────────────────────
      // Reload participants so RankingEngine reads the updated finishingPosition
      const participantsWithPos = await TournamentParticipant.findAll({
        where: { tournamentId, status: "approved" },
      });

      // Use RankingEngine which enforces must-win-1-match, tier minimums, correct point values
      const { history, skippedReason } = await RankingEngine.awardRankingPoints(
        tournament,
        participantsWithPos,
        completedMatches
      );

      if (skippedReason) {
        console.log(`[completeTournament] Ranking points skipped: ${skippedReason}`);
      }

      // Persist ranking point records (append-only ranking log)
      for (const entry of history) {
        await RankingPointsHistory.findOrCreate({
          where: { dedupeKey: entry.dedupeKey || null },
          defaults: entry,
        });
      }

      // Update participant stats from matches AND store rankingPointsAwarded
      const historyByPlayer = {};
      for (const entry of history) historyByPlayer[entry.playerId] = entry.pointsAwarded;

      for (const participant of participantsWithPos) {
        const playerMatches = completedMatches.filter(
          (m) => m.player1Id === participant.playerId || m.player2Id === participant.playerId
        );
        const matchesWon = playerMatches.filter((m) => {
          if (m.winner === "player1" && m.player1Id === participant.playerId) return true;
          if (m.winner === "player2" && m.player2Id === participant.playerId) return true;
          return false;
        }).length;
        const matchesLost = playerMatches.length - matchesWon;
        const framesWon = playerMatches.reduce((sum, m) => {
          return sum + (m.player1Id === participant.playerId ? (m.player1FramesWon || 0) : (m.player2FramesWon || 0));
        }, 0);
        const framesLost = playerMatches.reduce((sum, m) => {
          return sum + (m.player1Id === participant.playerId ? (m.player2FramesWon || 0) : (m.player1FramesWon || 0));
        }, 0);
        await participant.update({
          matchesWon,
          matchesLost,
          framesWon,
          framesLost,
          rankingPointsAwarded: historyByPlayer[participant.playerId] || 0,
        });
      }
    }

    await AuditLog.create({
      action: "tournament_completed",
      entityType: "tournament",
      entityId: tournament.id,
      userId,
      notes: "Tournament marked as completed and archived",
    });

    res.json({
      success: true,
      data: tournament,
      message: "Tournament completed and archived",
    });
  } catch (error) {
    console.error("completeTournament error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Manually recalculate and award ranking points for a completed tournament
 * This is useful for testing or when ranking points need to be recalculated
 */
exports.recalculateRankingPoints = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const tournament = await Tournament.findOne({
      where: { id: tournamentId, organizationId: organization.id },
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    if (!tournament.ranked) {
      return res.status(400).json({
        success: false,
        error: "This tournament is not configured for ranking points"
      });
    }

    // Get participants and matches
    const participants = await TournamentParticipant.findAll({
      where: { tournamentId, status: "approved" },
    });

    const completedMatches = await TournamentMatch.findAll({
      where: { tournamentId, status: "completed" },
    });

    if (participants.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No approved participants found"
      });
    }

    // Append-only log: no deletions. Duplicate prevention is handled by dedupe keys.

    // ── Derive finishing positions from bracket results ───────────────────────
    const knockoutMatches = completedMatches.filter(
      (m) => !m.groupNumber && m.roundType !== "group_stage"
    );

    const positionMap = {};

    if (knockoutMatches.length > 0) {
      const roundNumbers = [...new Set(knockoutMatches.map((m) => m.roundNumber))]
        .filter(Boolean)
        .sort((a, b) => b - a);

      const finalRound = roundNumbers[0];
      let nextPosition = 1;

      for (const rn of roundNumbers) {
        const roundMatches = knockoutMatches.filter((m) => m.roundNumber === rn);

        if (rn === finalRound) {
          const finalMatch = roundMatches[0];
          if (finalMatch?.winner && finalMatch.winner !== 'draw') {
            const winnerId = finalMatch.winner === "player1" ? finalMatch.player1Id : finalMatch.player2Id;
            const loserId = finalMatch.winner === "player1" ? finalMatch.player2Id : finalMatch.player1Id;
            if (winnerId) positionMap[winnerId] = 1;
            if (loserId) positionMap[loserId] = 2;
            nextPosition = 3;
          } else if (finalMatch && (finalMatch.winner === 'draw' || !finalMatch.winner)) {
            // Final is a draw: use overall tournament stats as tie-breaker
            const p1Id = finalMatch.player1Id;
            const p2Id = finalMatch.player2Id;

            const getPlayerStats = (playerId) => {
              const playerMatches = completedMatches.filter(m => m.player1Id === playerId || m.player2Id === playerId);
              const fw = playerMatches.reduce((sum, m) => sum + (m.player1Id === playerId ? (m.player1FramesWon || 0) : (m.player2FramesWon || 0)), 0);
              const fl = playerMatches.reduce((sum, m) => sum + (m.player1Id === playerId ? (m.player2FramesWon || 0) : (m.player1FramesWon || 0)), 0);
              const hb = playerMatches.reduce((max, m) => Math.max(max, (m.player1Id === playerId ? (m.player1HighestBreak || 0) : (m.player2HighestBreak || 0))), 0);
              return { playerId, fw, fd: fw - fl, hb };
            };

            const p1Stats = getPlayerStats(p1Id);
            const p2Stats = getPlayerStats(p2Id);

            let winnerId, loserId;
            if (p1Stats.fd !== p2Stats.fd) {
              winnerId = p1Stats.fd > p2Stats.fd ? p1Id : p2Id;
            } else if (p1Stats.fw !== p2Stats.fw) {
              winnerId = p1Stats.fw > p2Stats.fw ? p1Id : p2Id;
            } else if (p1Stats.hb !== p2Stats.hb) {
              winnerId = p1Stats.hb > p2Stats.hb ? p1Id : p2Id;
            } else {
              winnerId = p1Id;
            }
            loserId = winnerId === p1Id ? p2Id : p1Id;

            if (winnerId) positionMap[winnerId] = 1;
            if (loserId) positionMap[loserId] = 2;
            nextPosition = 3;
          }
        } else {
          const losers = roundMatches
            .filter((m) => m.winner)
            .map((m) => (m.winner === "player1" ? m.player2Id : m.player1Id))
            .filter(Boolean);
          for (const loserId of losers) {
            if (!positionMap[loserId]) positionMap[loserId] = nextPosition;
          }
          nextPosition += losers.length;
        }
      }
    } else if (completedMatches.length > 0) {
      const standings = {};
      for (const p of participants) {
        standings[p.playerId] = { playerId: p.playerId, wins: 0, fd: 0 };
      }
      for (const m of completedMatches) {
        if (standings[m.player1Id]) {
          if (m.winner === "player1") standings[m.player1Id].wins++;
          standings[m.player1Id].fd += (m.player1FramesWon || 0) - (m.player2FramesWon || 0);
        }
        if (standings[m.player2Id]) {
          if (m.winner === "player2") standings[m.player2Id].wins++;
          standings[m.player2Id].fd += (m.player2FramesWon || 0) - (m.player1FramesWon || 0);
        }
      }
      const sorted = Object.values(standings).sort((a, b) =>
        b.wins !== a.wins ? b.wins - a.wins : b.fd - a.fd
      );
      sorted.forEach((s, i) => { positionMap[s.playerId] = i + 1; });
    }

    // Assign nextPosition to any participant not yet mapped
    let nextPos = Object.keys(positionMap).length + 1;
    for (const p of participants) {
      if (!positionMap[p.playerId]) positionMap[p.playerId] = nextPos++;
    }

    // Update finishing positions
    for (const p of participants) {
      const pos = positionMap[p.playerId];
      if (pos) await p.update({ finishingPosition: pos });
    }

    // Reload participants with updated positions
    const participantsWithPos = await TournamentParticipant.findAll({
      where: { tournamentId, status: "approved" },
    });

    // Award ranking points (with reduced validation for manual recalculation)
    const { history, skippedReason } = await RankingEngine.awardRankingPoints(
      tournament,
      participantsWithPos,
      completedMatches
    );

    if (skippedReason) {
      return res.status(400).json({
        success: false,
        error: `Ranking points could not be awarded: ${skippedReason}`,
        participants: participants.length,
        completedMatches: completedMatches.length
      });
    }

    // Persist ranking point records (append-only ranking log)
    for (const entry of history) {
      await RankingPointsHistory.findOrCreate({
        where: { dedupeKey: entry.dedupeKey || null },
        defaults: entry,
      });
    }

    // Update participant stats
    const historyByPlayer = {};
    for (const entry of history) historyByPlayer[entry.playerId] = entry.pointsAwarded;

    for (const participant of participantsWithPos) {
      const playerMatches = completedMatches.filter(
        (m) => m.player1Id === participant.playerId || m.player2Id === participant.playerId
      );
      const matchesWon = playerMatches.filter((m) => {
        if (m.winner === "player1" && m.player1Id === participant.playerId) return true;
        if (m.winner === "player2" && m.player2Id === participant.playerId) return true;
        return false;
      }).length;
      const matchesLost = playerMatches.length - matchesWon;
      const framesWon = playerMatches.reduce((sum, m) => {
        return sum + (m.player1Id === participant.playerId ? (m.player1FramesWon || 0) : (m.player2FramesWon || 0));
      }, 0);
      const framesLost = playerMatches.reduce((sum, m) => {
        return sum + (m.player1Id === participant.playerId ? (m.player2FramesWon || 0) : (m.player1FramesWon || 0));
      }, 0);
      await participant.update({
        matchesWon,
        matchesLost,
        framesWon,
        framesLost,
        rankingPointsAwarded: historyByPlayer[participant.playerId] || 0,
      });
    }

    console.log(`[recalculateRankingPoints] Successfully recalculated ranking points for tournament ${tournamentId}. Awarded ${history.length} ranking point records.`);

    res.json({
      success: true,
      message: "Ranking points recalculated successfully",
      data: {
        pointsAwarded: history.length,
        participants: participants.length,
        completedMatches: completedMatches.length,
        history: history
      }
    });
  } catch (error) {
    console.error("recalculateRankingPoints error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Close registration for tournament (transitions registration → registration_closed)
 */
exports.closeRegistration = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const skipFixtureGeneration = !!(req.body && req.body.skipFixtureGeneration);

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const tournament = await Tournament.findOne({
      where: { id: tournamentId, organizationId: organization.id },
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Venue gate: can't close/generate fixtures until venue is approved.
    if (!isVenueApprovalReady(tournament)) {
      const blocked = getVenueApprovalBlockedError(tournament);
      return res.status(403).json({ success: false, ...blocked });
    }

    // Allow closing registration from 'registration', 'registration_closed', or 'in_progress' states
    // (in case fixtures were previously auto-generated)
    const allowedStatuses = ["registration", "registration_closed", "in_progress"];
    if (!allowedStatuses.includes(tournament.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot close registration for tournament in '${tournament.status}' status. Tournament must be in one of: ${allowedStatuses.join(", ")}`,
      });
    }

    // Update status to registration_closed (idempotent)
    await tournament.update({ status: "registration_closed" });

    await AuditLog.create({
      action: "tournament_registration_closed",
      entityType: "tournament",
      entityId: tournament.id,
      userId,
      notes: "Tournament registration closed",
    });

    // Attempt auto fixture generation if prerequisites are met (optional skip when org generates via API next)
    let fixturesGenerated = false;
    let matchesGenerated = 0;
    let fixturesWerePreviouslyGenerated = false;
    const schedulingConfig =
      TournamentSchedulingService.getSchedulingConfigFromTournament(tournament);
    if (!skipFixtureGeneration && schedulingConfig.autoGenerateFixtures) {
      try {
        const format = await TournamentFormat.findOne({ where: { tournamentId: tournament.id } });
        const scoringRules = await TournamentScoringRules.findOne({ where: { tournamentId: tournament.id } });

        const existingMatches = await TournamentMatch.count({ where: { tournamentId: tournament.id } });
        if (existingMatches > 0) {
          console.warn(`[closeRegistration] Matches already exist for tournament ${tournament.id}. Fixtures were previously generated (e.g., manually).`);
          fixturesWerePreviouslyGenerated = true;
          matchesGenerated = existingMatches;
          await tournament.update({ status: "in_progress" });
        } else {
          const participants = await TournamentParticipant.findAll({
            where: { tournamentId: tournament.id, status: "approved" },
            include: [{ association: "player", include: [{ model: PlayerRankingProfile, as: "rankingProfile" }] }],
          });

          if (format && scoringRules && participants.length >= 2) {
            const seedingType = format.seeding || "random";
            const outcome = await runInitialBracketGeneration({
              tournamentId: tournament.id,
              tournament,
              format,
              scoringRules,
              participants,
              userId,
              seedingType,
              auditNote: `Auto-generated on registration close (${format.type}, seeding: ${seedingType})`,
            });
            if (outcome.type === "error") {
              console.warn("[closeRegistration] Bracket generation failed:", outcome.json?.error);
            } else {
              if (schedulingConfig.enforceDeadlines) {
                const tournamentDeadline = resolveTournamentDeadline(tournament);
                if (tournamentDeadline) {
                  await TournamentMatch.update(
                    { scheduledDeadline: tournamentDeadline },
                    { where: { tournamentId: tournament.id } }
                  );
                }
              }
              fixturesGenerated = true;
              matchesGenerated = outcome.matchCount ?? 0;
            }
          }
        }
      } catch (autoGenErr) {
        console.warn("[closeRegistration] Auto bracket generation skipped:", autoGenErr.message);
      }
    }

    const finalStatus = fixturesGenerated ? "in_progress" : (fixturesWerePreviouslyGenerated ? "in_progress" : "registration_closed");

    // Update tournament status if fixtures were just generated (fixturesWerePreviouslyGenerated is already handled above)
    if (fixturesGenerated) {
      await tournament.update({ status: "in_progress" });
    }

    return res.json({
      success: true,
      data: {
        id: tournament.id,
        status: finalStatus,
        fixturesGenerated,
        matchesGenerated,
        fixturesWerePreviouslyGenerated
      },
      message: fixturesGenerated
        ? `Registration closed and ${matchesGenerated} fixtures generated automatically`
        : fixturesWerePreviouslyGenerated
          ? `Registration closed. Fixtures already generated (${matchesGenerated} matches found). Tournament now in progress.`
          : schedulingConfig.autoGenerateFixtures
            ? "Tournament registration closed. Auto-generation was enabled but fixtures were not generated due to missing prerequisites."
            : "Tournament registration closed. Auto-generation disabled; generate fixtures when ready.",
    });
  } catch (error) {
    console.error("closeRegistration error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// PARTICIPANT MANAGEMENT
// ============================================================================

/**
 * Register player for tournament
 */
exports.registerForTournament = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { playerId } = req.body;

    console.log(`registerForTournament called: userId=${userId}, tournamentId=${tournamentId}, playerId=${playerId}, body=${JSON.stringify(req.body)}`);

    // Normalize registrationMethod handling:
    // - `rawRegistrationMethod` is the exact value provided by the caller (may be undefined/null/empty string)
    // - When adding a player by `playerId` (admin/manual add), default to 'admin' if not provided
    // - For self-registration flows (no playerId) default to 'self' when creating a fresh participant
    const rawRegistrationMethod = Object.prototype.hasOwnProperty.call(req.body || {}, 'registrationMethod') ? req.body.registrationMethod : undefined;
    const registrationMethodForPlayerAdd = (() => {
      if (playerId) {
        if (rawRegistrationMethod === undefined || rawRegistrationMethod === null || (typeof rawRegistrationMethod === 'string' && rawRegistrationMethod.trim() === '')) {
          return 'admin';
        }
        // Support both 'manual' and 'admin' — normalize 'manual' to 'admin' for ENUM compatibility
        return (rawRegistrationMethod === 'manual' ? 'admin' : rawRegistrationMethod);
      }
      return rawRegistrationMethod; // may be undefined for non-player adds
    })();
    const registrationMethodFallback = (rawRegistrationMethod === undefined || rawRegistrationMethod === null || (typeof rawRegistrationMethod === 'string' && rawRegistrationMethod.trim() === '')) ? 'self' : rawRegistrationMethod;

    // Verify tournament exists
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Gate all registration flows until venue approval is granted.
    if (!isVenueApprovalReady(tournament)) {
      const blocked = getVenueApprovalBlockedError(tournament);
      return res.status(403).json({ success: false, ...blocked });
    }

    // Check if registration is open (UTC-consistent "full deadline day" rule).
    const now = new Date();
    const { open } = getRegistrationOpenStateUTC(tournament, now);
    if (!open) {
      // Organizer manual add uses `playerId` payload, while self-registration doesn't.
      const isOrganizerManualAdd = !!playerId;
      return res.status(403).json({
        success: false,
        error: isOrganizerManualAdd
          ? "Registration deadline passed. Cannot add players."
          : "Registration closed",
        errorCode: "REGISTRATION_CLOSED",
      });
    }

    // Check max participants
    if (tournament.maxParticipants && tournament.currentParticipantCount >= tournament.maxParticipants) {
      return res.status(403).json({ success: false, error: "Tournament is full" });
    }

    // Check if already registered by playerId
    if (playerId) {
      const existingByPlayer = await TournamentParticipant.findOne({ where: { tournamentId, playerId } });
      if (existingByPlayer) {
        return res.status(400).json({ success: false, error: 'Player already registered for this tournament' });
      }

      // Load player to get email for possible invited-email matches
      const player = await Player.findByPk(playerId, { include: [{ association: 'user', attributes: ['email', 'id'] }] });
      const playerEmail = player?.user?.email || null;

      // If there is an outstanding invitation for this player's email, prefer merging via the
      // `tournament_invitations` table rather than searching for a non-existent `invitedEmail` column
      // on the participants table.
      if (playerEmail) {
        const existingInvitation = await TournamentInvitation.findOne({ where: { tournamentId, invitedEmail: playerEmail } });
        if (existingInvitation) {
          // Try to find any participant that may already be associated with this invitation
          let participantForInvite = null;

          if (existingInvitation.invitedPlayerId) {
            participantForInvite = await TournamentParticipant.findOne({ where: { tournamentId, playerId: existingInvitation.invitedPlayerId } });
          }

          if (!participantForInvite) {
            // Also check participants by player user email (join player->user)
            participantForInvite = await TournamentParticipant.findOne({
              where: { tournamentId },
              include: [
                {
                  association: 'player',
                  include: [{ association: 'user', where: { email: playerEmail }, attributes: ['id', 'email'] }],
                },
              ],
            });
          }

          if (participantForInvite) {
            // If participant exists for a different player, allow overwrite for manual/admin adds.
            if (participantForInvite.playerId && participantForInvite.playerId !== playerId) {
              try {
                await AuditLog.create({
                  action: 'participant_overwritten_by_manual_add',
                  entityType: 'tournament_participant',
                  entityId: participantForInvite.id,
                  userId,
                  notes: `Overwriting participant playerId ${participantForInvite.playerId} -> ${playerId} for tournament ${tournament.id}`,
                });
              } catch (e) {
                console.warn('Failed to write overwrite audit log:', e?.message || e);
              }
            }

            // Attach/replace playerId and update method/status
            const prevStatus = participantForInvite.status;
            const newStatus = tournament.participantApprovalRequired ? 'pending' : 'approved';

            await participantForInvite.update({
              playerId,
              registrationMethod: registrationMethodForPlayerAdd || participantForInvite.registrationMethod || 'admin',
              status: prevStatus === 'approved' ? 'approved' : newStatus,
              registrationDate: participantForInvite.registrationDate || new Date(),
            });

            if (prevStatus !== 'approved' && newStatus === 'approved') {
              await tournament.increment('currentParticipantCount');
            }

            await existingInvitation.update({ status: 'accepted', respondedDate: new Date() });

            await AuditLog.create({
              action: 'participant_merged_from_invite',
              entityType: 'tournament_participant',
              entityId: participantForInvite.id,
              userId,
              notes: `Merged/overwrote invited record with player ${playerId} for tournament ${tournament.id}`,
            });

            return res.status(200).json({ success: true, data: participantForInvite, message: 'Participant merged with existing invitation' });
          }

          // No participant existed yet for this invitation — create a new participant and mark invitation accepted
          const status = tournament.participantApprovalRequired ? 'pending' : 'approved';

          console.log(`registerForTournament (from invite): Creating participant - tournamentId=${tournamentId}, playerId=${playerId}, status=${status}, from invitedEmail=${playerEmail}`);

          const newParticipant = await TournamentParticipant.create({
            tournamentId,
            playerId,
            registrationMethod: registrationMethodForPlayerAdd,
            status,
            registrationDate: new Date(),
          });

          // Verify participant was created
          if (!newParticipant || !newParticipant.id) {
            console.error(`registerForTournament (from invite): Participant creation failed`);
            return res.status(500).json({ success: false, error: 'Failed to create tournament participant from invitation' });
          }

          console.log(`registerForTournament (from invite): Participant created - id=${newParticipant.id}, playerId=${newParticipant.playerId}`);

          if (status === 'approved') await tournament.increment('currentParticipantCount');

          await existingInvitation.update({ status: 'accepted', respondedDate: new Date() });

          await AuditLog.create({
            action: 'player_registered_for_tournament',
            entityType: 'tournament_participant',
            entityId: newParticipant.id,
            userId,
            notes: `Player registered (merged from invite) for tournament "${tournament.name}"`,
          });

          // Fetch with tournament details
          const participantWithDetails = await TournamentParticipant.findByPk(newParticipant.id, {
            include: [
              {
                association: 'tournament',
                attributes: ['id', 'name', 'organizationId'],
              },
            ],
          });

          return res.status(201).json({
            success: true,
            data: participantWithDetails,
            message: status === 'pending' ? 'Registration pending approval' : 'Successfully registered'
          });
        }
      }

      // No existing invited record, create new participant
      const status = tournament.participantApprovalRequired ? 'pending' : 'approved';

      console.log(`registerForTournament: Creating new participant - tournamentId=${tournamentId}, playerId=${playerId}, status=${status}, registrationMethod=${registrationMethodForPlayerAdd}`);

      const participant = await TournamentParticipant.create({
        tournamentId,
        playerId,
        registrationMethod: registrationMethodForPlayerAdd,
        status,
        registrationDate: new Date(),
      });

      // Verify participant was created correctly
      if (!participant || !participant.id) {
        console.error(`registerForTournament: Participant creation failed or returned null`);
        return res.status(500).json({ success: false, error: 'Failed to create tournament participant' });
      }

      console.log(`registerForTournament: Participant created successfully - id=${participant.id}, playerId=${participant.playerId}, tournamentId=${participant.tournamentId}`);

      // VERIFY IT WAS ACTUALLY SAVED
      const verifyParticipant = await TournamentParticipant.findByPk(participant.id);
      if (!verifyParticipant) {
        console.error(`registerForTournament: CRITICAL - Participant was not saved to DB!`);
        return res.status(500).json({ success: false, error: 'Failed to verify participant in database' });
      }
      console.log(`registerForTournament: Verified participant exists in DB`);

      // Verify it can be queried by playerId
      const verifyByPlayerId = await TournamentParticipant.findOne({
        where: { playerId, tournamentId },
      });
      if (!verifyByPlayerId) {
        console.error(`registerForTournament: CRITICAL - Cannot query participant by playerId!`);
        return res.status(500).json({ success: false, error: 'Failed to query participant by playerId' });
      }
      console.log(`registerForTournament: Verified participant can be queried by playerId`);

      if (status === 'approved') {
        await tournament.increment('currentParticipantCount');
        console.log(`registerForTournament: Incremented tournament's currentParticipantCount`);
      }

      // Log action
      await AuditLog.create({
        action: 'player_registered_for_tournament',
        entityType: 'tournament_participant',
        entityId: participant.id,
        userId,
        notes: `Player registered for tournament "${tournament.name}"`,
      });

      console.log(`registerForTournament: Audit log created for participant ${participant.id}`);

      // Fetch the created participant with tournament details to return
      const participantWithDetails = await TournamentParticipant.findByPk(participant.id, {
        include: [
          {
            association: 'tournament',
            attributes: ['id', 'name', 'organizationId'],
          },
        ],
      });

      return res.status(201).json({
        success: true,
        data: participantWithDetails,
        message: status === 'pending' ? 'Registration pending approval' : 'Successfully registered'
      });
    }

    // If no playerId provided (self-registration without player profile) —
    // try to detect an outstanding invitation by email and merge rather than creating duplicates.
    const emailToMatch = (req.body && (req.body.playerEmail || req.body.invitedEmail)) || null;

    if (emailToMatch) {
      const existingInvitation = await TournamentInvitation.findOne({ where: { tournamentId, invitedEmail: emailToMatch } });
      if (existingInvitation) {
        let participantForInvite = null;

        if (existingInvitation.invitedPlayerId) {
          participantForInvite = await TournamentParticipant.findOne({ where: { tournamentId, playerId: existingInvitation.invitedPlayerId } });
        }

        if (!participantForInvite) {
          participantForInvite = await TournamentParticipant.findOne({
            where: { tournamentId },
            include: [
              {
                association: 'player',
                include: [{ association: 'user', where: { email: emailToMatch }, attributes: ['id', 'email'] }],
              },
            ],
          });
        }

        // Raw fallback: some historical participant rows may store a playerEmail column
        if (!participantForInvite) {
          try {
            const rows = await sequelize.query(
              'SELECT id FROM tournament_participants WHERE tournamentId = ? AND playerEmail = ? LIMIT 1',
              { replacements: [tournamentId, emailToMatch], type: QueryTypes.SELECT }
            );
            if (rows && rows.length) {
              participantForInvite = await TournamentParticipant.findByPk(rows[0].id);
            }
          } catch (e) {
            console.warn('Raw participant email lookup failed:', e.message || e);
          }
        }

        if (participantForInvite) {
          if (participantForInvite.playerId) {            // Allow overwriting for manual/admin adds
            try {
              await AuditLog.create({
                action: 'participant_overwritten_by_manual_add',
                entityType: 'tournament_participant',
                entityId: participantForInvite.id,
                userId,
                notes: `Overwriting participant playerId ${participantForInvite.playerId} -> (no playerId) for tournament ${tournament.id}`,
              });
            } catch (e) {
              console.warn('Failed to write overwrite audit log:', e?.message || e);
            }
          }

          const prevStatus = participantForInvite.status;
          const newStatus = tournament.participantApprovalRequired ? 'pending' : 'approved';

          await participantForInvite.update({
            registrationMethod: (rawRegistrationMethod || participantForInvite.registrationMethod || 'invitation'),
            status: prevStatus === 'approved' ? 'approved' : newStatus,
            registrationDate: participantForInvite.registrationDate || new Date(),
          });

          if (prevStatus !== 'approved' && newStatus === 'approved') {
            await tournament.increment('currentParticipantCount');
          }

          await existingInvitation.update({ status: 'accepted', respondedDate: new Date() });

          await AuditLog.create({
            action: 'participant_merged_from_invite',
            entityType: 'tournament_participant',
            entityId: participantForInvite.id,
            userId,
            notes: `Merged invited record for tournament ${tournament.id}`,
          });

          return res.status(200).json({ success: true, data: participantForInvite, message: 'Participant merged with existing invitation' });
        }

        // No participant existed yet for this invitation — create a new participant and mark invitation accepted
        const statusFromInvitation = tournament.participantApprovalRequired ? 'pending' : 'approved';
        const newParticipant = await TournamentParticipant.create({
          tournamentId,
          playerId: null,
          registrationMethod: 'invitation',
          status: statusFromInvitation,
          registrationDate: new Date(),
        });

        if (statusFromInvitation === 'approved') await tournament.increment('currentParticipantCount');

        await existingInvitation.update({ status: 'accepted', respondedDate: new Date() });

        await AuditLog.create({
          action: 'player_registered_for_tournament',
          entityType: 'tournament_participant',
          entityId: newParticipant.id,
          userId,
          notes: `Player registered (merged from invite) for tournament "${tournament.name}"`,
        });

        return res.status(201).json({ success: true, data: newParticipant, message: statusFromInvitation === 'pending' ? 'Registration pending approval' : 'Successfully registered' });
      }
    }

    // Fallback: For self-registration, try to find the player profile for the authenticated user
    let playerIdForSelfReg = null;
    if (userId) {
      let playerProfile = await Player.findOne({ where: { userId } });

      // If player profile doesn't exist, auto-create one
      if (!playerProfile) {
        try {
          const user = await User.findByPk(userId);
          if (!user) {
            return res.status(400).json({
              success: false,
              error: 'User not found. Please log in again.'
            });
          }

          // Auto-create player profile with user's email as name
          playerProfile = await Player.create({
            userId,
            name: user.email.split('@')[0] || 'Player', // Use email prefix as default name
            badgeType: 'Casual'
          });

          console.log(`[registerForTournament] Auto-created player profile ${playerProfile.id} for user ${userId}`);
        } catch (err) {
          console.error(`[registerForTournament] Error auto-creating player profile:`, err);
          return res.status(400).json({
            success: false,
            error: 'Failed to create player profile. Please contact support.'
          });
        }
      }

      if (playerProfile) {
        playerIdForSelfReg = playerProfile.id;
      }
    }

    // If no player profile found for this user, registration cannot proceed
    if (!playerIdForSelfReg) {
      return res.status(400).json({
        success: false,
        error: 'Player profile not found. Please complete your player profile before registering.'
      });
    }

    // Prevent duplicate self-registration and enforce max participant limit.
    const existingSelf = await TournamentParticipant.findOne({ where: { tournamentId, playerId: playerIdForSelfReg } });
    if (existingSelf) {
      return res.status(400).json({
        success: false,
        error: "Player already registered for this tournament",
      });
    }

    if (tournament.maxParticipants && tournament.currentParticipantCount >= tournament.maxParticipants) {
      return res.status(403).json({ success: false, error: "Tournament is full" });
    }

    // Create participant with the resolved playerId
    const status = tournament.participantApprovalRequired ? 'pending' : 'approved';
    const participant = await TournamentParticipant.create({
      tournamentId,
      playerId: playerIdForSelfReg,
      registrationMethod: registrationMethodFallback,
      status,
      registrationDate: new Date(),
    });

    if (status === 'approved') {
      await tournament.increment('currentParticipantCount');
    }

    await AuditLog.create({
      action: "player_registered_for_tournament",
      entityType: "tournament_participant",
      entityId: participant.id,
      userId,
      notes: `Player registered for tournament "${tournament.name}"`,
    });

    res.status(201).json({ success: true, data: participant, message: status === 'pending' ? 'Registration pending approval' : 'Successfully registered' });
  } catch (error) {
    console.error("registerForTournament error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get tournament participants
 */
exports.getTournamentParticipants = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { status } = req.query;

    const where = { tournamentId };
    if (status) where.status = status;

    let participants = await TournamentParticipant.findAll({
      where,
      include: [
        {
          association: "player",
          attributes: ["id", "name", "avatarUrl"],
          include: [{ association: "user", attributes: ["id", "email"] }],
        },
      ],
      order: [["registrationDate", "ASC"]],
    });

    // Fetch invitations for this tournament so we can map invited emails to participants
    const invitations = await TournamentInvitation.findAll({ where: { tournamentId } });

    // Normalize participant data to ensure email and registrationMethod are correct when
    // the participant was created via an invitation
    participants = participants.map((p) => {
      const participant = p; // Sequelize instance

      const playerEmail = participant.player?.user?.email || participant.playerEmail || null;

      // Try to find a matching invitation by invitedPlayerId or invitedEmail
      const match = invitations.find((inv) => {
        if (inv.invitedPlayerId && participant.playerId && inv.invitedPlayerId === participant.playerId) return true;
        if (inv.invitedEmail && playerEmail && inv.invitedEmail.toLowerCase() === playerEmail.toLowerCase()) return true;
        if (inv.invitedEmail && participant.playerEmail && inv.invitedEmail.toLowerCase() === participant.playerEmail?.toLowerCase()) return true;
        return false;
      });

      if (match) {
        // Attach invitedEmail for frontend fallback
        participant.dataValues.invitedEmail = match.invitedEmail || null;

        // Only mark as 'invitation' when the participant has no explicit registrationMethod set.
        // Do not override explicit 'manual' or 'self' methods provided when the participant was
        // created via admin/manual add or self-registration.
        if (!participant.dataValues.registrationMethod) {
          participant.dataValues.registrationMethod = 'invitation';
        }

        // expose matched invitation id
        participant.dataValues.matchedInvitationId = match.id;
      } else {
        // Ensure invitedEmail is set to player's email if available
        participant.dataValues.invitedEmail = participant.dataValues.invitedEmail || playerEmail || null;
      }

      return participant;
    });

    res.json({
      success: true,
      data: participants,
      count: participants.length,
    });
  } catch (error) {
    console.error("getTournamentParticipants error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Approve/reject participant registration
 */
exports.approveParticipant = async (req, res) => {
  try {
    const { userId } = req.user;
    const { participantId } = req.params;
    const { approve } = req.body;

    const participant = await TournamentParticipant.findByPk(participantId, {
      include: [{ association: "tournament" }],
    });

    if (!participant) {
      return res.status(404).json({ success: false, error: "Participant not found" });
    }

    // Verify authorization
    const organization = await Organization.findOne({ where: { userId } });
    if (organization.id !== participant.tournament.organizationId) {
      return res.status(403).json({ success: false, error: "No authorization" });
    }

    if (approve) {
      await participant.update({ status: "approved", approvedDate: new Date(), approvedBy: userId });
      await participant.tournament.increment("currentParticipantCount");
    } else {
      await participant.update({ status: "rejected" });
    }

    await AuditLog.create({
      action: approve ? "participant_approved" : "participant_rejected",
      entityType: "tournament_participant",
      entityId: participantId,
      userId,
    });

    res.json({
      success: true,
      data: participant,
      message: approve ? "Participant approved" : "Participant rejected",
    });
  } catch (error) {
    console.error("approveParticipant error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Remove a participant from a tournament
 */
exports.removeParticipant = async (req, res) => {
  try {
    const { userId } = req.user;
    const { participantId } = req.params;

    const participant = await TournamentParticipant.findByPk(participantId, {
      include: [{ association: "tournament" }],
    });

    if (!participant) {
      return res.status(404).json({ success: false, error: "Participant not found" });
    }

    // Verify authorization: user must belong to organization that owns the tournament
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || organization.id !== participant.tournament.organizationId) {
      return res.status(403).json({ success: false, error: "No authorization" });
    }

    const wr = parseTournamentJsonField(participant.tournament.withdrawalRules);
    const beforeStart = String(wr?.beforeStart ?? wr?.before_start ?? "remove").toLowerCase();
    if (beforeStart === "forfeit") {
      return res.status(403).json({
        success: false,
        error:
          "Organizer remove is disabled: this tournament uses “forfeit” before start. Players withdraw from their dashboard.",
        errorCode: "ORGANIZER_REMOVE_DISABLED_FORFEIT",
      });
    }

    const tournamentId = participant.tournamentId;
    const playerId = participant.playerId;
    const wasApproved = participant.status === "approved";

    console.log(`[removeParticipant] Starting removal: participantId=${participantId}, playerId=${playerId}, wasApproved=${wasApproved}, tournamentId=${tournamentId}`);

    // If participant was approved, decrement tournament count
    if (wasApproved) {
      await participant.tournament.decrement("currentParticipantCount");
      console.log(`[removeParticipant] Decremented participant count for tournament ${tournamentId}`);
    }

    await participant.destroy();

    await AuditLog.create({
      action: "participant_removed",
      entityType: "tournament_participant",
      entityId: participantId,
      userId,
      notes: `Participant ${participantId} (playerId: ${playerId}) removed from tournament ${tournamentId}`,
    });

    // Delete any matches involving the removed player to ensure clean bracket regeneration
    if (wasApproved && playerId) {
      try {
        // When removing a participant, delete ALL matches and rounds to allow clean regeneration
        // This prevents stale BYE metadata from persisting
        const deletedMatches = await TournamentMatch.destroy({
          where: { tournamentId },
        });
        const deletedRounds = await TournamentRound.destroy({
          where: { tournamentId },
        });
        if (deletedMatches > 0 || deletedRounds > 0) {
          console.log(`[removeParticipant] Deleted ${deletedMatches} matches and ${deletedRounds} rounds to allow clean regeneration`);
        }
      } catch (deleteErr) {
        console.error("[removeParticipant] Error deleting matches/rounds:", deleteErr);
      }
    }

    /** Rebuild fixtures from remaining approved players when nothing has been played yet (same as withdrawal “remove” rule). */
    let bracketRegeneration = null;
    if (wasApproved) {
      // Check if fixtures have been generated before attempting regeneration
      const existingMatches = await TournamentMatch.count({ where: { tournamentId } });
      console.log(`[removeParticipant] Checking fixture regeneration: existingMatches=${existingMatches}`);

      if (existingMatches > 0) {
        // Fixtures already exist, regenerate them
        try {
          console.log(`[removeParticipant] Calling regenerateBracketAfterWithdrawal for tournament ${tournamentId}`);
          bracketRegeneration = await FixtureRegenerationService.regenerateBracketAfterWithdrawal(tournamentId, userId, {
            reason: "organizer_removed_participant",
          });
          console.log(`[removeParticipant] Regeneration result:`, JSON.stringify(bracketRegeneration, null, 2));
        } catch (regErr) {
          console.error("[removeParticipant] bracket regeneration error:", regErr);
          bracketRegeneration = {
            success: false,
            regenerated: false,
            reason: "regeneration_error",
            error: regErr.message || String(regErr),
          };
        }
      } else {
        // No fixtures yet - check if registration is locked (format exists)
        const format = await TournamentFormat.findOne({ where: { tournamentId } });

        if (format) {
          // Registration is locked but no fixtures exist - user should click "Generate Fixtures" button
          console.log(`[removeParticipant] Registration locked but no fixtures - organizer should click Generate Fixtures button`);
          bracketRegeneration = {
            success: true,
            regenerated: false,
            reason: "matches_deleted_need_manual_generation",
            message: "Participant removed. All fixtures cleared. Click 'Generate Fixtures' to create new bracket for remaining participants.",
          };
        } else {
          // Registration not locked yet
          console.log(`[removeParticipant] No fixtures to regenerate - registration not locked yet`);
          bracketRegeneration = {
            success: true,
            regenerated: false,
            reason: "registration_not_locked",
            message: "Participant removed. Lock registration to generate fixtures for remaining participants.",
          };
        }
      }
    }

    const regen = bracketRegeneration && bracketRegeneration.regenerated;
    res.json({
      success: true,
      data: { id: participantId, bracketRegeneration },
      message: regen ? "Participant removed and fixtures regenerated" : "Participant removed",
    });
  } catch (error) {
    console.error("removeParticipant error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// INVITATIONS & JOIN CODES
// ============================================================================

exports.createInvitationLink = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { invitedPlayerIds = [], inviteEmails = [], message } = req.body;

    console.log("[createInvitationLink] Starting with:", {
      tournamentId,
      invitedPlayerIds: invitedPlayerIds.length,
      inviteEmails: inviteEmails.length,
    });

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      console.error("[createInvitationLink] Tournament not found:", tournamentId);
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Get organizer name for email personalization
    const org = await Organization.findByPk(tournament.organizationId);
    const organizerName = org?.organizationName || org?.contactPersonName || "Organizer";

    const invitations = [];
    const emailResults = [];

    const buildFullLink = (link) => {
      if (!link) return null;
      return link.startsWith("http") ? link : `${process.env.FRONTEND_URL}${link}`;
    };

    // Handle invites for existing player IDs
    for (const playerId of invitedPlayerIds || []) {
      const { token, link } = RegistrationManager.generateInvitationLink(tournamentId);

      // Try to resolve player's email via associated User
      const player = await Player.findByPk(playerId, { include: [{ association: "user", attributes: ["email"] }] });
      const invitedEmail = player?.user?.email || null;

      const invitation = await TournamentInvitation.create({
        tournamentId,
        type: "direct_invite",
        invitedPlayerId: playerId,
        invitedEmail: invitedEmail,
        invitedByUserId: userId,
        status: "sent",
        invitationToken: token,
        invitationMessage: message,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      const inviteLink = buildFullLink(link);

      // Attempt to send email if we have an address
      if (invitedEmail) {
        try {
          console.log("[createInvitationLink] Sending email to player:", invitedEmail);
          const emailResult = await sendTournamentInvitation({
            email: invitedEmail,
            name: player?.name,
            invitationToken: token,
            tournamentId: tournamentId,
            tournamentName: tournament.name,
            organizerName,
            inviteLink,
          });
          emailResults.push({
            email: invitedEmail,
            sent: emailResult.success,
            error: emailResult.error,
          });
          console.log("[createInvitationLink] Email result for", invitedEmail, ":", emailResult);
        } catch (emailErr) {
          console.error("[createInvitationLink] Error sending tournament invitation email:", emailErr);
          emailResults.push({
            email: invitedEmail,
            sent: false,
            error: emailErr.message,
          });
        }
      }

      invitations.push({
        id: invitation.id,
        playerId,
        email: invitedEmail,
        token,
        invitationLink: inviteLink,
        expiresAt: invitation.expiresAt,
      });
    }

    // Handle invites created from raw email addresses
    for (const rawEmail of inviteEmails || []) {
      const email = (rawEmail || "").trim();
      if (!email) continue;

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.warn("[createInvitationLink] Invalid email format:", email);
        continue;
      }

      const { token, link } = RegistrationManager.generateInvitationLink(tournamentId);

      const invitation = await TournamentInvitation.create({
        tournamentId,
        type: "direct_invite",
        invitedEmail: email,
        invitedByUserId: userId,
        status: "sent",
        invitationToken: token,
        invitationMessage: message,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const inviteLink = buildFullLink(link);

      try {
        console.log("[createInvitationLink] Sending email to", email);
        const emailResult = await sendTournamentInvitation({
          email,
          name: null,
          invitationToken: token,
          tournamentId: tournamentId,
          tournamentName: tournament.name,
          organizerName,
          inviteLink,
        });
        emailResults.push({
          email,
          sent: emailResult.success,
          error: emailResult.error,
        });
        console.log("[createInvitationLink] Email result for", email, ":", emailResult);
      } catch (emailErr) {
        console.error("[createInvitationLink] Error sending tournament invitation email:", emailErr);
        emailResults.push({
          email,
          sent: false,
          error: emailErr.message,
        });
      }

      invitations.push({
        id: invitation.id,
        email,
        token,
        invitationLink: inviteLink,
        expiresAt: invitation.expiresAt,
      });
    }

    console.log("[createInvitationLink] Complete - created", invitations.length, "invitations");
    console.log("[createInvitationLink] Email results:", emailResults);

    res.status(201).json({
      success: true,
      data: invitations,
      emailResults,
      message: `Invitations created (${invitations.length} total)`,
    });
  } catch (error) {
    console.error("[createInvitationLink] FATAL ERROR:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error", details: error });
  }
};

/**
 * Generate join code
 */
exports.generateJoinCode = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { maxUsages = null, expiresInDays = 7 } = req.body;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Check if an active join code already exists for this tournament
    const existingInvitation = await TournamentInvitation.findOne({
      where: {
        tournamentId,
        type: "join_code",
        status: "sent",
      },
      order: [["createdAt", "DESC"]],
    });

    // If an active join code exists and is not expired, return it
    if (existingInvitation) {
      const isExpired = new Date() > new Date(existingInvitation.joinCodeExpiresAt);
      if (!isExpired) {
        console.log(`[generateJoinCode] Reusing existing join code for tournament ${tournamentId}`);
        return res.status(200).json({
          success: true,
          data: existingInvitation,
          message: "Using existing join code",
          isNew: false,
        });
      }
      // If expired, mark as expired and create a new one
      await existingInvitation.update({ status: "expired" });
    }

    // Create new join code
    const code = RegistrationManager.generateJoinCode();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const invitation = await TournamentInvitation.create({
      tournamentId,
      type: "join_code",
      joinCode: code,
      joinCodeExpiresAt: expiresAt,
      maxUsages,
      invitedByUserId: userId,
      status: "sent",
    });

    res.status(201).json({
      success: true,
      data: invitation,
      message: "Join code generated",
      isNew: true,
    });
  } catch (error) {
    console.error("generateJoinCode error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get existing active join codes for a tournament
 */
exports.getJoinCodes = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Fetch all active join codes (not expired, not used up)
    const joinCodes = await TournamentInvitation.findAll({
      where: {
        tournamentId,
        type: "join_code",
        status: "sent",
      },
      order: [["createdAt", "DESC"]],
    });

    // Filter out expired codes and mark them in DB
    const activeJoinCodes = [];
    for (const code of joinCodes) {
      const isExpired = code.joinCodeExpiresAt && new Date() > new Date(code.joinCodeExpiresAt);
      const isMaxedOut = code.maxUsages && code.usageCount >= code.maxUsages;

      if (isExpired) {
        await code.update({ status: "expired" });
      } else if (isMaxedOut) {
        await code.update({ status: "maxed_out" });
      } else {
        activeJoinCodes.push(code);
      }
    }

    res.status(200).json({
      success: true,
      data: activeJoinCodes,
      count: activeJoinCodes.length,
    });
  } catch (error) {
    console.error("getJoinCodes error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Use join code to register
 */
exports.registerWithJoinCode = async (req, res) => {
  try {
    const { userId } = req.user;
    const { joinCode } = req.body;

    if (!joinCode) {
      return res.status(400).json({ success: false, error: "Join code is required" });
    }

    // Look up the join code (no tournamentId needed - resolve from code)
    const invitation = await TournamentInvitation.findOne({
      where: { joinCode, status: "sent" },
    });

    if (!invitation) {
      return res.status(404).json({ success: false, error: "Invalid join code" });
    }

    // Check expiry
    if (invitation.joinCodeExpiresAt && new Date() > invitation.joinCodeExpiresAt) {
      return res.status(403).json({ success: false, error: "Join code has expired" });
    }

    // Check usage limit
    if (invitation.maxUsages && invitation.usageCount >= invitation.maxUsages) {
      return res.status(403).json({ success: false, error: "Join code usage limit reached" });
    }

    // Get player from user
    const player = await Player.findOne({ where: { userId } });
    if (!player) {
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // Set the tournamentId in req.params so registerForTournament can use it
    req.params.tournamentId = invitation.tournamentId;
    req.body.playerId = player.id;
    req.body.registrationMethod = 'join_code';

    // Increment usage count
    await invitation.increment("usageCount");

    // Register player
    return await exports.registerForTournament(req, res);
  } catch (error) {
    console.error("registerWithJoinCode error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Validate invitation token (public)
 */
exports.validateInvitationToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, error: 'Missing token' });

    const invitation = await TournamentInvitation.findOne({
      where: { invitationToken: token },
      include: [{ model: Tournament }],
    });

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }

    // Check expiry
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      return res.status(403).json({ success: false, error: 'Invitation expired' });
    }

    // Ensure we have the tournament object (handle different include key styles)
    let includedTournament = invitation.tournament || invitation.Tournament;
    if (!includedTournament) {
      includedTournament = await Tournament.findByPk(invitation.tournamentId);
    }

    res.json({
      success: true,
      data: {
        id: invitation.id,
        tournamentId: invitation.tournamentId,
        invitedEmail: invitation.invitedEmail,
        invitedPlayerId: invitation.invitedPlayerId,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        invitationMessage: invitation.invitationMessage,
        tournament: includedTournament,
      },
    });
  } catch (error) {
    console.error('validateInvitationToken error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Accept invitation (authenticated)
 */
exports.acceptInvitation = async (req, res) => {
  try {
    const { userId } = req.user;
    const { token } = req.body;

    if (!token) return res.status(400).json({ success: false, error: 'Missing token' });

    const invitation = await TournamentInvitation.findOne({
      where: { invitationToken: token, status: 'sent' },
      include: [{ model: Tournament }],
    });

    if (!invitation) return res.status(404).json({ success: false, error: 'Invitation not found or already used' });

    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      return res.status(403).json({ success: false, error: 'Invitation expired' });
    }

    // Resolve or create player profile for this user (tries same-email accounts)
    // By default we prevent cross-account acceptance (invitedEmail != current user).
    // To support legitimate cases where a different authenticated account should
    // accept the invite, callers may pass `force: true` in the request body.
    const currentUser = await User.findByPk(userId);
    const forceAccept = !!req.body.force;

    if (
      invitation.invitedEmail &&
      currentUser &&
      currentUser.email &&
      invitation.invitedEmail.toLowerCase() !== currentUser.email.toLowerCase()
    ) {
      if (!forceAccept) {
        return res.status(403).json({
          success: false,
          error: 'Invitation was sent to a different email. Please sign in with the invited email to accept this invitation.',
          invitedEmail: invitation.invitedEmail,
        });
      }

      // Log that a forced acceptance was performed for audit
      try {
        await AuditLog.create({
          action: 'invitation_force_accepted_attempt',
          entityType: 'tournament_invitation',
          entityId: invitation.id,
          userId,
          notes: `Invitation for ${invitation.invitedEmail} was force-accepted by user ${currentUser.email}`,
        });
      } catch (e) {
        console.warn('Failed to write force-accept audit log:', e?.message || e);
      }
    }

    let player = await Player.findOne({ where: { userId } });

    if (!player) {
      if (currentUser) {
        // Find all users with same email (accounts may be duplicated across roles)
        const allUsersWithEmail = await User.findAll({ where: { email: currentUser.email }, attributes: ['id', 'role'] });
        const userIds = allUsersWithEmail.map((u) => u.id);

        // Try to find existing player for any of these user IDs
        player = await Player.findOne({ where: { userId: { [Op.in]: userIds } } });

        // If still not found, create a player profile (prefer a user with role 'player' if present)
        if (!player) {
          let playerUser = allUsersWithEmail.find((u) => u.role === 'player');
          if (!playerUser && currentUser.role === 'player') playerUser = currentUser;

          const createForUserId = (playerUser && playerUser.id) || currentUser.id;
          player = await Player.create({
            userId: createForUserId,
            name: currentUser.email.split('@')[0] || 'Player',
            badgeType: 'Casual',
          });
        }
      }
    }

    // If still no player, attempt to use invitedPlayerId or invitedEmail mapping as fallback
    if (!player && invitation.invitedPlayerId) {
      player = await Player.findByPk(invitation.invitedPlayerId);
    }
    if (!player && invitation.invitedEmail) {
      const invitedUser = await User.findOne({ where: { email: invitation.invitedEmail } });
      if (invitedUser) {
        player = await Player.findOne({ where: { userId: invitedUser.id } });
      }
    }

    if (!player) {
      return res.status(400).json({ success: false, error: 'Player profile required to accept invitation. Please create or link a player profile to your account.' });
    }

    // Resolve included tournament (Sequelize may expose include under different keys)
    let tournament = invitation.tournament || invitation.Tournament;
    if (!tournament) {
      tournament = await Tournament.findByPk(invitation.tournamentId);
    }
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    // Gate invitation registration until venue approval is granted.
    if (!isVenueApprovalReady(tournament)) {
      const blocked = getVenueApprovalBlockedError(tournament);
      return res.status(403).json({ success: false, ...blocked });
    }

    // Enforce registration deadline for invitation acceptance as well.
    // (UTC-consistent "full deadline day" rule.)
    const { open } = getRegistrationOpenStateUTC(tournament, new Date());
    if (!open) {
      return res.status(403).json({
        success: false,
        error: "Registration closed",
        errorCode: "REGISTRATION_CLOSED",
      });
    }

    // Check if already registered by playerId
    const existingByPlayer = await TournamentParticipant.findOne({ where: { tournamentId: tournament.id, playerId: player.id } });
    if (existingByPlayer) {
      return res.status(400).json({ success: false, error: 'Player already registered for this tournament' });
    }

    // Check for an existing participant record created from an invitation with the same invitedEmail
    let existingByInvitedEmail = null;
    if (invitation.invitedEmail) {
      existingByInvitedEmail = await TournamentParticipant.findOne({
        where: { tournamentId: tournament.id },
        include: [
          {
            association: 'player',
            include: [{ association: 'user', where: { email: invitation.invitedEmail }, attributes: ['id', 'email'] }],
          },
        ],
      });
    }

    // Raw fallback: check historical participant rows that may store a playerEmail column
    if (!existingByInvitedEmail && invitation.invitedEmail) {
      try {
        const rows = await sequelize.query(
          'SELECT id FROM tournament_participants WHERE tournamentId = ? AND playerEmail = ? LIMIT 1',
          { replacements: [tournament.id, invitation.invitedEmail], type: QueryTypes.SELECT }
        );
        if (rows && rows.length) {
          existingByInvitedEmail = await TournamentParticipant.findByPk(rows[0].id);
        }
      } catch (e) {
        console.warn('Raw participant email lookup failed:', e.message || e);
      }
    }

    if (existingByInvitedEmail) {
      // If it already points to a different player id, do not overwrite
      if (existingByInvitedEmail.playerId && existingByInvitedEmail.playerId !== player.id) {
        return res.status(400).json({ success: false, error: 'Participant already registered for this invited email' });
      }

      // Merge: attach playerId and update registrationMethod/status as appropriate
      const prevStatus = existingByInvitedEmail.status;
      const newStatus = tournament.participantApprovalRequired ? 'pending' : 'approved';

      await existingByInvitedEmail.update({
        playerId: player.id,
        registrationMethod: 'invitation',
        status: prevStatus === 'approved' ? 'approved' : newStatus,
        registrationDate: existingByInvitedEmail.registrationDate || new Date(),
      });

      if (prevStatus !== 'approved' && newStatus === 'approved') {
        await tournament.increment('currentParticipantCount');
      }

      await invitation.update({ status: 'accepted', respondedDate: new Date() });

      await AuditLog.create({
        action: 'invitation_accepted',
        entityType: 'tournament_invitation',
        entityId: invitation.id,
        userId,
        notes: `Invitation accepted for tournament ${tournament.id} (merged)`,
      });

      return res.json({ success: true, data: existingByInvitedEmail, message: 'Invitation accepted and registration completed' });
    }

    if (tournament.maxParticipants && tournament.currentParticipantCount >= tournament.maxParticipants) {
      return res.status(403).json({ success: false, error: 'Tournament is full' });
    }

    const status = tournament.participantApprovalRequired ? 'pending' : 'approved';

    const participant = await TournamentParticipant.create({
      tournamentId: tournament.id,
      playerId: player.id,
      registrationMethod: 'invitation',
      status,
      registrationDate: new Date(),
    });

    if (status === 'approved') {
      await tournament.increment('currentParticipantCount');
    }

    await invitation.update({ status: 'accepted', respondedDate: new Date() });

    await AuditLog.create({
      action: 'invitation_accepted',
      entityType: 'tournament_invitation',
      entityId: invitation.id,
      userId,
      notes: `Invitation accepted for tournament ${tournament.id}`,
    });

    res.json({ success: true, data: participant, message: 'Invitation accepted and registration completed' });
  } catch (error) {
    console.error('acceptInvitation error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get pending tournament invitations for a player by email
 * Only returns the latest invitation per tournament
 */
exports.getPendingInvitations = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email parameter required' });
    }

    console.log('[getPendingInvitations] Fetching invitations for:', email);

    // Get all pending invitations for this email, ordered by createdAt DESC
    const allInvitations = await TournamentInvitation.findAll({
      where: {
        invitedEmail: email.toLowerCase(),
        status: 'sent',
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
      include: [Tournament],
      order: [['createdAt', 'DESC']],
    });

    // Deduplicate by tournament - keep only the latest invitation per tournament
    const uniqueInvitations = {};
    allInvitations.forEach(invitation => {
      const tournamentId = invitation.tournamentId;
      if (!uniqueInvitations[tournamentId]) {
        uniqueInvitations[tournamentId] = invitation;
      }
    });

    const result = Object.values(uniqueInvitations);

    console.log('[getPendingInvitations] Found', allInvitations.length, 'total invitations,', result.length, 'unique tournaments');

    res.json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (error) {
    console.error('[getPendingInvitations] ERROR:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const VALID_SEEDING = new Set(["random", "ranked", "manual"]);

function normalizeFormatRoundFormats(format) {
  const raw = format?.roundFormats;
  if (raw == null) return null;
  if (typeof raw === "string") return parseTournamentJsonField(raw);
  if (typeof raw === "object") return raw;
  return null;
}

/** Resolve best-of frames: numeric round, roundType key (e.g. preliminary), then format default. */
function resolveMatchBestOfFrames(roundNumber, roundType, format) {
  const map = normalizeFormatRoundFormats(format);
  let bestOf = null;
  if (map && typeof map === "object") {
    const rn = roundNumber;
    bestOf = map[String(rn)] ?? map[rn];
    if (bestOf == null && roundType) {
      bestOf = map[roundType];
    }
    if (bestOf == null && rn === 0) {
      bestOf = map["0"] ?? map.preliminary;
    }
    if (bestOf == null) {
      bestOf = map.default ?? map["default"];
    }
  }
  if (bestOf == null && format?.bestOfFrames != null) {
    bestOf = format.bestOfFrames;
  }
  if (bestOf == null) return null;
  const n = Number(bestOf);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Shared initial bracket / ladder setup for generateBracket and closeRegistration auto-gen.
 * @returns {Promise<{ type: 'fixtures'|'ladder'|'error', status?: number, json: object, matchCount?: number }>}
 */
async function runInitialBracketGeneration({
  tournamentId,
  tournament,
  format,
  scoringRules,
  participants,
  userId,
  seedingType,
  auditNote,
}) {
  // ── VALIDATE BYE HANDLING & SEEDING COMPATIBILITY ─────────────────
  if (format.type === 'knockout' && format.byesHandling) {
    const byeValidation = validateSeedingByeCompatibility(
      format.byesHandling,
      format.seeding || seedingType || 'random',
      participants.length
    );

    if (!byeValidation.isValid) {
      return {
        type: "error",
        status: 400,
        json: {
          success: false,
          error: byeValidation.errors[0],
          errorCode: 'INVALID_BYE_SEEDING_COMBINATION',
          details: byeValidation.errors,
        },
      };
    }

    if (byeValidation.warnings.length > 0) {
      console.warn('[runInitialBracketGeneration] Bye handling warnings:', byeValidation.warnings);
    }
  }

  const effSeeding = seedingType || format.seeding || "random";
  const seededParticipants = BracketGenerator.applySeeding(participants, effSeeding);
  const seededPlayerIds = seededParticipants.map((p) => p.playerId).filter((id) => id != null);

  for (let i = 0; i < seededParticipants.length; i++) {
    await seededParticipants[i].update({ seed: i + 1 });
  }

  if (seededPlayerIds.length < 2) {
    return {
      type: "error",
      status: 400,
      json: { success: false, error: "Some approved participants do not have valid player IDs" },
    };
  }

  let matches = [];
  let extraData = {};

  if (format.type === "knockout") {
    const result = BracketGenerator.generateKnockoutMatches(
      seededPlayerIds,
      tournamentId,
      format.byesHandling || "random_bye"
    );
    matches = result.matches;
    extraData = {
      bracketSize: result.bracketSize,
      byeCount: result.byeCount,
      knockoutByeByPairIndex: result.byeByPairIndex || {},
    };
  } else if (format.type === "round_robin") {
    const playerNamesById = Object.fromEntries(
      seededParticipants.filter((p) => p.playerId).map((p) => [p.playerId, p.player?.name || ""])
    );
    const result = BracketGenerator.generateRoundRobinMatches(seededPlayerIds, tournamentId, playerNamesById);
    matches = result.matches;
    extraData = { totalRounds: result.totalRounds, roundsMeta: result.roundsMeta };
  } else if (format.type === "swiss") {
    const SwissPairingEngine = require("../services/SwissPairingEngine");
    const n = seededPlayerIds.length;
    if (!format.maxRounds) {
      await format.update({ maxRounds: SwissPairingEngine.defaultSwissRoundCount(n) });
    }
    const pairings = BracketGenerator.generateSwissPairings(seededParticipants, {
      seeding: format.seeding || "random",
    });
    matches = pairings.map((pair) => ({
      tournamentId,
      roundNumber: 1,
      roundType: "swiss",
      player1Id: pair.player1Id,
      player2Id: pair.player2Id,
      status: pair.player2Id ? "scheduled" : "completed",
      winner: pair.player2Id ? null : "player1",
      // Swiss BYE rows are identified by `player2Id: null` and always score +1.
      // Do not mark them as walkovers to avoid accidental walkover scoring.
      isWalkover: false,
    }));
  } else if (format.type === "groups_knockout") {
    const result = BracketGenerator.generateGroupKnockoutMatches(
      seededPlayerIds,
      tournamentId,
      format.groupCount,
      format.playersPerGroup,
      format.qualifiersPerGroup
    );
    matches = result.matches;
    extraData = {
      groups: result.groups,
      groupCount: result.groupCount,
      qualifiersPerGroup: result.qualifiersPerGroup,
      knockoutStartRound: result.knockoutStartRound,
    };
  } else if (format.type === "ladder") {
    const positions = await BracketGenerator.generateLadderPositions(seededParticipants, tournamentId);
    extraData = { ladderPositions: positions, format: "ladder" };
    await TournamentRound.create({
      tournamentId,
      roundNumber: 1,
      roundType: "ladder_challenge",
      name: "Ladder",
      status: "in_progress",
      totalMatches: 0,
    });
    await tournament.update({ status: "in_progress", bracketGenerated: true });
    await AuditLog.create({
      action: "bracket_generated",
      entityType: "tournament",
      entityId: tournamentId,
      userId,
      notes: auditNote || `Ladder positions assigned (${effSeeding})`,
    });
    return {
      type: "ladder",
      json: {
        success: true,
        message: "Ladder positions assigned. Players can now issue challenges.",
        data: { tournamentId, format: "ladder", ...extraData },
      },
      matchCount: 0,
    };
  }

  if (matches.length === 0) {
    return {
      type: "error",
      status: 400,
      json: { success: false, error: "No matches could be generated from the participants" },
    };
  }

  const roundType =
    format.type === "knockout" ? "knockout_16" :
      format.type === "round_robin" ? "group_stage" :
        format.type === "groups_knockout" ? "group_stage" : format.type;

  const startDateObj = await resolveTournamentDefaultFixtureDate(tournament);

  const doubleCheckMatches = await TournamentMatch.count({ where: { tournamentId } });
  if (doubleCheckMatches > 0) {
    return {
      type: "error",
      status: 409,
      json: {
        success: false,
        error: "Race condition detected: Bracket generated concurrently by another process. Generation cancelled to prevent duplicates.",
      },
    };
  }

  let round;
  let createdMatches;

  if (format.type === "round_robin" && Array.isArray(extraData.roundsMeta) && extraData.roundsMeta.length > 0) {
    const rrMeta = extraData.roundsMeta;
    const matchesByRound = {};
    for (const m of matches) {
      matchesByRound[m.roundNumber] = (matchesByRound[m.roundNumber] || 0) + 1;
    }
    const roundRows = rrMeta.map((meta) => ({
      tournamentId,
      roundNumber: meta.roundNumber,
      roundType: "group_stage",
      name: `Round ${meta.roundNumber}`,
      status: meta.roundNumber === 1 ? "in_progress" : "not_started",
      totalMatches: matchesByRound[meta.roundNumber] || 0,
      description: JSON.stringify({
        byePlayers: meta.byePlayers,
        roundRobin: true,
      }),
    }));
    const createdRounds = await TournamentRound.bulkCreate(roundRows);
    const roundNumToId = Object.fromEntries(createdRounds.map((r) => [r.roundNumber, r.id]));
    round = createdRounds[0];

    createdMatches = await TournamentMatch.bulkCreate(
      matches.map((m) => ({
        ...m,
        roundId: roundNumToId[m.roundNumber],
        bestOfFrames: resolveMatchBestOfFrames(m.roundNumber, m.roundType, format),
        scheduledDate: startDateObj,
        scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
      }))
    );

    // Store tournament fixtures in fixtures table for unified query access
    await storeMatchesAsFixtures(createdMatches, tournamentId);

  } else if (format.type === "groups_knockout") {
    const groupsMeta = Array.isArray(extraData.groups) ? extraData.groups : [];
    const knockoutStartRound = extraData.knockoutStartRound ? Number(extraData.knockoutStartRound) : null;
    const groupStageRoundCount =
      knockoutStartRound != null && Number.isFinite(knockoutStartRound) && knockoutStartRound > 1
        ? knockoutStartRound - 1
        : Math.max(1, ...matches.map((m) => Number(m.roundNumber) || 1));

    const matchesByRound = {};
    const matchesByGroupRound = new Map(); // key: `${groupNumber}|${roundNumber}`
    for (const m of matches) {
      matchesByRound[m.roundNumber] = (matchesByRound[m.roundNumber] || 0) + 1;
      const key = `${m.groupNumber ?? "null"}|${m.roundNumber}`;
      const list = matchesByGroupRound.get(key) || [];
      list.push(m);
      matchesByGroupRound.set(key, list);
    }

    const roundRows = [];
    for (let rn = 1; rn <= groupStageRoundCount; rn++) {
      const byePlayers = [];

      for (const group of groupsMeta) {
        const groupPlayerIds = Array.isArray(group.playerIds) ? group.playerIds : [];
        const realN = groupPlayerIds.length;
        if (realN < 2) continue;

        const groupRoundsCount = realN % 2 === 0 ? realN - 1 : realN; // per prompt circle rule
        if (rn > groupRoundsCount) continue; // group finished early

        if (realN % 2 === 0) continue; // even group => no bye on any round

        const key = `${group.groupNumber}|${rn}`;
        const matchesInThisGroupRound = matchesByGroupRound.get(key) || [];
        const playedSet = new Set();
        for (const m of matchesInThisGroupRound) {
          if (m.player1Id) playedSet.add(m.player1Id);
          if (m.player2Id) playedSet.add(m.player2Id);
        }

        const restPlayers = groupPlayerIds.filter((pid) => !playedSet.has(pid));
        if (restPlayers.length !== 1) {
          throw new Error(`Group-stage BYE computation failed: group ${group.groupNumber} round ${rn} expected 1 rest, got ${restPlayers.length}`);
        }
        byePlayers.push({ playerId: restPlayers[0] });
      }

      roundRows.push({
        tournamentId,
        roundNumber: rn,
        roundType: "group_stage",
        name: `Group Stage - Round ${rn}`,
        status: rn === 1 ? "in_progress" : "not_started",
        totalMatches: matchesByRound[rn] || 0,
        description: JSON.stringify({
          byePlayers,
          roundRobin: true, // re-use bookingController logic for rest/bye rows
        }),
      });
    }

    const createdRounds = await TournamentRound.bulkCreate(roundRows);
    const roundNumToId = Object.fromEntries(createdRounds.map((r) => [r.roundNumber, r.id]));
    round = createdRounds.find((r) => r.roundNumber === 1) || createdRounds[0];

    createdMatches = await TournamentMatch.bulkCreate(
      matches.map((m) => {
        const roundId = roundNumToId[m.roundNumber];
        if (!roundId) {
          throw new Error(`Missing TournamentRound for tournamentId=${tournamentId} roundNumber=${m.roundNumber}`);
        }
        return {
          ...m,
          roundId,
          bestOfFrames: resolveMatchBestOfFrames(m.roundNumber, m.roundType, format),
          scheduledDate: startDateObj,
          scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
        };
      })
    );

    // Store tournament fixtures in fixtures table for unified query access
    await storeMatchesAsFixtures(createdMatches, tournamentId);

  } else {
    const totalMatchesForRound =
      format.type === "swiss"
        ? matches.filter((m) => m.player2Id).length
        : matches.length;
    round = await TournamentRound.create({
      tournamentId,
      roundNumber: 1,
      roundType,
      name: "Round 1",
      status: "in_progress",
      totalMatches: totalMatchesForRound,
    });

    if (format.type === "knockout" && extraData.bracketSize) {
      await round.update({
        totalMatches: matches.length,
        description: JSON.stringify({
          knockoutBracketSize: extraData.bracketSize,
          byeByPairIndex: extraData.knockoutByeByPairIndex || {},
        }),
      });
    }

    createdMatches = await TournamentMatch.bulkCreate(
      matches.map((m) => ({
        ...m,
        roundId: round.id,
        bestOfFrames: resolveMatchBestOfFrames(m.roundNumber, m.roundType, format),
        scheduledDate: startDateObj,
        scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
      }))
    );

    // Store tournament fixtures in fixtures table for unified query access
    await storeMatchesAsFixtures(createdMatches, tournamentId);

  }

  if (format.type === "groups_knockout" && extraData.groups && extraData.groups.length > 0) {
    const groupsToCreate = extraData.groups.map((group) => ({
      tournamentId,
      groupNumber: group.groupNumber,
      groupName: `Group ${String.fromCharCode(64 + group.groupNumber)}`,
      playerIds: group.playerIds || [],
      totalPlayers: (group.playerIds || []).length,
      currentRound: 1,
      qualifiedPlayerIds: [],
      totalQualified: 0,
      status: (group.playerIds || []).length >= 2 ? "in_progress" : "not_started",
    }));
    await TournamentGroup.bulkCreate(groupsToCreate);
  }

  if (format.type === "groups_knockout" && extraData.knockoutStartRound != null) {
    await format.update({ knockoutStartRound: extraData.knockoutStartRound });
  }

  if (scoringRules.handicapEnabled && scoringRules.handicapMethod === "auto") {
    const playerProfiles = {};
    for (const p of seededParticipants) {
      if (p.player) {
        playerProfiles[p.playerId] = {
          skillLevel: p.player.skillLevel || p.player.rankingProfile?.rolling12MonthPoints || 0,
        };
      }
    }
    const handicapFactor = scoringRules.handicapPerSkillPoint || 0.5;
    for (const cm of createdMatches) {
      if (cm.player1Id && cm.player2Id) {
        const p1Skill = playerProfiles[cm.player1Id]?.skillLevel || 0;
        const p2Skill = playerProfiles[cm.player2Id]?.skillLevel || 0;
        const skillDiff = Math.abs(p1Skill - p2Skill);
        const handicapFrames = Math.round(skillDiff * handicapFactor);
        if (handicapFrames > 0) {
          const updateObj = { handicapApplied: true };
          if (p1Skill < p2Skill) {
            updateObj.handicapPlayer1 = handicapFrames;
            updateObj.handicapPlayer2 = 0;
          } else {
            updateObj.handicapPlayer1 = 0;
            updateObj.handicapPlayer2 = handicapFrames;
          }
          await cm.update(updateObj);
        }
      }
    }
  }

  // Calculate totalMatches: for Swiss format, exclude bye matches (player2Id = null)
  const matchesToCount = format.type === "swiss"
    ? createdMatches.filter(m => m.player2Id != null)
    : createdMatches;
  const totalMatchesCount = matchesToCount.length;

  await tournament.update({
    status: "in_progress",
    currentRound: 1,
    bracketStatus: "generated",
    bracketGeneratedAt: new Date(),
    totalMatches: totalMatchesCount,
    completedMatches: 0,
  });
  await tournament.reload();

  await sendRoundStartEmails(tournament, 1);

  await AuditLog.create({
    action: "bracket_generated",
    entityType: "tournament",
    entityId: tournamentId,
    userId,
    notes: auditNote || `Generated ${createdMatches.length} matches (${format.type}, seeding: ${effSeeding}). Seeding is now locked.`,
  });

  return {
    type: "fixtures",
    json: {
      success: true,
      data: {
        tournament: {
          id: tournament.id,
          bracketStatus: tournament.bracketStatus,
          bracketGeneratedAt: tournament.bracketGeneratedAt,
          status: tournament.status,
        },
        round,
        matches: createdMatches,
        ...extraData,
        summary: `Generated ${createdMatches.length} matches for ${format.type} format (seeded: ${effSeeding})`,
      },
    },
    matchCount: createdMatches.length,
  };
}

// ============================================================================
// BRACKET GENERATION
// ============================================================================

/**
 * Swiss: after all matches in a round are recorded, advance and generate the next round (idempotent safe).
 */
exports.completeTournamentRound = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const roundNumber = parseInt(req.body?.roundNumber ?? req.query?.roundNumber ?? "", 10);

    const tournament = await Tournament.findByPk(tournamentId, { transaction: t });
    if (!tournament) {
      await t.rollback();
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const userOrganization = await Organization.findOne({ where: { userId }, transaction: t });
    if (!userOrganization || userOrganization.id !== tournament.organizationId) {
      await t.rollback();
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction: t });
    if (!format || format.type !== "swiss") {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: "Round completion trigger applies to Swiss tournaments. Other formats use generate-next-round where supported.",
      });
    }

    const completedRoundNumber =
      Number.isFinite(roundNumber) && roundNumber > 0
        ? roundNumber
        : Number(tournament.currentRound || 1);

    const actionableMatches = await TournamentMatch.findAll({
      where: {
        tournamentId,
        roundNumber: completedRoundNumber,
        player2Id: { [Op.ne]: null },
      },
      transaction: t,
    });

    const incomplete = actionableMatches.filter((m) => m.status !== "completed");
    if (incomplete.length > 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: "All matches in this round must be completed first",
        data: {
          roundNumber: completedRoundNumber,
          pendingMatchIds: incomplete.map((m) => m.id),
        },
      });
    }

    await exports._checkAndProgressRound(tournamentId, completedRoundNumber, t);
    await t.commit();

    const fresh = await Tournament.findByPk(tournamentId);
    return res.json({
      success: true,
      message: `Round ${completedRoundNumber} closed; next Swiss round generated if scheduled`,
      data: { currentRound: fresh?.currentRound, status: fresh?.status },
    });
  } catch (error) {
    await t.rollback();
    console.error("completeTournamentRound error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Generate tournament bracket/fixtures
 */
exports.generateBracket = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Venue gate: bracket generation requires an approved venue.
    if (!isVenueApprovalReady(tournament)) {
      const blocked = getVenueApprovalBlockedError(tournament);
      return res.status(403).json({ success: false, ...blocked });
    }

    const existingMatches = await TournamentMatch.count({ where: { tournamentId } });
    if (existingMatches > 0) {
      return res.status(409).json({
        success: false,
        error: "Bracket already generated for this tournament. Cannot create duplicate matches.",
        details: `Found ${existingMatches} existing matches. To regenerate, manually delete existing matches first.`,
      });
    }

    const format = await TournamentFormat.findOne({ where: { tournamentId } });
    if (!format) {
      return res.status(400).json({ success: false, error: "Tournament format not configured" });
    }

    // Validate seeding configuration
    if (!format.seeding) {
      return res.status(400).json({
        success: false,
        error: "Seeding method not configured. Please select a seeding method (Random, Ranked, or Manual) in tournament settings.",
        errorCode: "SEEDING_NOT_CONFIGURED"
      });
    }

    if (!VALID_SEEDING.has(format.seeding)) {
      return res.status(400).json({
        success: false,
        error: `Invalid seeding method: ${format.seeding}`,
        errorCode: "INVALID_SEEDING"
      });
    }

    const body = req.body || {};
    const rawSeed = body.seedingMethod ?? body.seeding ?? body.seedingStrategy;
    if (rawSeed && VALID_SEEDING.has(String(rawSeed))) {
      await format.update({ seeding: String(rawSeed) });
      await format.reload();
    }

    const scoringRules = await TournamentScoringRules.findOne({ where: { tournamentId } });
    if (!scoringRules) {
      return res.status(400).json({ success: false, error: "Tournament scoring rules not configured" });
    }

    let participants = await TournamentParticipant.findAll({
      where: { tournamentId, status: "approved" },
      include: [{ association: "player", include: [{ model: PlayerRankingProfile, as: "rankingProfile" }] }],
    });

    if (participants.length < 2) {
      return res.status(400).json({
        success: false,
        error: `Not enough approved participants. Found ${participants.length}, need at least 2.`,
      });
    }

    const seedingType = format.seeding || "random";

    if (seedingType === "manual") {
      const manualSeeds = body.manualSeeds;
      const n = participants.length;

      if (Array.isArray(manualSeeds) && manualSeeds.length > 0) {
        const idSet = new Set(participants.map((p) => p.id));
        for (const row of manualSeeds) {
          if (!row || row.participantId == null || row.seed == null || !idSet.has(row.participantId)) {
            return res.status(400).json({
              success: false,
              error: "manualSeeds must list each approved participant once with a valid participantId and seed.",
            });
          }
        }
        if (manualSeeds.length !== n) {
          return res.status(400).json({
            success: false,
            error: `Manual seeding requires exactly ${n} entries (one per approved participant).`,
          });
        }
        const seeds = manualSeeds.map((r) => Number(r.seed));
        const sorted = [...seeds].sort((a, b) => a - b);
        let valid =
          sorted.length === n && sorted[0] === 1 && sorted[n - 1] === n && new Set(seeds).size === n;
        if (!valid) {
          return res.status(400).json({
            success: false,
            error: `Manual seeds must be the numbers 1 through ${n} with no duplicates.`,
          });
        }
        for (const row of manualSeeds) {
          const p = participants.find((x) => x.id === row.participantId);
          if (p) await p.update({ seed: Number(row.seed) });
        }
        participants = await TournamentParticipant.findAll({
          where: { tournamentId, status: "approved" },
          include: [{ association: "player", include: [{ model: PlayerRankingProfile, as: "rankingProfile" }] }],
        });
      } else {
        const seeds = participants
          .map((p) => (p.seed == null ? null : Number(p.seed)))
          .filter((s) => s != null && !Number.isNaN(s));
        const sorted = [...seeds].sort((a, b) => a - b);
        const ok =
          sorted.length === n &&
          sorted[0] === 1 &&
          sorted[n - 1] === n &&
          new Set(sorted).size === n;
        if (!ok) {
          return res.status(400).json({
            success: false,
            error:
              "Manual seeding: assign every approved participant a unique seed from 1 to N (use the fixture modal or manualSeeds in the API).",
          });
        }
      }
    }
    const outcome = await runInitialBracketGeneration({
      tournamentId,
      tournament,
      format,
      scoringRules,
      participants,
      userId,
      seedingType,
      auditNote: null,
    });

    if (outcome.type === "error") {
      return res.status(outcome.status).json(outcome.json);
    }
    return res.json(outcome.json);
  } catch (error) {
    console.error("generateBracket error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + (error.message || error) });
  }
};

/** POST …/start — alias for generate-bracket (Swiss round 1, etc.) */
exports.startTournament = exports.generateBracket;

// ============================================================================
// MATCH MANAGEMENT
// ============================================================================

/**
 * Submit match result (Player or Admin submission)
 * Handles both single-player reporting and dual-confirmation workflows
 */
exports.submitMatchResult = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { userId } = req.user;
    const { matchId } = req.params;
    const {
      sport,
      isWalkover,
      walkoverWinner,
      player1Frames,
      player2Frames,
      player1RackWins,
      player2RackWins,
      player1Score,
      player2Score,
      frameScores,
      notes,
      submittedByAdmin = false,
      submittedByPlayerId
    } = req.body;

    console.log('[submitMatchResult] Request body:', {
      sport,
      isWalkover,
      walkoverWinner,
      player1Frames,
      player2Frames,
      player1RackWins,
      player2RackWins,
      player1Score,
      player2Score,
      hasFrameScores: !!frameScores,
      notes,
      matchId
    });

    const match = await TournamentMatch.findByPk(matchId, {
      transaction: t
    });

    if (!match) {
      await t.rollback();
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    // Safety: Swiss BYE rows use `player2Id: null` and are generated as already-completed.
    // Prevent accidentally submitting BYE rows through the normal match result flow.
    if (match.player2Id == null) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: "Cannot submit a BYE match result",
      });
    }

    // Get tournament details
    const tournament = await Tournament.findByPk(match.tournamentId, { transaction: t });

    const walkoverBool = isWalkover === true || isWalkover === "true";
    const adminSubmit = submittedByAdmin === true || submittedByAdmin === "true";
    const oppConfirm = tournamentRequiresOpponentConfirmation(tournament, {
      submittedByAdmin: adminSubmit,
      isWalkover: walkoverBool,
    });

    // Verify authorization (player must be match participant or admin)
    let submittingPlayer = null;
    if (!adminSubmit) {
      if (submittedByPlayerId) {
        submittingPlayer = await Player.findOne({
          where: { id: submittedByPlayerId, userId },
          transaction: t,
        });
        if (!submittingPlayer || (match.player1Id !== submittingPlayer.id && match.player2Id !== submittingPlayer.id)) {
          await t.rollback();
          return res.status(403).json({ success: false, error: "No authorization to submit result" });
        }
      } else {
        submittingPlayer = await Player.findOne({ where: { userId }, transaction: t });
        if (!submittingPlayer || (match.player1Id !== submittingPlayer.id && match.player2Id !== submittingPlayer.id)) {
          await t.rollback();
          return res.status(403).json({ success: false, error: "No authorization to submit result" });
        }
      }
    }

    // Determine which player submitted (needed for score orientation mapping)
    const submittingPlayerId = adminSubmit ? null : submittingPlayer.id;
    const submittingAsPlayer1 = submittingPlayerId === match.player1Id;
    const submittingAsPlayer2 = submittingPlayerId === match.player2Id;
    // MatchResult.submittedBy is non-null for schema purposes; admins submit on behalf of a match.
    const matchSubmittedByPlayerId = submittingPlayerId || match.player1Id;

    // Upload score UI labels inputs as bracket player1 / player2 (not submitter-relative).
    // Totals and frameScores are already in TournamentMatch order — do not swap by submitter.
    const shouldSwapPerspective = false;
    const normalizeFramesToBracketOrder = (rawFrames) => {
      if (!Array.isArray(rawFrames)) return rawFrames;
      if (!shouldSwapPerspective) return rawFrames;
      return rawFrames.map((f) => ({
        ...f,
        player1Score: f?.player2Score ?? f?.player1Score,
        player2Score: f?.player1Score ?? f?.player2Score,
        player1Break: f?.player2Break ?? f?.player1Break,
        player2Break: f?.player1Break ?? f?.player2Break,
      }));
    };

    let resultData = {};
    let winner = null;

    // Handle walkovers — frame line score uses this tournament's best-of (creation / format), not a hardcoded 3–0
    if (isWalkover === 'true' || isWalkover === true) {
      if (!walkoverWinner) {
        await t.rollback();
        return res.status(400).json({ success: false, error: "Walkover winner required" });
      }
      let winnerIdStr = String(walkoverWinner).trim();
      const p1s = String(match.player1Id);
      const p2s = String(match.player2Id);
      // Frontend may send side token when booking payload does not expose both UUIDs.
      if (winnerIdStr === "player1") winnerIdStr = p1s;
      if (winnerIdStr === "player2") winnerIdStr = p2s;
      if (winnerIdStr !== p1s && winnerIdStr !== p2s) {
        await t.rollback();
        return res.status(400).json({ success: false, error: "Walkover winner must be one of the two players in this match" });
      }

      const formatRow = await TournamentFormat.findOne({ where: { tournamentId: tournament.id }, transaction: t });

      let bestOf =
        match.bestOfFrames != null && Number(match.bestOfFrames) > 0 ? Number(match.bestOfFrames) : null;
      if (bestOf == null) {
        bestOf = resolveMatchBestOfFrames(match.roundNumber, match.roundType, formatRow);
      }
      if (bestOf == null && formatRow?.bestOfFrames != null && Number(formatRow.bestOfFrames) > 0) {
        bestOf = Number(formatRow.bestOfFrames);
      }
      if (bestOf == null || !Number.isFinite(bestOf) || bestOf < 1) {
        bestOf = 5; // Default for cue sports (snooker, pool, pooker)
      }
      const winFrames = Math.max(1, Math.ceil(bestOf / 2));

      resultData = {
        player1FramesWon: winnerIdStr === p1s ? winFrames : 0,
        player2FramesWon: winnerIdStr === p2s ? winFrames : 0,
        winner: winnerIdStr === p1s ? "player1" : "player2",
        isWalkover: true,
      };
      winner = winnerIdStr === p1s ? match.player1Id : match.player2Id;
    } else {
      // Regular match - calculate winner from scores
      if (String(sport).toLowerCase() === 'snooker' || String(sport).toLowerCase() === 'pooker') {
        let p1Frames = parseInt(player1Frames, 10) || 0;
        let p2Frames = parseInt(player2Frames, 10) || 0;
        let details = frameScores;

        if (frameScores && frameScores.length > 0) {
          // Parse frameScores if it's a JSON string
          let parsedFrames = frameScores;
          if (typeof frameScores === 'string') {
            try {
              parsedFrames = JSON.parse(frameScores);
            } catch (e) {
              // Use as-is if already parsed
              parsedFrames = frameScores;
            }
          }
          parsedFrames = normalizeFramesToBracketOrder(parsedFrames);
          // Count frame wins from details using numeric comparison (scores may arrive as strings)
          const safeFrames = Array.isArray(parsedFrames) ? parsedFrames : [];
          p1Frames = safeFrames.filter((f) => (parseInt(f.player1Score, 10) || 0) > (parseInt(f.player2Score, 10) || 0)).length;
          p2Frames = safeFrames.filter((f) => (parseInt(f.player2Score, 10) || 0) > (parseInt(f.player1Score, 10) || 0)).length;
          details = parsedFrames;
        } else if (shouldSwapPerspective) {
          [p1Frames, p2Frames] = [p2Frames, p1Frames];
        }

        if (p1Frames === 0 && p2Frames === 0) {
          await t.rollback();
          return res.status(400).json({ success: false, error: "Snooker scores required" });
        }

        winner = p1Frames > p2Frames ? match.player1Id : match.player2Id;
        resultData = {
          player1FramesWon: p1Frames,
          player2FramesWon: p2Frames,
          player1FrameDetails: details,
          player2FrameDetails: details,
          winner: p1Frames > p2Frames ? "player1" : "player2"
        };
      } else if (sport === 'pool') {
        let p1Racks = parseInt(player1RackWins, 10) || 0;
        let p2Racks = parseInt(player2RackWins, 10) || 0;
        let details = frameScores;

        if (frameScores && frameScores.length > 0) {
          // Parse frameScores if it's a JSON string
          let parsedFrames = frameScores;
          if (typeof frameScores === 'string') {
            try {
              parsedFrames = JSON.parse(frameScores);
            } catch (e) {
              // Use as-is if already parsed
              parsedFrames = frameScores;
            }
          }
          parsedFrames = normalizeFramesToBracketOrder(parsedFrames);
          // Count rack wins from details using numeric comparison (scores may arrive as strings)
          const safeRacks = Array.isArray(parsedFrames) ? parsedFrames : [];
          p1Racks = safeRacks.filter((r) => (parseInt(r.player1Score, 10) || 0) > (parseInt(r.player2Score, 10) || 0)).length;
          p2Racks = safeRacks.filter((r) => (parseInt(r.player2Score, 10) || 0) > (parseInt(r.player1Score, 10) || 0)).length;
          details = parsedFrames;
        } else if (shouldSwapPerspective) {
          [p1Racks, p2Racks] = [p2Racks, p1Racks];
        }

        if (p1Racks === 0 && p2Racks === 0) {
          await t.rollback();
          return res.status(400).json({ success: false, error: "Pool scores required" });
        }

        winner = p1Racks > p2Racks ? match.player1Id : match.player2Id;
        resultData = {
          player1FramesWon: p1Racks,
          player2FramesWon: p2Racks,
          player1FrameDetails: details,
          player2FrameDetails: details,
          winner: p1Racks > p2Racks ? "player1" : "player2"
        };
      } else if (sport === 'poker') {
        // Legacy poker logic - soon to be deprecated
        let p1Score = parseInt(player1Score, 10) || 0;
        let p2Score = parseInt(player2Score, 10) || 0;
        if (shouldSwapPerspective) {
          [p1Score, p2Score] = [p2Score, p1Score];
        }

        if (p1Score === 0 && p2Score === 0) {
          await t.rollback();
          return res.status(400).json({ success: false, error: "Scores required" });
        }

        winner = p1Score > p2Score ? match.player1Id : match.player2Id;
        resultData = {
          player1FramesWon: p1Score,
          player2FramesWon: p2Score,
          winner: p1Score > p2Score ? "player1" : "player2"
        };
      } else {
        await t.rollback();
        return res.status(400).json({ success: false, error: "Invalid sport type" });
      }
    }

    // Apply handicap if enabled on this match
    if (match.handicapApplied && (match.handicapPlayer1 || match.handicapPlayer2) && !isWalkover) {
      const handicapConfig = {
        enabled: true,
        type: "manual",
        method: { player1Handicap: match.handicapPlayer1 || 0, player2Handicap: match.handicapPlayer2 || 0 },
      };
      const adjusted = ScoringEngine.applyHandicapToMatch(resultData, handicapConfig);
      // Recalculate winner based on adjusted frames
      if (adjusted.player1FramesWon > adjusted.player2FramesWon) {
        winner = match.player1Id;
        resultData.winner = "player1";
      } else if (adjusted.player2FramesWon > adjusted.player1FramesWon) {
        winner = match.player2Id;
        resultData.winner = "player2";
      }
      resultData.player1FramesWon = adjusted.player1FramesWon;
      resultData.player2FramesWon = adjusted.player2FramesWon;
      resultData.handicapApplied = true;
    }

    // Update match with submission
    const updateData = {
      ...resultData,
      status: "pending_confirmation",
      reportedDate: new Date(),
      reportedBy: adminSubmit ? null : submittingPlayerId,
      // Note: TournamentMatch does not have imageUrl column - images stored separately
    };

    // Track which player confirmed (for dual-confirmation workflows)
    if (!adminSubmit && oppConfirm) {
      if (submittingAsPlayer1) {
        updateData.player1Confirmed = true;
        updateData.player1ConfirmedDate = new Date();
      } else if (submittingAsPlayer2) {
        updateData.player2Confirmed = true;
        updateData.player2ConfirmedDate = new Date();
      }
    }

    // If admin submitted, mark both confirmed
    if (adminSubmit) {
      updateData.adminSubmitted = true;
      updateData.submittedBy = userId;
      updateData.player1Confirmed = true;
      updateData.player2Confirmed = true;
      updateData.status = "completed";
    }

    console.log('[submitMatchResult] About to save updateData:', JSON.stringify(updateData, null, 2));
    console.log('[submitMatchResult] resultData keys:', Object.keys(resultData));

    await match.update(updateData, { transaction: t });
    console.log('[submitMatchResult] Match updated successfully');

    // ===== CREATE MATCH_RESULT RECORD FOR RESULTS PAGE =====
    // Tournament match results must be stored in the match_result table so they appear
    // on the Results page alongside league match results
    const { MatchResult } = require("../models");
    await MatchResult.create({
      bookingId: null,
      fixtureId: null,
      leagueId: null,
      tournamentId: match.tournamentId,
      matchType: "tournament",
      sport: sport || "snooker",
      submittedBy: matchSubmittedByPlayerId,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      player1Frames: resultData.player1FramesWon || 0,
      player2Frames: resultData.player2FramesWon || 0,
      player1RackWins: resultData.player1FramesWon || 0,
      player2RackWins: resultData.player2FramesWon || 0,
      player1Score: resultData.player1FramesWon || 0,
      player2Score: resultData.player2FramesWon || 0,
      snookerFrameDetails: sport === "snooker" ? resultData.player1FrameDetails : null,
      poolRackDetails: sport === "pool" ? resultData.player1FrameDetails : null,
      pokerResults: null,
      winnerId: resultData.winner === "player1" ? match.player1Id : (resultData.winner === "player2" ? match.player2Id : null),
      resultStatus: adminSubmit || !oppConfirm ? "Confirmed" : "Pending",
      submittedAt: new Date(),
      notes: notes || null,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : null
    }, { transaction: t });
    console.log('[submitMatchResult] MatchResult record created successfully for Results page');

    // Check if both players have confirmed (auto-complete match)
    const updatedMatch = await TournamentMatch.findByPk(matchId, { transaction: t });
    if (oppConfirm && updatedMatch.player1Confirmed && updatedMatch.player2Confirmed) {
      await updatedMatch.update({ status: "completed" }, { transaction: t });
    } else if (!oppConfirm || walkoverBool) {
      // Immediate reporting or walkovers auto-complete
      await updatedMatch.update({ status: "completed" }, { transaction: t });
    }

    // After match completion, update player statistics and check for round progression
    const completedMatch = await TournamentMatch.findByPk(matchId, { transaction: t });
    if (completedMatch.status === "completed") {
      // Update global player statistics
      await exports._updatePlayerStatisticsAfterMatch(completedMatch, tournament, t);

      // Update tournament-specific participant stats (detailed breakdown: frames, breaks, balls, etc.)
      await exports._updateTournamentParticipantStats(completedMatch, tournament.id, sport || "snooker", t);

      // Handle ladder challenge position swap (skip for draws)
      if (completedMatch.roundType === "ladder_challenge" && completedMatch.winner !== "draw") {
        const winnerId = completedMatch.winner === "player1" ? completedMatch.player1Id : completedMatch.player2Id;
        // player1 is always the challenger in ladder matches
        const result = BracketGenerator.processLadderResult(
          { playerId: completedMatch.player1Id },
          { playerId: completedMatch.player2Id },
          winnerId
        );
        if (result.swapped) {
          // Swap positions in the database
          const challenger = await TournamentParticipant.findOne({
            where: { tournamentId: tournament.id, playerId: completedMatch.player1Id },
            transaction: t,
          });
          const target = await TournamentParticipant.findOne({
            where: { tournamentId: tournament.id, playerId: completedMatch.player2Id },
            transaction: t,
          });
          if (challenger && target) {
            const tempPos = challenger.ladderPosition;
            await challenger.update({ ladderPosition: target.ladderPosition }, { transaction: t });
            await target.update({ ladderPosition: tempPos }, { transaction: t });
          }
        }
      } else {
        // Check if round is complete and progress to next round if needed
        await exports._checkAndProgressRound(tournament.id, completedMatch.roundNumber, t);
      }
    }

    // Create audit log
    await AuditLog.create({
      action: adminSubmit ? "match_result_submitted_by_admin" : "match_result_submitted",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
      notes: notes || null,
    }, { transaction: t });

    // ============================================================================
    // SEND EMAIL NOTIFICATION - Match result awaiting opponent confirmation
    // ============================================================================
    if (oppConfirm && !walkoverBool && !adminSubmit) {
      try {
        const { sendTournamentResultAwaitingConfirmation } = require("../utils/email");
        const opponentId = submittingPlayerId === match.player1Id ? match.player2Id : match.player1Id;
        const opponent = await Player.findByPk(opponentId, { transaction: t });
        const submittingPlayerData = await Player.findByPk(submittingPlayerId, { transaction: t });
        const opponentEmail = await getPlayerEmailForNotification(opponentId, t);

        if (opponent && opponentEmail) {
          console.info("[submitMatchResult] Sending tournament result awaiting confirmation email", {
            matchId,
            tournamentId: tournament.id,
            opponentId,
            submittingPlayerId,
          });

          const latestMatch = await TournamentMatch.findByPk(matchId, { transaction: t });
          const finishingRound = latestMatch.roundType || "Round";

          await sendTournamentResultAwaitingConfirmation({
            opponentEmail,
            opponentName: opponent.name || opponent.nickname,
            submitterName: submittingPlayerData?.name || submittingPlayerData?.nickname || "Opponent",
            tournamentName: tournament.name,
            tier: tournament.tier,
            matchDetails: { sport },
            finishingRound,
            pointsAwarded: 0
          });
        } else {
          console.warn("[submitMatchResult] Skipping tournament awaiting-confirmation email: opponent email missing", {
            matchId,
            tournamentId: tournament.id,
            opponentId,
          });
        }
      } catch (emailError) {
        console.error("[submitMatchResult] Error sending email notification:", emailError);
      }
    }

    await t.commit();

    const finalMatch = await TournamentMatch.findByPk(matchId, {
      include: [{ model: Tournament }]
    });

    res.json({
      success: true,
      data: finalMatch,
      message: oppConfirm && !walkoverBool
        ? "Match result submitted. Awaiting opponent confirmation."
        : "Match result submitted and confirmed",
      requiresOpponentConfirmation: oppConfirm && !adminSubmit && !(updatedMatch.player1Confirmed && updatedMatch.player2Confirmed),
    });
  } catch (error) {
    await t.rollback();
    console.error("submitMatchResult error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + (error.message || error) });
  }
};

/**
 * Opponent confirms match result
 */
exports.confirmMatchResult = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { userId } = req.user;
    const { matchId } = req.params;
    const { confirmed = true } = req.body;

    const match = await TournamentMatch.findByPk(matchId, {
      include: [{ model: Tournament }],
      transaction: t
    });

    if (!match) {
      await t.rollback();
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    if (match.player2Id == null) {
      await t.rollback();
      return res.status(400).json({ success: false, error: "Cannot confirm a BYE match" });
    }

    // Verify player is match participant
    const player = await Player.findOne({ where: { userId }, transaction: t });
    if (!player || (match.player1Id !== player.id && match.player2Id !== player.id)) {
      await t.rollback();
      return res.status(403).json({ success: false, error: "No authorization" });
    }

    const isPlayer1 = player.id === match.player1Id;
    const updateData = {};

    if (confirmed) {
      if (isPlayer1) {
        updateData.player1Confirmed = true;
        updateData.player1ConfirmedDate = new Date();
      } else {
        updateData.player2Confirmed = true;
        updateData.player2ConfirmedDate = new Date();
      }
    } else {
      // Dispute - set status to disputed
      updateData.status = "disputed";
      return res.status(400).json({
        success: false,
        error: "Result disputed. Please use the dispute workflow to submit evidence.",
        action: "submit_dispute"
      });
    }

    await match.update(updateData, { transaction: t });

    // Complete the match when:
    // (a) both players have explicitly set their confirmed flags, OR
    // (b) the match was in pending_confirmation (submitter already implicitly confirmed by submitting)
    //     and the other player has now explicitly confirmed — covers both new and legacy rows.
    const updatedMatch = await TournamentMatch.findByPk(matchId, { transaction: t });
    const bothFlagsSet = updatedMatch.player1Confirmed && updatedMatch.player2Confirmed;
    const opponentCompletesMatch = match.status === "pending_confirmation" && confirmed;

    if (bothFlagsSet || opponentCompletesMatch) {
      // Ensure both flags are true so downstream checks are consistent
      await updatedMatch.update({
        status: "completed",
        player1Confirmed: true,
        player2Confirmed: true,
        player1ConfirmedDate: updatedMatch.player1ConfirmedDate || new Date(),
        player2ConfirmedDate: updatedMatch.player2ConfirmedDate || new Date(),
      }, { transaction: t });

      // ===== UPDATE MATCH_RESULT RECORD =====
      const { MatchResult } = require("../models");
      const confirmedByPlayerId = isPlayer1 ? match.player1Id : match.player2Id;
      await MatchResult.update(
        { resultStatus: "Confirmed", confirmedBy: confirmedByPlayerId, confirmedAt: new Date() },
        {
          where: {
            tournamentId: match.tournamentId,
            matchType: "tournament",
            player1Id: match.player1Id,
            player2Id: match.player2Id,
          },
          transaction: t,
        }
      );
      console.log('[confirmMatchResult] MatchResult record confirmed for Results page');

      // Update player stats and progress round
      const tournament = await Tournament.findByPk(match.tournamentId, { transaction: t });
      await exports._updatePlayerStatisticsAfterMatch(updatedMatch, tournament, t);
      await exports._updateTournamentParticipantStats(updatedMatch, tournament.id, updatedMatch.sport || "snooker", t);
      await exports._checkAndProgressRound(tournament.id, updatedMatch.roundNumber, t);
    }

    await AuditLog.create({
      action: "match_result_confirmed",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
    }, { transaction: t });

    // ============================================================================
    // SEND EMAIL NOTIFICATION - Match result confirmed, notify both players
    // ============================================================================
    const updatedMatchForEmail = await TournamentMatch.findByPk(matchId, { transaction: t });
    if (updatedMatchForEmail.status === "completed") {
      try {
        const { sendTournamentResultConfirmed } = require("../utils/email");
        const player1Data = await Player.findByPk(match.player1Id, { transaction: t });
        const player2Data = await Player.findByPk(match.player2Id, { transaction: t });
        const tournament = await Tournament.findByPk(match.tournamentId, { transaction: t });

        let winnerName = "";
        if (updatedMatchForEmail.winner === "player1") {
          winnerName = player1Data?.name || player1Data?.nickname;
        } else if (updatedMatchForEmail.winner === "player2") {
          winnerName = player2Data?.name || player2Data?.nickname;
        } else if (updatedMatchForEmail.winner === "draw") {
          winnerName = "Draw";
        }

        const email1 = await getPlayerEmailForNotification(match.player1Id, t);
        const email2 = await getPlayerEmailForNotification(match.player2Id, t);

        if (email1 || email2) {
          console.info("[confirmMatchResult] Sending tournament result confirmed emails", {
            matchId,
            tournamentId: tournament?.id,
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            email1HasValue: !!email1,
            email2HasValue: !!email2,
          });

          await sendTournamentResultConfirmed({
            player1Email: email1,
            player1Name: player1Data?.name || player1Data?.nickname,
            player2Email: email2,
            player2Name: player2Data?.name || player2Data?.nickname,
            tournamentName: tournament?.name,
            tier: tournament?.tier,
            finishingRound: updatedMatchForEmail.roundType || "Round",
            pointsAwarded: 0,
            winnerName
          });
        } else {
          console.warn("[confirmMatchResult] Skipping confirmed emails: no player email addresses on file", {
            matchId,
            player1Id: match.player1Id,
            player2Id: match.player2Id,
          });
        }
      } catch (emailError) {
        console.error("[confirmMatchResult] Error sending confirmation email:", emailError);
      }
    }

    await t.commit();

    res.json({
      success: true,
      data: await TournamentMatch.findByPk(matchId),
      message: "Match result confirmed",
    });
  } catch (error) {
    await t.rollback();
    console.error("confirmMatchResult error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Dispute a tournament match result
 */
exports.disputeMatchResult = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { userId } = req.user;
    const { matchId } = req.params;
    const { disputeReason = "Result disputed by opponent" } = req.body;

    const match = await TournamentMatch.findByPk(matchId, {
      include: [{ model: Tournament }],
      transaction: t
    });

    if (!match) {
      await t.rollback();
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    // Verify player is match participant
    const player = await Player.findOne({ where: { userId }, transaction: t });
    if (!player || (match.player1Id !== player.id && match.player2Id !== player.id)) {
      await t.rollback();
      return res.status(403).json({ success: false, error: "No authorization" });
    }

    const tournament = match.Tournament;

    // Update match status to disputed
    await match.update({ status: "disputed" }, { transaction: t });

    // Create audit log
    await AuditLog.create({
      action: "match_result_disputed",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
      notes: disputeReason,
    }, { transaction: t });

    // ============================================================================
    // SEND EMAIL NOTIFICATION - Match result disputed
    // ============================================================================
    try {
      const { sendTournamentResultDisputed } = require("../utils/email");
      const player1Data = await Player.findByPk(match.player1Id, { transaction: t });
      const player2Data = await Player.findByPk(match.player2Id, { transaction: t });

      // Get tournament organizer email if available
      const organization = await Organization.findByPk(tournament.organizationId, { transaction: t });
      const organizerUser = organization ? await User.findByPk(organization.userId, { transaction: t }) : null;
      const organizerEmail = organizerUser?.email;
      const organizerName = organizerUser?.name || organization?.name;

      const email1 = await getPlayerEmailForNotification(match.player1Id, t);
      const email2 = await getPlayerEmailForNotification(match.player2Id, t);

      if (email1 || email2 || organizerEmail) {
        console.info("[disputeMatchResult] Sending tournament result disputed emails", {
          matchId,
          tournamentId: tournament.id,
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          organizerId: organization?.id,
        });

        await sendTournamentResultDisputed({
          player1Email: email1,
          player1Name: player1Data?.name || player1Data?.nickname,
          player2Email: email2,
          player2Name: player2Data?.name || player2Data?.nickname,
          organizerEmail,
          organizerName,
          tournamentName: tournament.name,
          tier: tournament.tier,
          finishingRound: match.roundType || "Round",
          disputeReason
        });
      } else {
        console.warn("[disputeMatchResult] Skipping dispute emails: no recipient emails", {
          matchId,
          tournamentId: tournament.id,
        });
      }
    } catch (emailError) {
      console.error("[disputeMatchResult] Error sending dispute email:", emailError);
      // Don't fail dispute if email fails
    }

    await t.commit();

    res.json({
      success: true,
      data: await TournamentMatch.findByPk(matchId),
      message: "Match result disputed. The dispute has been forwarded to the tournament organizer for review.",
    });
  } catch (error) {
    await t.rollback();
    console.error("disputeMatchResult error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// LATE REGISTRATION & FIXTURE REGENERATION
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/add-late-player
 * Add late player with strategy (after deadline/fixtures)
 * Supports: regenerate, fill_bye, qualifier, waitlist
 */
exports.addLatePlayerWithStrategy = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { playerId, strategy, reseedStrategy, reseedType } = req.body;
    const resolvedReseedStrategy = reseedStrategy ?? reseedType;

    if (!playerId || !strategy) {
      return res.status(400).json({
        success: false,
        error: "playerId and strategy are required",
      });
    }

    const result = await FixtureRegenerationService.addLatePlayerWithStrategy({
      tournamentId,
      playerId,
      strategy,
      reseedStrategy: resolvedReseedStrategy,
      userId,
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("addLatePlayerWithStrategy error:", error);
    const message = String(error?.message || "");
    const knownError =
      message.includes("LATE_") ||
      message.includes("REGENERATE_NOT_ALLOWED_AFTER_START") ||
      message.includes("NO_NEW_PLAYERS") ||
      message.includes("Invalid strategy") ||
      message.includes("players is required") ||
      message.includes("Tournament not found") ||
      message.includes("already registered") ||
      message.includes("Cannot regenerate");
    if (knownError) {
      return res.status(400).json({
        success: false,
        error: message || "Late entry request is invalid",
      });
    }
    return res.status(500).json({
      success: false,
      error: "Internal server error: " + (error.message || error),
    });
  }
};

/**
 * GET /api/tournaments/:tournamentId/regeneration-history
 * Get fixture regeneration history for tournament
 */
exports.getFixtureRegenerationHistory = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const history = await FixtureRegenerationService.getRegenerationHistory(tournamentId);
    return res.json({ success: true, data: history });
  } catch (error) {
    console.error("getFixtureRegenerationHistory error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error: " + (error.message || error),
    });
  }
};

/**
 * Helper: Update player statistics after match completion
 */
exports._updatePlayerStatisticsAfterMatch = async (match, tournament, transaction = null) => {
  try {
    const player1 = await Player.findByPk(match.player1Id, { transaction });
    const player2 = await Player.findByPk(match.player2Id, { transaction });

    if (!player1 || !player2) return;

    const framesWonPlayer1 = match.player1FramesWon || 0;
    const framesWonPlayer2 = match.player2FramesWon || 0;

    // Update Player 1
    const player1Stats = {
      matchesPlayed: (player1.matchesPlayed || 0) + 1,
      framesWon: (player1.framesWon || 0) + framesWonPlayer1,
      framesLost: (player1.framesLost || 0) + framesWonPlayer2,
    };
    if (match.winner === "player1") {
      player1Stats.matchesWon = (player1.matchesWon || 0) + 1;
    } else if (match.winner === "player2") {
      player1Stats.matchesLost = (player1.matchesLost || 0) + 1;
    }
    player1Stats.winPercentage = player1Stats.matchesPlayed > 0
      ? ((player1Stats.matchesWon || 0) / player1Stats.matchesPlayed * 100).toFixed(2)
      : 0;

    // Update Player 2
    const player2Stats = {
      matchesPlayed: (player2.matchesPlayed || 0) + 1,
      framesWon: (player2.framesWon || 0) + framesWonPlayer2,
      framesLost: (player2.framesLost || 0) + framesWonPlayer1,
    };
    if (match.winner === "player2") {
      player2Stats.matchesWon = (player2.matchesWon || 0) + 1;
    } else if (match.winner === "player1") {
      player2Stats.matchesLost = (player2.matchesLost || 0) + 1;
    }
    player2Stats.winPercentage = player2Stats.matchesPlayed > 0
      ? ((player2Stats.matchesWon || 0) / player2Stats.matchesPlayed * 100).toFixed(2)
      : 0;

    await player1.update(player1Stats, { transaction });
    await player2.update(player2Stats, { transaction });

    console.log(`[updatePlayerStats] Updated Player1 (${player1.id}):`, player1Stats);
    console.log(`[updatePlayerStats] Updated Player2 (${player2.id}):`, player2Stats);
  } catch (error) {
    console.error("[updatePlayerStats] Error:", error);
  }
};

/**
 * Update TournamentParticipant stats after a match is completed
 * Tracks detailed performance metrics: matchesWon, framesWon, breaks, balls potted, etc.
 */
exports._updateTournamentParticipantStats = async (match, tournamentId, sport, transaction = null) => {
  try {
    if (!match.player1Id || !match.player2Id) return; // Skip if bye (no player2)

    const { TournamentParticipant } = require("../models");

    // Get participant records for both players
    const [p1Participant, p2Participant] = await Promise.all([
      TournamentParticipant.findOne({
        where: { tournamentId, playerId: match.player1Id },
        transaction
      }),
      TournamentParticipant.findOne({
        where: { tournamentId, playerId: match.player2Id },
        transaction
      })
    ]);

    if (!p1Participant || !p2Participant) {
      console.warn(`[updateTournamentParticipantStats] Participant record missing for tournament ${tournamentId}`);
      return;
    }

    // Extract frame/rack counts
    const framesPlayer1 = match.player1FramesWon || 0;
    const framesPlayer2 = match.player2FramesWon || 0;

    // Extract break/ball stats from match frame details
    let breaks100_p1 = 0, breaks50_p1 = 0, breaks100_p2 = 0, breaks50_p2 = 0;
    let highestBreak = 0;
    let ballsPotted_p1 = 0, ballsPotted_p2 = 0;
    let sevenBall_p1 = 0, sevenBall_p2 = 0;
    let blackFinish_p1 = 0, blackFinish_p2 = 0;
    let whitewash_p1 = 0, whitewash_p2 = 0;

    if (String(sport).toLowerCase() === 'snooker' || String(sport).toLowerCase() === 'pooker') {
      const frameDetails = match.player1FrameDetails;
      if (Array.isArray(frameDetails)) {
        frameDetails.forEach(f => {
          // Count century and 50+ breaks
          const b1 = f.player1Break || f.player1HighestBreak || 0;
          const b2 = f.player2Break || f.player2HighestBreak || 0;
          if (b1 >= 100) breaks100_p1++;
          else if (b1 >= 50) breaks50_p1++;
          if (b2 >= 100) breaks100_p2++;
          else if (b2 >= 50) breaks50_p2++;
          highestBreak = Math.max(highestBreak, b1, b2);
        });
      }
    } else if (sport === 'pool') {
      const rackDetails = match.player1FrameDetails;
      ballsPotted_p1 = match.player1BallsPotted || 0;
      ballsPotted_p2 = match.player2BallsPotted || 0;
      sevenBall_p1 = match.player1SevenBallWins || 0;
      sevenBall_p2 = match.player2SevenBallWins || 0;
    }

    // Determine winner and calculate whitewash
    if (match.winner === 'player1') {
      if (framesPlayer2 === 0) whitewash_p1 = 1;
      else whitewash_p2 = 0;
      if (framesPlayer1 === 0) whitewash_p2 = 1;
      else whitewash_p1 = 0;
    } else if (match.winner === 'player2') {
      if (framesPlayer1 === 0) whitewash_p2 = 1;
      else whitewash_p1 = 0;
      if (framesPlayer2 === 0) whitewash_p1 = 1;
      else whitewash_p2 = 0;
    }

    // Update participant 1
    const updateP1 = {
      matchesPlayed: (p1Participant.matchesPlayed || 0) + 1,
      framesWon: (p1Participant.framesWon || 0) + framesPlayer1,
      framesLost: (p1Participant.framesLost || 0) + framesPlayer2,
      frameDifference: ((p1Participant.frameDifference || 0) + framesPlayer1) - framesPlayer2,
      whitewashWins: (p1Participant.whitewashWins || 0) + (match.winner === 'player1' && framesPlayer2 === 0 ? 1 : 0),
      whitewashLosses: (p1Participant.whitewashLosses || 0) + (match.winner === 'player2' && framesPlayer1 === 0 ? 1 : 0),
    };

    if (match.winner === 'player1') {
      updateP1.matchesWon = (p1Participant.matchesWon || 0) + 1;
    } else if (match.winner === 'player2') {
      updateP1.matchesLost = (p1Participant.matchesLost || 0) + 1;
    } else if (match.winner === 'draw') {
      updateP1.matchesDraw = (p1Participant.matchesDraw || 0) + 1;
    }

    // Add sport-specific stats
    if (String(sport).toLowerCase() === 'snooker' || String(sport).toLowerCase() === 'pooker') {
      updateP1.highestBreak = Math.max(p1Participant.highestBreak || 0, highestBreak);
      updateP1.breaks50Plus = (p1Participant.breaks50Plus || 0) + breaks50_p1;
      updateP1.breaks100Plus = (p1Participant.breaks100Plus || 0) + breaks100_p1;
      if (sport === 'pooker') {
        updateP1.ballsPotted = (p1Participant.ballsPotted || 0) + ballsPotted_p1;
        updateP1.blackFinishes = (p1Participant.blackFinishes || 0) + blackFinish_p1;
      }
    } else if (sport === 'pool') {
      updateP1.sevenBallWins = (p1Participant.sevenBallWins || 0) + sevenBall_p1;
      updateP1.ballsPotted = (p1Participant.ballsPotted || 0) + ballsPotted_p1;
    }

    await p1Participant.update(updateP1, { transaction });

    // Update participant 2
    const updateP2 = {
      matchesPlayed: (p2Participant.matchesPlayed || 0) + 1,
      framesWon: (p2Participant.framesWon || 0) + framesPlayer2,
      framesLost: (p2Participant.framesLost || 0) + framesPlayer1,
      frameDifference: ((p2Participant.frameDifference || 0) + framesPlayer2) - framesPlayer1,
      whitewashWins: (p2Participant.whitewashWins || 0) + (match.winner === 'player2' && framesPlayer1 === 0 ? 1 : 0),
      whitewashLosses: (p2Participant.whitewashLosses || 0) + (match.winner === 'player1' && framesPlayer2 === 0 ? 1 : 0),
    };

    if (match.winner === 'player2') {
      updateP2.matchesWon = (p2Participant.matchesWon || 0) + 1;
    } else if (match.winner === 'player1') {
      updateP2.matchesLost = (p2Participant.matchesLost || 0) + 1;
    } else if (match.winner === 'draw') {
      updateP2.matchesDraw = (p2Participant.matchesDraw || 0) + 1;
    }

    // Add sport-specific stats
    if (String(sport).toLowerCase() === 'snooker' || String(sport).toLowerCase() === 'pooker') {
      updateP2.highestBreak = Math.max(p2Participant.highestBreak || 0, highestBreak);
      updateP2.breaks50Plus = (p2Participant.breaks50Plus || 0) + breaks50_p2;
      updateP2.breaks100Plus = (p2Participant.breaks100Plus || 0) + breaks100_p2;
      if (sport === 'pooker') {
        updateP2.ballsPotted = (p2Participant.ballsPotted || 0) + ballsPotted_p2;
        updateP2.blackFinishes = (p2Participant.blackFinishes || 0) + blackFinish_p2;
      }
    } else if (sport === 'pool') {
      updateP2.sevenBallWins = (p2Participant.sevenBallWins || 0) + sevenBall_p2;
      updateP2.ballsPotted = (p2Participant.ballsPotted || 0) + ballsPotted_p2;
    }

    await p2Participant.update(updateP2, { transaction });

    console.log(`[updateTournamentParticipantStats] Updated stats for tournament ${tournamentId}:`, {
      player1: updateP1,
      player2: updateP2
    });

  } catch (error) {
    console.error("[updateTournamentParticipantStats] Error:", error);
  }
};

/**
 * Helper: Check if round is complete and progress tournament
 */
exports._checkAndProgressRound = async (tournamentId, completedRoundNumber, transaction = null) => {
  try {
    const tournament = await Tournament.findByPk(tournamentId, { transaction });
    if (!tournament) return;

    const round = await TournamentRound.findOne(
      { where: { tournamentId, roundNumber: completedRoundNumber }, transaction }
    );

    if (!round) return;

    // Count total and completed matches in this round (exclude byes - matches with null player2Id)
    const totalMatches = await TournamentMatch.count({
      where: {
        roundNumber: completedRoundNumber,
        tournamentId,
        player2Id: { [Op.ne]: null } // Exclude byes
      },
      transaction
    });

    const completedMatches = await TournamentMatch.count({
      where: {
        roundNumber: completedRoundNumber,
        tournamentId,
        status: "completed",
        player2Id: { [Op.ne]: null } // Exclude byes
      },
      transaction
    });

    console.log(`[progressRound] Round ${completedRoundNumber}: ${completedMatches}/${totalMatches} matches completed (excluding byes)`);

    // If all matches in round are NOT complete, don't progress yet
    if (completedMatches !== totalMatches || totalMatches === 0) {
      return;
    }

    if (round.status === "completed") {
      return;
    }

    // Mark this round as completed
    await round.update({ status: "completed" }, { transaction });
    await sendRoundCompletedEmails(tournament, completedRoundNumber, transaction);

    // Get tournament format
    const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction });
    if (!format) return;

    // Determine if there's a next round and generate it based on format
    const nextRoundNum = completedRoundNumber + 1;
    let hasNextRound = false;

    if (format.type === "knockout") {
      const advResult = await buildKnockoutAdvancingPlayerIds(
        tournamentId,
        completedRoundNumber,
        transaction
      );
      if (advResult.incomplete || advResult.advancing == null) {
        console.warn("[progressRound] Knockout round complete but advancers not fully resolved; skip auto-progress");
        return;
      }
      const advancing = advResult.advancing;
      const pcp = advResult.pairCountPrev;
      if (advancing.length > 1) {
        hasNextRound = true;
        await exports._generateNextKnockoutRound(tournamentId, nextRoundNum, transaction);
      } else if (advancing.length === 1 && pcp != null && pcp <= 1) {
        hasNextRound = false;
      } else if (advancing.length <= 1) {
        console.warn(
          "[progressRound] Expected multiple advancers but got",
          advancing.length,
          "; not marking tournament complete"
        );
        return;
      }
    } else if (format.type === "swiss") {
      const SwissPairingEngine = require("../services/SwissPairingEngine");
      const pc = await TournamentParticipant.count({
        where: { tournamentId, status: "approved" },
        transaction,
      });
      const maxRounds =
        format.maxRounds || SwissPairingEngine.defaultSwissRoundCount(Math.max(2, Number(pc) || 2));
      hasNextRound = nextRoundNum <= maxRounds;

      if (hasNextRound) {
        await exports._generateNextSwissRound(tournamentId, nextRoundNum, transaction);
      }
    } else if (format.type === "round_robin") {
      // RR: all pairings are stored in TournamentMatch with roundNumber 1..N, but initial bracket
      // generation often creates only one TournamentRound row (Round 1). Using TournamentRound.max
      // alone would stay at 1 and incorrectly mark the tournament completed after Round 1.
      const maxFromMatches = await TournamentMatch.max("roundNumber", {
        where: { tournamentId },
        transaction,
      });
      const maxFromRounds = await TournamentRound.max("roundNumber", {
        where: { tournamentId },
        transaction,
      });
      const maxRound = Math.max(
        Number(maxFromMatches) || 0,
        Number(maxFromRounds) || 0
      );
      hasNextRound = maxRound > 0 && nextRoundNum <= maxRound;
    } else if (format.type === "groups_knockout") {
      // Groups+Knockout: check if we're still in group stage or moving to knockout
      const knockoutStartRound = format.knockoutStartRound || 999;

      if (completedRoundNumber < knockoutStartRound) {
        // Still in group stage - continue with more group rounds if configured
        hasNextRound = nextRoundNum < knockoutStartRound;
        if (hasNextRound) {
          // Generate next group stage round if needed
          // (For now, group stage is single round, so typically this won't trigger)
        }
      } else if (completedRoundNumber === knockoutStartRound - 1) {
        // TRANSITIONING from group stage to knockout - this is critical
        // Must extract qualified players from groups and seed knockout bracket
        hasNextRound = true;
        await exports._transitionGroupsToKnockout(tournamentId, nextRoundNum, transaction);
      } else {
        const advResult = await buildKnockoutAdvancingPlayerIds(
          tournamentId,
          completedRoundNumber,
          transaction
        );
        if (advResult.incomplete || advResult.advancing == null) {
          console.warn("[progressRound] Knockout advancers incomplete; skip auto-progress");
          return;
        }
        const advancing = advResult.advancing;
        const pcp = advResult.pairCountPrev;
        if (advancing.length > 1) {
          hasNextRound = true;
          await exports._generateNextKnockoutRound(tournamentId, nextRoundNum, transaction);
        } else if (advancing.length === 1 && pcp != null && pcp <= 1) {
          hasNextRound = false;
        } else if (advancing.length <= 1) {
          console.warn("[progressRound] Ambiguous knockout advancers; skip auto-complete");
          return;
        }
      }
    }

    if (hasNextRound) {
      // Progress tournament to next round
      await tournament.update({ currentRound: nextRoundNum }, { transaction });
      const nextRound = await TournamentRound.findOne({
        where: { tournamentId, roundNumber: nextRoundNum },
        transaction,
      });
      if (nextRound && nextRound.status === "not_started") {
        await nextRound.update({ status: "in_progress" }, { transaction });
        await sendRoundStartEmails(tournament, nextRoundNum, transaction);
      }
    } else {
      // Tournament finished - update status and award ranking points
      await tournament.update({ status: "completed", currentRound: nextRoundNum }, { transaction });

      if (tournament.ranked) {
        await exports._awardRankingPoints(tournamentId, transaction);
      }
    }
  } catch (error) {
    console.error("[progressRound] Error:", error);
  }
};

/**
 * Manual round progression endpoint:
 * - knockout/groups_knockout: generate next round from completed current round winners
 * - round_robin: unlock next pre-generated round
 */
exports.generateNextRound = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId, { transaction: t });
    if (!tournament) {
      await t.rollback();
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const userOrganization = await Organization.findOne({ where: { userId }, transaction: t });
    if (!userOrganization || userOrganization.id !== tournament.organizationId) {
      await t.rollback();
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction: t });
    if (!format) {
      await t.rollback();
      return res.status(400).json({ success: false, error: "Tournament format not found" });
    }

    const knockoutStartRoundPref = Number(format.knockoutStartRound) || 999;

    // groups_knockout — group stage: per-group advancement (body.groupNumber) or knockout (startKnockout).
    if (format.type === "groups_knockout") {
      const knockoutRoundRow = await TournamentRound.findOne({
        where: { tournamentId, roundType: "knockout_round" },
        transaction: t,
      });

      if (!knockoutRoundRow) {
        const startKnockout = req.body?.startKnockout === true || req.body?.phase === "knockout";

        if (startKnockout) {
          const nextRoundNum = knockoutStartRoundPref;
          const totalGroupMatches = await TournamentMatch.count({
            where: {
              tournamentId,
              roundNumber: { [Op.lt]: nextRoundNum },
              player2Id: { [Op.ne]: null },
            },
            transaction: t,
          });
          const completedGroupMatches = await TournamentMatch.count({
            where: {
              tournamentId,
              roundNumber: { [Op.lt]: nextRoundNum },
              player2Id: { [Op.ne]: null },
              status: "completed",
            },
            transaction: t,
          });
          if (totalGroupMatches === 0 || completedGroupMatches < totalGroupMatches) {
            await t.rollback();
            return res.status(400).json({
              success: false,
              error: "All group stage matches must be completed before starting the knockout bracket.",
            });
          }

          await exports._transitionGroupsToKnockout(tournamentId, nextRoundNum, t);
          const createdNextRound = await TournamentRound.findOne({
            where: { tournamentId, roundNumber: nextRoundNum, roundType: "knockout_round" },
            transaction: t,
          });
          if (!createdNextRound) {
            await t.rollback();
            return res.status(500).json({ success: false, error: "Knockout transition failed" });
          }
          if (createdNextRound.status === "not_started") {
            await createdNextRound.update({ status: "in_progress" }, { transaction: t });
            await sendRoundStartEmails(tournament, nextRoundNum, t);
          }
          for (let rn = 1; rn < nextRoundNum; rn++) {
            const tr = await TournamentRound.findOne({
              where: { tournamentId, roundNumber: rn, roundType: "group_stage" },
              transaction: t,
            });
            if (tr && tr.status !== "completed") {
              await tr.update({ status: "completed" }, { transaction: t });
            }
          }
          await tournament.update({ currentRound: nextRoundNum, status: "in_progress" }, { transaction: t });
          await t.commit();
          return res.json({
            success: true,
            message: "Knockout bracket created",
            data: { currentRound: nextRoundNum, phase: "knockout" },
          });
        }

        const bodyGroupNumber =
          req.body?.groupNumber != null && req.body?.groupNumber !== ""
            ? parseInt(req.body.groupNumber, 10)
            : NaN;

        if (!Number.isFinite(bodyGroupNumber)) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            error:
              "Group stage: pass groupNumber to advance that group, or startKnockout: true when every group match is finished.",
          });
        }

        const tg = await TournamentGroup.findOne({
          where: { tournamentId, groupNumber: bodyGroupNumber },
          transaction: t,
        });
        if (!tg) {
          await t.rollback();
          return res.status(404).json({ success: false, error: "Group not found" });
        }

        let playerIds = tg.playerIds || [];
        if (typeof playerIds === "string") {
          try {
            playerIds = JSON.parse(playerIds);
          } catch {
            playerIds = [];
          }
        }
        if (!Array.isArray(playerIds)) playerIds = [];

        const maxRoundsForGroup =
          playerIds.length < 2 ? 0 : playerIds.length % 2 === 0 ? playerIds.length - 1 : playerIds.length;
        const gc = Number(tg.currentRound || 1);

        if (maxRoundsForGroup === 0) {
          await t.rollback();
          return res.status(400).json({ success: false, error: "Group has too few players" });
        }

        if (tg.status === "completed") {
          await t.rollback();
          return res.status(400).json({
            success: false,
            error: "This group has already completed the group stage.",
          });
        }

        if (gc > maxRoundsForGroup) {
          await t.rollback();
          return res.status(400).json({ success: false, error: "Invalid group round state" });
        }

        const groupMatches = await TournamentMatch.findAll({
          where: {
            tournamentId,
            groupNumber: bodyGroupNumber,
            roundNumber: gc,
            player2Id: { [Op.ne]: null },
          },
          transaction: t,
        });

        if (groupMatches.length === 0) {
          await t.rollback();
          return res.status(400).json({ success: false, error: "No matches found for this group round" });
        }

        const incomplete = groupMatches.filter((m) => m.status !== "completed");
        if (incomplete.length > 0) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            error: "Cannot advance: not all matches in this group round are complete.",
            data: {
              groupNumber: bodyGroupNumber,
              roundNumber: gc,
              incompleteCount: incomplete.length,
            },
          });
        }

        if (gc < maxRoundsForGroup) {
          await tg.update({ currentRound: gc + 1, status: "in_progress" }, { transaction: t });
        } else {
          await tg.update({ status: "completed", currentRound: gc }, { transaction: t });
        }

        const allGroupsFresh = await TournamentGroup.findAll({ where: { tournamentId }, transaction: t });
        const substantive = allGroupsFresh.filter((g) => Number(g.totalPlayers || 0) >= 2);
        const allSubstantiveDone =
          substantive.length > 0 && substantive.every((g) => g.status === "completed");
        if (allSubstantiveDone) {
          for (let rn = 1; rn < knockoutStartRoundPref; rn++) {
            const tr = await TournamentRound.findOne({
              where: { tournamentId, roundNumber: rn, roundType: "group_stage" },
              transaction: t,
            });
            if (tr && tr.status !== "completed") {
              await tr.update({ status: "completed" }, { transaction: t });
            }
          }
        }

        await t.commit();
        return res.json({
          success: true,
          message:
            gc < maxRoundsForGroup
              ? `Group ${bodyGroupNumber} advanced to round ${gc + 1}`
              : `Group ${bodyGroupNumber} completed the group stage`,
          data: {
            groupNumber: bodyGroupNumber,
            currentRound: gc < maxRoundsForGroup ? gc + 1 : gc,
            groupStatus: gc < maxRoundsForGroup ? "in_progress" : "completed",
          },
        });
      }
    }

    // Determine current round number robustly.
    // Swiss: `tournament.currentRound` can be out-of-sync with match rows, so derive from match rows.
    let currentRoundNumber = Number(tournament.currentRound || 1);
    let currentRound = null;

    if (format.type === "swiss") {
      // IMPORTANT: for Swiss we must progress from the latest ROUND where ALL playable matches are completed.
      // Otherwise, if round N+1 already has scheduled matches, `max(roundNumber)` can incorrectly lock progression.
      const roundProgressRows = await TournamentMatch.findAll({
        where: {
          tournamentId,
          // exclude bye rows (BYE has player2Id === null)
          player2Id: { [Op.ne]: null },
        },
        attributes: [
          "roundNumber",
          [sequelize.fn("COUNT", sequelize.col("id")), "totalMatches"],
          [
            sequelize.literal("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"),
            "completedMatches",
          ],
        ],
        group: ["roundNumber"],
        transaction: t,
        raw: true,
      });

      const completedRounds = (roundProgressRows || [])
        .map((r) => ({
          roundNumber: Number(r.roundNumber),
          totalMatches: Number(r.totalMatches || 0),
          completedMatches: Number(r.completedMatches || 0),
        }))
        .filter((r) => r.totalMatches > 0 && r.completedMatches === r.totalMatches)
        .map((r) => r.roundNumber);

      if (completedRounds.length > 0) {
        currentRoundNumber = Math.max(...completedRounds);
      } else {
        // Fallback: if nothing is fully completed yet, use the highest round number present
        // (the later completion gate will block with a clear error).
        const maxMatchRound = await TournamentMatch.max("roundNumber", {
          where: {
            tournamentId,
            player2Id: { [Op.ne]: null },
          },
          transaction: t,
        });
        if (maxMatchRound) currentRoundNumber = Number(maxMatchRound);
      }

      currentRound = await TournamentRound.findOne({
        where: { tournamentId, roundNumber: currentRoundNumber },
        transaction: t,
      });
    } else {
      currentRound = await TournamentRound.findOne({
        where: { tournamentId, roundNumber: currentRoundNumber },
        transaction: t,
      });
    }

    if (!currentRound && format.type !== "swiss") {
      await t.rollback();
      return res.status(400).json({ success: false, error: "Current round not found" });
    }

    const actionableMatches = await TournamentMatch.findAll({
      where: {
        tournamentId,
        roundNumber: currentRoundNumber,
        player2Id: { [Op.ne]: null }, // Exclude BYE auto-advances from completion gate
      },
      transaction: t,
    });

    const incomplete = actionableMatches.filter((m) => m.status !== "completed");
    if (incomplete.length > 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: "Cannot progress round: some matches are still incomplete",
        data: {
          currentRound: currentRoundNumber,
          totalMatches: actionableMatches.length,
          completedMatches: actionableMatches.length - incomplete.length,
        },
      });
    }

    if (format.type === "swiss") {
      // Swiss manual progression:
      // - mark current round completed (if not already)
      // - generate next round only if it doesn't already exist
      const SwissPairingEngine = require("../services/SwissPairingEngine");
      const approvedCount = await TournamentParticipant.count({
        where: { tournamentId, status: "approved" },
        transaction: t,
      });
      const maxRounds =
        format.maxRounds ||
        SwissPairingEngine.defaultSwissRoundCount(
          Math.max(2, Number(approvedCount) || 2)
        );

      const nextRoundNum = currentRoundNumber + 1;
      if (nextRoundNum > maxRounds) {
        // Tournament complete
        await tournament.update({ status: "completed", currentRound: nextRoundNum }, { transaction: t });
        if (tournament.ranked) {
          await exports._awardRankingPoints(tournamentId, t);
        }
        await t.commit();
        return res.json({
          success: true,
          message: "Tournament completed (Swiss max rounds reached)",
          data: { currentRound: nextRoundNum, status: "completed" },
        });
      }

      // Mark the current round completed (needed for UI/status history).
      if (currentRound && currentRound.status !== "completed") {
        await currentRound.update({ status: "completed" }, { transaction: t });
        await sendRoundCompletedEmails(tournament, currentRoundNumber, t);
      }

      // Generate next Swiss round if it has no matches yet.
      // This fixes the case where a `TournamentRound` row exists (e.g. created earlier)
      // but its fixtures were never generated.
      const nextRoundMatchesCount = await TournamentMatch.count({
        where: { tournamentId, roundNumber: nextRoundNum },
        transaction: t,
      });

      if (nextRoundMatchesCount === 0) {
        console.log(
          `[Swiss Next Round] Generating: tournament=${tournamentId} fromRound=${currentRoundNumber} -> nextRound=${nextRoundNum}`
        );
        await exports._generateNextSwissRound(tournamentId, nextRoundNum, t);
      }

      const nextRound = await TournamentRound.findOne({
        where: { tournamentId, roundNumber: nextRoundNum },
        transaction: t,
      });

      if (nextRound && nextRound.status === "not_started") {
        await nextRound.update({ status: "in_progress" }, { transaction: t });
        await sendRoundStartEmails(tournament, nextRoundNum, t);
      }

      await tournament.update({ currentRound: nextRoundNum, status: "in_progress" }, { transaction: t });
      await t.commit();
      return res.json({
        success: true,
        message: `Swiss round ${nextRoundNum} generated successfully`,
        data: { currentRound: nextRoundNum, status: "in_progress", generated: true },
      });
    }

    if (currentRound.status !== "completed") {
      await currentRound.update({ status: "completed" }, { transaction: t });
      await sendRoundCompletedEmails(tournament, currentRoundNumber, t);
    }

    const nextRoundNum = currentRoundNumber + 1;
    const existingNextRound = await TournamentRound.findOne({
      where: { tournamentId, roundNumber: nextRoundNum },
      transaction: t,
    });

    if (format.type === "round_robin") {
      if (!existingNextRound) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          error: "No next round available to unlock",
        });
      }

      if (existingNextRound.status === "not_started") {
        await existingNextRound.update({ status: "in_progress" }, { transaction: t });
        await sendRoundStartEmails(tournament, nextRoundNum, t);
      }

      await tournament.update({ currentRound: nextRoundNum }, { transaction: t });
      await t.commit();
      return res.json({
        success: true,
        message: `Round ${nextRoundNum} unlocked`,
        data: { currentRound: nextRoundNum, generated: false, unlocked: true },
      });
    }

    if (existingNextRound) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        error: `Round ${nextRoundNum} already exists`,
      });
    }

    if (format.type === "knockout" || format.type === "groups_knockout") {
      const knockoutStartRound = format.knockoutStartRound || 999;
      const isGroupStageToKnockout =
        format.type === "groups_knockout" && currentRoundNumber === knockoutStartRound - 1;

      if (isGroupStageToKnockout) {
        await exports._transitionGroupsToKnockout(tournamentId, nextRoundNum, t);
      } else {
        const advPreview = await buildKnockoutAdvancingPlayerIds(
          tournamentId,
          currentRoundNumber,
          t
        );
        if (advPreview.incomplete || advPreview.advancing == null) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            error:
              "Cannot generate next round: bracket is not fully resolved. Ensure every match in this round is completed and bye metadata (byeByPairIndex) exists for auto-advances.",
          });
        }
        if (advPreview.invalidMeta) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            error: "Knockout bracket metadata is invalid for this round (bracket size vs round index).",
          });
        }

        const advPreviewList = advPreview.advancing;
        const pairCountPrev = advPreview.pairCountPrev;

        const isTrueFinalLayer =
          pairCountPrev != null &&
          pairCountPrev <= 1 &&
          advPreviewList.length === 1;

        if (advPreviewList.length <= 1) {
          if (isTrueFinalLayer) {
            await tournament.update(
              { status: "completed", currentRound: currentRoundNumber },
              { transaction: t }
            );
            await t.commit();
            return res.json({
              success: true,
              message: "Tournament finished; champion decided.",
              data: { completed: true, winnerId: advPreviewList[0] || null },
            });
          }
          await t.rollback();
          return res.status(400).json({
            success: false,
            error:
              advPreviewList.length === 0
                ? "No advancing players computed. Check bracket metadata and match results."
                : "Expected more players to advance (byes may be missing from round description). Refixtures or regenerate bracket if metadata is wrong.",
          });
        }

        await exports._generateNextKnockoutRound(tournamentId, nextRoundNum, t);
      }

      const createdNextRound = await TournamentRound.findOne({
        where: { tournamentId, roundNumber: nextRoundNum },
        transaction: t,
      });

      if (!createdNextRound) {
        await t.rollback();
        return res.status(500).json({
          success: false,
          error: "Next round generation failed",
        });
      }

      if (createdNextRound.status === "not_started") {
        await createdNextRound.update({ status: "in_progress" }, { transaction: t });
        await sendRoundStartEmails(tournament, nextRoundNum, t);
      }

      await tournament.update({ currentRound: nextRoundNum, status: "in_progress" }, { transaction: t });
      await t.commit();
      return res.json({
        success: true,
        message: `Round ${nextRoundNum} generated successfully`,
        data: { currentRound: nextRoundNum, generated: true },
      });
    }

    await t.rollback();
    return res.status(400).json({
      success: false,
      error: `Manual next-round generation is not supported for format: ${format.type}`,
    });
  } catch (error) {
    await t.rollback();
    console.error("generateNextRound error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Helper: Generate next knockout round matches based on previous round winners
 */
exports._generateNextKnockoutRound = async (tournamentId, roundNumber, transaction = null) => {
  try {
    const tournament = await Tournament.findByPk(tournamentId, { transaction });
    const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction });
    const scoringRules = await TournamentScoringRules.findOne({ where: { tournamentId }, transaction });
    const previousRound = await TournamentRound.findOne(
      { where: { tournamentId, roundNumber: roundNumber - 1 }, transaction }
    );

    if (!tournament || !format || !previousRound) return;

    const advResult = await buildKnockoutAdvancingPlayerIds(tournamentId, roundNumber - 1, transaction);
    if (advResult.incomplete || !advResult.advancing) {
      console.warn("[generateNextKnockoutRound] Previous round not ready or incomplete");
      return;
    }
    const advancing = advResult.advancing;

    if (advancing.length < 2) return;

    const existingRound = await TournamentRound.findOne({
      where: { tournamentId, roundNumber },
      transaction,
    });
    if (existingRound) return;

    const allRoundsForMeta = await TournamentRound.findAll({
      where: { tournamentId },
      order: [["roundNumber", "ASC"]],
      transaction,
    });
    let bracketSize = null;
    for (const r of allRoundsForMeta) {
      const m = parseKnockoutRoundDescription(r);
      if (m?.knockoutBracketSize != null && Number(m.knockoutBracketSize) > 0) {
        bracketSize = Number(m.knockoutBracketSize);
        break;
      }
    }

    const playersInRound = advancing.length;
    const matchRoundType = getKnockoutMatchRoundTypeByPlayers(playersInRound);

    let bestOfFrames = null;
    if (format && format.roundFormats && typeof format.roundFormats === "object") {
      const roundKey = String(roundNumber);
      bestOfFrames = format.roundFormats[roundKey] || format.roundFormats["default"] || null;
    }
    if (!bestOfFrames) {
      bestOfFrames = scoringRules?.bestOfFrames || null;
    }

    const fallbackStart = await resolveTournamentDefaultFixtureDate(tournament, transaction);
    const baseScheduledDate = previousRound?.deadline
      ? new Date(previousRound.deadline)
      : fallbackStart;
    const baseDeadline = new Date(baseScheduledDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const nextByePairIndex = {};
    const nextMatches = [];
    for (let i = 0; i < advancing.length; i += 2) {
      const pairIndex = i / 2;
      const a = advancing[i];
      const b = advancing[i + 1];
      if (a && b) {
        nextMatches.push({
          tournamentId,
          roundNumber,
          roundType: matchRoundType,
          player1Id: a,
          player2Id: b,
          status: "scheduled",
          winner: null,
          bestOfFrames,
          matchNumber: pairIndex + 1,
          scheduledDate: baseScheduledDate,
          scheduledDeadline: baseDeadline,
        });
      } else if (a && !b) {
        nextByePairIndex[String(pairIndex)] = a;
      } else if (!a && b) {
        nextByePairIndex[String(pairIndex)] = b;
      }
    }

    const nextRound = await TournamentRound.create(
      {
        tournamentId,
        roundNumber,
        roundType: "knockout_round",
        name: getKnockoutRoundDisplayName(playersInRound, roundNumber),
        status: "not_started",
        totalMatches: nextMatches.length,
        startDate: baseScheduledDate,
        deadline: baseDeadline,
        description: JSON.stringify({
          knockoutBracketSize: bracketSize || undefined,
          byeByPairIndex: nextByePairIndex,
        }),
      },
      { transaction }
    );

    const toInsert = nextMatches.map((m) => ({ ...m, roundId: nextRound.id }));
    if (toInsert.length > 0) {
      await TournamentMatch.bulkCreate(toInsert, { transaction });

      // Update tournament's totalMatches to include the new round
      const currentTotal = Number(tournament.totalMatches) || 0;
      await tournament.update({ totalMatches: currentTotal + toInsert.length }, { transaction });
    }

    console.log(`[generateNextKnockoutRound] Generated ${toInsert.length} matches for round ${roundNumber}`);
  } catch (error) {
    console.error("[generateNextKnockoutRound] Error:", error);
  }
};

/**
 * Helper: Transition from group stage to knockout stage
 * Extracts qualified players from each group and creates seeded knockout bracket
 */
exports._transitionGroupsToKnockout = async (tournamentId, knockoutRoundNum, transaction = null) => {
  try {
    const { BracketGenerator } = require("./tournamentManager");
    const TiebreakerEngine = require("../engines/TiebreakerEngine");
    const { TournamentGroup } = require("../models");

    const tournament = await Tournament.findByPk(tournamentId, { transaction });
    const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction });
    const scoringRules = await TournamentScoringRules.findOne({ where: { tournamentId }, transaction });

    if (!tournament || !format || !scoringRules) {
      console.error(`[transitionGroupsToKnockout] Missing tournament config (tournament=${!!tournament}, format=${!!format}, scoringRules=${!!scoringRules})`);
      return;
    }

    console.log(`[transitionGroupsToKnockout] Transitioning tournament ${tournamentId} from group stage to knockout (round ${knockoutRoundNum})`);

    // Get all groups
    const groups = await TournamentGroup.findAll({
      where: { tournamentId },
      transaction
    });

    if (!groups || groups.length === 0) {
      console.error(`[transitionGroupsToKnockout] No groups found for tournament ${tournamentId}`);
      return;
    }

    console.log(`[transitionGroupsToKnockout] Found ${groups.length} groups`);

    // Get all group stage matches (roundNumber < knockoutStartRound)
    const knockoutStartRound = format.knockoutStartRound || 999;
    const allGroupMatches = await TournamentMatch.findAll({
      where: {
        tournamentId,
        roundNumber: { [Op.lt]: knockoutStartRound },
        status: "completed",
        player2Id: { [Op.ne]: null } // Exclude byes
      },
      transaction
    });

    console.log(`[transitionGroupsToKnockout] Found ${allGroupMatches.length} completed group stage matches`);

    // Check if group stage is actually complete
    const totalGroupMatches = await TournamentMatch.count({
      where: {
        tournamentId,
        roundNumber: { [Op.lt]: knockoutStartRound },
        player2Id: { [Op.ne]: null } // Exclude byes
      },
      transaction
    });

    console.log(`[transitionGroupsToKnockout] Total group stage matches: ${totalGroupMatches}, completed: ${allGroupMatches.length}`);

    if (allGroupMatches.length < totalGroupMatches) {
      console.warn(`[transitionGroupsToKnockout] Not all group stage matches complete. Aborting transition.`);
      return;
    }

    // Rank players within each group, persist qualifiers, then seed knockout BYEs by overall top-rank order.
    const qualifiersPerGroup = format.qualifiersPerGroup || 2;
    const qualifierEntries = []; // [{ playerId, groupNumber, groupPosition, points, frameDifference, framesWon }]

    for (const group of groups) {
      let playerIds = group.playerIds || [];
      if (typeof playerIds === "string") {
        try {
          playerIds = JSON.parse(playerIds);
        } catch (_) {
          playerIds = [];
        }
      }
      if (!Array.isArray(playerIds)) playerIds = [];

      const groupMatches = allGroupMatches.filter((m) => m.groupNumber === group.groupNumber);
      const standings = TiebreakerEngine.calculateGroupStandings(playerIds, groupMatches, scoringRules);
      const groupTop = TiebreakerEngine.getTopPlayers(standings, qualifiersPerGroup);

      const qualifiedIds = groupTop.map((p) => p.playerId);

      // Persist who qualified from this group for frontend + later analytics.
      await group.update(
        {
          qualifiedPlayerIds: qualifiedIds,
          totalQualified: qualifiedIds.length,
        },
        { transaction }
      );

      groupTop.forEach((p, idx) => {
        qualifierEntries.push({
          playerId: p.playerId,
          groupNumber: group.groupNumber,
          groupPosition: idx + 1, // 1 = best in this group
          points: p.points || 0,
          framesWon: p.framesWon || 0,
          framesLost: p.framesLost || 0,
          frameDifference: (p.framesWon || 0) - (p.framesLost || 0),
        });
      });
    }

    if (qualifierEntries.length < 2) {
      console.error(`[transitionGroupsToKnockout] Not enough qualified players to generate knockout. Qualified=${qualifierEntries.length}`);
      return;
    }

    // Seed ordering for knockout: top-ranked BYEs first.
    // Primary: groupPosition (1st place gets higher seed than 2nd place, etc.)
    // Secondary: group performance metrics (points/frame diff) to break same-position ties deterministically.
    qualifierEntries.sort((a, b) => {
      if (a.groupPosition !== b.groupPosition) return a.groupPosition - b.groupPosition;
      const ptsDiff = (b.points || 0) - (a.points || 0);
      if (ptsDiff !== 0) return ptsDiff;
      const fdDiff = (b.frameDifference || 0) - (a.frameDifference || 0);
      if (fdDiff !== 0) return fdDiff;
      const fwDiff = (b.framesWon || 0) - (a.framesWon || 0);
      if (fwDiff !== 0) return fwDiff;
      if (a.groupNumber !== b.groupNumber) return a.groupNumber - b.groupNumber;
      return String(a.playerId).localeCompare(String(b.playerId));
    });

    const seededPlayerIds = qualifierEntries.map((e) => e.playerId);

    // Generate knockout bracket with seeded BYEs (REQUIRED).
    const existingKnockoutRound = await TournamentRound.findOne({
      where: { tournamentId, roundNumber: knockoutRoundNum, roundType: "knockout_round" },
      transaction,
    });
    if (existingKnockoutRound) {
      console.warn(`[transitionGroupsToKnockout] Knockout round ${knockoutRoundNum} already exists; skipping regeneration.`);
      return;
    }

    const koResult = BracketGenerator.generateKnockoutMatches(seededPlayerIds, tournamentId, "top_seeded");

    const knockoutMatches = (koResult.matches || []).map((m) => ({
      ...m,
      roundNumber: knockoutRoundNum,
    }));

    if (!knockoutMatches || knockoutMatches.length === 0) {
      console.error(`[transitionGroupsToKnockout] No knockout matches generated`);
      return;
    }

    // Create knockout round
    const knockoutRound = await TournamentRound.create({
      tournamentId,
      roundNumber: knockoutRoundNum,
      roundType: "knockout_round",
      name: `Knockout Round ${knockoutRoundNum}`,
      status: 'not_started',
      totalMatches: knockoutMatches.length,
      description: JSON.stringify({
        knockoutBracketSize: koResult.bracketSize,
        byeByPairIndex: koResult.byeByPairIndex || {},
      }),
    }, { transaction });

    const startDateObj = await resolveTournamentDefaultFixtureDate(tournament, transaction);

    // Determine bestOfFrames for the knockout round from roundFormats
    let bestOfFrames = null;
    if (format.roundFormats && typeof format.roundFormats === "object") {
      const roundKey = String(knockoutRoundNum);
      bestOfFrames = format.roundFormats[roundKey] || format.roundFormats["knockout"] || format.roundFormats["default"] || null;
    }
    if (!bestOfFrames && scoringRules.bestOfFrames) {
      bestOfFrames = scoringRules.bestOfFrames;
    }

    // Create knockout matches with proper scheduling
    const createdMatches = await TournamentMatch.bulkCreate(
      knockoutMatches.map(m => ({
        ...m,
        roundId: knockoutRound.id,
        roundNumber: knockoutRoundNum,
        bestOfFrames,
        scheduledDate: startDateObj,
        scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
      })),
      { transaction }
    );

    // Update tournament's totalMatches to include the knockout round
    if (createdMatches.length > 0) {
      const currentTotal = Number(tournament.totalMatches) || 0;
      await tournament.update({ totalMatches: currentTotal + createdMatches.length }, { transaction });
    }

    console.log(`[transitionGroupsToKnockout] Created knockout bracket with ${createdMatches.length} matches`);

    // Mark all groups as completed
    for (const group of groups) {
      await group.update({ status: 'completed' }, { transaction });
    }

    console.log(`[transitionGroupsToKnockout] Successfully transitioned to knockout stage`);
  } catch (error) {
    console.error("[transitionGroupsToKnockout] Error:", error);
  }
};

/**
 * Helper: Generate next Swiss round matches based on standings
 */
exports._generateNextSwissRound = async (tournamentId, roundNumber, transaction = null) => {
  try {
    const { generateNextSwissRoundPairings } = require("../services/swiss/roundService");

    const tournament = await Tournament.findByPk(tournamentId, { transaction });
    const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction });
    const scoringRules = await TournamentScoringRules.findOne({ where: { tournamentId }, transaction });

    if (!tournament || !format) return;

    // Idempotency: if this round already has any matches, don't regenerate.
    const existingMatchesCount = await TournamentMatch.count({
      where: { tournamentId, roundNumber },
      transaction,
    });
    if (existingMatchesCount > 0) {
      console.log(
        `[generateNextSwissRound] Skip generation (matches already exist): tournament=${tournamentId} round=${roundNumber}`
      );
      // Ensure round record exists for UI coherence.
      const existingRound = await TournamentRound.findOne({
        where: { tournamentId, roundNumber, roundType: "swiss" },
        transaction,
      });
      if (!existingRound) {
        await TournamentRound.create({
          tournamentId,
          roundNumber,
          roundType: "swiss",
          name: `Round ${roundNumber}`,
          status: "not_started",
          totalMatches: 0,
        }, { transaction });
      }
      return;
    }

    // Swiss pairing only needs playerId + seed; avoid eager-loading Player to prevent alias issues.
    const participants = await TournamentParticipant.findAll({
      where: { tournamentId, status: "approved" },
      attributes: ["playerId", "seed"],
      transaction,
    });

    const allMatches = await TournamentMatch.findAll({
      where: {
        tournamentId,
        status: "completed",
      },
      transaction,
    });

    // Debug logs to validate points/standing input for Swiss pairing.
    try {
      const SwissPairingEngine = require("../services/SwissPairingEngine");
      const seedRows = participants.map((p) => ({ playerId: p.playerId, seed: p.seed ?? null }));
      const stateMap = SwissPairingEngine.buildSwissPlayerStateMap(seedRows, allMatches, scoringRules);
      const debugStanding = Array.from(stateMap.values())
        .sort((a, b) => (b.pointsEarned || 0) - (a.pointsEarned || 0))
        .slice(0, 10)
        .map((r) => ({ playerId: r.playerId, points: r.pointsEarned || 0, bye: r.hasBye || false }));
      console.log(
        `[generateNextSwissRound] Standings snapshot (top): tournament=${tournamentId} round=${roundNumber} `,
        debugStanding
      );
    } catch (debugErr) {
      console.warn("[generateNextSwissRound] Debug standings log failed:", debugErr?.message || debugErr);
    }

    const pairings = generateNextSwissRoundPairings({
      participants: participants.map((p) => ({ playerId: p.playerId, seed: p.seed })),
      completedMatches: allMatches,
      scoringRules,
    });

    // Separate actual matches from byes
    const actualPairings = pairings.filter(pair => pair.player2Id); // Real matches
    const byePairings = pairings.filter(pair => !pair.player2Id); // Byes (player2Id = null)

    // Determine bestOfFrames for this Swiss round
    let bestOfFrames = null;
    if (format.roundFormats && typeof format.roundFormats === "object") {
      const roundKey = String(roundNumber);
      bestOfFrames = format.roundFormats[roundKey] || format.roundFormats["default"] || null;
    }
    if (!bestOfFrames && scoringRules?.bestOfFrames) {
      bestOfFrames = scoringRules.bestOfFrames;
    }

    // Create actual matches
    const swissMatches = actualPairings.map(pair => ({
      tournamentId,
      roundNumber,
      roundType: "swiss",
      player1Id: pair.player1Id,
      player2Id: pair.player2Id,
      status: 'scheduled',
      winner: null,
      bestOfFrames,
    }));

    // Create bye matches (walkover wins)
    const byeMatches = byePairings.map(pair => ({
      tournamentId,
      roundNumber,
      roundType: "swiss",
      player1Id: pair.player1Id,
      player2Id: pair.player2Id, // null for bye
      status: 'completed',
      winner: 'player1',
      // Swiss BYE rows are identified by `player2Id: null` and always score +1.
      isWalkover: false,
      bestOfFrames,
    }));

    const allSwissMatches = [...swissMatches, ...byeMatches];

    if (allSwissMatches.length > 0) {
      await TournamentMatch.bulkCreate(allSwissMatches, { transaction });
    }

    // Upsert round record (count only real matches, not byes, for totalMatches)
    const existingRound = await TournamentRound.findOne({
      where: { tournamentId, roundNumber, roundType: "swiss" },
      transaction,
    });
    if (existingRound) {
      await existingRound.update(
        {
          name: `Round ${roundNumber}`,
          status: existingRound.status || "not_started",
          totalMatches: swissMatches.length,
        },
        { transaction }
      );
    } else {
      await TournamentRound.create(
        {
          tournamentId,
          roundNumber,
          roundType: "swiss",
          name: `Round ${roundNumber}`,
          status: "not_started",
          totalMatches: swissMatches.length,
        },
        { transaction }
      );
    }

    // Update tournament's totalMatches to include the new round (only count playable matches, not byes)
    if (tournament) {
      const currentTotal = Number(tournament.totalMatches) || 0;
      await tournament.update({ totalMatches: currentTotal + swissMatches.length }, { transaction });
    }

    console.log(`[generateNextSwissRound] Generated ${swissMatches.length} matches + ${byeMatches.length} bye(s) for round ${roundNumber}`);
  } catch (error) {
    console.error("[generateNextSwissRound] Error:", error);
    throw error;
  }
};

/**
 * Helper: Generate next round matches based on previous round winners
 */
exports._generateNextRound = async (tournamentId, roundNumber, transaction = null) => {
  try {
    const tournament = await Tournament.findByPk(tournamentId, {
      include: ["format", "scoringRules"],
      transaction
    });
    const previousRound = await TournamentRound.findOne({
      where: { tournamentId, roundNumber: roundNumber - 1 },
      transaction
    });

    if (!previousRound) return;

    // Get all winners from previous round
    const previousMatches = await TournamentMatch.findAll({
      where: { roundNumber: roundNumber - 1, tournamentId, status: "completed" },
      transaction
    });

    const winners = previousMatches.map(m => {
      if (m.winner === "player1") return m.player1Id;
      if (m.winner === "player2") return m.player2Id;
      return null;
    }).filter(id => id !== null);

    console.log(`[generateNextRound] Round ${roundNumber}: ${winners.length} winners advancing`);

    if (winners.length < 2) return; // Not enough for next round

    // Create next round
    const nextRound = await TournamentRound.create(
      {
        tournamentId,
        roundNumber,
        roundType: tournament.format?.type === "knockout" ? "knockout_" + (Math.pow(2, winners.length).toString()) : "round",
        name: `Round ${roundNumber}`,
        status: "not_started",
        totalMatches: Math.floor(winners.length / 2),
      },
      { transaction }
    );

    const baseScheduledDate = await resolveTournamentDefaultFixtureDate(tournament, transaction);
    const baseScheduledDeadline = new Date(baseScheduledDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Create matches for next round
    const nextMatches = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (winners[i + 1]) {
        nextMatches.push({
          tournamentId,
          roundId: nextRound.id,
          roundNumber,
          roundType: nextRound.roundType,
          player1Id: winners[i],
          player2Id: winners[i + 1],
          status: "scheduled",
          scheduledDate: baseScheduledDate,
          scheduledDeadline: baseScheduledDeadline,
        });
      }
    }

    if (nextMatches.length > 0) {
      await TournamentMatch.bulkCreate(nextMatches, { transaction });
      console.log(`[generateNextRound] Created ${nextMatches.length} matches for round ${roundNumber}`);
    }
  } catch (error) {
    console.error("[generateNextRound] Error:", error);
  }
};

/**
 * Helper: Award ranking points to tournament finishers
 */
exports._awardRankingPoints = async (tournamentId, transaction = null) => {
  try {
    const tournament = await Tournament.findByPk(tournamentId, { transaction });
    if (!tournament || !tournament.ranked) return;

    // Get tournament standings
    const matches = await TournamentMatch.findAll({
      where: { tournamentId, status: "completed" },
      transaction
    });

    const participants = await TournamentParticipant.findAll({
      where: { tournamentId, status: "approved" },
      transaction
    });

    // Calculate standings to determine final positions
    const standings = {};
    participants.forEach(p => {
      standings[p.playerId] = {
        playerId: p.playerId,
        wins: 0,
        framesWon: 0,
        framesLost: 0,
      };
    });

    matches.forEach(m => {
      if (standings[m.player1Id]) {
        standings[m.player1Id].framesWon += m.player1FramesWon || 0;
        standings[m.player1Id].framesLost += m.player2FramesWon || 0;
        if (m.winner === "player1") standings[m.player1Id].wins++;
      }
      if (standings[m.player2Id]) {
        standings[m.player2Id].framesWon += m.player2FramesWon || 0;
        standings[m.player2Id].framesLost += m.player1FramesWon || 0;
        if (m.winner === "player2") standings[m.player2Id].wins++;
      }
    });

    // Sort by wins, then by frame difference
    const sorted = Object.values(standings).sort((a, b) => {
      const winDiff = b.wins - a.wins;
      if (winDiff !== 0) return winDiff;
      return (b.framesWon - b.framesLost) - (a.framesWon - a.framesLost);
    });

    // Award ranking points
    // NOTE: Ranking points are now exclusively awarded by completeTournament() which correctly
    // derives finishingPosition from the bracket. This block is intentionally disabled to prevent
    // double-awarding. The RankingEngine.awardRankingPoints() also has a duplicate-award guard.
    // for (let i = 0; i < sorted.length; i++) { ... } — see completeTournament()

    console.log(`[_awardRankingPoints] Skipped – ranking points handled by completeTournament`);
  } catch (error) {
    console.error("[awardRankingPoints] Error:", error);
  }
};

/**
 * UI status for match-page contract (scheduled → pending).
 */
function matchPageStatusFromDb(dbStatus) {
  const s = String(dbStatus || "").toLowerCase();
  if (s === "scheduled" || s === "not_started") return "pending";
  return s || "pending";
}

/**
 * Builds `tournament` object for the org match page: groups → rounds → matches
 * (includes synthetic BYE/rest rows for odd-sized groups from TournamentRound metadata).
 */
async function buildGroupStageTournamentMatchPage({ tournament, formatRow, tGroups, matches, tournamentId }) {
  const knockoutStartRound = Number(formatRow.knockoutStartRound) || 999;
  const roundRows = await TournamentRound.findAll({
    where: { tournamentId, roundType: "group_stage" },
    order: [["roundNumber", "ASC"]],
  });
  const byeByRound = new Map();
  for (const row of roundRows) {
    const rn = Number(row.roundNumber);
    if (!Number.isFinite(rn) || rn < 1 || rn >= knockoutStartRound) continue;
    try {
      const desc = row.description ? JSON.parse(row.description) : {};
      const byePlayers = Array.isArray(desc.byePlayers) ? desc.byePlayers : [];
      byeByRound.set(rn, byePlayers);
    } catch {
      byeByRound.set(rn, []);
    }
  }

  const allPlayerIds = new Set();
  for (const tg of tGroups) {
    let pids = tg.playerIds;
    if (typeof pids === "string") {
      try {
        pids = JSON.parse(pids);
      } catch {
        pids = [];
      }
    }
    if (Array.isArray(pids)) pids.forEach((id) => id && allPlayerIds.add(String(id)));
  }
  const idList = [...allPlayerIds];
  const playersDb =
    idList.length > 0
      ? await Player.findAll({
          where: { id: { [Op.in]: idList } },
          attributes: ["id", "name"],
        })
      : [];
  const nameById = new Map(playersDb.map((p) => [String(p.id), p.name || "Player"]));

  const playable = matches.filter((m) => m.player2Id != null);

  const groups = tGroups.map((tg) => {
    const gn = Number(tg.groupNumber);
    let playerIds = tg.playerIds;
    if (typeof playerIds === "string") {
      try {
        playerIds = JSON.parse(playerIds);
      } catch {
        playerIds = [];
      }
    }
    if (!Array.isArray(playerIds)) playerIds = [];
    const n = playerIds.length;
    const maxRoundsForGroup = n < 2 ? 0 : n % 2 === 0 ? n - 1 : n;
    const players = playerIds.map((pid) => nameById.get(String(pid)) || "Player");
    const playerRefs = playerIds.map((pid) => ({
      playerId: pid,
      name: nameById.get(String(pid)) || "Player",
    }));

    const roundNums =
      maxRoundsForGroup > 0
        ? Array.from({ length: maxRoundsForGroup }, (_, i) => i + 1)
        : [];

    const rounds = roundNums.map((rn) => {
      const rowMatches = playable
        .filter((m) => Number(m.groupNumber) === gn && Number(m.roundNumber) === rn)
        .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));

      const byePlayers = byeByRound.get(rn) || [];
      const restEntry = byePlayers.find((bp) => bp && bp.playerId && playerIds.includes(bp.playerId));

      const matchesOut = [];

      if (restEntry && n % 2 === 1) {
        const rid = restEntry.playerId;
        const rname =
          nameById.get(String(rid)) || restEntry.playerName || restEntry.name || "Player";
        matchesOut.push({
          matchId: null,
          player1Id: rid,
          player2Id: null,
          p1: rname,
          p2: "BYE",
          isRest: true,
          // Normalize to the same status used by knockout BYE rows so the UI can filter/render consistently.
          status: "bye",
          isBye: true,
          isBookable: false,
          isPlayable: false,
        });
      }

      for (const m of rowMatches) {
        const plain = typeof m.get === "function" ? m.get({ plain: true }) : m;
        const p1n =
          m.player1?.name || nameById.get(String(m.player1Id)) || "Player 1";
        const p2n =
          m.player2?.name || nameById.get(String(m.player2Id)) || "Player 2";
        matchesOut.push({
          matchId: m.id,
          player1Id: m.player1Id,
          player2Id: m.player2Id,
          p1: p1n,
          p2: p2n,
          isRest: false,
          status: matchPageStatusFromDb(m.status),
          match: plain,
        });
      }

      return { roundNumber: rn, matches: matchesOut };
    });

    return {
      groupId: String.fromCharCode(64 + gn),
      groupNumber: gn,
      groupName: tg.groupName || `Group ${String.fromCharCode(64 + gn)}`,
      currentRound: Number(tg.currentRound || 1),
      maxRounds: maxRoundsForGroup,
      status: tg.status,
      players,
      playerRefs,
      rounds,
    };
  });

  return {
    id: tournament.id,
    name: tournament.name,
    formatType: "groups_knockout",
    knockoutStartRound,
    groups,
  };
}

/**
 * Get tournament matches
 */
exports.getTournamentMatches = async (req, res) => {
  try {
    // Prevent stale match states after confirm (avoid 304 Not Modified caching)
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.removeHeader?.("ETag");
    res.removeHeader?.("Last-Modified");

    const { tournamentId } = req.params;
    const { roundNumber, status, includeByes } = req.query;

    console.log(`[getTournamentMatches] request for tournamentId=${tournamentId}, roundNumber=${roundNumber}, status=${status}`);

    if (!tournamentId) {
      return res.status(400).json({ success: false, error: 'Missing tournamentId' });
    }

    // Quick sanity checks to improve diagnosability
    if (!TournamentMatch || typeof TournamentMatch.findAll !== 'function') {
      console.error('[getTournamentMatches] TournamentMatch model is not available or invalid:', TournamentMatch);
      return res.status(500).json({ success: false, error: 'Match model not available' });
    }

    // Verify tournament exists to give better errors
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      console.warn(`[getTournamentMatches] Tournament not found: ${tournamentId}`);
      return res.status(404).json({ success: false, error: 'Tournament not found' });
    }

    // ── INLINE AUTO-FORFEIT ────────────────────────────────────────────────
    // If the tournament has autoForfeitOverdue enabled, check and forfeit overdue matches
    // before returning the list. This avoids needing an external cron job.
    const schedulingConfig = TournamentSchedulingService.getSchedulingConfigFromTournament(tournament);
    if (schedulingConfig.autoForfeit && schedulingConfig.enforceDeadlines) {
      try {
        const result = await TournamentSchedulingService.applyAutoForfeitForTournament(
          tournamentId
        );
        if (result.updated > 0) {
          console.log(
            `[getTournamentMatches] Auto-forfeited ${result.updated} overdue matches for tournament ${tournamentId}`
          );
        }
      } catch (forfeitErr) {
        // Non-fatal: log and continue returning matches
        console.warn('[getTournamentMatches] Auto-forfeit check failed:', forfeitErr?.message);
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    const where = { tournamentId };
    if (roundNumber) where.roundNumber = Number(roundNumber);
    if (status) where.status = status;
    if (String(includeByes).toLowerCase() !== "true") {
      where.player2Id = { [Op.ne]: null };
    }

    // Introspect table columns to avoid selecting non-existent fields (robust against missing migrations)
    let attributesOption;
    try {
      const cols = await sequelize.query("SHOW COLUMNS FROM tournament_matches", { type: QueryTypes.SELECT });
      const dbColumns = cols.map((c) => c.Field);
      const modelAttrs = Object.keys(TournamentMatch.rawAttributes || {});
      const allowedAttrs = modelAttrs.filter((name) => {
        const attr = TournamentMatch.rawAttributes[name] || {};
        const dbField = attr.field || name;
        return dbColumns.includes(dbField);
      });
      if (allowedAttrs.length > 0) {
        attributesOption = allowedAttrs;
      }
      console.log(`[getTournamentMatches] table columns: ${dbColumns.join(', ')}`);
      console.log(`[getTournamentMatches] allowing attributes: ${attributesOption ? attributesOption.join(', ') : 'none'}`);
    } catch (err) {
      console.warn('[getTournamentMatches] Could not inspect tournament_matches columns, will exclude known optional fields');
      console.warn(err && err.message ? err.message : err);
    }

    // Fallback: exclude confirmation/admin fields that may not exist in older DBs
    if (!attributesOption) {
      attributesOption = {
        exclude: [
          'player1Confirmed',
          'player2Confirmed',
          'player1ConfirmedDate',
          'player2ConfirmedDate',
          'adminSubmitted',
          'submittedBy',
        ],
      };
    }

    const rawMatches = await TournamentMatch.findAll({
      where,
      attributes: attributesOption,
      include: [
        { association: "player1", attributes: ["id", "name"] },
        { association: "player2", attributes: ["id", "name"] },
      ],
      order: [["roundNumber", "ASC"], ["matchNumber", "ASC"]],
    });

    const formatRow = await TournamentFormat.findOne({ where: { tournamentId } });
    const formatTypeForBye = formatRow?.type || null;

    const fallbackFixtureDate = await resolveTournamentDefaultFixtureDate(tournament);
    let matchRows = rawMatches.map((m) => {
      const row = m.get({ plain: true });
      if (!row.scheduledDate) {
        row.scheduledDate = fallbackFixtureDate;
      }
      return row;
    });
    const includeByesBool = String(includeByes).toLowerCase() === "true";

    if (includeByesBool) {
      matchRows = matchRows.map((m) => attachByeFlagsToMatchPlain(m, formatTypeForBye));
      const synthetic = await buildSyntheticKnockoutByeRowsFromRounds({
        tournamentId,
        formatType: formatTypeForBye,
        existingMatchRows: matchRows,
      });
      matchRows = [...matchRows, ...synthetic];

      // Round-robin odd-field rests are stored only in TournamentRound metadata.
      if (formatRow && formatRow.type === "round_robin") {
        const rrSynthetic = await buildSyntheticRoundRobinRestRowsFromRounds({
          tournamentId,
          existingMatchRows: matchRows,
        });
        matchRows = [...matchRows, ...rrSynthetic];
      }

      matchRows.sort((a, b) => {
        const ra = Number(a.roundNumber) || 0;
        const rb = Number(b.roundNumber) || 0;
        if (ra !== rb) return ra - rb;
        return (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0);
      });
    }

    const now = new Date();
    const tournamentDeadline = resolveTournamentDeadline(tournament);
    let matches = matchRows.map((m) => {
      const deadline = tournamentDeadline || (m.scheduledDeadline ? new Date(m.scheduledDeadline) : null);
      const isForfeit = Boolean(m.isDefault);
      const derivedStatus = isForfeit ? "forfeit" : m.isScheduled ? "scheduled" : "pending";
      const canBook = Boolean(
        schedulingConfig.flexibleScheduling &&
          !isForfeit &&
          (!schedulingConfig.enforceDeadlines || !deadline || now <= deadline)
      );

      return {
        ...m,
        scheduledDate: m.scheduledDate || fallbackFixtureDate,
        schedulingConfig,
        derivedStatus,
        bookingTime: m.scheduledDate || null,
        deadline: deadline || null,
        canBook,
      };
    });
    matches = await attachBookingDatesToMatches(matches);

    let groupStageView = null;
    let tournamentMatchPage = null;
    if (formatRow && formatRow.type === "groups_knockout") {
      const tGroups = await TournamentGroup.findAll({
        where: { tournamentId },
        order: [["groupNumber", "ASC"]],
      });
      const knockoutStartRound = Number(formatRow.knockoutStartRound) || 999;
      const playable = matches.filter((m) => m.player2Id != null);
      groupStageView = {
        knockoutStartRound,
        groups: tGroups.map((tg) => {
          const gn = Number(tg.groupNumber);
          let playerIds = tg.playerIds;
          if (typeof playerIds === "string") {
            try {
              playerIds = JSON.parse(playerIds);
            } catch {
              playerIds = [];
            }
          }
          if (!Array.isArray(playerIds)) playerIds = [];
          const n = playerIds.length;
          const maxRoundsForGroup = n < 2 ? 0 : n % 2 === 0 ? n - 1 : n;

          const myMatches = playable.filter(
            (m) => Number(m.groupNumber) === gn && m.roundType === "group_stage"
          );
          const roundNums = [
            ...new Set(myMatches.map((m) => Number(m.roundNumber)).filter((x) => Number.isFinite(x) && x > 0)),
          ].sort((a, b) => a - b);

          const rounds = roundNums.map((rn) => ({
            roundNumber: rn,
            matches: myMatches
              .filter((m) => Number(m.roundNumber) === rn)
              .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0)),
          }));

          return {
            groupId: String.fromCharCode(64 + gn),
            groupNumber: gn,
            groupName: tg.groupName || `Group ${String.fromCharCode(64 + gn)}`,
            currentRound: Number(tg.currentRound || 1),
            status: tg.status,
            maxRounds: maxRoundsForGroup,
            rounds,
          };
        }),
      };

      const hasKnockoutFixtures = matches.some(
        (m) => m.groupNumber == null && String(m.roundType || "") !== "group_stage"
      );
      if (!hasKnockoutFixtures && tGroups.length > 0) {
        tournamentMatchPage = await buildGroupStageTournamentMatchPage({
          tournament,
          formatRow,
          tGroups,
          matches,
          tournamentId,
        });
      }
    }

    console.log(`[getTournamentMatches] returning ${matches.length} matches for tournament ${tournamentId}`);
    res.json({
      success: true,
      data: matches,
      groupStageView,
      tournament: tournamentMatchPage,
    });
  } catch (error) {
    console.error("getTournamentMatches error:", error && error.stack ? error.stack : error);
    res.status(500).json({ success: false, error: "Internal server error", details: error?.message });
  }
};

/**
 * POST /api/tournaments/:tournamentId/late-entry
 * Body:
 * {
 *   players: [],
 *   strategy: "regenerate | qualifier | waitlist | fill_bye",
 *   reseedType?: "random | lower_priority",
 *   reseedStrategy?: "random | lower_priority",
 *   preview?: boolean
 * }
 */
exports.addLatePlayersWithStrategy = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { players, strategy, reseedType, reseedStrategy, preview = false } = req.body || {};
    const resolvedReseedType = reseedType ?? reseedStrategy;

    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ success: false, error: "players array is required" });
    }
    if (!strategy) {
      return res.status(400).json({ success: false, error: "strategy is required" });
    }

    const result = await FixtureRegenerationService.addLatePlayersWithStrategy({
      tournamentId,
      playerIds: players,
      strategy,
      reseedType: resolvedReseedType,
      userId,
      preview: Boolean(preview),
    });

    if (preview) {
      return res.json({
        success: true,
        data: {
          action: result.action,
          impact: result.impact,
          lateEntry: {
            reseedType: resolvedReseedType ?? null,
            strategy,
          },
        },
      });
    }

    // Return updated fixtures (matches) so the UI can refresh instantly.
    const getTournamentMatchesInternal = async () =>
      new Promise((resolve, reject) => {
        const fakeReq = {
          params: { tournamentId },
          query: { includeByes: "true" },
        };
        const fakeRes = {
          set: () => {},
          removeHeader: () => {},
          status: () => fakeRes,
          json: (payload) => resolve(payload),
        };
        exports.getTournamentMatches(fakeReq, fakeRes).catch(reject);
      });

    const updatedMatchesPayload = await getTournamentMatchesInternal();

    return res.json({
      success: true,
      data: {
        action: result.action,
        details: result.details,
        fixtures: updatedMatchesPayload?.data || [],
        groupStageView: updatedMatchesPayload?.groupStageView || null,
        tournament: updatedMatchesPayload?.tournament || null,
        impact: result.impact || null,
        lateEntry: {
          reseedType: resolvedReseedType ?? null,
          strategy,
        },
      },
    });
  } catch (error) {
    console.error("addLatePlayersWithStrategy error:", error);
    return res.status(400).json({
      success: false,
      error: error?.message || "Internal server error",
    });
  }
};

// ============================================================================
// STANDINGS & RANKINGS
// ============================================================================

/**
 * Get tournament standings
 */
exports.getTournamentStandings = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId, {
      include: [
        {
          association: "participants",
          include: [
            {
              association: "player",
              include: [{ association: "user" }],
            },
          ],
        },
        { association: "scoringRules" },
        { association: "format", attributes: ["id", "tournamentId", "type", "bestOfFrames", "playAllFrames", "seeding", "rankingSource", "manualSeedOrder", "roundFormats", "byesHandling", "preliminaryRoundSize", "groupCount", "playersPerGroup", "qualifiersPerGroup", "knockoutStartRound", "maxRounds"] },
      ],
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const excludedFromStandings = new Set(["withdrawn", "rejected", "disqualified"]);
    const rosterParticipants = (tournament.participants || []).filter(
      (p) => p && !excludedFromStandings.has(p.status)
    );

    const matches = await TournamentMatch.findAll({
      where: {
        tournamentId,
        status: "completed"
        // Voided matches have status="voided" so they are automatically excluded
      },
    });

    console.log('[getTournamentStandings] Data loaded:', {
      tournamentId,
      participantCount: rosterParticipants.length,
      completedMatchCount: matches.length,
      hasScoringRules: !!tournament.scoringRules,
      scoringRules: tournament.scoringRules ? {
        pointsWin: tournament.scoringRules.pointsWin,
        pointsLoss: tournament.scoringRules.pointsLoss,
        pointsDraw: tournament.scoringRules.pointsDraw,
        pointsWalkover: tournament.scoringRules.pointsWalkover,
        bonusRules: tournament.scoringRules.bonusRules
      } : 'MISSING'
    });

    const standings = ScoringEngine.calculateStandings(
      rosterParticipants,
      matches,
      tournament.scoringRules,
      {
        formatType: tournament.format?.type,
        sport: tournament.sport
      }
    );

    let standingsArray = Object.values(standings);
    let sortedStandings;

    if (tournament.format?.type === "swiss") {
      const SwissPairingEngine = require("../services/SwissPairingEngine");
      const TiebreakerEngine = require("../engines/TiebreakerEngine");
      const sm = SwissPairingEngine.buildSwissPlayerStateMap(
        rosterParticipants
          .filter((p) => p.status === "approved")
          .map((p) => ({ playerId: p.playerId, seed: p.seed })),
        matches,
        tournament.scoringRules
      );
      const enriched = standingsArray.map((s) => {
        const row = sm.get(s.playerId);
        return {
          ...s,
          buchholz: row?.buchholz ?? 0,
          sonnebornBerger: row?.sonnebornBerger ?? 0,
          hasReceivedBye: row?.hasBye ?? false,
          opponentsPlayed: row?.opponentsPlayed ?? [],
        };
      });
      const ranked = TiebreakerEngine.rankPlayersByTiebreaker(
        enriched.map((s) => ({
          playerId: s.playerId,
          points: s.points,
          buchholz: s.buchholz,
          sonnebornBerger: s.sonnebornBerger,
          framesWon: s.framesWon || 0,
          framesLost: s.framesLost || 0,
          pointsFor: 0,
          pointsAgainst: 0,
          highestBreak: s.highestBreak ?? 0,
        })),
        ["points", "buchholz", "sonneborn_berger", "head_to_head", "frame_difference", "frames_won", "random"],
        matches.filter((m) => m.player1Id && m.player2Id)
      );
      const byId = new Map(enriched.map((e) => [e.playerId, e]));
      sortedStandings = ranked
        .map((r) => (r.playerId ? { ...byId.get(r.playerId) } : null))
        .filter(Boolean);
      sortedStandings = [...new Map(sortedStandings.map((row) => [row.playerId, row])).values()];
    } else {
      sortedStandings = ScoringEngine.applyTiebreakers(
        standingsArray,
        tournament.scoringRules?.tieBreakPriority,
        matches
      );
    }

    const participantMap = {};
    rosterParticipants.forEach((p) => {
      if (p.playerId) participantMap[p.playerId] = p.player;
    });

    // Add participant status mapping
    const participantStatusMap = {};
    tournament.participants.forEach((p) => {
      if (p.playerId) participantStatusMap[p.playerId] = p.status;
    });

    sortedStandings.forEach((entry, index) => {
      entry.position = index + 1;
      if (participantMap[entry.playerId]) {
        const player = participantMap[entry.playerId];
        entry.playerName = player.name;
        entry.playerNickname = player.nickname;
        entry.playerEmail = player.user?.email || null;
        entry.playerAvatarUrl = player.avatarUrl;
      }
      // Add participant status
      entry.status = participantStatusMap[entry.playerId] || "approved";
    });

    // Get standings display configuration (default to sport-based config if not set)
    const standingsDisplay = normalizeStandingsDisplayConfig(
      tournament.standingsDisplay,
      tournament.sport
    );

    console.log('[getTournamentStandings] Response standings:', sortedStandings.map(s => ({
      position: s.position,
      playerName: s.playerName,
      playerNickname: s.playerNickname,
      matchesPlayed: s.matchesPlayed,
      matchesWon: s.matchesWon,
      points: s.points,
      framesWon: s.framesWon,
      framesLost: s.framesLost,
      frameDifference: s.frameDifference
    })));

    res.json({
      success: true,
      data: sortedStandings,
      standingsDisplay,
    });
  } catch (error) {
    console.error("getTournamentStandings error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get tournament groups (for group-based formats like groups_knockout)
 */
exports.getTournamentGroups = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const { TournamentGroup } = require("../models");

    // Get all groups for this tournament
    const groups = await TournamentGroup.findAll({
      where: { tournamentId },
      order: [["groupNumber", "ASC"]],
    });

    // Handle case where no groups exist
    if (!groups || groups.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    // For each group, fetch the player details
    const groupsWithPlayers = await Promise.all(
      groups.map(async (group) => {
        // Parse playerIds if it's a string
        let playerIds = group.playerIds || [];
        if (typeof playerIds === 'string') {
          try {
            playerIds = JSON.parse(playerIds);
          } catch (e) {
            playerIds = [];
          }
        }

        let players = [];

        if (Array.isArray(playerIds) && playerIds.length > 0) {
          players = await Player.findAll({
            where: { id: { [Op.in]: playerIds } },
            attributes: ["id", "name", "avatarUrl"],
          });
        }

        return {
          id: group.id,
          tournamentId: group.tournamentId,
          groupNumber: group.groupNumber,
          groupName: group.groupName || `Group ${String.fromCharCode(64 + group.groupNumber)}`,
          playerIds: playerIds,
          players: players,
          qualifiedPlayerIds: group.qualifiedPlayerIds || [],
          totalPlayers: group.totalPlayers,
          totalQualified: group.totalQualified,
          status: group.status,
        };
      })
    );

    res.json({
      success: true,
      data: groupsWithPlayers,
      count: groupsWithPlayers.length,
    });
  } catch (error) {
    console.error("getTournamentGroups error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get standings for a specific group
 */
exports.getGroupStandings = async (req, res) => {
  try {
    const { tournamentId, groupNumber } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const { TournamentGroup } = require("../models");
    const TiebreakerEngine = require("../engines/TiebreakerEngine");

    // Get the group
    const group = await TournamentGroup.findOne({
      where: { tournamentId, groupNumber: parseInt(groupNumber) },
    });

    if (!group) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }

    // Get all matches for this group
    const groupMatches = await TournamentMatch.findAll({
      where: {
        tournamentId,
        groupNumber: parseInt(groupNumber),
        status: "completed",
        player2Id: { [Op.ne]: null }, // Exclude byes
      },
    });

    // Get scoring rules
    const scoringRules = await TournamentScoringRules.findOne({ where: { tournamentId } });

    // Parse playerIds if it's a string
    let playerIds = group.playerIds || [];
    if (typeof playerIds === 'string') {
      try {
        playerIds = JSON.parse(playerIds);
      } catch (e) {
        playerIds = [];
      }
    }

    // Calculate standings using TiebreakerEngine
    const rawStandings = TiebreakerEngine.calculateGroupStandings(
      playerIds,
      groupMatches,
      scoringRules
    );

    // Transform standings to match controller expectations
    const standings = rawStandings.map((s, idx) => ({
      position: idx + 1,
      playerId: s.playerId,
      pointsEarned: s.points || 0,
      matchesPlayed: s.matchesPlayed || 0,
      matchesWon: s.wins || 0,
      matchesLost: s.losses || 0,
      framesWon: s.framesWon || 0,
      framesLost: s.framesLost || 0,
      frameDifference: (s.framesWon || 0) - (s.framesLost || 0),
      buchholzScore: 0,
      qualified: group.qualifiedPlayerIds?.includes(s.playerId) || false,
    }));

    // Fetch player details for each standing
    const standingsWithPlayers = await Promise.all(
      standings.map(async (standing) => {
        const player = await Player.findByPk(standing.playerId, {
          attributes: ["id", "name", "avatarUrl"],
          include: [{ association: "user", attributes: ["email"] }],
        });

        return {
          position: standing.position,
          playerId: standing.playerId,
          playerName: player?.name || "Unknown",
          playerAvatarUrl: player?.avatarUrl,
          playerEmail: player?.user?.email,
          pointsEarned: standing.pointsEarned,
          matchesPlayed: standing.matchesPlayed,
          matchesWon: standing.matchesWon,
          matchesLost: standing.matchesLost,
          framesWon: standing.framesWon,
          framesLost: standing.framesLost,
          frameDifference: standing.frameDifference,
          buchholzScore: standing.buchholzScore,
          qualified: standing.qualified,
        };
      })
    );

    res.json({
      success: true,
      data: {
        groupNumber: group.groupNumber,
        groupName: group.groupName || `Group ${String.fromCharCode(64 + group.groupNumber)}`,
        standings: standingsWithPlayers,
        qualifiedCount: group.totalQualified || 2,
        status: group.status,
      },
    });
  } catch (error) {
    console.error("getGroupStandings error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get all qualified players from all groups (for knockout seeding visualization)
 */
exports.getTournamentQualifiers = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const { TournamentGroup } = require("../models");
    const TiebreakerEngine = require("../engines/TiebreakerEngine");

    // Get all groups
    const groups = await TournamentGroup.findAll({
      where: { tournamentId },
      order: [["groupNumber", "ASC"]],
    });

    // Handle case where no groups exist
    if (!groups || groups.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        groupCount: 0,
      });
    }

    // Get scoring rules once for all groups
    const scoringRules = await TournamentScoringRules.findOne({ where: { tournamentId } });

    // Collect all qualified players across all groups
    const qualifiersMap = new Map(); // playerId -> { playerId, groupNumber, position, ... }

    for (const group of groups) {
      const qualifiedIds = group.qualifiedPlayerIds || [];

      if (qualifiedIds.length === 0) continue; // Skip groups with no qualifiers

      // Get standings to find position/rank of each qualified player
      const groupMatches = await TournamentMatch.findAll({
        where: {
          tournamentId,
          groupNumber: group.groupNumber,
          status: "completed",
          player2Id: { [Op.ne]: null },
        },
      });

      // Parse playerIds if it's a string
      let playerIds = group.playerIds || [];
      if (typeof playerIds === 'string') {
        try {
          playerIds = JSON.parse(playerIds);
        } catch (e) {
          playerIds = [];
        }
      }

      // Calculate standings using TiebreakerEngine
      const rawStandings = TiebreakerEngine.calculateGroupStandings(playerIds, groupMatches, scoringRules);

      // Add each qualified player to the map with proper position
      for (let idx = 0; idx < rawStandings.length; idx++) {
        const standing = rawStandings[idx];
        if (qualifiedIds.includes(standing.playerId) && !qualifiersMap.has(standing.playerId)) {
          qualifiersMap.set(standing.playerId, {
            playerId: standing.playerId,
            groupNumber: group.groupNumber,
            groupName: group.groupName || `Group ${String.fromCharCode(64 + group.groupNumber)}`,
            position: idx + 1,
            pointsEarned: standing.points || 0,
            framesWon: standing.framesWon || 0,
            framesLost: standing.framesLost || 0,
            frameDifference: (standing.framesWon || 0) - (standing.framesLost || 0),
          });
        }
      }
    }

    // Fetch player details
    const qualifiers = await Promise.all(
      Array.from(qualifiersMap.values()).map(async (qualifier) => {
        const player = await Player.findByPk(qualifier.playerId, {
          attributes: ["id", "name", "avatarUrl"],
        });

        return {
          ...qualifier,
          playerName: player?.name || "Unknown",
          playerAvatarUrl: player?.avatarUrl,
        };
      })
    );

    // Sort by group number, then by position within group
    qualifiers.sort((a, b) => {
      // Keep this ordering aligned with knockout seeded BYE logic:
      // 1) group position (1st across all groups first)
      // 2) pointsEarned (higher better)
      // 3) frameDifference (higher better)
      // 4) framesWon (higher better)
      // 3) groupNumber (deterministic)
      // 4) playerId (deterministic)
      if (a.position !== b.position) return a.position - b.position;
      const ptsDiff = (b.pointsEarned || 0) - (a.pointsEarned || 0);
      if (ptsDiff !== 0) return ptsDiff;
      const fdDiff = (b.frameDifference || 0) - (a.frameDifference || 0);
      if (fdDiff !== 0) return fdDiff;
      const fwDiff = (b.framesWon || 0) - (a.framesWon || 0);
      if (fwDiff !== 0) return fwDiff;
      if (a.groupNumber !== b.groupNumber) return a.groupNumber - b.groupNumber;
      return String(a.playerId).localeCompare(String(b.playerId));
    });

    res.json({
      success: true,
      data: qualifiers,
      count: qualifiers.length,
      groupCount: groups.length,
    });
  } catch (error) {
    console.error("getTournamentQualifiers error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// ADMIN OVERRIDES
// ============================================================================

/**
 * Admin override match result
 */
exports.overrideMatchResult = async (req, res) => {
  try {
    const { userId } = req.user;
    const { matchId } = req.params;
    const { winner, player1FramesWon, player2FramesWon, reason } = req.body;

    // Verify user is admin (simplified - full implementation would check role)
    const user = await User.findByPk(userId);
    if (user.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "Admin only" });
    }

    const match = await TournamentMatch.findByPk(matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    if (match.player2Id == null) {
      return res.status(400).json({ success: false, error: "Cannot override a BYE match" });
    }

    // Store old values
    const oldWinner = match.winner;
    const oldFrames = {
      player1: match.player1FramesWon,
      player2: match.player2FramesWon,
    };

    // Update match
    await match.update({
      winner,
      player1FramesWon,
      player2FramesWon,
      adminOverride: true,
      overriddenBy: userId,
      overrideReason: reason,
      overrideDate: new Date(),
    });

    // Log override
    await AuditLog.create({
      action: "match_result_overridden",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
      oldValue: { winner: oldWinner, frames: oldFrames },
      newValue: { winner, frames: { player1: player1FramesWon, player2: player2FramesWon } },
      notes: reason,
    });

    // Refresh match data and update statistics/progression
    const updatedMatch = await TournamentMatch.findByPk(matchId);
    const tournament = await Tournament.findByPk(updatedMatch.tournamentId);
    if (tournament) {
      // Update participant stats (standings)
      const sport = tournament.sport || "snooker";
      await exports._updateTournamentParticipantStats(updatedMatch, updatedMatch.tournamentId, sport, null);
      // Check if round can progress (for knockout draws that were just resolved)
      await exports._checkAndProgressRound(updatedMatch.tournamentId, updatedMatch.roundNumber, null);
    }

    res.json({
      success: true,
      data: updatedMatch,
      message: "Match result overridden",
    });
  } catch (error) {
    console.error("overrideMatchResult error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Reschedule match
 */
exports.rescheduleMatch = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId, matchId } = req.params;
    const { scheduledDate, scheduledDeadline, rescheduleReason, updateTournamentDeadline } = req.body;

    // Verify tournament exists and user is organization owner
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Verify user is tournament owner/org admin
    const userOrganization = await Organization.findOne({ where: { userId } });
    if (!userOrganization || userOrganization.id !== tournament.organizationId) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    // Find match
    const match = await TournamentMatch.findByPk(matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    if (match.tournamentId !== tournamentId) {
      return res.status(400).json({ success: false, error: "Match does not belong to this tournament" });
    }

    // Can't reschedule completed matches
    if (match.status === 'completed') {
      return res.status(400).json({ success: false, error: "Cannot reschedule completed matches" });
    }

    // Store old values for audit
    const oldScheduledDate = match.scheduledDate;
    const oldDeadline = match.scheduledDeadline;

    // Update match schedule
    await match.update({
      scheduledDate: scheduledDate ? new Date(scheduledDate) : match.scheduledDate,
      scheduledDeadline: scheduledDeadline ? new Date(scheduledDeadline) : match.scheduledDeadline,
    });

    // If organizer opts in, synchronize tournament-wide deadline and open match deadlines.
    if (scheduledDeadline && updateTournamentDeadline === true) {
      tournament.matchDeadlineDate = new Date(scheduledDeadline);
      await tournament.save();

      await TournamentMatch.update(
        { scheduledDeadline: new Date(scheduledDeadline) },
        {
          where: {
            tournamentId,
            status: { [Op.notIn]: ["completed"] },
          },
        }
      );
    }

    // Log reschedule action
    await AuditLog.create({
      action: "match_rescheduled",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
      oldValue: { scheduledDate: oldScheduledDate, scheduledDeadline: oldDeadline },
      newValue: { scheduledDate: match.scheduledDate, scheduledDeadline: match.scheduledDeadline },
      notes: rescheduleReason,
    });

    // Notify players of reschedule
    // TODO: Implement notification service to notify both players

    res.json({
      success: true,
      data: match,
      message: "Match rescheduled successfully",
    });
  } catch (error) {
    console.error("rescheduleMatch error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + (error.message || error) });
  }
};

/**
 * Player requests a match deadline change when slots are unavailable.
 */
exports.requestDeadlineChange = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId, matchId } = req.params;
    const { requestedDeadline, reason, contextDate, suggestedFromVenueSlots } = req.body || {};

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const match = await TournamentMatch.findByPk(matchId);
    if (!match || String(match.tournamentId) !== String(tournamentId)) {
      return res.status(404).json({ success: false, error: "Match not found for this tournament" });
    }
    if (match.status === "completed") {
      return res.status(400).json({ success: false, error: "Cannot request deadline change for completed match" });
    }

    const players = await Player.findAll({ where: { userId }, attributes: ["id"] });
    const playerIds = players.map((p) => p.id);
    const isParticipant = playerIds.includes(match.player1Id) || playerIds.includes(match.player2Id);
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: "Only participating players can request deadline changes" });
    }

    const parsedRequestedDeadline = parseValidDateOrNull(requestedDeadline);
    if (!parsedRequestedDeadline) {
      return res.status(400).json({ success: false, error: "A valid requested deadline is required" });
    }

    await AuditLog.create({
      action: "match_deadline_change_requested",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
      oldValue: {
        currentTournamentDeadline: resolveTournamentDeadline(tournament),
        currentMatchDeadline: parseValidDateOrNull(match.scheduledDeadline),
      },
      newValue: {
        requestedDeadline: parsedRequestedDeadline,
        contextDate: contextDate || null,
        suggestedFromVenueSlots: Boolean(suggestedFromVenueSlots),
      },
      notes: reason || "No reason provided",
    });

    return res.json({
      success: true,
      message: "Deadline change request sent to organizer",
      data: {
        requestedDeadline: parsedRequestedDeadline,
      },
    });
  } catch (error) {
    console.error("requestDeadlineChange error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Organization: list all player deadline-change requests for tournament.
 */
exports.getDeadlineChangeRequests = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const userOrganization = await Organization.findOne({ where: { userId } });
    if (!userOrganization || userOrganization.id !== tournament.organizationId) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const matchRows = await TournamentMatch.findAll({
      where: { tournamentId },
      attributes: ["id", "roundNumber", "matchNumber", "player1Id", "player2Id"],
      include: [
        { model: Player, as: "player1", attributes: ["id", "name", "nickname"] },
        { model: Player, as: "player2", attributes: ["id", "name", "nickname"] },
      ],
    });

    const matchesById = new Map(matchRows.map((m) => [String(m.id), m]));
    const matchIds = matchRows.map((m) => m.id);
    if (matchIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const requests = await AuditLog.findAll({
      where: {
        action: "match_deadline_change_requested",
        entityType: "tournament_match",
        entityId: { [Op.in]: matchIds },
      },
      order: [["createdAt", "DESC"]],
    });

    const applied = await AuditLog.findAll({
      where: {
        action: "match_deadline_change_applied",
        entityType: "tournament_match",
        entityId: { [Op.in]: matchIds },
      },
      attributes: ["newValue"],
    });
    const parseAuditValue = (value) => {
      if (!value) return {};
      if (typeof value === "object") return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch (_) {
          return {};
        }
      }
      return {};
    };

    const appliedRequestIds = new Set(
      applied
        .map((a) => parseAuditValue(a?.newValue)?.requestId)
        .filter(Boolean)
        .map((id) => String(id))
    );
    const appliedDeadlineByRequestId = new Map(
      applied
        .map((a) => parseAuditValue(a?.newValue))
        .filter((v) => v?.requestId)
        .map((v) => [String(v.requestId), v.appliedDeadline || null])
    );

    const data = requests.map((r) => {
      const requestId = String(r.id);
      const reqValue = parseAuditValue(r.newValue);
      const match = matchesById.get(String(r.entityId));
      return {
        id: requestId,
        tournamentId,
        matchId: r.entityId,
        roundNumber: match?.roundNumber ?? null,
        matchNumber: match?.matchNumber ?? null,
        player1Name: match?.player1?.nickname || match?.player1?.name || "Player 1",
        player2Name: match?.player2?.nickname || match?.player2?.name || "Player 2",
        requestedDeadline: reqValue.requestedDeadline || null,
        suggestedFromVenueSlots: Boolean(reqValue.suggestedFromVenueSlots),
        contextDate: reqValue.contextDate || null,
        reason: r.notes || "",
        createdAt: r.createdAt,
        status: appliedRequestIds.has(requestId) ? "applied" : "pending",
        appliedDeadline: appliedDeadlineByRequestId.get(requestId) || null,
      };
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error("getDeadlineChangeRequests error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Organization: apply deadline change request (updates tournament match deadline date).
 */
exports.applyDeadlineChangeRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId, requestId } = req.params;
    const { deadlineDate } = req.body || {};

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const userOrganization = await Organization.findOne({ where: { userId } });
    if (!userOrganization || userOrganization.id !== tournament.organizationId) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const requestLog = await AuditLog.findByPk(requestId);
    if (!requestLog || requestLog.action !== "match_deadline_change_requested") {
      return res.status(404).json({ success: false, error: "Deadline request not found" });
    }

    const match = await TournamentMatch.findByPk(requestLog.entityId);
    if (!match || String(match.tournamentId) !== String(tournamentId)) {
      return res.status(400).json({ success: false, error: "Request does not belong to this tournament" });
    }

    const requestValue =
      typeof requestLog?.newValue === "string"
        ? (() => {
            try {
              return JSON.parse(requestLog.newValue);
            } catch (_) {
              return {};
            }
          })()
        : (requestLog?.newValue || {});
    const requested = parseValidDateOrNull(requestValue?.requestedDeadline);
    const explicit = parseValidDateOrNull(deadlineDate);
    const effective = explicit || requested;
    if (!effective) {
      return res.status(400).json({ success: false, error: "Valid deadline date is required" });
    }

    tournament.matchDeadlineDate = effective;
    await tournament.save();

    await TournamentMatch.update(
      { scheduledDeadline: effective },
      {
        where: {
          tournamentId,
          status: { [Op.notIn]: ["completed"] },
        },
      }
    );

    await AuditLog.create({
      action: "match_deadline_change_applied",
      entityType: "tournament_match",
      entityId: match.id,
      userId,
      oldValue: {
        previousTournamentDeadline: resolveTournamentDeadline(tournament),
      },
      newValue: {
        requestId: String(requestLog.id),
        appliedDeadline: effective,
      },
      notes: `Applied from request ${requestLog.id}`,
    });

    return res.json({
      success: true,
      message: "Deadline updated for tournament matches",
      data: {
        tournamentId,
        deadlineDate: effective,
      },
    });
  } catch (error) {
    console.error("applyDeadlineChangeRequest error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Void tournament ranking points (admin only)
 */
exports.voidTournamentRankingPoints = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { reason } = req.body;

    // Verify admin
    const user = await User.findByPk(userId);
    if (user.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "Admin only" });
    }

    // Void all ranking points for this tournament
    await RankingPointsHistory.update(
      { isActive: false, voidDate: new Date(), voidReason: reason, voidedBy: userId },
      { where: { tournamentId } }
    );

    // Log action
    await AuditLog.create({
      action: "tournament_ranking_points_voided",
      entityType: "tournament",
      entityId: tournamentId,
      userId,
      notes: reason,
    });

    res.json({
      success: true,
      message: "Tournament ranking points voided",
    });
  } catch (error) {
    console.error("voidTournamentRankingPoints error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Export tournament participants as PDF
 */
exports.exportParticipantsAsPDF = async (req, res) => {
  let doc;
  try {
    const { tournamentId } = req.params;

    // Fetch tournament details
    const tournament = await Tournament.findByPk(tournamentId);

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Fetch organization separately
    let organization = null;
    if (tournament.organizationId) {
      organization = await Organization.findByPk(tournament.organizationId);
    }

    // Fetch all participants
    const participants = await TournamentParticipant.findAll({
      where: { tournamentId },
      include: [
        {
          association: "player",
          attributes: ["id", "name", "avatarUrl"],
          include: [{ association: "user", attributes: ["id", "email"] }],
        },
      ],
      order: [["registrationDate", "ASC"]],
    });

    // Fetch invitations for this tournament
    const invitations = await TournamentInvitation.findAll({ where: { tournamentId } });

    // Normalize participant data
    const normalizedParticipants = participants.map((p) => {
      const participant = p;
      const playerEmail = participant.player?.user?.email || participant.playerEmail || null;

      const match = invitations.find((inv) => {
        if (inv.invitedPlayerId && participant.playerId && inv.invitedPlayerId === participant.playerId) return true;
        if (inv.invitedEmail && playerEmail && inv.invitedEmail.toLowerCase() === playerEmail.toLowerCase()) return true;
        if (inv.invitedEmail && participant.playerEmail && inv.invitedEmail.toLowerCase() === participant.playerEmail?.toLowerCase()) return true;
        return false;
      });

      if (match) {
        participant.dataValues.invitedEmail = match.invitedEmail || null;
        if (!participant.dataValues.registrationMethod) {
          participant.dataValues.registrationMethod = 'invitation';
        }
      } else {
        participant.dataValues.invitedEmail = participant.dataValues.invitedEmail || playerEmail || null;
      }

      return participant;
    });

    // Create PDF document
    const filename = `${tournament.name.replace(/\s+/g, '_')}_Participants_${new Date().toISOString().split('T')[0]}.pdf`;

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create new PDF document
    doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Handle document errors
    doc.on('error', (err) => {
      console.error('PDF Document error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'PDF generation error' });
      }
    });

    // Pipe document to response
    doc.pipe(res);

    // Colors for professional design
    const colors = {
      primary: '#1e40af',
      accent: '#059669',
      darkGray: '#1f2937',
      lightGray: '#f3f4f6',
    };

    // Add professional header with background
    doc.rect(0, 0, doc.page.width, 100).fill(colors.primary);

    // Title
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#ffffff');
    doc.text(`${tournament.name}`, 50, 25, { align: 'left', width: 500 });

    // Subtitle
    doc.fontSize(11).font('Helvetica').fillColor('#dbeafe');
    doc.text('Tournament Participant List', 50, 58, { align: 'left', width: 500 });

    // Add tournament details section - positioned below header
    const detailsY = 130;
    let currentDetailY = detailsY;

    // Organization
    if (organization?.organizationName) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.darkGray).text('Organization:', 50, currentDetailY);
      doc.fontSize(10).font('Helvetica').fillColor(colors.primary).text(organization.organizationName, 200, currentDetailY);
      currentDetailY += 25;
    }

    // Date range
    doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.darkGray).text('Tournament Dates:', 50, currentDetailY);
    doc.fontSize(10).font('Helvetica').fillColor(colors.darkGray).text(
      `${new Date(tournament.startDate).toLocaleDateString()} - ${new Date(tournament.endDate).toLocaleDateString()}`,
      200,
      currentDetailY
    );
    currentDetailY += 25;

    // Export date
    doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.darkGray).text('Export Date:', 50, currentDetailY);
    doc.fontSize(10).font('Helvetica').fillColor(colors.darkGray).text(new Date().toLocaleDateString(), 200, currentDetailY);

    // Add status breakdown with colored boxes
    const statusCounts = {
      pending: normalizedParticipants.filter(p => p.status === 'pending').length,
      approved: normalizedParticipants.filter(p => p.status === 'approved').length,
      rejected: normalizedParticipants.filter(p => p.status === 'rejected').length,
      withdrawn: normalizedParticipants.filter(p => p.status === 'withdrawn').length,
      total: normalizedParticipants.length,
    };

    // Status summary title
    const statusTitleY = currentDetailY + 35;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(colors.darkGray).text('Participant Summary:', 50, statusTitleY);

    const statusBoxY = statusTitleY + 25;
    const statusBoxWidth = 100;
    const statusBoxHeight = 55;
    let statusX = 50;

    // Helper function to draw status box
    const drawStatusBox = (label, count, bgColor, textColor, xPos) => {
      doc.rect(xPos, statusBoxY, statusBoxWidth, statusBoxHeight).fill(bgColor);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(textColor).text(label, xPos + 5, statusBoxY + 8, { width: statusBoxWidth - 10 });
      doc.fontSize(14).font('Helvetica-Bold').fillColor(textColor).text(count.toString(), xPos + 5, statusBoxY + 20, { width: statusBoxWidth - 10 });
    };

    // Draw status boxes
    drawStatusBox('Total', statusCounts.total, colors.lightGray, colors.darkGray, statusX);
    statusX += statusBoxWidth + 10;
    drawStatusBox('Approved', statusCounts.approved, '#d1fae5', colors.accent, statusX);
    statusX += statusBoxWidth + 10;
    drawStatusBox('Pending', statusCounts.pending, '#fef3c7', '#b45309', statusX);
    statusX += statusBoxWidth + 10;
    drawStatusBox('Rejected', statusCounts.rejected, '#fee2e2', '#dc2626', statusX);
    statusX += statusBoxWidth + 10;
    drawStatusBox('Withdrawn', statusCounts.withdrawn, '#f3f4f6', '#6b7280', statusX);

    // Create table - positioned below status boxes
    const tableY = statusBoxY + statusBoxHeight + 30;
    const col1X = 50;
    const col2X = 100;
    const col3X = 250;
    const col4X = 400;
    const rowHeight = 22;

    // Add table title
    doc.fontSize(11).font('Helvetica-Bold').fillColor(colors.darkGray).text('Participant Details:', 50, tableY - 25);

    // Draw header background
    doc.rect(col1X - 10, tableY, 530, rowHeight).fill(colors.primary);

    // Draw headers
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    doc.text('#', col1X, tableY + 6);
    doc.text('Player Name', col2X, tableY + 6);
    doc.text('Email', col3X, tableY + 6);
    doc.text('Status', col4X, tableY + 6);

    doc.moveTo(col1X - 10, tableY + rowHeight).lineTo(col1X + 520, tableY + rowHeight).stroke();

    // Add participant rows
    let currentY = tableY + rowHeight;

    normalizedParticipants.forEach((participant, index) => {
      // Check if we need a new page
      if (currentY + rowHeight > doc.page.height - 60) {
        doc.addPage({ margin: 50 });
        currentY = 50;

        // Redraw headers on new page
        doc.rect(col1X - 10, currentY, 530, rowHeight).fill(colors.primary);
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
        doc.text('#', col1X, currentY + 6);
        doc.text('Player Name', col2X, currentY + 6);
        doc.text('Email', col3X, currentY + 6);
        doc.text('Status', col4X, currentY + 6);
        doc.moveTo(col1X - 10, currentY + rowHeight).lineTo(col1X + 520, currentY + rowHeight).stroke();
        currentY += rowHeight;
      }

      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(col1X - 10, currentY, 530, rowHeight).fill(colors.lightGray);
      }

      // Row content
      const playerName = participant.player?.name || 'N/A';
      const email = participant.player?.user?.email || participant.invitedEmail || 'N/A';
      const status = participant.status ? participant.status.charAt(0).toUpperCase() + participant.status.slice(1) : 'N/A';

      doc.fillColor(colors.darkGray).fontSize(8).font('Helvetica');
      doc.text((index + 1).toString(), col1X, currentY + 6);
      doc.text(playerName.substring(0, 40), col2X, currentY + 6);
      doc.text(email.substring(0, 45), col3X, currentY + 6);

      // Status with color coding
      let statusColor = colors.darkGray;
      if (status === 'Approved') statusColor = colors.accent;
      else if (status === 'Pending') statusColor = '#b45309';
      else if (status === 'Rejected') statusColor = '#dc2626';
      else if (status === 'Withdrawn') statusColor = '#6b7280';

      doc.fillColor(statusColor).text(status, col4X, currentY + 6);

      currentY += rowHeight;
    });

    // Draw bottom border
    doc.moveTo(col1X - 10, currentY).lineTo(col1X + 520, currentY).stroke();

    // Add footer
    doc.moveDown(2);
    doc.fontSize(7).fillColor('#9ca3af').text(
      'Generated by CueMetrics Tournament Management System',
      50,
      doc.page.height - 40,
      { align: 'center' }
    );

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("exportParticipantsAsPDF error:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message || "Failed to generate PDF" });
    }
  }
};

// ============================================================================
// TOURNAMENT DISCOVERY & OPEN REGISTRATION
// ============================================================================

/**
 * GET /api/tournaments/discover
 * List available tournaments for player discovery/registration
 * Filters: sport, status, allowsOpenRegistration, searchTerm
 */
exports.discoverTournaments = async (req, res) => {
  try {
    // Disable caching to ensure fresh tournament lists
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { sport, status = 'registration', allowsOpenRegistration, searchTerm, limit = 20, offset = 0 } = req.query;

    const where = {};

    // Filter by sport if provided
    if (sport) where.sport = sport;

    // Filter by status (draft, registration, started, completed)
    if (status) where.status = status;

    // Note: Filter by open registration handled after query for backward compatibility

    // Search by tournament name or description
    if (searchTerm) {
      where[Op.or] = [
        { name: { [Op.like]: `%${searchTerm}%` } },
        { description: { [Op.like]: `%${searchTerm}%` } },
      ];
    }

    // Exclude archived and draft tournaments
    where.isArchived = false;
    where.status = { [Op.in]: ['registration', 'in_progress', 'started'] };
    // Player discovery should list public tournaments only.
    // Private tournaments are joinable via explicit code/invitation flow.
    where.visibility = "public";

    let tournaments = await Tournament.findAll({
      where,
      include: [
        {
          association: 'organizer',
          attributes: ['id', 'organizationName', 'contactPersonName'],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['startDate', 'ASC']],
      attributes: {
        exclude: ['createdAt', 'updatedAt'], // Exclude timestamps for cleaner API
      },
    });

    // Filter by open registration if requested (check both new column and old format for backward compatibility)
    if (allowsOpenRegistration === 'true') {
      tournaments = tournaments.filter(t => {
        // Check new column first
        if (t.allowsOpenRegistration) return true;

        // Normalize and check entryMethods JSON format for backward compatibility
        try {
          const entryMethods = parseEntryMethods(t.entryMethods, t);
          return entryMethods.openRequestWithApproval || entryMethods.selfRegistration || false;
        } catch (e) {
          return false;
        }
      });
    }

    // Count total for pagination
    const total = await Tournament.count({ where });

    // Enhance response with registration stats
    const enhancedTournaments = await Promise.all(
      tournaments.map(async (tournament) => {
        const participantCount = await TournamentParticipant.count({
          where: { tournamentId: tournament.id, status: 'approved' },
        });

        const base = tournament.toJSON();
        base.entryMethods = parseEntryMethods(tournament.entryMethods, tournament);

        return {
          ...base,
          currentParticipantCount: participantCount,
          spotsAvailable: tournament.maxParticipants ? tournament.maxParticipants - participantCount : null,
          registrationClosed: !getRegistrationOpenStateUTC(tournament, new Date()).open,
        };
      })
    );

    res.json({
      success: true,
      data: enhancedTournaments,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      },
    });
  } catch (error) {
    console.error('discoverTournaments error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * POST /api/tournaments/:tournamentId/register-open-request
 * Submit open registration request requiring organizer approval
 */
exports.submitOpenRegistrationRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { message } = req.body;

    // Verify tournament exists
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found' });
    }

    // Gate open registration flows until venue approval is granted.
    if (!isVenueApprovalReady(tournament)) {
      const blocked = getVenueApprovalBlockedError(tournament);
      return res.status(403).json({ success: false, ...blocked });
    }

    // Check if open registration is enabled (check both new column and old entryMethods format for backward compatibility)
    let allowsOpenRegistration = tournament.allowsOpenRegistration;

    // If new column is not enabled, check old entryMethods JSON format for backward compatibility
    if (!allowsOpenRegistration && tournament.entryMethods) {
      try {
        const entryMethods = typeof tournament.entryMethods === 'string'
          ? JSON.parse(tournament.entryMethods)
          : tournament.entryMethods;
        allowsOpenRegistration = entryMethods.openRequestWithApproval || entryMethods.selfRegistration || false;
      } catch (e) {
        // If JSON parsing fails, just use the boolean column value
      }
    }

    if (!allowsOpenRegistration) {
      return res.status(403).json({
        success: false,
        error: 'This tournament does not accept open registrations',
      });
    }

    // Check registration deadline (UTC-consistent full-day rule)
    const now = new Date();
    const { open } = getRegistrationOpenStateUTC(tournament, now);
    if (!open) {
      return res.status(403).json({
        success: false,
        error: "Registration closed",
        errorCode: "REGISTRATION_CLOSED",
      });
    }

    // Get player from user with user relationship
    let player = await Player.findOne({
      where: { userId },
      include: [{
        association: 'user',
        attributes: ['email']
      }]
    });

    // If player profile doesn't exist, auto-create one
    if (!player) {
      try {
        const user = await User.findByPk(userId);
        if (!user) {
          return res.status(400).json({
            success: false,
            error: 'User not found. Please log in again.'
          });
        }

        // Auto-create player profile
        player = await Player.create({
          userId,
          name: user.email.split('@')[0] || 'Player',
          badgeType: 'Casual'
        });

        // Fetch the player with user relationship
        player = await Player.findByPk(player.id, {
          include: [{
            association: 'user',
            attributes: ['email']
          }]
        });

        console.log(`[submitOpenRegistrationRequest] Auto-created player profile ${player.id} for user ${userId}`);
      } catch (err) {
        console.error(`[submitOpenRegistrationRequest] Error auto-creating player profile:`, err);
        const message = String(error?.message || "");
        const knownError =
          message.includes("LATE_") ||
          message.includes("REGENERATE_NOT_ALLOWED_AFTER_START") ||
          message.includes("NO_NEW_PLAYERS") ||
          message.includes("Invalid strategy") ||
          message.includes("players is required") ||
          message.includes("Tournament not found") ||
          message.includes("Cannot regenerate") ||
          message.includes("One or more players are invalid") ||
          message.includes("Tournament format not found");
        if (knownError) {
          return res.status(400).json({
            success: false,
            error: message || "Late entry request is invalid",
          });
        }
        return res.status(400).json({
          success: false,
          error: 'Failed to create player profile. Please contact support.'
        });
      }
    }

    // Get player email
    const playerEmail = player.user?.email || player.email;
    if (!playerEmail) {
      return res.status(400).json({ success: false, error: 'Player email not found' });
    }

    // Check if already registered
    const existingParticipant = await TournamentParticipant.findOne({
      where: { tournamentId, playerId: player.id },
    });
    if (existingParticipant) {
      return res.status(400).json({
        success: false,
        error: 'You are already registered for this tournament',
      });
    }

    // Check tournament capacity
    if (tournament.maxParticipants && tournament.currentParticipantCount >= tournament.maxParticipants) {
      return res.status(403).json({ success: false, error: 'Tournament is full' });
    }

    // For open registration requests, ALWAYS set status to pending for organizer approval
    // The organizer must explicitly approve these requests
    const status = 'pending';

    // Create participant record
    const participant = await TournamentParticipant.create({
      tournamentId,
      playerId: player.id,
      registrationMethod: 'open_request',
      status,
      registrationDate: new Date(),
    });

    // Do NOT increment participant count yet - wait for approval
    // (participant count increments only when status changes to 'approved')

    // Create invitation record for tracking
    await TournamentInvitation.create({
      tournamentId,
      type: 'open_registration_request',
      invitedPlayerId: player.id,
      invitedEmail: playerEmail,
      invitedByUserId: userId,
      status: status === 'approved' ? 'accepted' : 'sent',
      invitationMessage: message || null,
    });

    // Log action
    await AuditLog.create({
      action: 'open_registration_request_submitted',
      entityType: 'tournament_participant',
      entityId: participant.id,
      userId,
      notes: `Player ${player.name} submitted open registration request for tournament ${tournament.name}`,
    });

    res.status(201).json({
      success: true,
      data: participant,
      message: status === 'pending'
        ? 'Registration pending organizer approval'
        : 'Successfully registered for tournament',
    });
  } catch (error) {
    console.error('submitOpenRegistrationRequest error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * GET /api/tournaments/:tournamentId/open-requests
 * Get open registration requests (organization admin only)
 */
exports.getOpenRegistrationRequests = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;

    // Verify organization ownership
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const tournament = await Tournament.findOne({
      where: { id: tournamentId, organizationId: organization.id },
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found or access denied' });
    }

    // Get pending open registration requests
    const requests = await TournamentParticipant.findAll({
      where: {
        tournamentId,
        registrationMethod: 'open_request',
        status: 'pending',
      },
      include: [
        {
          association: 'player',
          attributes: ['id', 'name', 'avatarUrl', 'badgeType'],
          include: [{ association: 'user', attributes: ['id', 'email'] }],
        },
      ],
      order: [['registrationDate', 'ASC']],
    });

    res.json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    console.error('getOpenRegistrationRequests error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * GET /api/player/tournaments
 * Get player's tournament registrations
 */
/**
 * Simple Player Tournaments - Using raw queries to bypass ORM issues
 * SIMPLER APPROACH: Direct SQL joins to get player tournaments
 */
exports.getPlayerTournamentsSimple = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { userId } = req.user;
    console.log(`[getPlayerTournamentsSimple] userId=${userId}`);

    // Step 1: Resolve player (same email / linked users as /player/me)
    const player = await resolvePlayerProfile(userId);
    if (!player) {
      console.log(`[getPlayerTournamentsSimple] No player found for userId=${userId}`);
      return res.json({ success: true, data: [], count: 0 });
    }

    const playerId = player.id;
    console.log(`[getPlayerTournamentsSimple] playerId=${playerId}`);

    // Step 2: Raw SQL query to join everything
    const query = `
      SELECT
        tp.id as participation_id,
        tp.playerId,
        tp.tournamentId,
        tp.status,
        tp.registrationMethod,
        tp.registrationDate,
        tp.matchesWon,
        tp.matchesLost,
        t.id as tournament_id,
        t.name,
        t.description,
        t.sport,
        t.startDate,
        t.endDate,
        t.matchDeadlineDate,
        t.status as tournament_status,
        t.organizationId,
        t.maxParticipants,
        t.currentParticipantCount,
        t.tier,
        t.ranked,
        t.clubId,
        o.id as organizer_id,
        o.organizationName,
        tf.type,
        tf.byesHandling,
        tf.seeding,
        tf.rankingSource,
        tf.manualSeedOrder
      FROM tournament_participants tp
      LEFT JOIN tournaments t ON tp.tournamentId = t.id
      LEFT JOIN organizations o ON t.organizationId = o.id
      LEFT JOIN tournament_formats tf ON t.id = tf.tournamentId
      WHERE tp.playerId = ?
      ORDER BY tp.registrationDate DESC
    `;

    const results = await sequelize.query(query, {
      replacements: [playerId],
      type: QueryTypes.SELECT,
    });

    console.log(`[getPlayerTournamentsSimple] Found ${results.length} results from DB`);
    results.forEach((row, idx) => {
      console.log(`  [Result ${idx}] tournament=${row.name} (id=${row.tournament_id}), joinDate=${row.registrationDate}, status=${row.status}, matchDeadlineDate=${row.matchDeadlineDate}`);
    });

    // Step 3: Format results
    const tournaments = results.map(row => ({
      id: row.participation_id,
      tournament: {
        id: row.tournament_id,
        name: row.name,
        description: row.description,
        sport: row.sport,
        startDate: row.startDate,
        endDate: row.endDate,
        matchDeadlineDate: row.matchDeadlineDate,
        status: row.tournament_status,
        organizationId: row.organizationId,
        maxParticipants: row.maxParticipants,
        currentParticipantCount: row.currentParticipantCount,
        tier: row.tier,
        ranked: row.ranked,
        clubId: row.clubId,
        organizer: row.organizer_id ? {
          id: row.organizer_id,
          organizationName: row.organizationName,
        } : null,
        format: row.type ? {
          type: row.type,
          byesHandling: row.byesHandling,
        } : null,
      },
      status: row.status,
      registrationMethod: row.registrationMethod,
      registrationDate: row.registrationDate,
      matchesWon: row.matchesWon || 0,
      matchesLost: row.matchesLost || 0,
      myStats: {
        wins: row.matchesWon || 0,
        losses: row.matchesLost || 0,
        participationStatus: row.status,
      },
    }));

    console.log(`[getPlayerTournamentsSimple] Returning ${tournaments.length} tournaments`);

    res.json({
      success: true,
      data: tournaments,
      count: tournaments.length,
    });

  } catch (error) {
    console.error('[getPlayerTournamentsSimple] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tournaments',
      details: error.message,
    });
  }
};

exports.getPlayerTournaments = async (req, res) => {
  // Simply delegate to the simpler version
  return exports.getPlayerTournamentsSimple(req, res);
};

exports.debugPlayerTournaments = async (req, res) => {
  try {
    const { userId } = req.user;

    console.log(`\n[DEBUG] ===== PLAYER TOURNAMENTS DEBUG =====`);
    console.log(`[DEBUG] userId=${userId}`);

    // Step 1: Get player
    const player = await Player.findOne({
      where: { userId },
      include: [{ association: 'user', attributes: ['id', 'email'] }]
    });

    console.log(`[DEBUG] Player lookup result:`, player ? `Found ID=${player.id}` : 'NOT FOUND');

    if (!player) {
      return res.json({
        success: false,
        error: 'No player found for this user',
        userId,
      });
    }

    const playerId = player.id;
    console.log(`[DEBUG] Looking for tournament_participants with playerId=${playerId}`);

    // Step 2: Get all participations for this player - RAW SQL
    const rawParticipations = await sequelize.query(
      'SELECT * FROM tournament_participants WHERE playerId = ? ORDER BY registrationDate DESC',
      { replacements: [playerId], type: QueryTypes.SELECT }
    );

    console.log(`[DEBUG] Raw SQL query returned ${rawParticipations.length} records`);
    rawParticipations.forEach((p, i) => {
      console.log(`[DEBUG]   Participation ${i + 1}: id=${p.id}, tournamentId=${p.tournamentId}, status=${p.status}, method=${p.registrationMethod}`);
    });

    // Step 3: Also check with ORM
    const ormParticipations = await TournamentParticipant.findAll({
      where: { playerId: playerId },
      raw: true,
    });

    console.log(`[DEBUG] ORM query returned ${ormParticipations.length} records`);

    // Step 4: For each tournament, get details
    const tournamentIds = [...new Set(rawParticipations.map(p => p.tournamentId))];
    console.log(`[DEBUG] Unique tournament IDs: [${tournamentIds.join(', ')}]`);

    let tournaments = [];
    if (tournamentIds.length > 0) {
      tournaments = await Tournament.findAll({
        where: { id: { [Op.in]: tournamentIds } },
        attributes: ['id', 'name', 'status', 'startDate']
      });
      console.log(`[DEBUG] Found ${tournaments.length} tournaments`);
      tournaments.forEach(t => {
        console.log(`[DEBUG]   Tournament: id=${t.id}, name=${t.name}`);
      });
    }

    // Step 5: Check if participations table even exists and has data
    const tableCheck = await sequelize.query(
      'SELECT COUNT(*) as count FROM tournament_participants',
      { type: QueryTypes.SELECT }
    );
    console.log(`[DEBUG] Total records in tournament_participants table: ${tableCheck[0].count}`);

    console.log(`[DEBUG] ===== END DEBUG =====\n`);

    res.json({
      success: true,
      player: {
        id: playerId,
        userId,
        name: player.name,
      },
      debug: {
        rawSqlParticipations: rawParticipations.length,
        ormParticipations: ormParticipations.length,
        uniqueTournaments: tournamentIds.length,
        totalTableRecords: tableCheck[0].count,
      },
      rawData: {
        participations: rawParticipations.slice(0, 5), // First 5 for safety
        tournaments: tournaments,
      }
    });

  } catch (error) {
    console.error('[DEBUG] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.getPlayerTournaments = async (req, res) => {
  try {
    // Disable caching to ensure fresh data on every request
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { userId } = req.user;

    console.log(`[getPlayerTournaments] Starting with userId=${userId}`);

    const player = await resolvePlayerProfile(userId);

    if (!player) {
      console.warn(`[getPlayerTournaments] No player found for userId=${userId}`);
      return res.json({ success: true, data: [], count: 0 });
    }

    const playerId = player.id;
    console.log(`[getPlayerTournaments] Found player id=${playerId}`);

    // Query all participations for this player
    const participations = await TournamentParticipant.findAll({
      where: { playerId }
    });

    console.log(`[getPlayerTournaments] Found ${participations.length} participation records for player ${playerId}`);

    if (participations.length === 0) {
      return res.json({ success: true, data: [], count: 0 });
    }

    // Get tournament IDs
    const tournamentIds = participations.map(p => p.tournamentId);
    console.log(`[getPlayerTournaments] Tournament IDs: ${tournamentIds.join(', ')}`);

    // Fetch tournaments with their details
    const tournaments = await Tournament.findAll({
      where: { id: { [Op.in]: tournamentIds } },
      include: [
        {
          model: Organization,
          as: 'organizer',
          attributes: ['id', 'organizationName'],
          required: false,
        },
        {
          model: TournamentFormat,
          as: 'format',
          attributes: ['type', 'byesHandling'],
          required: false,
        },
      ],
    });

    console.log(`[getPlayerTournaments] Retrieved ${tournaments.length} tournaments`);

    // Create a map of tournaments by ID for easy lookup
    const tournamentMap = {};
    tournaments.forEach(t => {
      tournamentMap[t.id] = t;
    });

    // Create a map of participations by tournament ID
    const participationMap = {};
    participations.forEach(p => {
      participationMap[p.tournamentId] = p;
    });

    // Build response matching frontend expectations
    // Frontend expects: { tournament: {...}, status: "...", ...otherParticipationFields }
    const result = tournaments.map(tournament => {
      const participation = participationMap[tournament.id];
      return {
        id: participation.id, // Participation ID
        tournament: {
          id: tournament.id,
          name: tournament.name,
          description: tournament.description,
          sport: tournament.sport,
          startDate: tournament.startDate,
          endDate: tournament.endDate,
          matchDeadlineDate: tournament.matchDeadlineDate,
          status: tournament.status,
          organizationId: tournament.organizationId,
          maxParticipants: tournament.maxParticipants,
          currentParticipantCount: tournament.currentParticipantCount,
          tier: tournament.tier,
          ranked: tournament.ranked,
          clubId: tournament.clubId,
          organizer: tournament.organizer ? {
            id: tournament.organizer.id,
            organizationName: tournament.organizer.organizationName
          } : null,
          format: tournament.format ? {
            type: tournament.format.type,
            byesHandling: tournament.format.byesHandling
          } : null,
          withdrawalRules: tournament.withdrawalRules || null,
        },
        status: participation.status, // Participation status (approved/pending/etc)
        registrationMethod: participation.registrationMethod,
        registrationDate: participation.registrationDate,
        matchesWon: participation.matchesWon || 0,
        matchesLost: participation.matchesLost || 0,
        myStats: {
          wins: participation.matchesWon || 0,
          losses: participation.matchesLost || 0,
          participationStatus: participation.status,
          registrationMethod: participation.registrationMethod,
        },
      };
    });

    console.log(`[getPlayerTournaments] Returning ${result.length} tournaments to player`);

    res.json({
      success: true,
      data: result,
      count: result.length,
    });

  } catch (error) {
    console.error('[getPlayerTournaments] Error:', error.message);
    console.error('[getPlayerTournaments] Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tournaments',
      details: error.message
    });
  }
};

/**
 * Get player's matches in a tournament
 */
exports.getPlayerMatches = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { status } = req.query;

    const player = await resolvePlayerProfile(userId);
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player profile not found' });
    }

    // Build where clause
    const where = {
      tournamentId,
      [Op.or]: [
        { player1Id: player.id },
        { player2Id: player.id },
      ],
    };

    if (status) {
      where.status = status;
    }

    // Get matches
    const matches = await TournamentMatch.findAll({
      where,
      include: [
        { association: 'player1', attributes: ['id', 'name', 'avatarUrl'] },
        { association: 'player2', attributes: ['id', 'name', 'avatarUrl'] },
        { model: TournamentRound, attributes: ['id', 'roundNumber', 'roundType', 'status'] },
      ],
      order: [['roundNumber', 'ASC'], ['matchNumber', 'ASC']],
    });

    // Add playerId to each match for frontend reference
    const enrichedMatches = matches.map((m) => ({
      ...m.toJSON(),
      playerId: player.id,
    }));

    res.json({
      success: true,
      data: enrichedMatches,
      count: enrichedMatches.length,
    });
  } catch (error) {
    console.error('getPlayerMatches error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get all player's active tournament matches across all tournaments
 * For the dashboard "My Tournament Matches" section
 */
exports.getPlayerAllTournamentMatches = async (req, res) => {
  try {
    const { userId } = req.user;
    const { includeCompleted = false } = req.query;

    const player = await resolvePlayerProfile(userId);
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player profile not found' });
    }

    // Get all tournaments this player is approved for
    const participations = await TournamentParticipant.findAll({
      where: { playerId: player.id, status: 'approved' },
      attributes: ['tournamentId'],
    });

    const tournamentIds = participations.map((p) => p.tournamentId);

    if (tournamentIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        workflowStatus: [],
        count: 0,
        message: 'Player is not registered for any active tournaments',
      });
    }

    // Build where clause - get matches where player is participant
    const where = {
      tournamentId: { [Op.in]: tournamentIds },
      [Op.or]: [
        { player1Id: player.id },
        { player2Id: player.id },
      ],
    };

    // Filter out completed matches unless requested
    if (!includeCompleted || includeCompleted === 'false') {
      where.status = { [Op.in]: ['scheduled', 'in_progress', 'pending_confirmation'] };
    }

    // Get matches with all related data
    const matches = await TournamentMatch.findAll({
      where,
      include: [
        { model: Player, as: 'player1', attributes: ['id', 'name', 'avatarUrl'] },
        { model: Player, as: 'player2', attributes: ['id', 'name', 'avatarUrl'] },
        { model: TournamentRound, attributes: ['id', 'roundNumber', 'roundType', 'name', 'status'] },
      ],
      order: [['scheduledDate', 'ASC'], ['roundNumber', 'ASC'], ['matchNumber', 'ASC']],
    });

    // Fetch tournaments separately to avoid association issues
    const tournaments = await Tournament.findAll({
      where: { id: { [Op.in]: tournamentIds } },
      attributes: ['id', 'name', 'sport', 'tier', 'ranked', 'status', 'bracketStatus'],
    });

    const tournamentMap = {};
    tournaments.forEach((t) => {
      tournamentMap[t.id] = t.toJSON();
    });

    // Track workflow status for each tournament
    const workflowStatus = tournaments.map(t => ({
      tournamentId: t.id,
      tournamentName: t.name,
      bracketStatus: t.bracketStatus || 'not_generated',
      isVisible: ['generated', 'locked', 'scheduled'].includes(t.bracketStatus), // Matches visible once bracket is generated
      message: getWorkflowStatusMessage(t.bracketStatus)
    }));

    // Filter matches - show if bracket is generated, locked, or scheduled
    const visibleMatches = matches.filter(m => {
      const tournament = tournamentMap[m.tournamentId];
      return tournament && ['generated', 'locked', 'scheduled'].includes(tournament.bracketStatus);
    });

    // Enrich matches with tournament details and opponent info
    const enrichedMatches = visibleMatches.map((m) => {
      const match = m.toJSON();
      const isPlayer1 = match.player1Id === player.id;
      const opponent = isPlayer1 ? match.player2 : match.player1;

      return {
        ...match,
        playerId: player.id,
        opponent: opponent ? { id: opponent.id, name: opponent.name, avatarUrl: opponent.avatarUrl } : null,
        isPlayer1,
        isPlayer2: !isPlayer1,
        tournament: tournamentMap[match.tournamentId] || { id: match.tournamentId },
        round: match.TournamentRound || { id: match.roundId },
      };
    });

    res.json({
      success: true,
      data: enrichedMatches,
      workflowStatus,
      count: enrichedMatches.length,
      hiddenCount: matches.length - enrichedMatches.length,
      message: enrichedMatches.length === 0 && matches.length > 0
        ? 'Matches exist but are not yet visible. Organizer is scheduling matches.'
        : undefined,
    });
  } catch (error) {
    console.error('getPlayerAllTournamentMatches error:', error);
    res.status(500).json({ success: false, error: 'Internal server error: ' + (error.message || error) });
  }
};

/**
 * Helper: Get user-friendly workflow status message
 */
function getWorkflowStatusMessage(bracketStatus) {
  const messages = {
    'not_generated': 'Bracket not yet generated',
    'generated': 'Organizer is reviewing the bracket',
    'locked': 'Bracket is locked. Organizer is scheduling matches',
    'scheduled': 'All matches have been scheduled. Changes are locked.',
  };
  return messages[bracketStatus] || 'Unknown bracket status';
}

/**
 * Helper: Update player statistics after a match is completed
 * Called from submitMatchResult, confirmMatchResult, and overrideMatchResult
 */
exports._updatePlayerStatisticsAfterMatch = async (match, tournament, transaction) => {
  try {
    if (!match.player1Id || !match.player2Id) return; // Skip if bye or walkover

    const [player1, player2] = await Promise.all([
      Player.findByPk(match.player1Id, { transaction }),
      Player.findByPk(match.player2Id, { transaction }),
    ]);

    if (!player1 || !player2) return;

    // Determine winner and loser
    let winnerId, loserId;
    if (match.winner === 'player1') {
      winnerId = match.player1Id;
      loserId = match.player2Id;
    } else if (match.winner === 'player2') {
      winnerId = match.player2Id;
      loserId = match.player1Id;
    } else if (match.winner === 'draw') {
      // For draws, just increment matches played
      await player1.update({
        matches_played: (player1.matches_played || 0) + 1,
        frames_won: (player1.frames_won || 0) + (match.player1FramesWon || 0),
        frames_lost: (player1.frames_lost || 0) + (match.player2FramesWon || 0),
      }, { transaction });

      await player2.update({
        matches_played: (player2.matches_played || 0) + 1,
        frames_won: (player2.frames_won || 0) + (match.player2FramesWon || 0),
        frames_lost: (player2.frames_lost || 0) + (match.player1FramesWon || 0),
      }, { transaction });
      return;
    } else {
      return; // Unknown winner status
    }

    // Update winner
    const winnerNewStats = {
      matches_played: (player1.matches_played || 0) + 1,
      matches_won: (winnerId === player1.id ? (player1.matches_won || 0) + 1 : (player2.matches_won || 0) + 1),
      matches_lost: (winnerId === player1.id ? (player1.matches_lost || 0) + 0 : (player2.matches_lost || 0) + 0),
      frames_won: (winnerId === player1.id
        ? (player1.frames_won || 0) + (match.player1FramesWon || 0)
        : (player2.frames_won || 0) + (match.player2FramesWon || 0)
      ),
      frames_lost: (winnerId === player1.id
        ? (player1.frames_lost || 0) + (match.player2FramesWon || 0)
        : (player2.frames_lost || 0) + (match.player1FramesWon || 0)
      ),
    };

    const loserNewStats = {
      matches_played: (winnerId === player1.id ? (player2.matches_played || 0) + 1 : (player1.matches_played || 0) + 1),
      matches_won: (winnerId === player1.id ? player2.matches_won || 0 : player1.matches_won || 0),
      matches_lost: (winnerId === player1.id ? (player2.matches_lost || 0) + 1 : (player1.matches_lost || 0) + 1),
      frames_won: (winnerId === player1.id
        ? (player2.frames_won || 0) + (match.player2FramesWon || 0)
        : (player1.frames_won || 0) + (match.player1FramesWon || 0)
      ),
      frames_lost: (winnerId === player1.id
        ? (player2.frames_lost || 0) + (match.player1FramesWon || 0)
        : (player1.frames_lost || 0) + (match.player2FramesWon || 0)
      ),
    };

    // Calculate win percentage
    const calcWinPercentage = (stats) => {
      if (stats.matches_played === 0) return 0;
      return Math.round((stats.matches_won / stats.matches_played) * 100 * 100) / 100;
    };

    winnerNewStats.win_percentage = calcWinPercentage(winnerNewStats);
    loserNewStats.win_percentage = calcWinPercentage(loserNewStats);

    // Apply updates
    await Promise.all([
      (winnerId === player1.id ? player1 : player2).update(winnerNewStats, { transaction }),
      (winnerId === player1.id ? player2 : player1).update(loserNewStats, { transaction }),
    ]);

  } catch (error) {
    console.error('_updatePlayerStatisticsAfterMatch error:', error);
    // Don't throw - stats update failure should not fail the match completion
  }
};

/**
 * Lock the tournament bracket (organizer confirms bracket is final)
 */
exports.lockBracket = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Verify authorization (organizer/admin only)
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || organization.id !== tournament.organizationId) {
      return res.status(403).json({ success: false, error: "No authorization. Only organizers can lock brackets." });
    }

    // Check if matches exist (bracket must be generated)
    const matchCount = await TournamentMatch.count({
      where: { tournamentId }
    });

    if (matchCount === 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot lock bracket. No matches found. Bracket must be generated first."
      });
    }

    // Update bracket status
    const lockedAt = new Date();
    await tournament.update({
      bracketStatus: "locked",
      bracketLockedAt: lockedAt,
      bracketLockedBy: userId
    });

    // Reload tournament to get fresh data
    await tournament.reload();

    console.log(`[lockBracket] Successfully locked tournament ${tournamentId}:`, {
      bracketStatus: tournament.bracketStatus,
      bracketLockedAt: tournament.bracketLockedAt,
      bracketLockedBy: tournament.bracketLockedBy
    });

    await AuditLog.create({
      action: "bracket_locked",
      entityType: "tournament",
      entityId: tournamentId,
      userId,
      notes: "Bracket locked by organizer",
    });

    res.json({
      success: true,
      data: {
        tournament: {
          id: tournament.id,
          bracketStatus: tournament.bracketStatus,
          bracketLockedAt: tournament.bracketLockedAt,
        },
        tournamentId,
        message: "Bracket locked successfully. Now schedule matches for players to view them."
      }
    });
  } catch (error) {
    console.error("lockBracket error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + (error.message || error) });
  }
};

/**
 * Bulk schedule multiple matches
 * Supports two formats:
 * 1. New format: { defaultDate, defaultTime, defaultVenueId }
 * 2. Legacy format: { matchSchedules: [{ matchId, scheduledDate, scheduledTime, venueId }] }
 */
exports.scheduleAllMatches = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { defaultDate, defaultTime, defaultVenueId, matchSchedules } = req.body;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Verify authorization
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || organization.id !== tournament.organizationId) {
      return res.status(403).json({ success: false, error: "No authorization" });
    }

    // Can only schedule if bracket is locked
    if (tournament.bracketStatus !== "locked") {
      return res.status(400).json({
        success: false,
        error: "Bracket must be locked before scheduling matches"
      });
    }

    // Handle new format (with defaults) or legacy format (with specific schedules)
    let schedules = [];

    if (defaultDate && defaultTime) {
      // NEW FORMAT: Auto-generate schedules from defaults
      // defaultVenueId is optional
      if (!defaultDate || !defaultTime) {
        return res.status(400).json({
          success: false,
          error: "defaultDate and defaultTime are required"
        });
      }

      // Get all unscheduled matches for this tournament
      const matches = await TournamentMatch.findAll({
        where: { tournamentId, isScheduled: false },
        raw: true
      });

      if (matches.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No unscheduled matches found"
        });
      }

      // Generate schedule: distribute matches across dates (max 2-4 matches per day)
      const matchesPerDay = 2;
      const startDate = new Date(defaultDate);

      schedules = matches.map((match, idx) => {
        const daysOffset = Math.floor(idx / matchesPerDay);
        const scheduleDate = new Date(startDate);
        scheduleDate.setDate(scheduleDate.getDate() + daysOffset);

        return {
          matchId: match.id,
          scheduledDate: scheduleDate.toISOString().split('T')[0],
          scheduledTime: defaultTime,
          venueId: defaultVenueId || null  // Allow null if not provided
        };
      });
    } else if (Array.isArray(matchSchedules) && matchSchedules.length > 0) {
      // LEGACY FORMAT: Use provided schedules
      schedules = matchSchedules;
    } else {
      return res.status(400).json({
        success: false,
        error: "Either (defaultDate + defaultTime) or matchSchedules array is required"
      });
    }

    const scheduledMatches = [];
    const errors = [];

    // Use transaction for atomic updates
    const transaction = await sequelize.transaction();

    try {
      for (const schedule of schedules) {
        try {
          const { matchId, scheduledDate, scheduledTime, venueId } = schedule;

          if (!scheduledDate || !scheduledTime) {
            errors.push({ matchId, error: "scheduledDate and scheduledTime required" });
            continue;
          }

          const match = await TournamentMatch.findByPk(matchId, { transaction });
          if (!match) {
            errors.push({ matchId, error: "Match not found" });
            continue;
          }

          await match.update({
            scheduledDate,
            scheduledTime,
            venueId,
            isScheduled: true
          }, { transaction });

          scheduledMatches.push(match);
        } catch (err) {
          errors.push({ matchId: schedule.matchId, error: err.message });
        }
      }

      // Check if all matches for this tournament are now scheduled
      const allMatches = await TournamentMatch.count({
        where: { tournamentId },
        transaction
      });
      const scheduledCount = await TournamentMatch.count({
        where: { tournamentId, isScheduled: true },
        transaction
      });

      console.log(`[scheduleAllMatches] Match count - total: ${allMatches}, scheduled: ${scheduledCount}`);

      // If all matches are scheduled, update tournament status
      if (allMatches > 0 && allMatches === scheduledCount) {
        console.log(`[scheduleAllMatches] All matches scheduled! Updating status to "scheduled"`);
        await tournament.update({
          bracketStatus: "scheduled",
          allMatchesScheduledAt: new Date()
        }, { transaction });
      } else {
        console.log(`[scheduleAllMatches] Not all matches scheduled yet - ${scheduledCount}/${allMatches}`);
      }

      await AuditLog.create({
        action: "matches_bulk_scheduled",
        entityType: "tournament",
        entityId: tournamentId,
        userId,
        notes: `Scheduled ${scheduledMatches.length} matches. Errors: ${errors.length}`,
      }, { transaction });

      await transaction.commit();

      // Reload tournament to get fresh data after transaction
      await tournament.reload({
        attributes: [
          'id', 'name', 'bracketStatus', 'bracketGeneratedAt',
          'bracketLockedAt', 'bracketLockedBy', 'allMatchesScheduledAt'
        ]
      });

      console.log(`[scheduleAllMatches] After reload - bracketStatus: ${tournament.bracketStatus}, allMatchesScheduledAt: ${tournament.allMatchesScheduledAt}`);

      res.json({
        success: errors.length === 0,
        data: {
          matches: {
            scheduledCount: scheduledMatches.length,
            totalMatches: allMatches,
            percentComplete: Math.round((scheduledCount / allMatches) * 100)
          },
          tournament: {
            bracketStatus: tournament.bracketStatus,
            allMatchesScheduledAt: tournament.allMatchesScheduledAt
          }
        },
        scheduledMatches,
        errors: errors.length > 0 ? errors : undefined,
        message: `Scheduled ${scheduledMatches.length} matches${errors.length > 0 ? ` (${errors.length} errors)` : ""}`
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    console.error("scheduleAllMatches error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + (error.message || error) });
  }
};

/**
 * Get bracket status and scheduling progress
 */
exports.getBracketStatus = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId, {
      attributes: [
        'id', 'name', 'bracketStatus', 'bracketGeneratedAt',
        'bracketLockedAt', 'bracketLockedBy', 'allMatchesScheduledAt'
      ]
    });
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Get match statistics
    const totalMatches = await TournamentMatch.count({
      where: { tournamentId }
    });

    const scheduledMatches = await TournamentMatch.count({
      where: { tournamentId, isScheduled: true }
    });

    const completedMatches = await TournamentMatch.count({
      where: { tournamentId, status: "completed" }
    });

    const fallbackFixtureDate = await resolveTournamentDefaultFixtureDate(tournament);
    const matches = await TournamentMatch.findAll({
      where: { tournamentId },
      include: [
        {
          association: "player1",
          attributes: ["id", "name"]
        },
        {
          association: "player2",
          attributes: ["id", "name"]
        }
      ],
      attributes: ["id", "roundNumber", "player1Id", "player2Id", "scheduledDate", "scheduledTime", "venueId", "isScheduled", "status"]
    });

    // Determine actual bracket status based on match data and database state
    let actualBracketStatus = tournament.bracketStatus || "not_generated";

    console.log(`[getBracketStatus] Tournament ${tournamentId}:`, {
      bracketStatus: tournament.bracketStatus,
      bracketLockedAt: tournament.bracketLockedAt,
      totalMatches,
      scheduledMatches
    });

    // If matches exist, at minimum bracket is generated
    if (totalMatches > 0) {
      actualBracketStatus = "generated";

      // If bracket is locked, override status
      if (tournament.bracketLockedAt) {
        actualBracketStatus = "locked";
        console.log(`[getBracketStatus] Bracket is LOCKED - bracketLockedAt: ${tournament.bracketLockedAt}`);
      }

      // If all matches are scheduled, bracket is in scheduled state
      if (scheduledMatches === totalMatches && totalMatches > 0) {
        actualBracketStatus = "scheduled";
        console.log(`[getBracketStatus] Bracket is SCHEDULED - all ${totalMatches} matches scheduled`);
      }
    }

    console.log(`[getBracketStatus] Final status: ${actualBracketStatus}`);

    res.json({
      success: true,
      data: {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          bracketStatus: actualBracketStatus,
          bracketGeneratedAt: tournament.bracketGeneratedAt,
          bracketLockedAt: tournament.bracketLockedAt,
          allMatchesScheduledAt: tournament.allMatchesScheduledAt,
        },
        stats: {
          totalMatches,
          scheduledMatches,
          completedMatches,
          percentScheduled: totalMatches > 0 ? Math.round((scheduledMatches / totalMatches) * 100) : 0,
          workflowComplete: actualBracketStatus === "scheduled" && scheduledMatches === totalMatches
        },
        matches: (await attachBookingDatesToMatches(matches.map(m => ({
          id: m.id,
          roundNumber: m.roundNumber,
          player1: m.player1 ? { id: m.player1.id, name: m.player1.name } : null,
          player2: m.player2 ? { id: m.player2.id, name: m.player2.name } : null,
          scheduledDate: m.scheduledDate || fallbackFixtureDate,
          bookingDate: null,
          scheduledTime: m.scheduledTime,
          venueId: m.venueId,
          isScheduled: m.isScheduled,
          status: m.status
        })))).map((m) => ({
          ...m,
          bookingDate: m.bookingDate || null,
        }))
      }
    });
  } catch (error) {
    console.error("getBracketStatus error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + (error.message || error) });
  }
};

/**
 * GET /api/venues
 * Get venues available for an organization (for bracket scheduling)
 */
exports.getVenuesForOrganization = async (req, res) => {
  try {
    const { organizationId } = req.query;
    const { userId } = req.user;

    // Get the organization
    let organization;
    if (organizationId) {
      organization = await Organization.findByPk(organizationId);
    } else {
      organization = await Organization.findOne({ where: { userId } });
    }

    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Get all clubs for this organization
    const clubs = await Club.findAll({
      where: { organizationId: organization.id },
      attributes: ['id', 'name', 'venues']
    });

    // Extract venues from clubs
    const venues = [];
    clubs.forEach(club => {
      const venuesArray = Array.isArray(club.venues)
        ? club.venues
        : club.venues && typeof club.venues === 'object'
          ? Object.values(club.venues)
          : [];

      venuesArray.forEach(v => {
        const vid = v.id || v.venueId || `${club.id}:${v.name}`;
        const vname = v.name || v.venueName || `${club.name} - Venue`;
        venues.push({
          id: vid,
          name: vname,
          address: v.address || '',
          phoneNumber: v.phoneNumber || '',
          capacity: v.capacity || 0,
          clubId: club.id,
          clubName: club.name
        });
      });
    });

    res.json({
      success: true,
      data: venues
    });
  } catch (error) {
    console.error("getVenuesForOrganization error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + (error.message || error) });
  }
};

/**
 * GET /api/tournaments/venues/all
 * Return all venues from all organizers for tournament venue selection.
 */
exports.getAllVenues = async (req, res) => {
  try {
    const venues = await VenueOwner.findAll({
      where: {
        status: { [Op.in]: ["active", "pending"] },
      },
      attributes: ["id", "venueName", "address", "organizationId"],
      order: [["venueName", "ASC"]],
    });

    res.json({
      success: true,
      data: venues.map((v) => ({
        id: v.id,
        name: v.venueName || "Unnamed Venue",
        address: v.address || "",
        organizationId: v.organizationId,
      })),
    });
  } catch (error) {
    console.error("getAllVenues error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// FIXTURE GENERATION (PHASE 2)
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/fixtures/generate
 * Generate tournament fixtures based on format and seeding
 */
exports.generateFixtures = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { userId } = req.user;
    const { seedingMethod = 'random', rankings = [] } = req.body;

    // Find tournament and verify ownership
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || tournament.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "You do not have permission to manage this tournament" });
    }

    // Verify tournament is in registration_closed status
    if (tournament.status !== 'registration_closed') {
      return res.status(400).json({
        success: false,
        error: `Cannot generate fixtures for tournament in ${tournament.status} status. Tournament must be in registration_closed status.`
      });
    }

    // Get approved participants
    const participants = await TournamentParticipant.findAll({
      where: { tournamentId, status: 'approved' },
      attributes: ['id', 'playerId', 'seed', 'skillRating']
    });

    if (participants.length < tournament.minParticipants) {
      return res.status(400).json({
        success: false,
        error: `Insufficient participants to generate fixtures. Minimum ${tournament.minParticipants} required, ${participants.length} available.`
      });
    }

    // Validate seeding method
    const validMethods = ['random', 'ranking', 'manual'];
    if (!validMethods.includes(seedingMethod)) {
      return res.status(400).json({
        success: false,
        error: `Invalid seeding method. Must be one of: ${validMethods.join(', ')}`
      });
    }

    // Get tournament format
    let formatType = 'knockout'; // Default
    if (tournament.formatId) {
      const TournamentFormat = require('../models').TournamentFormat;
      const format = await TournamentFormat.findByPk(tournament.formatId);
      if (format && format.formatType) {
        formatType = format.formatType;
      }
    }

    // Generate fixtures
    const TournamentFixtureGenerator = require('../services/tournamentFixtureGenerator');
    const fixtureData = await TournamentFixtureGenerator.generateTournamentFixtures(
      tournament,
      participants,
      {
        method: seedingMethod,
        rankings
      }
    );

    // Begin transaction to create all matches
    const createdMatches = [];
    const TournamentRound = require('../models').TournamentRound;

    try {
      // Create tournament rounds
      for (const round of fixtureData.roundStructure) {
        const dbRound = await TournamentRound.create({
          tournamentId: tournament.id,
          roundNumber: round.roundNumber,
          roundName: round.roundName,
          totalMatches: round.matchCount,
          status: round.status
        });
      }

      // Create tournament matches
      for (const match of fixtureData.matches) {
        const schedulingConfig =
          TournamentSchedulingService.getSchedulingConfigFromTournament(tournament);
        const tournamentDeadline = resolveTournamentDeadline(tournament);
        const matchPayload = { ...match };
        if (schedulingConfig.enforceDeadlines && tournamentDeadline) {
          matchPayload.scheduledDeadline = tournamentDeadline;
        }
        const createdMatch = await TournamentMatch.create(matchPayload);
        createdMatches.push(createdMatch);
      }

      // Update tournament status to fixtures_generated
      await tournament.update({
        status: 'fixtures_generated',
        fixturesGeneratedAt: new Date()
      });

      // Log action
      await AuditLog.create({
        action: "tournament_fixtures_generated",
        entityType: "tournament",
        entityId: tournamentId,
        userId,
        notes: `Generated ${fixtureData.totalMatches} fixtures for tournament "${tournament.name}" using ${seedingMethod} seeding (${formatType})`,
      });

      res.json({
        success: true,
        message: `Tournament fixtures generated successfully (${fixtureData.totalMatches} matches in ${fixtureData.totalRounds} rounds)`,
        data: {
          tournament: {
            id: tournament.id,
            name: tournament.name,
            status: tournament.status,
            formatType: fixtureData.formatType
          },
          bracket: {
            totalMatches: fixtureData.totalMatches,
            totalRounds: fixtureData.totalRounds,
            roundStructure: fixtureData.roundStructure,
            seedingMethod,
            participantCount: participants.length
          }
        }
      });
    } catch (createError) {
      console.error('Error creating fixtures:', createError);
      throw createError;
    }
  } catch (error) {
    console.error("generateFixtures error:", error);
    res.status(500).json({ success: false, error: "Failed to generate fixtures: " + error.message });
  }
};

/**
 * POST /api/tournaments/:tournamentId/fixtures/lock
 * Lock/finalize the tournament bracket after all matches are scheduled
 */
exports.lockFixtures = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { userId } = req.user;

    // Find tournament and verify ownership
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || tournament.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "You do not have permission to manage this tournament" });
    }

    // Verify tournament is in fixtures_generated status
    if (tournament.status !== 'fixtures_generated') {
      return res.status(400).json({
        success: false,
        error: `Cannot lock fixtures for tournament in ${tournament.status} status.`
      });
    }

    // Check if all matches are scheduled
    const unscheduledMatches = await TournamentMatch.count({
      where: {
        tournamentId,
        isScheduled: false
      }
    });

    if (unscheduledMatches > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot lock bracket. ${unscheduledMatches} match(es) still need to be scheduled.`
      });
    }

    // Lock fixtures
    await tournament.update({
      fixturesLocked: true,
      fixtureLockedAt: new Date()
    });

    // Log action
    await AuditLog.create({
      action: "tournament_fixtures_locked",
      entityType: "tournament",
      entityId: tournamentId,
      userId,
      notes: `Bracket locked for tournament "${tournament.name}"`,
    });

    res.json({
      success: true,
      message: "Tournament bracket locked successfully",
      data: tournament
    });
  } catch (error) {
    console.error("lockFixtures error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/schedule
 * Schedule a tournament match and auto-create booking
 */
exports.scheduleMatch = async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const { userId } = req.user;
    const { scheduledDate, scheduledTime, venueId, tableNumber } = req.body;

    // Find tournament and verify ownership
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || tournament.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "You do not have permission to manage this tournament" });
    }

    // Find match
    const match = await TournamentMatch.findByPk(matchId);
    if (!match || match.tournamentId !== tournamentId) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    // Validate dates
    const schedDate = new Date(scheduledDate);
    const schedTime = scheduledTime || '14:00';

    if (schedDate < new Date()) {
      return res.status(400).json({ success: false, error: "Cannot schedule match in the past" });
    }

    const schedulingConfig =
      TournamentSchedulingService.getSchedulingConfigFromTournament(tournament);
    const tournamentDeadline = resolveTournamentDeadline(tournament);
    let updatedDeadline = null;
    if (schedulingConfig.enforceDeadlines) {
      updatedDeadline = tournamentDeadline || new Date(schedDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (schedDate > updatedDeadline) {
        return res.status(400).json({
          success: false,
          error: "Scheduled date/time exceeds the configured match deadline",
        });
      }
    }

    // Update match
    await match.update({
      scheduledDate: schedDate,
      scheduledTime: schedTime,
      venueId: venueId || tournament.venueId,
      tableNumber,
      isScheduled: true,
      scheduledDeadline: updatedDeadline,
    });

    // Auto-create booking
    const TournamentBookingIntegration = require('../services/tournamentBookingIntegration');
    const booking = await TournamentBookingIntegration.createBookingForMatch(match, {
      id: venueId || tournament.venueId,
      name: `Venue for ${tournament.name}`
    });

    // Log operation
    await AuditLog.create({
      action: "tournament_match_scheduled",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
      notes: `Match scheduled for ${schedDate.toISOString()} at ${schedTime}`
    });

    res.json({
      success: true,
      message: "Match scheduled successfully" + (booking ? " and booking created" : ""),
      data: {
        match,
        booking: booking || null
      }
    });
  } catch (error) {
    console.error('scheduleMatch error:', error);
    res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
};

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/book
 * Player-driven booking for flexible scheduling tournaments
 */
exports.bookTournamentMatch = async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const { bookingTime } = req.body || {};

    if (!bookingTime) {
      return res.status(400).json({ success: false, error: "bookingTime is required" });
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const schedulingConfig =
      TournamentSchedulingService.getSchedulingConfigFromTournament(tournament);
    if (!schedulingConfig.flexibleScheduling) {
      return res.status(403).json({
        success: false,
        error: "Flexible scheduling is disabled for this tournament",
      });
    }

    const match = await TournamentMatch.findOne({ where: { id: matchId, tournamentId } });
    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    const selected = new Date(bookingTime);
    if (Number.isNaN(selected.getTime())) {
      return res.status(400).json({ success: false, error: "Invalid bookingTime" });
    }

    const tournamentDeadline = resolveTournamentDeadline(tournament);
    const effectiveDeadline = tournamentDeadline || match.scheduledDeadline || null;

    if (
      schedulingConfig.enforceDeadlines &&
      effectiveDeadline &&
      selected > new Date(effectiveDeadline)
    ) {
      return res.status(400).json({
        success: false,
        error: "Booking time exceeds the match deadline",
      });
    }

    await match.update({
      scheduledDate: selected,
      isScheduled: true,
      status: "scheduled",
    });

    return res.json({
      success: true,
      message: "Match booked successfully",
      data: {
        id: match.id,
        bookingTime: match.scheduledDate,
        deadline: effectiveDeadline,
        schedulingConfig,
      },
    });
  } catch (error) {
    console.error("bookTournamentMatch error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * POST /api/tournaments/:tournamentId/schedule-all-matches
 * Schedule all unscheduled matches in a tournament
 */
exports.scheduleAllMatches = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { userId } = req.user;
    const { startDate, timeSlots } = req.body;

    // Find tournament and verify ownership
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || tournament.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "You do not have permission to manage this tournament" });
    }

    // Get unscheduled matches
    const unscheduledMatches = await TournamentMatch.findAll({
      where: { tournamentId, isScheduled: false }
    });

    if (unscheduledMatches.length === 0) {
      return res.json({ success: true, message: "All matches already scheduled", data: { scheduledCount: 0 } });
    }

    const schedulingConfig =
      TournamentSchedulingService.getSchedulingConfigFromTournament(tournament);
    const tournamentDeadline = resolveTournamentDeadline(tournament);

    // Simple scheduling: distribute matches across dates using time slots
    const slots = timeSlots || ['10:00', '14:00', '18:00'];
    let dayOffset = 0;
    let slotIndex = 0;
    const TournamentBookingIntegration = require('../services/tournamentBookingIntegration');
    const bookingsCreated = [];

    for (const match of unscheduledMatches) {
      const schedDate = new Date(startDate);
      schedDate.setDate(schedDate.getDate() + dayOffset);

      const schedTime = slots[slotIndex % slots.length];
      let scheduledDeadline = null;
      if (schedulingConfig.enforceDeadlines) {
        scheduledDeadline = tournamentDeadline || new Date(schedDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (schedDate > scheduledDeadline) {
          return res.status(400).json({
            success: false,
            error: "Bulk schedule exceeds configured match deadline",
          });
        }
      }

      await match.update({
        scheduledDate: schedDate,
        scheduledTime: schedTime,
        venueId: tournament.venueId,
        isScheduled: true,
        scheduledDeadline,
      });

      // Create booking
      const booking = await TournamentBookingIntegration.createBookingForMatch(match, {
        id: tournament.venueId
      });
      if (booking) bookingsCreated.push(booking);

      slotIndex++;
      if (slotIndex >= slots.length) {
        slotIndex = 0;
        dayOffset++;
      }
    }

    // Update tournament fixture lock status
    await tournament.update({ fixturesLocked: true, fixtureLockedAt: new Date() });

    // Log action
    await AuditLog.create({
      action: "tournament_matches_bulk_scheduled",
      entityType: "tournament",
      entityId: tournamentId,
      userId,
      notes: `Scheduled ${unscheduledMatches.length} matches with ${bookingsCreated.length} bookings created`
    });

    res.json({
      success: true,
      message: `Scheduled ${unscheduledMatches.length} matches and created ${bookingsCreated.length} bookings`,
      data: {
        scheduledMatches: unscheduledMatches.length,
        bookingsCreated: bookingsCreated.length
      }
    });
  } catch (error) {
    console.error('scheduleAllMatches error:', error);
    res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
};

// ============================================================================
// PLAYER TOURNAMENT RESULTS (for Results page integration)
// ============================================================================

/**
 * Get tournament matches awaiting player's confirmation
 * Used on Results page "Pending Actions" tab
 */
exports.getPlayerPendingTournamentResults = async (req, res) => {
  try {
    const { userId } = req.user;

    // Get player profiles for this user
    const player = await Player.findOne({ where: { userId } });
    if (!player) {
      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // Get matches awaiting this player's confirmation
    const matches = await TournamentMatch.findAll({
      where: {
        [Op.or]: [
          { player1Id: player.id, player1Confirmed: false, status: "pending_confirmation" },
          { player2Id: player.id, player2Confirmed: false, status: "pending_confirmation" }
        ]
      },
      include: [
        { model: Tournament, attributes: ['id', 'name', 'sport'] },
        { model: Player, as: 'player1', attributes: ['id', 'name', 'nickname'] },
        { model: Player, as: 'player2', attributes: ['id', 'name', 'nickname'] }
      ],
      order: [['reportedDate', 'DESC']]
    });

    return res.json({
      success: true,
      data: matches.map(m => ({
        id: m.id,
        matchType: "tournament",
        tournamentId: m.tournamentId,
        tournament: m.Tournament,
        player1: m.player1,
        player2: m.player2,
        player1Frames: m.player1FramesWon,
        player2Frames: m.player2FramesWon,
        player1RackWins: m.player1RackWins,
        player2RackWins: m.player2RackWins,
        player1Score: m.player1Score,
        player2Score: m.player2Score,
        snookerFrameDetails: m.player1FrameDetails, // Map from TournamentMatch frame details
        poolRackDetails: m.player1FrameDetails,     // Map from TournamentMatch frame details
        pokerResults: m.player1FrameDetails,        // Map from TournamentMatch frame details
        winner: m.winner,
        winnerId: m.winner === "player1" ? m.player1Id : m.player2Id,
        imageUrl: m.imageUrl,
        notes: m.notes,
        resultStatus: m.status === "pending_confirmation" ? "Pending" : m.status,
        sport: m.Tournament?.sport,
        submittedBy: m.reportedBy || m.player1Id,
        submittedAt: m.reportedDate,
        reportedDate: m.reportedDate
      }))
    });
  } catch (error) {
    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
    console.error('getPlayerPendingTournamentResults error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get tournament matches submitted by player
 * Used on Results page "My Submissions" tab
 */
exports.getPlayerSubmittedTournamentResults = async (req, res) => {
  try {
    const { userId } = req.user;

    // Get player profiles for this user
    const player = await Player.findOne({ where: { userId } });
    if (!player) {
      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // Get matches submitted by this player
    const matches = await TournamentMatch.findAll({
      where: {
        [Op.or]: [
          {
            player1Id: player.id,
            [Op.or]: [
              { player1Confirmed: true },
              { status: "pending_confirmation" }
            ]
          },
          {
            player2Id: player.id,
            [Op.or]: [
              { player2Confirmed: true },
              { status: "pending_confirmation" }
            ]
          }
        ]
      },
      include: [
        { model: Tournament, attributes: ['id', 'name', 'sport'] },
        { model: Player, as: 'player1', attributes: ['id', 'name', 'nickname'] },
        { model: Player, as: 'player2', attributes: ['id', 'name', 'nickname'] }
      ],
      order: [['reportedDate', 'DESC']]
    });

    return res.json({
      success: true,
      data: matches.map(m => ({
        id: m.id,
        matchType: "tournament",
        tournamentId: m.tournamentId,
        tournament: m.Tournament,
        player1: m.player1,
        player2: m.player2,
        player1Frames: m.player1FramesWon,
        player2Frames: m.player2FramesWon,
        player1RackWins: m.player1RackWins,
        player2RackWins: m.player2RackWins,
        player1Score: m.player1Score,
        player2Score: m.player2Score,
        snookerFrameDetails: m.player1FrameDetails, // Map from TournamentMatch frame details
        poolRackDetails: m.player1FrameDetails,     // Map from TournamentMatch frame details
        pokerResults: m.player1FrameDetails,        // Map from TournamentMatch frame details
        winner: m.winner,
        winnerId: m.winner === "player1" ? m.player1Id : m.player2Id,
        imageUrl: m.imageUrl,
        notes: m.notes,
        resultStatus: m.status === "pending_confirmation" ? "Pending" : (m.status === "completed" ? "Confirmed" : m.status),
        sport: m.Tournament?.sport,
        submittedBy: m.reportedBy || m.player1Id,
        submittedAt: m.reportedDate,
        reportedDate: m.reportedDate
      }))
    });
  } catch (error) {
    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
    console.error('getPlayerSubmittedTournamentResults error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Get completed tournament matches for player
 * Used on Results page "My Matches" tab
 */
exports.getPlayerCompletedTournamentResults = async (req, res) => {
  try {
    const { userId } = req.user;

    // Get player profiles for this user
    const player = await Player.findOne({ where: { userId } });
    if (!player) {
      res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    // Get completed matches
    const matches = await TournamentMatch.findAll({
      where: {
        [Op.or]: [
          { player1Id: player.id },
          { player2Id: player.id }
        ],
        status: "completed"
      },
      include: [
        { model: Tournament, attributes: ['id', 'name', 'sport'] },
        { model: Player, as: 'player1', attributes: ['id', 'name', 'nickname'] },
        { model: Player, as: 'player2', attributes: ['id', 'name', 'nickname'] }
      ],
      order: [['reportedDate', 'DESC']]
    });

    return res.json({
      success: true,
      data: matches.map(m => ({
        id: m.id,
        matchType: "tournament",
        tournamentId: m.tournamentId,
        tournament: m.Tournament,
        player1: m.player1,
        player2: m.player2,
        player1Frames: m.player1FramesWon,
        player2Frames: m.player2FramesWon,
        player1RackWins: m.player1RackWins,
        player2RackWins: m.player2RackWins,
        player1Score: m.player1Score,
        player2Score: m.player2Score,
        snookerFrameDetails: m.player1FrameDetails, // Map from TournamentMatch frame details
        poolRackDetails: m.player1FrameDetails,     // Map from TournamentMatch frame details
        pokerResults: m.player1FrameDetails,        // Map from TournamentMatch frame details
        winner: m.winner,
        winnerId: m.winner === "player1" ? m.player1Id : m.player2Id,
        imageUrl: m.imageUrl,
        notes: m.notes,
        resultStatus: "Confirmed",
        sport: m.Tournament?.sport,
        submittedBy: m.reportedBy || m.player1Id,
        submittedAt: m.reportedDate,
        reportedDate: m.reportedDate
      }))
    });
  } catch (error) {
    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
    console.error('getPlayerCompletedTournamentResults error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ============================================================================
// WITHDRAWAL, CANCELLATION & AUTO-FORFEIT
// ============================================================================

/**
 * Get withdrawal info for a player before they withdraw.
 * Returns current stage, all configured rules, and the specific rule that would apply.
 * GET /api/tournaments/:tournamentId/withdrawal-info
 */
exports.getWithdrawalInfo = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    // Check player is a participant
    const player = await Player.findOne({ where: { userId } });
    if (!player) {
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    const participant = await TournamentParticipant.findOne({
      where: { tournamentId, playerId: player.id, status: "approved" },
    });
    if (!participant) {
      return res.status(400).json({ success: false, error: "You are not an approved participant of this tournament" });
    }

    // Detect stage using the same logic as WithdrawalHandler.processWithdrawal
    const playedOrLiveMatch = await TournamentMatch.findOne({
      where: {
        tournamentId,
        status: { [Op.in]: ["completed", "in_progress"] },
      },
    });

    let stage = "before_start";
    if (tournament.status === "in_progress" || playedOrLiveMatch) {
      const format = await TournamentFormat.findOne({ where: { tournamentId } });
      if (format && format.type === "groups_knockout") {
        const knockoutMatch = await TournamentMatch.findOne({
          where: {
            tournamentId,
            roundType: { [Op.notIn]: ["group_stage"] },
            [Op.or]: [{ player1Id: player.id }, { player2Id: player.id }],
          },
        });
        stage = knockoutMatch ? "during_knockout" : "during_group";
      } else if (format && format.type === "knockout") {
        stage = "during_knockout";
      } else {
        stage = "during_group";
      }
    }

    // Resolve the configured rules (same normalizer used by WithdrawalHandler)
    // NOTE: withdrawalRules is stored as JSON string in database, must parse first!
    let rawRules = {};
    if (tournament.withdrawalRules) {
      try {
        rawRules = typeof tournament.withdrawalRules === "string"
          ? JSON.parse(tournament.withdrawalRules)
          : tournament.withdrawalRules;
      } catch (e) {
        console.warn(`[getWithdrawalInfo] Failed to parse withdrawalRules for tournament ${tournamentId}:`, e.message);
        rawRules = {};
      }
    }

    const beforeStartRule = (() => {
      const v = String(rawRules.beforeStart ?? rawRules.before_start ?? "remove").toLowerCase().trim();
      return v === "forfeit" ? "forfeit" : "remove";
    })();
    const groupStageRule = (() => {
      const raw = rawRules.duringGroup || rawRules.groupStage || "50_percent_rule";
      if (raw === "remove_all" || raw === "remove") return "remove_all";
      if (raw === "walkover") return "walkover";
      return "50_percent_rule";
    })();
    const knockoutRule = (() => {
      const raw = rawRules.duringKnockout || rawRules.knockout || "walkover";
      return raw === "void" ? "void" : "walkover";
    })();

    const applicableRule =
      stage === "before_start" ? beforeStartRule :
      stage === "during_group" ? groupStageRule :
      knockoutRule;

    const STAGE_LABELS = {
      before_start: "Before Tournament Start",
      during_group: "Group Stage",
      during_knockout: "Knockout Stage",
    };

    const RULE_DESCRIPTIONS = {
      remove: {
        label: "Remove & Adjust Bracket",
        bullets: [
          "You will be removed from the tournament completely",
          "The bracket will be recalculated",
          "A BYE may be added if the player count becomes odd",
          "Scheduled matches will be updated accordingly",
        ],
      },
      forfeit: {
        label: "Mark as Forfeit",
        bullets: [
          "You remain on the draw sheet",
          "All your scheduled matches will be marked as losses",
          "Your opponents will receive automatic wins",
          "Your results will count towards standings",
        ],
      },
      remove_all: {
        label: "Remove All Matches",
        bullets: [
          "All your group stage matches will be voided",
          "Your results will be deleted from the standings",
          "Opponents' match records against you will also be removed",
        ],
      },
      "50_percent_rule": {
        label: "50% Rule (Recommended)",
        bullets: [
          "If you have played fewer than 50% of your matches: all your results will be voided",
          "If you have played 50% or more: completed results are kept; remaining matches become walkover losses for your opponents",
        ],
      },
      walkover: {
        label: "Walkover to Opponent",
        bullets: [
          "All remaining matches will be forfeited",
          "Your opponents automatically win those matches",
          "Opponents advance to the next round where applicable",
        ],
      },
      void: {
        label: "Void Match",
        bullets: [
          "The match will be cancelled and marked as void",
          "No automatic winner is assigned",
          "The organiser will decide the outcome manually",
        ],
      },
    };

    res.json({
      success: true,
      data: {
        stage,
        stageLabel: STAGE_LABELS[stage] || stage,
        tournamentStatus: tournament.status,
        rules: {
          beforeStart: beforeStartRule,
          groupStage: groupStageRule,
          knockout: knockoutRule,
        },
        applicableRule,
        ruleDetail: RULE_DESCRIPTIONS[applicableRule] || { label: applicableRule, bullets: [] },
      },
    });
  } catch (error) {
    console.error("getWithdrawalInfo error:", error);
    res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Player withdraws from a tournament
 */
exports.withdrawPlayer = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { reason } = req.body;

    // Find the player for this user
    const player = await Player.findOne({ where: { userId } });
    if (!player) {
      return res.status(404).json({ success: false, error: "Player profile not found" });
    }

    const result = await WithdrawalHandler.processWithdrawal(tournamentId, player.id, reason || "", {
      actorUserId: userId,
    });

    const tournament = await Tournament.findByPk(tournamentId);
    if (tournament && Array.isArray(result.walkoverMatchIds) && result.walkoverMatchIds.length > 0) {
      for (const mid of result.walkoverMatchIds) {
        const m = await TournamentMatch.findByPk(mid);
        if (!m) continue;

        // SKIP VOIDED MATCHES - they don't contribute to stats or scoring
        if (m.status === "voided") {
          console.log(`[withdrawPlayer] Skipping stats update for voided match ${mid}`);
          continue;
        }

        // Only update stats for actual completed/walkover matches
        if (m.status !== "completed") continue;

        try {
          await exports._updatePlayerStatisticsAfterMatch(m, tournament, null);
        } catch (statsErr) {
          console.warn("[withdrawPlayer] stats update skipped:", statsErr?.message || statsErr);
        }
      }
    }

    if (tournament && Array.isArray(result.roundsToProgress) && result.roundsToProgress.length > 0) {
      for (const rn of result.roundsToProgress) {
        try {
          console.log(`[withdrawPlayer] Checking round ${rn} for progression (after walkover/removal)`);
          await exports._checkAndProgressRound(tournamentId, rn, null);
        } catch (progErr) {
          console.error("[withdrawPlayer] round progression error:", progErr?.message || progErr);
        }
      }
    }

    // After withdrawal, verify that next-round fixtures are generated for knockout tournaments
    // This is especially important when a round completes due to withdrawals creating walkovers
    // SKIP fixture generation if using VOID rule (matches don't count, no progression)
    const hasVoidMatches = result.voidedMatches > 0;
    if (!hasVoidMatches) {
      try {
        const format = await TournamentFormat.findOne({ where: { tournamentId } });
        if (format && (format.type === "knockout" || format.type === "groups_knockout")) {
          console.log(`[withdrawPlayer] Checking if next-round fixtures need generation for ${format.type} format`);

        // Get current tournament state to see what round we're on
        const freshTournament = await Tournament.findByPk(tournamentId);
        const currentRound = Number(freshTournament.currentRound || 1);

        // Check if current round has all matches completed (excluding byes)
        const currentRoundMatches = await TournamentMatch.findAll({
          where: {
            tournamentId,
            roundNumber: currentRound,
            player2Id: { [Op.ne]: null }, // Exclude byes
          },
        });

        if (currentRoundMatches.length > 0) {
          const allCompleted = currentRoundMatches.every(m =>
            m.status === "completed" ||
            (m.status === "voided" && m.adminOverride === true)
          );
          if (allCompleted) {
            console.log(`[withdrawPlayer] Round ${currentRound} is fully completed. Checking if next round needs generation.`);

            // Check if next round exists
            const nextRound = await TournamentRound.findOne({
              where: { tournamentId, roundNumber: currentRound + 1 },
            });

            if (!nextRound) {
              console.log(`[withdrawPlayer] Next round (${currentRound + 1}) does not exist. Attempting to generate...`);
              try {
                await exports._generateNextKnockoutRound(tournamentId, currentRound + 1, null);
                const generatedRound = await TournamentRound.findOne({
                  where: { tournamentId, roundNumber: currentRound + 1 },
                });

                if (generatedRound) {
                  // Update tournament to next round
                  await freshTournament.update({ currentRound: currentRound + 1 });

                  if (generatedRound.status === "not_started") {
                    await generatedRound.update({ status: "in_progress" });
                  }

                  console.log(`[withdrawPlayer] Successfully generated round ${currentRound + 1} after withdrawal`);
                }
              } catch (genErr) {
                console.error(`[withdrawPlayer] Failed to generate next round:`, genErr?.message || genErr);
              }
            } else {
              console.log(`[withdrawPlayer] Next round already exists (round ${currentRound + 1}). Status: ${nextRound.status}`);

              // Ensure next round is in progress if it has matches
              const nextRoundMatches = await TournamentMatch.count({
                where: { tournamentId, roundNumber: currentRound + 1 },
              });

              if (nextRoundMatches > 0 && nextRound.status === "not_started") {
                console.log(`[withdrawPlayer] Updating round ${currentRound + 1} status to in_progress`);
                await nextRound.update({ status: "in_progress" });
                await freshTournament.update({ currentRound: currentRound + 1 });
              }
            }
          }
        }
      }
      } catch (generationErr) {
        console.error("[withdrawPlayer] Error checking next-round fixture generation:", generationErr?.message || generationErr);
      }
    } else {
      console.log(`[withdrawPlayer] Skipping fixture generation (${result.voidedMatches} voided matches - no progression)`);
    }

    res.json({
      success: true,
      data: result,
      message: `Withdrawal processed (${result.stage})`,
    });
  } catch (error) {
    console.error("withdrawPlayer error:", error);
    const statusCode =
      error.message.includes("not found") ||
      error.message.includes("not an approved") ||
      error.message.includes("not allowed")
        ? 400
        : 500;
    res.status(statusCode).json({ success: false, error: error.message || "Internal server error" });
  }
};

/**
 * Cancel a tournament (organization only)
 * If in progress: award ranking points only for completed rounds.
 * If final was not played: cap at runner-up points (no 1st place).
 * Voids incomplete round matches.
 */
exports.cancelTournament = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { reason } = req.body;

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const tournament = await Tournament.findOne({
      where: { id: tournamentId, organizationId: organization.id },
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found or access denied" });
    }

    if (tournament.status === "completed" || tournament.status === "cancelled") {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel tournament in '${tournament.status}' status`,
      });
    }

    let voidedCount = 0;
    let partialPointsAwarded = 0;
    const wasInProgress = tournament.status === "in_progress";

    // Void all pending/scheduled/in_progress matches
    await TournamentMatch.update(
      { status: "voided", walkoverReason: `Tournament cancelled: ${reason || "N/A"}` },
      { where: { tournamentId, status: { [Op.in]: ["scheduled", "pending_confirmation", "in_progress"] } } }
    );

    if (wasInProgress && tournament.ranked) {
      // Determine which rounds are fully completed
      const rounds = await TournamentRound.findAll({
        where: { tournamentId },
        order: [["roundNumber", "ASC"]],
      });

      const completedRounds = [];
      let lastCompletedRound = 0;

      for (const round of rounds) {
        const totalInRound = await TournamentMatch.count({
          where: { tournamentId, roundNumber: round.roundNumber, player2Id: { [Op.ne]: null } },
        });
        const completedInRound = await TournamentMatch.count({
          where: { tournamentId, roundNumber: round.roundNumber, status: "completed", player2Id: { [Op.ne]: null } },
        });

        if (totalInRound > 0 && completedInRound === totalInRound) {
          completedRounds.push(round.roundNumber);
          lastCompletedRound = round.roundNumber;
        }
      }

      // If any ranking points were already awarded, void them first
      voidedCount = await RankingEngine.voidTournamentPoints(
        tournamentId,
        reason || "Tournament cancelled — recalculating partial"
      );

      // Award partial ranking points if there were completed rounds
      if (completedRounds.length > 0) {
        const format = await TournamentFormat.findOne({ where: { tournamentId } });
        const totalRounds = rounds.length;
        const isFinalComplete = lastCompletedRound === totalRounds;

        const participants = await TournamentParticipant.findAll({
          where: { tournamentId, status: { [Op.in]: ["approved", "withdrawn"] } },
        });

        const completedMatches = await TournamentMatch.findAll({
          where: { tournamentId, status: "completed" },
        });

        // Calculate finishing positions based on completed data
        const result = await RankingEngine.awardRankingPoints(tournament, participants, completedMatches);

        for (const entry of result.history) {
          // Cap at runner-up if final wasn't played
          if (!isFinalComplete && entry.finishingPosition === 1) {
            const runnerUpPoints = RankingEngine.calculatePoints(tournament.tier, 2);
            entry.pointsAwarded = Math.min(entry.pointsAwarded, runnerUpPoints);
            entry.currentPoints = entry.pointsAwarded;
          }

          await RankingPointsHistory.findOrCreate({
            where: { dedupeKey: entry.dedupeKey || null },
            defaults: entry,
          });
          partialPointsAwarded++;
        }
      }
    } else if (tournament.ranked) {
      // Pre-tournament cancellation — void any existing points
      voidedCount = await RankingEngine.voidTournamentPoints(
        tournamentId,
        reason || "Tournament cancelled"
      );
    }

    await tournament.update({
      status: "cancelled",
      notes: `Cancelled: ${reason || "No reason provided"}`,
    });

    await AuditLog.create({
      action: "tournament_cancelled",
      entityType: "tournament",
      entityId: tournamentId,
      userId,
      notes: `Tournament cancelled. Reason: ${reason || "N/A"}. Voided ${voidedCount} records. Partial points awarded: ${partialPointsAwarded}.`,
    });

    res.json({
      success: true,
      data: { id: tournamentId, status: "cancelled", rankingPointsVoided: voidedCount, partialPointsAwarded },
      message: "Tournament cancelled successfully",
    });
  } catch (error) {
    console.error("cancelTournament error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Auto-forfeit overdue matches (organization or cron job)
 */
exports.autoForfeitOverdueMatches = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const schedulingConfig =
      TournamentSchedulingService.getSchedulingConfigFromTournament(tournament);
    if (!schedulingConfig.autoForfeit) {
      return res.status(400).json({ success: false, error: "Auto-forfeit is not enabled for this tournament" });
    }

    const { updated: forfeitedCount } =
      await TournamentSchedulingService.applyAutoForfeitForTournament(tournamentId);

    await AuditLog.create({
      action: "auto_forfeit_overdue",
      entityType: "tournament",
      entityId: tournamentId,
      notes: `Auto-forfeited ${forfeitedCount} overdue matches`,
    });

    res.json({
      success: true,
      data: { forfeitedCount },
      message: `${forfeitedCount} overdue matches forfeited`,
    });
  } catch (error) {
    console.error("autoForfeitOverdueMatches error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// LADDER FORMAT ENDPOINTS
// ============================================================================

/**
 * GET /api/tournaments/:tournamentId/ladder/standings
 * Get current ladder standings
 */
exports.getLadderStandings = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const format = await TournamentFormat.findOne({ where: { tournamentId } });
    if (!format || format.type !== "ladder") {
      return res.status(400).json({ success: false, error: "Tournament is not a ladder format" });
    }

    const participants = await TournamentParticipant.findAll({
      where: { tournamentId, status: { [Op.in]: ["approved", "withdrawn"] } },
      include: [{ association: "player", attributes: ["id", "firstName", "lastName", "skillLevel"] }],
      order: [["ladderPosition", "ASC"]],
    });

    const standings = participants
      .filter(p => p.ladderPosition != null)
      .map(p => ({
        position: p.ladderPosition,
        playerId: p.playerId,
        playerName: p.player ? `${p.player.firstName} ${p.player.lastName}` : "Unknown",
        status: p.status,
        lastChallengeDate: p.lastChallengeDate,
      }));

    res.json({ success: true, data: { standings, challengeRange: format.challengeRange || 2, challengeCooldown: format.challengeCooldown || 24 } });
  } catch (error) {
    console.error("getLadderStandings error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * POST /api/tournaments/:tournamentId/ladder/challenge
 * Create a ladder challenge match
 */
exports.createLadderChallenge = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { targetPlayerId } = req.body;

    if (!targetPlayerId) {
      return res.status(400).json({ success: false, error: "targetPlayerId is required" });
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament || tournament.status !== "in_progress") {
      return res.status(400).json({ success: false, error: "Tournament not found or not in progress" });
    }

    const format = await TournamentFormat.findOne({ where: { tournamentId } });
    if (!format || format.type !== "ladder") {
      return res.status(400).json({ success: false, error: "Tournament is not a ladder format" });
    }

    // Identify the challenger
    const challengerPlayer = await Player.findOne({ where: { userId } });
    if (!challengerPlayer) {
      return res.status(403).json({ success: false, error: "Player not found" });
    }

    const challenger = await TournamentParticipant.findOne({
      where: { tournamentId, playerId: challengerPlayer.id, status: "approved" },
    });
    if (!challenger) {
      return res.status(403).json({ success: false, error: "You are not an approved participant in this tournament" });
    }

    const target = await TournamentParticipant.findOne({
      where: { tournamentId, playerId: targetPlayerId, status: "approved" },
    });
    if (!target) {
      return res.status(400).json({ success: false, error: "Target player is not an approved participant" });
    }

    // Check for existing pending challenge between these players
    const existingChallenge = await TournamentMatch.findOne({
      where: {
        tournamentId,
        roundType: "ladder_challenge",
        status: { [Op.in]: ["scheduled", "in_progress"] },
        [Op.or]: [
          { player1Id: challengerPlayer.id, player2Id: targetPlayerId },
          { player1Id: targetPlayerId, player2Id: challengerPlayer.id },
        ],
      },
    });
    if (existingChallenge) {
      return res.status(409).json({ success: false, error: "A pending challenge already exists between these players" });
    }

    // Validate challenge (range + cooldown)
    const validation = BracketGenerator.validateLadderChallenge(challenger, target, format);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.reason });
    }

    // Get bestOf from format
    const scoringRules = await TournamentScoringRules.findOne({ where: { tournamentId } });
    const bestOf = scoringRules?.bestOfFrames || format.roundFormats?.["1"] || 5;

    // Create the challenge match
    const match = await TournamentMatch.create({
      tournamentId,
      roundNumber: 0, // ladder challenges don't belong to a numbered round
      roundType: "ladder_challenge",
      player1Id: challengerPlayer.id, // challenger is always player1
      player2Id: targetPlayerId,
      status: "scheduled",
      bestOfFrames: bestOf,
    });

    // Update challenger's last challenge date
    await challenger.update({ lastChallengeDate: new Date() });

    await AuditLog.create({
      action: "ladder_challenge_created",
      entityType: "tournament_match",
      entityId: match.id,
      notes: `Player ${challengerPlayer.id} (pos ${challenger.ladderPosition}) challenged player ${targetPlayerId} (pos ${target.ladderPosition})`,
    });

    res.status(201).json({
      success: true,
      message: "Challenge created successfully",
      data: {
        matchId: match.id,
        challenger: { playerId: challengerPlayer.id, position: challenger.ladderPosition },
        target: { playerId: targetPlayerId, position: target.ladderPosition },
      },
    });
  } catch (error) {
    console.error("createLadderChallenge error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// RANKINGS ENDPOINTS
// ============================================================================

/**
 * PATCH /api/tournaments/:tournamentId/official-ranking
 * Platform owner sets official ranking status for a tournament.
 */
exports.setTournamentOfficialRankingStatus = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId } = req.params;
    const { isOfficialRanking, reason = "", tier } = req.body || {};

    if (typeof isOfficialRanking !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "isOfficialRanking must be a boolean",
      });
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const updateData = {
      isOfficialRanking,
      officialApprovedBy: isOfficialRanking ? userId : null,
      officialApprovedAt: isOfficialRanking ? new Date() : null,
    };

    if (tier && ["local", "county", "regional", "national", "international"].includes(String(tier))) {
      updateData.tier = String(tier);
    }

    await tournament.update(updateData);

    await AuditLog.create({
      userId,
      action: "tournament_official_ranking_updated",
      entityType: "tournament",
      entityId: tournament.id,
      notes: reason || null,
      newValue: updateData,
    });

    res.json({
      success: true,
      data: tournament,
      message: "Official ranking status updated",
    });
  } catch (error) {
    console.error("setTournamentOfficialRankingStatus error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * POST /api/tournaments/rankings/override
 * Platform owner can append manual point overrides with full audit metadata.
 */
exports.applyRankingOverride = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      playerId,
      seasonId,
      sport,
      pointsDelta,
      overrideReason,
      tournamentId = null,
      tier = "local",
    } = req.body || {};

    if (!playerId || !seasonId || !sport) {
      return res.status(400).json({
        success: false,
        error: "playerId, seasonId, and sport are required",
      });
    }

    const normalizedSport = String(sport).toLowerCase();
    if (!["snooker", "pool", "pooker"].includes(normalizedSport)) {
      return res.status(400).json({ success: false, error: "Invalid sport" });
    }

    const numericDelta = Number(pointsDelta);
    if (!Number.isFinite(numericDelta) || numericDelta === 0) {
      return res.status(400).json({
        success: false,
        error: "pointsDelta must be a non-zero number",
      });
    }

    if (!overrideReason || String(overrideReason).trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: "overrideReason is required",
      });
    }

    const dedupeKey = RankingSnapshotService.buildOverrideDedupeKey({
      playerId,
      seasonId,
      sport: normalizedSport,
      reason: overrideReason,
      createdBy: userId,
      when: Date.now(),
    });

    const logRow = await RankingPointsHistory.create({
      playerId,
      tournamentId,
      seasonId,
      sport: normalizedSport,
      tier: ["local", "county", "regional", "national", "international"].includes(String(tier)) ? tier : "local",
      eventType: "override",
      dedupeKey,
      pointsAwarded: numericDelta,
      pointsAdjustment: 0,
      currentPoints: numericDelta,
      roundReached: "admin_override",
      finishingRound: "admin_override",
      overrideBy: userId,
      overrideReason: String(overrideReason).trim(),
      isOfficialTournament: true,
      isActive: true,
    });

    await AuditLog.create({
      userId,
      action: "ranking_override_created",
      entityType: "ranking_points_history",
      entityId: logRow.id,
      notes: overrideReason,
      newValue: {
        playerId,
        seasonId,
        sport: normalizedSport,
        pointsDelta: numericDelta,
      },
    });

    // NEW: Create player notification for override
    try {
      const Notification = require("../models").Notification;
      await Notification.create({
        userId: playerId,  // Notify the affected player
        type: "ranking_override",
        title: "Ranking Points Adjustment",
        message: `Your ${normalizedSport} ranking has been adjusted by ${numericDelta > 0 ? '+' : ''}${numericDelta} points.`,
        relatedId: logRow.id,
        metadata: {
          pointsDelta: numericDelta,
          reason: String(overrideReason).trim(),
          sport: normalizedSport,
          appliedAt: new Date(),
        },
        isRead: false,
      });
    } catch (notifError) {
      console.warn("Failed to create player notification for override:", notifError.message);
      // Don't fail the whole request if notification fails
    }

    const rebuild = await RankingSnapshotService.rebuildSnapshot({
      seasonId,
      sport: normalizedSport,
    });

    res.json({
      success: true,
      data: {
        override: logRow,
        snapshot: rebuild?.data || null,
      },
      message: "Ranking override logged and snapshot rebuilt",
    });
  } catch (error) {
    console.error("applyRankingOverride error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * POST /api/tournaments/rankings/rebuild
 * Manual snapshot rebuild endpoint for super admin.
 */
exports.rebuildSeasonRankingSnapshot = async (req, res) => {
  try {
    const { seasonId, sport } = req.body || {};
    const result = await RankingSnapshotService.rebuildSnapshot({ seasonId, sport });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Failed to rebuild snapshot" });
    }

    res.json({
      success: true,
      data: result.data,
      message: "Ranking snapshot rebuilt",
    });
  } catch (error) {
    console.error("rebuildSeasonRankingSnapshot error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * GET /api/rankings
 * Return latest precomputed ranking snapshot (no real-time aggregation).
 */
exports.getRankings = async (req, res) => {
  try {
    const { sport, seasonId, limit = 100, offset = 0, scope = "national", scopeValue = null } = req.query;

    let snapshotResult;

    // NEW: Use rolling 12-month rankings if seasonId not provided
    if (!seasonId) {
      snapshotResult = await RankingSnapshotService.getRolling12MonthRankings({
        sport: sport || undefined,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        scope: scope || "national",
        scopeValue: scopeValue || null,
      });
    } else {
      // Legacy: Use season-based snapshot if seasonId provided
      snapshotResult = await RankingSnapshotService.getLatestSnapshot({
        seasonId: seasonId || undefined,
        sport: sport || undefined,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });
    }

    if (!snapshotResult.success) {
      return res.status(400).json({ success: false, error: snapshotResult.error || "Could not load rankings" });
    }

    const rankings = (snapshotResult.data.rankings || []).map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName || "Unknown",
      nickname: row.nickname || row.playerName || "Unknown",
      rank: row.rank,
      totalPoints: Number(row.totalPoints || 0),
      tournamentsCount: row.tournamentsCount || 0,
      countyPoints: 0,
      regionalPoints: 0,
      nationalPoints: 0,
      tournamentWins: row.stageHistory?.filter((s) => s.stage === "Winner").length || 0,
      matchesWon: 0,
      matchesPlayed: 0,
      framesWon: 0,
      framesLost: 0,
      sport: snapshotResult.data.sport,
      seasonId: snapshotResult.data.seasonId,
      rankingStatus: row.rankingStatus,  // NEW: include ranking status (confirmed/provisional)
    }));

    res.json({
      success: true,
      data: {
        rankings,
        total: snapshotResult.data.total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        calculatedAt: snapshotResult.data.calculatedAt,
        snapshotBatchId: snapshotResult.data.snapshotBatchId,
        seasonId: snapshotResult.data.seasonId,
        sport: snapshotResult.data.sport,
        rankingWindow: snapshotResult.data.rankingWindow || "season",  // NEW: indicate window type
        scope: scope || "national",  // NEW: include scope in response
        includesProvisional: snapshotResult.data.includesProvisional,  // NEW: indicate if provisional points included
      },
    });
  } catch (error) {
    console.error("getRankings error:", error);
    console.error("Error details:", error.message, error.stack);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/rankings/:playerId/history
 * Get a player's ranking point history (decay fields suppressed while decay is disabled)
 */
exports.getRankingHistory = async (req, res) => {
  try {
    const { playerId } = req.params;
    const { sport, seasonId } = req.query;

    const where = { playerId };
    if (sport) where.sport = String(sport).toLowerCase();
    if (seasonId) where.seasonId = seasonId;

    const history = await RankingPointsHistory.findAll({
      where,
      attributes: [
        'id',
        'playerId',
        'tournamentId',
        'seasonId',
        'sport',
        'tier',
        'eventType',
        'pointsAwarded',
        'pointsAdjustment',
        'currentPoints',
        'decayPercentage',
        'finishingPosition',
        'finishingRound',
        'roundReached',
        'overrideBy',
        'overrideReason',
        'isOfficialTournament',
        'isActive',
        'expiresAt',
        'createdAt'
      ],
      include: [{ model: Tournament, as: "tournament", attributes: ["id", "name", "tier", "startDate"] }],
      order: [["createdAt", "DESC"]],
    });

    const totalFromLogs = history.reduce((sum, row) => {
      if (!row.isActive) return sum;
      return sum + Number(row.pointsAwarded || 0) + Number(row.pointsAdjustment || 0);
    }, 0);

    res.json({
      success: true,
      data: {
        playerId,
        currentTotal: totalFromLogs,
        history: history.map(h => ({
          id: h.id,
          tournamentId: h.tournamentId,
          seasonId: h.seasonId,
          sport: h.sport,
          tournamentName: h.tournament?.name,
          tier: h.tier,
          eventType: h.eventType,
          pointsAwarded: h.pointsAwarded,
          pointsAdjustment: h.pointsAdjustment,
          // Ranking Points Decay disabled temporarily — active rows show full award; inactive unchanged
          currentPoints: h.isActive ? h.pointsAwarded : h.currentPoints,
          // decayPercentage: h.decayPercentage,
          decayPercentage: null,
          finishingPosition: h.finishingPosition,
          finishingRound: h.finishingRound,
          roundReached: h.roundReached,
          overrideBy: h.overrideBy,
          overrideReason: h.overrideReason,
          isOfficialTournament: h.isOfficialTournament,
          isActive: h.isActive,
          expiresAt: h.expiresAt,
          awardedDate: h.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("getRankingHistory error:", error);
    console.error("Error details:", error.message, error.stack);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/tournaments/:tournamentId/ranking-config
 * NEW: Get tournament's ranking configuration and point structure
 * Shows how ranking points will be calculated for the tournament
 */
exports.getTournamentRankingConfig = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findOne({
      where: { id: tournamentId },
      attributes: ['id', 'name', 'sport', 'tier', 'ranked', 'status', 'minPlayersForRankingPoints']
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    if (!tournament.ranked) {
      return res.json({
        success: true,
        data: {
          tournamentId,
          name: tournament.name,
          ranked: false,
          message: "This tournament is not configured for ranking points"
        }
      });
    }

    // Get the 3-tier configuration
    const rankingPresetServiceModule = require('../services/rankingPresetService');
    const newTierLevel = rankingPresetServiceModule.mapTier(tournament.tier);
    const tierPresets = rankingPresetServiceModule.getTier3Presets(newTierLevel);
    const minimumPlayers = rankingPresetServiceModule.getTier3MinimumPlayers(newTierLevel);

    res.json({
      success: true,
      data: {
        tournamentId,
        name: tournament.name,
        sport: tournament.sport,
        status: tournament.status,
        ranked: true,
        rankingConfiguration: {
          tierName: tournament.tier,
          mappedTierLevel: newTierLevel,
          minimumPlayersForFullPoints: minimumPlayers,
          minimumPlayersFor50Percent: Math.ceil(minimumPlayers / 2),
          pointStructure: {
            description: "Stage-based awards with configurable weighting",
            fullPoints: tierPresets,
            halfPoints: Object.fromEntries(
              Object.entries(tierPresets).map(([stage, points]) => [stage, Math.floor(points * 0.5)])
            ),
            notes: "Below-threshold tournaments receive 50% of configured points"
          },
          minPlayersForRankingPoints: tournament.minPlayersForRankingPoints || minimumPlayers
        },
        hints: {
          "tier_mapping": "5-tier (local/county/regional/national/international) → 3-tier (tier3/tier2/tier1)",
          "weighting": "Tournaments with < minimumPlayersForFullPoints participants receive 50% points",
          "stages": "Winner, Runner-Up, Semi-Final, Quarter-Final, Last16, Last32 based on finishing position",
          "calculation": "Points = stageBasePoints × weightPercentage (100% or 50%)"
        }
      }
    });
  } catch (error) {
    console.error("getTournamentRankingConfig error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * GET /api/rankings/form/:sport
 * NEW: Get form rankings (last 10 tournaments in last 12 months)
 */
exports.getFormRankings = async (req, res) => {
  try {
    const { sport } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const normalizedSport = String(sport || "").toLowerCase();
    if (!["snooker", "pool", "pooker"].includes(normalizedSport)) {
      return res.status(400).json({ success: false, error: "Invalid sport" });
    }

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    // Get last 10 tournaments per player in rolling 12 months
    const { Op } = require("sequelize");
    const logs = await RankingPointsHistory.findAll({
      where: {
        sport: normalizedSport,
        isActive: true,
        eventType: "award",
        createdAt: { [Op.gte]: twelveMonthsAgo },
      },
      attributes: ["playerId", "tournamentId", "pointsAwarded", "createdAt"],
      order: [["createdAt", "DESC"]],
      raw: true,
    });

    // Group by player and limit to last 10 tournaments
    const playerFormPoints = new Map();
    const playerTournaments = new Map();

    for (const log of logs) {
      if (!playerTournaments.has(log.playerId)) {
        playerTournaments.set(log.playerId, []);
      }

      const tournaments = playerTournaments.get(log.playerId);
      if (tournaments.length < 10 && !tournaments.includes(log.tournamentId)) {
        tournaments.push(log.tournamentId);
        const currentPoints = playerFormPoints.get(log.playerId) || 0;
        playerFormPoints.set(log.playerId, currentPoints + Number(log.pointsAwarded || 0));
      }
    }

    // Build rankings
    const entries = [...playerFormPoints.entries()]
      .map(([playerId, totalPoints]) => ({
        playerId,
        formPoints: totalPoints,
        tournamentCount: (playerTournaments.get(playerId) || []).length,
      }))
      .sort((a, b) => b.formPoints - a.formPoints);

    // Add ranks
    const rankedEntries = entries.map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));

    // Fetch player details for selected range
    const selectedEntries = rankedEntries.slice(
      Number(offset),
      Number(offset) + Number(limit)
    );

    const playerIds = selectedEntries.map((e) => e.playerId);
    const players = await require("../models").Player.findAll({
      where: { id: playerIds },
      attributes: ["id", "name", "nickname"],
      raw: true,
    });
    const playerMap = new Map(players.map((p) => [p.id, p]));

    const rankings = selectedEntries.map((entry) => {
      const player = playerMap.get(entry.playerId);
      return {
        rank: entry.position,
        playerId: entry.playerId,
        playerName: player?.name || "Unknown",
        nickname: player?.nickname || player?.name || "Unknown",
        formPoints: entry.formPoints,
        tournamentsInForm: entry.tournamentCount,
      };
    });

    res.json({
      success: true,
      data: {
        rankings,
        total: rankedEntries.length,
        limit: Number(limit),
        offset: Number(offset),
        rankingType: "form",
        sport: normalizedSport,
        calculatedAt: now,
      },
    });
  } catch (error) {
    console.error("getFormRankings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================================================
// FLEXIBLE SCHEDULING - MATCH BOOKING
// ============================================================================

/**
 * POST /api/tournaments/:tournamentId/matches/:matchId/book
 * Book a match time (flexible scheduling)
 */
exports.bookMatchTime = async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const { bookingTime, venueId } = req.body;
    const { userId, role } = req.user;

    if (!bookingTime) {
      return res.status(400).json({ success: false, error: "Booking time is required" });
    }

    // Get player ID from user
    let playerId = null;
    if (role === "player") {
      const player = await Player.findOne({ where: { userId } });
      if (!player) {
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }
      playerId = player.id;
    } else if (role === "organization") {
      // Allow organization to book on behalf of players
      const organization = await Organization.findOne({ where: { userId } });
      if (!organization) {
        return res.status(403).json({ success: false, error: "Organization not found" });
      }
      const tournament = await Tournament.findByPk(tournamentId);
      if (!tournament || tournament.organizationId !== organization.id) {
        return res.status(403).json({ success: false, error: "Not authorized" });
      }
      // Use a system ID for org-initiated bookings
      playerId = userId;
    } else {
      return res.status(403).json({ success: false, error: "Only players or organizers can book matches" });
    }

    // Book the match
    const result = await TournamentSchedulingService.bookMatchTime(
      matchId,
      bookingTime,
      playerId,
      venueId
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    // Log the action
    await AuditLog.create({
      action: "match_time_booked",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
      notes: `Booked match time: ${bookingTime}`,
    });

    res.json({
      success: true,
      message: "Match time booked successfully",
      data: {
        matchId: result.match.id,
        bookingTime: result.match.bookingTime,
        isScheduled: result.match.isScheduled,
      },
    });
  } catch (error) {
    console.error("bookMatchTime error:", error);
    res.status(500).json({ success: false, error: "Failed to book match time: " + error.message });
  }
};

/**
 * DELETE /api/tournaments/:tournamentId/matches/:matchId/book
 * Cancel a match booking
 */
exports.cancelMatchBooking = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { userId, role } = req.user;

    let playerId = null;
    if (role === "player") {
      const player = await Player.findOne({ where: { userId } });
      if (!player) {
        return res.status(404).json({ success: false, error: "Player profile not found" });
      }
      playerId = player.id;
    } else if (role === "organization") {
      playerId = userId; // Allow org to cancel bookings
    } else {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const result = await TournamentSchedulingService.cancelMatchBooking(matchId, playerId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    await AuditLog.create({
      action: "match_booking_cancelled",
      entityType: "tournament_match",
      entityId: matchId,
      userId,
      notes: "Cancelled match booking",
    });

    res.json({
      success: true,
      message: "Match booking cancelled successfully",
    });
  } catch (error) {
    console.error("cancelMatchBooking error:", error);
    res.status(500).json({ success: false, error: "Failed to cancel booking: " + error.message });
  }
};

/**
 * GET /api/tournaments/:tournamentId/matches/:matchId/available-slots
 * Get available booking slots for a match
 */
exports.getAvailableBookingSlots = async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const { venueId, date } = req.query;

    const match = await TournamentMatch.findByPk(matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const config = TournamentSchedulingService.getSchedulingConfigFromTournament(tournament);
    if (!config.flexibleScheduling) {
      return res.status(400).json({
        success: false,
        error: "Flexible scheduling is not enabled for this tournament",
      });
    }

    // Generate available time slots (9 AM to 9 PM, 2-hour slots)
    const targetDate = date ? new Date(date) : new Date();
    const slots = [];
    for (let hour = 9; hour <= 19; hour += 2) {
      const slotTime = new Date(targetDate);
      slotTime.setHours(hour, 0, 0, 0);

      // Check if slot is available
      const availability = await TournamentSchedulingService.checkVenueAvailability(
        venueId || match.venueId,
        slotTime,
        2,
        matchId
      );

      // Validate against deadline
      const validation = TournamentSchedulingService.validateBookingTime(
        slotTime,
        match.scheduledDeadline,
        config
      );

      slots.push({
        time: slotTime,
        available: availability.available && validation.valid,
        reason: !availability.available
          ? availability.error
          : !validation.valid
          ? validation.error
          : null,
      });
    }

    res.json({
      success: true,
      data: {
        matchId,
        venueId: venueId || match.venueId,
        date: targetDate,
        deadline: match.scheduledDeadline,
        slots,
      },
    });
  } catch (error) {
    console.error("getAvailableBookingSlots error:", error);
    res.status(500).json({ success: false, error: "Failed to get available slots: " + error.message });
  }
};

/**
 * POST /api/tournaments/:tournamentId/auto-forfeit/run
 * Manually trigger auto-forfeit for a tournament (admin only)
 */
exports.runAutoForfeit = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { userId } = req.user;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const organization = await Organization.findOne({ where: { userId } });
    if (!organization || tournament.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const result = await TournamentSchedulingService.applyAutoForfeitForTournament(tournamentId);

    await AuditLog.create({
      action: "auto_forfeit_triggered",
      entityType: "tournament",
      entityId: tournamentId,
      userId,
      notes: `Manually triggered auto-forfeit, ${result.updated} matches updated`,
    });

    res.json({
      success: true,
      message: `Auto-forfeit completed: ${result.updated} matches updated`,
      data: result,
    });
  } catch (error) {
    console.error("runAutoForfeit error:", error);
    res.status(500).json({ success: false, error: "Failed to run auto-forfeit: " + error.message });
  }
};

/**
 * ADMIN ENDPOINT: Resolve a voided knockout match
 *
 * When a match is voided (player withdrawal with void rule), the organizer must manually decide the outcome:
 * - Option 1: Promote one player to next round (assign winner)
 * - Option 2: Promote an alternate/bye player
 * - Option 3: Reschedule the match
 *
 * POST /api/tournaments/:tournamentId/matches/:matchId/resolve-void
 * Body: {
 *   action: "promote_player" | "promote_alternate" | "reschedule",
 *   winnerPlayerId?: "player1" | "player2",  // for promote_player
 *   alternatePlayerId?: uuid,                 // for promote_alternate
 * }
 */
exports.resolveVoidedMatch = async (req, res) => {
  try {
    const { userId } = req.user;
    const { tournamentId, matchId } = req.params;
    const { action, winnerPlayerId, alternatePlayerId } = req.body;

    // Verify authorization (organizer/admin only)
    const organization = await Organization.findOne({ where: { userId } });
    if (!organization) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament || tournament.organizationId !== organization.id) {
      return res.status(403).json({ success: false, error: "Not authorized for this tournament" });
    }

    const match = await TournamentMatch.findByPk(matchId);
    if (!match || match.tournamentId !== tournamentId) {
      return res.status(404).json({ success: false, error: "Match not found" });
    }

    if (match.status !== "voided") {
      return res.status(400).json({ success: false, error: "This match is not voided" });
    }

    // ─────────────────────────────────────────────────────────────────
    // Option 1: Promote one of the original players to next round
    // ─────────────────────────────────────────────────────────────────
    if (action === "promote_player") {
      if (!winnerPlayerId || !["player1", "player2"].includes(winnerPlayerId)) {
        return res.status(400).json({ success: false, error: "Invalid winnerPlayerId" });
      }

      // Keep status as "voided" but record the admin decision
      await match.update({
        adminOverride: true,
        overriddenBy: userId,
        overrideReason: `Admin promoted ${winnerPlayerId} (voided match resolution)`,
        overrideDate: new Date(),
        winner: winnerPlayerId,
        player1FramesWon: winnerPlayerId === "player1" ? 1 : 0,
        player2FramesWon: winnerPlayerId === "player2" ? 1 : 0,
      });

      // Log audit
      await AuditLog.create({
        action: "voided_match_resolved",
        entityType: "tournament_match",
        entityId: match.id,
        userId,
        notes: `Voided match ${match.id} resolved by promoting ${winnerPlayerId}`,
      });

      // Generate next round fixtures now that this match is resolved
      // After promoting a player, check if all matches in current round are now determined
      try {
        const currentRound = match.roundNumber;
        if (currentRound != null) {
          // Check if all non-bye matches in this round now have a winner
          const roundMatches = await TournamentMatch.findAll({
            where: {
              tournamentId,
              roundNumber: currentRound,
              player2Id: { [Op.ne]: null }, // Exclude byes
            },
          });

          const allMatchesResolved = roundMatches.every(m =>
            m.status === "completed" ||
            (m.status === "voided" && m.adminOverride)
          );

          if (allMatchesResolved && roundMatches.length > 0) {
            console.log(`[resolveVoidedMatch] All matches in round ${currentRound} are resolved. Generating next round...`);

            // Generate next round
            const nextRoundNum = currentRound + 1;
            const nextRound = await TournamentRound.findOne({
              where: { tournamentId, roundNumber: nextRoundNum },
            });

            if (!nextRound) {
              await exports._generateNextKnockoutRound(tournamentId, nextRoundNum, null);
              console.log(`[resolveVoidedMatch] Successfully generated round ${nextRoundNum}`);

              // Update tournament to next round
              await Tournament.update(
                { currentRound: nextRoundNum },
                { where: { id: tournamentId } }
              );
            } else {
              console.log(`[resolveVoidedMatch] Round ${nextRoundNum} already exists`);
            }
          } else {
            console.log(`[resolveVoidedMatch] Round ${currentRound} still has unresolved matches`);
          }
        }
      } catch (progErr) {
        console.warn("Fixture generation after void resolution failed:", progErr.message);
      }

      return res.json({
        success: true,
        data: {
          match: {
            id: match.id,
            status: match.status,
            winner: match.winner,
            adminOverride: true,
            overrideReason: match.overrideReason,
          },
          message: `Match resolved - ${winnerPlayerId} promoted to next round`,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // Option 2: Promote an alternate player (replace withdrawn player)
    // Status remains "voided" - only adminOverride records the decision
    // ─────────────────────────────────────────────────────────────────
    if (action === "promote_alternate") {
      if (!alternatePlayerId) {
        return res.status(400).json({ success: false, error: "alternatePlayerId required" });
      }

      // Verify alternate is in the tournament
      const alternate = await TournamentParticipant.findOne({
        where: { tournamentId, playerId: alternatePlayerId },
      });

      if (!alternate) {
        return res.status(404).json({ success: false, error: "Alternate player not found in tournament" });
      }

      // Update match to replace one player with alternate
      // Status stays "voided" - only record admin decision
      await match.update({
        adminOverride: true,
        overriddenBy: userId,
        overrideReason: `Admin promoted alternate ${alternatePlayerId} to replace withdrawn player`,
        overrideDate: new Date(),
        player1Id: alternatePlayerId,
        player1FramesWon: null,
        player2FramesWon: null,
        winner: null, // Reset for new matchup
        isWalkover: false,
        // Status remains "voided"
      });

      await AuditLog.create({
        action: "voided_match_alternate_promoted",
        entityType: "tournament_match",
        entityId: match.id,
        userId,
        notes: `Voided match ${match.id} updated with alternate player ${alternatePlayerId}`,
      });

      // Note: Next round fixture generation is deferred until this match is completed
      // The alternate player must now play the match to determine a winner

      return res.json({
        success: true,
        data: {
          match: {
            id: match.id,
            status: match.status,
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            adminOverride: true,
            overrideReason: match.overrideReason,
          },
          message: `Match updated with alternate player - now ready to be played`,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // Option 3: Reschedule the match (set status back to scheduled)
    // ─────────────────────────────────────────────────────────────────
    if (action === "reschedule") {
      await match.update({
        status: "scheduled",
        adminOverride: true,
        overriddenBy: userId,
        overrideReason: "Admin rescheduled match after void",
        overrideDate: new Date(),
        winner: null,
        player1FramesWon: null,
        player2FramesWon: null,
        isWalkover: false,
      });

      await AuditLog.create({
        action: "voided_match_rescheduled",
        entityType: "tournament_match",
        entityId: match.id,
        userId,
        notes: `Voided match ${match.id} rescheduled - status set back to scheduled`,
      });

      return res.json({
        success: true,
        data: {
          match: {
            id: match.id,
            status: "scheduled",
            adminOverride: true,
            overrideReason: match.overrideReason,
          },
          message: "Match rescheduled successfully - players can now play the match",
        },
      });
    }

    return res.status(400).json({ success: false, error: "Invalid action. Use: promote_player, promote_alternate, or reschedule" });

  } catch (error) {
    console.error("resolveVoidedMatch error:", error);
    res.status(500).json({ success: false, error: "Internal server error: " + (error.message || error) });
  }
};

/**
 * Get all voided matches pending admin resolution
 * GET /api/tournaments/:tournamentId/voided-matches
 */
exports.getVoidedMatches = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, error: "Tournament not found" });
    }

    const voidedMatches = await TournamentMatch.findAll({
      where: { tournamentId, status: "voided" },
      include: [
        {
          association: "player1",
          attributes: ["id", "name", "nickname"],
        },
        {
          association: "player2",
          attributes: ["id", "name", "nickname"],
        },
      ],
      order: [["roundNumber", "ASC"], ["matchNumber", "ASC"]],
    });

    const alternatePlayers = await TournamentParticipant.findAll({
      where: {
        tournamentId,
        status: { [Op.in]: ["approved", "pending"] },
      },
      include: [
        {
          association: "player",
          attributes: ["id", "name", "nickname"],
        },
      ],
    });

    // Get withdrawal status for each voided match
    const enrichedVoidedMatches = await Promise.all(
      voidedMatches.map(async (m) => {
        // Check if either player is withdrawn in the tournament
        const p1Participant = await TournamentParticipant.findOne({
          where: { tournamentId, playerId: m.player1Id },
        });
        const p2Participant = await TournamentParticipant.findOne({
          where: { tournamentId, playerId: m.player2Id },
        });

        let withdrawnPlayer = null;
        let withdrawnPlayerId = null;
        let withdrawnPlayerName = null;

        if (p1Participant && p1Participant.status === "withdrawn") {
          withdrawnPlayer = "player1";
          withdrawnPlayerId = m.player1Id;
          withdrawnPlayerName = m.player1?.name;
        } else if (p2Participant && p2Participant.status === "withdrawn") {
          withdrawnPlayer = "player2";
          withdrawnPlayerId = m.player2Id;
          withdrawnPlayerName = m.player2?.name;
        }

        return {
          id: m.id,
          roundNumber: m.roundNumber,
          roundType: m.roundType,
          matchNumber: m.matchNumber,
          player1: m.player1,
          player2: m.player2,
          status: m.status,
          adminOverride: m.adminOverride,
          overrideReason: m.overrideReason,
          withdrawnPlayer,
          withdrawnPlayerId,
          withdrawnPlayerName,
        };
      })
    );

    res.json({
      success: true,
      data: {
        voidedMatches: enrichedVoidedMatches,
        availableAlternates: alternatePlayers.map((p) => ({
          id: p.playerId,
          name: p.player?.name,
          nickname: p.player?.nickname,
          status: p.status,
        })),
      },
    });
  } catch (error) {
    console.error("getVoidedMatches error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
