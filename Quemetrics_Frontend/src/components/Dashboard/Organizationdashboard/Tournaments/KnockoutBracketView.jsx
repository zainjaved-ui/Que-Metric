import React, { useMemo } from 'react';

function nameOf(player) {
  if (!player) return 'TBD';
  if (typeof player === 'string') return player;
  return player.name || player.nickname || 'Player';
}

/**
 * Column title from API roundType + bracket round number (do not infer "Quarter" from depth only —
 * e.g. round 1 of an 8-bracket with byes is not a quarter-final).
 */
export function formatKnockoutRoundLabel(roundNumber, roundType) {
  const rn = Number(roundNumber);
  const rnLabel = Number.isFinite(rn) ? `Round ${rn}` : '';
  if (!roundType) return rnLabel || 'Round';

  const rt = String(roundType).toLowerCase();
  if (rt === 'final') return rnLabel ? `${rnLabel} · Final` : 'Final';
  if (rt === 'semi_final') return rnLabel ? `${rnLabel} · Semi final` : 'Semi final';
  if (rt === 'quarter_final') return rnLabel ? `${rnLabel} · Quarter final` : 'Quarter final';
  if (rt === 'knockout_64') return rnLabel ? `${rnLabel} · Round of 64` : 'Round of 64';
  if (rt === 'knockout_32') return rnLabel ? `${rnLabel} · Round of 32` : 'Round of 32';
  if (rt === 'knockout_16') return rnLabel ? `${rnLabel} · Round of 16` : 'Round of 16';
  if (rt === 'knockout_8') return rnLabel ? `${rnLabel} · Round of 8` : 'Round of 8';
  if (rt === 'preliminary') return rnLabel ? `${rnLabel} · Preliminary` : 'Preliminary';

  return rnLabel
    ? `${rnLabel} · ${String(roundType).replace(/_/g, ' ')}`
    : String(roundType).replace(/_/g, ' ');
}

/**
 * Horizontal knockout bracket: columns left → right (early rounds → final).
 * Displays both regular matches (with 2 players) and bye matches (auto-advances).
 */
export default function KnockoutBracketView({ matches = [], tournamentName = '' }) {
  const { columns, championName } = useMemo(() => {
    // Include both regular matches (with 2 players) and bye matches
    const all = matches.filter((m) => m.player1Id && (m.player2Id || m.isBye));
    if (all.length === 0) {
      return { columns: [], championName: null };
    }

    const byRound = {};
    for (const m of all) {
      const rn = Number(m.roundNumber) || 1;
      if (!byRound[rn]) byRound[rn] = [];
      byRound[rn].push(m);
    }

    const roundNums = Object.keys(byRound)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    for (const rn of roundNums) {
      byRound[rn].sort(
        (a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0)
      );
    }

    const cols = roundNums.map((rn) => {
      const colMatches = byRound[rn];
      const sampleType = colMatches[0]?.roundType;
      return {
        roundNumber: rn,
        label: formatKnockoutRoundLabel(rn, sampleType),
        matches: colMatches,
      };
    });

    let championName = null;
    const maxRn = roundNums[roundNums.length - 1];
    const finals = byRound[maxRn];
    if (finals?.length === 1 && finals[0].status === 'completed' && finals[0].winner) {
      const fm = finals[0];
      championName =
        fm.winner === 'player1'
          ? nameOf(fm.player1)
          : nameOf(fm.player2);
    }

    return { columns: cols, championName };
  }, [matches]);

  if (columns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-600">
        No knockout matches to display yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50 to-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-3 bg-slate-800 text-white">
        <h3 className="text-lg font-bold">Bracket</h3>
        {tournamentName ? (
          <p className="text-sm text-slate-300 mt-0.5">{tournamentName}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto p-4">
        <div className="flex flex-row items-stretch gap-0 min-w-max">
          {columns.map((col, colIdx) => (
            <React.Fragment key={col.roundNumber}>
              <div className="flex flex-col justify-around px-3 min-w-[220px]">
                <div className="text-center text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 pb-2 border-b border-slate-200">
                  {col.label}
                </div>
                <div className="flex flex-col gap-6 justify-around flex-1 py-2">
                  {col.matches.map((match) => {
                    const isBye = match.isBye || !match.player2Id;
                    const p1 = nameOf(match.player1);
                    const p2 = nameOf(match.player2);
                    const done = match.status === 'completed';
                    const w1 = done && match.winner === 'player1';
                    const w2 = done && match.winner === 'player2';
                    let score = '—';
                    if (
                      done &&
                      match.player1FramesWon != null &&
                      match.player2FramesWon != null
                    ) {
                      score = `${match.player1FramesWon} – ${match.player2FramesWon}`;
                    }

                    // For bye matches, show only the advancing player with special styling
                    if (isBye) {
                      return (
                        <div
                          key={match.id}
                          className="relative rounded-lg border-2 border-emerald-300 bg-emerald-50/60 shadow-sm overflow-hidden"
                        >
                          <div className="px-3 py-2 text-xs font-bold uppercase text-emerald-800 border-b border-emerald-200 bg-emerald-100/80">
                            bye
                          </div>
                          <div className="px-3 py-3 flex flex-col gap-2">
                            <div className="text-sm font-semibold text-slate-900">
                              {p1}
                            </div>
                            <div className="text-xs font-semibold text-emerald-700">
                              → REST (BYE)
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={match.id}
                        className="relative rounded-lg border-2 border-slate-200 bg-white shadow-sm overflow-hidden"
                      >
                        <div
                          className={`px-3 py-2 text-sm font-semibold border-b border-slate-100 ${
                            w1 ? 'bg-emerald-50 text-emerald-900' : 'text-slate-800'
                          }`}
                        >
                          {p1}
                        </div>
                        <div
                          className={`px-3 py-2 text-sm font-semibold ${
                            w2 ? 'bg-emerald-50 text-emerald-900' : 'text-slate-800'
                          }`}
                        >
                          {p2}
                        </div>
                        <div className="px-2 py-1.5 bg-slate-100 text-center text-xs font-mono text-slate-600">
                          {score}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {colIdx < columns.length - 1 && (
                <div className="flex flex-col justify-center w-10 shrink-0 relative">
                  <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-300 -translate-y-1/2" />
                </div>
              )}
            </React.Fragment>
          ))}

          {championName && (
            <div className="flex flex-col justify-center px-4 min-w-[160px]">
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-center shadow-md">
                <div className="text-xs font-bold uppercase text-amber-800 mb-1">
                  Champion
                </div>
                <div className="text-lg font-black text-amber-950">{championName}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
