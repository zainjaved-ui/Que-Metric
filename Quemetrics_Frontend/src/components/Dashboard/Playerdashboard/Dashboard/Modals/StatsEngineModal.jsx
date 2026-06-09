import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaTimes, FaTrophy, FaChartLine, FaSkullCrossbones, 
  FaFire, FaArrowRight, FaMapMarkerAlt, FaCalendarAlt,
  FaChartBar
} from 'react-icons/fa';
import { usePlayer } from '../../../../../contexts/PlayerContext';
import Loader from '../../../../ui/Loader';

const StatCard = ({ label, value, colorClass, subValue, subLabel }) => (
  <div className={`flex-1 min-w-[120px] p-4 rounded-2xl border border-gray-100 shadow-sm ${colorClass} flex flex-col items-center justify-center transition-all hover:scale-105`}>
    <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">{label}</p>
    <p className="text-3xl font-black truncate max-w-full">{(value || 0).toLocaleString()}</p>
    {subValue !== undefined && (
      <div className="mt-1 text-center">
        <p className="text-[8px] font-bold opacity-60 uppercase">{subLabel}</p>
        <p className="text-[10px] font-black">{(subValue || 0).toLocaleString()}</p>
      </div>
    )}
  </div>
);

const BestWorstCard = ({ title, match, isBest }) => {
  if (!match) return null;
  const color = isBest ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  const borderColor = isBest ? 'border-green-100' : 'border-red-100';
  const Icon = isBest ? FaTrophy : FaSkullCrossbones;

  return (
    <div className={`flex-1 p-5 rounded-2xl border ${borderColor} bg-white shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow`}>
      <div className={`absolute top-0 right-0 w-24 h-24 ${isBest ? 'bg-green-500/5' : 'bg-red-500/5'} rounded-bl-full -mr-8 -mt-8 pointer-events-none`} />
      
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
          <Icon className="text-sm" />
        </div>
        <p className={`text-[11px] font-black uppercase tracking-widest ${isBest ? 'text-green-600' : 'text-red-600'}`}>
          {title}
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-[14px] font-black text-[#132F45] truncate">vs {match.opponent}</p>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
          <p className="text-[12px] font-bold text-gray-500 whitespace-nowrap">{match.score}</p>
          <span className={`text-[12px] font-black whitespace-nowrap ${isBest ? 'text-green-600' : 'text-red-600'}`}>
            {(match.points || 0).toLocaleString()} pts
          </span>
          <span className={`text-[11px] font-black whitespace-nowrap ${match.pointDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            ({match.pointDiff >= 0 ? '+' : ''}{(match.pointDiff || 0).toLocaleString()})
          </span>
        </div>
        <p className="text-[10px] font-bold text-[#BA995D] uppercase tracking-wide">
          Avg: {Number(match.avgPointsPerFrame || 0).toFixed(1)} pts / frame
        </p>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <div className="flex items-center gap-1.5 text-[#BA995D] min-w-0">
            <FaTrophy className="text-[9px] shrink-0" />
            <p className="text-[9px] font-black uppercase tracking-wider truncate">
              {match.contextName || 'Competition'}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shrink-0 ${
            match.matchType === 'league' ? 'bg-blue-50 text-blue-500' : 
            match.matchType === 'tournament' ? 'bg-purple-50 text-purple-500' : 
            'bg-gray-100 text-gray-400'
          }`}>
            {match.matchType || 'Match'}
          </span>
        </div>
      </div>
    </div>
  );
};

const HistoryBox = ({ result, isRecent, isOlder }) => (
  <div className="flex flex-col items-center gap-1.5">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-[14px] font-black shadow-sm transform transition-transform hover:scale-110 cursor-default ${
      result === 'W' ? 'bg-green-500 shadow-green-200' : 'bg-red-500 shadow-red-200'
    }`}>
      {result}
    </div>
    <span className="text-[7px] font-black text-gray-300 uppercase tracking-widest">
      {isRecent ? 'Recent' : isOlder ? 'Older' : ''}
    </span>
  </div>
);

export default function StatsEngineModal({ isOpen, onClose }) {
  const { getStatsEngineData } = usePlayer();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const res = await getStatsEngineData();
          if (res?.success) {
            setData(res.data);
          }
        } catch (err) {
          console.error('Failed to fetch stats engine data:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#132F45]/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 pb-4 flex items-center justify-between border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FDF2D1] flex items-center justify-center">
                <FaChartBar className="text-[#BA995D] text-lg" />
              </div>
              <div>
                <h2 className="text-[16px] font-black text-[#132F45] uppercase tracking-tighter leading-none">Stats Engine</h2>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Your last 10 matches performance</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] font-black text-[#132F45] uppercase tracking-widest">Stable</span>
              </div>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <FaTimes />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {loading ? (
              <div className="py-20">
                <Loader text="Analyzing performance..." />
              </div>
            ) : !data ? (
              <div className="py-20 text-center">
                <p className="text-gray-400 font-bold uppercase tracking-widest">No match data available yet</p>
              </div>
            ) : (
              <>
                {/* Summary Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard 
                    label="Won" 
                    value={data.summary.won} 
                    colorClass="bg-green-50 text-green-600 border-green-100" 
                  />
                  <StatCard 
                    label="Lost" 
                    value={data.summary.lost} 
                    colorClass="bg-red-50 text-red-600 border-red-100" 
                  />
                  <StatCard 
                    label="Frames Won" 
                    value={data.summary.framesWon} 
                    colorClass="bg-blue-50 text-blue-600 border-blue-100" 
                  />
                  <StatCard 
                    label="Frames Lost" 
                    value={data.summary.framesLost} 
                    colorClass="bg-orange-50 text-orange-600 border-orange-100" 
                  />
                </div>

                {/* Win Percentage Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Win Percentage</p>
                    <p className="text-[18px] font-black text-green-600 leading-none">{data.summary.winPercentage}%</p>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${data.summary.winPercentage}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="h-full bg-linear-to-r from-[#BA995D] to-[#8c7144] rounded-full"
                    />
                  </div>
                </div>

                {/* Deep Stats Grid */}
                <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 overflow-hidden">
                  <div className="text-center sm:text-left min-w-0">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 truncate">Points Scored</p>
                    <p className="text-lg font-black text-[#132F45] truncate">{(data.summary.pointsScored || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-center sm:text-left min-w-0">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 truncate">Points Conceded</p>
                    <p className="text-lg font-black text-[#132F45] truncate">{(data.summary.pointsConceded || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-center sm:text-left min-w-0">
                    <p className="text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1 truncate">Avg Scored/Frame</p>
                    <p className="text-lg font-black text-[#BA995D] truncate">{data.summary.avgScoredPerFrame}</p>
                  </div>
                  <div className="text-center sm:text-left min-w-0">
                    <p className="text-[8px] font-black text-[#BA995D] uppercase tracking-widest mb-1 truncate">Avg Conceded/Frame</p>
                    <p className="text-lg font-black text-[#BA995D] truncate">{data.summary.avgConcededPerFrame}</p>
                  </div>
                </div>

                {/* Best / Worst Matches */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <BestWorstCard title="Best Match" match={data.bestMatch} isBest={true} />
                  <BestWorstCard title="Worst Match" match={data.worstMatch} isBest={false} />
                </div>

                {/* Streak Banner */}
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`p-4 rounded-2xl border flex items-center gap-4 group ${
                    data.streak.count > 0 
                      ? 'border-green-100 bg-linear-to-r from-green-50/50 to-white' 
                      : 'border-gray-100 bg-linear-to-r from-gray-50/50 to-white'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110 ${
                    data.streak.count > 0 
                      ? 'bg-green-500 shadow-green-200' 
                      : 'bg-gray-400 shadow-gray-200'
                  }`}>
                    {data.streak.count > 0 ? <FaFire className="text-lg" /> : <FaChartLine className="text-lg" />}
                  </div>
                  <div>
                    <p className={`text-[14px] font-black uppercase tracking-tight ${
                      data.streak.count > 0 ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {data.streak.count > 0 ? `${data.streak.count} Win Streak` : 'Form Reset'}
                    </p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                      {data.streak.count > 0 
                        ? "You're on fire! Keep it going!" 
                        : "Ready to start a new winning streak?"}
                    </p>
                  </div>
                </motion.div>

                {/* History Row */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Last 10 Matches</p>
                  <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 scrollbar-hide">
                    {data.history.map((res, i) => (
                      <HistoryBox 
                        key={i} 
                        result={res} 
                        isRecent={i === 9} 
                        isOlder={i === 0} 
                      />
                    ))}
                  </div>
                </div>

                {/* Comparison Footer */}
                <div className="p-5 rounded-2xl border border-gray-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-[8px] font-black text-gray-300 uppercase mb-1">Recent 5</p>
                      <p className="text-[16px] font-black text-[#132F45]">{data.comparison.recent5Wins} wins</p>
                    </div>
                    <span className="text-gray-200 font-bold text-[14px] italic">vs</span>
                    <div className="text-center">
                      <p className="text-[8px] font-black text-gray-300 uppercase mb-1">Previous 5</p>
                      <p className="text-[16px] font-black text-[#132F45]">{data.comparison.previous5Wins} wins</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-[1px] bg-gray-200" />
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{data.comparison.status}</p>
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* Footer */}
          <div className="p-4 bg-gray-50 flex justify-center">
             <button 
                onClick={onClose}
                className="text-[10px] font-black text-gray-400 hover:text-[#132F45] uppercase tracking-widest transition-colors"
              >
                Close Engine
             </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
