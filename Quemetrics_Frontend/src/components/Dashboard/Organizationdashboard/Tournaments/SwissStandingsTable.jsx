import React, { useState, useEffect } from 'react';
import { FaTrophy, FaFire } from 'react-icons/fa';

/**
 * SwissStandingsTable
 * Displays current standings for Swiss format tournaments
 * Shows wins, points, frame difference, and tie-breaker scores
 */
export default function SwissStandingsTable({ tournament, matches }) {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matches || matches.length === 0) {
      setStandings([]);
      setLoading(false);
      return;
    }

    // Safety check - if no tournament or participants, set empty standings
    if (!tournament || !tournament.participants || tournament.participants.length === 0) {
      setStandings([]);
      setLoading(false);
      return;
    }

    // Calculate standings from matches
    const participantMap = {};
    tournament?.participants?.forEach(p => {
      const pid = p.playerId || p.id;
      participantMap[pid] = {
        playerId: pid,
        playerName: p.player?.name || 'Unknown',
        seed: p.seed,
        matchesPlayed: 0,
        matchesWon: 0,
        framesWon: 0,
        framesLost: 0,
        pointsEarned: 0,
        buchholzScore: 0,
      };
    });

    // Process completed matches
    const completedMatches = matches.filter(m => m.status === 'completed');

    completedMatches.forEach(match => {
      if (!match.player1Id || !match.player2Id) return; // Skip byes

      const scoringRules = tournament?.scoringRules || {};
      const pointsWin = scoringRules.pointsWin || 3;
      const pointsLoss = scoringRules.pointsLoss || 0;

      // Update player1 stats
      if (participantMap[match.player1Id]) {
        const p1 = participantMap[match.player1Id];
        p1.matchesPlayed++;
        p1.framesWon += match.player1FramesWon || 0;
        p1.framesLost += match.player2FramesWon || 0;

        if (match.winner === 'player1') {
          p1.matchesWon++;
          p1.pointsEarned += pointsWin;
        } else if (match.winner === 'player2') {
          p1.pointsEarned += pointsLoss;
        }
      }

      // Update player2 stats
      if (participantMap[match.player2Id]) {
        const p2 = participantMap[match.player2Id];
        p2.matchesPlayed++;
        p2.framesWon += match.player2FramesWon || 0;
        p2.framesLost += match.player1FramesWon || 0;

        if (match.winner === 'player2') {
          p2.matchesWon++;
          p2.pointsEarned += pointsWin;
        } else if (match.winner === 'player1') {
          p2.pointsEarned += pointsLoss;
        }
      }
    });

    // Calculate Buchholz scores (sum of opponents' points)
    Object.values(participantMap).forEach(player => {
      let buchholzScore = 0;

      completedMatches.forEach(match => {
        if (match.player1Id === player.playerId && match.player2Id) {
          const opponent = participantMap[match.player2Id];
          if (opponent) buchholzScore += opponent.pointsEarned;
        } else if (match.player2Id === player.playerId && match.player1Id) {
          const opponent = participantMap[match.player1Id];
          if (opponent) buchholzScore += opponent.pointsEarned;
        }
      });

      player.buchholzScore = buchholzScore;
    });

    // Sort by: points > frame difference > buchholz > name
    const sorted = Object.values(participantMap).sort((a, b) => {
      if (b.pointsEarned !== a.pointsEarned) {
        return b.pointsEarned - a.pointsEarned;
      }
      const aFrameDiff = (a.framesWon || 0) - (a.framesLost || 0);
      const bFrameDiff = (b.framesWon || 0) - (b.framesLost || 0);
      if (bFrameDiff !== aFrameDiff) {
        return bFrameDiff - aFrameDiff;
      }
      if (b.buchholzScore !== a.buchholzScore) {
        return b.buchholzScore - a.buchholzScore;
      }
      return a.playerName.localeCompare(b.playerName);
    });

    setStandings(sorted);
    setLoading(false);
  }, [matches, tournament]);

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Loading standings...</div>;
  }

  if (standings.length === 0) {
    return <div className="p-4 text-center text-gray-500">No standings data available yet</div>;
  }

  return (
    <div className="w-full bg-white rounded-lg border border-gray-300 overflow-hidden shadow">
      <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <FaTrophy className="text-yellow-300" />
          Swiss Tournament Standings
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-300">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Rank</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Player</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">W</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Points</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Frame Diff</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Buchholz</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Seed</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((player, index) => {
              const frameDiff = (player.framesWon || 0) - (player.framesLost || 0);
              const isTopThree = index < 3;

              return (
                <tr
                  key={player.playerId}
                  className={`border-b border-gray-200 transition ${
                    isTopThree
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-white ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-orange-600' :
                      'bg-gray-300'
                    }`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {player.playerName}
                    {isTopThree && <FaFire className="inline-block ml-2 text-orange-500" />}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    <span className="font-semibold">{player.matchesWon || 0}</span>
                    <span className="text-gray-500">/{player.matchesPlayed || 0}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-semibold">
                      {player.pointsEarned || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-semibold ${
                      frameDiff > 0 ? 'text-green-600' :
                      frameDiff < 0 ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      {frameDiff > 0 ? '+' : ''}{frameDiff}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700 font-medium">
                    {player.buchholzScore || 0}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    #{player.seed || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-gray-50 px-4 py-3 border-t border-gray-300">
        <p className="text-xs text-gray-600">
          <strong>Legend:</strong> W = Wins, Points = Tournament Points, Frame Diff = Frames Won - Lost,
          Buchholz = Sum of Opponents' Points (Tiebreaker)
        </p>
      </div>
    </div>
  );
}
