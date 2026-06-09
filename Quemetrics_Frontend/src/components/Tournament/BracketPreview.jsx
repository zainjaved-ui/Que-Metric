/**
 * BracketPreview Component
 * Displays visual bracket structure preview based on player count and bye handling
 */

import React, { useMemo } from 'react';
import { calculateByeStructure, getByeHandlingOption } from '../../utils/byeHandlingUtils';

export default function BracketPreview({ playerCount, byeHandling, seeding, className = '' }) {
  const structure = useMemo(
    () => calculateByeStructure(playerCount, byeHandling),
    [playerCount, byeHandling]
  );

  const option = useMemo(() => getByeHandlingOption(byeHandling), [byeHandling]);

  if (!playerCount || playerCount < 1) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 ${className}`}>
        <p className="text-xs text-gray-500 text-center">Select player count to see bracket preview</p>
      </div>
    );
  }

  // ── PRELIMINARY ROUND ──────────────────────────────────────────
  if (structure.hasPrelimsRound) {
    const prelimMatchCount = structure.prelimMatches;
    const prelimWinners = prelimMatchCount;
    const directPlayers = structure.bracketSize - prelimWinners;
    const totalRound1Matches = structure.bracketSize / 2;

    return (
      <div
        className={`p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border border-amber-200 ${className}`}
      >
        <div className="space-y-4">
          {/* Round 0 - Preliminary */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">ROUND 0: PRELIMINARY</span>
              <div className="flex-1 h-px bg-amber-200" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="px-3 py-2 bg-white rounded border border-amber-100">
                <div className="text-[11px] font-semibold text-amber-900">
                  {prelimMatchCount} Match{prelimMatchCount > 1 ? 'es' : ''}
                </div>
                <div className="text-[10px] text-amber-700 mt-0.5">
                  {prelimMatchCount * 2} bottom seeds
                </div>
              </div>
              <div className="px-3 py-2 bg-amber-100 rounded border border-amber-300">
                <div className="text-[11px] font-semibold text-amber-900">
                  {directPlayers} Byes
                </div>
                <div className="text-[10px] text-amber-700 mt-0.5">
                  Top {directPlayers} seeds
                </div>
              </div>
            </div>
            <div className="text-[10px] text-amber-700 italic mt-1">
              ↓ {prelimWinners} winners + {directPlayers} byes
            </div>
          </div>

          {/* Round 1 - Main Bracket */}
          <div className="space-y-2 pt-2 border-t border-amber-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">ROUND 1: MAIN BRACKET</span>
              <div className="flex-1 h-px bg-amber-200" />
            </div>
            <div className="px-3 py-2 bg-white rounded border border-amber-100">
              <div className="text-[11px] font-semibold text-amber-900">
                {structure.bracketSize} Players ({structure.bracketSize / 2} matches)
              </div>
              <div className="text-[10px] text-amber-700 mt-0.5">
                {structure.bracketSize / 2} parallel matches
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="p-2 bg-amber-100 rounded border border-amber-300">
            <div className="text-[10px] font-semibold text-amber-900">
              Total: {playerCount} players, {structure.realMatches} matches
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STANDARD BRACKET (AUTO_EXPAND, RANDOM_BYE, TOP_SEEDED) ────
  const byeCount = structure.byeCount;
  const colorClass =
    byeHandling === 'auto_expand'
      ? 'from-blue-50 to-cyan-50 border-blue-200'
      : byeHandling === 'random_bye'
      ? 'from-purple-50 to-indigo-50 border-purple-200'
      : 'from-green-50 to-emerald-50 border-green-200';

  const colorText =
    byeHandling === 'auto_expand'
      ? 'text-blue-900'
      : byeHandling === 'random_bye'
      ? 'text-purple-900'
      : 'text-green-900';

  const colorBg =
    byeHandling === 'auto_expand'
      ? 'bg-blue-100 border-blue-300 text-blue-800'
      : byeHandling === 'random_bye'
      ? 'bg-purple-100 border-purple-300 text-purple-800'
      : 'bg-green-100 border-green-300 text-green-800';

  return (
    <div className={`p-4 bg-gradient-to-br ${colorClass} rounded-lg border ${className}`}>
      <div className="space-y-3">
        {/* Bracket Structure section commented out
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider ${colorText}`}>
            Bracket Structure
          </span>
          <div className={`flex-1 h-px ${colorText} opacity-20`} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="px-3 py-2 bg-white rounded border border-current border-opacity-10">
            <div className={`text-xs font-bold ${colorText}`}>{playerCount}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Players</div>
          </div>

          <div className="px-3 py-2 bg-white rounded border border-current border-opacity-10">
            <div className={`text-xs font-bold ${colorText}`}>{structure.bracketSize}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Bracket Size</div>
          </div>

          <div className={`px-3 py-2 rounded border ${colorBg}`}>
            <div className={`text-xs font-bold`}>{byeCount}</div>
            <div className="text-[10px] mt-0.5">Bye{byeCount !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div className="space-y-1 p-2 bg-white bg-opacity-50 rounded">
          <div className="text-[10px] font-semibold text-gray-700">Match Distribution</div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="text-[10px] text-gray-600">
              Round 1: <span className="font-semibold">{structure.round1Matches || 0} matches</span>
            </div>
            <div className="text-[10px] text-gray-600">
              Total: <span className="font-semibold">{structure.realMatches} matches</span>
            </div>
          </div>
        </div>
        */}

        {/* Bye Distribution Info */}
        {byeCount > 0 && (
          <div className={`p-2 rounded border ${colorBg}`}>
            <div className="text-[10px] font-semibold mb-1">
              {byeHandling === 'auto_expand'
                ? '🏆 Lower seeds receive byes'
                : byeHandling === 'random_bye'
                ? '🎲 Byes assigned randomly'
                : '👑 Top seeds receive byes'}
            </div>
          </div>
        )}

        {/* No Bye Message */}
        {byeCount === 0 && (
          <div className="p-2 bg-green-100 rounded border border-green-300">
            <div className="text-[10px] font-semibold text-green-800">
              ✓ Perfect power-of-2: {playerCount} players, no byes needed
            </div>
          </div>
        )}

        {/* Seeding Warning for top_seeded */}
        {byeHandling === 'top_seeded' && seeding && seeding !== 'ranked' && seeding !== 'manual' && (
          <div className="p-2 bg-yellow-100 rounded border border-yellow-400">
            <div className="text-[10px] font-semibold text-yellow-800">
              ⚠️ Switch to ranked seeding for proper top-seed bye assignment
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
