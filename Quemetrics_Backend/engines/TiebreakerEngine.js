/**
 * TiebreakerEngine.js
 *
 * Centralized engine for applying tiebreaker rules across tournament formats.
 * Used by Swiss advancement, Group stage standings, and general player ranking.
 *
 * Supported tiebreaker types:
 * - head_to_head: Record in direct matchups between tied players
 * - frame_difference: Total frames won - frames lost
 * - frames_won: Total frames won
 * - points_difference: Total points scored - points conceded
 * - highest_break: Highest single break/run in all matches
 * - random: Random tiebreaker (last resort)
 */

const TiebreakerEngine = {
  /**
   * Rank players using tiebreaker rules
   *
   * @param {Array} players - Array of player objects with scores: [{playerId, points, framesWon, framesLost, pointsFor, pointsAgainst, highestBreak}, ...]
   * @param {Array} tiebreakerPriority - Ordered array of tiebreaker types to apply
   * @param {Array} matchHistory - Array of completed matches for H2H calculation
   * @returns {Array} Players sorted by ranking (highest rank first)
   */
  rankPlayersByTiebreaker(players, tiebreakerPriority = null, matchHistory = []) {
    if (!players || players.length === 0) return [];

    // Default tiebreaker priority (used in tournaments)
    const priority = tiebreakerPriority || [
      "head_to_head",
      "frame_difference",
      "frames_won",
      "points_difference",
      "highest_break",
      "random"
    ];

    // Create working copy to avoid mutation
    const ranked = JSON.parse(JSON.stringify(players));

    // Apply each tiebreaker in sequence
    for (const tiebreaker of priority) {
      // Find groups of tied players (same points)
      const groups = this._groupByPoints(ranked);

      // Apply tiebreaker within each tied group
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].length <= 1) continue; // No tie to break

        const tiedPlayers = groups[i];
        const tiebreakerMethod = this._getTiebreakerMethod(tiebreaker);

        if (!tiebreakerMethod) continue; // Skip unknown tiebreaker

        // Sort this group by tiebreaker
        const sorted = tiedPlayers.sort((a, b) => {
          return tiebreakerMethod(a, b, matchHistory);
        });

        // Update points to reflect tiebreaker ranking
        // This ensures subsequent tiebreakers only apply to true ties
        let tiePoints = sorted[0].points;
        for (let j = 1; j < sorted.length; j++) {
          const diff = tiebreakerMethod(sorted[j], sorted[j - 1], matchHistory);
          if (diff !== 0) {
            // Player is no longer tied - assign unique points
            tiePoints -= 0.001 * j; // Micro-adjust to preserve order
          }
          sorted[j].points = tiePoints;
        }

        // Re-merge sorted tied players. They may be non-contiguous in `ranked` after prior
        // tiebreakers adjusted points (splice(start, tied.length) would delete wrong rows).
        const tiedIdSet = new Set(tiedPlayers.map((p) => p.playerId));
        const indices = tiedPlayers
          .map((p) => ranked.findIndex((r) => r.playerId === p.playerId))
          .filter((idx) => idx >= 0);
        const insertAt = indices.length ? Math.min(...indices) : 0;
        const filtered = ranked.filter((r) => !tiedIdSet.has(r.playerId));
        filtered.splice(insertAt, 0, ...sorted);
        ranked.length = 0;
        ranked.push(...filtered);
      }
    }

    // Final sort by points (descending)
    return ranked.sort((a, b) => b.points - a.points);
  },

  /**
   * Get tiebreaker comparison function
   * @private
   */
  _getTiebreakerMethod(tiebreakerType) {
    const methods = {
      points: this._comparePoints.bind(this),
      head_to_head: this._compareHeadToHead.bind(this),
      buchholz: this._compareBuchholz.bind(this),
      sonneborn_berger: this._compareSonnebornBerger.bind(this),
      frame_difference: this._compareFrameDifference.bind(this),
      frames_won: this._compareFramesWon.bind(this),
      points_difference: this._comparePointsDifference.bind(this),
      highest_break: this._compareHighestBreak.bind(this),
      random: this._compareRandom.bind(this)
    };

    return methods[tiebreakerType] || null;
  },

  /**
   * Group players by same points value
   * @private
   */
  _groupByPoints(players) {
    const pointMap = {};

    players.forEach(p => {
      const key = p.points.toString();
      if (!pointMap[key]) pointMap[key] = [];
      pointMap[key].push(p);
    });

    return Object.values(pointMap);
  },

  /**
   * Compare by tournament points (primary)
   * @private
   */
  _comparePoints(playerA, playerB) {
    return (playerB.points || 0) - (playerA.points || 0);
  },

  /**
   * Buchholz: sum of opponents' tournament points
   * @private
   */
  _compareBuchholz(playerA, playerB) {
    return (playerB.buchholz || 0) - (playerA.buchholz || 0);
  },

  /**
   * Sonneborn–Berger: sum of points of opponents defeated
   * @private
   */
  _compareSonnebornBerger(playerA, playerB) {
    return (playerB.sonnebornBerger || 0) - (playerA.sonnebornBerger || 0);
  },

  /**
   * Compare players by head-to-head record
   * @private
   */
  _compareHeadToHead(playerA, playerB, matchHistory) {
    if (!matchHistory || matchHistory.length === 0) return 0;

    let aWins = 0, bWins = 0;

    // Find all matches between playerA and playerB
    matchHistory.forEach(match => {
      const aIsPlayer1 = match.player1Id === playerA.playerId;
      const aIsPlayer2 = match.player2Id === playerA.playerId;
      const bIsPlayer1 = match.player1Id === playerB.playerId;
      const bIsPlayer2 = match.player2Id === playerB.playerId;

      // Match only counts if both players are involved
      if ((aIsPlayer1 || aIsPlayer2) && (bIsPlayer1 || bIsPlayer2)) {
        const aWon = (aIsPlayer1 && match.winner === "player1") || (aIsPlayer2 && match.winner === "player2");
        if (aWon) aWins++;
        else bWins++;
      }
    });

    return bWins - aWins; // Positive means B wins H2H
  },

  /**
   * Compare players by frame difference (frames won - frames lost)
   * @private
   */
  _compareFrameDifference(playerA, playerB) {
    const aDiff = (playerA.framesWon || 0) - (playerA.framesLost || 0);
    const bDiff = (playerB.framesWon || 0) - (playerB.framesLost || 0);
    return bDiff - aDiff;
  },

  /**
   * Compare players by total frames won
   * @private
   */
  _compareFramesWon(playerA, playerB) {
    return (playerB.framesWon || 0) - (playerA.framesWon || 0);
  },

  /**
   * Compare players by points difference (points for - points against)
   * @private
   */
  _comparePointsDifference(playerA, playerB) {
    const aDiff = (playerA.pointsFor || 0) - (playerA.pointsAgainst || 0);
    const bDiff = (playerB.pointsFor || 0) - (playerB.pointsAgainst || 0);
    return bDiff - aDiff;
  },

  /**
   * Compare players by highest break/run
   * @private
   */
  _compareHighestBreak(playerA, playerB) {
    return (playerB.highestBreak || 0) - (playerA.highestBreak || 0);
  },

  /**
   * Random comparison (last resort tiebreaker)
   * @private
   */
  _compareRandom() {
    return Math.random() - 0.5;
  },

  /**
   * Calculate group standings from completed matches
   * Useful for Swiss and Group stage scenarios
   *
   * @param {Array} playerIds - List of player IDs in group/round
   * @param {Array} matches - Completed matches in this group/round
   * @param {Object} scoringRules - Tournament scoring rules
   * @returns {Array} Ranked players with standings
   */
  calculateGroupStandings(playerIds, matches, scoringRules) {
    const standings = {};

    // Initialize player records
    playerIds.forEach(pid => {
      standings[pid] = {
        playerId: pid,
        points: 0,
        matchesPlayed: 0,
        framesWon: 0,
        framesLost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        highestBreak: 0,
        wins: 0,
        losses: 0
      };
    });

    // Process completed matches
    matches.forEach(match => {
      // Byes: player1 is the winner, player2 is null/missing
      const isBye = !match.player2Id || match.status === 'bye' || match.isBye;
      
      if (!match.player1Id) return; // Must have at least one player
      if (match.status !== "completed" && match.status !== "bye" && !match.isBye) return; // Only count completed or byes

      const p1Stats = standings[match.player1Id];
      if (!p1Stats) return;

      if (isBye) {
        // Increment nothing for byes to ensure they don't affect standings
        return;
      }

      const p2Stats = standings[match.player2Id];
      if (!p2Stats) return;

      // Update match counts
      p1Stats.matchesPlayed++;
      p2Stats.matchesPlayed++;

      // Update frame counts
      p1Stats.framesWon += match.player1FramesWon || 0;
      p1Stats.framesLost += match.player2FramesWon || 0;
      p2Stats.framesWon += match.player2FramesWon || 0;
      p2Stats.framesLost += match.player1FramesWon || 0;

      // Update point counts
      p1Stats.pointsFor += match.player1Points || 0;
      p1Stats.pointsAgainst += match.player2Points || 0;
      p2Stats.pointsFor += match.player2Points || 0;
      p2Stats.pointsAgainst += match.player1Points || 0;

      // Update highest break
      if (match.player1HighestBreak) {
        p1Stats.highestBreak = Math.max(p1Stats.highestBreak, match.player1HighestBreak);
      }
      if (match.player2HighestBreak) {
        p2Stats.highestBreak = Math.max(p2Stats.highestBreak, match.player2HighestBreak);
      }

      // Award points based on result
      const winner = match.winner;
      if (winner === "player1") {
        p1Stats.points += scoringRules.pointsWin || 3;
        p2Stats.points += scoringRules.pointsLoss || 0;
        p1Stats.wins++;
        p2Stats.losses++;
      } else if (winner === "player2") {
        p2Stats.points += scoringRules.pointsWin || 3;
        p1Stats.points += scoringRules.pointsLoss || 0;
        p2Stats.wins++;
        p1Stats.losses++;
      } else if (match.status === "draw") {
        const drawPoints = scoringRules.pointsDraw || 1;
        p1Stats.points += drawPoints;
        p2Stats.points += drawPoints;
      }
    });

    // Convert to array and apply tiebreakers
    const playerArray = Object.values(standings);
    return this.rankPlayersByTiebreaker(playerArray, null, matches);
  },

  /**
   * Get top N players from standings (useful for determining qualifiers)
   *
   * @param {Array} standings - Ranked standings array
   * @param {number} count - Number of top players to return
   * @returns {Array} Top N players
   */
  getTopPlayers(standings, count) {
    return standings.slice(0, count);
  },

  // ============================================================================
  // RANKING-LEVEL TIEBREAKERS
  // ============================================================================

  /**
   * Rank players by overall ranking points with ranking-specific tiebreakers.
   * Used for global rankings display, not in-tournament standings.
   *
   * Tiebreaker order:
   * 1. Total rolling 12-month points (primary)
   * 2. Highest-tier tournament win (national > regional > county > local)
   * 3. Number of tournament wins
   * 4. Win percentage
   * 5. Frame difference
   *
   * @param {Array} players - Array of { playerId, totalPoints, tournamentWins: [{tier, position}], matchesWon, matchesPlayed, framesWon, framesLost }
   * @returns {Array} Sorted player rankings
   */
  rankByOverallRanking(players) {
    if (!players || players.length === 0) return [];

    const TIER_ORDER = { national: 4, regional: 3, county: 2, local: 1 };

    const ranked = [...players].sort((a, b) => {
      // 1. Total points (descending)
      const ptsDiff = (b.totalPoints || 0) - (a.totalPoints || 0);
      if (ptsDiff !== 0) return ptsDiff;

      // 2. Highest-tier tournament win
      const aMaxTier = Math.max(0, ...(a.tournamentWins || []).filter(w => w.position === 1).map(w => TIER_ORDER[w.tier] || 0));
      const bMaxTier = Math.max(0, ...(b.tournamentWins || []).filter(w => w.position === 1).map(w => TIER_ORDER[w.tier] || 0));
      if (bMaxTier !== aMaxTier) return bMaxTier - aMaxTier;

      // 3. Number of tournament wins
      const aWins = (a.tournamentWins || []).filter(w => w.position === 1).length;
      const bWins = (b.tournamentWins || []).filter(w => w.position === 1).length;
      if (bWins !== aWins) return bWins - aWins;

      // 4. Win percentage
      const aWinPct = a.matchesPlayed > 0 ? (a.matchesWon || 0) / a.matchesPlayed : 0;
      const bWinPct = b.matchesPlayed > 0 ? (b.matchesWon || 0) / b.matchesPlayed : 0;
      if (bWinPct !== aWinPct) return bWinPct - aWinPct;

      // 5. Frame difference
      const aFD = (a.framesWon || 0) - (a.framesLost || 0);
      const bFD = (b.framesWon || 0) - (b.framesLost || 0);
      return bFD - aFD;
    });

    return ranked.map((p, i) => ({ ...p, rank: i + 1 }));
  }
};

module.exports = TiebreakerEngine;
