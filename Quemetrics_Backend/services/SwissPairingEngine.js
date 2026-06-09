/**
 * Swiss tournament pairing engine (production).
 * - Round 1: random or seed-order adjacent pairs; no score-based pairing.
 * - Round 2+: group by score, pair within score groups with down-floats, avoid rematches.
 * - Odd field: exactly one bye per round — lowest standing among players who have not yet had a bye.
 *
 * Points: match wins use tournament scoring rules, Swiss BYEs always award exactly +1.
 */

"use strict";

/** @typedef {{ playerId: string, seed?: number|null, pointsEarned?: number, buchholz?: number, sonnebornBerger?: number, opponentsPlayed?: string[], hasBye?: boolean }} SwissPlayerState */

/**
 * Default number of Swiss rounds: ceil(log2(n)), n >= 2.
 * @param {number} playerCount
 * @returns {number}
 */
function defaultSwissRoundCount(playerCount) {
  const n = Number(playerCount) || 0;
  if (n < 2) return 0;
  return Math.ceil(Math.log2(n));
}

/**
 * Award tournament points from a completed match (including Swiss bye rows).
 * @param {object} match
 * @param {object} scoringRules
 * @returns {{ p1: number, p2: number }}
 */
function matchPointsAwarded(match, scoringRules) {
  const rules = scoringRules || {};
  const pw = rules.pointsWin ?? 3;
  const pl = rules.pointsLoss ?? 0;
  const pd = rules.pointsDraw ?? 1;
  const pwo = rules.pointsWalkover ?? pw;

  if (!match.player1Id) return { p1: 0, p2: 0 };

  if (!match.player2Id) {
    if (match.status !== "completed") return { p1: 0, p2: 0 };
    // Swiss BYE row (player2Id = null) => full win = standard win points.
    return { p1: pw, p2: 0 };
  }

  if (match.status !== "completed") return { p1: 0, p2: 0 };

  if (match.isWalkover) {
    if (match.winner === "player1") return { p1: pwo, p2: pl };
    if (match.winner === "player2") return { p1: pl, p2: pwo };
  }

  if (match.winner === "player1") return { p1: pw, p2: pl };
  if (match.winner === "player2") return { p1: pl, p2: pw };
  if (match.winner === "draw") return { p1: pd, p2: pd };
  return { p1: 0, p2: 0 };
}

/**
 * Build per-player Swiss standing state from completed matches (includes bye as full win).
 * @param {Array<{ playerId: string, seed?: number|null }>} participants
 * @param {object[]} completedMatches
 * @param {object} scoringRules
 * @returns {Map<string, SwissPlayerState>}
 */
function buildSwissPlayerStateMap(participants, completedMatches, scoringRules) {
  /** @type {Map<string, SwissPlayerState>} */
  const map = new Map();
  for (const p of participants) {
    if (!p.playerId) continue;
    map.set(p.playerId, {
      playerId: p.playerId,
      seed: p.seed != null ? p.seed : 9999,
      pointsEarned: 0,
      buchholz: 0,
      sonnebornBerger: 0,
      opponentsPlayed: [],
      hasBye: false,
    });
  }

  const list = Array.isArray(completedMatches) ? completedMatches : [];

  for (const m of list) {
    if (!m || m.status !== "completed" || !m.player1Id) continue;

    if (!m.player2Id) {
      const pts = matchPointsAwarded(m, scoringRules);
      const row = map.get(m.player1Id);
      if (row) {
        row.pointsEarned += pts.p1;
        row.hasBye = true;
      }
      continue;
    }

    const pts = matchPointsAwarded(m, scoringRules);
    const a = map.get(m.player1Id);
    const b = map.get(m.player2Id);
    if (a) {
      a.pointsEarned += pts.p1;
      a.opponentsPlayed.push(m.player2Id);
    }
    if (b) {
      b.pointsEarned += pts.p2;
      b.opponentsPlayed.push(m.player1Id);
    }
  }

  for (const row of map.values()) {
    let sb = 0;
    for (const oid of row.opponentsPlayed) {
      const opp = map.get(oid);
      row.buchholz += opp ? opp.pointsEarned : 0;
      if (opp) {
        const played = list.find(
          (x) =>
            x.status === "completed" &&
            x.player1Id &&
            x.player2Id &&
            ((x.player1Id === row.playerId && x.player2Id === oid) ||
              (x.player2Id === row.playerId && x.player1Id === oid))
        );
        if (played) {
          const w = played.winner;
          const won =
            (w === "player1" && played.player1Id === row.playerId) ||
            (w === "player2" && played.player2Id === row.playerId);
          if (won) sb += opp.pointsEarned;
        }
      }
    }
    row.sonnebornBerger = sb;
  }

  return map;
}

/**
 * Sort key for standings / pairing order (higher is better): points, buchholz, SB, seed (lower number better).
 */
function compareStanding(a, b) {
  if ((b.pointsEarned || 0) !== (a.pointsEarned || 0)) {
    return (b.pointsEarned || 0) - (a.pointsEarned || 0);
  }
  if ((b.buchholz || 0) !== (a.buchholz || 0)) {
    return (b.buchholz || 0) - (a.buchholz || 0);
  }
  if ((b.sonnebornBerger || 0) !== (a.sonnebornBerger || 0)) {
    return (b.sonnebornBerger || 0) - (a.sonnebornBerger || 0);
  }
  return (a.seed || 9999) - (b.seed || 9999);
}

/**
 * Who should receive the bye: lowest standing among players eligible (not yet had a bye).
 * @param {SwissPlayerState[]} players
 * @returns {SwissPlayerState|null}
 */
function selectByeRecipient(players) {
  const eligible = players.filter((p) => !p.hasBye);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => {
    if ((a.pointsEarned || 0) !== (b.pointsEarned || 0)) {
      return (a.pointsEarned || 0) - (b.pointsEarned || 0);
    }
    return (b.seed || 9999) - (a.seed || 9999);
  })[0];
}

/**
 * Round 1: pair in order (already seeded or shuffled). Odd count → one bye for worst seed among never-bye (all never).
 * @param {Array<{ playerId: string, seed?: number|null }>} orderedParticipants first-to-last pairing order
 * @param {{ seeding?: string }} options
 * @returns {Array<{ player1Id: string, player2Id: string|null }>}
 */
function generateRoundOnePairings(orderedParticipants, options = {}) {
  const seeding = options.seeding || "random";
  const rows = orderedParticipants.filter((p) => p && p.playerId).map((p) => ({
    playerId: p.playerId,
    seed: p.seed != null ? p.seed : 9999,
  }));

  if (rows.length < 2) return [];

  let pool = rows;
  if (seeding === "random") {
    pool = [...rows];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  } else {
    pool = [...rows].sort((a, b) => (a.seed || 9999) - (b.seed || 9999));
  }

  const pairings = [];
  const pseudo = pool.map((r) => ({
    playerId: r.playerId,
    seed: r.seed,
    pointsEarned: 0,
    hasBye: false,
    opponentsPlayed: [],
    buchholz: 0,
    sonnebornBerger: 0,
  }));

  let playing = [...pseudo];
  if (playing.length % 2 === 1) {
    const bye = selectByeRecipient(playing);
    if (!bye) return [];
    playing = playing.filter((p) => p.playerId !== bye.playerId);
    pairings.push({ player1Id: bye.playerId, player2Id: null });
  }

  for (let i = 0; i < playing.length; i += 2) {
    if (playing[i + 1]) {
      pairings.push({ player1Id: playing[i].playerId, player2Id: playing[i + 1].playerId });
    }
  }

  return pairings;
}

function hasPlayedEachOther(player1Id, player2Id, opponentSets) {
  const s = opponentSets.get(player1Id);
  return s && s.has(player2Id);
}

/**
 * Greedy pairing within a pool: repeatedly take first unpaired, find first valid opponent; else first in list.
 * @param {SwissPlayerState[]} pool
 * @param {Map<string, Set<string>>} opponentSets
 * @param {Array<{ player1Id: string, player2Id: string }>} out
 */
function pairPoolGreedy(pool, opponentSets, out) {
  const remaining = [...pool];
  while (remaining.length > 1) {
    const p1 = remaining.shift();
    let idx = remaining.findIndex((p) => !hasPlayedEachOther(p1.playerId, p.playerId, opponentSets));
    if (idx === -1) idx = 0;
    const p2 = remaining.splice(idx, 1)[0];
    out.push({ player1Id: p1.playerId, player2Id: p2.playerId });
  }
  return remaining;
}

/**
 * Round 2+: standings-based pairing with score groups and down-floats.
 * @param {object} params
 * @param {Array<{ playerId: string, seed?: number|null }>} params.participants
 * @param {object[]} params.completedMatches
 * @param {object} params.scoringRules
 * @returns {Array<{ player1Id: string, player2Id: string|null }>}
 */
function generateSubsequentRoundPairings({
  participants,
  completedMatches,
  scoringRules,
}) {
  const partList = participants.filter((p) => p && p.playerId);
  if (partList.length < 2) return [];

  const stateMap = buildSwissPlayerStateMap(partList, completedMatches, scoringRules);
  const opponentSets = new Map();
  for (const p of partList) {
    opponentSets.set(p.playerId, new Set());
  }
  for (const m of completedMatches || []) {
    if (!m || m.status !== "completed" || !m.player1Id || !m.player2Id) continue;
    const a = opponentSets.get(m.player1Id);
    const b = opponentSets.get(m.player2Id);
    if (a) a.add(m.player2Id);
    if (b) b.add(m.player1Id);
  }

  // `standing` may be filtered when we assign the BYE (odd player counts),
  // so it must be mutable.
  let standing = Array.from(stateMap.values()).sort(compareStanding);

  const pairings = [];

  if (standing.length % 2 === 1) {
    const byePlayer = selectByeRecipient(standing);
    if (byePlayer) {
      standing = standing.filter((p) => p.playerId !== byePlayer.playerId);
      pairings.push({ player1Id: byePlayer.playerId, player2Id: null });
    }
  }

  const byScore = new Map();
  for (const s of standing) {
    const k = String(s.pointsEarned);
    if (!byScore.has(k)) byScore.set(k, []);
    byScore.get(k).push(s);
  }

  const scoreKeys = Array.from(byScore.keys()).sort((a, b) => Number(b) - Number(a));

  let floaters = [];
  for (const key of scoreKeys) {
    let pool = [...floaters, ...byScore.get(key)];
    floaters = [];
    pool.sort(compareStanding);
    const leftover = pairPoolGreedy(pool, opponentSets, pairings);
    floaters = leftover;
  }

  return pairings;
}

module.exports = {
  defaultSwissRoundCount,
  matchPointsAwarded,
  buildSwissPlayerStateMap,
  generateRoundOnePairings,
  generateSubsequentRoundPairings,
  compareStanding,
  selectByeRecipient,
};
