import React, { useState, useEffect } from 'react';
import { FaCheck, FaTimes, FaCircle } from 'react-icons/fa';
import TournamentStandingsTable from './TournamentStandingsTable';
import TournamentGroupsView from '../../../Tournament/TournamentGroupsView';
import QualifiersDisplay from '../../../Tournament/QualifiersDisplay';
import LadderView from '../../../Tournament/LadderView';

/**
 * LiveTournamentProgressionView
 * Displays tournament bracket with real-time progression
 * Shows advancing winners, eliminated players, and match results
 */
export default function LiveTournamentProgressionView({
  matches,
  tournament,
  groupStageView,
  onRecordResult,
  onDisputeMatch,
}) {
  const [roundGroups, setRoundGroups] = useState([]);

  const formatFixtureDate = (bookingValue = null) => {
    const effectiveValue = bookingValue;
    if (!effectiveValue) return "-";
    const parsed = new Date(effectiveValue);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
  };

  const formatDeadlineDate = (value = null) => {
    if (!value) return "-";
    // Keep YYYY-MM-DD stable (no timezone shift).
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
  };

  // Helper function to extract player name from match player data
  const getPlayerName = (player, isByeSlot = false) => {
    if (isByeSlot) return '';
    if (!player) return 'TBD';
    if (typeof player === 'string') return player;
    if (player.name) return player.name;
    if (player.playerName) return player.playerName;
    return 'Unknown Player';
  };

  // Determine if match was auto-forfeited (deadline exceeded)
  const isAutoForfeited = (match) => match.isDefault && match.status === 'completed';

  useEffect(() => {
    // Group matches by round
    const groups = {};
    matches
      .filter(match => Boolean(match.player1Id) && Boolean(match.player2Id))
      .forEach(match => {
      const roundNum = match.roundNumber || 1;
      if (!groups[roundNum]) {
        groups[roundNum] = [];
      }
      groups[roundNum].push(match);
    });

    // Convert to sorted array
    const sorted = Object.keys(groups)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(roundNum => ({
        roundNumber: parseInt(roundNum),
        matches: groups[roundNum],
      }));

    setRoundGroups(sorted);
  }, [matches]);

  const getRoundLabel = (round, tournament, roundMatches) => {
    // Preliminary/qualification round (round 0 or isPreliminaryRound flag)
    if (round.roundNumber === 0 || roundMatches.some(m => m.isPreliminaryRound || m.roundType === 'preliminary')) {
      return 'Preliminary Round';
    }

    const formatType = tournament?.format?.type;

    const nextPowerOfTwo = (x) => {
      const n = Number(x) || 0;
      if (n <= 1) return 2;
      return Math.pow(2, Math.ceil(Math.log2(n)));
    };

    const uniquePlayerCount = (ms) => {
      const ids = new Set();
      for (const m of ms) {
        if (m?.player1Id) ids.add(m.player1Id);
        if (m?.player2Id) ids.add(m.player2Id);
      }
      return ids.size;
    };

    // Knockout bracket size should be a power-of-two even when BYEs reduce visible matches.
    const allRealKoMatches = (formatType === 'knockout' || formatType === 'round_robin')
      ? matches.filter(m => m?.player1Id && m?.player2Id)
      : matches;

    if (formatType === 'knockout') {
      const playerCount =
        tournament?.currentParticipantCount ||
        uniquePlayerCount(allRealKoMatches);
      const bracketSize = nextPowerOfTwo(playerCount);
      const localRoundIndex = Number(round.roundNumber) || 1; // Round 1 -> exponent 0
      const playersInThisRound = bracketSize / Math.pow(2, localRoundIndex - 1);
      return `Round of ${Math.max(2, Math.round(playersInThisRound))}`;
    } else if (formatType === 'swiss') {
      return `Swiss Round ${round.roundNumber}`;
    } else if (formatType === 'round_robin') {
      return `Round ${round.roundNumber}`;
    } else if (formatType === 'groups_knockout') {
      const knockoutStartRound = tournament.format?.knockoutStartRound || 999;
      if (round.roundNumber < knockoutStartRound) {
        return `Group Stage - Round ${round.roundNumber}`;
      } else {
        // Compute knockout label using expected bracket size (power-of-two of unique players in KO part)
        const koMatches = matches.filter(
          (m) =>
            m?.player1Id &&
            m?.player2Id &&
            m.roundNumber != null &&
            Number(m.roundNumber) >= knockoutStartRound
        );
        const koPlayerCount = tournament?.currentParticipantCount || uniquePlayerCount(koMatches);
        const bracketSize = nextPowerOfTwo(koPlayerCount);
        const localRoundIndex = Number(round.roundNumber) - knockoutStartRound + 1;
        const playersInThisRound = bracketSize / Math.pow(2, localRoundIndex - 1);
        return `Round of ${Math.max(2, Math.round(playersInThisRound))}`;
      }
    }
    return `Round ${round.roundNumber}`;
  };

  const groupMatchesByGroupNumber = (roundMatches) => {
    const map = {};
    for (const m of roundMatches) {
      const g = m.groupNumber ?? 0;
      if (!map[g]) map[g] = [];
      map[g].push(m);
    }
    return Object.keys(map)
      .map(Number)
      .filter((k) => k > 0)
      .sort((a, b) => a - b)
      .map((gn) => ({
        groupNumber: gn,
        matches: map[gn],
      }));
  };

  const getMatchStatus = (match) => {
    if (match.status === 'completed') return 'completed';
    if (match.status === 'in_progress') return 'in_progress';
    if (match.isDisputed) return 'disputed';
    return 'scheduled';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-300';
      case 'in_progress':
        return 'bg-yellow-50 border-yellow-300';
      case 'disputed':
        return 'bg-red-50 border-red-300';
      default:
        return 'bg-gray-50 border-gray-300';
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'disputed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  // If this is a ladder format, render LadderView instead
  if (tournament?.format?.type === 'ladder') {
    return (
      <div className="space-y-4 p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Ladder Tournament</h3>
        <LadderView tournamentId={tournament.id} />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Tournament Bracket - Live Progression</h3>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-gray-700">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className="text-gray-700">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-gray-700">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-gray-700">Disputed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 font-semibold">Walkover</span>
            <span className="text-gray-700">Opponent withdrew</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-semibold">Forfeited</span>
            <span className="text-gray-700">Deadline exceeded</span>
          </div>
        </div>
      </div>

      {roundGroups.length === 0 ? (
        <div className="p-12 bg-white border-2 border-dashed border-gray-300 rounded-lg text-center">
          <p className="text-gray-600 font-medium mb-2">No bracket generated yet</p>
          <p className="text-sm text-gray-500">Lock registration to generate bracket and matches</p>
        </div>
      ) : (
        <div className="space-y-8">
          {roundGroups.map((round) => {
            const koStart = tournament?.format?.knockoutStartRound || 999;
            const partitionGroupStage =
              tournament?.format?.type === 'groups_knockout' &&
              round.roundNumber < koStart &&
              round.matches.some((m) => m.groupNumber != null);

            const subsections = partitionGroupStage
              ? groupMatchesByGroupNumber(round.matches)
              : [{ groupNumber: null, matches: round.matches }];

            return (
            <div key={round.roundNumber} className="space-y-4">
              <h4 className="text-lg font-bold text-gray-900 pb-2 border-b-2 border-gray-300">
                {getRoundLabel(round, tournament, round.matches)}
                {(round.roundNumber === 0 || round.matches.some(m => m.isPreliminaryRound || m.roundType === 'preliminary')) && (
                  <span className="text-xs text-indigo-600 font-normal ml-3 italic">(winners advance to main bracket)</span>
                )}
              </h4>

              <div className="space-y-6">
                {subsections.map((sub) => (
                  <div key={sub.groupNumber ?? 'all'} className="space-y-3">
                    {sub.groupNumber != null && (
                      <div className="text-sm font-bold text-gray-800 border-l-4 border-blue-500 pl-3 py-1 bg-blue-50/60 rounded-r">
                        Group {String.fromCharCode(64 + Number(sub.groupNumber))}
                        {groupStageView?.groups?.length ? (
                          <span className="ml-2 text-xs font-normal text-gray-600">
                            Active round{' '}
                            {groupStageView.groups.find((g) => g.groupNumber === sub.groupNumber)?.currentRound ?? '—'}
                          </span>
                        ) : null}
                      </div>
                    )}
                    {sub.matches.map((match) => {
                  const status = getMatchStatus(match);
                  const isPlayer1Winner = match.winner === 'player1';
                  const isPlayer2Winner = match.winner === 'player2';
                  const isWalkoverMatch = match.isWalkover;
                  const isForfeited = isAutoForfeited(match);

                  return (
                    <div
                      key={match.id}
                      className={`border-2 rounded-lg p-4 transition ${
                        isForfeited
                          ? 'bg-red-50 border-red-200'
                          : getStatusColor(status)
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Match Info */}
                        <div className="flex-1">
                          {/* Best Of indicator */}
                          {match.bestOfFrames && (
                            <p className="text-xs text-indigo-600 font-semibold mb-1">
                              Best of {match.bestOfFrames}
                            </p>
                          )}

                          {/* Player 1 */}
                          <div className={`flex items-center justify-between p-3 rounded mb-2 ${
                            isPlayer1Winner ? 'bg-green-200' : 'bg-gray-100'
                          }`}>
                            <div className="flex-1 flex items-center gap-2">
                              <p className={`font-semibold ${isPlayer1Winner ? 'text-green-900' : 'text-gray-900'}`}>
                                {getPlayerName(match.player1)}
                              </p>
                            </div>
                            {status === 'completed' && (
                              <div className="text-center min-w-16">
                                <div className="text-lg font-bold text-gray-900">
                                  {match.player1FramesWon || 0}
                                </div>
                                {isPlayer1Winner && (
                                  <FaCheck className="text-green-600 mx-auto mt-1" />
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 my-1 px-3">
                            <div className="flex-1 h-px bg-gray-400"></div>
                            <span className="text-xs font-semibold text-gray-600">vs</span>
                            <div className="flex-1 h-px bg-gray-400"></div>
                          </div>

                          <div className={`flex items-center justify-between p-3 rounded ${
                            isPlayer2Winner ? 'bg-green-200' : 'bg-gray-100'
                          }`}>
                            <div className="flex-1 flex items-center gap-2">
                              <p className={`font-semibold ${isPlayer2Winner ? 'text-green-900' : 'text-gray-900'}`}>
                                {getPlayerName(match.player2)}
                              </p>
                            </div>
                            {status === 'completed' && (
                              <div className="text-center min-w-16">
                                <div className="text-lg font-bold text-gray-900">
                                  {match.player2FramesWon || 0}
                                </div>
                                {isPlayer2Winner && (
                                  <FaCheck className="text-green-600 mx-auto mt-1" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status & Actions */}
                        <div className="flex flex-col items-end gap-3 min-w-48">
                          <div className="flex flex-wrap items-center gap-2 justify-end">
                            {/* Walkover badge */}
                            {isWalkoverMatch && (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                                Walkover
                              </span>
                            )}
                            {/* Forfeited badge */}
                            {isForfeited && (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                Forfeited
                              </span>
                            )}
                            {/* Normal status badge */}
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(status)}`}>
                              {status === 'in_progress' ? 'In Progress' : status}
                            </span>
                            <div className={`w-2 h-2 rounded-full ${
                              status === 'completed' ? 'bg-green-500' :
                              status === 'in_progress' ? 'bg-yellow-500' :
                              status === 'disputed' ? 'bg-red-500' :
                              'bg-blue-500'
                            }`}></div>
                          </div>

                          <p className="text-xs text-gray-600">
                            📅 {formatFixtureDate(match.bookingDate)}
                          </p>

                          {(tournament?.matchDeadlineDate || tournament?.registrationDeadline || match?.deadline || match?.scheduledDeadline) && (
                            <p className="text-xs text-orange-600">
                              ⏳ Deadline: {formatDeadlineDate(
                                tournament?.matchDeadlineDate ||
                                tournament?.registrationDeadline ||
                                match?.deadline ||
                                match?.scheduledDeadline
                              )}
                            </p>
                          )}

                          {/* Match Actions — hide for BYE and forfeited matches */}
                          {!isForfeited && (
                            <div className="flex gap-2 flex-wrap justify-end">
                              {(status === 'scheduled' || status === 'in_progress') && (
                                <button
                                  onClick={() => onRecordResult(match)}
                                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition font-medium"
                                >
                                  Record
                                </button>
                              )}
                              {status === 'completed' && !match.isDisputed && !isWalkoverMatch && (
                                <button
                                  onClick={() => onDisputeMatch(match)}
                                  className="px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition font-medium"
                                >
                                  Dispute
                                </button>
                              )}
                              {match.isDisputed && (
                                <button
                                  onClick={() => onDisputeMatch(match)}
                                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition font-medium"
                                >
                                  Review
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Forfeited note */}
                      {isForfeited && (
                        <div className="mt-3 pt-3 border-t border-red-300 text-red-700 text-xs font-medium">
                          🔴 Auto-forfeited: match deadline exceeded
                        </div>
                      )}

                      {/* Walkover reason */}
                      {isWalkoverMatch && match.walkovermReason && (
                        <div className="mt-3 pt-3 border-t border-orange-300 text-orange-700 text-xs font-medium">
                          🟠 {match.walkovermReason}
                        </div>
                      )}

                      {/* Dispute Badge */}
                      {match.isDisputed && (
                        <div className="mt-3 pt-3 border-t border-red-300 text-red-700 text-xs font-medium">
                          ⚠️ This match result is disputed
                        </div>
                      )}
                    </div>
                  );
                })}
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Progress Summary */}
      {roundGroups.length > 0 && (
        <div className="mt-8 p-4 bg-white border border-gray-300 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-3">Progress Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {matches.filter(m => m.status === 'scheduled').length}
              </div>
              <p className="text-xs text-gray-600 mt-1">Scheduled</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {matches.filter(m => m.status === 'in_progress').length}
              </div>
              <p className="text-xs text-gray-600 mt-1">In Progress</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {matches.filter(m => m.status === 'completed').length}
              </div>
              <p className="text-xs text-gray-600 mt-1">Completed</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {matches.filter(m => m.isDisputed).length}
              </div>
              <p className="text-xs text-gray-600 mt-1">Disputed</p>
            </div>
          </div>
        </div>
      )}

      {/* Swiss Tournament Standings */}
      {tournament?.format?.type === 'swiss' && (
        <div className="mt-8">
          <TournamentStandingsTable
            tournamentId={tournament.id}
            tournament={tournament}
          />
        </div>
      )}

      {/* Groups + Knockout: Show Groups and Qualifiers */}
      {tournament?.format?.type === 'groups_knockout' && (
        <div className="mt-8 space-y-8">
          <TournamentGroupsView tournament={tournament} />
          <QualifiersDisplay tournament={tournament} />
        </div>
      )}
    </div>
  );
}
