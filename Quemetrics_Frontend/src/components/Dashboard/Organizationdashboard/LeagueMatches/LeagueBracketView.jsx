import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getImageUrl } from "../../../../utils/imageUtils";
import { FaTrophy, FaMedal, FaCrown, FaStar } from "react-icons/fa";

// Reusing Match status colors
const statusStyles = {
  upcoming: "bg-blue-50 text-blue-700 border-blue-100",
  scheduled: "bg-indigo-50 text-indigo-700 border-indigo-100",
  ongoing: "bg-[#FDF2D1] text-[#BA995D] border-[#BA995D]/20",
  completed: "bg-green-50 text-green-700 border-green-100",
  pending: "bg-orange-50 text-orange-700 border-orange-100",
  bye: "bg-[#FAFAFA] text-[#132F45]/50 border-gray-100"
};

export const ChampionBanner = ({ winner }) => {
  if (!winner) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-12 w-full max-w-4xl mx-auto"
    >
      <div className="relative overflow-hidden bg-gradient-to-r from-[#132F45] via-[#1a3f5c] to-[#132F45] rounded-[2rem] p-8 shadow-2xl border-2 border-yellow-500/30">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <FaTrophy className="text-9xl text-yellow-500 -rotate-12" />
        </div>
        <div className="absolute bottom-0 left-0 p-4 opacity-10">
          <FaCrown className="text-8xl text-yellow-500 rotate-12" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 md:gap-8 text-center md:text-left">
          <div className="relative">
            <motion.div 
               animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
               transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
               className="h-20 w-20 md:h-28 md:w-28 rounded-full border-4 border-yellow-500 bg-white p-1 shadow-lg shadow-yellow-500/20 overflow-hidden"
            >
              {winner.avatarUrl && winner.status !== 'withdrawn' ? (
                <img src={getImageUrl(winner.avatarUrl)} alt={winner.name} className="h-full w-full object-cover rounded-full" />
              ) : (
                <div className="h-full w-full bg-blue-50 flex items-center justify-center text-2xl md:text-3xl font-black text-[#132F45]">
                  {winner.status === 'withdrawn' ? '?' : (winner.name?.charAt(0) || '?')}
                </div>
              )}
            </motion.div>
            <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-white p-2 rounded-full shadow-lg">
              <FaTrophy className="text-sm" />
            </div>
          </div>
 
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
              <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-yellow-500/30">
                Official Champion
              </span>
              <div className="flex gap-1 text-yellow-500">
                <FaStar className="text-[10px]" />
                <FaStar className="text-xs" />
                <FaStar className="text-[10px]" />
              </div>
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-white mb-1 tracking-tight">
              {winner.status === 'withdrawn' ? 'Unknown Player' : winner.name}
            </h2>
            <p className="text-blue-200 font-bold text-lg flex items-center justify-center md:justify-start gap-2">
              <FaMedal className="text-yellow-500" />
              League Victory Awarded
            </p>
          </div>

          {(!winner.format || !['knockout', 'groupsKnockout', 'swiss'].includes(winner.format)) && (
            <div className="ml-auto hidden lg:block">
               <div className="text-center px-8 py-4 bg-white/5 rounded-2xl border border-white/10">
                  <div className="text-yellow-500 font-black text-2xl leading-none">#1</div>
                  <div className="text-white/60 text-[10px] font-black uppercase tracking-tighter mt-1">Position</div>
               </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const BracketMatchCard = ({ match, onViewDetails, isFinal, isOverallWinnerP1, isOverallWinnerP2, promoRegInfo, effectiveFormat, leagueStatus, rankMap = {} }) => {
  const isBye = match.status === 'bye';
  
  const scores = (match.score && match.score.includes('-')) ? match.score.split('-') : 
                 (match.score && match.score.includes(':')) ? match.score.split(':') : ['-', '-'];
  
  const score1 = scores[0];
  const score2 = scores[1];

  const isWinnerP1 = match.additionalData?.winnerId === (match.additionalData?.player1Id || match.player1?.id);
  const isWinnerP2 = match.additionalData?.winnerId === (match.additionalData?.player2Id || match.player2?.id);
  const isChampionCard = isFinal && (isOverallWinnerP1 || isOverallWinnerP2);
  
  // New: Identify if this match is part of the Champion's Journey
  const isChampionJourney = isOverallWinnerP1 || isOverallWinnerP2;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, scale: 1.02 }}
      className={`relative group bg-white/80 backdrop-blur-md rounded-3xl p-4 shadow-lg border-2 transition-all cursor-pointer w-64 md:w-72 ${
        isChampionCard ? "border-yellow-400 shadow-yellow-200/50" : 
        isChampionJourney ? "border-yellow-400/30 shadow-yellow-500/5" : "border-white/50 hover:border-blue-400/50 shadow-blue-900/5"
      }`} 
      onClick={() => onViewDetails(match)}
    >
      {/* Journey Highlight Glow */}
      {isChampionJourney && (
        <div className="absolute inset-0 rounded-3xl bg-yellow-400/5 pointer-events-none" />
      )}
      
      {/* Glow Effect */}
      <div className={`absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity blur-xl -z-10 ${
        isChampionCard ? 'bg-yellow-400/20' : 'bg-blue-400/10'
      }`} />

      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100/50">
        <div className="flex items-center gap-2">
           <div className={`h-2 w-2 rounded-full ${match.status === 'completed' ? 'bg-green-500' : 'bg-blue-400'}`} />
           <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
             {isFinal ? 'The Grand Final' : `Match #${match.matchNumber || match.matchIndex + 1}`}
           </span>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusStyles[match.status] || statusStyles.upcoming}`}>
          {match.status}
        </div>
      </div>
      
      <div className="space-y-3">
        {/* Player 1 */}
        <div className="flex items-center justify-between group/p1">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center overflow-hidden border-2 transition-all relative ${
              isWinnerP1 ? 'border-blue-500 shadow-lg shadow-blue-200' : 'border-gray-100 shadow-sm'
            }`}>
               {match.player1?.avatarUrl ? (
                  <img src={getImageUrl(match.player1.avatarUrl)} alt="" className="h-full w-full object-cover"/>
               ) : (
                  <div className="h-full w-full bg-slate-50 flex items-center justify-center text-xs font-black text-slate-400">
                    {match.homeTeam?.charAt(0)}
                  </div>
               )}
               {/* Rank Indicator */}
               {(rankMap[match.player1?.id] || rankMap[match.additionalData?.player1Id]) && (
                 <div className="absolute top-0 left-0 bg-[#132F45] text-white text-[6px] font-black px-1 py-0.5 rounded-br-lg shadow-sm">
                   #{rankMap[match.player1?.id] || rankMap[match.additionalData?.player1Id]}
                 </div>
               )}
            </div>
            <div className="flex flex-col">
              <span className={`text-[10px] uppercase font-black tracking-wide truncate w-32 ${isWinnerP1 ? 'text-[#132F45]' : 'text-slate-400'}`}>
                 {match.homeTeam}
              </span>
              {isOverallWinnerP1 && isFinal && match.status === 'completed' && !(['round_robin', 'roundrobin', 'homeaway', 'swiss'].includes(effectiveFormat.toLowerCase())) && (
                <span className="text-[7px] font-black text-yellow-600 uppercase flex items-center gap-1">
                  <FaCrown className="text-[6px]" /> Champion
                </span>
              )}
              {leagueStatus === 'completed' && ['round_robin', 'roundrobin', 'homeaway', 'swiss'].includes(effectiveFormat.toLowerCase()) && promoRegInfo?.promoted?.some(p => p.player?.id === match.player1?.id) && (
                <span className="text-[7px] font-black text-green-500 uppercase flex items-center gap-1">
                  <FaStar className="text-[6px]" /> Promoted
                </span>
              )}
            </div>
          </div>
          <div className={`text-sm font-black w-8 text-center rounded-lg py-1 ${isWinnerP1 ? 'bg-blue-500 text-white' : 'bg-slate-50 text-slate-400'}`}>
             {isBye ? 'W' : score1}
          </div>
        </div>

        {/* Player 2 */}
        <div className="flex items-center justify-between group/p2">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center overflow-hidden border-2 transition-all relative ${
              isWinnerP2 ? 'border-blue-500 shadow-lg shadow-blue-200' : 'border-gray-100 shadow-sm'
            }`}>
               {match.player2?.avatarUrl ? (
                  <img src={getImageUrl(match.player2.avatarUrl)} alt="" className="h-full w-full object-cover"/>
               ) : (
                  <div className="h-full w-full bg-slate-50 flex items-center justify-center text-xs font-black text-slate-400">
                    {isBye ? '–' : match.awayTeam?.charAt(0)}
                  </div>
               )}
               {/* Rank Indicator */}
               {(rankMap[match.player2?.id] || rankMap[match.additionalData?.player2Id]) && (
                 <div className="absolute top-0 left-0 bg-[#132F45] text-white text-[6px] font-black px-1 py-0.5 rounded-br-lg shadow-sm">
                   #{rankMap[match.player2?.id] || rankMap[match.additionalData?.player2Id]}
                 </div>
               )}
            </div>
            <div className="flex flex-col">
              <span className={`text-[10px] uppercase font-black tracking-wide truncate w-32 ${isWinnerP2 ? 'text-[#132F45]' : 'text-slate-400'}`}>
                 {match.awayTeam}
              </span>
              {isOverallWinnerP2 && isFinal && match.status === 'completed' && !(['round_robin', 'roundrobin', 'homeaway', 'swiss'].includes(effectiveFormat.toLowerCase())) && (
                <span className="text-[7px] font-black text-yellow-600 uppercase flex items-center gap-1">
                  <FaCrown className="text-[6px]" /> Champion
                </span>
              )}
              {leagueStatus === 'completed' && ['round_robin', 'roundrobin', 'homeaway', 'swiss'].includes(effectiveFormat.toLowerCase()) && promoRegInfo?.promoted?.some(p => p.player?.id === match.player2?.id) && (
                <span className="text-[7px] font-black text-green-500 uppercase flex items-center gap-1">
                  <FaStar className="text-[6px]" /> Promoted
                </span>
              )}
            </div>
          </div>
          <div className={`text-sm font-black w-8 text-center rounded-lg py-1 ${isWinnerP2 ? 'bg-blue-500 text-white' : 'bg-slate-50 text-slate-400'}`}>
             {isBye ? '–' : score2}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function LeagueBracketView({ matches, onViewDetails, winner = null, promoRegInfo = null, effectiveFormat = '', leagueStatus = '', standings = [] }) {
  const rankMap = {};
  if (standings && standings.length > 0) {
    standings.forEach((player, idx) => {
      const pId = player.player?.id || player.playerId;
      if (pId) rankMap[pId] = idx + 1;
    });
  }

  const canHaveKnockout = ['groupsknockout', 'knockout'].includes(effectiveFormat.toLowerCase());
  const knockoutMatches = matches.filter(m => {
    const stage = String(m.stage || '').toLowerCase();
    const addStage = String(m.additionalData?.stage || '').toLowerCase();
    const validStages = ['knockout', 'playoff', 'final', 'groupsknockout', 'championship'];
    const isExplicitKnockout = validStages.includes(stage) || validStages.includes(addStage);
    return isExplicitKnockout || (canHaveKnockout && !m.stage && !m.divisionId);
  });

  const groupMatches = matches.filter(m => !knockoutMatches.some(km => km.id === m.id));
  const maxGroupRound = groupMatches.length > 0 ? Math.max(...groupMatches.map(m => m.round || 1)) : 0;

  // Correctly calculate total knockout rounds based on the first round's size
  const stageRounds = [...new Set(knockoutMatches.map(m => m.round || 1))].sort((a, b) => a - b);
  const firstKORound = stageRounds[0] || 1;
  const lastKORound = stageRounds[stageRounds.length - 1] || 1;
  const r1KOMatches = knockoutMatches.filter(m => (m.round || 1) === firstKORound);
  const expectedKORounds = r1KOMatches.length > 0 ? Math.ceil(Math.log2(r1KOMatches.length * 2)) : 0;
  const effectiveKOTotalRounds = Math.max(lastKORound, firstKORound + expectedKORounds - 1);

  const roundsMap = {};
  
  groupMatches.forEach(m => {
    const r = m.round || 1;
    if (!roundsMap[r]) roundsMap[r] = { matches: [], isKnockout: false };
    roundsMap[r].matches.push(m);
  });
  
  knockoutMatches.forEach(m => {
    const r = (m.round || 1) + maxGroupRound;
    if (!roundsMap[r]) roundsMap[r] = { matches: [], isKnockout: true };
    roundsMap[r].matches.push(m);
  });

  const rounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);
  const totalKnockoutRounds = knockoutMatches.length > 0 ? Math.max(...knockoutMatches.map(m => m.round || 1)) : 0;

  if (rounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-white/50 backdrop-blur-sm rounded-[3rem] border border-dashed border-slate-200">
        <FaTrophy className="text-6xl text-slate-200 mb-6" />
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">No fixtures available</h3>
      </div>
    );
  }

  const dynamicMinHeight = Math.max(280, r1KOMatches.length * 240);

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full relative bg-slate-50/50 backdrop-blur-xl rounded-[3rem] border border-white p-6 md:p-12 overflow-hidden">
        {/* Background Patterns */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#132F45 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-400/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-400/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex gap-8 md:gap-16 items-start justify-start overflow-x-auto no-scrollbar py-12 px-4 relative z-10">
          {rounds.map((round, rIndex) => {
            const roundData = roundsMap[round];
            const roundMatches = roundData.matches;
            const isKnockoutRound = roundData.isKnockout;
            
            let roundLabel = `Round ${round}`;
            let phaseLabel = isKnockoutRound ? "Championship Phase" : "Qualification Stage";
            
            let roundsRemaining = 0;
            if (isKnockoutRound) {
              const knockoutRound = round - maxGroupRound;
              roundsRemaining = effectiveKOTotalRounds - knockoutRound;
              
              if (roundsRemaining === 0) roundLabel = "Grand Final";
              else if (roundsRemaining === 1) roundLabel = "Semi-Finals";
              else if (roundsRemaining === 2) roundLabel = "Quarter-Finals";
              else if (roundsRemaining === 3) roundLabel = "Round of 16";
              else if (roundsRemaining === 4) roundLabel = "Round of 32";
              else if (roundsRemaining === 5) roundLabel = "Round of 64";
              else roundLabel = `Knockout R${knockoutRound}`;
            }

            return (
              <div key={`round-${round}`} className="flex flex-col gap-10 min-w-max">
                {/* Stage Indicator */}
                <div className="flex flex-col items-center">
                   <div className="text-[7px] font-black text-slate-400 uppercase tracking-[0.4em] mb-3">{phaseLabel}</div>
                   <div className={`px-6 py-2 shadow-xl rounded-2xl border transition-all ${isKnockoutRound ? 'bg-gradient-to-br from-[#132F45] to-[#1A3F5C] border-blue-400/30' : 'bg-white border-slate-200'}`}>
                      <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${isKnockoutRound ? 'text-white' : 'text-[#132F45]'}`}>{roundLabel}</span>
                   </div>
                   <div className="w-px h-8 bg-gradient-to-b from-[#D1D5DB] to-transparent" />
                </div>

                <div 
                  className={`flex flex-col ${isKnockoutRound ? 'h-full' : 'gap-6'}`}
                  style={isKnockoutRound ? { minHeight: `${dynamicMinHeight}px` } : {}}
                >
                  {roundMatches.map((match, mIndex) => {
                    const isWinner = match.status === 'completed' || match.status === 'bye';
                    
                    return (
                      <div key={match.id} className={`relative flex items-center justify-center py-8 ${isKnockoutRound ? 'flex-1' : ''}`}>
                        <BracketMatchCard 
                          match={match} 
                          onViewDetails={onViewDetails}
                          isFinal={isKnockoutRound && roundsRemaining === 0}
                          isOverallWinnerP1={winner && (match.player1?.id === winner.playerId || match.additionalData?.player1Id === winner.playerId)}
                          isOverallWinnerP2={winner && (match.player2?.id === winner.playerId || match.additionalData?.player2Id === winner.playerId)}
                          promoRegInfo={promoRegInfo}
                          effectiveFormat={effectiveFormat}
                          leagueStatus={leagueStatus}
                          rankMap={rankMap}
                        />
                        
                        {/* Connectors for Knockout */}
                        {isKnockoutRound && roundsRemaining > 0 && (
                          <>
                            {/* Horizontal line from match to the vertical bar area */}
                            <div className={`absolute left-full w-4 md:w-8 h-0.5 transition-colors duration-500 ${isWinner ? 'bg-blue-500' : 'bg-slate-200'}`} />
                            
                            {/* Vertical Connector - meets at the boundary of the flex-1 box */}
                            <div className={`absolute left-[calc(100%+1rem)] md:left-[calc(100%+2rem)] w-0.5 transition-colors duration-500 ${
                              mIndex % 2 === 0 ? "top-1/2 h-1/2" : "bottom-1/2 h-1/2"
                            } ${isWinner ? 'bg-blue-500' : 'bg-slate-200'}`} />

                            {/* Horizontal Fork to next round - drawn only at the boundary between pair matches */}
                            {mIndex % 2 === 0 && (
                              <div className={`absolute left-[calc(100%+1rem)] md:left-[calc(100%+2rem)] top-full w-4 md:w-8 h-0.5 transition-colors duration-500 ${
                                (isWinner || (roundMatches[mIndex+1] && (roundMatches[mIndex+1].status === 'completed' || roundMatches[mIndex+1].status === 'bye'))) ? 'bg-blue-500' : 'bg-slate-200'
                              }`} />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
