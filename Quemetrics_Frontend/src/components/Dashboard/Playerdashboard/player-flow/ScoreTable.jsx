import { memo } from 'react';
import { FaClipboard } from 'react-icons/fa';
import FrameRow from './FrameRow';

/**
 * @param {{
 *   mode: 'pool' | 'snooker' | 'poker',
 *   player1Name: string,
 *   player2Name: string,
 *   rows: any[],
 *   onRowChange: (index: number, field: string, value: string | boolean) => void,
 * }} props
 */
function ScoreTable({ mode, player1Name, player2Name, rows, onRowChange }) {
  const headerUnit = mode === 'poker' ? 'Round' : 'Frame';

  const colExtraLeft = mode === 'pool' ? 'Potted / 7-Ball' : 'Potted / Black';

  const pokerRoundWinLabel = 'Winner (optional)';

  if (mode === 'poker') {
    return (
      <div className="space-y-3">
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 text-sm text-sky-900 flex gap-2 items-start">
          <FaClipboard className="mt-0.5 shrink-0" />
          <span>
            Enter chip totals or scores per round. Optionally pick the round winner — totals update from
            round wins when a winner is set.
          </span>
        </div>
        <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white shadow-sm">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-3 text-left font-semibold text-[#132F45]">{headerUnit}</th>
                <th className="p-3 text-center font-semibold text-[#132F45]">{player1Name}</th>
                <th className="p-3 text-center font-semibold text-[#132F45]">{player2Name}</th>
                <th className="p-3 text-center font-semibold text-[#132F45]">{pokerRoundWinLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.roundNumber ?? index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                  <td className="p-3 font-medium text-gray-600 border-b border-gray-100">#{row.roundNumber}</td>
                  <td className="p-3 text-center border-b border-gray-100">
                    <input
                      type="number"
                      className="w-full max-w-[6rem] mx-auto border border-gray-200 rounded-lg px-2 py-1.5 text-center"
                      value={row.player1Score ?? ''}
                      onChange={(e) => onRowChange(index, 'player1Score', e.target.value)}
                    />
                  </td>
                  <td className="p-3 text-center border-b border-gray-100">
                    <input
                      type="number"
                      className="w-full max-w-[6rem] mx-auto border border-gray-200 rounded-lg px-2 py-1.5 text-center"
                      value={row.player2Score ?? ''}
                      onChange={(e) => onRowChange(index, 'player2Score', e.target.value)}
                    />
                  </td>
                  <td className="p-3 text-center border-b border-gray-100">
                    <select
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full max-w-[10rem]"
                      value={row.winnerSide ?? ''}
                      onChange={(e) => onRowChange(index, 'winnerSide', e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="p1">{player1Name}</option>
                      <option value="p2">{player2Name}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 text-sm text-sky-900 flex gap-2 items-start">
        <FaClipboard className="mt-0.5 shrink-0" />
        <span>
          Frame-by-Frame Scoring: Enter each frame result below. The system will calculate total frames and
          apply the scoring rules above.
        </span>
      </div>
      <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white shadow-sm">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="p-3 text-left font-semibold text-[#132F45] w-14">{headerUnit}</th>
              <th className="p-3 text-center font-semibold text-[#132F45]">{player1Name}</th>
              <th className="p-3 text-center font-semibold text-[#132F45]">{player2Name}</th>
              <th className="p-3 text-center font-semibold text-[#132F45] text-xs">{colExtraLeft}</th>
              <th className="p-3 text-center font-semibold text-[#132F45] text-xs">{colExtraLeft}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((frame, index) => (
              <FrameRow
                key={frame.frameNumber ?? index}
                variant={mode}
                frame={frame}
                index={index}
                onChange={onRowChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(ScoreTable);
