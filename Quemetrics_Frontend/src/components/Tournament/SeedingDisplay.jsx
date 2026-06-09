import React from 'react';
import { FaCheck, FaRandom, FaTrophy, FaListOl } from 'react-icons/fa';

/**
 * SeedingDisplay Component
 * Displays tournament seeding method and seed rankings
 *
 * Props:
 * - tournament: Tournament object with formatConfig
 * - participants: Array of tournament participants with seed positions
 * - rankingSource: 'global' or 'league_table' (default: 'global')
 */
export default function SeedingDisplay({ tournament, participants = [], rankingSource = 'global' }) {
  if (!tournament) {
    return null;
  }

  // Support both formatConfig and format property names
  const format = tournament.formatConfig || tournament.format || {};
  const seedingMethod = format.seeding || 'random';
  const manualSeedOrder = format.manualSeedOrder || [];

  // Bracket is configured if it has been generated (regardless of seeding method)
  const bracketGenerated = tournament.bracketStatus && ['generated', 'locked', 'scheduled'].includes(tournament.bracketStatus);

  // Status is "Configured" if:
  // 1. Bracket has been generated, OR
  // 2. Seeding method is not random AND has seeded participants
  const isSeeded = bracketGenerated || seedingMethod !== 'random' || participants.some(p => p.seed > 0);

  // Get full seeded list to display
  const seededParticipants = (participants || [])
    .filter(p => p.seed && p.seed > 0)
    .sort((a, b) => a.seed - b.seed);

  const getSeedingIcon = () => {
    switch (seedingMethod) {
      case 'ranked':
        return <FaTrophy className="text-yellow-500" />;
      case 'manual':
        return <FaListOl className="text-blue-600" />;
      case 'random':
      default:
        return <FaRandom className="text-gray-500" />;
    }
  };

  const getSeedingLabel = () => {
    switch (seedingMethod) {
      case 'ranked':
        return `Ranked Seeding (by ${rankingSource === 'league_table' ? 'current points' : 'global ranking'})`;
      case 'manual':
        return 'Manual Seeding';
      case 'random':
      default:
        return 'Random Seeding';
    }
  };

  const getSeedingDescription = () => {
    switch (seedingMethod) {
      case 'ranked':
        return rankingSource === 'league_table'
          ? 'Players are seeded based on their current league points. Higher-ranked players get favorable bracket positions.'
          : 'Players are seeded based on their global ranking profile. Top-ranked players receive favorable bracket positions.';
      case 'manual':
        return `${manualSeedOrder.length} players have been manually assigned seed positions by the tournament organizer.`;
      case 'random':
      default:
        return 'Players are randomly seeded into the bracket.';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-grow">
          {/* Icon */}
          <div className="text-2xl mt-1">
            {getSeedingIcon()}
          </div>

          {/* Info */}
          <div className="flex-grow">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
              {getSeedingLabel()}
              {bracketGenerated && (
                <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  <FaCheck size={12} /> Locked
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              {getSeedingDescription()}
            </p>

            {/* Full seed list */}
            {seededParticipants.length > 0 && (
              <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs font-semibold text-gray-700 mb-2">Seeded Participants:</p>
                <div className="space-y-1">
                  {seededParticipants.map((p) => (
                    <div key={p.id} className="text-sm">
                      <span className="font-semibold text-blue-600">#{p.seed}</span>
                      {' '}
                      <span className="text-gray-900">
                        {p.player?.firstName || p.player?.name || 'Unknown'} {p.player?.lastName || ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seeding-specific information - COMMENTED OUT */}
            {/* {seedingMethod === 'manual' && manualSeedOrder.length > 0 && (
              <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-xs font-semibold text-blue-900 mb-2">Manual Seed Assignment:</p>
                <p className="text-sm text-blue-800">
                  {manualSeedOrder.length} player(s) have been assigned specific seed positions.
                </p>
              </div>
            )} */}

            {/* Additional Stats */}
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-600">
              <div>
                <span className="font-semibold">{participants.length}</span> Participants
              </div>
              {seedingMethod === 'ranked' && (
                <div>
                  <span className="font-semibold">Ranking Source:</span> {rankingSource === 'league_table' ? 'Live Points' : 'Global Rank'}
                </div>
              )}
              {seedingMethod === 'manual' && manualSeedOrder.length > 0 && (
                <div>
                  <span className="font-semibold">Assigned Seeds:</span> {manualSeedOrder.length}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="text-right">
          {isSeeded ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
              <FaCheck className="text-green-600" size={14} />
              <span className="text-sm font-semibold text-green-800">Configured</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-50 border border-yellow-200 rounded-full">
              <span className="text-sm font-semibold text-yellow-800">Pending</span>
            </div>
          )}
        </div>
      </div>

      {/* Notes - COMMENTED OUT */}
      {/* {bracketGenerated && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <p className="font-semibold mb-1">🔒 Seeding Locked</p>
          <p>The seeding method and player positions are now locked. Bracket has been generated and cannot be modified.</p>
        </div>
      )} */}
    </div>
  );
}
