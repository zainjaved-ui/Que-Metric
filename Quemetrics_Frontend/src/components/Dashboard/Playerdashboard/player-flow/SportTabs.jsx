import snookerIcon from '../../../../assets/snooker.png';
import poolIcon from '../../../../assets/pool.png';
import pokerIcon from '../../../../assets/pooker.png';
import { normalizeSport } from './sportUtils';

const GAMES = [
  { id: 'snooker', name: 'Snooker', icon: snookerIcon },
  { id: 'pool', name: 'Pool', icon: poolIcon },
  { id: 'poker', name: 'Poker', icon: pokerIcon },
];

/**
 * @param {{ selectedSport: string | null, onChange: (id: string) => void, className?: string, allowEmpty?: boolean }} props
 */
export default function SportTabs({ selectedSport, onChange, className = '', allowEmpty = false }) {
  return (
    <div className={`flex gap-2 mb-6 ${className}`}>
      {GAMES.map((game) => {
        const active = selectedSport != null && normalizeSport(selectedSport) === game.id;
        return (
          <button
            key={game.id}
            type="button"
            onClick={() => {
              if (allowEmpty && active) onChange(null);
              else onChange(game.id);
            }}
            className={`flex-1 px-4 py-2 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
              active
                ? 'border-[#132F45] bg-[#FFFBF4] text-[#132F45]'
                : 'border-[#D1D5DB] bg-white hover:border-[#132F45] text-[#132F45] opacity-70'
            }`}
          >
            <img src={game.icon} alt="" className="w-6 h-6 object-contain" />
            <span className="font-semibold">{game.name}</span>
          </button>
        );
      })}
    </div>
  );
}
