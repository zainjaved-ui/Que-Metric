import { memo } from 'react';
import { FaClipboard } from 'react-icons/fa';
import TournamentFrameRow from './TournamentFrameRow';

/**
 * Tournament Score Table for Frame-by-Frame Scoring
 * @param {{
 *   sport: 'snooker' | 'pool' | 'pooker',
 *   player1Name: string,
 *   player2Name: string,
 *   frames: any[],
 *   onFrameChange: (frameIndex: number, field: string, value: string | boolean) => void,
 * }} props
 */
function TournamentScoreTable({ sport, player1Name, player2Name, frames, onFrameChange }) {
  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 flex gap-2 items-start">
        <FaClipboard className="mt-0.5 shrink-0 text-blue-600" />
        <span>
          <strong>Frame Breakdown:</strong> Enter each frame result below. The system will calculate totals automatically.
        </span>
      </div>
      <div className="border-2 border-gray-300 rounded-2xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white border-b-2 border-gray-300">
              <th className="p-4 text-left font-semibold text-gray-900 border-r border-gray-300 w-20">FRAME</th>
              <th className="p-4 text-center font-semibold text-gray-900 border-r border-gray-300 flex-1">{player1Name.toUpperCase()}</th>
              <th className="p-4 text-center font-semibold text-gray-900 border-r border-gray-300 flex-1">{player2Name.toUpperCase()}</th>
              <th className="p-4 text-center font-semibold text-gray-900 border-r border-gray-300 w-24">P1 POTTED</th>
              <th className="p-4 text-center font-semibold text-gray-900 w-24">P2 POTTED</th>
            </tr>
          </thead>
          <tbody>
            {frames.map((frame, index) => (
              <TournamentFrameRow
                key={frame.frameNumber ?? index}
                sport={sport}
                frame={frame}
                index={index}
                onChange={onFrameChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(TournamentScoreTable);
