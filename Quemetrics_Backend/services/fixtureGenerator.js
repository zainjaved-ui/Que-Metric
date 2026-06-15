const { Fixture, League, LeaguePlayer, Player, User } = require('../models');
const { Op } = require('sequelize');
const standingsService = require('./standingsService');
const { sendTournamentAdvancementEmail, sendTournamentChampionEmail } = require('../utils/email');

/**
 * Robustly determine sport from game name (handles typos and variations)
 */
const determineSportFromGameName = (gameName) => {
  if (!gameName) return 'Snooker';
  const name = gameName.toLowerCase().trim();

  if (name.includes('snooker')) return 'Snooker';

  if (name.includes('pool') ||
    name.includes('8-ball') ||
    name.includes('9-ball') ||
    name.includes('8 ball') ||
    name.includes('9 ball') ||
    name.includes('billiard') ||
    name.includes('8ball')) {
    return 'Pool';
  }

  if (name.includes('pooker') || name.includes('pook') || name.includes('poker')) {
    return 'Pooker';
  }

  return 'Snooker'; // Default fallback
};

async function notifyPlayerQualified(playerId, league, currentRound, nextRound, stage) {
  if (!playerId || !league) return;

  const player = await Player.findByPk(playerId, {
    include: [{ model: User, as: 'user', attributes: ['email'] }],
  });

  if (!player || !player.user || !player.user.email) return;

  await sendTournamentAdvancementEmail({
    email: player.user.email,
    playerName: player.name || player.nickname || 'Player',
    leagueName: league.name || 'League',
    currentRound,
    nextRound,
    stage,
  }).catch(err => {
    console.error(`[notifyPlayerQualified] Failed to send advancement email to player ${playerId}:`, err.message);
  });
}

async function notifyPlayerChampion(playerId, league) {
  if (!playerId || !league) return;

  const player = await Player.findByPk(playerId, {
    include: [{ model: User, as: 'user', attributes: ['email'] }],
  });

  if (!player || !player.user || !player.user.email) return;

  await sendTournamentChampionEmail({
    email: player.user.email,
    playerName: player.name || player.nickname || 'Player',
    leagueName: league.name || 'League',
  }).catch(err => {
    console.error(`[notifyPlayerChampion] Failed to send champion email to player ${playerId}:`, err.message);
  });
}

// ============================================
// FORMAT‑SPECIFIC HELPERS
// ============================================

/**
 * Resolve a player's seed rank for bye/bracket ordering.
 *
 * rankingSource options (set in structure.seeding.rankingSource or swissConfig.rankingSource):
 *   'global'       — use LeaguePlayer.ranking (set at enrollment, from CueMetrics global rank)
 *   'league_table' — use the player's current points in THIS league (live standing)
 *
 * Falls back to 0 if neither is available.
 *
 * @param {string} playerId
 * @param {Map}    leaguePlayerMap  - playerId → LeaguePlayer record
 * @param {string} rankingSource    - 'global' | 'league_table'
 * @returns {number}
 */
function resolveSeedRank(playerId, leaguePlayerMap, rankingSource = 'global') {
  const lp = leaguePlayerMap.get(playerId);
  if (!lp) return 0;
  if (rankingSource === 'league_table') {
    // Use current league points as seeding rank (higher pts = better seed)
    return lp.points || 0;
  }
  // Default: global enrollment ranking
  return lp.ranking || 0;
}

async function generateRoundRobinFixtures(league, structure, divisions) {
  const fixtures = [];
  const isDouble = structure.format === 'homeAway' || (structure.roundRobin && structure.roundRobin.isDouble);
  const leagueSport = league.sport || determineSportFromGameName(league.gameName || league.basicInfo?.gameName);

  const leaguePlayerMap = new Map();
  (league.leaguePlayers || []).forEach(lp => {
    leaguePlayerMap.set(lp.playerId, lp);
  });

  // Parse matchRules JSON string
  let matchRules = {};
  try {
    matchRules = league.matchRules ? JSON.parse(league.matchRules) : {};
  } catch (parseError) {
    console.warn('[generateRoundRobinFixtures] Failed to parse matchRules JSON:', parseError.message);
    matchRules = {};
  }

  const bestOfGlobal = matchRules.bestOf === 'custom'
    ? matchRules.customFrames
    : parseInt(matchRules.bestOf, 10) || 5;

  // Handle round-by-round generation
  const strategy = league.fixtureStrategy || 'full_schedule';
  const currentRound = league.currentRound || 1;

  const processPlayerList = (playerIds, divId) => {
    if (playerIds.length < 2) return;

    // Circle Method Algorithm
    let tempPlayers = [...playerIds];

    // Add dummy if odd number of players
    if (tempPlayers.length % 2 !== 0) {
      tempPlayers.push(null);
    }

    const numPlayers = tempPlayers.length;
    const numRounds = numPlayers - 1;
    const half = numPlayers / 2;

    // If strategy is round_by_round, we only generate for the currentRound (which is 1 at start)
    const startRange = strategy === 'round_by_round' ? currentRound : 1;
    const endRange = strategy === 'round_by_round' ? currentRound : numRounds;

    for (let round = 1; round <= numRounds; round++) {
      // Skip rounds not in range if round_by_round
      if (round < startRange || round > endRange) {
        // We still need to rotate to maintain consistency for future rounds
        tempPlayers.splice(1, 0, tempPlayers.pop());
        continue;
      }

      let matchInRound = 1;

      // ─── PER-ROUND BYE (League mode — NOT bracket-based) ───────────────
      // In a league, a bye arises every round when there are an ODD number of
      // players. The circle method naturally rotates which player gets the null
      // dummy partner across rounds, so every player gets roughly equal byes
      // over the season. This is NOT a bracket-based power-of-2 bye — there is
      // no elimination. It is purely a scheduling artefact to keep rounds even.
      // byeLogic: 'random' (default circle rotation) | 'highest_ranked' | 'lowest_ranked'
      const byeLogic = league.byeLogic || 'random'; // used for audit/logging; circle method handles rotation

      for (let i = 0; i < half; i++) {
        const p1 = tempPlayers[i];
        const p2 = tempPlayers[numPlayers - 1 - i];

        if (p1 !== null && p2 !== null) {
          fixtures.push({
            leagueId: league.id,
            divisionId: divId,
            player1Id: p1,
            player2Id: p2,
            round: round,
            matchNumber: matchInRound++,
            status: 'scheduled',
            scheduledDate: calculateScheduledDate(league, round, i),
            bestOf: bestOfGlobal
          });

          if (isDouble && strategy !== 'round_by_round') {
            fixtures.push({
              leagueId: league.id,
              divisionId: divId,
              player1Id: p2,
              player2Id: p1,
              round: round + numRounds,
              matchNumber: matchInRound - 1,
              status: 'scheduled',
              scheduledDate: calculateScheduledDate(league, round + numRounds, i),
              bestOf: bestOfGlobal
            });
          }
        }
      }
      // Rotate players (keep the first one fixed — circle method)
      tempPlayers.splice(1, 0, tempPlayers.pop());
    }
  };


  if (structure.divisions?.enabled && divisions.length > 0) {
    for (const division of divisions) {
      const playerIds = (division.players || []).map(p => p.player && p.player.id).filter(id => !!id);
      processPlayerList(playerIds, division.id);
    }
  } else {
    const allPlayers = (league.leaguePlayers || []).map(lp => lp.player && lp.player.id).filter(id => !!id);
    processPlayerList(allPlayers, null);
  }

  // NEW: Append knockout bracket placeholders if qualifiers are defined
  const qualifiers = parseInt(structure.knockout?.qualifiers || structure.qualifiers || 0, 10);
  if (qualifiers >= 2) {
    const bracketFixtures = createKnockoutBracket(league.id, qualifiers, 'knockout');
    fixtures.push(...bracketFixtures);
  }

  return fixtures;
}

async function generateGroupsKnockoutFixtures(league, structure, divisions) {
  const fixtures = [];
  const groups = structure.groups;
  if (!groups || !groups.count || !groups.teamsPerGroup || !groups.qualifiers) {
    throw new Error("Groups configuration missing (count, teamsPerGroup, qualifiers)");
  }

  if (!divisions || divisions.length === 0) {
    throw new Error("No divisions found – groups require divisions");
  }

  for (const division of divisions) {
    const playerIds = (division.players || []).map(p => p.player && p.player.id).filter(id => !!id);
    if (playerIds.length < 2) continue;

    let matchInDivision = 1;
    for (let i = 0; i < playerIds.length; i++) {
      for (let j = i + 1; j < playerIds.length; j++) {
        fixtures.push({
          leagueId: league.id,
          divisionId: division.id,
          player1Id: playerIds[i],
          player2Id: playerIds[j],
          round: 1,
          matchNumber: matchInDivision++,
          stage: 'group',
          status: 'scheduled',
          scheduledDate: calculateScheduledDate(league, 1, i, j)
        });
      }
    }
  }

  const totalQualifiers = groups.count * groups.qualifiers;
  if (totalQualifiers >= 2) {
    const bracketFixtures = createKnockoutBracket(league.id, totalQualifiers, 'groupsKnockout');
    fixtures.push(...bracketFixtures);
  }

  return fixtures;
}

function createKnockoutBracket(leagueId, numPlayers, stage) {
  const fixtures = [];
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
  const effectiveStage = stage || 'knockout';

  let round = 1;
  let matchesInRound = bracketSize / 2;

  while (matchesInRound >= 1) {
    for (let i = 0; i < matchesInRound; i++) {
      fixtures.push({
        leagueId,
        divisionId: null,
        player1Id: null,
        player2Id: null,
        round: round,
        matchIndex: i,
        matchNumber: i + 1,
        stage: effectiveStage,
        status: 'scheduled'
      });
    }
    matchesInRound = Math.floor(matchesInRound / 2);
    round++;
  }

  return fixtures;
}

async function generateKnockoutFixtures(league, structure, divisions) {
  const fixtures = [];
  const knockoutConfig = structure.knockout || {};
  const seedingMethod = knockoutConfig.seeding || 'random';
  const isSeeded = seedingMethod === 'ranked' || seedingMethod === 'ranking' || seedingMethod === 'ranking_table';

  // Check for manual bye selection
  const byeSelection = knockoutConfig.byeSelection || 'random';
  const manualByes = knockoutConfig.manualByes || [];
  const manualOrder = knockoutConfig.manualOrder || [];

  // Requirement: IF SEEDED -> ONLY TOP RANKED PLAYERS GET BYES
  // rankingSource: 'global' (enrollment rank) | 'league_table' (current league points)
  const knockoutRankingSource = knockoutConfig.rankingSource || 'global';

  // If user explicitly chose a bye selection method, respect it.
  // Otherwise, default to ranked_top (highest) if seeded, or random if not.
  const byeType = (byeSelection === 'manual' || byeSelection === 'random' || byeSelection === 'ranked')
    ? byeSelection
    : (isSeeded ? 'ranked_top' : (structure.matchRules?.byeType || knockoutConfig.byeType || 'random'));

  const leaguePlayerMap = new Map();
  (league.leaguePlayers || []).forEach(lp => {
    let lpObj = lp;
    if (typeof lp.get === 'function') lpObj = lp.get({ plain: true });
    leaguePlayerMap.set(lpObj.playerId, { ...lpObj, _seedRank: resolveSeedRank(lpObj.playerId, new Map([[lpObj.playerId, lpObj]]), knockoutRankingSource) });
  });

  const processDivision = (playerIds, divId) => {
    const numPlayers = playerIds.length;
    if (numPlayers < 2) return;

    // 1. Calculate bracket size (next power of 2)
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
    const numByes = bracketSize - numPlayers;

    // 2. Prepare players with ranking (ensure we check lp.player.ranking)
    const participants = playerIds.map(id => {
      const lpMatch = leaguePlayerMap.get(id);
      return {
        id,
        ranking: lpMatch?.player?.ranking || lpMatch?.ranking || 0,
      };
    });

    // 3. Determine Bye Recipients based on selection method
    const byeRecipients = selectByeRecipients(participants, byeType, numByes, manualByes);

    // 4. Seeding: Ensure bye players are placed in top seed positions
    // In a standard tournament, top seeds (1, 2, etc.) get the byes.
    const byePlayers = participants.filter(p => byeRecipients.includes(p.id));
    const nonByePlayers = participants.filter(p => !byeRecipients.includes(p.id));

    // Sort bye players by rank (highest first to take the very top seeds)
    const sortedByePlayers = byePlayers.sort((a, b) => {
      const rA = parseFloat(a.ranking || 0);
      const rB = parseFloat(b.ranking || 0);
      if (rA !== rB) return rB - rA;
      const idA = (a.id || '').toString();
      const idB = (b.id || '').toString();
      return idA > idB ? 1 : (idA < idB ? -1 : 0);
    });

    // Seed the remaining non-bye players based on user preference (Ranked/Random/Manual)
    const sortedNonByePlayers = seedPlayers(nonByePlayers, seedingMethod === 'random' ? 'random' : (isSeeded ? 'ranked' : seedingMethod), false, manualOrder);

    // Combine: bye players first (they take Seeds 1...numByes), then the rest
    const seededList = [...sortedByePlayers, ...sortedNonByePlayers];

    // 4. Seeding: Map Seed positions (1...bracketSize) into the bracket slots
    const bracketOrder = generateSeededBracketOrder(bracketSize);
    const bracketSlots = new Array(bracketSize).fill(null);

    // Seat our N players into the first N seed positions
    // In a standard tournament, Seed 1, Seed 2, etc. are the players.
    // Remaining seeds (N+1 to bracketSize) are null.
    for (let i = 0; i < seededList.length; i++) {
      // Find the index in the actual match slots where Seed (i+1) belongs
      const slotIndex = bracketOrder.indexOf(i + 1);
      bracketSlots[slotIndex] = seededList[i];
    }

    let round = 1;
    let matchIndex = 0;

    // 6. Generate Round 1 Fixtures
    for (let i = 0; i < bracketSize; i += 2) {
      let p1 = bracketSlots[i];
      let p2 = bracketSlots[i + 1];

      const isByeMatch = !p1 || !p2; // One slot is empty (null) or both

      // CRITICAL FIX: Normalization
      // In KO, some parts of the system expect the 'Bye' recipient to always be in player1Id.
      // If p1 is null but p2 exists, swap them so the player is always in player1Id.
      if (!p1 && p2) {
        p1 = p2;
        p2 = null;
      }

      fixtures.push({
        leagueId: league.id,
        divisionId: divId,
        player1Id: p1 ? p1.id : null,
        player2Id: p2 ? p2.id : null,
        round: round,
        matchIndex: matchIndex,
        matchNumber: matchIndex + 1,
        stage: 'knockout',
        status: isByeMatch ? 'bye' : 'scheduled',
        winnerId: isByeMatch ? (p1 ? p1.id : null) : null,
        scheduledDate: calculateScheduledDate(league, round, matchIndex)
      });
      matchIndex++;
    }

    // 7. Generate Subsequent Rounds (Scaffolding)
    let matchesInRound = bracketSize / 4;
    round++;
    while (matchesInRound >= 1) {
      for (let i = 0; i < matchesInRound; i++) {
        fixtures.push({
          leagueId: league.id,
          divisionId: divId,
          player1Id: null,
          player2Id: null,
          round: round,
          matchIndex: i,
          matchNumber: i + 1,
          stage: 'knockout',
          status: 'scheduled',
          scheduledDate: calculateScheduledDate(league, round, i)
        });
      }
      matchesInRound = Math.floor(matchesInRound / 2);
      round++;
    }

    // 8. Pre-advance Bye winners into subsequent rounds
    // This ensures that Round 2 (and beyond) slots are populated correctly for starting byes
    const totalRounds = round - 1;
    for (let r = 1; r < totalRounds; r++) {
      const currentRoundFixtures = fixtures.filter(f => f.round === r && f.divisionId === divId);
      for (const f of currentRoundFixtures) {
        if (f.winnerId) {
          const nextR = r + 1;
          const nextIdx = Math.floor(f.matchIndex / 2);
          const isP1 = f.matchIndex % 2 === 0;
          const target = fixtures.find(nextF => nextF.round === nextR && nextF.matchIndex === nextIdx && nextF.divisionId === divId);
          if (target) {
            if (isP1) target.player1Id = f.winnerId;
            else target.player2Id = f.winnerId;

            // If the next round fixture's opponent is already known to be null (dummy),
            // we can mark this next round fixture as a bye winner too.
            // (Note: This handles nested byes in brackets like size 16 with 5 players)
          }
        }
      }
    }
  };

  if (divisions && divisions.length > 0) {
    for (const division of divisions) {
      const playerIds = (division.players || []).map(p => p.player?.id || p.id).filter(id => !!id);
      processDivision(playerIds, division.id);
    }
  } else {
    const allPlayers = (league.leaguePlayers || []).map(lp => lp.player?.id).filter(id => !!id);
    processDivision(allPlayers, null);
  }

  return fixtures;
}

async function generateSwissFixtures(league, structure, divisions) {
  const fixtures = [];
  const swissConfig = structure.swiss || { rounds: 5 };
  const numRounds = swissConfig.rounds;

  const processDivision = (playerIds, divId) => {
    if (playerIds.length < 2) return;

    const matchesPerRound = Math.floor(playerIds.length / 2);
    const hasBye = playerIds.length % 2 !== 0;
    const fixturesPerRound = hasBye ? matchesPerRound + 1 : matchesPerRound;
    const seedingMethod = swissConfig.seeding || 'random';
    const isSeeded = seedingMethod === 'ranked' || seedingMethod === 'ranking';
    const seededPlayers = [...playerIds];

    // Requirements: IF SEEDED -> ONLY TOP RANKED PLAYERS GET BYES
    // If not seeded, we keep the shuffle for fairness.
    // rankingSource controls whether we seed by global rank or current league table points.
    const rankingSource = swissConfig.rankingSource || 'global';
    if (isSeeded) {
      // Sort by ranking (highest first) — source determined by rankingSource
      const leaguePlayerMap2 = new Map();
      (league.leaguePlayers || []).forEach(lp => leaguePlayerMap2.set(lp.playerId, lp));

      seededPlayers.sort((a, b) => {
        const r1 = resolveSeedRank(a, leaguePlayerMap2, rankingSource);
        const r2 = resolveSeedRank(b, leaguePlayerMap2, rankingSource);
        return r2 - r1; // descending: highest rank/points first
      });
    } else {
      shuffleArray(seededPlayers);
    }

    for (let round = 1; round <= numRounds; round++) {
      for (let m = 0; m < fixturesPerRound; m++) {
        let p1 = null;
        let p2 = null;
        let status = 'scheduled';

        // Only pair players for Round 1. Subsequent rounds (2+) must stay null
        // until previous round results are recorded.
        if (round === 1) {
          if (m < matchesPerRound) {
            p1 = seededPlayers[m * 2];
            p2 = seededPlayers[m * 2 + 1];
          } else if (hasBye && m === matchesPerRound) {
            // Bye match: give bye to the right player
            // Requirements: IF SEEDED -> ONLY TOP RANKED PLAYERS GET BYES
            p1 = isSeeded ? seededPlayers[0] : seededPlayers[seededPlayers.length - 1];
            p2 = null;
            status = 'bye';
          }
        }

        fixtures.push({
          leagueId: league.id,
          divisionId: divId,
          player1Id: p1,
          player2Id: p2,
          round: round,
          matchIndex: m,
          matchNumber: m + 1,
          stage: 'swiss',
          status: status,
          winnerId: status === 'bye' ? p1 : null,
          scheduledDate: calculateScheduledDate(league, round, m)
        });
      }
    }
  };

  if (divisions && divisions.length > 0) {
    for (const division of divisions) {
      const playerIds = (division.players || []).map(p => p.player && p.player.id || p.id).filter(id => !!id);
      processDivision(playerIds, division.id);
    }
  } else {
    const allPlayers = (league.leaguePlayers || []).map(lp => lp.player && lp.player.id).filter(id => !!id);
    processDivision(allPlayers, null);
  }

  // NEW: Append knockout bracket placeholders if qualifiers are defined
  const qualifiers = parseInt(structure.knockout?.qualifiers || structure.qualifiers || 0, 10);
  if (qualifiers >= 2) {
    const bracketFixtures = createKnockoutBracket(league.id, qualifiers, 'knockout');
    fixtures.push(...bracketFixtures);
  }

  return fixtures;
}

/**
 * Calculate Swiss standings with tie-breaks for a given round
 * @param {string} leagueId
 * @param {number} currentRound - the round that just completed
 * @param {string} tieBreakMethod - 'buchholz', 'median', 'sonneborn'
 * @param {string|null} divisionId - optional division filter
 * @returns {Array} sorted player standings
 */
async function calculateSwissStandings(leagueId, currentRound, tieBreakMethod = 'buchholz', divisionId = null) {
  const { LeaguePlayer, Fixture, MatchResult } = require('../models');

  // Get all league players
  const whereClause = { leagueId };
  if (divisionId) whereClause.divisionId = divisionId;

  const leaguePlayers = await LeaguePlayer.findAll({
    where: whereClause,
    include: [{ association: 'player', attributes: ['id', 'name', 'nickname'] }]
  });

  // Get all completed fixtures up to current round
  const fixtures = await Fixture.findAll({
    where: {
      leagueId,
      round: { [Op.lte]: currentRound },
      status: 'completed',
      stage: 'swiss'
    },
    include: [
      { association: 'player1', attributes: ['id', 'name'] },
      { association: 'player2', attributes: ['id', 'name'] }
    ]
  });

  // Calculate standings for each player
  const standings = leaguePlayers.map(lp => {
    const playerId = lp.playerId;
    const playerFixtures = fixtures.filter(f =>
      f.player1Id === playerId || f.player2Id === playerId
    );

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let points = 0;
    const opponents = [];
    const opponentScores = new Map(); // For Sonneborn-Berger

    playerFixtures.forEach(fixture => {
      const isPlayer1 = fixture.player1Id === playerId;
      const opponentId = isPlayer1 ? fixture.player2Id : fixture.player1Id;
      const winnerId = fixture.winnerId;

      if (winnerId === playerId) {
        wins++;
        points += 1; // 1 point for win
        opponents.push(opponentId);
      } else if (winnerId === opponentId) {
        losses++;
        opponents.push(opponentId);
      } else {
        draws++;
        points += 0.5; // 0.5 points for draw
        opponents.push(opponentId);
      }

      // Track opponent scores for Sonneborn-Berger
      if (opponentId) {
        const opponentWins = opponentScores.get(opponentId) || 0;
        if (winnerId === opponentId) {
          opponentScores.set(opponentId, opponentWins + 1);
        }
      }
    });

    return {
      playerId,
      player: lp.player,
      wins,
      losses,
      draws,
      points,
      opponents,
      opponentScores,
      matchesPlayed: wins + losses + draws
    };
  });

  // Calculate tie-breakers
  standings.forEach(player => {
    let tieBreakScore = 0;

    switch (tieBreakMethod) {
      case 'buchholz':
        // Buchholz: sum of opponents' scores
        tieBreakScore = player.opponents.reduce((sum, oppId) => {
          const opp = standings.find(s => s.playerId === oppId);
          return sum + (opp ? opp.points : 0);
        }, 0);
        break;

      case 'median':
        // Median Buchholz: exclude highest and lowest opponent scores
        if (player.opponents.length >= 3) {
          const oppScores = player.opponents.map(oppId => {
            const opp = standings.find(s => s.playerId === oppId);
            return opp ? opp.points : 0;
          }).sort((a, b) => a - b);

          // Remove highest and lowest
          oppScores.shift();
          oppScores.pop();
          tieBreakScore = oppScores.reduce((sum, score) => sum + score, 0);
        } else {
          // Fallback to regular Buchholz for small number of opponents
          tieBreakScore = player.opponents.reduce((sum, oppId) => {
            const opp = standings.find(s => s.playerId === oppId);
            return sum + (opp ? opp.points : 0);
          }, 0);
        }
        break;

      case 'sonneborn':
        // Sonneborn-Berger: sum of (opponent score × result against opponent)
        tieBreakScore = player.opponents.reduce((sum, oppId) => {
          const opp = standings.find(s => s.playerId === oppId);
          const oppScore = opp ? opp.points : 0;
          const result = player.opponentScores.get(oppId) || 0; // 1 if beat opponent, 0 otherwise
          return sum + (oppScore * result);
        }, 0);
        break;

      default:
        tieBreakScore = 0;
    }

    player.tieBreakScore = tieBreakScore;
  });

  // Sort by: points (desc), tie-break score (desc), wins (desc)
  standings.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.tieBreakScore !== b.tieBreakScore) return b.tieBreakScore - a.tieBreakScore;
    return b.wins - a.wins;
  });

  return standings;
}

/**
 * Generate pairings for the next Swiss round based on current standings
 * @param {string} leagueId
 * @param {number} nextRound
 * @param {string} tieBreakMethod
 * @param {string|null} divisionId
 * @returns {Array} updated fixtures for the next round
 */
async function generateNextSwissRound(leagueId, nextRound, tieBreakMethod = 'buchholz', divisionId = null) {
  const standings = await calculateSwissStandings(leagueId, nextRound - 1, tieBreakMethod, divisionId);

  if (standings.length < 2) {
    throw new Error('Not enough players for Swiss pairings');
  }

  console.log(`[generateNextSwissRound] Round ${nextRound}: Calculating pairings for ${standings.length} players using ${tieBreakMethod} tiebreak`);

  // Get existing fixtures for this round to update
  const { Fixture } = require('../models');
  const whereClause = {
    leagueId,
    round: nextRound,
    stage: 'swiss'
  };
  if (divisionId) whereClause.divisionId = divisionId;

  console.log(`[generateNextSwissRound] Querying for round ${nextRound} fixtures with where clause:`, JSON.stringify(whereClause));

  // First try with stage filter
  let roundFixtures = await Fixture.findAll({
    where: whereClause,
    order: [['matchIndex', 'ASC']]
  });

  console.log(`[generateNextSwissRound] Found ${roundFixtures.length} fixture(s) for round ${nextRound} with stage='swiss'`);

  // If no fixtures found with stage filter, try without stage (for backward compatibility)
  if (roundFixtures.length === 0) {
    console.log(`[generateNextSwissRound] Retrying without stage filter for backward compatibility...`);
    const fallbackWhereClause = {
      leagueId,
      round: nextRound
    };
    if (divisionId) fallbackWhereClause.divisionId = divisionId;

    roundFixtures = await Fixture.findAll({
      where: fallbackWhereClause,
      order: [['matchIndex', 'ASC']]
    });
    console.log(`[generateNextSwissRound] Found ${roundFixtures.length} fixture(s) for round ${nextRound} without stage filter`);
  }

  if (roundFixtures.length === 0) {
    // DEBUG: Check what rounds exist
    const allRounds = await Fixture.findAll({
      where: { leagueId },
      attributes: ['id', 'round', 'divisionId', 'stage', 'player1Id', 'player2Id'],
      raw: true,
      limit: 10
    });
    const uniqueRounds = [...new Set(allRounds.map(f => `Round ${f.round}${f.divisionId ? `-div${f.divisionId}` : ''} (${f.stage || 'no-stage'})${f.player1Id || f.player2Id ? ' [paired]' : ' [unpaired]'}`))];
    console.error(`[generateNextSwissRound] ERROR: No fixtures found for round ${nextRound}. Sample fixtures:`, uniqueRounds.join(', '));
    throw new Error(`No fixtures found for round ${nextRound}. Database may not have fixtures created for all rounds.`);
  }

  console.log(`[generateNextSwissRound] Found ${roundFixtures.length} fixture slots to fill for round ${nextRound}`);

  // 1. Fetch Bye History
  const previousFixtures = await Fixture.findAll({
    where: {
      leagueId,
      round: { [Op.lt]: nextRound }
    }
  });
  const playersWithByes = new Set(
    previousFixtures
      .filter(f => (f.status === 'bye' || f.player2Id === null) && f.player1Id)
      .map(f => f.player1Id)
  );
  console.log(`[generateNextSwissRound] Players who already had a bye:`, [...playersWithByes].join(', '));

  // 2. Decide who gets the Bye for this round if odd number of players
  let byePlayerId = null;
  const potentialByeCandidates = [...standings]
    .filter(p => !playersWithByes.has(p.playerId))
    .reverse(); // Start from bottom of standings (standard Swiss)

  if (standings.length % 2 !== 0) {
    if (potentialByeCandidates.length > 0) {
      byePlayerId = potentialByeCandidates[0].playerId;
      console.log(`[generateNextSwissRound] Assigning bye for R${nextRound} to ${potentialByeCandidates[0].player.name} (hasn't had one before)`);
    } else {
      // Everyone has had a bye, pick the one at the very bottom
      byePlayerId = standings[standings.length - 1].playerId;
      console.log(`[generateNextSwissRound] All players have had byes. Assigning bye to lowest rank: ${standings[standings.length - 1].player.name}`);
    }
  }

  // Swiss pairing algorithm: pair players with similar scores
  // Use a simple bracket pairing approach
  const pairedPlayers = [];
  const usedPlayers = new Set();
  if (byePlayerId) usedPlayers.add(byePlayerId); // Exclude bye player from pairing loop

  // Sort standings again to ensure proper ordering
  const sortedPlayers = [...standings];

  console.log(`[generateNextSwissRound] Starting pairing for ${sortedPlayers.length} players (${roundFixtures.length} fixture slots available)`);

  // Pair top players with similar-ranked players
  for (let i = 0; i < sortedPlayers.length; i++) {
    if (usedPlayers.has(sortedPlayers[i].playerId)) {
      console.log(`[generateNextSwissRound] Skipping player ${i} (${sortedPlayers[i].player.name}): already paired`);
      continue;
    }

    let paired = false;
    // Try to pair with next available player who hasn't played this opponent recently
    for (let j = i + 1; j < sortedPlayers.length; j++) {
      if (usedPlayers.has(sortedPlayers[j].playerId)) continue;

      // Check if they've played recently (last 2 rounds)
      const recentMatches = await Fixture.findAll({
        where: {
          leagueId,
          round: { [Op.gte]: Math.max(1, nextRound - 2) },
          [Op.or]: [
            { player1Id: sortedPlayers[i].playerId, player2Id: sortedPlayers[j].playerId },
            { player1Id: sortedPlayers[j].playerId, player2Id: sortedPlayers[i].playerId }
          ]
        }
      });

      if (recentMatches.length === 0) {
        // Valid pairing
        console.log(`[generateNextSwissRound] Pairing ${sortedPlayers[i].player.name} (#${i}) vs ${sortedPlayers[j].player.name} (#${j})`);
        pairedPlayers.push({
          player1Id: sortedPlayers[i].playerId,
          player2Id: sortedPlayers[j].playerId,
          matchIndex: pairedPlayers.length
        });
        usedPlayers.add(sortedPlayers[i].playerId);
        usedPlayers.add(sortedPlayers[j].playerId);
        paired = true;
        break;
      }
    }
    // If no valid pairing found, pair with next available player
    if (!paired) {
      for (let j = i + 1; j < sortedPlayers.length; j++) {
        if (!usedPlayers.has(sortedPlayers[j].playerId)) {
          console.log(`[generateNextSwissRound] Pairing ${sortedPlayers[i].player.name} (#${i}) vs ${sortedPlayers[j].player.name} (#${j}) (forced, no recent opponent check)`);
          pairedPlayers.push({
            player1Id: sortedPlayers[i].playerId,
            player2Id: sortedPlayers[j].playerId,
            matchIndex: pairedPlayers.length
          });
          usedPlayers.add(sortedPlayers[i].playerId);
          usedPlayers.add(sortedPlayers[j].playerId);
          break;
        }
      }
    }
  }

  // 3. Add the Bye pairing if identified
  if (byePlayerId) {
    pairedPlayers.push({
      player1Id: byePlayerId,
      player2Id: null, // Bye
      matchIndex: pairedPlayers.length
    });
  }

  // Handle any remaining odd number edge cases (shouldn't happen with above logic)
  if (!byePlayerId && sortedPlayers.length % 2 !== 0) {
    const unpairedPlayer = sortedPlayers.find(p => !usedPlayers.has(p.playerId));
    if (unpairedPlayer) {
      pairedPlayers.push({
        player1Id: unpairedPlayer.playerId,
        player2Id: null, // Bye
        matchIndex: pairedPlayers.length
      });
      usedPlayers.add(unpairedPlayer.playerId);
    }
  }

  // Update fixtures with new pairings
  const updatedFixtures = [];
  for (let i = 0; i < pairedPlayers.length; i++) {
    const pairing = pairedPlayers[i];
    // Find fixture by position, not by matchIndex (more reliable)
    const fixture = roundFixtures[i];
    if (fixture) {
      console.log(`[generateNextSwissRound] Updating fixture ${fixture.id} (position ${i}): ${pairing.player1Id || 'bye'} vs ${pairing.player2Id || 'bye'}`);
      await fixture.update({
        player1Id: pairing.player1Id,
        player2Id: pairing.player2Id,
        status: pairing.player2Id ? 'scheduled' : 'bye', // Mark bye matches
        winnerId: pairing.player2Id ? null : pairing.player1Id // The existing player wins the bye
      });
      updatedFixtures.push(fixture);
    } else {
      console.warn(`[generateNextSwissRound] No fixture found at position ${i} (only ${roundFixtures.length} fixtures available)`);
    }
  }

  // Handle any remaining fixtures (shouldn't happen if counts match)
  if (roundFixtures.length > pairedPlayers.length) {
    console.warn(`[generateNextSwissRound] WARNING: More fixtures (${roundFixtures.length}) than pairings (${pairedPlayers.length}). This shouldn't happen.`);
  }

  // Notify qualified players for next round
  const league = await League.findByPk(leagueId);
  if (league) {
    for (const fixture of updatedFixtures) {
      if (fixture.player1Id) {
        notifyPlayerQualified(fixture.player1Id, league, nextRound - 1, nextRound, 'swiss');
      }
      if (fixture.player2Id) {
        notifyPlayerQualified(fixture.player2Id, league, nextRound - 1, nextRound, 'swiss');
      }
    }
  }

  return updatedFixtures;
}

/**
 * Check if all matches in a Swiss round are completed and trigger next round pairings
 * @param {string} leagueId
 * @param {number} completedRound
 * @param {string|null} divisionId
 */
async function checkAndUpdateSwissPairings(leagueId, completedRound, divisionId = null) {
  const { League, Fixture } = require('../models');

  const league = await League.findByPk(leagueId);
  if (!league) {
    console.log(`[checkAndUpdateSwissPairings] League ${leagueId} not found`);
    return;
  }

  let structure = league.structure;
  if (typeof structure === 'string') {
    try { structure = JSON.parse(structure); } catch { structure = {}; }
  }

  if (structure.format !== 'swiss') {
    console.log(`[checkAndUpdateSwissPairings] League ${leagueId} is not Swiss format (format: ${structure.format})`);
    return;
  }

  const swissConfig = structure.swiss || {};
  const totalRounds = swissConfig.rounds || 5;
  const tieBreakMethod = swissConfig.tieBreak || 'buchholz';

  // Check if all matches in the completed round are done
  const whereClause = {
    leagueId,
    round: completedRound,
    stage: 'swiss'
  };
  if (divisionId) whereClause.divisionId = divisionId;

  let roundFixtures = await Fixture.findAll({ where: whereClause });

  // Fallback: if no fixtures found with stage filter, try without
  if (roundFixtures.length === 0) {
    console.log(`[checkAndUpdateSwissPairings] No fixtures found with stage='swiss' filter. Retrying without stage filter...`);
    const fallbackWhere = { leagueId, round: completedRound };
    if (divisionId) fallbackWhere.divisionId = divisionId;
    roundFixtures = await Fixture.findAll({ where: fallbackWhere });
  }

  // Audit fixtures: if any match is against null/TBD and still 'upcoming', mark it as 'bye'
  // for Swiss leagues so it doesn't block advancement.
  for (const f of roundFixtures) {
    // If a fixture has one participant null and no winnerId, mark it as 'bye' and declare a winner
    // This catches both 'scheduled'/'upcoming' matches and matches already tagged as 'bye' but missing a winner record.
    if ((f.status === 'upcoming' || f.status === 'scheduled' || f.status === 'bye') && (!f.player1Id || !f.player2Id) && !f.winnerId) {
      console.log(`[checkAndUpdateSwissPairings] Auto-marking fixture ${f.id} as 'bye' and declaring winner (one participant is null)`);
      const winnerId = f.player1Id || f.player2Id;
      if (winnerId) {
        await f.update({
          status: 'bye',
          winnerId: winnerId
        });
        f.status = 'bye';
        f.winnerId = winnerId;
      }
    }
  }

  const completedMatches = roundFixtures.filter(f => f.status === 'completed' || f.status === 'bye');
  const totalMatches = roundFixtures.length;

  console.log(`[checkAndUpdateSwissPairings] Round ${completedRound}: ${completedMatches.length}/${totalMatches} matches complete. Division: ${divisionId || 'none'}. Fixtures found: ${roundFixtures.length}`);

  if (completedMatches.length !== totalMatches) {
    // Round not fully completed yet
    const remaining = totalMatches - completedMatches.length;
    console.log(`[checkAndUpdateSwissPairings] Round ${completedRound} not yet fully completed (${remaining} of ${totalMatches} remaining)`);
    const pendingStatuses = roundFixtures.filter(f => f.status !== 'completed' && f.status !== 'bye').map(f => f.status);
    console.log(`[checkAndUpdateSwissPairings] Pending fixture statuses: ${[...new Set(pendingStatuses)].join(', ')}`);
    return;
  }

  // Check if there's a next round
  const nextRound = completedRound + 1;
  if (nextRound > totalRounds) {
    console.log(`[checkAndUpdateSwissPairings] League ${leagueId} completed all ${totalRounds} rounds. Finalizing Swiss league...`);

    // 1. Automatically mark league as completed
    await League.update(
      { status: 'completed' },
      { where: { id: leagueId, status: 'active' } }
    );

    try {
      // 2. Final standings update to ensure all tie-breaks (Buchholz/etc) are calculated
      console.log(`[checkAndUpdateSwissPairings] Recalculating final Swiss standings for league ${leagueId}...`);
      await standingsService.updateLeagueStandings(leagueId);

      // 3. Identify and crown the champion for the division/league
      const sortedPlayers = await standingsService.getSortedStandings(leagueId, divisionId);
      if (sortedPlayers && sortedPlayers.length > 0) {
        const winner = sortedPlayers[0];
        console.log(`[checkAndUpdateSwissPairings] Crowning champion: ${winner.player?.name} (ID: ${winner.playerId})`);

        await winner.update({ title: 'Champion' });
        notifyPlayerChampion(winner.playerId, league);

        // Also mark runner-up if enough players
        if (sortedPlayers.length > 1) {
          await sortedPlayers[1].update({ title: 'Runner-up' });
        }
      }
    } catch (finalErr) {
      console.error(`[checkAndUpdateSwissPairings] Error during Swiss finalization:`, finalErr);
    }

    return;
  }

  // Generate pairings for next round
  try {
    console.log(`[checkAndUpdateSwissPairings] All matches in round ${completedRound} complete. Generating pairings for round ${nextRound}...`);
    const updatedFixtures = await generateNextSwissRound(leagueId, nextRound, tieBreakMethod, divisionId);
    console.log(`[checkAndUpdateSwissPairings] ✓ Successfully generated pairings for round ${nextRound} in league ${leagueId}: ${updatedFixtures.length} fixtures updated`);
  } catch (error) {
    console.error(`[checkAndUpdateSwissPairings] ✗ Failed to generate pairings for round ${nextRound}:`, error.message);
    console.error(`[checkAndUpdateSwissPairings] Full error:`, error);
  }
}

async function generateNextLeagueRound(leagueId, nextRound) {
  const league = await League.findByPk(leagueId, {
    include: [{ association: 'divisions', include: [{ association: 'players' }] }, { association: 'leaguePlayers' }]
  });
  if (!league) throw new Error('League not found');

  let structure = league.structure;
  if (typeof structure === 'string') {
    try { structure = JSON.parse(structure); } catch { structure = {}; }
  }

  if (structure.format === 'swiss') {
    const swissConfig = structure.swiss || {};
    return await generateNextSwissRound(leagueId, nextRound, swissConfig.tieBreak || 'buchholz');
  }

  if (structure.format === 'roundRobin' || structure.format === 'homeAway') {
    // For Round Robin, we just generate the fixtures for the specific round
    const divisions = league.divisions || [];
    const fixtures = await generateRoundRobinFixtures(league, structure, divisions);

    // The controller will save these fixtures
    return fixtures;
  }

  if (structure.format === 'knockout' || structure.format === 'groupsKnockout') {
    // Knockout fixtures are pre-generated by createKnockoutBracket.
    // Advancing the round just means the admin is ready to see the next set of matches.
    // The actual advancement of winners happens in real-time via advanceKnockoutWinner.
    return { success: true, message: `Ready for Round ${nextRound}` };
  }

  throw new Error(`Round-by-round generation not supported for ${structure.format}`);
}

/**
 * Automatically move a knockout winner to the next round's fixture slot.
 */
async function advanceKnockoutWinner(fixtureId, winnerId) {
  const { Fixture } = require('../models');
  const { Op } = require('sequelize');

  const currentFixture = await Fixture.findByPk(fixtureId);
  if (!currentFixture) return;

  // Allow advancement for: knockout stages AND bye advancement (winnerId passed explicitly)
  // FALLBACK: Treat empty stage as knockout if it has no divisionId
  const isKnockoutStage = currentFixture.stage === 'knockout' || currentFixture.stage === 'groupsKnockout' || (!currentFixture.stage && !currentFixture.divisionId);
  if (!isKnockoutStage) return;

  // Use explicitly passed winnerId if fixture.winnerId not yet set (e.g. BYE seeding)
  let effectiveWinnerId = winnerId || currentFixture.winnerId;

  // Resolve Draw automatically for Knockout stages if no winner is set
  if (!effectiveWinnerId && currentFixture.player1Id && currentFixture.player2Id) {
    console.log(`[advanceKnockoutWinner] Match ${fixtureId} is a draw. Applying tie-breakers for progression.`);

    const { MatchResult, League } = require('../models');

    // Get league to determine sport
    const league = await League.findByPk(currentFixture.leagueId);
    const sport = league?.sport ? String(league.sport).toLowerCase() : 'snooker';

    const allResults = await MatchResult.findAll({
      where: {
        leagueId: currentFixture.leagueId,
        resultStatus: { [Op.or]: ['Confirmed', 'Completed', 'confirmed', 'completed'] }
      }
    });

    // Sport-specific tie-breaker logic
    if (sport === 'pool' || sport === 'pooker') {
      // Pool/Pooker: Racks → Balls Potted → 7-Ball Wins → Black Finishes (Pooker only) → Whitewash Wins → Player 1
      const getPoolStats = (pId) => {
        const pResults = allResults.filter(r => r.player1Id === pId || r.player2Id === pId);
        const rw = pResults.reduce((sum, r) => sum + (r.player1Id === pId ? (r.player1RackWins || 0) : (r.player2RackWins || 0)), 0);
        const rl = pResults.reduce((sum, r) => sum + (r.player1Id === pId ? (r.player2RackWins || 0) : (r.player1RackWins || 0)), 0);
        const bp = pResults.reduce((sum, r) => sum + (r.player1Id === pId ? (r.player1BallsPotted || 0) : (r.player2BallsPotted || 0)), 0);
        const sbw = pResults.reduce((sum, r) => sum + (r.player1Id === pId ? (r.player1SevenBallWins || 0) : (r.player2SevenBallWins || 0)), 0);
        const bf = pResults.reduce((sum, r) => sum + (r.player1Id === pId ? (r.player1BlackFinishes || 0) : (r.player2BlackFinishes || 0)), 0);
        const ww = pResults.reduce((sum, r) => sum + (r.player1Id === pId ? (r.player1WhitewashWins || 0) : (r.player2WhitewashWins || 0)), 0);
        return { rw, rd: rw - rl, bp, sbw, bf, ww };
      };

      const s1 = getPoolStats(currentFixture.player1Id);
      const s2 = getPoolStats(currentFixture.player2Id);

      // Tie-break hierarchy for Pool/Pooker: Rack Difference → Total Racks → Balls Potted → 7-Ball Wins → Black Finishes → Whitewash Wins → Player 1
      if (s1.rd !== s2.rd) effectiveWinnerId = s1.rd > s2.rd ? currentFixture.player1Id : currentFixture.player2Id;
      else if (s1.rw !== s2.rw) effectiveWinnerId = s1.rw > s2.rw ? currentFixture.player1Id : currentFixture.player2Id;
      else if (s1.bp !== s2.bp) effectiveWinnerId = s1.bp > s2.bp ? currentFixture.player1Id : currentFixture.player2Id;
      else if (s1.sbw !== s2.sbw) effectiveWinnerId = s1.sbw > s2.sbw ? currentFixture.player1Id : currentFixture.player2Id;
      else if (sport === 'pooker' && s1.bf !== s2.bf) effectiveWinnerId = s1.bf > s2.bf ? currentFixture.player1Id : currentFixture.player2Id;
      else if (s1.ww !== s2.ww) effectiveWinnerId = s1.ww > s2.ww ? currentFixture.player1Id : currentFixture.player2Id;
      else effectiveWinnerId = currentFixture.player1Id; // Fallback

      console.log(`[advanceKnockoutWinner] ${sport.toUpperCase()} tie-breaker: P1(rd:${s1.rd} rw:${s1.rw} bp:${s1.bp} sbw:${s1.sbw}${sport === 'pooker' ? ` bf:${s1.bf}` : ''} ww:${s1.ww}) vs P2(rd:${s2.rd} rw:${s2.rw} bp:${s2.bp} sbw:${s2.sbw}${sport === 'pooker' ? ` bf:${s2.bf}` : ''} ww:${s2.ww}) → Winner: ${effectiveWinnerId}`);
    } else {
      // Snooker: Frame Difference → Total Frames → Highest Break → Player 1
      const getStats = (pId) => {
        const pResults = allResults.filter(r => r.player1Id === pId || r.player2Id === pId);
        const fw = pResults.reduce((sum, r) => sum + (r.player1Id === pId ? (r.player1Frames || 0) : (r.player2Frames || 0)), 0);
        const fl = pResults.reduce((sum, r) => sum + (r.player1Id === pId ? (r.player2Frames || 0) : (r.player1Frames || 0)), 0);
        const hb = pResults.reduce((max, r) => Math.max(max, (r.player1Id === pId ? (r.player1HighestBreak || 0) : (r.player2HighestBreak || 0))), 0);
        return { fw, fd: fw - fl, hb };
      };

      const s1 = getStats(currentFixture.player1Id);
      const s2 = getStats(currentFixture.player2Id);

      if (s1.fd !== s2.fd) effectiveWinnerId = s1.fd > s2.fd ? currentFixture.player1Id : currentFixture.player2Id;
      else if (s1.fw !== s2.fw) effectiveWinnerId = s1.fw > s2.fw ? currentFixture.player1Id : currentFixture.player2Id;
      else if (s1.hb !== s2.hb) effectiveWinnerId = s1.hb > s2.hb ? currentFixture.player1Id : currentFixture.player2Id;
      else effectiveWinnerId = currentFixture.player1Id; // Fallback

      console.log(`[advanceKnockoutWinner] SNOOKER tie-breaker: P1(fd:${s1.fd} fw:${s1.fw} hb:${s1.hb}) vs P2(fd:${s2.fd} fw:${s2.fw} hb:${s2.hb}) → Winner: ${effectiveWinnerId}`);
    }
  }

  if (!effectiveWinnerId) return;

  const nextRound = currentFixture.round + 1;
  const nextMatchIndex = Math.floor(currentFixture.matchIndex / 2);
  const isPlayer1Slot = currentFixture.matchIndex % 2 === 0;

  // Find the target fixture in the next round — check both stage names
  const targetFixture = await Fixture.findOne({
    where: {
      leagueId: currentFixture.leagueId,
      round: nextRound,
      matchIndex: nextMatchIndex,
      stage: { [Op.in]: ['knockout', 'groupsKnockout', '', null] }
    }
  });

  if (targetFixture) {
    const updateData = isPlayer1Slot ? { player1Id: effectiveWinnerId } : { player2Id: effectiveWinnerId };
    console.log(`[advanceKnockoutWinner] Advancing winner ${effectiveWinnerId} from match ${currentFixture.matchIndex} (R${currentFixture.round}) to ${isPlayer1Slot ? 'P1' : 'P2'} slot in match ${nextMatchIndex} (R${nextRound})`);

    await targetFixture.update(updateData);

    // Notify winner that they advanced to next round
    const league = await League.findByPk(currentFixture.leagueId);
    if (league) {
      notifyPlayerQualified(effectiveWinnerId, league, currentFixture.round, nextRound, currentFixture.stage);
    }

    // Re-fetch to get updated player slots
    const refreshed = await Fixture.findByPk(targetFixture.id);

    // If this fixture is a BYE (one player, no real opponent), auto-advance immediately
    if (refreshed.status === 'bye') {
      const byeWinnerId = refreshed.player1Id || refreshed.player2Id;
      if (byeWinnerId) {
        await refreshed.update({ winnerId: byeWinnerId, status: 'bye' });
        await advanceKnockoutWinner(refreshed.id, byeWinnerId);
      }
    }
    // If one slot was already filled and is now complete (both players present and other slot is null/bye), auto-advance
    else if (refreshed.player1Id && !refreshed.player2Id) {
      // Check if this is a BYE because no second player will ever come
      // We detect this by checking if the sibling match (the match that fills p2) is also a bye
      const siblingMatchIndex = isPlayer1Slot ? currentFixture.matchIndex + 1 : currentFixture.matchIndex - 1;
      const siblingMatch = await Fixture.findOne({
        where: {
          leagueId: currentFixture.leagueId,
          round: currentFixture.round,
          matchIndex: siblingMatchIndex,
          stage: { [Op.in]: ['knockout', 'groupsKnockout'] }
        }
      });
      if (siblingMatch && siblingMatch.status === 'bye') {
        // Sibling is also a bye — this next match has only one actual player, auto-advance them
        await refreshed.update({ player2Id: null, winnerId: refreshed.player1Id, status: 'bye' });
        await advanceKnockoutWinner(refreshed.id, refreshed.player1Id);
      }
    } else if (!refreshed.player1Id && refreshed.player2Id) {
      const siblingMatchIndex = isPlayer1Slot ? currentFixture.matchIndex + 1 : currentFixture.matchIndex - 1;
      const siblingMatch = await Fixture.findOne({
        where: {
          leagueId: currentFixture.leagueId,
          round: currentFixture.round,
          matchIndex: siblingMatchIndex,
          stage: { [Op.in]: ['knockout', 'groupsKnockout'] }
        }
      });
      if (siblingMatch && siblingMatch.status === 'bye') {
        await refreshed.update({ player1Id: null, winnerId: refreshed.player2Id, status: 'bye' });
        await advanceKnockoutWinner(refreshed.id, refreshed.player2Id);
      }
    }
  } else {
    // No target fixture in the next round - this was the Final!
    const league = await League.findByPk(currentFixture.leagueId);

    // The effectiveWinnerId is already resolved via tie-breakers if it was a draw
    const championId = effectiveWinnerId;
    const runnerUpId = (championId === currentFixture.player1Id) ? currentFixture.player2Id : currentFixture.player1Id;

    await League.update(
      { status: 'completed' },
      { where: { id: currentFixture.leagueId, status: 'active' } }
    );
    console.log(`[advanceKnockoutWinner] Final match reached. Marking league ${currentFixture.leagueId} as completed.`);

    if (league && championId) {
      await notifyPlayerChampion(championId, league);

      // Award titles in LeaguePlayer record
      const { LeaguePlayer } = require('../models');

      // Update Champion
      const lpChampion = await LeaguePlayer.findOne({
        where: { leagueId: currentFixture.leagueId, playerId: championId }
      });
      if (lpChampion) {
        await lpChampion.update({ title: 'Champion' }).catch(() => { });
      }

      // Update Runner-up
      if (runnerUpId) {
        const lpRunnerUp = await LeaguePlayer.findOne({
          where: { leagueId: currentFixture.leagueId, playerId: runnerUpId }
        });
        if (lpRunnerUp) {
          await lpRunnerUp.update({ title: 'Runner-up' }).catch(() => { });
        }
      }
    }
  }
}

/**
 * Handle late corner injection without regenerating the whole league.
 * Adds the player to all future rounds of the league.
 */
async function injectLateJoiner(leagueId, playerId, divisionId = null) {
  const league = await League.findByPk(leagueId, {
    include: [
      {
        association: 'divisions',
        separate: true,
        order: [['createdAt', 'ASC']],
        include: [{ association: 'players', required: false, include: [{ association: 'player', attributes: ['id'] }] }]
      },
      {
        association: 'leaguePlayers',
        where: { approvalStatus: 'approved' },
        required: false,
        include: [{ association: 'player', attributes: ['id'] }]
      }
    ]
  });

  if (!league || league.status !== 'active') return [];

  const currentRound = league.currentRound || 1;
  const { Fixture } = require('../models');

  let structure = league.structure;
  if (typeof structure === 'string') {
    try { structure = JSON.parse(structure); } catch { structure = {}; }
  }

  const format = structure?.format;
  const existingFixtures = await Fixture.findAll({
    where: { leagueId },
    attributes: ['id', 'player1Id', 'player2Id', 'divisionId', 'round', 'status']
  });

  const existingKeys = new Set(
    existingFixtures.map(f => `${f.round}:${f.divisionId || 'null'}:${f.player1Id || 'null'}:${f.player2Id || 'null'}`)
  );

  let generatedFixtures = [];
  if (format === 'roundRobin' || format === 'homeAway') {
    generatedFixtures = await generateRoundRobinFixtures(league, structure, league.divisions || []);
  } else if (format === 'groupsKnockout') {
    generatedFixtures = await generateGroupsKnockoutFixtures(league, structure, league.divisions || []);
  } else if (format === 'knockout') {
    generatedFixtures = await generateKnockoutFixtures(league, structure, league.divisions || []);
  } else if (format === 'swiss') {
    generatedFixtures = await generateSwissFixtures(league, structure, league.divisions || []);
  }

  const isDouble = format === 'homeAway' || (structure.roundRobin && structure.roundRobin.isDouble);
  const fixturesToCreate = generatedFixtures
    .filter(fixture => fixture.round > currentRound)
    .filter(fixture => {
      const directKey = `${fixture.round}:${fixture.divisionId || 'null'}:${fixture.player1Id || 'null'}:${fixture.player2Id || 'null'}`;
      if (existingKeys.has(directKey)) return false;

      if (!isDouble) {
        const reverseKey = `${fixture.round}:${fixture.divisionId || 'null'}:${fixture.player2Id || 'null'}:${fixture.player1Id || 'null'}`;
        if (existingKeys.has(reverseKey)) return false;
      }

      return true;
    });

  const createdFixtures = [];
  for (const fixture of fixturesToCreate) {
    try {
      const created = await Fixture.create({
        ...fixture,
        divisionId: fixture.divisionId ?? divisionId ?? null,
        status: 'scheduled'
      });
      createdFixtures.push(created);
    } catch (error) {
      console.warn('[injectLateJoiner] Failed to create late-join fixture:', error.message || error);
    }
  }

  console.log(`[injectLateJoiner] Injected player ${playerId} into league ${leagueId}; created ${createdFixtures.length} future fixtures starting from round ${currentRound + 1}`);
  return createdFixtures;
}

/**
 * Select which players/teams receive a bye.
 * Options: manual, random, ranked (lowest get bye), ranked_top (highest get bye)
 */
function selectByeRecipients(participants, byeType = 'random', count = 0, manualByes = []) {
  if (count <= 0) return [];

  const allIds = participants.map(p => p.id.toString());
  let selectedIds = [];

  switch (byeType) {
    case 'manual':
      if (Array.isArray(manualByes) && manualByes.length > 0) {
        // Filter to ensure only valid current participants are picked
        selectedIds = manualByes.map(id => id.toString()).filter(id => allIds.includes(id));
      }
      break;

    case 'ranked':
    case 'lowest_ranked':
      selectedIds = [...participants]
        .sort((a, b) => {
          const rA = parseFloat(a.ranking || 0);
          const rB = parseFloat(b.ranking || 0);
          if (rA !== rB) return rA - rB;
          const idA = (a.id || '').toString();
          const idB = (b.id || '').toString();
          return idA > idB ? 1 : (idA < idB ? -1 : 0);
        })
        .map(p => p.id.toString());
      break;

    case 'highest_ranked':
    case 'ranked_top':
      selectedIds = [...participants]
        .sort((a, b) => {
          const rA = parseFloat(a.ranking || 0);
          const rB = parseFloat(b.ranking || 0);
          if (rA !== rB) return rB - rA;
          const idA = (a.id || '').toString();
          const idB = (b.id || '').toString();
          return idA > idB ? 1 : (idA < idB ? -1 : 0);
        })
        .map(p => p.id.toString());
      break;

    case 'random':
    default:
      if (Array.isArray(manualByes) && manualByes.length === count) {
        console.log(`[selectByeRecipients] Using existing manualByes for random selection to match UI preview`);
        selectedIds = manualByes.map(id => id.toString()).filter(id => allIds.includes(id));
      } else {
        selectedIds = shuffleArray([...allIds]);
      }
      break;
  }

  // If we don't have enough byes from the chosen method, fill the rest randomly
  if (selectedIds.length < count) {
    const remaining = allIds.filter(id => !selectedIds.includes(id));
    selectedIds = [...selectedIds, ...shuffleArray(remaining)];
  }

  return selectedIds.slice(0, count);
}




/**
 * Generates the order of seeds in a bracket to ensure top seeds meet as late as possible.
 * For 8 players: [1, 8, 5, 4, 3, 6, 7, 2]
 */
function generateSeededBracketOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    let nextOrder = [];
    let nextMax = order.length * 2 + 1;
    for (let seed of order) {
      nextOrder.push(seed);
      nextOrder.push(nextMax - seed);
    }
    order = nextOrder;
  }
  return order;
}

/**
 * Apply seeding to a list of player objects.
 */
function seedPlayers(players, seedingMethod = 'random', protection = false, manualOrder = []) {
  let sortedPlayers = [];

  switch (seedingMethod) {
    case 'ranking':
    case 'ranked':
      sortedPlayers = [...players].sort((a, b) => {
        const rA = parseFloat(a.ranking || 0);
        const rB = parseFloat(b.ranking || 0);
        if (rA !== rB) return rB - rA;
        const idA = (a.id || '').toString();
        const idB = (b.id || '').toString();
        return idA > idB ? 1 : (idA < idB ? -1 : 0);
      });
      break;

    case 'manual':
      if (Array.isArray(manualOrder) && manualOrder.length > 0) {
        const playerMap = new Map(players.map(p => [p.id.toString(), p]));
        const stringOrder = manualOrder.map(id => id.toString());

        sortedPlayers = stringOrder.map(id => playerMap.get(id)).filter(p => !!p);
        const remaining = players.filter(p => !stringOrder.includes(p.id.toString()));
        sortedPlayers = [...sortedPlayers, ...remaining];
      } else {
        sortedPlayers = [...players];
      }
      break;

    case 'random':
    default:
      sortedPlayers = shuffleArray([...players]);
      break;
  }

  return sortedPlayers;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function calculateScheduledDate(league, round, ...indices) {
  if (!league.leagueStartDate) return null;

  let structure = league.structure;
  if (typeof structure === 'string') {
    try { structure = JSON.parse(structure); } catch { structure = {}; }
  }
  const schedulingMode = structure?.scheduling?.generation || structure?.scheduling?.mode || 'flexible';

  const start = new Date(league.leagueStartDate);
  const end = league.leagueEndDate ? new Date(league.leagueEndDate) : null;

  if (schedulingMode === 'auto' && end) {
    // Randomized date between start and end
    const startTime = start.getTime();
    const endTime = end.getTime();
    const range = endTime - startTime;
    if (range > 0) {
      const randomTime = startTime + Math.random() * range;
      return new Date(randomTime);
    }
  }

  // Default / 'flexible': 1 match per week (fixed day)
  start.setDate(start.getDate() + (round - 1) * 7);
  return start;
}

// ============================================
// MAIN GENERATION FUNCTION (used by controller)
// ============================================

/**
 * Generate fixtures for a league (internal, no HTTP).
 * @param {string} leagueId
 * @param {string|null} divisionId - optional, generate only for a specific division
 * @returns {Promise<Array>} - the created fixtures
 */
async function generateFixturesForLeague(leagueId, divisionId = null, options = { incremental: false }) {
  const league = await League.findByPk(leagueId, {
    include: [
      {
        association: 'divisions',
        include: [{
          association: 'players',
          where: { approvalStatus: 'approved' },
          required: false,
          include: [{ association: 'player', attributes: ['id'] }]
        }]
      },
      {
        association: 'leaguePlayers',
        where: { approvalStatus: 'approved' },
        required: false, // Don't fail if no players are approved yet
        include: [{ association: 'player', attributes: ['id'] }]
      }
    ]
  });

  if (!league) throw new Error('League not found');

  // Fetch existing fixtures if incremental
  let existingFixtures = [];
  if (options.incremental) {
    existingFixtures = await Fixture.findAll({
      where: { leagueId },
      attributes: ['id', 'player1Id', 'player2Id', 'divisionId', 'status', 'scheduledDate']
    });
    console.log(`[generateFixturesForLeague] Incremental mode: Found ${existingFixtures.length} existing fixtures to preserve.`);
  }

  // Robust sport check
  let sport = String(league.sport || '').toLowerCase();
  if (!sport || (sport !== 'snooker' && sport !== 'pool' && sport !== 'pooker' && sport !== 'poker')) {
    sport = determineSportFromGameName(league.gameName || league.basicInfo?.gameName).toLowerCase();
    if (sport !== String(league.sport || '').toLowerCase()) {
      console.log(`[generateFixturesForLeague] Re-detected sport [${sport}] for league ${league.id}`);
    }
  }

  // Poker leagues can now generate fixtures if they use a standard format

  let structure = league.structure;
  if (typeof structure === 'string') {
    try { structure = JSON.parse(structure); } catch { structure = {}; }
  }
  const format = structure?.format;
  if (!format) throw new Error('League format not defined in structure');

  let divisions = league.divisions;
  if (divisionId) {
    divisions = divisions.filter(d => d.id === divisionId);
    if (divisions.length === 0) throw new Error('Division not found');
  }

  // Only delete if NOT incremental
  if (!options.incremental) {
    await Fixture.destroy({ where: { leagueId } });
  } else if (format === 'knockout') {
    // SPECIAL CASE: Knockout structures change entirely when player count shifts.
    // To avoid duplicates (like seen in user feedback), we remove old 'scheduled' or 'bye' 
    // matches that have NO bookings and NO results yet.
    const { MatchResult, Booking } = require('../models');

    // Find fixtures we can safely remove
    const safeToRemove = await Fixture.findAll({
      where: {
        leagueId,
        status: { [Op.in]: ['scheduled', 'bye'] }
      },
      include: [
        { association: 'matchResult', required: false },
        { association: 'bookings', required: false }
      ]
    });

    const idsToDelete = safeToRemove
      .filter(f => !f.matchResult && (!f.bookings || f.bookings.length === 0))
      .map(f => f.id);

    if (idsToDelete.length > 0) {
      console.log(`[generateFixturesForLeague] Cleaning up ${idsToDelete.length} stale knockout matches for restructuring.`);
      await Fixture.destroy({ where: { id: { [Op.in]: idsToDelete } } });
      // Refresh existingFixtures list so we don't skip adding the new versions
      existingFixtures = existingFixtures.filter(ef => !idsToDelete.includes(ef.id));
    }
  }

  let fixtures = [];

  switch (format) {
    case 'roundRobin':
    case 'homeAway':
      fixtures = await generateRoundRobinFixtures(league, structure, divisions);
      break;
    case 'groupsKnockout':
      fixtures = await generateGroupsKnockoutFixtures(league, structure, divisions);
      break;
    case 'knockout':
      fixtures = await generateKnockoutFixtures(league, structure, divisions);
      break;
    case 'swiss':
      fixtures = await generateSwissFixtures(league, structure, divisions);
      break;
    case 'custom':
      fixtures = [];
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  // Filter out existing fixtures if incremental
  if (options.incremental && existingFixtures.length > 0) {
    // SAFETY CHECK: Never modify or touch confirmed/booked fixtures
    const confirmedOrBookedFixtures = existingFixtures.filter(f =>
      f.status === 'confirmed' || f.status === 'booked'
    );

    if (confirmedOrBookedFixtures.length > 0) {
      console.log(`[generateFixturesForLeague] PROTECTED: ${confirmedOrBookedFixtures.length} confirmed/booked fixtures will NOT be modified.`);
    }

    const isDouble = format === 'homeAway' || (structure.roundRobin && structure.roundRobin.isDouble);
    fixtures = fixtures.filter(f => {
      const alreadyExists = existingFixtures.some(ef => {
        const matchFound = (ef.player1Id === f.player1Id && ef.player2Id === f.player2Id && ef.divisionId === f.divisionId);
        if (isDouble) return matchFound;
        // For single round robin, A vs B is the same as B vs A
        const reverseMatchFound = (ef.player1Id === f.player2Id && ef.player2Id === f.player1Id && ef.divisionId === f.divisionId);
        return matchFound || reverseMatchFound;
      });
      return !alreadyExists;
    });
    console.log(`[generateFixturesForLeague] Incremental mode: ${fixtures.length} new matches to add. ${existingFixtures.length} existing matches preserved (unchanged).`);
  }

  // Scheduling: respect league.structure.scheduling if provided
  const scheduling = structure.scheduling || {};

  // Booking model is used to reserve slots
  const { Booking } = require('../models');

  // Helper to check booking conflicts
  const isSlotAvailable = async ({ venueOwnerId, venueId, bookingDate, startTime, tableNumber }) => {
    const where = { bookingDate };
    if (venueOwnerId) where.venueOwnerId = venueOwnerId;
    if (venueId) where.venueId = venueId;
    if (tableNumber !== undefined && tableNumber !== null) where.tableNumber = tableNumber;
    // consider only pending/confirmed bookings
    const conflict = await Booking.findOne({ where: { ...where, status: { [Op.in]: ['pending', 'confirmed'] } } });
    return !conflict;
  };

  // Helper: given a recurring slot template, find earliest available date within range
  const findNextAvailableForSlot = async (slotTemplate, startDate, endDate, usedDatesSet) => {
    // slotTemplate: { dayOfWeek: 0-6 (Sun=0), startTime: '18:00', endTime: '20:00', tableNumber, venueOwnerId, venueId }
    const sd = new Date(startDate);
    const ed = new Date(endDate);
    for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (slotTemplate.dayOfWeek !== undefined && slotTemplate.dayOfWeek !== dow) continue;
      const dateStr = d.toISOString().slice(0, 10);
      if (usedDatesSet.has(`${dateStr}::${slotTemplate.tableNumber}`)) continue;
      const available = await isSlotAvailable({ venueOwnerId: slotTemplate.venueOwnerId, venueId: slotTemplate.venueId, bookingDate: dateStr, startTime: slotTemplate.startTime, tableNumber: slotTemplate.tableNumber });
      if (available) return { bookingDate: dateStr, startTime: slotTemplate.startTime, endTime: slotTemplate.endTime, tableNumber: slotTemplate.tableNumber, venueOwnerId: slotTemplate.venueOwnerId, venueId: slotTemplate.venueId };
    }
    return null;
  };

  const scheduledFixtures = []; // will hold { fixture: f, booking: slotInfo | null }
  const usedDatesSet = new Set(); // track table+date used in this generation round

  if (scheduling && (scheduling.mode === 'flexible' || scheduling.generation === 'flexible')) {
    // Flexible play: create fixtures without scheduledDate; players will book via Booking API
    for (const f of fixtures) scheduledFixtures.push({ fixture: f, booking: null });
  } else if (scheduling && Array.isArray(scheduling.slots) && scheduling.slots.length > 0 && league.basicInfo && league.basicInfo.leagueStartDate && league.basicInfo.leagueEndDate) {
    // Assign slots sequentially between league start/end according to provided recurring slots
    const startDate = new Date(league.basicInfo.leagueStartDate);
    const endDate = new Date(league.basicInfo.leagueEndDate);
    for (const f of fixtures) {
      let assigned = false;
      for (const slot of scheduling.slots) {
        try {
          const next = await findNextAvailableForSlot(slot, startDate, endDate, usedDatesSet);
          if (next) {
            usedDatesSet.add(`${next.bookingDate}::${next.tableNumber}`);
            f.scheduledDate = new Date(next.bookingDate + 'T' + (next.startTime || '00:00:00'));
            scheduledFixtures.push({ fixture: f, booking: next });
            assigned = true;
            break;
          }
        } catch (slotErr) {
          console.warn('Error checking slot availability:', slotErr.message || slotErr);
        }
      }
      if (!assigned) {
        f.scheduledDate = null;
        scheduledFixtures.push({ fixture: f, booking: null });
      }
    }
  } else {
    // No slots, but try to distribute across venues (if any)
    if (Array.isArray(league.venueIds) && league.venueIds.length > 0) {
      // Multiple venues: distribute across venues
      let venueIdx = 0;
      for (const f of fixtures) {
        // We no longer auto-assign bookings here to ensure fixtures stay unbooked (TBA) 
        // until manually booked by the player or organizer.
        scheduledFixtures.push({ fixture: f, booking: null });
      }
    } else {
      // No venues: create fixtures without scheduling
      for (const f of fixtures) scheduledFixtures.push({ fixture: f, booking: null });
    }
  }

  const createdFixtures = [];
  for (const item of scheduledFixtures) {
    const { fixture, booking } = item.fixture ? item : { fixture: item, booking: null };
    try {
      const created = await Fixture.create(fixture);
      createdFixtures.push(created);
      if (booking) {
        try {
          await Booking.create({
            fixtureId: created.id,
            leagueId: created.leagueId,
            playerId: created.player1Id,
            opponentId: created.player2Id || null,
            venueOwnerId: booking.venueOwnerId || null,
            venueId: booking.venueId || null,
            bookingDate: booking.bookingDate,
            startTime: booking.startTime || '00:00',
            endTime: booking.endTime || '23:59',
            tableNumber: booking.tableNumber || 1,
            tableName: booking.tableName || null,
            status: 'pending',
            sport: league.sport || 'snooker',
          });
        } catch (bkErr) {
          console.warn('Failed to create booking for created fixture:', bkErr.message || bkErr);
        }
      }
    } catch (fErr) {
      console.warn('Failed to create fixture:', fErr.message || fErr);
    }
  }

  try { await league.update({ fixturesGenerated: true }); } catch (uErr) { console.warn('Failed to update league.fixturesGenerated:', uErr.message || uErr); }

  return createdFixtures;
}

/**
 * Unified helper to check if a league is completed and update its status.
 * Used by match confirmation, approval, and advancement logic.
 */
async function checkLeagueCompletion(leagueId) {
  try {
    // Lazy load models to avoid circular dependencies if any
    const { Fixture, League, LeaguePlayer } = require('../models');
    const { Op } = require('sequelize');

    const league = await League.findByPk(leagueId, {
      include: [{ association: 'divisions' }]
    });
    if (!league || league.status !== 'active') return;

    // Count fixtures that are still pending (not completed/bye/cancelled)
    // Include all actively waiting statuses that indicate the league is still in play.
    const { Op: OpInner } = require('sequelize');
    const remainingCount = await Fixture.count({
      where: {
        leagueId: leagueId,
        status: { [OpInner.in]: ['scheduled', 'ongoing', 'upcoming', 'in_progress'] }
      }
    });

    console.log(`[checkLeagueCompletion] League ${leagueId} pending fixture count: ${remainingCount}`);

    let isFinished = false;

    let structure = {};
    if (typeof league.structure === 'string') {
      try { structure = JSON.parse(league.structure || '{}'); } catch (e) { }
    } else if (league.structure) {
      structure = league.structure;
    }
    const format = structure.format || league.format;
    const isDouble = format === 'homeAway' || (structure.roundRobin && structure.roundRobin.isDouble);

    if (format === 'roundRobin' || format === 'homeAway') {
      // Calculate EXPECTED fixture count for round robin formats
      let expectedCompletedCount = 0;
      const divisions = league.divisions || [];

      if (divisions.length > 0) {
        for (const div of divisions) {
          const count = await LeaguePlayer.count({ where: { leagueId, divisionId: div.id, approvalStatus: { [OpInner.in]: ['approved', 'withdrawn'] } } });
          if (count > 1) {
            const evenCount = count + (count % 2);
            const rounds = evenCount - 1;
            const fixturesPerRound = evenCount / 2;
            expectedCompletedCount += (fixturesPerRound * rounds) * (isDouble ? 2 : 1);
          }
        }
      } else {
        const count = await LeaguePlayer.count({ where: { leagueId, approvalStatus: { [OpInner.in]: ['approved', 'withdrawn'] } } });
        if (count > 1) {
          const evenCount = count + (count % 2);
          const rounds = evenCount - 1;
          const fixturesPerRound = evenCount / 2;
          expectedCompletedCount += (fixturesPerRound * rounds) * (isDouble ? 2 : 1);
        }
      }

      const completedCount = await Fixture.count({
        where: {
          leagueId,
          status: { [OpInner.in]: ['completed', 'bye', 'walkover'] },
          stage: { [OpInner.or]: ['group', 'round_robin', 'roundRobin', 'homeAway', null] }
        }
      });

      console.log(`[checkLeagueCompletion] Format: ${format} (double: ${isDouble}). Expected: ${expectedCompletedCount}, Completed: ${completedCount}`);

      // Only complete if we have generated and completed ALL expected matches, and none are pending
      if (completedCount >= expectedCompletedCount && expectedCompletedCount > 0 && remainingCount === 0) {
        // Wait! Are there knockout stages pending?
        const knockoutPending = await Fixture.count({
          where: { leagueId, stage: { [OpInner.in]: ['knockout', 'groupsKnockout'] }, status: { [OpInner.notIn]: ['completed', 'bye', 'walkover', 'cancelled'] } }
        });
        if (knockoutPending === 0) {
          isFinished = true;
        }
      }
    } else {
      // For other formats (swiss, pure knockout), fallback to remainingCount === 0 logic
      // Ensure there's at least some completed matches to avoid completing empty leagues
      const completedCount = await Fixture.count({
        where: { leagueId, status: { [OpInner.in]: ['completed', 'bye', 'walkover'] } }
      });
      if (remainingCount === 0 && completedCount > 0) {
        isFinished = true;
      }
    }

    if (isFinished) {
      await league.update({ status: 'completed' });
      console.log(`[checkLeagueCompletion] All fixtures completed. Marking league ${leagueId} as completed.`);

      // Auto-trigger full finalization logic (promotions, relegations, crowns)
      try {
        const { finalizeLeagueInternally } = require('../controllers/leagueController');
        if (typeof finalizeLeagueInternally === 'function') {
          console.log(`[checkLeagueCompletion] Initiating automatic finalization for league ${leagueId}...`);
          await finalizeLeagueInternally(leagueId);
        }
      } catch (finalizeErr) {
        console.warn(`[checkLeagueCompletion] Auto-finalization error for league ${leagueId}:`, finalizeErr.message);
      }

      return true; // Marked as completed
    }
  } catch (error) {
    console.warn(`[checkLeagueCompletion] Error checking completion for league ${leagueId}:`, error.message);
  }
  return false;
}

/**
 * Seed the Group Stage winners into the empty Knockout Bracket.
 * Maps top players from each division to the brackets based on rankings.
 */
async function seedGroupKnockoutQualifiers(leagueId) {
  const { League, Division, Fixture } = require('../models');
  const standingsService = require('./standingsService');

  const league = await League.findByPk(leagueId, { include: ['divisions'] });
  if (!league) throw new Error("League not found");

  const structure = typeof league.structure === 'string' ? JSON.parse(league.structure) : league.structure;
  const format = structure?.format || league.format;

  const isGK = format === 'groupsKnockout';
  const isRR = format === 'roundRobin' || format === 'homeAway';
  const isSwiss = format === 'swiss';

  if (!isGK && !isRR && !isSwiss) {
    throw new Error(`Knockout seeding not supported for league format: ${format}`);
  }

  const qualifiersPerGroup = isGK
    ? parseInt(structure.groups?.qualifiers || 0, 10)
    : parseInt(structure.knockout?.qualifiers || structure.qualifiers || 4, 10);

  if (qualifiersPerGroup < 1) throw new Error("Invalid qualifiers per group/league");

  // Verify no pending qualifying matches (group stage, round robin, or swiss)
  const pendingQualifyingMatches = await Fixture.count({
    where: {
      leagueId,
      stage: { [require('sequelize').Op.in]: ['group', 'round_robin', 'swiss'] },
      status: { [require('sequelize').Op.notIn]: ['completed', 'bye', 'walkover'] }
    }
  });

  if (pendingQualifyingMatches > 0) {
    throw new Error("Cannot generate knockout bracket: Qualifying matches (Group/Round Robin/Swiss) are still pending.");
  }

  // Update standings just to be sure
  await standingsService.updateLeagueStandings(leagueId);

  // Collect qualified players
  let allQualifiers = []; // array of { player: LeaguePlayer, groupRank: N }

  const divisions = await Division.findAll({ where: { leagueId }, order: [['name', 'ASC']] });
  for (const div of divisions) {
    const standings = await standingsService.getSortedStandings(leagueId, div.id);
    for (let i = 0; i < Math.min(qualifiersPerGroup, standings.length); i++) {
      // CRITICAL FIX: Skip withdrawn players from knockout seeding
      if (standings[i].status === 'withdrawn') {
        console.log(`[seedGroupKnockoutQualifiers] Skipping withdrawn player ${standings[i].playerId} from knockout seeding`);
        continue;
      }
      allQualifiers.push({ player: standings[i], groupRank: i + 1, divisionName: div.name });
    }
  }

  console.log(`[seedGroupKnockoutQualifiers] Qualified players after filtering withdrawn: ${allQualifiers.length} (total ${allQualifiers.map(q => q.player.playerId).join(', ')})`);

  // Seeding: Determine how to order these qualifiers in the bracket
  const seedingMethod = structure.knockout?.seeding || 'ranked';
  const manualOrder = structure.knockout?.manualOrder || [];

  if (seedingMethod === 'manual' && manualOrder.length > 0) {
    console.log(`[seedGroupKnockoutQualifiers] Using manual bracket order for league ${leagueId}`);
    const qualifierMap = new Map(allQualifiers.map(q => [q.player.playerId.toString(), q]));
    const orderedQualifiers = [];

    // Seat players in provided manual order
    manualOrder.forEach(pId => {
      const q = qualifierMap.get(pId.toString());
      if (q) {
        orderedQualifiers.push(q);
        qualifierMap.delete(pId.toString());
      }
    });

    // Append any survivors not in manual list (safety fallback)
    allQualifiers = [...orderedQualifiers, ...Array.from(qualifierMap.values())];
  } else if (seedingMethod === 'random') {
    console.log(`[seedGroupKnockoutQualifiers] Using random seeding for league ${leagueId}`);
    // If the UI has already "rolled" a random order, it should have been in manualOrder.
    // Otherwise, we roll here.
    shuffleArray(allQualifiers);
  } else {
    // Default: Ranked seeding (standard)
    // Sort them: All 1st place first, then all 2nd place, etc.
    allQualifiers.sort((a, b) => {
      if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank;
      // Tie-break within same rank by points
      return (b.player.points || 0) - (a.player.points || 0);
    });
  }

  // CRITICAL: Use actual qualified count after filtering withdrawn players
  const totalQualifiers = allQualifiers.length;
  console.log(`[seedGroupKnockoutQualifiers] Total qualifiers after filtering withdrawn: ${totalQualifiers} (was expected: ${isGK ? (divisions.length * qualifiersPerGroup) : qualifiersPerGroup})`);

  let round1Fixtures = await Fixture.findAll({
    where: {
      leagueId,
      stage: isGK ? 'groupsKnockout' : 'knockout',
      round: 1
    },
    order: [['matchIndex', 'ASC']]
  });

  // FALLBACK: If no fixtures found with explicit stage, try finding placeholders with empty stage
  if (round1Fixtures.length === 0) {
    console.log(`[seedGroupKnockoutQualifiers] No explicit knockout fixtures found. Searching for empty-stage placeholders...`);
    round1Fixtures = await Fixture.findAll({
      where: {
        leagueId,
        stage: { [require('sequelize').Op.or]: ['', null] },
        round: 1
      },
      order: [['matchIndex', 'ASC']]
    });

    if (round1Fixtures.length > 0) {
      console.log(`[seedGroupKnockoutQualifiers] Found ${round1Fixtures.length} empty-stage placeholders. Repairing labels...`);
      const targetStage = isGK ? 'groupsKnockout' : 'knockout';
      // Fix all rounds, not just round 1
      await Fixture.update(
        { stage: targetStage },
        { where: { leagueId, stage: { [require('sequelize').Op.or]: ['', null] } } }
      );
    }
  }

  if (round1Fixtures.length === 0) {
    if (isGK) throw new Error("No knockout fixtures generated yet!");

    // For RR/Swiss, if no bracket exists, we create one now based on totalQualifiers
    console.log(`[seedGroupKnockoutQualifiers] Creating new knockout bracket for ${format} league ${leagueId} with ${totalQualifiers} qualifiers`);
    const bracketFixtures = createKnockoutBracket(leagueId, totalQualifiers, 'knockout');

    // Save these fixtures to DB
    for (const f of bracketFixtures) {
      await Fixture.create(f);
    }

    // Reload round 1
    round1Fixtures = await Fixture.findAll({
      where: {
        leagueId,
        stage: isGK ? 'groupsKnockout' : 'knockout',
        round: 1
      },
      order: [['matchIndex', 'ASC']]
    });
  }

  // Bracket Seeding Magic 
  // E.g. for 8 players: [1,8], [4,5], [2,7], [3,6]
  let roundsLog = Math.ceil(Math.log2(totalQualifiers));
  let bracketSize = Math.pow(2, roundsLog); // Number of SEEDS (may be larger than actual players, giving top players Byes)

  function getSeeding(numPlayers) {
    if (numPlayers <= 1) return [1];
    let rounds = Math.log(numPlayers) / Math.log(2) - 1;
    let pls = [1, 2];
    for (let i = 0; i < rounds; i++) {
      pls = nextLayer(pls);
    }
    return pls;
    function nextLayer(pls) {
      let out = [];
      let length = pls.length * 2 + 1;
      pls.forEach(function (d) {
        out.push(d);
        out.push(length - d);
      });
      return out;
    }
  }

  const seededIndices = getSeeding(bracketSize);

  for (let m = 0; m < round1Fixtures.length; m++) {
    const fixture = round1Fixtures[m];

    const p1SeedNum = seededIndices[m * 2];
    const p2SeedNum = seededIndices[m * 2 + 1];

    const player1 = p1SeedNum <= allQualifiers.length ? allQualifiers[p1SeedNum - 1]?.player?.playerId || null : null;
    const player2 = p2SeedNum <= allQualifiers.length ? allQualifiers[p2SeedNum - 1]?.player?.playerId || null : null;

    const newStatus = (!player1 && !player2) ? 'scheduled' :
      (player1 && player2) ? 'scheduled' : 'bye';

    console.log(`[seedGroupKnockoutQualifiers] Seeding match ${m + 1} (fixtures.id=${fixture.id}): Seed#${p1SeedNum}=${player1} vs Seed#${p2SeedNum}=${player2} → status=${newStatus}`);

    await fixture.update({
      player1Id: player1,
      player2Id: player2,
      status: newStatus,
      // CRITICAL: set winnerId immediately for BYE fixtures so nextRound repair can find them
      winnerId: newStatus === 'bye' ? (player1 || player2) : null
    });

    console.log(`[seedGroupKnockoutQualifiers] Match ${fixture.id} SEEDED: player1=${player1}, player2=${player2}, status=${newStatus}, winnerId=${newStatus === 'bye' ? (player1 || player2) : null}`);

    // Auto-advance byes immediately
    if (newStatus === 'bye') {
      const byeWinner = player1 || player2;
      if (byeWinner) {
        console.log(`[seedGroupKnockoutQualifiers] Auto-advancing bye winner ${byeWinner} from match ${fixture.id}...`);
        await module.exports.advanceKnockoutWinner(fixture.id, byeWinner);
      }
    }
  }

  // Finally, run a global repair to ensure all advancements (especially nested byes) are fully propagated
  await repairLeagueKnockoutAdvancement(leagueId);

  return true;
}

/**upcom
 * Robustly repairs all knockout advancements for a league.
 * Iterates through all knockout fixtures and ensures winners are advanced to the next round slots.
 */
async function repairLeagueKnockoutAdvancement(leagueId) {
  const { Fixture } = require('../models');
  const { Op } = require('sequelize');

  console.log(`[repairLeagueKnockoutAdvancement] Starting global repair for league ${leagueId}`);

  // Fetch all knockout fixtures ordered by round to ensure sequential propagation
  const knockoutFixtures = await Fixture.findAll({
    where: {
      leagueId,
      stage: { [Op.in]: ['knockout', 'groupsKnockout'] }
    },
    order: [['round', 'ASC'], ['matchIndex', 'ASC']]
  });

  for (const fixture of knockoutFixtures) {
    // 1. Fix missing winnerId for BYE fixtures (often from before the fix)
    if (fixture.status === 'bye' && !fixture.winnerId) {
      const byeWinner = fixture.player1Id || fixture.player2Id;
      if (byeWinner) {
        console.log(`[repairLeagueKnockoutAdvancement] Fixing null winnerId for BYE fixture ${fixture.id} (R${fixture.round}) -> winner: ${byeWinner}`);
        await fixture.update({ winnerId: byeWinner });
        fixture.winnerId = byeWinner; // Update local object for next step
      }
    }

    // 2. If we have a winner, ensure they are advanced to the NEXT round
    if (fixture.winnerId) {
      // We use the existing advanceKnockoutWinner logic
      // It handles finding the target fixture and updating its player slots
      await advanceKnockoutWinner(fixture.id, fixture.winnerId).catch(err => {
        console.warn(`[repairLeagueKnockoutAdvancement] Error advancing fixture ${fixture.id}:`, err.message);
      });
    }
  }

  console.log(`[repairLeagueKnockoutAdvancement] Global repair complete for league ${leagueId}`);
  return true;
}

module.exports = {
  generateFixturesForLeague,
  generateNextLeagueRound,
  advanceKnockoutWinner,
  repairLeagueKnockoutAdvancement,
  injectLateJoiner,
  determineSportFromGameName,
  checkAndUpdateSwissPairings,
  generateNextSwissRound,
  checkLeagueCompletion,
  seedGroupKnockoutQualifiers
};
