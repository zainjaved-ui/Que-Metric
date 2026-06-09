import { memo } from 'react';

function MatchRow({
  match,
  onSelectBook,
  showBookedState = true,
}) {
  const isRest = Boolean(match.isRest);
  const bookable = match.isBookable === true && !isRest;
  const booked = Boolean(match.hasBooking);

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isRest
          ? 'bg-slate-50 border-slate-200'
          : booked
            ? 'bg-gray-50 border-[#D1D5DB] opacity-90'
            : 'bg-white border-[#D1D5DB] hover:border-[#132F45] hover:bg-[#FFFBF4]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[#132F45] truncate">
            {isRest ? 'Bye / Rest Match' : match.opponentName || 'Match'}
          </p>
          <p className="text-sm text-[#132F45] opacity-70">
            Round {match.roundNumber ?? '?'}
            {match.matchNumber != null ? ` • Match ${match.matchNumber}` : ''}
            {match.roundType ? ` • ${String(match.roundType).replace(/_/g, ' ')}` : ''}
          </p>
        </div>
        <div className="shrink-0">
          {isRest ? (
            <span className="px-3 py-1.5 rounded text-xs font-bold uppercase bg-slate-100 text-slate-600">
              Rest
            </span>
          ) : !bookable ? (
            <span className="px-3 py-1.5 rounded text-xs font-bold uppercase bg-gray-100 text-gray-600">
              N/A
            </span>
          ) : booked && showBookedState ? (
            <span
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase ${
                match.bookingStatus === 'confirmed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              Booked
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSelectBook?.(match)}
              className="bg-[#1A3F5C] hover:bg-[#234764] text-[#FFFBF4] px-4 py-2 rounded-lg text-sm font-medium"
            >
              Book Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   matches: any[],
 *   onSelectBook?: (match: any) => void,
 *   showBookedState?: boolean,
 *   bookableOnly?: boolean,
 * }} props
 */
function MatchList({ matches = [], onSelectBook, showBookedState = true, bookableOnly = false }) {
  const list = bookableOnly ? matches.filter((m) => m.isBookable === true && !m.isRest) : matches;

  const byeRows = bookableOnly ? matches.filter((m) => m.isRest === true) : [];

  if (!matches.length) {
    return (
      <div className="text-center py-8 text-[#132F45] opacity-70 border border-dashed border-[#D1D5DB] rounded-xl">
        No matches found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((match) => (
        <MatchRow
          key={match.matchId || `rest-${match.tournamentId}-${match.roundNumber}`}
          match={match}
          onSelectBook={onSelectBook}
          showBookedState={showBookedState}
        />
      ))}
      {byeRows.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#132F45] opacity-60 mb-2">
            Scheduled rest
          </p>
          <div className="space-y-2">
            {byeRows.map((match) => (
              <MatchRow
                key={`bye-${match.tournamentId}-${match.roundNumber}`}
                match={match}
                showBookedState={showBookedState}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(MatchList);
