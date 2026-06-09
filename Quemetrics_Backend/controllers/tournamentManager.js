// controllers/tournamentManager.js
// Advanced tournament management utilities

const {
  Tournament,
  TournamentFormat,
  TournamentScoringRules,
  TournamentParticipant,
  TournamentMatch,
  TournamentRound,
  TournamentInvitation,
  Player,
  PlayerRankingProfile,
  RankingPointsHistory,
  Organization,
  User,
  AuditLog,
} = require("../models");
const { Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const RankingSnapshotService = require("../services/RankingSnapshotService");

// ============================================================================
// BRACKET GENERATION ENGINE
// ============================================================================

const BracketGenerator = {
  getNextPowerOfTwo(num) {
    return Math.pow(2, Math.ceil(Math.log2(num)));
  },

  /**
   * Apply seeding to participant list
   * @param {Array} participants - approved participants with optional rankingProfile
   * @param {string} seedingType - random|ranked|manual
   * @returns {Array} ordered participant list
   */
  applySeeding(participants, seedingType = "random") {
    const list = [...participants];

    if (seedingType === "ranked") {
      // Sort by rolling12MonthPoints descending (highest ranked = seed 1)
      list.sort((a, b) => {
        const aPoints = a.player?.rankingProfile?.rolling12MonthPoints || 0;
        const bPoints = b.player?.rankingProfile?.rolling12MonthPoints || 0;
        return bPoints - aPoints;
      });
    } else if (seedingType === "manual") {
      // Sort by manually assigned seed (set on TournamentParticipant.seed)
      list.sort((a, b) => (a.seed || 9999) - (b.seed || 9999));
    } else {
      // random
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }

    return list;
  },

  /**
   * Generate knockout bracket matches from seeded player list
   */
  generateKnockoutBracket(playerCount, handleByes = "auto_expand") {
    const bracketSize = this.getNextPowerOfTwo(playerCount);
    const byeCount = bracketSize - playerCount;
    return {
      bracketSize,
      byeCount,
      rounds: Math.log2(bracketSize),
      structure: `${playerCount} players in ${bracketSize}-player bracket with ${byeCount} byes`,
    };
  },

  /** Round type for first knockout round from bracket size (ENUM-safe). */
  getKnockoutMatchRoundTypeFromBracketSize(bracketSize) {
    if (bracketSize <= 2) return "final";
    if (bracketSize <= 4) return "semi_final";
    if (bracketSize <= 8) return "knockout_8";
    return "knockout_16";
  },

  /**
   * Generate knockout match pairings from a seeded player ID list.
   * Supports 4 bye-handling modes:
   *   - auto_expand:       expand to next power-of-2, byes go to bottom seeds (no shuffle)
   *   - top_seeded:        top seeds receive the byes
   *   - random_bye:        all players randomly shuffled before slot assignment
   *   - preliminary_round: bottom seeds play a qualification round (round 0); top seeds get
   *                        instant-complete BYE matches at round 0 so _generateNextRound can
   *                        auto-seed everyone into round 1 after prelim finishes
   */
  generateKnockoutMatches(seededPlayerIds, tournamentId, byesHandling = "random_bye") {
    const n = seededPlayerIds.length;

    // ── PRELIMINARY ROUND ──────────────────────────────────────────────────
    if (byesHandling === "preliminary_round" && n > 1) {
      // Largest power of 2 that still fits all players (i.e. the target main bracket size)
      const p = Math.pow(2, Math.floor(Math.log2(n)));

      if (n === p) {
        // n is already a power of 2: no prelim needed, fall through to auto_expand below
      } else {
        const extra = n - p;
        // Bottom 2*extra seeds play in 'extra' preliminary matches
        // Top (p - extra) seeds receive bye matches (completed instantly at round 0)
        const directPlayers = seededPlayerIds.slice(0, p - extra);   // top seeds → bye
        const prelimPlayers = seededPlayerIds.slice(p - extra);       // bottom seeds → play

        const matches = [];

        // Instant-complete BYE matches for top seeds (round 0)
        for (const playerId of directPlayers) {
          matches.push({
            tournamentId,
            roundNumber: 0,
            roundType: "preliminary",
            isPreliminaryRound: true,
            player1Id: playerId,
            player2Id: null,      // BYE
            status: "completed",
            winner: "player1",
            isWalkover: true,
          });
        }

        // Real matches for bottom seeds (round 0, scheduled)
        for (let i = 0; i < prelimPlayers.length; i += 2) {
          const p1 = prelimPlayers[i];
          const p2 = prelimPlayers[i + 1] || null;
          matches.push({
            tournamentId,
            roundNumber: 0,
            roundType: "preliminary",
            isPreliminaryRound: true,
            player1Id: p1,
            player2Id: p2,
            status: p2 ? "scheduled" : "completed",
            winner: p2 ? null : "player1",
            isWalkover: !p2,
          });
        }

        // After all round-0 matches complete, _generateNextRound(1) will pair all 'p' winners
        return { matches, bracketSize: p, byeCount: 0, isPreliminary: true, directCount: directPlayers.length, prelimMatchCount: prelimPlayers.length / 2 };
      }
    }

    // ── STANDARD BRACKET (auto_expand / top_seeded / random_bye) ──────────
    const bracketSize = this.getNextPowerOfTwo(n);
    const byeCount = bracketSize - n;
    const matches = [];

    // Build slots: each bracket "pair" is slots[2k], slots[2k+1]. Byes = exactly one player in the pair.
    // Real R1 matches = (n - byeCount) / 2 — never floor(n/2) via consecutive filling (that over-generates matches).
    const slots = new Array(bracketSize).fill(null);

    if (byeCount === 0) {
      for (let i = 0; i < n; i++) {
        slots[i] = seededPlayerIds[i];
      }
    } else {
      const playersWhoPlay = n - byeCount;
      let byePlayers;
      let matchPlayers;

      if (byesHandling === "top_seeded") {
        byePlayers = seededPlayerIds.slice(0, byeCount);
        matchPlayers = seededPlayerIds.slice(byeCount);
      } else if (byesHandling === "random_bye") {
        const shuffled = [...seededPlayerIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        byePlayers = shuffled.slice(0, byeCount);
        matchPlayers = shuffled.slice(byeCount);
      } else {
        // auto_expand: lower seeds (trailing list) get byes; top seeds play down to next power of 2
        matchPlayers = seededPlayerIds.slice(0, playersWhoPlay);
        byePlayers = seededPlayerIds.slice(playersWhoPlay);
      }

      const matchPairCount = matchPlayers.length / 2;
      let pairIdx = 0;
      for (let b = 0; b < byePlayers.length; b++) {
        slots[2 * pairIdx] = byePlayers[b];
        pairIdx++;
      }
      for (let m = 0; m < matchPairCount; m++) {
        slots[2 * pairIdx] = matchPlayers[m * 2];
        slots[2 * pairIdx + 1] = matchPlayers[m * 2 + 1];
        pairIdx++;
      }
    }

    // Pairings from slots: only persist real head-to-head matches.
    // Byes auto-advance with no match row; indices stored in byeByPairIndex for progression.
    const byeByPairIndex = {};
    const round1RoundType = this.getKnockoutMatchRoundTypeFromBracketSize(bracketSize);
    for (let i = 0; i < bracketSize; i += 2) {
      const pairIndex = i / 2;
      const p1 = slots[i];
      const p2 = slots[i + 1] || null;
      if (p1 && p2) {
        matches.push({
          tournamentId,
          roundNumber: 1,
          roundType: round1RoundType,
          player1Id: p1,
          player2Id: p2,
          status: "scheduled",
          winner: null,
          isWalkover: false,
          matchNumber: pairIndex + 1,
        });
      } else if (p1 && !p2) {
        byeByPairIndex[String(pairIndex)] = p1;
      } else if (!p1 && p2) {
        byeByPairIndex[String(pairIndex)] = p2;
      }
    }

    console.log(`[generateKnockoutMatches] playerCount=${n}, bracketSize=${bracketSize}, byeCount=${byeCount}, byeByPairIndex=`, JSON.stringify(byeByPairIndex));
    return { matches, bracketSize, byeCount, byeByPairIndex };
  },

  /**
   * Generate Round Robin match pairings (circle method).
   * Every real player plays every other real player exactly once.
   * Odd player count: one internal null "bye" slot per round — no match row; rest is recorded in roundsMeta.
   *
   * @param {string[]} seededPlayerIds - distinct player UUIDs (order = seed order)
   * @param {string} tournamentId
   * @param {Record<string, string>|null} playerNamesById - optional map for byePlayers[].playerName in API metadata
   * @returns {{ matches, totalRounds, roundsMeta, playerCount, totalMatchesExpected }}
   */
  generateRoundRobinMatches(seededPlayerIds, tournamentId, playerNamesById = null) {
    const raw = (seededPlayerIds || []).filter((id) => id != null);
    const unique = [...new Set(raw)];
    const n = unique.length;
    if (n < 2) {
      return {
        matches: [],
        totalRounds: 0,
        roundsMeta: [],
        playerCount: n,
        totalMatchesExpected: 0,
      };
    }

    const players = [...unique];
    const oddField = n % 2 !== 0;
    if (oddField) players.push(null);

    const totalPlayers = players.length;
    const totalRounds = totalPlayers - 1;
    const matchesPerRound = totalPlayers / 2;
    const allMatches = [];
    const roundsMeta = [];
    let globalMatchNum = 0;
    const pairKeys = new Set();

    const nameOf = (id) => (playerNamesById && playerNamesById[id]) || undefined;

    for (let round = 0; round < totalRounds; round++) {
      const roundNumber = round + 1;
      const byePlayers = [];

      for (let i = 0; i < matchesPerRound; i++) {
        const home = players[i];
        const away = players[totalPlayers - 1 - i];
        const isBye = home == null || away == null;
        const slotLabel = `R${roundNumber} P${i + 1}`;

        if (home && away) {
          const key = home < away ? `${home}|${away}` : `${away}|${home}`;
          if (pairKeys.has(key)) {
            console.warn(`[RoundRobin] duplicate pairing ${key} in round ${roundNumber}`);
          }
          pairKeys.add(key);
          globalMatchNum += 1;
          console.log(
            `[RoundRobin] Round: ${roundNumber} | Match: ${nameOf(home) || home} vs ${nameOf(away) || away} | Slot: ${slotLabel} | Is Bye: false`
          );
          allMatches.push({
            tournamentId,
            roundNumber,
            roundType: "group_stage",
            player1Id: home,
            player2Id: away,
            status: "scheduled",
            groupNumber: null,
            matchNumber: globalMatchNum,
          });
        } else {
          const real = home || away;
          console.log(
            `[RoundRobin] Round: ${roundNumber} | Match: ${real ? nameOf(real) || real : "?"} vs BYE (rest — no DB row) | Slot: ${slotLabel} | Is Bye: true`
          );
          if (real) {
            byePlayers.push({
              playerId: real,
              ...(nameOf(real) ? { playerName: nameOf(real) } : {}),
              status: "REST",
              note: "Rest round (odd field — no playable match)",
            });
          }
        }
      }

      roundsMeta.push({ roundNumber, byePlayers });

      const last = players.pop();
      players.splice(1, 0, last);
    }

    const expected = (n * (n - 1)) / 2;
    if (allMatches.length !== expected) {
      console.warn(
        `[RoundRobin] Expected ${expected} matches for ${n} players, got ${allMatches.length}`
      );
    }

    return {
      matches: allMatches,
      totalRounds,
      roundsMeta,
      playerCount: n,
      totalMatchesExpected: expected,
    };
  },

  /**
   * Generate Group + Knockout matches
   * Split players into groups, generate round-robin within each group.
   * Knockout matches are created later when groups complete.
   */
  generateGroupKnockoutMatches(seededPlayerIds, tournamentId, groupCount, playersPerGroup, qualifiersPerGroup) {
    const n = seededPlayerIds.length;
    const actualGroupCount = groupCount || Math.ceil(n / (playersPerGroup || 4));
    const perGroup = playersPerGroup || Math.ceil(n / actualGroupCount);
    const qualPerGroup = qualifiersPerGroup || Math.min(2, perGroup);
    const BYE = "BYE";

    // Distribute players into groups (snake draft for fairness)
    const groups = Array.from({ length: actualGroupCount }, () => []);
    let direction = 1;
    let gIdx = 0;
    for (let i = 0; i < n; i++) {
      groups[gIdx].push(seededPlayerIds[i]);
      if ((direction === 1 && gIdx === actualGroupCount - 1) || (direction === -1 && gIdx === 0)) {
        direction *= -1;
      } else {
        gIdx += direction;
      }
    }

    // Generate round-robin matches within each group
    const allMatches = [];
    let roundOffset = 0;
    for (let g = 0; g < groups.length; g++) {
      const groupPlayers = [...groups[g]];
      if (groupPlayers.length < 2) continue;
      const realPlayers = [...groupPlayers];
      const realN = groupPlayers.length;
      const oddGroup = realN % 2 !== 0;

      const matchesStartIndex = allMatches.length;
      const pairKeys = new Set(); // prevent duplicate real pairings
      const byeCountByPlayer = oddGroup ? new Map(realPlayers.map((pid) => [pid, 0])) : null;

      // Circle method: add dummy BYE when odd.
      if (oddGroup) groupPlayers.push(BYE);
      const gpLen = groupPlayers.length;
      const gRounds = gpLen - 1;

      for (let round = 0; round < gRounds; round++) {
        const restsThisRound = [];
        for (let i = 0; i < gpLen / 2; i++) {
          const home = groupPlayers[i];
          const away = groupPlayers[gpLen - 1 - i];
          const homeIsBye = home === BYE;
          const awayIsBye = away === BYE;

          if (!homeIsBye && !awayIsBye && home && away) {
            const p1 = home;
            const p2 = away;
            const key = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
            if (pairKeys.has(key)) {
              throw new Error(`Duplicate group-stage pairing detected in group ${g + 1}: ${key}`);
            }
            pairKeys.add(key);

            allMatches.push({
              tournamentId,
              roundNumber: round + 1,
              roundType: "group_stage",
              player1Id: p1,
              player2Id: p2,
              status: "scheduled",
              groupNumber: g + 1,
            });
          } else if (homeIsBye && !awayIsBye && away) {
            restsThisRound.push(away);
          } else if (awayIsBye && !homeIsBye && home) {
            restsThisRound.push(home);
          }
        }

        if (oddGroup) {
          // Odd group => exactly one real player rests each round.
          if (restsThisRound.length !== 1) {
            throw new Error(
              `Invalid bye distribution: group ${g + 1} round ${round + 1} expected 1 rest, got ${restsThisRound.length}`
            );
          }
          const restPid = restsThisRound[0];
          byeCountByPlayer.set(restPid, (byeCountByPlayer.get(restPid) || 0) + 1);
        } else if (restsThisRound.length !== 0) {
          throw new Error(
            `Invalid bye distribution: group ${g + 1} round ${round + 1} expected 0 rests, got ${restsThisRound.length}`
          );
        }

        const last = groupPlayers.pop();
        groupPlayers.splice(1, 0, last);
      }

      if (oddGroup) {
        for (const pid of realPlayers) {
          const c = byeCountByPlayer.get(pid) || 0;
          if (c !== 1) {
            throw new Error(`Invalid BYE count: group ${g + 1} player ${pid} rests ${c} times (expected 1)`);
          }
        }
      }

      const createdForGroup = allMatches.length - matchesStartIndex;
      const expectedForGroup = (realN * (realN - 1)) / 2;
      if (createdForGroup !== expectedForGroup) {
        throw new Error(`Invalid group-stage match count: group ${g + 1} created ${createdForGroup}, expected ${expectedForGroup}`);
      }

      roundOffset = Math.max(roundOffset, gRounds);
    }

    return {
      matches: allMatches,
      groups: groups.map((g, i) => ({ groupNumber: i + 1, playerIds: g })),
      groupCount: groups.length,
      qualifiersPerGroup: qualPerGroup,
      knockoutStartRound: roundOffset + 1,
    };
  },

  /**
   * Generate knockout bracket from Group stage qualifiers
   * Call this after group stage is complete to identify and seed qualifiers
   *
   * @param {string} tournamentId - Tournament ID
   * @param {Array} groups - Group configuration: [{groupNumber, playerIds}, ...]
   * @param {number} qualifiersPerGroup - How many from each group advance
   * @param {Array} allGroupMatches - All completed group stage matches
   * @param {Object} scoringRules - Tournament scoring config (pointsWin, pointsLoss, etc.)
   * @param {string} byesHandling - same as generateKnockoutMatches
   * @returns {{ matches: Array, bracketSize: number, byeByPairIndex: Object }}
   */
  generateKnockoutFromGroupQualifiers(
    tournamentId,
    groups,
    qualifiersPerGroup,
    allGroupMatches,
    scoringRules,
    byesHandling = "top_seeded"
  ) {
    const TiebreakerEngine = require("../engines/TiebreakerEngine");
    // Seeded method required: top-ranked qualifiers get the BYEs first.
    byesHandling = "top_seeded";

    const qualifierEntries = [];

    groups.forEach((group) => {
      const groupMatches = allGroupMatches.filter((m) => m.groupNumber === group.groupNumber);
      const standings = TiebreakerEngine.calculateGroupStandings(
        group.playerIds || [],
        groupMatches,
        scoringRules
      );
      const groupQualifiers = TiebreakerEngine.getTopPlayers(standings, qualifiersPerGroup || 2);
      groupQualifiers.forEach((q, idx) => {
        qualifierEntries.push({
          playerId: q.playerId,
          groupNumber: group.groupNumber,
          groupPosition: idx + 1,
          points: q.points || 0,
          framesWon: q.framesWon || 0,
          framesLost: q.framesLost || 0,
          frameDifference: (q.framesWon || 0) - (q.framesLost || 0),
        });
      });
    });

    if (qualifierEntries.length < 2) {
      return { matches: [], bracketSize: 0, byeByPairIndex: {} };
    }

    // Seed ordering for knockout BYEs: top-ranked qualifiers first (seeded method required).
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

    return this.generateKnockoutMatches(seededPlayerIds, tournamentId, byesHandling);
  },

  /**
   * Swiss round 1 pairings (random or seed-order; bye rules in SwissPairingEngine).
   * @param {Array} participants - Seeded participants (playerId, seed)
   * @param {{ seeding?: string }} options
   */
  generateSwissPairings(participants, options = {}) {
    const SwissPairingEngine = require("../services/SwissPairingEngine");
    const rows = (participants || []).map((p) => ({
      playerId: p.playerId,
      seed: p.seed ?? null,
    }));
    return SwissPairingEngine.generateRoundOnePairings(rows, {
      seeding: options.seeding || "random",
    });
  },

  /**
   * Swiss rounds 2+ — standings, score groups, avoid rematches, one bye per round.
   * @param {Array<{ playerId: string, seed?: number }>} participants
   * @param {Array} allCompletedMatches - includes bye rows (player2Id null)
   * @param {number} _roundNumber
   * @param {string[]|null} tiebreakerPriority
   * @param {object|null} scoringRules
   */
  generateNextSwissRound(
    participants,
    allCompletedMatches = [],
    _roundNumber = 1,
    _tiebreakerPriority = null,
    scoringRules = null
  ) {
    const SwissPairingEngine = require("../services/SwissPairingEngine");
    return SwissPairingEngine.generateSubsequentRoundPairings({
      participants,
      completedMatches: allCompletedMatches,
      scoringRules,
    });
  },

  /**
   * Initialize ladder format: assign positions to all players.
   * No initial matches are generated; matches happen on-demand via challenges.
   *
   * @param {Array} seededParticipants - Participants in seeded order
   * @param {string} tournamentId - Tournament ID
   * @returns {Object} { ladderPositions: [{playerId, position}] }
   */
  generateLadderPositions(seededParticipants, tournamentId) {
    const ladderPositions = seededParticipants.map((p, idx) => ({
      playerId: p.playerId,
      position: idx + 1,
    }));
    return { ladderPositions };
  },

  /**
   * Validate a ladder challenge: check range and cooldown.
   *
   * @param {Object} challenger - TournamentParticipant (with ladderPosition, lastChallengeDate)
   * @param {Object} target - TournamentParticipant (with ladderPosition)
   * @param {Object} format - TournamentFormat (with challengeRange, challengeCooldown)
   * @returns {{ valid: boolean, error?: string }}
   */
  validateLadderChallenge(challenger, target, format) {
    if (!challenger.ladderPosition || !target.ladderPosition) {
      return { valid: false, error: "Both players must have ladder positions" };
    }
    if (challenger.ladderPosition <= target.ladderPosition) {
      return { valid: false, error: "You can only challenge players ranked higher (lower position number)" };
    }
    const range = format.challengeRange || 2;
    const positionDiff = challenger.ladderPosition - target.ladderPosition;
    if (positionDiff > range) {
      return { valid: false, error: `You can only challenge players within ${range} positions above you. Difference is ${positionDiff}.` };
    }
    const cooldownHours = format.challengeCooldown || 24;
    if (challenger.lastChallengeDate) {
      const since = (Date.now() - new Date(challenger.lastChallengeDate).getTime()) / (1000 * 60 * 60);
      if (since < cooldownHours) {
        const remaining = Math.ceil(cooldownHours - since);
        return { valid: false, error: `Challenge cooldown: ${remaining} hours remaining` };
      }
    }
    return { valid: true };
  },

  /**
   * Process a ladder match result: if challenger wins, swap positions.
   *
   * @param {Object} challenger - TournamentParticipant
   * @param {Object} target - TournamentParticipant
   * @param {string} winnerId - The winning player's ID
   * @returns {{ swapped: boolean, newChallengerPos: number, newTargetPos: number }}
   */
  processLadderResult(challenger, target, winnerId) {
    if (winnerId === challenger.playerId) {
      // Challenger wins: swap positions
      const oldChallengerPos = challenger.ladderPosition;
      const oldTargetPos = target.ladderPosition;
      return {
        swapped: true,
        newChallengerPos: oldTargetPos,
        newTargetPos: oldChallengerPos,
      };
    }
    // Defender wins: no change
    return {
      swapped: false,
      newChallengerPos: challenger.ladderPosition,
      newTargetPos: target.ladderPosition,
    };
  }
};

// ============================================================================
// SCORING ENGINE
// ============================================================================

const ScoringEngine = {
  /**
   * Calculate points for a match result
   */
  calculateMatchPoints(match, scoringRules) {
    let { player1FramesWon, player2FramesWon, isWalkover, winner } = match;
    const rules = scoringRules || {};

    const points = { player1: 0, player2: 0 };

    // BYE handling: Award 0 points and do not affect stats
    const isBye = (match?.player2Id == null || match?.status === 'bye' || match?.isBye) && !isWalkover;
    if (isBye) {
      points.player1 = 0;
      return points;
    }

    // DEFENSIVE: If winner is null, determine from scores
    if (!winner && (player1FramesWon !== undefined || player2FramesWon !== undefined)) {
      const p1 = player1FramesWon || 0;
      const p2 = player2FramesWon || 0;
      if (p1 > p2) {
        winner = "player1";
      } else if (p2 > p1) {
        winner = "player2";
      } else if (p1 > 0 && p2 > 0) {
        winner = "draw";
      }
      console.log('[calculateMatchPoints] Determined winner from scores:', {
        matchId: match.id,
        player1FramesWon: p1,
        player2FramesWon: p2,
        winner
      });
    }

    if (isWalkover) {
      if (!match.player2Id && winner === "player1") {
        points.player1 = rules.pointsWin ?? rules.pointsWalkover ?? 3;
        return points;
      }
      if (winner === "player1") {
        points.player1 = rules.pointsWalkover ?? 3;
      } else {
        points.player2 = rules.pointsWalkover ?? 3;
      }
    } else {
      if (winner === "player1") {
        points.player1 = rules.pointsWin ?? 3;
        points.player2 = rules.pointsLoss ?? 0;
      } else if (winner === "player2") {
        points.player2 = rules.pointsWin ?? 3;
        points.player1 = rules.pointsLoss ?? 0;
      } else if (winner === "draw") {
        points.player1 = rules.pointsDraw ?? 1;
        points.player2 = rules.pointsDraw ?? 1;
      }

      if (rules.bonusRules) {
        // Whitewash bonus (winner won all frames, loser won 0)
        if (rules.bonusRules.whitewash) {
          if (player1FramesWon > 0 && player2FramesWon === 0) {
            points.player1 += rules.bonusRules.whitewash;
          } else if (player2FramesWon > 0 && player1FramesWon === 0) {
            points.player2 += rules.bonusRules.whitewash;
          }
        }
        // Decider bonus (match went to final frame)
        if (rules.bonusRules.decider) {
          const totalFrames = (player1FramesWon || 0) + (player2FramesWon || 0);
          const bestOf = rules.bestOfFrames || totalFrames;
          if (totalFrames === bestOf) {
            // Both players get the decider bonus
            points.player1 += winner === "player1" ? rules.bonusRules.decider : 0;
            points.player2 += winner === "player2" ? rules.bonusRules.decider : 0;
          }
        }
      }
    }

    return points;
  },

  /**
   * Detect if a match is a whitewash
   */
  isWhitewash(match) {
    const p1 = match.player1FramesWon || 0;
    const p2 = match.player2FramesWon || 0;
    return (p1 > 0 && p2 === 0) || (p2 > 0 && p1 === 0);
  },

  /**
   * Detect if a match went to a decider frame
   */
  isDecider(match, bestOfFrames) {
    const totalFrames = (match.player1FramesWon || 0) + (match.player2FramesWon || 0);
    return totalFrames === bestOfFrames;
  },

  /** Snooker: max break per column from stored frame-details JSON. */
  _maxBreaksFromFrameDetailsArray(raw) {
    if (!raw) return { p1: 0, p2: 0 };
    let arr = raw;
    if (typeof raw === "string") {
      try {
        arr = JSON.parse(raw);
      } catch {
        return { p1: 0, p2: 0 };
      }
    }
    if (!Array.isArray(arr)) return { p1: 0, p2: 0 };
    let p1 = 0;
    let p2 = 0;
    for (const frame of arr) {
      const b1 = Number(frame?.player1Break) || 0;
      const b2 = Number(frame?.player2Break) || 0;
      if (b1 > p1) p1 = b1;
      if (b2 > p2) p2 = b2;
    }
    return { p1, p2 };
  },

  /**
   * Extract sport-specific stats from frame details
   */
  extractSportSpecificStats(frameDetails, sport) {
    if (!frameDetails) return { breaks50Plus: 0, breaks100Plus: 0, ballsPotted: 0, blackFinishes: 0, sevenBallWins: 0 };

    let arr = frameDetails;
    if (typeof frameDetails === "string") {
      try {
        arr = JSON.parse(frameDetails);
      } catch {
        return { breaks50Plus: 0, breaks100Plus: 0, ballsPotted: 0, blackFinishes: 0, sevenBallWins: 0 };
      }
    }
    if (!Array.isArray(arr)) return { breaks50Plus: 0, breaks100Plus: 0, ballsPotted: 0, blackFinishes: 0, sevenBallWins: 0 };

    const stats = { breaks50Plus: 0, breaks100Plus: 0, ballsPotted: 0, blackFinishes: 0, sevenBallWins: 0 };

    if (sport === "snooker") {
      arr.forEach(frame => {
        const p1Break = Number(frame?.player1Break || frame?.player1HighestBreak) || 0;
        const p2Break = Number(frame?.player2Break || frame?.player2HighestBreak) || 0;
        if (p1Break >= 50) stats.breaks50Plus++;
        if (p1Break >= 100) stats.breaks100Plus++;
        if (p2Break >= 50) stats.breaks50Plus++;
        if (p2Break >= 100) stats.breaks100Plus++;
      });
    } else if (sport === "pool") {
      arr.forEach(frame => {
        const p1Balls = Number(frame?.player1BallsPotted) || 0;
        const p2Balls = Number(frame?.player2BallsPotted) || 0;
        stats.ballsPotted += p1Balls + p2Balls;
        if (frame?.player1SevenBall) stats.sevenBallWins++;
        if (frame?.player2SevenBall) stats.sevenBallWins++;
      });
    } else if (sport === "pooker") {
      arr.forEach(frame => {
        const p1Balls = Number(frame?.player1BallsPotted) || 0;
        const p2Balls = Number(frame?.player2BallsPotted) || 0;
        stats.ballsPotted += p1Balls + p2Balls;
        if (frame?.player1BlackFinish) stats.blackFinishes++;
        if (frame?.player2BlackFinish) stats.blackFinishes++;
      });
    }

    return stats;
  },

  /**
   * Calculate streak string (e.g., W3, L2, D1)
   */
  calculateStreak(matchHistory) {
    if (!matchHistory || matchHistory.length === 0) return "-";

    const reversed = [...matchHistory].reverse();
    const lastResult = reversed[0].outcome;
    let count = 0;

    for (const entry of reversed) {
      if (entry.outcome === lastResult) {
        count++;
      } else {
        break;
      }
    }

    return `${lastResult}${count}`;
  },

  /**
   * Highest break for each side of the match (player1 slot vs player2 slot).
   * Uses both frame-detail columns when only one JSON blob is populated.
   */
  getPerPlayerHighestBreaksFromMatch(match) {
    const d1 = this._maxBreaksFromFrameDetailsArray(match.player1FrameDetails);
    const d2 = this._maxBreaksFromFrameDetailsArray(match.player2FrameDetails);
    const legacy1 = Number(match.player1HighestBreak) || 0;
    const legacy2 = Number(match.player2HighestBreak) || 0;
    return {
      p1: Math.max(d1.p1, d2.p1, legacy1),
      p2: Math.max(d1.p2, d2.p2, legacy2),
    };
  },

  /**
   * Calculate standings for a round/group
   * @param {object} options.formatType - TournamentFormat.type; when "round_robin", only head-to-head
   *   matches (both player1Id and player2Id) contribute — no points for bye/rest rows (e.g. legacy Swiss-style single-player rows).
   * @param {object} options.sport - Tournament sport (snooker, pool, pooker) for sport-specific stats
   */
  calculateStandings(participants, matches, scoringRules, options = {}) {
    const formatType = options.formatType;
    const sport = options.sport || "snooker";
    let effectiveMatches = Array.isArray(matches) ? matches : [];
    if (formatType === "round_robin") {
      effectiveMatches = effectiveMatches.filter(
        (m) => m.player1Id && m.player2Id
      );
    }

    const standings = {};

    participants.forEach((part) => {
      const pid = part.playerId || part.id;
      standings[pid] = {
        playerId: pid,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        matchesDraw: 0,
        framesWon: 0,
        framesLost: 0,
        points: 0,
        frameDifference: 0,
        highestBreak: 0,
        // Sport-specific stats
        breaks50Plus: 0,
        breaks100Plus: 0,
        ballsPotted: 0,
        ballsConceded: 0,
        sevenBallWins: 0,
        blackFinishes: 0,
        whitewashes: 0,
        // Match history for streak calculation
        matchHistory: [],
        // Win percentage (calculated after)
        winPercentage: 0,
        streak: "-",
      };
    });

    // Sort matches by date for proper streak calculation
    effectiveMatches.sort((a, b) => {
      const dateA = a.playedDate || a.updatedAt || a.createdAt;
      const dateB = b.playedDate || b.updatedAt || b.createdAt;
      return new Date(dateA) - new Date(dateB);
    });

    effectiveMatches.forEach((match) => {
      const isByeMatch = match.status === "bye" || match.isBye || (!match.player2Id && !match.isWalkover);
      if (match.status !== "completed" && !isByeMatch) return;

      const pts = this.calculateMatchPoints(match, scoringRules);
      const hb = this.getPerPlayerHighestBreaksFromMatch(match);

      // Extract sport-specific stats from frame details
      const p1Stats = this.extractSportSpecificStats(match.player1FrameDetails, sport);
      const p2Stats = this.extractSportSpecificStats(match.player2FrameDetails, sport);

      // Check if this is a whitewash
      const isWhitewash = this.isWhitewash(match);

      console.log('[calculateStandings] Processing match:', {
        matchId: match.id,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        winner: match.winner,
        player1Points: pts.player1,
        player2Points: pts.player2,
        isBye: isByeMatch,
        frameDetails: {
          player1Frames: match.player1FramesWon,
          player2Frames: match.player2FramesWon
        }
      });

      if (standings[match.player1Id]) {
        if (!isByeMatch) {
          standings[match.player1Id].matchesPlayed++;
          standings[match.player1Id].points += pts.player1;
          standings[match.player1Id].framesWon += match.player1FramesWon || 0;
          standings[match.player1Id].framesLost += match.player2FramesWon || 0;
          if (match.winner === "player1") standings[match.player1Id].matchesWon++;
          else if (match.winner === "player2") standings[match.player1Id].matchesLost++;
          else if (match.winner === "draw") standings[match.player1Id].matchesDraw++;
        }
        // Highest break still counts even if it's a bye?
        // (Usually byes don't have breaks, but we'll stick to 'not affect standings')
        standings[match.player1Id].highestBreak = Math.max(
          standings[match.player1Id].highestBreak || 0,
          hb.p1
        );

        // Sport-specific stats
        standings[match.player1Id].breaks50Plus += p1Stats.breaks50Plus;
        standings[match.player1Id].breaks100Plus += p1Stats.breaks100Plus;
        standings[match.player1Id].ballsPotted += p1Stats.ballsPotted;
        standings[match.player1Id].ballsConceded += p2Stats.ballsPotted; // Opponent's balls
        standings[match.player1Id].sevenBallWins += p1Stats.sevenBallWins;
        standings[match.player1Id].blackFinishes += p1Stats.blackFinishes;

        // Track whitewash wins
        if (isWhitewash && match.winner === "player1") {
          standings[match.player1Id].whitewashes++;
        }

        // Track match outcome - only if not a bye match
        if (!isByeMatch) {
          if (match.winner === "player1") {
            standings[match.player1Id].matchHistory.push({
              date: match.playedDate || match.updatedAt,
              outcome: match.isWalkover ? "WO" : "W"
            });
          } else if (match.winner === "player2") {
            standings[match.player1Id].matchHistory.push({
              date: match.playedDate || match.updatedAt,
              outcome: match.isWalkover ? "WO" : "L"
            });
          } else if (match.winner === "draw") {
            standings[match.player1Id].matchHistory.push({
              date: match.playedDate || match.updatedAt,
              outcome: "D"
            });
          }
        }
      }

      if (standings[match.player2Id] && !isByeMatch) {
        standings[match.player2Id].matchesPlayed++;
        standings[match.player2Id].points += pts.player2;
        standings[match.player2Id].framesWon += match.player2FramesWon || 0;
        standings[match.player2Id].framesLost += match.player1FramesWon || 0;
        if (match.winner === "player2") standings[match.player2Id].matchesWon++;
        else if (match.winner === "player1") standings[match.player2Id].matchesLost++;
        else if (match.winner === "draw") standings[match.player2Id].matchesDraw++;
        standings[match.player2Id].highestBreak = Math.max(
          standings[match.player2Id].highestBreak || 0,
          hb.p2
        );

        // Sport-specific stats
        standings[match.player2Id].breaks50Plus += p2Stats.breaks50Plus;
        standings[match.player2Id].breaks100Plus += p2Stats.breaks100Plus;
        standings[match.player2Id].ballsPotted += p2Stats.ballsPotted;
        standings[match.player2Id].ballsConceded += p1Stats.ballsPotted; // Opponent's balls
        standings[match.player2Id].sevenBallWins += p2Stats.sevenBallWins;
        standings[match.player2Id].blackFinishes += p2Stats.blackFinishes;

        // Track whitewash wins
        if (isWhitewash && match.winner === "player2") {
          standings[match.player2Id].whitewashes++;
        }

        // Track match outcome - only if not a bye match
        if (!isByeMatch) {
          if (match.winner === "player2") {
            standings[match.player2Id].matchHistory.push({
              date: match.playedDate || match.updatedAt,
              outcome: match.isWalkover ? "WO" : "W"
            });
          } else if (match.winner === "player1") {
            standings[match.player2Id].matchHistory.push({
              date: match.playedDate || match.updatedAt,
              outcome: match.isWalkover ? "WO" : "L"
            });
          } else if (match.winner === "draw") {
            standings[match.player2Id].matchHistory.push({
              date: match.playedDate || match.updatedAt,
              outcome: "D"
            });
          }
        }
      }
    });

    // Calculate derived stats
    Object.values(standings).forEach((entry) => {
      entry.frameDifference = entry.framesWon - entry.framesLost;

      // Calculate win percentage
      if (entry.matchesPlayed > 0) {
        entry.winPercentage = Math.round((entry.matchesWon / entry.matchesPlayed) * 100);
      }

      // Calculate streak
      entry.streak = this.calculateStreak(entry.matchHistory);
    });

    console.log('[calculateStandings] Final standings calculated:', Object.values(standings).map(s => ({
      playerId: s.playerId,
      matchesPlayed: s.matchesPlayed,
      matchesWon: s.matchesWon,
      points: s.points,
      framesWon: s.framesWon,
      framesLost: s.framesLost
    })));

    return standings;
  },

  /**
   * Apply tie-breaker logic with head-to-head support
   * Default priority: points (highest), then win percentage (highest)
   */
  applyTiebreakers(standingsArray, tieBreakPriority = [], completedMatches = []) {
    const defaultPriority = [
      "points",
      "win_percentage",
      "head_to_head",
      "frame_difference",
      "frames_won",
      "points_difference",
      "highest_break",
      "random",
    ];

    // ALWAYS include "points" as the first criterion
    let priority;
    // Ensure tieBreakPriority is an array
    const customPriority = Array.isArray(tieBreakPriority) ? tieBreakPriority : [];

    if (customPriority.length > 0) {
      // If points is not already first, add it
      if (customPriority[0] !== "points") {
        priority = ["points", ...customPriority.filter(p => p !== "points")];
      } else {
        priority = customPriority;
      }
    } else {
      priority = defaultPriority;
    }

    // Build head-to-head lookup from completed matches
    const h2h = {};
    completedMatches.forEach((m) => {
      if (!m.player1Id || !m.player2Id || m.status !== "completed") return;
      const key1 = `${m.player1Id}_${m.player2Id}`;
      const key2 = `${m.player2Id}_${m.player1Id}`;
      if (!h2h[key1]) h2h[key1] = { wins: 0, losses: 0 };
      if (!h2h[key2]) h2h[key2] = { wins: 0, losses: 0 };
      if (m.winner === "player1") {
        h2h[key1].wins++;
        h2h[key2].losses++;
      } else if (m.winner === "player2") {
        h2h[key1].losses++;
        h2h[key2].wins++;
      }
    });

    return standingsArray.sort((a, b) => {
      for (const criterion of priority) {
        let result = 0;
        switch (criterion) {
          case "points":
            result = b.points - a.points;
            break;
          case "win_percentage": {
            // Calculate win percentage: (wins / matches played) * 100
            const aMatches = a.matchesPlayed || 0;
            const bMatches = b.matchesPlayed || 0;
            const aWinPct = aMatches > 0 ? ((a.matchesWon || 0) / aMatches) * 100 : 0;
            const bWinPct = bMatches > 0 ? ((b.matchesWon || 0) / bMatches) * 100 : 0;
            result = bWinPct - aWinPct;
            break;
          }
          case "head_to_head": {
            const key = `${a.playerId}_${b.playerId}`;
            const record = h2h[key];
            if (record) result = record.wins - record.losses;
            break;
          }
          case "frame_difference":
            result = b.frameDifference - a.frameDifference;
            break;
          case "frames_won":
            result = b.framesWon - a.framesWon;
            break;
          case "points_difference":
            result = (b.pointsDifference || 0) - (a.pointsDifference || 0);
            break;
          case "highest_break":
            result = (b.highestBreak || 0) - (a.highestBreak || 0);
            break;
          case "random":
            result = Math.random() - 0.5;
            break;
        }
        if (result !== 0) return result;
      }
      return 0;
    });
  },

  /**
   * Apply handicap adjustments to match frames and points
   * Supports manual handicap (fixed frame adjustment) and skill-based handicap
   *
   * @param {Object} match - Match object with frames and scores
   * @param {Object} handicapConfig - {enabled, type, method, settings}
   * @param {Object} playerProfiles - {player1: {skillLevel, handicap}, player2: {...}}
   * @returns {Object} Match with adjusted frames and points
   */
  applyHandicapToMatch(match, handicapConfig, playerProfiles = {}) {
    if (!handicapConfig || !handicapConfig.enabled) {
      return match; // No handicap - return as is
    }

    const adjusted = { ...match };
    const { type = "manual", method = {} } = handicapConfig;

    if (type === "manual") {
      // Manual handicap: fixed frame adjustment
      const handicap1 = method.player1Handicap || 0;
      const handicap2 = method.player2Handicap || 0;

      // Apply handicap to frames won
      adjusted.player1FramesWon = Math.max(0, (adjusted.player1FramesWon || 0) + handicap1);
      adjusted.player2FramesWon = Math.max(0, (adjusted.player2FramesWon || 0) + handicap2);
    } else if (type === "auto" || type === "skill_based") {
      // Auto/skill-based handicap: calculate based on player skill difference
      const profile1 = playerProfiles.player1 || {};
      const profile2 = playerProfiles.player2 || {};

      const skillDiff = (profile2.skillLevel || 0) - (profile1.skillLevel || 0);
      const handicapFactor = method.handicapPerSkillPoint || 0.5; // Frames per skill level difference
      const handicapFrames = Math.round(Math.abs(skillDiff) * handicapFactor);

      if (skillDiff > 0) {
        // Player 1 is lower skill, gets frames
        adjusted.player1FramesWon = (adjusted.player1FramesWon || 0) + handicapFrames;
      } else if (skillDiff < 0) {
        // Player 2 is lower skill, gets frames
        adjusted.player2FramesWon = (adjusted.player2FramesWon || 0) + handicapFrames;
      }
    }

    return adjusted;
  },

  /**
   * Apply sport-specific scoring rules
   * Different sports (snooker, pool, darts) have different bonus systems
   *
   * @param {Object} match - Match result with frame/point scores
   * @param {string} sport - Sport type: snooker|pool|darts
   * @param {Object} baseScoringRules - Base tournament rules
   * @returns {Object} Points with sport-specific bonuses applied
   */
  applySportSpecificRules(match, sport, baseScoringRules = {}) {
    let points = this.calculateMatchPoints(match, baseScoringRules);

    if (!sport) return points;

    const rules = baseScoringRules || {};

    switch (sport.toLowerCase()) {
      case "snooker":
        // Snooker-specific bonuses
        if (match.player1HighestBreak >= 100) {
          points.player1 += rules.centuryBreakBonus || 1;
        }
        if (match.player2HighestBreak >= 100) {
          points.player2 += rules.centuryBreakBonus || 1;
        }

        // Bonus for maximum break (147 in snooker)
        if (match.player1HighestBreak === 147) {
          points.player1 += rules.maximumBreakBonus || 5;
        }
        if (match.player2HighestBreak === 147) {
          points.player2 += rules.maximumBreakBonus || 5;
        }
        break;

      case "pool":
        // Pool-specific bonuses
        // 8-ball: point for break win (breaking team)
        if (match.breaker && match.breaker === "player1") {
          points.player1 += rules.breakBonus || 0;
        } else if (match.breaker === "player2") {
          points.player2 += rules.breakBonus || 0;
        }

        // Bonus for running table (winning without opponent scoring)
        if (match.player1FramesWon > 0 && match.player2FramesWon === 0) {
          points.player1 += rules.runningTableBonus || 2;
        } else if (match.player2FramesWon > 0 && match.player1FramesWon === 0) {
          points.player2 += rules.runningTableBonus || 2;
        }
        break;

      case "darts":
        // Darts-specific bonuses
        // Checkout bonus (finishing throw)
        if (match.player1CheckoutThrows) {
          const checkoutBonus = Math.max(0, 10 - (match.player1CheckoutThrows || 0));
          points.player1 += Math.min(checkoutBonus, rules.checkoutBonusMax || 5);
        }
        if (match.player2CheckoutThrows) {
          const checkoutBonus = Math.max(0, 10 - (match.player2CheckoutThrows || 0));
          points.player2 += Math.min(checkoutBonus, rules.checkoutBonusMax || 5);
        }

        // High-three bonus (highest three-dart average above threshold)
        if ((match.player1AvgPerSet || 0) > (rules.highThreeThreshold || 100)) {
          points.player1 += rules.highThreeBonus || 1;
        }
        if ((match.player2AvgPerSet || 0) > (rules.highThreeThreshold || 100)) {
          points.player2 += rules.highThreeBonus || 1;
        }
        break;
    }

    return points;
  }
};

// ============================================================================
// RANKING SYSTEM
// ============================================================================

const RankingEngine = {
  /**
   * NEW: 3-tier ranking model per specification
   * Points structure: stageReached → points awarded
   * Tiers: Tier1 (Major Events), Tier2 (Club Championships), Tier3 (Local/Open)
   */
  TIER_3_MODEL_POINTS: {
    tier1: {
      Winner: 500,
      "Runner-Up": 300,
      "Semi-Final": 180,
      "Quarter-Final": 100,
      "Last16": 50,
      "Last32": 25,
    },
    tier2: {
      Winner: 200,
      "Runner-Up": 120,
      "Semi-Final": 70,
      "Quarter-Final": 40,
      "Last16": 20,
    },
    tier3: {
      Winner: 100,
      "Runner-Up": 60,
      "Semi-Final": 35,
      "Quarter-Final": 20,
    },
  },

  /**
   * Mapping from old 5-tier enum to new 3-tier model
   * For backward compatibility with existing tournament records
   */
  TIER_MAPPING: {
    international: "tier1",
    national: "tier1",
    regional: "tier2",
    county: "tier2",
    local: "tier3",
  },

  /**
   * Minimum participants required per tier to award full points
   * Below threshold = 50% point reduction
   */
  TIER_MINIMUMS_NEW: {
    tier1: 16,
    tier2: 12,
    tier3: 8,
  },

  /**
   * Legacy: Keep 5-tier point tables for backward compatibility
   * Will be phased out in favor of stage-based awards
   */
  DEFAULT_POINTS: {
    international: { 1: 1000, 2: 600, 3: 360, 4: 220 },
    national: { 1: 500, 2: 300, 3: 180, 4: 100 },
    regional: { 1: 200, 2: 120, 3: 60, 4: 30 },
    county: { 1: 100, 2: 60, 3: 30, 4: 10 },
    local: { 1: 50, 2: 30, 3: 15, 4: 5 },
  },

  // Minimum approved participants required for ranking points per tier (legacy)
  TIER_MINIMUMS: {
    international: 32,
    national: 16,
    regional: 8,
    county: 4,
    local: 2,
  },

  /**
   * Map finishing positions to tournament round names for historical record (legacy)
   */
  POSITION_TO_ROUND_MAP: {
    1: "Win",           // Champion
    2: "Final",         // Runner-up
    3: "Semi-final",    // Semi-finalist
    4: "Quarter-final", // Quarter-finalist
  },

  /**
   * NEW: Map finishing positions to stage names (used for stage-based awards)
   * Derives stage reached based on how far player advanced in the draw
   */
  POSITION_TO_STAGE_MAP: {
    1: "Winner",
    2: "Runner-Up",
    3: "Semi-Final",
    4: "Semi-Final",
    5: "Quarter-Final",
    6: "Quarter-Final",
    7: "Quarter-Final",
    8: "Quarter-Final",
    9: "Last16",
    10: "Last16",
    11: "Last16",
    12: "Last16",
    13: "Last16",
    14: "Last16",
    15: "Last16",
    16: "Last16",
    17: "Last32",
    // 17-32: Last32
  },

  /**
   * Get stage name for any finishing position (generalized)
   */
  getStageFromPosition(position) {
    if (position <= 0 || !position) return null;
    if (position === 1) return "Winner";
    if (position === 2) return "Runner-Up";
    if (position <= 4) return "Semi-Final";
    if (position <= 8) return "Quarter-Final";
    if (position <= 16) return "Last16";
    if (position <= 32) return "Last32";
    return "Participated";  // For very large draws
  },

  /**
   * Award ranking points for tournament completion.
   * NEW: Implements 3-tier model, stage-based awards, 50% below-threshold weighting
   * Enforces: must-win-at-least-1-match rule, tier minimums, 12-month rolling expiry.
   */
  async awardRankingPoints(tournament, participants, completedMatches) {
    const rankingPointHistory = [];

    // Check if tournament is marked for ranking at all
    if (!tournament?.ranked) {
      return { history: [], skippedReason: "tournament_not_ranked" };
    }

    const sport = String(tournament.sport || "").toLowerCase();
    if (!["snooker", "pool", "pooker"].includes(sport)) {
      return { history: [], skippedReason: "unsupported_sport" };
    }

    // Note: gameSeasonId is optional now (rolling 12-month doesn't require season context)
    const seasonId = tournament.gameSeasonId || null;

    const approvedCount = participants.filter((p) => p.status === "approved").length;

    // Get the new tier level (tier1, tier2, tier3) from 5-tier tournament.tier
    const tieredOldTier = this.TIER_MAPPING[tournament.tier] || "tier3";
    const tierMinRequired = this.TIER_MINIMUMS_NEW[tieredOldTier] || 8;

    // NEW: Improved weighting based on participant count
    // Full points (100%) = at or above tier minimum
    // 50% points = half to tier minimum
    // 25% points = below half (but at least 2 players)
    let pointsMultiplier = 1.0;
    const halfThreshold = Math.ceil(tierMinRequired / 2);

    if (approvedCount >= tierMinRequired) {
      pointsMultiplier = 1.0;  // Full points
    } else if (approvedCount >= halfThreshold) {
      pointsMultiplier = 0.5;  // 50% weighting
    } else {
      pointsMultiplier = 0.25; // 25% weighting for very small tournaments (2-3 players)
    }

    // Override check: min players required to award ANY points (even at 50% weighting)
    // Changed from half-threshold to allow all tournaments with 2+ players
    const absoluteMinimum = 2;  // Allow tournaments with 2+ participants
    if (approvedCount < absoluteMinimum) {
      return {
        history: [],
        skippedReason: `Only ${approvedCount} approved players, need at least ${absoluteMinimum}`,
      };
    }

    // ── Double-award guard ─────────────────────────────────────────────────────
    // If any active ranking history rows already exist for this tournament, skip.
    const existingCount = await RankingPointsHistory.count({
      where: { tournamentId: tournament.id, isActive: true, eventType: "award" },
    });
    if (existingCount > 0) {
      return { history: [], skippedReason: "already_awarded" };
    }

    // Build a set of playerIds who won at least 1 match
    const winnersSet = new Set();
    completedMatches.forEach((m) => {
      if (m.status !== "completed") return;
      if (m.winner === "player1" && m.player1Id) winnersSet.add(m.player1Id);
      if (m.winner === "player2" && m.player2Id) winnersSet.add(m.player2Id);
    });

    for (const participant of participants) {
      if (participant.status !== "approved") continue;
      const { playerId, finishingPosition, finishingRound } = participant;

      // Must-win-at-least-1-match rule: no ranking points for players who won zero matches
      if (!winnersSet.has(playerId)) continue;

      const pos = finishingPosition || participants.length;

      // NEW: Derive stage from position
      const stageReached = this.getStageFromPosition(pos);
      if (!stageReached || stageReached === "Participated") continue;

      // NEW: Get points from 3-tier stage-based table
      const tierPointTable = this.TIER_3_MODEL_POINTS[tieredOldTier] || {};
      let basePoints = tierPointTable[stageReached] || 0;
      if (basePoints <= 0) continue;

      // NEW: Apply 50% weighting if below threshold
      const finalPoints = Math.floor(basePoints * pointsMultiplier);

      // Use provided round name or derive from stage
      const roundName = finishingRound || stageReached;

      rankingPointHistory.push({
        playerId,
        tournamentId: tournament.id,
        seasonId,
        sport,
        tier: tournament.tier,
        eventType: "award",
        dedupeKey: RankingSnapshotService.buildAwardDedupeKey({ tournamentId: tournament.id, playerId }),
        pointsAwarded: finalPoints,
        pointsAdjustment: 0,
        currentPoints: finalPoints,
        finishingPosition: pos,
        finishingRound: roundName,
        roundReached: roundName,
        stageReached: stageReached,  // NEW: track the stage
        thresholdWeightPercentage: Math.round(pointsMultiplier * 100),  // Track weighting: 100, 50, or 25
        isActive: true,
        isOfficialTournament: true,
        expiresAt: this.calculateExpiryDate(tournament.rankingDecayType),
      });
    }

    return { history: rankingPointHistory };
  },

  calculatePoints(tier, finishingPosition, customPoints = null) {
    if (customPoints && typeof customPoints === "object") {
      const tierTable = customPoints[tier] || customPoints;
      if (tierTable[finishingPosition] !== undefined) return tierTable[finishingPosition];
    }
    const pointsTable = this.DEFAULT_POINTS[tier] || {};
    return pointsTable[finishingPosition] || 0;
  },

  calculateExpiryDate(decayType) {
    const now = new Date();
    if (decayType === "rolling_12_months" || !decayType) {
      return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    } else if (decayType === "fixed_season") {
      return new Date(now.getFullYear() + 1, 8, 1);
    }
    return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  },

  /**
   * Get the tournament round name for a finishing position
   * @param {number} position - Finishing position (1-4)
   * @returns {string} Round name (Win/Final/Semi-final/Quarter-final) or numeric string for positions > 4
   */
  getRoundName(position) {
    if (!position || position < 1) return "eliminated";
    return this.POSITION_TO_ROUND_MAP[position] || `Position ${position}`;
  },

  /**
   * Update player ranking profile after tournament completion.
   * @param {string}   playerId              - Player UUID
   * @param {number}   rankingPointsAwarded  - Points to add
   * @param {string[]} [scopeArray=[]]       - From tournament.rankingScope, e.g. ['county','regional']
   */
  async updatePlayerRankingProfile(playerId, rankingPointsAwarded, scopeArray = []) {
    let profile = await PlayerRankingProfile.findOne({ where: { playerId } });

    const scopeUpdates = {};
    if (scopeArray.includes("county")) scopeUpdates.countyRankingPoints = null; // set below after load
    if (scopeArray.includes("regional")) scopeUpdates.regionalRankingPoints = null;
    if (scopeArray.includes("national")) scopeUpdates.nationalRankingPoints = null;

    if (!profile) {
      const createData = {
        playerId,
        rolling12MonthPoints: rankingPointsAwarded,
        lastRankingUpdate: new Date(),
      };
      if (scopeArray.includes("county")) createData.countyRankingPoints = rankingPointsAwarded;
      if (scopeArray.includes("regional")) createData.regionalRankingPoints = rankingPointsAwarded;
      if (scopeArray.includes("national")) createData.nationalRankingPoints = rankingPointsAwarded;
      return await PlayerRankingProfile.create(createData);
    }

    const updatedRolling = (profile.rolling12MonthPoints || 0) + rankingPointsAwarded;
    const updateData = { rolling12MonthPoints: updatedRolling, lastRankingUpdate: new Date() };
    if (scopeArray.includes("county")) updateData.countyRankingPoints = (profile.countyRankingPoints || 0) + rankingPointsAwarded;
    if (scopeArray.includes("regional")) updateData.regionalRankingPoints = (profile.regionalRankingPoints || 0) + rankingPointsAwarded;
    if (scopeArray.includes("national")) updateData.nationalRankingPoints = (profile.nationalRankingPoints || 0) + rankingPointsAwarded;
    return await profile.update(updateData);
  },

  /**
   * Gradual decay schedule for ranking points (12-month rolling)
   * Months 1-6:   100% (full points)
   * Months 7-9:   75%
   * Months 10-11: 50%
   * Month 12+:    0% (expired)
   *
   * Ranking Points Decay disabled temporarily — schedule not used while decay is off.
   */
  /* Original DECAY_SCHEDULE (disabled temporarily):
  static DECAY_SCHEDULE = [
    { maxMonths: 6, percentage: 100 },
    { maxMonths: 9, percentage: 75 },
    { maxMonths: 11, percentage: 50 },
    { maxMonths: 12, percentage: 0 },
  ];
  */
  DECAY_SCHEDULE: [],

  /**
   * Calculate the decay percentage for a ranking point record based on its age
   * Ranking Points Decay disabled temporarily — returns full value (no decay).
   */
  getDecayPercentage(/* awardedDate */) {
    // Ranking Points Decay disabled temporarily
    return 100;
    /*
    const now = new Date();
    const diffMs = now - new Date(awardedDate);
    const months = diffMs / (1000 * 60 * 60 * 24 * 30.44); // approximate months

    for (const bracket of this.DECAY_SCHEDULE) {
      if (months <= bracket.maxMonths) return bracket.percentage;
    }
    return 0; // expired
    */
  },

  /**
   * Apply gradual decay to all active ranking points and update player profiles.
   * Should be called daily via cron/interval.
   * Returns { processed, expired, decayed }
   *
   * Ranking Points Decay disabled temporarily — no DB updates.
   */
  async applyRankingDecay() {
    // Ranking Points Decay disabled temporarily
    return { processed: 0, expired: 0, decayed: 0 };
    /*
    const activeRecords = await RankingPointsHistory.findAll({
      where: { isActive: true },
    });

    let processed = 0, expired = 0, decayed = 0;
    // Track per-player total so we can batch-update profiles
    const playerTotals = {};

    for (const record of activeRecords) {
      const awardedDate = record.createdAt || record.awardedDate;
      const pct = this.getDecayPercentage(awardedDate);
      const currentDecayed = Math.round(record.pointsAwarded * (pct / 100));
      processed++;

      if (pct === 0) {
        // Fully expired
        await record.update({
          isActive: false,
          currentPoints: 0,
          decayPercentage: 0,
          decayAppliedDate: new Date(),
          decaySchedule: { expired: true, age: 12 },
        });
        expired++;
      } else if (currentDecayed !== record.currentPoints) {
        // Decay changed
        await record.update({
          currentPoints: currentDecayed,
          decayPercentage: pct,
          decayAppliedDate: new Date(),
          decaySchedule: { percentage: pct, currentPoints: currentDecayed },
        });
        decayed++;
      }

      // Track player total
      const pid = record.playerId;
      if (!playerTotals[pid]) playerTotals[pid] = 0;
      if (pct > 0) {
        playerTotals[pid] += currentDecayed;
      }
    }

    // Update all affected player ranking profiles
    for (const [playerId, total] of Object.entries(playerTotals)) {
      const profile = await PlayerRankingProfile.findOne({ where: { playerId } });
      if (profile) {
        await profile.update({ rolling12MonthPoints: total });
      }
    }

    return { processed, expired, decayed };
    */
  },

  /**
   * Expire old ranking points (legacy method — now delegates to applyRankingDecay)
   * Ranking Points Decay disabled temporarily
   */
  async expireOldRankingPoints() {
    // Ranking Points Decay disabled temporarily — was: return this.applyRankingDecay();
    return { processed: 0, expired: 0, decayed: 0 };
  },

  /**
   * Handle cancellation: void all ranking points for a tournament
   */
  async voidTournamentPoints(tournamentId, reason = "Tournament cancelled") {
    const records = await RankingPointsHistory.findAll({
      where: { tournamentId, isActive: true },
    });

    for (const record of records) {
      await record.update({
        isActive: false,
        voidDate: new Date(),
        voidReason: reason,
      });
      const profile = await PlayerRankingProfile.findOne({ where: { playerId: record.playerId } });
      if (profile) {
        const newPoints = Math.max(0, (profile.rolling12MonthPoints || 0) - record.pointsAwarded);
        await profile.update({ rolling12MonthPoints: newPoints });
      }
    }

    return records.length;
  }
};

// ============================================================================
// WITHDRAWAL HANDLER
// ============================================================================

/** Normalize organizer withdrawal rule keys and legacy aliases (wizard + API). */
function normalizeWithdrawalRules(raw = {}) {
  // before tournament start: "remove" | "forfeit" (matches TournamentCreationWizard Step 7)
  const rawBefore = raw.beforeStart ?? raw.before_start;
  let beforeStart = String(rawBefore ?? "remove").toLowerCase().trim();
  if (beforeStart !== "remove" && beforeStart !== "forfeit") beforeStart = "remove";

  const groupRaw =
    raw.duringGroup ||
    raw.groupStage ||
    "50percent";
  let duringGroup = groupRaw;
  if (duringGroup === "remove_all") duringGroup = "remove";
  if (duringGroup === "50_percent_rule") duringGroup = "50percent";

  const koRaw = raw.duringKnockout || raw.knockout || "walkover";
  let duringKnockout = String(koRaw ?? "walkover").toLowerCase().trim();
  // Normalize common variations
  if (duringKnockout === "void" || duringKnockout === "voided") duringKnockout = "void";
  if (!["void", "walkover"].includes(duringKnockout)) duringKnockout = "walkover";

  return {
    beforeStart,
    duringGroup,
    duringKnockout,
  };
}

function parseFormatRoundFormats(format) {
  if (!format?.roundFormats) return null;
  const raw = format.roundFormats;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return typeof raw === "object" ? raw : null;
}

/** Frames awarded to walkover winner for a match (from tournament format / match row). */
function winFramesForWalkoverMatch(match, format) {
  let bestOf = match.bestOfFrames != null && Number(match.bestOfFrames) > 0 ? Number(match.bestOfFrames) : null;
  const map = parseFormatRoundFormats(format);
  if (bestOf == null && map) {
    const rn = match.roundNumber;
    bestOf =
      map[String(rn)] ??
      map[rn] ??
      (match.roundType ? map[match.roundType] : null) ??
      map.default ??
      map.knockout;
  }
  if (bestOf == null && format?.bestOfFrames != null) bestOf = Number(format.bestOfFrames);
  if (bestOf == null || !Number.isFinite(bestOf) || bestOf < 1) bestOf = 5;
  return Math.max(1, Math.ceil(bestOf / 2));
}

const WithdrawalHandler = {
  /**
   * Process a player withdrawal from a tournament.
   *
   * Respects the per-tournament withdrawalRules configuration:
   *   withdrawalRules.beforeStart     = "remove" | "forfeit"
   *   withdrawalRules.duringGroup / groupStage = "remove" | "remove_all" | "50percent" | "50_percent_rule" | "walkover"
   *   withdrawalRules.duringKnockout / knockout = "walkover" | "void"
   *
   * Defaults: beforeStart="remove", duringGroup="50percent", duringKnockout="walkover"
   *
   * Returns { success, action, stage, voidedMatches, forfeitedMatches, walkoverMatchIds, roundsToProgress }
   * @param {object} [options] — e.g. { actorUserId } for audit when regenerating bracket
   */
  async processWithdrawal(tournamentId, playerId, reason = "", options = {}) {
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    if (["completed", "cancelled", "archived"].includes(tournament.status)) {
      throw new Error("Withdrawal is not allowed for this tournament status");
    }

    const participant = await TournamentParticipant.findOne({
      where: { tournamentId, playerId, status: "approved" },
    });
    if (!participant) throw new Error("Player is not an approved participant");

    // Resolve withdrawal rules (with per-tournament overrides or sensible defaults)
    // withdrawalRules is stored as JSON string in DB, so parse it first
    let withdrawalRulesObj = {};
    if (tournament.withdrawalRules) {
      try {
        withdrawalRulesObj = typeof tournament.withdrawalRules === "string"
          ? JSON.parse(tournament.withdrawalRules)
          : tournament.withdrawalRules;
      } catch (e) {
        console.warn("Failed to parse withdrawalRules:", e.message);
        withdrawalRulesObj = {};
      }
    }
    const rules = normalizeWithdrawalRules(withdrawalRulesObj);
    const beforeStartRule = rules.beforeStart;
    const duringGroupRule = rules.duringGroup;
    const duringKnockoutRule = rules.duringKnockout;

    console.log(`[processWithdrawal] Rules parsed: beforeStart=${beforeStartRule}, duringGroup=${duringGroupRule}, duringKnockout=${duringKnockoutRule}`);

    const walkoverMatchIds = [];
    const roundsToProgress = new Set();

    // "Before start" = competition not underway: not in_progress, and no match completed or in play yet.
    const playedOrLiveMatch = await TournamentMatch.findOne({
      where: {
        tournamentId,
        status: { [Op.in]: ["completed", "in_progress"] },
      },
    });

    const status = tournament.status;
    let stage = "before_start";
    if (tournament.status === "in_progress" || playedOrLiveMatch) {
      const format = await TournamentFormat.findOne({ where: { tournamentId } });
      if (format && format.type === "groups_knockout") {
        const knockoutMatch = await TournamentMatch.findOne({
          where: { tournamentId, roundType: { [Op.notIn]: ["group_stage"] }, [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }] },
        });
        stage = knockoutMatch ? "during_knockout" : "during_group";
      } else if (format && format.type === "knockout") {
        stage = "during_knockout";
      } else if (format && format.type === "ladder") {
        stage = "during_group";
      } else {
        stage = "during_group";
      }
    }

    // Mark participant as withdrawn
    await participant.update({
      status: "withdrawn",
      withdrawnDate: new Date(),
      withdrawalReason: reason,
      withdrawalStage: stage,
    });

    let action = "withdrawn";
    let voidedMatches = 0;
    let forfeitedMatches = 0;

    if (stage === "before_start") {
      // ── BEFORE START ──────────────────────────────────────────────────────
      const formatForWalkover = await TournamentFormat.findOne({ where: { tournamentId } });

      if (beforeStartRule === "forfeit") {
        // Keep both players on the match row; withdrawing player takes automatic losses; opponents get wins.
        const pendingMatches = await TournamentMatch.findAll({
          where: {
            tournamentId,
            status: { [Op.in]: ["scheduled", "pending_confirmation", "in_progress"] },
            [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }],
          },
        });

        for (const match of pendingMatches) {
          const isP1 = match.player1Id === playerId;
          const winFrames = winFramesForWalkoverMatch(match, formatForWalkover);
          await match.update({
            status: "completed",
            winner: isP1 ? "player2" : "player1",
            isWalkover: true,
            player1FramesWon: isP1 ? 0 : winFrames,
            player2FramesWon: isP1 ? winFrames : 0,
          });
          walkoverMatchIds.push(match.id);
          if (match.roundNumber != null) roundsToProgress.add(match.roundNumber);
          forfeitedMatches++;
        }
        action = "forfeit_before_start";
      } else {
        // "remove": drop player from competition; rebuild bracket when nothing has been played, else shrink slots.
        let regenResult = { regenerated: false };
        try {
          const FixtureRegenerationService = require("../services/FixtureRegenerationService");
          regenResult = await FixtureRegenerationService.regenerateBracketAfterWithdrawal(
            tournamentId,
            options.actorUserId || null,
            { reason: reason || "player_withdrawal" }
          );
        } catch (regenErr) {
          console.error("[WithdrawalHandler] regenerateBracketAfterWithdrawal:", regenErr);
        }

        if (regenResult && regenResult.regenerated) {
          action =
            regenResult.reason === "single_player_remaining"
              ? "removed_before_start_one_player"
              : "removed_before_start_regenerated";
        } else {
          const pendingMatches = await TournamentMatch.findAll({
            where: {
              tournamentId,
              status: { [Op.in]: ["scheduled", "pending_confirmation"] },
              [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }],
            },
          });

          for (const match of pendingMatches) {
            const isP1 = match.player1Id === playerId;
            const winFrames = winFramesForWalkoverMatch(match, formatForWalkover);
            // NOT isWalkover for scoring: award pointsWin / pointsLoss (ScoringEngine), not pointsWalkover (default 3).
            // This is a bracket/bye adjustment after removal, not a no-show walkover — use "Mark as forfeit" for walkover points.
            await match.update({
              [isP1 ? "player1Id" : "player2Id"]: null,
              status: "completed",
              winner: isP1 ? "player2" : "player1",
              isWalkover: false,
              player1FramesWon: isP1 ? 0 : winFrames,
              player2FramesWon: isP1 ? winFrames : 0,
            });
            walkoverMatchIds.push(match.id);
            if (match.roundNumber != null) roundsToProgress.add(match.roundNumber);
            forfeitedMatches++;
          }
          action = "removed_before_start";
        }
      }

      const approvedRemaining = await TournamentParticipant.count({
        where: { tournamentId, status: "approved" },
      });
      await tournament.update({ currentParticipantCount: approvedRemaining });
    } else if (stage === "during_group") {
      // ── DURING GROUP STAGE ────────────────────────────────────────────────
      const allPlayerMatches = await TournamentMatch.findAll({
        where: {
          tournamentId,
          roundType: "group_stage",
          [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }],
        },
      });

      if (duringGroupRule === "remove") {
        // Void ALL their group matches regardless of completion %
        for (const match of allPlayerMatches) {
          await match.update({ status: "voided" });
          voidedMatches++;
        }
        action = "voided_group_results";

      } else if (duringGroupRule === "walkover") {
        // Award walkovers to ALL remaining opponents (ignore 50% threshold)
        const completedMatches = allPlayerMatches.filter(m => m.status === "completed" || m.status === "walkover");
        const pendingMatches = allPlayerMatches.filter(m =>
          m.status === "scheduled" || m.status === "pending_confirmation" || m.status === "in_progress"
        );

        for (const match of pendingMatches) {
          const isP1 = match.player1Id === playerId;
          await match.update({
            status: "completed",
            winner: isP1 ? "player2" : "player1",
            isWalkover: true,
            player1FramesWon: isP1 ? 0 : 1,
            player2FramesWon: isP1 ? 1 : 0,
          });
          walkoverMatchIds.push(match.id);
          if (match.roundNumber != null) roundsToProgress.add(match.roundNumber);
          forfeitedMatches++;
        }
        action = completedMatches.length > 0 ? "walkover_group_partial" : "walkover_group_all";

      } else {
        // "50percent" (default): apply the 50% rule
        const completedMatches = allPlayerMatches.filter(m => m.status === "completed" || m.status === "walkover");
        const totalMatches = allPlayerMatches.length;
        const completionPct = totalMatches > 0 ? (completedMatches.length / totalMatches) : 0;

        if (completionPct < 0.5) {
          // <50% completed: void ALL their results
          for (const match of allPlayerMatches) {
            await match.update({ status: "voided" });
            voidedMatches++;
          }
          action = "voided_group_results";
        } else {
          // >=50% completed: keep results, forfeit remaining as walkover losses
          const pendingMatches = allPlayerMatches.filter(m =>
            m.status === "scheduled" || m.status === "pending_confirmation" || m.status === "in_progress"
          );
          for (const match of pendingMatches) {
            const isP1 = match.player1Id === playerId;
            await match.update({
              status: "completed",
              winner: isP1 ? "player2" : "player1",
              isWalkover: true,
              player1FramesWon: isP1 ? 0 : 1,
              player2FramesWon: isP1 ? 1 : 0,
            });
            walkoverMatchIds.push(match.id);
            if (match.roundNumber != null) roundsToProgress.add(match.roundNumber);
            forfeitedMatches++;
          }
          action = "walkover_group_partial";
        }
      }

    } else {
      // ── KNOCKOUT (exclude group-stage rows when format is groups + knockout) ──
      const format = await TournamentFormat.findOne({ where: { tournamentId } });
      const knockoutWhere = {
        tournamentId,
        status: { [Op.in]: ["scheduled", "pending_confirmation", "in_progress"] },
        [Op.or]: [{ player1Id: playerId }, { player2Id: playerId }],
      };
      if (format && format.type === "groups_knockout") {
        knockoutWhere.roundType = { [Op.ne]: "group_stage" };
      }

      const pendingMatches = await TournamentMatch.findAll({ where: knockoutWhere });

      console.log(`[processWithdrawal] Knockout stage: duringKnockoutRule="${duringKnockoutRule}", pendingMatches=${pendingMatches.length}`);

      if (duringKnockoutRule === "void") {
        // ── KNOCKOUT VOID RULE ──
        // Match is marked as voided — NO POINTS, NO WINNER, NO PROGRESSION
        console.log(`[processWithdrawal] Applying VOID rule to ${pendingMatches.length} pending knockout matches`);
        for (const match of pendingMatches) {
          await match.update({
            status: "voided",
            winner: null,  // CRITICAL: Clear winner so no points awarded
            player1FramesWon: null,  // Clear frames
            player2FramesWon: null,
            isWalkover: false,  // NOT a walkover - it's voided
          });
          console.log(`[processWithdrawal] Voided match ${match.id}: status=voided, winner=null`);
          voidedMatches++;
        }
        action = "voided_knockout_match";
      } else {
        // "walkover" (default): opponent wins and bracket can advance
        for (const match of pendingMatches) {
          const isP1 = match.player1Id === playerId;
          await match.update({
            status: "completed",
            winner: isP1 ? "player2" : "player1",
            isWalkover: true,
            player1FramesWon: isP1 ? 0 : 1,
            player2FramesWon: isP1 ? 1 : 0,
          });
          walkoverMatchIds.push(match.id);
          if (match.roundNumber != null) roundsToProgress.add(match.roundNumber);
          forfeitedMatches++;
        }
        action = `walkover_${stage}`;
      }
    }

    await AuditLog.create({
      action: "player_withdrawn",
      entityType: "tournament_participant",
      entityId: participant.id,
      notes: `Player ${playerId} withdrew from tournament ${tournamentId}. Stage: ${stage}. Rule: ${stage === "before_start" ? beforeStartRule : stage === "during_group" ? duringGroupRule : duringKnockoutRule}. Action: ${action}. Voided: ${voidedMatches}, Forfeited: ${forfeitedMatches}. Reason: ${reason}`,
    });

    return {
      success: true,
      action,
      stage,
      voidedMatches,
      forfeitedMatches,
      pendingMatchesForfeited: forfeitedMatches > 0,
      walkoverMatchIds,
      roundsToProgress: [...roundsToProgress].sort((a, b) => a - b),
    };
  }
};

// ============================================================================
// REGISTRATION & INVITATION SYSTEM
// ============================================================================

const RegistrationManager = {
  generateInvitationLink(tournamentId) {
    const token = crypto.randomBytes(32).toString("hex");
    return {
      token,
      link: `/tournament/join/${tournamentId}?token=${token}`,
    };
  },

  generateJoinCode() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  },

  async registerPlayerForTournament(tournamentId, playerId, registrationMethod) {
    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const status = tournament.participantApprovalRequired ? "pending" : "approved";

    const participant = await TournamentParticipant.create({
      tournamentId,
      playerId,
      registrationMethod,
      status,
    });

    if (status === "approved") {
      await tournament.increment("currentParticipantCount");

      // Auto-close registration if max reached
      if (tournament.maxParticipants && tournament.currentParticipantCount + 1 >= tournament.maxParticipants) {
        if (tournament.status === "registration") {
          await tournament.update({ status: "registration_closed" });
        }
      }
    }

    return participant;
  },

  async approveRegistration(participantId, approve = true) {
    const participant = await TournamentParticipant.findByPk(participantId);
    if (!participant) throw new Error("Participant not found");

    if (approve) {
      await participant.update({ status: "approved", approvedDate: new Date() });
      const tournament = await Tournament.findByPk(participant.tournamentId);
      await tournament.increment("currentParticipantCount");

      // Auto-close if max reached
      if (tournament.maxParticipants && tournament.currentParticipantCount + 1 >= tournament.maxParticipants) {
        if (tournament.status === "registration") {
          await tournament.update({ status: "registration_closed" });
        }
      }
    } else {
      await participant.update({ status: "rejected" });
    }

    return participant;
  }
};

/**
 * Pure round-robin schedule helper (same as BracketGenerator.generateRoundRobinMatches).
 * @param {string[]} playerIds
 * @param {string} tournamentId
 * @param {Record<string, string>|null} playerNamesById
 */
function generateRoundRobinFixtures(playerIds, tournamentId, playerNamesById = null) {
  return BracketGenerator.generateRoundRobinMatches(playerIds, tournamentId, playerNamesById);
}

module.exports = {
  BracketGenerator,
  ScoringEngine,
  RankingEngine,
  WithdrawalHandler,
  RegistrationManager,
  generateRoundRobinFixtures,
};
