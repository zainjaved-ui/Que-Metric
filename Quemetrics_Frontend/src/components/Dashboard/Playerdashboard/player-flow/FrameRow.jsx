import { memo } from 'react';

/**
 * One row for pool/snooker frame scoring.
 * @param {{
 *   variant: 'pool' | 'snooker',
 *   frame: Record<string, unknown>,
 *   index: number,
 *   player1Label: string,
 *   player2Label: string,
 *   onChange: (index: number, field: string, value: string | boolean) => void,
 * }} props
 */
function FrameRow({ variant, frame, index, onChange }) {
  const isPool = variant === 'pool';

  return (
    <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
      <td className="p-3 font-medium text-gray-600 border-b border-gray-100">#{frame.frameNumber}</td>
      <td className="p-3 text-center border-b border-gray-100">
        <input
          type="number"
          min={0}
          className="w-full max-w-[5rem] mx-auto border border-gray-200 rounded-lg px-2 py-1.5 text-center font-semibold text-[#132F45]"
          value={frame.player1Score ?? ''}
          onChange={(e) => onChange(index, 'player1Score', e.target.value)}
        />
      </td>
      <td className="p-3 text-center border-b border-gray-100">
        <input
          type="number"
          min={0}
          className="w-full max-w-[5rem] mx-auto border border-gray-200 rounded-lg px-2 py-1.5 text-center font-semibold text-[#132F45]"
          value={frame.player2Score ?? ''}
          onChange={(e) => onChange(index, 'player2Score', e.target.value)}
        />
      </td>
      <td className="p-3 border-b border-gray-100">
        <div className="flex flex-col items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Balls"
            className="w-full max-w-[5rem] border border-gray-200 rounded-lg px-2 py-1 text-center text-sm"
            value={frame.pottedBallsPlayer1 ?? ''}
            onChange={(e) => onChange(index, 'pottedBallsPlayer1', e.target.value)}
          />
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={Boolean(frame[isPool ? 'sevenBallPlayer1' : 'blackPlayer1'])}
              onChange={(e) => onChange(index, isPool ? 'sevenBallPlayer1' : 'blackPlayer1', e.target.checked)}
            />
            {isPool ? '7-Ball' : 'Black'}
          </label>
        </div>
      </td>
      <td className="p-3 border-b border-gray-100">
        <div className="flex flex-col items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Balls"
            className="w-full max-w-[5rem] border border-gray-200 rounded-lg px-2 py-1 text-center text-sm"
            value={frame.pottedBallsPlayer2 ?? ''}
            onChange={(e) => onChange(index, 'pottedBallsPlayer2', e.target.value)}
          />
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={Boolean(frame[isPool ? 'sevenBallPlayer2' : 'blackPlayer2'])}
              onChange={(e) => onChange(index, isPool ? 'sevenBallPlayer2' : 'blackPlayer2', e.target.checked)}
            />
            {isPool ? '7-Ball' : 'Black'}
          </label>
        </div>
      </td>
    </tr>
  );
}

export default memo(FrameRow);
