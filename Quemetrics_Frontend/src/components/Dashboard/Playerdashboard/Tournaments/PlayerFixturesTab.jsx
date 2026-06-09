/**
 * Player Fixtures Tab
 * Shows tournament bracket and fixture schedule
 */
import React, { useState, useEffect, useContext } from 'react';
import { TournamentContext } from '../../../../contexts/TournamentContext';

export default function PlayerFixturesTab({ tournament }) {
  const context = useContext(TournamentContext);

  if (!context) {
    return <div className="text-center py-8 text-red-600">Tournament context not available</div>;
  }

  const { matches, loading, error, getTournamentMatches } = context;
  const [expandedRound, setExpandedRound] = useState(1);

  useEffect(() => {
    if (tournament?.id) {
      getTournamentMatches(tournament.id);
    }
  }, [tournament?.id, getTournamentMatches]);

  const matchesByRound = {};
  matches
    .filter((match) => Boolean(match.player1Id) && Boolean(match.player2Id))
    .forEach((match) => {
    const roundNum = match.roundNumber || 1;
    if (!matchesByRound[roundNum]) {
      matchesByRound[roundNum] = [];
    }
    matchesByRound[roundNum].push(match);
  });

  const roundNumbers = Object.keys(matchesByRound)
    .map(Number)
    .sort((a, b) => a - b);

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading fixtures...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
        {error}
      </div>
    );
  }

  if (roundNumbers.length === 0) {
    return (
      <div className="p-8 bg-gray-50 border border-dashed border-gray-300 rounded text-center">
        <p className="text-gray-600">Fixture bracket will be generated once registration closes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {roundNumbers.map((roundNum) => (
        <RoundCard
          key={roundNum}
          roundNumber={roundNum}
          matches={matchesByRound[roundNum]}
          tournament={tournament}
          isExpanded={expandedRound === roundNum}
          onToggle={() =>
            setExpandedRound(expandedRound === roundNum ? null : roundNum)
          }
        />
      ))}
    </div>
  );
}

/**
 * Round Card Component
 */
function RoundCard({ roundNumber, matches, tournament, isExpanded, onToggle }) {
  const getRoundName = (roundType, matchCount) => {
    if (!roundType) {
      if (matchCount === 1) return 'Final';
      if (matchCount === 2) return 'Semi-Finals';
      if (matchCount === 4) return 'Quarter-Finals';
      if (matchCount === 8) return 'Round of 16';
      return `Round ${roundNumber}`;
    }

    const name = roundType.replace(/_/g, ' ').toUpperCase();
    return name.length > 30 ? `Round ${roundNumber}` : name;
  };

  const roundName = getRoundName(matches[0]?.roundType, matches.length);
  const completedCount = matches.filter((m) => m.status === 'completed').length;
  const totalCount = matches.length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-gray-200 flex justify-between items-center hover:from-blue-100 hover:to-blue-150 transition"
      >
        <div className="text-left">
          <h3 className="font-bold text-gray-900 text-lg">{roundName}</h3>
          <p className="text-sm text-gray-600">
            {completedCount} of {totalCount} matches completed
          </p>
        </div>
        <div className="text-right">
          <div className="inline-block w-32 h-2 bg-gray-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{
                width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
              }}
            ></div>
          </div>
        </div>
      </button>

      {/* Matches List */}
      {isExpanded && (
        <div className="divide-y divide-gray-200">
          {matches.map((match) => (
            <FixtureMatch key={match.id} match={match} tournament={tournament} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Returns deadline countdown text and CSS colour class.
 */
function useDeadlineInfo(scheduledDeadline) {
  if (!scheduledDeadline) return null;
  const deadline = new Date(scheduledDeadline);
  const now = new Date();
  const diff = deadline - now;
  if (diff <= 0) {
    return { label: 'OVERDUE', className: 'text-red-700 font-bold' };
  }
  const hours = diff / (1000 * 60 * 60);
  if (hours < 24) {
    const hDisplay = Math.ceil(hours);
    return { label: `Deadline in ${hDisplay}h`, className: 'text-red-600 font-semibold' };
  }
  if (hours < 72) {
    const dDisplay = Math.floor(hours / 24);
    return { label: `Deadline in ${dDisplay}d`, className: 'text-amber-600 font-semibold' };
  }
  return { label: `Deadline: ${deadline.toLocaleDateString()}`, className: 'text-green-700' };
}

/**
 * Fixture Match Component
 */
function FixtureMatch({ match, tournament }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending_confirmation':
        return 'bg-blue-100 text-blue-800';
      case 'disputed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getWinnerIndicator = (match) => {
    if (match.status !== 'completed') return null;

    if (match.winner === 'none') return <span className="text-gray-400">-</span>;

    return <span className="text-green-600 font-bold">✓</span>;
  };

  const deadlineInfo = useDeadlineInfo(match.scheduledDeadline);
  const showFlexibleBanner = tournament?.flexibleScheduling && !match.scheduledDate && match.status !== 'completed';

  return (
    <div className="p-4 hover:bg-gray-50 transition">
      {/* Flexible scheduling banner */}
      {showFlexibleBanner && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
          Flexible scheduling — contact your opponent to arrange a time before the deadline.
        </div>
      )}

      {/* Date and Time */}
      <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-3">
        {match.scheduledDate ? (
          <span>{new Date(match.scheduledDate).toLocaleString()}</span>
        ) : (
          <span className="italic text-gray-400">Not yet scheduled</span>
        )}
        {deadlineInfo && (
          <span className={deadlineInfo.className}>{deadlineInfo.label}</span>
        )}
      </div>

      {/* Players and Score */}
      <div className="flex items-center gap-4 mb-3">
        {/* Player 1 */}
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{match.player1?.name || 'TBD'}</p>
          <p className="text-xs text-gray-500">Player 1</p>
        </div>

        {/* Score or Status */}
        <div className="text-center min-w-fit">
          {match.status === 'completed' ? (
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">
                {match.player1FramesWon || 0} - {match.player2FramesWon || 0}
              </p>
              {getWinnerIndicator(match)}
            </div>
          ) : (
            <div className="text-gray-400">vs</div>
          )}
        </div>

        {/* Player 2 */}
        <div className="flex-1 text-right">
          <p className="font-semibold text-gray-900">{match.player2?.name || 'TBD'}</p>
          <p className="text-xs text-gray-500">Player 2</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex justify-between items-center">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(match.status)}`}>
          {match.status.replace(/_/g, ' ').toUpperCase()}
        </span>

        {match.venue && (
          <span className="text-xs text-gray-600">
            Venue: {match.venue}
          </span>
        )}
      </div>
    </div>
  );
}
