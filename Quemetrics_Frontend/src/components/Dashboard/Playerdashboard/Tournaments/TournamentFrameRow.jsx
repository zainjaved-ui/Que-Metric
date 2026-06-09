import { memo } from 'react';

/**
 * Tournament Frame Row for Pool/Snooker/Pooker scoring
 * @param {{
 *   sport: 'snooker' | 'pool' | 'pooker',
 *   frame: Record<string, unknown>,
 *   index: number,
 *   onChange: (frameIndex: number, field: string, value: string | boolean) => void,
 * }} props
 */
function TournamentFrameRow({ sport, frame, index, onChange }) {
  const isPool = sport === 'pool';
  const checkboxLabel = isPool ? '7-Ball' : 'Black';

  return (
    <tr className="border-b border-gray-300">
      {/* Frame Number */}
      <td className="p-4 font-semibold text-gray-700 text-center border-r border-gray-300 w-20">#{frame.frameNumber}</td>

      {/* Player 1 Score */}
      <td className="p-4 text-center border-r border-gray-300">
        <input
          type="number"
          min={0}
          className="w-20 px-3 py-2 border border-gray-300 rounded bg-white text-center font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={frame.player1Score ?? ''}
          onChange={(e) => onChange(index, 'player1Score', e.target.value)}
        />
      </td>

      {/* Player 2 Score */}
      <td className="p-4 text-center border-r border-gray-300">
        <input
          type="number"
          min={0}
          className="w-20 px-3 py-2 border border-gray-300 rounded bg-white text-center font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={frame.player2Score ?? ''}
          onChange={(e) => onChange(index, 'player2Score', e.target.value)}
        />
      </td>

      {/* Player 1 Balls Potted */}
      <td className="p-4 text-center border-r border-gray-300">
        <div className="flex flex-col items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Balls"
            className="w-20 px-2 py-1 border border-gray-300 rounded bg-white text-center text-sm text-gray-600 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={frame.pottedBallsPlayer1 ?? ''}
            onChange={(e) => onChange(index, 'pottedBallsPlayer1', e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={Boolean(frame[isPool ? 'sevenBallPlayer1' : 'blackPlayer1'])}
              onChange={(e) => onChange(index, isPool ? 'sevenBallPlayer1' : 'blackPlayer1', e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <span>{checkboxLabel}</span>
          </label>
        </div>
      </td>

      {/* Player 2 Balls Potted */}
      <td className="p-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Balls"
            className="w-20 px-2 py-1 border border-gray-300 rounded bg-white text-center text-sm text-gray-600 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={frame.pottedBallsPlayer2 ?? ''}
            onChange={(e) => onChange(index, 'pottedBallsPlayer2', e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={Boolean(frame[isPool ? 'sevenBallPlayer2' : 'blackPlayer2'])}
              onChange={(e) => onChange(index, isPool ? 'sevenBallPlayer2' : 'blackPlayer2', e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <span>{checkboxLabel}</span>
          </label>
        </div>
      </td>
    </tr>
  );
}

export default memo(TournamentFrameRow);
