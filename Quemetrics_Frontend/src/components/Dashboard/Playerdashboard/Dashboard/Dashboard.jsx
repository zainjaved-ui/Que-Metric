import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FaTrophy, FaCalendarAlt, FaChartLine, FaBullseye, FaCircle,
  FaDice, FaArrowRight, FaExclamationTriangle, FaStar, FaBolt, FaChartBar
} from 'react-icons/fa';
import { usePlayer } from '../../../../contexts/PlayerContext';
import Loader from '../../../../components/ui/Loader';
import StatsEngineModal from './Modals/StatsEngineModal';
import TournamentInvitations from '../TournamentInvitations';

// ─── Sport helpers ────────────────────────────────────────────────────────────
const SPORT_GRAD = {
  snooker: 'from-red-600 to-red-800',
  pool: 'from-[#BA995D] to-[#8c7144]',
  pooker: 'from-blue-600 to-indigo-800',
};

const SportIcon = ({ sport, className = 'w-4 h-4' }) => {
  if (sport === 'snooker') return <FaBullseye className={className} />;
  if (sport === 'pool') return <FaCircle className={className} />;
  return <FaDice className={className} />;
};

// ─── Section Header ───────────────────────────────────────────────────────────
const SectionHeader = ({ title, subtitle, linkTo, linkLabel }) => (
  <div className="flex items-center justify-between mb-4 px-1.5">
    <div>
      <h2 className="text-[9px] font-black text-[#132F45] uppercase tracking-[0.25em] flex items-center gap-2">
        <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> {title}
      </h2>
      {subtitle && <p className="text-[7px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
    </div>
    {linkTo && (
      <Link to={linkTo} className="group flex items-center gap-1.5 text-[8px] font-black text-[#BA995D] hover:text-[#132F45] transition-colors uppercase tracking-[0.15em]">
        {linkLabel} <FaArrowRight className="text-[6px] group-hover:translate-x-0.5 transition-transform" />
      </Link>
    )}
  </div>
);

// ─── Win Rate Bar ─────────────────────────────────────────────────────────────
const WinRateBar = ({ rate, label = 'Overall Win Rate' }) => (
  <div className="mt-3">
    <div className="flex justify-between items-center mb-1.5">
      <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      <span className="text-[11px] font-black text-[#132F45]">{(rate || 0).toFixed(0)}%</span>
    </div>
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-linear-to-r from-[#BA995D] to-[#8c7144] rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, rate || 0)}%` }}
      />
    </div>
  </div>
);

// ─── Stats Panel (Overall / Season) ──────────────────────────────────────────
const StatsPanel = ({ title, badge, stats, leagueNames, extra }) => {
  if (!stats) return null;
  const leagueWalkoverWins = stats.leagueWalkoverWins ?? stats.walkoverWins ?? 0;
  const leagueWalkoverLosses = stats.leagueWalkoverLosses ?? stats.walkoverLosses ?? 0;
  const leagueWalkoverMatches = stats.leagueWalkoverMatches ?? stats.leagueWalkovers ?? (leagueWalkoverWins + leagueWalkoverLosses);
  const overallWalkoverWins = stats.walkoverWins ?? leagueWalkoverWins ?? 0;
  const overallWalkoverLosses = stats.walkoverLosses ?? leagueWalkoverLosses ?? 0;
  const overallWalkoverMatches = stats.walkoverMatches ?? stats.walkovers ?? (overallWalkoverWins + overallWalkoverLosses);
  const excludedLeague = leagueWalkoverMatches + (stats.leagueByes || 0);
  const tournamentPlayed = stats.tournamentMatches || ((stats.tournamentWins || 0) + (stats.tournamentLosses || 0));
  const excludedOverall = (stats.walkoverExcluded || overallWalkoverMatches || 0) + (stats.byeExcluded || 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[9px] font-black text-[#BA995D] uppercase tracking-[0.2em]">{title}</p>
          {badge && <span className="text-[7px] font-black text-white bg-[#132F45] px-2 py-0.5 rounded-full uppercase tracking-widest">{badge}</span>}
        </div>
        {leagueNames && leagueNames.length > 0 && (
          <p className="text-[9px] font-black text-[#132F45] truncate">{leagueNames.join(', ')}</p>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: League Games */}
        <div>
          <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-2">League Games</p>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-3xl font-black text-[#132F45]">{stats.leagueMatches || 0}</span>
            <span className="text-[8px] font-bold text-gray-400">COMPETITIVE</span>
          </div>
          <div className="flex gap-2 text-[8px] font-black text-gray-400 uppercase tracking-wider mb-2">
            <span className="text-[#132F45]">{stats.leagueWins || 0} Wins</span>
            <span>·</span>
            <span>{stats.leagueLosses || 0} Losses</span>
          </div>
          {(leagueWalkoverWins > 0 || leagueWalkoverLosses > 0 || leagueWalkoverMatches > 0) && (
            <div className="space-y-0.5 text-[7px] font-black uppercase tracking-wider">
              <div className="flex items-center gap-2 text-gray-500">
                <span>Walkovers</span>
                <span className="text-[#132F45]">{leagueWalkoverMatches} Played</span>
              </div>
              <div className="flex gap-2">
                <span className="text-green-600">{leagueWalkoverWins}W</span>
                <span className="text-red-500">{leagueWalkoverLosses}L</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-[11px] font-black text-green-600">{stats.leagueWins || 0}W</span>
            <span className="text-[11px] font-black text-red-500">{stats.leagueLosses || 0}L</span>
          </div>
        </div>

        {/* Right: All Results */}
        <div>
          <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-2">Competitive Results</p>
          <p className="text-[7px] font-bold text-gray-400 mb-1.5">Bye results are excluded; walkovers are shown separately</p>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-3xl font-black text-[#132F45]">{stats.totalMatches || 0}</span>
            <span className="text-[8px] font-bold text-gray-400">MATCHES</span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[7.5px] font-black text-gray-400 uppercase tracking-wider mb-2">
            <span>{stats.leagueMatches || 0} League</span>
            {tournamentPlayed > 0 && (
              <span>· {tournamentPlayed} Tournament</span>
            )}
          </div>
          <div className="flex gap-1.5 items-center mb-1.5">
            <span className="text-[7px] font-black text-gray-400 uppercase">Record:</span>
            <span className="text-[13px] font-black text-green-600">{stats.totalWins || 0}W</span>
            <span className="text-[13px] font-black text-red-500">{stats.totalLosses || 0}L</span>
          </div>
          <div className="space-y-0.5">
            {(stats.leagueMatches || 0) > 0 && (
              <div className="flex justify-between text-[7.5px] font-bold text-gray-500">
                <span>League</span>
                <span className="font-black text-[#132F45]">{stats.leagueWins || 0}W {stats.leagueLosses || 0}L</span>
              </div>
            )}
            {(overallWalkoverWins > 0 || overallWalkoverLosses > 0 || overallWalkoverMatches > 0) && (
              <div className="flex justify-between text-[7.5px] font-bold text-gray-500">
                <span>Walkovers</span>
                <span className="font-black text-[#132F45]">{overallWalkoverWins}W {overallWalkoverLosses}L</span>
              </div>
            )}
            {tournamentPlayed > 0 && (
              <div className="flex justify-between text-[7.5px] font-bold text-gray-500">
                <span>Tournament</span>
                <span className="font-black text-[#132F45]">{stats.tournamentWins || 0}W {stats.tournamentLosses || 0}L</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="px-5 pb-4 grid grid-cols-4 gap-2 border-t border-gray-50 pt-4">
        <div className="text-center">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
            <FaChartBar className="text-[9px]" /> Frames
          </p>
          <p className="text-sm font-black text-[#132F45]">{stats.framesWon || 0}</p>
          <p className="text-[7.5px] text-gray-400 font-bold">/ {stats.framesConceded || 0}</p>
          <p className="text-[6.5px] text-gray-300 uppercase tracking-wider">Won / Conceded</p>
        </div>
        <div className="text-center">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
            <FaTrophy className="text-[9px]" /> Points
          </p>
          <p className="text-xl font-black text-[#132F45]">{stats.standingPoints || 0}</p>
          <p className="text-[6.5px] text-gray-300 uppercase tracking-wider">Standing Points</p>
        </div>
        <div className="text-center">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
            <FaStar className="text-[9px]" /> Whitewash
          </p>
          <p className="text-sm font-black text-[#132F45]">{stats.whitewashWins || 0}</p>
          <p className="text-[7.5px] text-gray-400 font-bold">/ {stats.whitewashLosses || 0}</p>
          <p className="text-[6.5px] text-gray-300 uppercase tracking-wider">Won / Conceded</p>
        </div>
        <div className="text-center">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
            <FaBullseye className="text-[9px]" /> Best Break
          </p>
          <p className="text-xl font-black text-[#132F45]">{stats.highestBreak || 0}</p>
          <p className="text-[6.5px] text-gray-300 uppercase tracking-wider">Highest</p>
        </div>
      </div>


      {/* Win Rate bar */}
      <div className="px-5 pb-5">
        <WinRateBar rate={stats.winRate || 0} label={extra?.rateLabel || 'Overall Win Rate'} />
      </div>
    </div>
  );
};

// ─── Break Statistics Card ────────────────────────────────────────────────────
const BreakStatsCard = ({ breakStats }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-full flex flex-col">
    <p className="text-[9px] font-black text-[#BA995D] uppercase tracking-[0.2em] mb-4">Break Statistics</p>

    <div className="space-y-3 mb-4 flex-1">
      <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
        <div>
          <p className="text-[10px] font-black text-[#132F45] uppercase">Century Breaks</p>
          <p className="text-[7px] font-bold text-gray-400">100+ points</p>
        </div>
        <span className="text-2xl font-black text-[#132F45]">{breakStats?.centuryBreaks || 0}</span>
      </div>

      <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
        <div>
          <p className="text-[10px] font-black text-[#132F45] uppercase">Half Centuries</p>
          <p className="text-[7px] font-bold text-gray-400">50-99 points</p>
        </div>
        <span className="text-2xl font-black text-[#132F45]">{breakStats?.halfCenturies || 0}</span>
      </div>
    </div>

    <div className="bg-[#BA995D] rounded-2xl p-4 text-white">
      <p className="text-[8px] font-black uppercase tracking-widest mb-1 opacity-70">Personal Best</p>
      <div className="flex items-center justify-between">
        <p className="text-4xl font-black leading-none">{breakStats?.personalBest || 0}</p>
        <FaBolt className="text-white/30 text-3xl" />
      </div>
    </div>
  </div>
);

// ─── Performance Trend ────────────────────────────────────────────────────────
const PerformanceTrend = ({ trend }) => {
  const { last10 = [], avgFramesPerMatch = 0 } = trend || {};

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-[9px] font-black text-[#BA995D] uppercase tracking-[0.2em] mb-4">Performance Trend</p>

      <div className="mb-4">
        <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-3">Win Rate by Match Period</p>
        {last10.length > 0 ? (
          <div className="flex items-end gap-1.5 h-16">
            {last10.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div
                  className={`w-full rounded-sm ${m.result === 'win' ? 'bg-green-400' : 'bg-red-400'}`}
                  style={{ height: m.result === 'win' ? '64px' : '26px' }}
                  title={`${m.result === 'win' ? 'W' : 'L'} vs ${m.opponent} (${m.score})`}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="h-16 flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">No match data yet</p>
          </div>
        )}
        {last10.length > 0 && (
          <div className="flex justify-between mt-1">
            <span className="text-[6.5px] text-gray-300 font-bold uppercase">Older</span>
            <span className="text-[6.5px] text-gray-300 font-bold uppercase">Recent</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-3 bg-[#132F45]/5 rounded-xl">
        <p className="text-[8px] font-black text-[#132F45] uppercase tracking-wider">Avg Frames per Match</p>
        <p className="text-xl font-black text-[#BA995D]">{(avgFramesPerMatch || 0).toFixed(2)}</p>
      </div>
    </div>
  );
};

// ─── Head-to-Head Card ────────────────────────────────────────────────────────
const HeadToHeadCard = ({ headToHead = [] }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
    <p className="text-[9px] font-black text-[#BA995D] uppercase tracking-[0.2em] mb-4">Head-to-Head Records</p>
    {headToHead.length > 0 ? (
      <div className="space-y-2">
        {headToHead.slice(0, 6).map((h, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-[#FDF2D1]/30 transition-colors">
            <div className="w-7 h-7 rounded-full bg-[#132F45] flex items-center justify-center text-white text-[9px] font-black shrink-0">
              {(h.opponent?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-[#132F45] truncate">{h.opponent?.name || 'Unknown'}</p>
              <p className="text-[7.5px] font-bold text-gray-400">{h.played} Matches Played</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-[#132F45]">{h.wins}/{h.played} &ndash; {(h.winRate || 0).toFixed(0)}%</p>
              <p className="text-[7px] font-black">
                <span className="text-green-500">{h.wins}W</span>{' '}
                <span className="text-red-500">{h.losses}L</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="h-32 flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">No match history</p>
      </div>
    )}
  </div>
);

// ─── Recent Matches Card ──────────────────────────────────────────────────────
const RecentMatchesCard = ({ recentMatches = [], recentWalkovers = [] }) => {
  // Merge and sort by date: competitive matches first, then show walkover badge
  const allEntries = [
    ...recentMatches.map(m => ({ ...m, isWalkover: false }))
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 6);

  const sportLabel = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[9px] font-black text-[#BA995D] uppercase tracking-[0.2em]">Recent Matches</p>
        <Link to="/player/results" className="text-[7.5px] font-black text-[#132F45] hover:text-[#BA995D] transition-colors uppercase tracking-widest flex items-center gap-1">
          View All <FaArrowRight className="text-[6px]" />
        </Link>
      </div>
      {allEntries.length > 0 ? (
        <div className="space-y-2">
          {allEntries.map((m, i) => (
            <div key={m.id || i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-[#FDF2D1]/20 transition-colors">
              <span className={`shrink-0 px-2 py-0.5 rounded text-[7px] font-black uppercase ${m.isWalkover ? 'bg-gray-100 text-gray-500' :
                  m.result === 'win' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}>
                {m.isWalkover ? 'W/O' : m.result === 'win' ? 'Won' : 'Lost'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-[#132F45] truncate">vs {m.opponent}</p>
                <p className="text-[7.5px] font-bold text-gray-400">
                  {sportLabel(m.sport)}{m.contextName ? ` · ${m.contextName}` : ''}
                  {m.date ? ` · ${new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}` : ''}
                </p>
              </div>
              <span className={`text-[9px] font-black ${m.isWalkover ? 'text-gray-400' :
                  m.result === 'win' ? 'text-green-600' : 'text-red-500'
                }`}>
                {m.score || (m.isWalkover ? 'W/O' : '-')}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">No recent matches</p>
        </div>
      )}
    </div>
  );
};

// ─── Upcoming Bookings Card ───────────────────────────────────────────────────
const UpcomingBookingsCard = ({ bookings = [] }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
    <div className="flex items-center justify-between mb-4">
      <p className="text-[9px] font-black text-[#BA995D] uppercase tracking-[0.2em]">Upcoming Bookings</p>
      <Link to="/player/mybookings" className="text-[7.5px] font-black text-[#132F45] hover:text-[#BA995D] transition-colors uppercase tracking-widest flex items-center gap-1">
        View All <FaArrowRight className="text-[6px]" />
      </Link>
    </div>
    {bookings.length > 0 ? (
      <div className="space-y-2">
        {bookings.map((b, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#FDF2D1]/30 border border-[#F4E5BB]">
            <div className="w-9 h-9 rounded-xl bg-[#132F45] flex items-center justify-center text-white shrink-0">
              <FaCalendarAlt className="text-[12px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-[#132F45] truncate">vs {b.opponent}</p>
              <p className="text-[7.5px] font-bold text-gray-500">
                {b.date ? new Date(b.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBD'}
                {b.startTime ? ` \u00B7 ${b.startTime}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-black text-[#132F45]">{b.tableName}</p>
              <span className={`text-[6.5px] font-black uppercase ${b.status === 'confirmed' ? 'text-green-600' : 'text-amber-600'}`}>
                {b.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="h-32 flex flex-col items-center justify-center gap-2">
        <FaCalendarAlt className="text-gray-200 text-2xl" />
        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">No upcoming bookings</p>
        <p className="text-[7px] text-gray-300">Your upcoming bookings will appear here</p>
      </div>
    )}
  </div>
);

// ─── Streak Banner ────────────────────────────────────────────────────────────
const StreakBanner = ({ streak }) => {
  if (!streak || streak.type === 'none' || streak.count === 0) return null;
  const isWin = streak.type === 'win';
  return (
    <div className={`rounded-2xl p-4 flex items-center gap-4 shadow-lg ${isWin ? 'bg-green-500' : 'bg-red-500'}`}>
      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
        <FaBolt className="text-white text-lg" />
      </div>
      <div>
        <p className="text-[7.5px] font-black text-white/70 uppercase tracking-[0.2em]">Current Streak</p>
        <p className="text-xl font-black text-white leading-none">
          {streak.count} {streak.type === 'win' ? (streak.count === 1 ? 'Win' : 'Wins') : (streak.count === 1 ? 'Loss' : 'Losses')}
        </p>
      </div>
    </div>
  );
};

// ─── League row ───────────────────────────────────────────────────────────────
const LeagueRow = ({ league, rank }) => {
  const grad = SPORT_GRAD[(league.sport || '').toLowerCase()] || 'from-[#132F45] to-[#1A3F5C]';
  return (
    <Link to="/player/leagues">
      <div className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-lg transition-all duration-500 group">
        <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${grad} flex items-center justify-center text-white shrink-0 shadow-lg group-hover:scale-105 transition-transform`}>
          <SportIcon sport={(league.sport || '').toLowerCase()} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black text-[#132F45] uppercase truncate group-hover:text-[#BA995D] transition-colors">{league.name}</p>
          <p className="text-[8px] font-black text-gray-400 mt-0.5 uppercase tracking-widest leading-none">{league.sport} \u00B7 {league.status}</p>
        </div>
        {rank && (
          <div className="flex flex-col items-end">
            <p className="text-[11px] font-black text-[#132F45]">#{rank}</p>
            <p className="text-[6.5px] font-black text-gray-300 uppercase">Rank</p>
          </div>
        )}
      </div>
    </Link>
  );
};

const TOURNAMENT_STATUS_STYLES = {
  registration: 'bg-blue-50 text-blue-700 border-blue-100',
  registration_closed: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  pending: 'bg-slate-50 text-slate-700 border-slate-100',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-100',
  fixtures_generated: 'bg-purple-50 text-purple-700 border-purple-100',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-100',
};

const TournamentRow = ({ entry }) => {
  const tournament = entry?.tournament || entry || {};
  const sport = String(tournament.sport || '').toLowerCase();
  const grad = SPORT_GRAD[sport] || 'from-[#132F45] to-[#1A3F5C]';
  const status = String(tournament.status || entry?.status || 'pending').toLowerCase();

  return (
    <Link to={tournament.id ? `/player/my-tournaments?details=${tournament.id}` : '/player/my-tournaments'}>
      <div className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-gray-50 bg-white hover:border-[#FDF2D1] hover:shadow-lg transition-all duration-500 group">
        <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${grad} flex items-center justify-center text-white shrink-0 shadow-lg group-hover:scale-105 transition-transform`}>
          <FaTrophy className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black text-[#132F45] uppercase truncate group-hover:text-[#BA995D] transition-colors">{tournament.name || 'Tournament'}</p>
          <p className="text-[8px] font-black text-gray-400 mt-0.5 uppercase tracking-widest leading-none">{sport || 'N/A'}</p>
        </div>
        <span className={`px-2 py-1 rounded-lg border text-[7px] font-black uppercase tracking-widest ${TOURNAMENT_STATUS_STYLES[status] || 'bg-slate-50 text-slate-700 border-slate-100'}`}>
          {status.replace(/_/g, ' ')}
        </span>
      </div>
    </Link>
  );
};

const MatchRow = ({ match }) => {
  const p2 = match.opponent?.name || 'TBA';
  const dateStr = match.date ? new Date(match.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBA';
  const timeStr = match.startTime || 'TBA';

  const isConfirmed = !!match.date && match.startTime !== 'TBA';

  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-[#FDF2D1]/20 border border-[#FDF2D1]">
      <div className="min-w-0">
        <p className="text-[11px] font-black text-[#132F45] uppercase truncate">You vs {p2}</p>
        <p className="text-[8px] font-black text-gray-400 mt-1 uppercase tracking-widest leading-none">
          {dateStr === 'TBA' ? 'TBA' : `${dateStr} \u00B7 ${timeStr}`}
        </p>
      </div>
      {isConfirmed ? (
        <Link to="/player/uploadscore" className="text-[8px] font-black bg-[#132F45] text-white px-4 py-2 rounded-xl uppercase tracking-widest hover:bg-[#1c4566] transition-all">Report</Link>
      ) : (
        <span title="Booking not confirmed yet" className="text-[8px] font-black bg-gray-300 text-gray-500 px-4 py-2 rounded-xl uppercase tracking-widest cursor-not-allowed select-none">Report</span>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PlayerDashboard() {
  const {
    player,
    loading: playerLoading,
    getProfile,
    getDashboardOverview,
    getDashboardStats,
    getFilteredStats,
    getPlayerTournaments,
    getStatsEngineData
  } = usePlayer();

  // ── Stats Engine unlock gating (requires 10 played matches) ───────────────
  const STATS_ENGINE_REQUIRED = 10;
  const [statsEngineCount, setStatsEngineCount] = useState(0);
  const statsEngineUnlocked = statsEngineCount >= STATS_ENGINE_REQUIRED;
  const statsEngineRemaining = Math.max(0, STATS_ENGINE_REQUIRED - statsEngineCount);

  // ── Existing filter state (preserved) ────────────────────────────────────
  const [leagueFilter, setLeagueFilter] = useState('both');
  const [gameFilter, setGameFilter] = useState('all');

  // ── Existing data ─────────────────────────────────────────────────────────
  const [myLeagues, setMyLeagues] = useState([]);
  const [myTournaments, setMyTournaments] = useState([]);
  const [myLeagueRanks, setMyLeagueRanks] = useState({});
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [filteredStats, setFilteredStats] = useState(null);
  const [_loadingStats, setLoadingStats] = useState(false);

  // ── New comprehensive stats ───────────────────────────────────────────────
  const [dashStats, setDashStats] = useState(null);
  const [loadingDashStats, setLoadingDashStats] = useState(true);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

  useEffect(() => { if (!player) getProfile(); }, [player, getProfile]);

  // Count of qualifying matches for the Stats Engine (same data the feature
  // analyzes: last up-to-10 confirmed competitive matches, byes/walkovers
  // excluded). `data` is null when the player has 0 qualifying matches.
  // Ref-guarded so it fetches once per player (PlayerContext does not
  // memoize its functions, so it can't be a stable effect dependency).
  const statsEngineFetchedFor = React.useRef(null);
  useEffect(() => {
    if (!player?.id) return;
    if (statsEngineFetchedFor.current === player.id) return;
    statsEngineFetchedFor.current = player.id;
    let cancelled = false;
    (async () => {
      try {
        const res = await getStatsEngineData();
        if (cancelled) return;
        const count = res?.data ? (res.data.history?.length || 0) : 0;
        setStatsEngineCount(count);
      } catch {
        if (!cancelled) setStatsEngineCount(0);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  const loadMyData = useCallback(async () => {
    if (!player) return;
    setLoadingLeagues(true);
    try {
      const [overviewRes, tournamentsRes] = await Promise.all([
        getDashboardOverview(),
        getPlayerTournaments(),
      ]);

      if (overviewRes?.success && overviewRes?.data) {
        const { leagues, upcomingFixtures } = overviewRes.data;
        setMyLeagues(leagues || []);
        const rankMap = {};
        (leagues || []).forEach(l => { if (l.playerRank) rankMap[l.id] = l.playerRank; });
        setMyLeagueRanks(rankMap);
        setUpcomingMatches(
          (upcomingFixtures || [])
            .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
            .slice(0, 5)
        );
      }

      if (tournamentsRes?.success) {
        const tournaments = Array.isArray(tournamentsRes?.data) ? tournamentsRes.data : [];
        setMyTournaments(tournaments.filter(row => {
          const s = String(row?.status || '').toLowerCase();
          return s !== 'withdrawn' && s !== 'rejected';
        }));
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load league data:', err);
    } finally {
      setLoadingLeagues(false);
    }
  }, [player]);

  const loadFilteredStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await getFilteredStats(leagueFilter, gameFilter);
      if (res?.success) setFilteredStats(res.data);
    } catch (err) {
      console.error('[Dashboard] Failed to load filtered stats:', err);
      setFilteredStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, [leagueFilter, gameFilter]);

  const loadDashStats = useCallback(async () => {
    setLoadingDashStats(true);
    try {
      const res = await getDashboardStats(leagueFilter, gameFilter);
      if (res?.success) setDashStats(res.data);
    } catch (err) {
      console.error('[Dashboard] Failed to load dashboard stats:', err);
    } finally {
      setLoadingDashStats(false);
    }
  }, [leagueFilter, gameFilter]);

  useEffect(() => { loadMyData(); }, [loadMyData]);
  useEffect(() => { loadFilteredStats(); }, [loadFilteredStats]);
  useEffect(() => { loadDashStats(); }, [loadDashStats]);

  // ── Derived display values (filter logic preserved) ───────────────────────
  const displayedLeagues = useMemo(() => {
    if (leagueFilter === 'tournament') return [];
    let leagues = filteredStats?.leagues?.length ? filteredStats.leagues : myLeagues;
    if (gameFilter !== 'all') leagues = leagues.filter(l => String(l.sport || '').toLowerCase() === gameFilter.toLowerCase());
    return leagues;
  }, [myLeagues, filteredStats, leagueFilter, gameFilter]);

  const displayedTournaments = useMemo(() => {
    if (leagueFilter === 'league') return [];
    let tournaments = filteredStats?.tournaments?.length ? filteredStats.tournaments : myTournaments;
    if (gameFilter !== 'all') tournaments = tournaments.filter(e => String(e?.tournament?.sport || '').toLowerCase() === gameFilter.toLowerCase());
    return tournaments;
  }, [myTournaments, filteredStats, leagueFilter, gameFilter]);

  const displayedUpcomingMatches = useMemo(() => {
    let filtered = upcomingMatches;
    if (leagueFilter === 'tournament') filtered = filtered.filter(m => m.tournamentId);
    else if (leagueFilter === 'league') filtered = filtered.filter(m => m.leagueId && !m.tournamentId);
    if (gameFilter !== 'all') filtered = filtered.filter(m => String(m.sport || '').toLowerCase() === gameFilter.toLowerCase());
    return filtered;
  }, [upcomingMatches, leagueFilter, gameFilter]);

  if (playerLoading) return <Loader text="Loading Dashboard..." />;
  if (loadingLeagues) return <Loader text="Loading your leagues..." />;

  const overallStatsForPanel = dashStats?.overallStats || null;
  const seasonStatsRaw = dashStats?.seasonStats || null;
  const seasonStatsForPanel = seasonStatsRaw ? {
    leagueMatches: seasonStatsRaw.leagueMatches || 0,
    leagueWins: seasonStatsRaw.leagueWins || 0,
    leagueLosses: seasonStatsRaw.leagueLosses || 0,
    leagueWalkovers: seasonStatsRaw.leagueWalkovers || 0,
    leagueByes: seasonStatsRaw.leagueByes || 0,
    tournamentMatches: seasonStatsRaw.tournamentMatches || 0,
    tournamentWins: seasonStatsRaw.tournamentWins || 0,
    tournamentLosses: seasonStatsRaw.tournamentLosses || 0,
    totalMatches: seasonStatsRaw.totalMatches || 0,
    totalWins: seasonStatsRaw.totalWins || 0,
    totalLosses: seasonStatsRaw.totalLosses || 0,
    walkovers: seasonStatsRaw.walkovers || 0,
    walkoverWins: seasonStatsRaw.walkoverWins || 0,
    walkoverLosses: seasonStatsRaw.walkoverLosses || 0,
    byeExcluded: seasonStatsRaw.byeExcluded || 0,
    walkoverExcluded: seasonStatsRaw.walkoverExcluded || 0,
    framesWon: seasonStatsRaw.framesWon || 0,
    framesConceded: seasonStatsRaw.framesConceded || 0,
    pointsWon: seasonStatsRaw.pointsWon || 0,
    pointsConceded: seasonStatsRaw.pointsConceded || 0,
    whitewashWins: seasonStatsRaw.whitewashWins || 0,
    whitewashLosses: seasonStatsRaw.whitewashLosses || 0,
    highestBreak: seasonStatsRaw.highestBreak || 0,
    standingPoints: seasonStatsRaw.standingPoints || 0,
    winRate: seasonStatsRaw.winRate || 0
  } : null;

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-10 flex flex-col gap-8">

        {/* Header */}
        <div className="bg-[#132F45] rounded-3xl p-8 lg:p-10 text-white relative overflow-hidden shadow-2xl shadow-[#132F45]/20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#BA995D]/5 rounded-bl-full -mr-32 -mt-32 pointer-events-none" />
          <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none mb-1">
            My Dashboard
          </h1>
          <p className="text-white/40 font-bold text-sm mt-1">
            Welcome back, {player?.name || 'Player'}
          </p>
        </div>

        {/* New Feature Banner */}
        <div className="flex items-center justify-between bg-[#FDF2D1]/70 border border-[#F4E5BB] rounded-2xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#BA995D]/20 flex items-center justify-center shrink-0">
              <FaChartLine className="text-[#BA995D] text-sm" />
            </div>
            <div>
              <p className="text-[8px] font-black text-[#BA995D] uppercase tracking-[0.2em] flex items-center gap-1.5 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#BA995D] animate-pulse" /> New Feature
              </p>
              <p className="text-[11px] font-black text-[#132F45] mb-0.5">Stats Engine</p>
              <p className="text-[7.5px] text-gray-500 max-w-xs leading-relaxed">
                Track your performance across your last 10 matches &ndash; win rate, form trends, best/worst matches, and more!
              </p>
            </div>
          </div>
          {statsEngineUnlocked ? (
            <button
              onClick={() => setIsStatsModalOpen(true)}
              className="shrink-0 text-[8px] font-black bg-[#132F45] text-white px-4 py-2 rounded-xl uppercase tracking-widest hover:bg-[#1c4566] transition-all ml-4 cursor-pointer"
            >
              View
            </button>
          ) : (
            <div className="shrink-0 ml-4 w-44 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[7px] font-black text-[#BA995D] uppercase tracking-[0.18em]">
                  Progress
                </span>
                <span className="text-[8px] font-black text-[#132F45]">
                  {statsEngineCount}/{STATS_ENGINE_REQUIRED}
                </span>
              </div>
              <div className="h-1.5 w-full bg-[#BA995D]/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#BA995D] rounded-full transition-all duration-500"
                  style={{ width: `${(statsEngineCount / STATS_ENGINE_REQUIRED) * 100}%` }}
                />
              </div>
              <span className="text-[7px] font-bold text-gray-500 uppercase tracking-wider">
                {statsEngineRemaining} more match{statsEngineRemaining === 1 ? '' : 'es'} to unlock
              </span>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title={`Play ${statsEngineRemaining} more match${statsEngineRemaining === 1 ? '' : 'es'} to unlock the Stats Engine`}
                className="text-[8px] font-black bg-gray-200 text-gray-400 px-4 py-1.5 rounded-xl uppercase tracking-widest cursor-not-allowed"
              >
                🔒 Locked
              </button>
            </div>
          )}
        </div>

        {/* Streak Banner */}
        {dashStats?.streak && <StreakBanner streak={dashStats.streak} />}

        {/* Tournament Invitations */}
        <TournamentInvitations />

        {/* Filters (preserved) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
          <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#132F45] mb-4 flex items-center gap-2">
            <div className="w-0.5 h-2.5 bg-[#BA995D] rounded-full" /> Leagues & Tournaments Stats
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>

              <select
                value={leagueFilter}
                onChange={e => setLeagueFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[11px] font-bold text-[#132F45] bg-white hover:border-[#BA995D] transition-colors"
              >
                <option value="both">Both (Leagues &amp; Tournaments)</option>
                <option value="league">Leagues Only</option>
                <option value="tournament">Tournaments Only</option>
              </select>
            </div>






            <div>

              <select
                value={gameFilter}
                onChange={e => setGameFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[11px] font-bold text-[#132F45] bg-white hover:border-[#BA995D] transition-colors"
              >
                <option value="all">All Games</option>
                <option value="snooker">Snooker</option>
                <option value="pool">Pool</option>
                <option value="pooker">Pooker</option>
              </select>
            </div>
          </div>
        </div>

        {/* Overall Player Statistics + Season Stats + Break Stats */}
        {loadingDashStats ? (
          <div className="text-center py-12 text-gray-400 text-[9px] font-bold uppercase tracking-widest">Loading statistics...</div>
        ) : (
          <>
            {/* Overall Stats */}
            <div className="space-y-3">
              <SectionHeader title="All Time Stats" subtitle="" />
              {overallStatsForPanel ? (
                <StatsPanel
                  title="All Time Stats"
                  stats={overallStatsForPanel}
                  extra={{ rateLabel: 'Overall All-Time Win Rate' }}
                />
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                  <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">No match history found</p>
                </div>
              )}
            </div>

            {/* Season Stats + Break Statistics */}
            <div className="space-y-3">
              <SectionHeader
                title={seasonStatsRaw?.leagueNames?.length > 0 ? "Season Stats" : seasonStatsRaw?.tournamentNames?.length > 0 ? "Active Tournaments" : "Current Competitions"}
                subtitle={seasonStatsRaw
                  ? ``
                  : ''
                }
              />
              <div className="grid lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                  {seasonStatsForPanel ? (
                    <StatsPanel
                      title={seasonStatsRaw?.leagueNames?.length > 0 ? "Season Stats" : seasonStatsRaw?.tournamentNames?.length > 0 ? "Active Tournaments" : "Current Competitions"}
                      stats={seasonStatsForPanel}
                      extra={{ rateLabel: 'Overall Season Win Rate' }}
                    />
                  ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex items-center justify-center h-full min-h-48">
                      <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">No active competitions found</p>
                    </div>
                  )}
                </div>
                <BreakStatsCard breakStats={dashStats?.breakStats} />
              </div>
            </div>

            {/* Performance Trend + Head-to-Head */}
            <div className="grid lg:grid-cols-2 gap-5">
              <PerformanceTrend trend={dashStats?.performanceTrend} />
              <HeadToHeadCard headToHead={dashStats?.headToHead} />
            </div>

            {/* Upcoming Bookings + Recent Matches */}
            <div className="grid lg:grid-cols-2 gap-5">
              <UpcomingBookingsCard bookings={dashStats?.upcomingBookings} />
              <RecentMatchesCard recentMatches={dashStats?.recentMatches} recentWalkovers={dashStats?.recentWalkovers} />
            </div>
          </>
        )}

        {/* Filtered Leagues & Upcoming Fixtures (filter-dependent) */}
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <SectionHeader title="Up Next" subtitle="Scheduled fixtures" linkTo="/player/leagues" linkLabel="View All" />
            <div className="space-y-3">
              {displayedUpcomingMatches.length > 0
                ? displayedUpcomingMatches.map(m => <MatchRow key={m.id} match={m} />)
                : <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-gray-100 text-gray-400 text-[9px] font-black uppercase tracking-widest">No matches</div>}
            </div>
          </div>

          <div className="space-y-8">
            {(leagueFilter === 'both' || leagueFilter === 'league') && (
              <div className="space-y-4">
                <SectionHeader title="Active Leagues" subtitle="Your standings" linkTo="/player/leagues" linkLabel="View All" />
                <div className="space-y-3">
                  {displayedLeagues.length > 0
                    ? displayedLeagues.slice(0, 3).map(l => <LeagueRow key={l.id} league={l} rank={myLeagueRanks[l.id]} />)
                    : <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-gray-100 text-gray-400 text-[9px] font-black uppercase tracking-widest">No leagues</div>}
                </div>
              </div>
            )}

            {(leagueFilter === 'both' || leagueFilter === 'tournament') && (
              <div className="space-y-4">
                <SectionHeader title="Active Tournaments" subtitle="Your tournament progress" linkTo="/player/my-tournaments" linkLabel="View All" />
                <div className="space-y-3">
                  {displayedTournaments.length > 0
                    ? displayedTournaments.slice(0, 3).map(t => <TournamentRow key={t.id || t.tournament?.id} entry={t} />)
                    : <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-gray-100 text-gray-400 text-[9px] font-black uppercase tracking-widest">No tournaments</div>}
                </div>
              </div>
            )}
          </div>
        </div>

        <StatsEngineModal
          isOpen={isStatsModalOpen}
          onClose={() => setIsStatsModalOpen(false)}
        />

      </div>
    </div>
  );
}
