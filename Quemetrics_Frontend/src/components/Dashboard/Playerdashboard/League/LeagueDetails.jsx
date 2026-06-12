import { AuthContext } from '../../../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaTrophy, FaCalendarAlt, FaInfoCircle, FaChevronLeft,
    FaUserFriends, FaClipboardList, FaClock, FaCheckCircle,
    FaExclamationTriangle, FaImage, FaGamepad, FaMapMarkerAlt,
    FaTable, FaShieldAlt, FaStar, FaChevronRight, FaLock, FaArrowDown
} from 'react-icons/fa';
import { LeagueContext } from '../../../../contexts/LeagueContext';

import {
    getFixturesForLeague,
    getMatchResultDetails,
    transformFixturesToMatches
} from '../../../../Services/leagueMatchesService';
import { BookingContext } from '../../../../contexts/BookingContext';
import apiClient from '../../../../contexts/apiClient';
import matchResultService from '../../../../Services/matchResultService';
import Button from '../../../ui/Button';
import Card from '../../../ui/Card';
import Loader from '../../../ui/Loader';

// --- Sub-component: Standings Table (Adapted from Admin) ---
const PlayerStandingsTable = ({ leagueId, standingsDisplay, league }) => {
    const [standings, setStandings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [officialChampionId, setOfficialChampionId] = useState(null);
    const { getLeagueStandings } = useContext(LeagueContext);
    const { user } = useContext(AuthContext);

    const leagueStructure = useMemo(() => {
        const structure = league?.structure;
        if (!structure) return {};
        try {
            return typeof structure === 'string' ? JSON.parse(structure) : structure;
        } catch (e) {
            return {};
        }
    }, [league?.structure]);

    const topLevelFormat = league?.format;
    let structureFormat = null;
    try {
        const s = league?.structure;
        structureFormat = (typeof s === 'string' ? JSON.parse(s) : s)?.format;
    } catch { }
    const effectiveFormat = structureFormat || topLevelFormat || '';

    const promotionCount = effectiveFormat === 'knockout' ? 0 : (leagueStructure.promotionCount || leagueStructure.divisions?.promotions || leagueStructure.groups?.qualifiers || 0);
    const relegationCount = effectiveFormat === 'knockout' ? 0 : (leagueStructure.relegationCount || leagueStructure.divisions?.relegations || 0);
    const leagueStatus = league?.status || '';

    const fetchStandings = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getLeagueStandings(leagueId);
            
            let standingsData = [];
            if (result?.success && result?.data) {
                const data = result.data;
                standingsData = data.standings || data;
            }

            if (standingsData && standingsData.length > 0) {
                setStandings(standingsData);
            } else {
                try {
                    const apiResponse = await apiClient.get(`/leagues/${leagueId}/standings`);
                    const apiData = apiResponse.data?.data || [];
                    standingsData = apiData.standings || apiData;
                    if (standingsData && standingsData.length > 0) setStandings(standingsData);
                } catch (apiErr) {
                    console.error("Direct API call failed:", apiErr);
                }
            }

            const structure = typeof league?.structure === 'string' ? JSON.parse(league.structure) : (league?.structure || {});
            const format = structure.format || league?.format || '';
            const isKnockoutFormat = ['knockout', 'groupsKnockout', 'swiss'].includes(format);

            if (league?.status === 'completed') {
                if (isKnockoutFormat) {
                    try {
                        const fxResponse = await apiClient.get(`/leagues/${leagueId}/fixtures`);
                        const allFixtures = fxResponse.data?.data || [];
                        const isPureKnockout = format === 'knockout';
                        const knockoutMatches = allFixtures.filter(m => (isPureKnockout && !m.stage) || (m.stage && m.stage !== 'group' && m.stage !== 'round_robin'));
                        
                        if (knockoutMatches.length > 0) {
                            const rounds = knockoutMatches.map(m => m.additionalData?.round || m.round || 1);
                            const finalRound = Math.max(...rounds);
                            const finalMatch = knockoutMatches.find(m => (m.additionalData?.round || m.round || 1) === finalRound && m.status === 'completed');
                            if (finalMatch?.winnerId) setOfficialChampionId(String(finalMatch.winnerId));
                        }
                    } catch (e) {
                        console.error("Failed to fetch knockout winner:", e);
                    }
                } else if (standingsData.length > 0) {
                    const topPid = standingsData[0].playerId || standingsData[0].player?.id;
                    if (topPid) setOfficialChampionId(String(topPid));
                }
            } else {
                setOfficialChampionId(null);
            }
        } catch (err) {
            console.error("Error fetching standings:", err);
            setError(err.message || "Error loading standings");
        }
        setLoading(false);
    }, [leagueId, getLeagueStandings, league]);

    useEffect(() => {
        fetchStandings();
    }, [fetchStandings]);

    if (loading) return <Loader text="Calculating Standings..." />;

    if (error) return (
        <div className="p-8 bg-red-50 rounded-[2rem] border border-red-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
               <FaExclamationTriangle className="text-xl" />
            </div>
            <p className="text-red-600 text-sm font-bold uppercase tracking-tight">Error Loading Standings: {error}</p>
        </div>
    );
    if (standings.length === 0) return (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-50 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1]">
            <FaTrophy className="mx-auto h-12 w-12 mb-4 text-gray-100" />
            <h3 className="text-lg font-black text-[#132F45] uppercase tracking-tight">No Standings Recorded</h3>
            <p className="text-gray-400 text-[10px] font-bold mt-1.5 uppercase tracking-widest leading-relaxed">Competition stats will appear here as matches are reporting.</p>
        </div>
    );

    const isColumnVisible = (colKey) => {
        const sportName = league?.sport?.toLowerCase() || '';
        const isSnooker = sportName === 'snooker';
        const isPool = sportName.includes('pool');
        const isPooker = sportName === 'pooker';

        // 1. Strict Sport-based hard exclusions (NEVER show these for these sports)
        if (isPool) {
            if (['highestBreak', 'hb', 'breaks50Plus', 'breaks100Plus', 'b50', 'b100'].includes(colKey)) return false;
        }
        if (isSnooker) {
            if (['ballsPotted', 'sevenBallWins', 'blackFinishes', 'whitewashWins', 'sbw', 'bf', 'www', 'bp', 'bc', 'ballsConceded'].includes(colKey)) return false;
        }
        if (isPooker) {
            if (['highestBreak', 'hb', 'sevenBallWins', 'sbw'].includes(colKey)) return false;
        }

        // 2. If no configuration is provided, use sport-specific defaults
        if (!standingsDisplay?.columns || (Array.isArray(standingsDisplay.columns) && standingsDisplay.columns.length === 0)) {
            const common = ['matchesPlayed', 'wins', 'losses', 'draws', 'points', 'framesWon', 'framesLost', 'frameDifference', 'winPercent', 'winPercentage', 'streak'];
            if (isSnooker) return [...common, 'highestBreak', 'whitewashes'].includes(colKey);
            if (isPool) return [...common, 'ballsPotted', 'sevenBallWins'].includes(colKey);
            if (isPooker) return [...common, 'ballsPotted', 'blackFinishes', 'whitewashWins'].includes(colKey);
            return true; // Fallback for unknown sports
        }

        // 3. Use explicit configuration if available
        let isVisible = true;
        if (Array.isArray(standingsDisplay.columns)) {
            isVisible = standingsDisplay.columns.includes(colKey);
        } else if (standingsDisplay?.columns) {
            isVisible = standingsDisplay.columns[colKey] !== false;
        }

        // 4. FORCE essential sport-specific columns even if not in explicit config
        if (isPool && ['ballsPotted', 'sevenBallWins', 'sbw'].includes(colKey)) return true;
        if (isPooker && ['ballsPotted', 'blackFinishes', 'bf', 'whitewashWins', 'www'].includes(colKey)) return true;
        if (isSnooker && ['highestBreak', 'hb', 'whitewashes', 'ww'].includes(colKey)) return true;

        return isVisible;
    };

    const visibleCols = {
        mp: isColumnVisible('matchesPlayed'),
        w: isColumnVisible('wins'),
        l: isColumnVisible('losses'),
        d: isColumnVisible('draws'),
        fw: isColumnVisible('framesWon'),
        fc: isColumnVisible('framesConceded') || isColumnVisible('framesLost'),
        fd: isColumnVisible('frameDifference') || isColumnVisible('frameDiff'),
        ww: isColumnVisible('whitewashes') || isColumnVisible('ww'),
        hb: isColumnVisible('highestBreak') || isColumnVisible('hb'),
        winp: isColumnVisible('winPercent') || isColumnVisible('winPercentage'),
        streak: isColumnVisible('streak'),
        b50: isColumnVisible('breaks50Plus') || isColumnVisible('b50'),
        b100: isColumnVisible('breaks100Plus') || isColumnVisible('b100'),
        bp: isColumnVisible('ballsPotted') || isColumnVisible('bp'),
        bc: isColumnVisible('ballsConceded') || isColumnVisible('bc'),
        sbw: isColumnVisible('sevenBallWins') || isColumnVisible('sbw'),
        bf: isColumnVisible('blackFinishes') || isColumnVisible('bf'),
        www: isColumnVisible('whitewashWins') || isColumnVisible('www'),
        wwalk: isColumnVisible('walkoverWins') || isColumnVisible('wwalk'),
        lwalk: isColumnVisible('walkoverLosses') || isColumnVisible('lwalk'),
        pts: isColumnVisible('points') !== false || isColumnVisible('pts') !== false,
    };



    
    return (
        <div className="overflow-x-auto rounded-[2rem] border border-gray-50 shadow-2xl shadow-[#132F45]/5 bg-white outline outline-1 outline-[#FDF2D1]">
            <table className="min-w-full border-separate border-spacing-0">
                <thead>
                    <tr className="bg-[#132F45]">
                        <th className="px-3 py-3.5 text-left text-[8px] font-black text-[#BA995D] uppercase tracking-widest sticky left-0 bg-[#132F45] z-10 w-12 text-center border-b border-[#1c4566]">POS</th>
                        <th className="px-3 py-3.5 text-left text-[8px] font-black text-white uppercase tracking-widest sticky left-12 bg-[#132F45] z-10 border-b border-[#1c4566]">CONTENDER</th>
                        {visibleCols.mp && <Th label="MP" />}
                        {visibleCols.w && <Th label="W" />}
                        {visibleCols.l && <Th label="L" />}
                        {visibleCols.d && <Th label="D" />}
                        {visibleCols.fw && <Th label="FW" />}
                        {visibleCols.fc && <Th label="FC" />}
                        {visibleCols.fd && <Th label="FD" />}
                        {visibleCols.ww && <Th label="WW" />}
                        {visibleCols.hb && <Th label="HB" />}
                        {visibleCols.winp && <Th label="WIN %" />}
                        {visibleCols.streak && <Th label="STREAK" />}
                        {visibleCols.b50 && <Th label="50+" />}
                        {visibleCols.b100 && <Th label="100+" />}
                        {visibleCols.bp && <Th label="BP" />}
                        {visibleCols.bc && <Th label="BC" />}
                        {visibleCols.sbw && <Th label="7BW" />}
                        {visibleCols.bf && <Th label="BF" />}
                        {visibleCols.www && <Th label="WWW" />}
                        {visibleCols.wwalk && <Th label="WWALK" />}
                        {visibleCols.lwalk && <Th label="LWALK" />}
                        {visibleCols.pts && <th className="px-3 py-3.5 text-center text-[8.5px] font-black text-[#132F45] bg-[#BA995D] uppercase tracking-widest border-b border-[#BA995D]">PTS</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {standings.map((p, idx) => {
                        const playerIdToMatch = user?.playerId || user?.id;
                        const standingPlayerId = p.playerId || p.player?.id;
                        const isUserRow = standingPlayerId === playerIdToMatch;
                        const isWithdrawn = p.status === 'withdrawn';
                        const isTop3 = idx < 3;
                        const medals = ['🥇', '🥈', '🥉'];
                        
                        return (
                            <tr key={p.id} className={`transition-all group hover:bg-[#FAFAFA] ${isWithdrawn ? 'opacity-40 grayscale' : isUserRow ? 'bg-[#FDF2D1]/40' : ''}`}>
                                <td className="px-3 py-3.5 text-center border-r border-gray-50 sticky left-0 bg-white group-hover:bg-[#FAFAFA] z-10">
                                    {isTop3 && !isWithdrawn ? (
                                        <span className="text-lg drop-shadow-sm filter">
                                            {medals[idx]}
                                        </span>
                                    ) : (
                                        <span className={`text-[10px] font-black tracking-widest ${isUserRow ? 'text-[#BA995D]' : 'text-gray-400'}`}>
                                            {(idx + 1).toString().padStart(2, '0')}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-3.5 sticky left-12 bg-white group-hover:bg-[#FAFAFA] z-10 border-r border-gray-50">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-black text-[11px] border transition-all ${isUserRow ? 'bg-[#132F45] border-[#132F45] text-[#BA995D] rotate-12' : 'bg-[#FAFAFA] border-gray-100 text-gray-400 group-hover:border-[#BA995D]/30 group-hover:text-[#132F45]'}`}>
                                            {p.player?.name?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <div className={`text-[12px] font-black uppercase tracking-tight flex items-center gap-1.5 ${isUserRow ? 'text-[#132F45]' : 'text-gray-900 group-hover:text-[#BA995D]'} transition-colors ${isWithdrawn ? 'line-through decoration-red-500' : ''}`}>
                                                {p.player?.name || 'Unknown'}
                                                {p.title && p.status !== 'withdrawn' && (
                                                    (leagueStatus === 'completed' && ['Promoted', 'Qualified', 'Relegated'].includes(p.title)) ||
                                                    ['Champion', 'Runner-up'].includes(p.title)
                                                ) && (
                                                    // Hide Champion/Runner-up for Divisional Formats (RR, Swiss, H&A) to prioritize Promo/Reg badges
                                                    !( ['round_robin', 'roundrobin', 'homeaway', 'home_away', 'swiss'].includes(effectiveFormat.toLowerCase()) && 
                                                       ['Champion', 'Runner-up'].includes(p.title) )
                                                ) && (
                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase border shadow-sm ${p.title === 'Champion'
                                                        ? (leagueStatus === 'completed' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-blue-100 text-blue-800 border-blue-200')
                                                        : p.title === 'Runner-up' ? 'bg-gray-100 text-gray-800 border-gray-200'
                                                        : (p.title === 'Promoted' || p.title === 'Qualified') ? 'bg-green-100 text-green-800 border-green-200'
                                                        : p.title === 'Relegated' ? 'bg-red-100 text-red-800 border-red-200'
                                                        : 'bg-gray-100 text-gray-800 border-gray-200'
                                                      }`}>
                                                      {p.title === 'Champion' ? <FaTrophy className={leagueStatus === 'completed' ? 'text-yellow-600' : 'text-blue-600'} /> : 
                                                       (p.title === 'Promoted' || p.title === 'Qualified') ? <FaStar className="text-green-600" /> :
                                                       p.title === 'Relegated' ? <FaArrowDown className="text-red-600" /> : null}
                                                      {p.title === 'Champion' ? (leagueStatus === 'completed' ? 'Champion' : 'Current Leader') : p.title}
                                                    </span>
                                                )}

                                                {p.status !== 'withdrawn' && (
                                                    <>
                                                        {/* Promotion/Qualification Tags (Only for non-tournament formats) */}
                                                        {leagueStatus === 'completed' && !['knockout', 'groupsKnockout'].includes(effectiveFormat) && idx < promotionCount && (!p.title || !['Promoted', 'Qualified'].includes(p.title)) && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase border bg-green-100 text-green-800 border-green-200 ml-1 shadow-sm">
                                                                <FaStar className="text-green-600" />
                                                                {effectiveFormat === 'groupsKnockout' ? 'Qualified' : 'Promoted'}
                                                            </span>
                                                        )}
                                                        
                                                        {/* Relegation Tag (Shown for Round Robin formats) */}
                                                        {leagueStatus === 'completed' && !['knockout', 'groupsKnockout'].includes(effectiveFormat) && relegationCount > 0 && idx >= standings.length - relegationCount && (!p.title || p.title !== 'Relegated') && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase border bg-red-50 text-red-700 border-red-100 ml-1 shadow-sm">
                                                                <FaArrowDown className="text-red-600" />
                                                                Relegated
                                                            </span>
                                                        )}

                                                        {/* Default Champion Tag (For Round Robin / Swiss / Groups - based on rank 1) */}
                                                        {idx === 0 && !['knockout', 'groupsKnockout', 'round_robin', 'roundRobin', 'homeAway', 'homeaway', 'swiss'].includes(effectiveFormat) && promotionCount === 0 && (
                                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase border shadow-sm ${leagueStatus === 'completed'
                                                                ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                                                                : 'bg-blue-100 text-blue-800 border-blue-200'
                                                              }`}>
                                                                <FaTrophy className={leagueStatus === 'completed' ? 'text-yellow-600' : 'text-blue-600'} />
                                                                {leagueStatus === 'completed' ? 'Champion' : 'Current Leader'}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                {isUserRow && <span className="text-[7px] font-black text-[#BA995D] uppercase tracking-widest bg-[#132F45] px-1.5 py-0.5 rounded-full">YOU</span>}
                                                {p.status === 'late_enrollment' && <span className="text-[7px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100">🆕 LATE JOIN</span>}
                                                {isWithdrawn && <span className="text-[7px] font-black text-red-600 uppercase tracking-widest bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">WITHDRAWN</span>}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                {visibleCols.mp && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 ${isUserRow ? 'font-black text-[#132F45]' : 'font-bold text-gray-600'}`}>{p.matchesPlayed}</td>}
                                {visibleCols.w && <td className={`px-2 py-3.5 text-center text-[11px] font-black border-r border-gray-50 ${isUserRow ? 'text-green-700' : 'text-green-600'}`}>{p.matchesWon}</td>}
                                {visibleCols.l && <td className={`px-2 py-3.5 text-center text-[11px] font-black border-r border-gray-50 ${isUserRow ? 'text-red-700' : 'text-red-500'}`}>{p.matchesLost}</td>}
                                {visibleCols.d && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 ${isUserRow ? 'font-black text-[#132F45]' : 'font-bold text-gray-500'}`}>{p.draws || 0}</td>}
                                {visibleCols.fw && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 ${isUserRow ? 'font-black text-[#132F45]' : 'font-medium text-gray-500'}`}>{p.framesWon || 0}</td>}
                                {visibleCols.fc && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 ${isUserRow ? 'font-black text-[#132F45]' : 'font-medium text-gray-500'}`}>{p.framesLost || 0}</td>}
                                {visibleCols.fd && <td className={`px-2 py-3.5 text-center text-[11px] font-black border-r border-gray-50 ${isUserRow ? (p.frameDifference >= 0 ? 'text-green-700' : 'text-red-700') : (p.frameDifference >= 0 ? 'text-green-600' : 'text-red-500')}`}>{p.frameDifference > 0 ? `+${p.frameDifference}` : p.frameDifference}</td>}
                                {visibleCols.ww && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 ${isUserRow ? 'font-black text-[#132F45]' : 'font-medium text-gray-500'}`}>{p.whitewashes || 0}</td>}
                                {visibleCols.hb && <td className={`px-2 py-3.5 text-center text-[11px] font-black border-r border-gray-50 text-blue-600`}>{p.highestBreak || 0}</td>}
                                {visibleCols.winp && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-bold text-gray-400`}>{Math.round(p.winPercentage || 0)}%</td>}
                                {visibleCols.streak && (
                                    <td className="px-2 py-3.5 text-center border-r border-gray-50">
                                        <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                                            p.streak?.startsWith('W') ? 'bg-green-50 text-green-700 border border-green-100' : 
                                            p.streak?.startsWith('L') ? 'bg-red-50 text-red-700 border border-red-100' : 
                                            'bg-gray-50 text-gray-500 border border-gray-100'
                                        }`}>
                                            {p.streak || '-'}
                                        </span>
                                    </td>
                                )}
                                {visibleCols.b50 && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-medium text-gray-500`}>{p.breaks50Plus || 0}</td>}
                                {visibleCols.b100 && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-black text-amber-600`}>{p.breaks100Plus || 0}</td>}
                                {visibleCols.bp && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-medium text-gray-500`}>{p.ballsPotted || 0}</td>}
                                {visibleCols.bc && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-medium text-gray-500`}>{p.ballsConceded || 0}</td>}
                                {visibleCols.sbw && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-black text-purple-600`}>{p.sevenBallWins || 0}</td>}
                                {visibleCols.bf && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-black text-gray-800`}>{p.blackFinishes || 0}</td>}
                                {visibleCols.www && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-black text-indigo-600`}>{p.whitewashWins || 0}</td>}
                                {visibleCols.wwalk && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-black text-orange-600`}>{p.walkoverWins || 0}</td>}
                                {visibleCols.lwalk && <td className={`px-2 py-3.5 text-center text-[11px] border-r border-gray-50 font-black text-orange-500`}>{p.walkoverLosses || 0}</td>}
                                {visibleCols.pts && <td className={`px-3 py-3.5 text-center font-black text-base ${isUserRow ? 'text-[#132F45] bg-[#BA995D]' : isTop3 ? 'text-[#132F45] bg-[#BA995D]/20' : 'text-[#132F45] bg-[#BA995D]/10'}`}>{p.points}</td>}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const Th = ({ label }) => <th className="px-3 py-3.5 text-center text-[8px] font-black text-[#BA995D]/70 uppercase tracking-widest border-b border-[#1c4566] whitespace-nowrap">{label}</th>;

const safeParseJson = (value, fallback = null) => {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const mergeDefinedObjects = (...sources) => {
    const merged = {};

    sources.forEach((source) => {
        const parsed = safeParseJson(source, null);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return;

        Object.entries(parsed).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                merged[key] = value;
            }
        });
    });

    return merged;
};

const normalizeFrameDetails = (matchDetail, fallbackMatch) => {
    const result = mergeDefinedObjects(
        fallbackMatch?.additionalData?.resultData,
        fallbackMatch?.resultData,
        fallbackMatch?.additionalData?.matchResult,
        fallbackMatch?.matchResult,
        matchDetail?.fixture?.resultData,
        matchDetail?.fixture?.matchResult,
        matchDetail?.result,
        matchDetail?.matchResult
    );

    const candidate =
        result.snookerFrameDetails ||
        result.pookerFrameDetails ||
        result.poolRackDetails ||
        result.frameDetails ||
        fallbackMatch?.frameDetails ||
        fallbackMatch?.resultData?.snookerFrameDetails ||
        fallbackMatch?.resultData?.pookerFrameDetails ||
        fallbackMatch?.resultData?.poolRackDetails ||
        fallbackMatch?.resultData?.frameDetails ||
        fallbackMatch?.additionalData?.matchResult?.snookerFrameDetails ||
        fallbackMatch?.additionalData?.matchResult?.pookerFrameDetails ||
        fallbackMatch?.additionalData?.matchResult?.poolRackDetails ||
        fallbackMatch?.additionalData?.matchResult?.frameDetails ||
        fallbackMatch?.additionalData?.snookerFrameDetails ||
        fallbackMatch?.additionalData?.pookerFrameDetails ||
        fallbackMatch?.additionalData?.poolRackDetails ||
        fallbackMatch?.additionalData?.frameDetails;

    const parsed = safeParseJson(candidate, []);
    return Array.isArray(parsed) ? parsed : [];
};

const deriveExtendedStats = (frameDetails, sport, player1Id, player2Id) => {
    const normalizedSport = String(sport || '').toLowerCase();
    const isPool = normalizedSport === 'pool';
    const isPooker = normalizedSport === 'pooker';
    const isSnooker = normalizedSport === 'snooker' || (!isPool && !isPooker);

    const stats = {
        highestBreak: 0,
        player1BallsPotted: 0,
        player2BallsPotted: 0,
        player1SevenBallWins: 0,
        player2SevenBallWins: 0,
        player1BlackFinishes: 0,
        player2BlackFinishes: 0,
        player1WhitewashWins: 0,
        player2WhitewashWins: 0,
    };

    frameDetails.forEach((frame) => {
        const p1Break = Number(getFrameValue(frame, ['player1Break', 'player1HighestBreak', 'p1Break'])) || 0;
        const p2Break = Number(getFrameValue(frame, ['player2Break', 'player2HighestBreak', 'p2Break'])) || 0;
        const p1Balls = Number(getFrameValue(frame, ['player1BallsPotted', 'p1BallsPotted'])) || 0;
        const p2Balls = Number(getFrameValue(frame, ['player2BallsPotted', 'p2BallsPotted'])) || 0;
        const winnerId = frame?.winnerId || frame?.winner || null;
        const winnerIdStr = winnerId == null ? null : String(winnerId);

        stats.highestBreak = Math.max(stats.highestBreak, p1Break, p2Break);
        stats.player1BallsPotted += p1Balls;
        stats.player2BallsPotted += p2Balls;

        if (frame?.isSevenBallWin) {
            if (winnerIdStr && player1Id != null && winnerIdStr === String(player1Id)) {
                stats.player1SevenBallWins += 1;
            }
            if (winnerIdStr && player2Id != null && winnerIdStr === String(player2Id)) {
                stats.player2SevenBallWins += 1;
            }
        }

        if (isPooker && frame?.isBlackFinish) {
            if (winnerIdStr && player1Id != null && winnerIdStr === String(player1Id)) {
                stats.player1BlackFinishes += 1;
            }
            if (winnerIdStr && player2Id != null && winnerIdStr === String(player2Id)) {
                stats.player2BlackFinishes += 1;
            }
        }

        if ((isSnooker || isPooker) && frame?.isWhitewash) {
            if (winnerIdStr && player1Id != null && winnerIdStr === String(player1Id)) {
                stats.player1WhitewashWins += 1;
            }
            if (winnerIdStr && player2Id != null && winnerIdStr === String(player2Id)) {
                stats.player2WhitewashWins += 1;
            }
        }
    });

    return stats;
};

const getFrameValue = (frame, keys) => {
    for (const key of keys) {
        const value = frame?.[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return 0;
};

const formatMatchDate = (dateStr) => {
    if (!dateStr || dateStr === 'TBA') return 'TBA';
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return 'TBA';
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const StatTile = ({ label, value, accent, visible }) => {
    if (!visible) return null;
    return (
        <div className="rounded-2xl border border-gray-100 bg-[#FAFAFA] p-4">
            <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">{label}</p>
            <p className={`mt-1 text-sm font-black uppercase tracking-tight ${accent}`}>{value}</p>
        </div>
    );
};

const FrameStat = ({ label, value, accent }) => {
    return (
        <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
            <p className="truncate text-[7px] font-black uppercase tracking-widest text-gray-400">{label}</p>
            <p className={`mt-1 text-lg font-black ${accent}`}>{value}</p>
        </div>
    );
};

const CompletedMatchDetailsModal = ({ isOpen, match, matchDetail, loading, error, onClose }) => {
    if (!isOpen || !match) return null;

    const detailFixture = matchDetail?.fixture || match;
    const result = mergeDefinedObjects(
        match.additionalData?.resultData,
        match.additionalData?.matchResult,
        match.resultData,
        match.matchResult,
        detailFixture?.resultData,
        detailFixture?.matchResult,
        matchDetail?.result,
        matchDetail?.matchResult
    );
    const booking = detailFixture?.bookings?.[0] || result?.booking || match.additionalData?.bookings?.[0] || null;
    const frameDetails = normalizeFrameDetails(matchDetail, match);
    const sport = String(detailFixture?.league?.sport || match.sport || match.gameType || '').toLowerCase();
    const isPool = sport === 'pool';
    const isPooker = sport === 'pooker';
    const isSnooker = sport === 'snooker' || (!isPool && !isPooker);

    const derivedStats = deriveExtendedStats(
        frameDetails,
        sport,
        detailFixture?.player1?.id || match.additionalData?.player1Id,
        detailFixture?.player2?.id || match.additionalData?.player2Id
    );

    const highestBreak = result?.highestBreak ?? detailFixture?.highestBreak ?? match.highestBreak ?? derivedStats.highestBreak ?? 0;
    const player1BallsPotted = result?.player1BallsPotted ?? detailFixture?.player1BallsPotted ?? match.player1BallsPotted ?? derivedStats.player1BallsPotted ?? 0;
    const player2BallsPotted = result?.player2BallsPotted ?? detailFixture?.player2BallsPotted ?? match.player2BallsPotted ?? derivedStats.player2BallsPotted ?? 0;
    const player1SevenBallWins = result?.player1SevenBallWins ?? detailFixture?.player1SevenBallWins ?? match.player1SevenBallWins ?? derivedStats.player1SevenBallWins ?? 0;
    const player2SevenBallWins = result?.player2SevenBallWins ?? detailFixture?.player2SevenBallWins ?? match.player2SevenBallWins ?? derivedStats.player2SevenBallWins ?? 0;
    const player1BlackFinishes = result?.player1BlackFinishes ?? detailFixture?.player1BlackFinishes ?? match.player1BlackFinishes ?? derivedStats.player1BlackFinishes ?? 0;
    const player2BlackFinishes = result?.player2BlackFinishes ?? detailFixture?.player2BlackFinishes ?? match.player2BlackFinishes ?? derivedStats.player2BlackFinishes ?? 0;
    const player1WhitewashWins = result?.player1WhitewashWins ?? detailFixture?.player1WhitewashWins ?? match.player1WhitewashWins ?? derivedStats.player1WhitewashWins ?? 0;
    const player2WhitewashWins = result?.player2WhitewashWins ?? detailFixture?.player2WhitewashWins ?? match.player2WhitewashWins ?? derivedStats.player2WhitewashWins ?? 0;

    const player1Name = detailFixture?.player1?.name || match.homeTeam || 'Player 1';
    const player2Name = detailFixture?.player2?.name || match.awayTeam || 'Player 2';
    const displayScore = match.score || detailFixture?.score || `${detailFixture?.player1Frames ?? detailFixture?.player1RackWins ?? 0}-${detailFixture?.player2Frames ?? detailFixture?.player2RackWins ?? 0}`;
    const venueName = booking?.venue?.venueName || booking?.venue?.name || match.venueName || match.tableName || 'TBA';
    const tableName = booking?.tableName || (booking?.tableNumber ? `Table ${booking.tableNumber}` : match.tableName || 'TBA');
    const resultStatus = result?.resultStatus || detailFixture?.detailedStatus || match.detailedStatus || match.status;
    const frameLabel = isPool ? 'Rack' : 'Frame';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.96, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 20 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-[2rem] bg-white shadow-2xl border border-[#FDF2D1]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between bg-[#132F45] px-5 sm:px-6 py-4">
                    <div>
                        <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[#BA995D]">Completed Match Details</p>
                        <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">{player1Name} vs {player2Name}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white transition hover:bg-white hover:text-[#132F45]"
                    >
                        Close
                    </button>
                </div>

                <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-5 sm:p-6 space-y-5">
                    {loading ? (
                        <div className="py-20 text-center">
                            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#132F45]/10 border-t-[#BA995D]" />
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#132F45]">Loading match data...</p>
                        </div>
                    ) : error ? (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center text-red-700">
                            <FaExclamationTriangle className="mx-auto mb-2 text-xl" />
                            <p className="text-[10px] font-black uppercase tracking-widest">{error}</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid gap-3 md:grid-cols-4">
                                <div className="rounded-2xl border border-gray-50 bg-[#FAFAFA] p-4">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Status</p>
                                    <p className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">{resultStatus}</p>
                                </div>
                                <div className="rounded-2xl border border-gray-50 bg-[#FAFAFA] p-4">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Score</p>
                                    <p className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">{displayScore}</p>
                                </div>
                                <div className="rounded-2xl border border-gray-50 bg-[#FAFAFA] p-4">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Venue</p>
                                    <p className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">{venueName}</p>
                                </div>
                                <div className="rounded-2xl border border-gray-50 bg-[#FAFAFA] p-4">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Table</p>
                                    <p className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">{tableName}</p>
                                </div>
                            </div>

                            <div className="grid gap-3 lg:grid-cols-[1.25fr_0.95fr]">
                                <div className="rounded-[1.75rem] border border-gray-50 bg-white p-5 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1]">
                                    <div className="flex items-center justify-between gap-4 border-b border-gray-50 pb-4">
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-gray-400">Booking Information</p>
                                            <h4 className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">{booking?.bookingDate ? formatMatchDate(booking.bookingDate) : formatMatchDate(detailFixture?.date || match.date)}</h4>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-gray-400">Time</p>
                                            <h4 className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">{booking?.startTime || detailFixture?.startTime || match.startTime || 'TBA'}</h4>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-2xl bg-[#FAFAFA] p-4">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Player 1</p>
                                            <p className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">{player1Name}</p>
                                        </div>
                                        <div className="rounded-2xl bg-[#FAFAFA] p-4">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Player 2</p>
                                            <p className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">{player2Name}</p>
                                        </div>
                                    </div>

                                    {(result?.notes || result?.imageUrl) && (
                                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                            {result?.notes && (
                                                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:col-span-2">
                                                    <p className="text-[8px] font-black uppercase tracking-[0.25em] text-blue-500">Notes</p>
                                                    <p className="mt-2 text-xs font-medium leading-relaxed text-[#132F45]">{result.notes}</p>
                                                </div>
                                            )}
                                            {result?.imageUrl && (
                                                <a
                                                    href={result.imageUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#BA995D]/20 bg-[#FDF2D1] px-4 py-3 text-[9px] font-black uppercase tracking-widest text-[#132F45] transition hover:bg-[#BA995D] hover:text-white"
                                                >
                                                    <FaImage /> View Proof
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-[1.75rem] border border-gray-50 bg-white p-5 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1]">
                                    <p className="text-[8px] font-black uppercase tracking-[0.25em] text-gray-400">Match Stats</p>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <StatTile label="Highest Break" value={highestBreak || 0} accent="text-blue-600" visible={isSnooker || isPooker} />
                                        <StatTile label="Balls Potted" value={`${player1BallsPotted} / ${player2BallsPotted}`} accent="text-purple-600" visible={isPool || isPooker} />
                                        <StatTile label="7-Ball Wins" value={`${player1SevenBallWins} / ${player2SevenBallWins}`} accent="text-yellow-600" visible={isPool || isPooker} />
                                        <StatTile label="Black Finishes" value={`${player1BlackFinishes} / ${player2BlackFinishes}`} accent="text-gray-800" visible={isPooker} />
                                        <StatTile label="Whitewash Wins" value={`${player1WhitewashWins} / ${player2WhitewashWins}`} accent="text-indigo-600" visible={isSnooker || isPooker} />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.75rem] border border-gray-50 bg-white p-5 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1]">
                                <div className="flex items-center justify-between gap-3 border-b border-gray-50 pb-4">
                                    <div>
                                        <p className="text-[8px] font-black uppercase tracking-[0.25em] text-gray-400">{isPool ? 'Rack-by-Rack' : 'Frame-by-Frame'}</p>
                                        <h4 className="mt-1 text-sm font-black uppercase tracking-tight text-[#132F45]">Detailed Breakdown</h4>
                                    </div>
                                    <span className="rounded-full bg-[#FDF2D1] px-3 py-1 text-[8px] font-black uppercase tracking-widest text-[#132F45]">{frameDetails.length} entries</span>
                                </div>

                                {frameDetails.length > 0 ? (
                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {frameDetails.map((frame, index) => {
                                            const p1Score = Number(getFrameValue(frame, ['player1Score', 'player1Frames', 'player1RackWins', 'score1', 'p1Score'])) || 0;
                                            const p2Score = Number(getFrameValue(frame, ['player2Score', 'player2Frames', 'player2RackWins', 'score2', 'p2Score'])) || 0;
                                            const p1Break = Number(getFrameValue(frame, ['player1Break', 'player1HighestBreak', 'p1Break'])) || 0;
                                            const p2Break = Number(getFrameValue(frame, ['player2Break', 'player2HighestBreak', 'p2Break'])) || 0;
                                            const p1Balls = Number(getFrameValue(frame, ['player1BallsPotted', 'p1BallsPotted'])) || 0;
                                            const p2Balls = Number(getFrameValue(frame, ['player2BallsPotted', 'p2BallsPotted'])) || 0;
                                            const winnerId = frame.winnerId || frame.winner || null;
                                            const frameNumber = frame.frameNumber || frame.rackNumber || frame.round || index + 1;
                                            const winnerLabel = winnerId
                                                ? String(winnerId) === String(detailFixture?.player1?.id || match.additionalData?.player1Id) || p1Score > p2Score
                                                    ? player1Name
                                                    : String(winnerId) === String(detailFixture?.player2?.id || match.additionalData?.player2Id) || p2Score > p1Score
                                                        ? player2Name
                                                        : 'Decided'
                                                : (p1Score > p2Score ? player1Name : p2Score > p1Score ? player2Name : 'Draw');

                                            return (
                                                <div key={`${frameNumber}-${index}`} className="rounded-2xl border border-gray-100 bg-[#FAFAFA] p-4 shadow-sm">
                                                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-[#BA995D]">{frameLabel} {String(frameNumber).padStart(2, '0')}</span>
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-[#132F45]">{winnerLabel}</span>
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                                        <FrameStat label={player1Name} value={p1Score} accent="text-[#132F45]" />
                                                        <FrameStat label={player2Name} value={p2Score} accent="text-[#BA995D]" />
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-2 gap-2 text-[8px] font-black uppercase tracking-widest text-gray-500">
                                                        <div className="rounded-xl bg-white px-3 py-2">Break: {p1Break} / {p2Break}</div>
                                                        <div className="rounded-xl bg-white px-3 py-2">Balls: {p1Balls} / {p2Balls}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-[#FAFAFA] p-8 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        No frame-by-frame data was recorded for this match.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};




// --- Sub-component: Rules & Settings ---
const RulesSection = ({ league }) => {
    const points = league.scoringRules || {};
    const tieBreakers = league.rankingRules?.tieBreakers || [];

    const formatLabels = {
        roundRobin: 'Round Robin',
        homeAway: 'Home & Away',
        groupsKnockout: 'Groups + Knockout',
        knockout: 'Single Knockout',
        swiss: 'Swiss',
        custom: 'Custom Format'
    };

    const rules = [
        { label: 'Match Format', value: `${league.sport?.toUpperCase()} - ${league.leagueType === 'rolling' ? 'Rolling' : 'Fixed'} Schedule` },
        { label: 'League System', value: formatLabels[league.format] || league.format || 'Standard' },
        { label: 'Match Rule', value: (league.matchRules?.bestOf || league.matchFormat) ? (league.matchRules?.bestOf === 'custom' ? `Best of ${league.matchRules.customFrames}` : (league.matchRules?.bestOf ? `Best of ${league.matchRules.bestOf}` : league.matchFormat)) : 'Normal Match' },
        { label: 'Handicap', value: league.matchRules?.handicapEnabled ? 'Enabled' : 'Disabled' },
        { label: 'Participants', value: `${league.minPlayers || 0} - ${league.maxPlayers || 'No Limit'}` },
        { label: 'Late Enrollment', value: league.lateJoinAllowed ? 'Allowed' : 'Not Allowed' },
    ];

    const pointsRules = [
        { label: 'Win Award', value: `${points.win || 3} PTS` },
        { label: 'Draw Award', value: `${points.draw || 1} PTS` },
        { label: 'Loss Point', value: `${points.loss || 0} PTS` },
        { label: 'Frame Bonus', value: points.pointPerFrame ? `+${points.pointPerFrame} PER FRAME` : 'NONE' },
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="p-5 border border-gray-50 shadow-xl shadow-[#132F45]/5 bg-white rounded-2xl outline outline-1 outline-[#FDF2D1]">
                <h3 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Structure & Governance
                </h3>
                <div className="space-y-4">
                    {rules.map((r, i) => (
                        <div key={i} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0 hover:bg-[#FAFAFA] px-3 rounded-xl transition-all">
                            <span className="text-gray-400 text-[8px] font-black uppercase tracking-widest">{r.label}</span>
                            <span className="text-[#132F45] text-[10px] font-black uppercase tracking-tight">{r.value}</span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card className="p-5 border border-gray-50 shadow-xl shadow-[#132F45]/5 bg-white rounded-2xl outline outline-1 outline-[#FDF2D1]">
                <h3 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Scoring Dynamics
                </h3>
                <div className="space-y-4">
                    {pointsRules.map((r, i) => (
                        <div key={i} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0 hover:bg-[#FAFAFA] px-3 rounded-xl transition-all">
                            <span className="text-gray-400 text-[9px] font-black uppercase tracking-widest">{r.label}</span>
                            <span className="text-[#BA995D] text-[10px] font-black uppercase tracking-tight">{r.value}</span>
                        </div>
                    ))}
                </div>
                {tieBreakers.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <h4 className="text-[9px] font-black text-[#132F45] uppercase tracking-[0.2em] mb-4">Tie-Breaker Hierarchy</h4>
                        <div className="flex flex-wrap gap-1.5">
                            {tieBreakers.map((tb, i) => (
                                <span key={i} className="px-3 py-1.5 bg-[#FAFAFA] text-[#132F45] border border-gray-100 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-sm">
                                    <span className="text-[#BA995D] mr-1.5">0{i + 1}</span> {tb.replace(/([A-Z])/g, ' $1')}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};

// --- Main Component ---
export default function LeagueDetails({ leagueId, onBack, initialLeague }) {
    const { getLeagueById } = useContext(LeagueContext);
    const { user } = useContext(AuthContext);
    const [league, setLeague] = useState(initialLeague || null);
    const [fixtures, setFixtures] = useState([]);
    const [userBookings, setUserBookings] = useState([]);
    const [loading, setLoading] = useState(!initialLeague);
    const [fixturesLoading, setFixturesLoading] = useState(false);
    const [fixtureError, setFixtureError] = useState(null);
    const [activeTab, setActiveTab] = useState('stats'); // 'stats', 'fixtures', 'results'
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [selectedMatchDetails, setSelectedMatchDetails] = useState(null);
    const [matchDetailsLoading, setMatchDetailsLoading] = useState(false);
    const [matchDetailsError, setMatchDetailsError] = useState(null);

    const closeMatchDetails = useCallback(() => {
        setSelectedMatch(null);
        setSelectedMatchDetails(null);
        setMatchDetailsLoading(false);
        setMatchDetailsError(null);
    }, []);

    const openMatchDetails = useCallback(async (match) => {
        if (!match || match.status !== 'completed') return;

        setSelectedMatch(match);
        setSelectedMatchDetails(null);
        setMatchDetailsError(null);
        setMatchDetailsLoading(true);

        try {
            const fixtureId = match.fixtureId || match.id;
            const [fixtureResponse, completedResultsResponse] = await Promise.allSettled([
                getMatchResultDetails(leagueId, fixtureId),
                matchResultService.getCompletedResults(),
            ]);

            const fixtureDetail = fixtureResponse.status === 'fulfilled' ? fixtureResponse.value : null;
            const completedResults = completedResultsResponse.status === 'fulfilled'
                ? (completedResultsResponse.value?.data || [])
                : [];

            const completedResult = completedResults.find((result) => {
                return String(result.fixtureId) === String(fixtureId) || (
                    fixtureDetail?.bookings?.[0]?.id && String(result.bookingId) === String(fixtureDetail.bookings[0].id)
                );
            }) || null;

            setSelectedMatchDetails({
                fixture: fixtureDetail || null,
                result: completedResult,
            });
        } catch (err) {
            console.error('Failed to load completed match details:', err);
            setMatchDetailsError('Could not load full match details.');
        } finally {
            setMatchDetailsLoading(false);
        }
    }, [leagueId]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            let leagueData = initialLeague || null;
            
            if (!leagueData) {
                const leagueResult = await getLeagueById(leagueId);
                if (leagueResult.success) {
                    leagueData = leagueResult.data;
                } else {
                    try {
                        const response = await matchResultService.getLeagueById(leagueId);
                        if (response.data) leagueData = response.data;
                    } catch (err) {}
                }
            }
            
            if (leagueData) {
                setLeague(leagueData);

                try {
                    setFixturesLoading(true);
                    setFixtureError(null);
                    const fixtureData = await getFixturesForLeague(leagueId);
                    
                    if (fixtureData && fixtureData.length > 0) {
                        const transformedFixtures = transformFixturesToMatches(fixtureData, null, leagueData, leagueData?.divisions || []);
                        setFixtures(transformedFixtures);
                    } else {
                        try {
                            const fixtureResponse = await apiClient.get(`/leagues/${leagueId}/fixtures`);
                            const directFixtures = fixtureResponse.data?.data || [];
                            if (directFixtures.length > 0) {
                                const transformedFixtures = transformFixturesToMatches(directFixtures, null, leagueData, leagueData?.divisions || []);
                                setFixtures(transformedFixtures);
                            } else {
                                setFixtures([]);
                                setFixtureError("Competitive matches have not been generated yet.");
                            }
                        } catch (directError) {
                            setFixtures([]);
                            setFixtureError("Could not retrieve league fixtures.");
                        }
                    }
                } catch (fixtureError) {
                    setFixtures([]);
                    setFixtureError("Competitive engine connectivity failed.");
                } finally {
                    setFixturesLoading(false);
                }

                try {
                    const bookingResult = await apiClient.get('/bookings/my-bookings');
                    if (bookingResult.data?.success) {
                        const leagueBookings = bookingResult.data.data.filter(b =>
                            (String(b.league?.id) === String(leagueId) || String(b.leagueId) === String(leagueId))
                        );
                        setUserBookings(leagueBookings);
                    }
                } catch (bookingError) {}
            }
        } catch (error) {}
        setLoading(false);
    }, [leagueId, getLeagueById, initialLeague]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (loading) return <Loader text="Assembling Competition Details..." />;
    if (!league) return (
        <div className="p-12 text-center bg-white rounded-3xl shadow-xl shadow-[#132F45]/5 border border-gray-50 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-red-400">
               <FaExclamationTriangle className="text-2xl" />
            </div>
            <div>
               <h3 className="text-lg font-black text-[#132F45] uppercase tracking-tight">Access Restricted</h3>
               <p className="text-gray-400 font-bold text-[10px] mt-1.5 uppercase tracking-widest">League details are temporarily unavailable or archived.</p>
            </div>
            <button onClick={onBack} className="px-6 py-2.5 bg-[#132F45] text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-xl">Back to Center</button>
        </div>
    );

    const myMatches = fixtures.filter(m =>
        m.additionalData?.player1Id === user?.id ||
        m.additionalData?.player2Id === user?.id ||
        m.additionalData?.player1Id === user?.playerId ||
        m.additionalData?.player2Id === user?.playerId ||
        m.additionalData?.player1?.id === user?.id ||
        m.additionalData?.player2?.id === user?.id
    );

    const lateEnrollmentPlayerIds = new Set();
    if (league?.leaguePlayers) {
        league.leaguePlayers.forEach(lp => {
            if (lp.status === 'late_enrollment') lateEnrollmentPlayerIds.add(String(lp.playerId));
        });
    }

    const tabs = [
        { id: 'stats', label: 'Standings', icon: <FaTrophy /> },
        { id: 'fixtures', label: 'Match Schedule', icon: <FaCalendarAlt /> },
        { id: 'results', label: 'My Matches', icon: <FaCheckCircle />, count: userBookings.length || myMatches.length },
    ];

    return (
        <div className="min-h-screen bg-[#FAFAFA] relative">
            {/* Hero Header */}
            <div className="bg-[#132F45] px-4 sm:px-6 py-4 md:py-5 relative overflow-hidden rounded-b-3xl">
                <div className="absolute top-0 right-0 w-80 h-80 bg-[#BA995D]/5 rounded-bl-[30rem] -mr-24 -mt-24"></div>
                <div className="max-w-5xl mx-auto relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                   <div className="flex items-center gap-4">
                       <button
                           onClick={onBack}
                           className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-white hover:bg-white hover:text-[#132F45] transition-all group"
                       >
                           <FaChevronLeft size={10} className="group-hover:-translate-x-0.5 transition-transform" />
                       </button>
                       <div>
                           <div className="flex items-center gap-2 mb-1.5">
                             <span className="px-2 py-0.5 bg-[#BA995D] text-white text-[8px] font-black uppercase tracking-widest rounded-full">{league.sport}</span>
                             <span className="flex items-center gap-1 text-[#BA995D] text-[8px] font-black uppercase tracking-widest">
                                <div className={`w-1 h-1 rounded-full ${league.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} /> {league.status}
                             </span>
                           </div>
                           <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase">{league.name}</h2>
                       </div>
                   </div>
 
                   <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-md">
                        {league.venue && (
                          <div className="pr-4 border-r border-white/10">
                             
                          </div>
                        )}
                        <div className="pl-0.5">
                             <div className="text-[7px] font-black text-white/40 uppercase tracking-widest mb-0.5">Enrolment</div>
                             <div className={`text-[10px] font-black ${league.joinAllowed ? 'text-[#BA995D]' : 'text-red-500'} uppercase flex items-center gap-1.5 tracking-widest`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${league.joinAllowed ? 'bg-[#BA995D] shadow-[0_0_10px_rgba(186,153,93,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'} animate-pulse`} />
                                {league.joinAllowed ? 'OPEN' : 'CLOSED'}
                             </div>
                        </div>
                   </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-6 relative z-20 pb-16">
                {/* Invite Code Bar if applicable */}
                {league.joinCode && !['completed', 'cancelled'].includes(league.status) && (
                    <div className="bg-[#BA995D] rounded-2xl p-4 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl shadow-[#BA995D]/20">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white">
                               <FaLock className="text-lg" />
                            </div>
                            <div>
                               <h4 className="text-white font-black text-xs uppercase tracking-tight">Private Access Active</h4>
                               <p className="text-[#132F45] font-bold text-[8px] uppercase tracking-widest">Invite link and code is restricted to authorized contenders.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 font-black text-white text-base tracking-[0.25em] flex-1 md:flex-none text-center">
                                {league.joinCode}
                            </div>
                            <button
                                onClick={() => { navigator.clipboard.writeText(league.joinCode); }}
                                className="px-6 py-2 bg-white text-[#132F45] font-black rounded-xl transition-all text-[8px] uppercase tracking-widest hover:bg-[#FDF2D1] shadow-xl"
                            >
                                Copy Code
                            </button>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex bg-white p-1 rounded-xl shadow-xl shadow-[#132F45]/10 border border-gray-50 mb-8 overflow-x-auto no-scrollbar outline outline-1 outline-[#FDF2D1] w-fit mx-auto md:mx-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                activeTab === tab.id
                                ? 'bg-[#132F45] text-white shadow-lg'
                                : 'text-gray-400 hover:text-[#132F45] hover:bg-gray-50'
                                }`}
                        >
                            <span className={activeTab === tab.id ? 'text-[#BA995D]' : 'text-gray-300'}>{tab.icon}</span>
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[8px] ${
                                    activeTab === tab.id ? 'bg-[#BA995D] text-[#132F45]' : 'bg-gray-100 text-gray-500'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                    <button
                        onClick={() => setActiveTab('rules')}
                        className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                            activeTab === 'rules'
                            ? 'bg-[#132F45] text-white shadow-lg'
                            : 'text-gray-400 hover:text-[#132F45] hover:bg-gray-50'
                            }`}
                    >
                         <FaClipboardList className={activeTab === 'rules' ? 'text-[#BA995D]' : 'text-gray-300'} /> Rules
                    </button>
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {activeTab === 'stats' && (
                            <div className="space-y-5">
                                <div className="flex items-center justify-between px-3">
                                   <h3 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em] flex items-center gap-2">
                                      <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Full Leaderboard
                                   </h3>
                                   <div className="flex gap-2">
                                      <div className="w-2 h-2 rounded-full bg-green-400" />
                                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                                   </div>
                                </div>
                                <PlayerStandingsTable
                                    leagueId={leagueId}
                                    standingsDisplay={league.standingsDisplay}
                                    league={league}
                                />
                            </div>
                        )}

                        {activeTab === 'fixtures' && (
                            <div className="space-y-5">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-3">
                                   <h3 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em] flex items-center gap-2">
                                      <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Competitive Schedule
                                   </h3>
                                   <div className="px-4 py-1.5 bg-white rounded-full border border-gray-100 shadow-sm text-[8px] font-black text-[#132F45] uppercase tracking-widest outline outline-1 outline-[#FDF2D1]">
                                      Total Matches: <span className="text-[#BA995D] ml-1.5">{fixtures.length}</span>
                                   </div>
                                </div>

                                {fixturesLoading ? (
                                    <div className="py-16 text-center">
                                         <div className="w-12 h-12 border-4 border-[#132F45]/10 border-t-[#BA995D] rounded-full animate-spin mx-auto mb-4 shadow-xl shadow-[#BA995D]/20" />
                                         <p className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em]">Mapping Competition Matrix...</p>
                                    </div>
                                ) : fixtureError ? (
                                    <div className="p-8 text-center bg-white rounded-2xl border border-red-50 shadow-xl shadow-red-900/5 outline outline-1 outline-red-100 flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                                           <FaInfoCircle className="text-lg" />
                                        </div>
                                        <p className="text-red-900 text-[11px] font-black uppercase tracking-tight">{fixtureError}</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {fixtures.map(match => {
                                            const playerIdToMatch = user?.playerId || user?.id;
                                            const isUserMatch = 
                                                match.additionalData?.player1Id === playerIdToMatch ||
                                                match.additionalData?.player2Id === playerIdToMatch ||
                                                match.additionalData?.player1?.id === playerIdToMatch ||
                                                match.additionalData?.player2?.id === playerIdToMatch;
                                            
                                            const player1Id = String(match.additionalData?.player1Id || match.additionalData?.player1?.id || '');
                                            const player2Id = String(match.additionalData?.player2Id || match.additionalData?.player2?.id || '');
                                            const isLateEnrollmentMatch = 
                                                lateEnrollmentPlayerIds.has(player1Id) || 
                                                lateEnrollmentPlayerIds.has(player2Id);
                                            
                                            return (
                                                <MatchCard 
                                                    key={match.id} 
                                                    match={match} 
                                                    league={league}
                                                    isMyMatch={isUserMatch}
                                                    isLateEnrollmentMatch={isLateEnrollmentMatch}
                                                    onOpenDetails={openMatchDetails}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'results' && (
                            <div className="space-y-5">
                                {userBookings.length > 0 && (
                                    <div className="space-y-5">
                                        <h3 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em] flex items-center gap-2 px-3">
                                            <div className="w-1 h-2.5 bg-green-500 rounded-full" /> Audited Results
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {userBookings.map(booking => (
                                                <BookingMiniCard key={booking.id} booking={booking} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-5">
                                    <h3 className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em] flex items-center gap-2 px-3">
                                        <div className="w-1 h-2.5 bg-[#BA995D] rounded-full" /> Completed Encounters
                                    </h3>
                                    {(() => {
                                        const completedMatches = myMatches.filter(m => m.status === 'completed');
                                        
                                        if (completedMatches.length === 0 && userBookings.length === 0) {
                                            return (
                                                <div className="p-16 text-center bg-white rounded-3xl border border-gray-50 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1] flex flex-col items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-[#FAFAFA] flex items-center justify-center text-gray-200">
                                                       <FaUserFriends className="text-2xl" />
                                                    </div>
                                                    <div className="max-w-xs">
                                                       <h3 className="text-lg font-black text-[#132F45] uppercase tracking-tight">No History Yet</h3>
                                                       <p className="text-gray-400 font-bold text-[9px] mt-1.5 uppercase tracking-widest leading-relaxed">Your completed and verified match history for this league will appear here.</p>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        
                                        return (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {completedMatches.map(match => (
                                                            <MatchCard key={match.id} match={match} league={league} isMyMatch onOpenDetails={openMatchDetails} />
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {activeTab === 'rules' && (
                             <RulesSection league={league} />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {selectedMatch && (
                    <CompletedMatchDetailsModal
                        isOpen={!!selectedMatch}
                        match={selectedMatch}
                        matchDetail={selectedMatchDetails}
                        loading={matchDetailsLoading}
                        error={matchDetailsError}
                        onClose={closeMatchDetails}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// --- Sub-component: Match Card (Adapted) ---
const MatchCard = ({ match, league, isMyMatch, isLateEnrollmentMatch, onOpenDetails }) => {
    const statusColors = {
        upcoming: 'bg-blue-50 text-blue-700 border-blue-100',
        ongoing: 'bg-[#FDF2D1] text-[#BA995D] border-[#BA995D]/20',
        completed: 'bg-green-50 text-green-700 border-green-100',
        cancelled: 'bg-red-50 text-red-700 border-red-100',
    };

    const getStatusLabel = (status) => {
        switch(status) {
            case 'upcoming': return 'Scheduled';
            case 'ongoing': return 'In Progress';
            case 'completed': return 'Done';
            case 'cancelled': return 'Cancelled';
            default: return status?.charAt(0).toUpperCase() + status?.slice(1) || 'Pending';
        }
    };

    const getCardStyling = () => {
        if (isMyMatch) {
            return 'bg-white border-[#BA995D]/30 shadow-lg shadow-[#132F45]/5 ring-1 ring-[#BA995D]/10';
        }
        return 'bg-white border-gray-50 shadow-lg shadow-[#132F45]/5';
    };

    const p1Score = match.score?.split('-')[0] || 0;
    const p2Score = match.score?.split('-')[1] || 0;
    const isCompleted = match.status === 'completed';
    const booking = match.additionalData?.bookings?.[0] || null;
    const isBooked = booking?.status === 'confirmed';
    const isByeMatch = match.status === 'bye' || match.detailedStatus === 'BYE';
    const isWalkoverMatch =
        match.detailedStatus === 'FORFEIT' ||
        match.isWalkover === true ||
        match.matchResult?.isWalkover === true ||
        match.additionalData?.resultData?.isWalkover === true ||
        !!match.additionalData?.resultData?.walkoverScore;
    const canAddResult = isMyMatch && !isCompleted && isBooked && !isByeMatch && !isWalkoverMatch;

    const formatDateDisplay = (dateStr) => {
        if (!dateStr || dateStr === 'TBA') return 'TBA';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        } catch (e) {
            return 'TBA';
        }
    };

    const cardContent = (
        <Card className={`p-3 border rounded-xl transition-all flex flex-col gap-2.5 group hover:-translate-y-0.5 duration-500 outline outline-1 outline-[#FDF2D1] ${getCardStyling()} ${isCompleted ? 'cursor-pointer' : ''}`}>
            <div className="flex justify-between items-start gap-2">
                <div className="flex flex-wrap gap-1">
                    <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-wider border ${statusColors[match.status] || 'bg-gray-50'}`}>
                        {getStatusLabel(match.status)}
                    </span>
                    {match.additionalData?.fixture?.round && (
                        <span className="px-2 py-0.5 rounded-lg text-[7px] font-black text-[#132F45] bg-[#FAFAFA] border border-gray-100 uppercase tracking-wider">
                            Round {match.additionalData.fixture.round}
                        </span>
                    )}
                    {isMyMatch && (
                        <span className="px-2 py-0.5 rounded-lg text-[7px] font-black text-[#BA995D] bg-[#132F45] uppercase tracking-wider shadow-lg shadow-[#132F45]/20">
                            My Match
                        </span>
                    )}
                    {isCompleted && (
                        <span className="px-2 py-0.5 rounded-lg text-[7px] font-black text-[#132F45] bg-[#FDF2D1] uppercase tracking-wider shadow-sm">
                            View Details
                        </span>
                    )}
                </div>
                <div className="bg-[#FAFAFA] px-2 py-0.5 rounded-lg border border-gray-50 min-w-[45px]">
                   <div className="text-[6px] font-black text-[#BA995D] uppercase tracking-widest text-center">Result</div>
                   <div className={`text-sm font-black ${isMyMatch ? 'text-[#132F45]' : 'text-gray-900'} tracking-tighter`}>{match.score}</div>
                </div>
            </div>
 
            <div className="grid grid-cols-7 items-center gap-2 py-1.5 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-white border border-gray-100 rounded-full flex items-center justify-center z-10 text-[7px] font-black text-gray-200">VS</div>
                
                <div className="col-span-3 text-center space-y-1.5">
                    <div className="relative inline-block">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center mx-auto font-black border transition-all duration-500 group-hover:rotate-6 ${isMyMatch ? 'bg-[#132F45] border-[#BA995D] text-[#BA995D]' : 'bg-[#FAFAFA] border-gray-100 text-[#132F45]'}`}>
                            <span className="text-sm">{match.homeTeam.charAt(0)}</span>
                        </div>
                        {match.status === 'completed' && parseInt(p1Score) > parseInt(p2Score) && (
                           <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#BA995D] rounded-full flex items-center justify-center text-white border-2 border-white"><FaCheckCircle className="text-[6px]" /></div>
                        )}
                    </div>
                    <div className={`text-[7.5px] font-black truncate uppercase tracking-tight ${isMyMatch ? 'text-[#132F45]' : 'text-gray-400'}`}>{match.homeTeam}</div>
                </div>
 
                <div className="col-span-1" />
 
                <div className="col-span-3 text-center space-y-1.5">
                    <div className="relative inline-block">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center mx-auto font-black border transition-all duration-500 group-hover:-rotate-6 ${isMyMatch ? 'bg-[#FAFAFA] border-[#BA995D]/20 text-[#132F45]' : 'bg-[#FAFAFA] border-gray-100 text-[#132F45]'}`}>
                            <span className="text-sm">{match.awayTeam.charAt(0)}</span>
                        </div>
                        {match.status === 'completed' && parseInt(p2Score) > parseInt(p1Score) && (
                           <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#BA995D] rounded-full flex items-center justify-center text-white border-2 border-white"><FaCheckCircle className="text-[6px]" /></div>
                        )}
                    </div>
                    <div className={`text-[7.5px] font-black truncate uppercase tracking-tight ${isMyMatch ? 'text-[#132F45]' : 'text-gray-400'}`}>{match.awayTeam}</div>
                </div>
            </div>
 
            <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-gray-50 mt-1">
                <div className="flex items-center gap-1 bg-[#FAFAFA] p-1.5 rounded-lg border border-gray-100 min-w-0">
                    <FaCalendarAlt className="text-[#BA995D] text-[9px] flex-shrink-0" />
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[6px] font-black text-gray-400 uppercase tracking-widest leading-none">Date</span>
                        <span className="text-[7px] font-black text-[#132F45] truncate">{formatDateDisplay(match.date)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-1 bg-[#FAFAFA] p-1.5 rounded-lg border border-gray-100 min-w-0">
                    <FaClock className="text-[#BA995D] text-[9px] flex-shrink-0" />
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[6px] font-black text-gray-400 uppercase tracking-widest leading-none">Time</span>
                        <span className="text-[7px] font-black text-[#132F45] truncate">{match.startTime}</span>
                    </div>
                </div>
            </div>

            {canAddResult && (
                <div className="flex flex-col gap-2 pt-3">
                    <button
                        className="w-full py-2 bg-[#132F45] text-white rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-[#1c4566] transition-all shadow-lg shadow-[#132F45]/20 flex items-center justify-center gap-2"
                        onClick={() => window.location.href = '/player/uploadscore'}
                    >
                        Add Result <FaChevronRight size={8} className="text-[#BA995D]" />
                    </button>
                    {league?.scheduling?.allowReschedule && (
                        <button
                            className="w-full py-2 bg-white text-[#132F45] border border-gray-100 rounded-lg text-[7px] font-black uppercase tracking-wider hover:bg-gray-50 hover:border-[#BA995D]/20 transition-all"
                            onClick={() => toast("Reschedule request: Contact your opponent or official league administrator.", { icon: "ℹ️" })}
                        >
                            Schedule Again
                        </button>
                    )}
                </div>
            )}
        </Card>
    );

    if (isCompleted) {
        return (
            <button type="button" onClick={() => onOpenDetails?.(match)} className="w-full text-left">
                {cardContent}
            </button>
        );
    }

    return cardContent;
};

// --- Sub-component: Booking Mini Card ---
const BookingMiniCard = ({ booking }) => {
    const statusColors = {
        pending: 'bg-[#FDF2D1] text-[#BA995D] border-[#BA995D]/20',
        confirmed: 'bg-green-50 text-green-700 border-green-100',
        cancelled: 'bg-red-50 text-red-700 border-red-100',
        completed: 'bg-blue-50 text-blue-700 border-blue-100',
    };

    const opponentName = booking.displayOpponent?.name || booking.opponent?.name || booking.opponentName || "TBD";

    return (
        <Card className="p-8 border border-gray-50 shadow-2xl shadow-[#132F45]/5 bg-white rounded-[2.5rem] flex flex-col gap-6 relative overflow-hidden outline outline-1 outline-[#FDF2D1]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#FAFAFA] rounded-bl-full -mr-8 -mt-8"></div>
            
            <div className="flex justify-between items-start relative z-10">
                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${statusColors[booking.status] || 'bg-gray-50'}`}>
                    {booking.status}
                </span>
                <div className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">
                    Log Entry
                </div>
            </div>

            <div className="flex items-center gap-5 relative z-10">
                <div className="h-14 w-14 rounded-2xl bg-[#132F45] flex items-center justify-center text-[#BA995D] font-black text-sm border-2 border-white shadow-xl shadow-[#132F45]/10">
                    VS
                </div>
                <div>
                    <div className="text-[10px] font-black text-[#132F45] uppercase tracking-[0.2em] mb-1">Rival Contender</div>
                    <div className="text-base font-black text-[#132F45] uppercase tracking-tight">{opponentName}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-50 relative z-10">
                <div className="flex items-center gap-3 text-[10px] font-black text-[#132F45] uppercase tracking-tighter">
                    <FaCalendarAlt className="text-[#BA995D]" /> {new Date(booking.bookingDate).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-3 text-[10px] font-black text-[#132F45] uppercase tracking-tighter">
                    <FaClock className="text-[#BA995D]" /> {booking.startTime}
                </div>
                <div className="flex items-center gap-3 text-[10px] font-black text-[#132F45] uppercase tracking-tighter col-span-2">
                    <FaMapMarkerAlt className="text-[#BA995D]" /> {booking.venue?.venueName || "Venue Site"}
                </div>
            </div>

            {booking.status === 'confirmed' && (
                <button
                    className="mt-2 w-full py-4 bg-[#132F45] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#1c4566] transition-all shadow-xl shadow-[#132F45]/10 border border-[#BA995D]/20"
                    onClick={() => window.location.href = '/player/uploadscore'}
                >
                    Finalize Outcome
                </button>
            )}
        </Card>
    );
};
