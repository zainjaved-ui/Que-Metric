import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Tab } from '@headlessui/react';
import { Trophy, Medal, TrendingUp, Award, Crown, Star, ChevronRight, Users, Target, Calendar, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaMedal, FaTrophy, FaChartLine } from 'react-icons/fa';
import apiClient from '../../contexts/apiClient';
import { AuthContext } from '../../contexts/AuthContext';
import { TournamentContext } from '../../contexts/TournamentContext';

const PlayerRankingsPage = () => {
  const { user } = useContext(AuthContext);
  const { getRankings, getRankingHistory } = useContext(TournamentContext);

  // Tournament Rankings State
  const [tournamentRankings, setTournamentRankings] = useState([]);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [selectedSport, setSelectedSport] = useState('snooker');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // League Standings State
  const [myLeagues, setMyLeagues] = useState([]);
  const [leagueStandings, setLeagueStandings] = useState({});
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState(null);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Toast helper
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // Fetch Tournament Rankings
  const fetchTournamentRankings = useCallback(async () => {
    setTournamentLoading(true);
    try {
      const result = await getRankings({ sport: selectedSport, limit: 100 });
      if (result.success) {
        setTournamentRankings(result.data.rankings || []);
      } else {
        showToast(result.error || 'Failed to load rankings', 'error');
      }
    } catch (error) {
      console.error('Error fetching tournament rankings:', error);
      showToast('Failed to load tournament rankings', 'error');
    } finally {
      setTournamentLoading(false);
    }
  }, [getRankings, selectedSport]);

  // Fetch Player Ranking History
  const fetchPlayerHistory = useCallback(async (playerId) => {
    if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
      setPlayerHistory([]);
      return;
    }

    setSelectedPlayer(playerId);
    setHistoryLoading(true);
    try {
      const result = await getRankingHistory(playerId, { sport: selectedSport });
      if (result.success) {
        setPlayerHistory(result.data.history || []);
      }
    } catch (error) {
      console.error('Error fetching player history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [getRankingHistory, selectedPlayer, selectedSport]);

  // Fetch Player's Leagues
  const fetchMyLeagues = useCallback(async () => {
    // League standings will be implemented later
    // For now, just initialize empty state
    setMyLeagues([]);
    setLeagueStandings({});
  }, []);

  // Load data on mount
  useEffect(() => {
    fetchTournamentRankings();
  }, [fetchTournamentRankings]);

  useEffect(() => {
    // fetchMyLeagues is not called for now
    // League standings functionality will be added later
  }, []);

  // Get rank badge styling
  const getRankBadge = (rank) => {
    if (rank === 1) return { bg: 'bg-gradient-to-br from-yellow-400 to-yellow-600', icon: '🥇', text: 'text-yellow-900' };
    if (rank === 2) return { bg: 'bg-gradient-to-br from-gray-300 to-gray-500', icon: '🥈', text: 'text-gray-900' };
    if (rank === 3) return { bg: 'bg-gradient-to-br from-orange-400 to-orange-600', icon: '🥉', text: 'text-orange-900' };
    return { bg: 'bg-gradient-to-br from-blue-500 to-blue-700', icon: '', text: 'text-white' };
  };

  const getTournamentCount = (player) => {
    return Number(player.tournamentsCount || player.tournamentWins?.length || 0);
  };

  // Highlight current user
  const isCurrentUser = (playerId) => {
    return user && user.playerId === playerId;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFBF4] to-[#F5F0E8] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gradient-to-br from-[#132F45] to-[#1a4259] rounded-2xl shadow-lg">
              <Trophy className="h-8 w-8 text-[#BA995D]" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-[#132F45] tracking-tight">
                Rankings
              </h1>
              <p className="text-lg text-[#132F45]/70 mt-1">
                Track your performance across tournaments and leagues
              </p>
            </div>
          </div>
        </motion.div>

        {/* Toast Notification */}
        <AnimatePresence>
          {toast.show && (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl ${
                toast.type === 'success'
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
              }`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <Tab.Group>
          <Tab.List className="flex space-x-2 rounded-2xl bg-white p-2 shadow-lg border border-[#132F45]/10 mb-6">
            <Tab
              className={({ selected }) =>
                `w-full rounded-xl py-3 px-6 text-sm font-bold leading-5 transition-all duration-200
                ${
                  selected
                    ? 'bg-gradient-to-r from-[#132F45] to-[#1a4259] text-white shadow-md'
                    : 'text-[#132F45] hover:bg-[#132F45]/5'
                }`
              }
            >
              <div className="flex items-center justify-center gap-2">
                <FaTrophy className="h-4 w-4" />
                <span>Tournament Rankings</span>
              </div>
            </Tab>
            <Tab
              className={({ selected }) =>
                `w-full rounded-xl py-3 px-6 text-sm font-bold leading-5 transition-all duration-200
                ${
                  selected
                    ? 'bg-gradient-to-r from-[#132F45] to-[#1a4259] text-white shadow-md'
                    : 'text-[#132F45] hover:bg-[#132F45]/5'
                }`
              }
            >
              <div className="flex items-center justify-center gap-2">
                <FaMedal className="h-4 w-4" />
                <span>League Standings</span>
              </div>
            </Tab>
          </Tab.List>

          <Tab.Panels>
            {/* Tournament Rankings Panel */}
            <Tab.Panel>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Sport Filter */}
                <div className="bg-white rounded-2xl shadow-lg border border-[#132F45]/10 p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-bold text-[#132F45]">Sport:</span>
                    <div className="flex gap-2">
                      {['snooker', 'pool', 'pooker'].map((sport) => (
                        <button
                          key={sport}
                          onClick={() => setSelectedSport(sport)}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                            selectedSport === sport
                              ? 'bg-gradient-to-r from-[#132F45] to-[#1a4259] text-white shadow-md'
                              : 'bg-[#132F45]/5 text-[#132F45] hover:bg-[#132F45]/10'
                          }`}
                        >
                          {sport.charAt(0).toUpperCase() + sport.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Rankings Table */}
                <div className="bg-white rounded-2xl shadow-lg border border-[#132F45]/10 overflow-hidden">
                  {tournamentLoading ? (
                    <div className="flex justify-center items-center py-20">
                      <div className="animate-spin h-12 w-12 border-4 border-[#132F45] border-t-transparent rounded-full" />
                    </div>
                  ) : tournamentRankings.length === 0 ? (
                    <div className="text-center py-20 px-4">
                      <Trophy className="h-16 w-16 text-[#132F45]/20 mx-auto mb-4" />
                      <p className="text-lg font-semibold text-[#132F45]/60">
                        No rankings available yet
                      </p>
                      <p className="text-sm text-[#132F45]/40 mt-2">
                        Complete tournaments to appear in the rankings
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gradient-to-r from-[#132F45] to-[#1a4259]">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-black text-white uppercase tracking-wider">
                              Rank
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-black text-white uppercase tracking-wider">
                              Player
                            </th>
                            <th className="px-6 py-4 text-right text-xs font-black text-white uppercase tracking-wider">
                              Points
                            </th>
                            <th className="px-6 py-4 text-right text-xs font-black text-white uppercase tracking-wider">
                              Tournaments
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-black text-white uppercase tracking-wider">
                              History
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#132F45]/10">
                          {tournamentRankings.map((player, index) => {
                            const badge = getRankBadge(player.rank || index + 1);
                            const isUser = isCurrentUser(player.playerId);

                            return (
                              <React.Fragment key={player.playerId}>
                                <motion.tr
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: index * 0.05 }}
                                  className={`transition-all ${
                                    selectedPlayer === player.playerId
                                      ? 'bg-blue-50'
                                      : isUser
                                      ? 'bg-[#BA995D]/10'
                                      : 'hover:bg-[#132F45]/5'
                                  }`}
                                >
                                  <td className="px-6 py-4">
                                    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${badge.bg} ${badge.text} font-black text-sm shadow-md`}>
                                      {badge.icon || (player.rank || index + 1)}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#132F45] to-[#1a4259] flex items-center justify-center text-white font-bold">
                                        {player.playerName?.charAt(0) || 'P'}
                                      </div>
                                      <div>
                                        <p className="font-bold text-[#132F45]">
                                          {player.playerName}
                                          {isUser && (
                                            <span className="ml-2 text-xs bg-[#BA995D] text-white px-2 py-1 rounded-full">
                                              You
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <span className="text-2xl font-black text-[#132F45]">
                                      {player.totalPoints || 0}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <span className="text-lg font-semibold text-[#132F45]/70">
                                      {getTournamentCount(player)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <button
                                      onClick={() => fetchPlayerHistory(player.playerId)}
                                      className="px-4 py-2 bg-[#132F45] text-white rounded-lg font-semibold hover:bg-[#1a4259] transition-all"
                                    >
                                      {selectedPlayer === player.playerId ? 'Hide' : 'View'}
                                    </button>
                                  </td>
                                </motion.tr>

                                {/* Player History Expanded Row */}
                                <AnimatePresence>
                                  {selectedPlayer === player.playerId && (
                                    <motion.tr
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                    >
                                      <td colSpan="5" className="px-6 py-4 bg-blue-50">
                                        {historyLoading ? (
                                          <div className="text-center py-4">
                                            <div className="animate-spin h-8 w-8 border-4 border-[#132F45] border-t-transparent rounded-full mx-auto" />
                                          </div>
                                        ) : playerHistory.length === 0 ? (
                                          <p className="text-center text-[#132F45]/60 py-4">
                                            No tournament history available
                                          </p>
                                        ) : (
                                          <div className="space-y-2">
                                            <h4 className="font-bold text-[#132F45] mb-3">
                                              Tournament History
                                            </h4>
                                            <div className="grid gap-2">
                                              {playerHistory.map((entry, idx) => (
                                                <div
                                                  key={idx}
                                                  className="flex items-center justify-between bg-white p-3 rounded-lg"
                                                >
                                                  <div>
                                                    <p className="font-semibold text-[#132F45]">
                                                      {entry.tournamentName || 'Tournament'}
                                                    </p>
                                                    <p className="text-sm text-[#132F45]/60">
                                                      {entry.tier ? entry.tier.charAt(0).toUpperCase() + entry.tier.slice(1) : 'N/A'}
                                                      {entry.finishingPosition && ` • ${entry.finishingPosition === 1 ? '🥇 1st' : entry.finishingPosition === 2 ? '🥈 2nd' : entry.finishingPosition === 3 ? '🥉 3rd' : `${entry.finishingPosition}th`}`}
                                                    </p>
                                                  </div>
                                                  <div className="text-right">
                                                    <p className="font-black text-[#BA995D] text-lg">
                                                      +{entry.pointsAwarded}
                                                    </p>
                                                    <p className="text-xs text-[#132F45]/60">
                                                      {entry.awardedDate ? new Date(entry.awardedDate).toLocaleDateString() : 'N/A'}
                                                    </p>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </td>
                                    </motion.tr>
                                  )}
                                </AnimatePresence>
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            </Tab.Panel>

            {/* League Standings Panel */}
            <Tab.Panel>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {leagueLoading ? (
                  <div className="bg-white rounded-2xl shadow-lg border border-[#132F45]/10 p-20">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin h-12 w-12 border-4 border-[#132F45] border-t-transparent rounded-full" />
                    </div>
                  </div>
                ) : myLeagues.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-lg border border-[#132F45]/10 p-20 text-center">
                    <Users className="h-16 w-16 text-[#132F45]/20 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-[#132F45]/60">
                      You're not enrolled in any leagues yet
                    </p>
                    <p className="text-sm text-[#132F45]/40 mt-2">
                      Join a league to see your standings
                    </p>
                  </div>
                ) : (
                  <>
                    {/* League Selector */}
                    <div className="bg-white rounded-2xl shadow-lg border border-[#132F45]/10 p-4">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-sm font-bold text-[#132F45]">Select League:</span>
                        <div className="flex gap-2 flex-wrap">
                          {myLeagues.map((league) => (
                            <button
                              key={league.id}
                              onClick={() => setSelectedLeague(league.id)}
                              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                selectedLeague === league.id
                                  ? 'bg-gradient-to-r from-[#132F45] to-[#1a4259] text-white shadow-md'
                                  : 'bg-[#132F45]/5 text-[#132F45] hover:bg-[#132F45]/10'
                              }`}
                            >
                              {league.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Standings Table */}
                    {selectedLeague && leagueStandings[selectedLeague] && (
                      <div className="bg-white rounded-2xl shadow-lg border border-[#132F45]/10 overflow-hidden">
                        <div className="bg-gradient-to-r from-[#132F45] to-[#1a4259] p-6">
                          <h3 className="text-xl font-black text-white">
                            {myLeagues.find(l => l.id === selectedLeague)?.name} Standings
                          </h3>
                        </div>

                        {leagueStandings[selectedLeague].standings.length === 0 ? (
                          <div className="text-center py-20 px-4">
                            <Target className="h-16 w-16 text-[#132F45]/20 mx-auto mb-4" />
                            <p className="text-lg font-semibold text-[#132F45]/60">
                              No standings available yet
                            </p>
                            <p className="text-sm text-[#132F45]/40 mt-2">
                              Standings will update as matches are played
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-[#132F45]/5">
                                <tr>
                                  <th className="px-6 py-4 text-left text-xs font-black text-[#132F45] uppercase tracking-wider">
                                    Position
                                  </th>
                                  <th className="px-6 py-4 text-left text-xs font-black text-[#132F45] uppercase tracking-wider">
                                    Player
                                  </th>
                                  <th className="px-6 py-4 text-center text-xs font-black text-[#132F45] uppercase tracking-wider">
                                    Played
                                  </th>
                                  <th className="px-6 py-4 text-center text-xs font-black text-[#132F45] uppercase tracking-wider">
                                    Won
                                  </th>
                                  <th className="px-6 py-4 text-center text-xs font-black text-[#132F45] uppercase tracking-wider">
                                    Lost
                                  </th>
                                  <th className="px-6 py-4 text-center text-xs font-black text-[#132F45] uppercase tracking-wider">
                                    Points
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#132F45]/10">
                                {leagueStandings[selectedLeague].standings.map((standing, index) => {
                                  const badge = getRankBadge(standing.position || index + 1);
                                  const isUser = standing.playerName === user?.name || standing.playerId === user?.playerId;

                                  return (
                                    <motion.tr
                                      key={standing.playerId}
                                      initial={{ opacity: 0, x: -20 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: index * 0.05 }}
                                      className={`transition-all ${
                                        isUser ? 'bg-[#BA995D]/10' : 'hover:bg-[#132F45]/5'
                                      }`}
                                    >
                                      <td className="px-6 py-4">
                                        <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${badge.bg} ${badge.text} font-black text-sm shadow-md`}>
                                          {badge.icon || (standing.position || index + 1)}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#132F45] to-[#1a4259] flex items-center justify-center text-white font-bold">
                                            {standing.playerName?.charAt(0) || 'P'}
                                          </div>
                                          <div>
                                            <p className="font-bold text-[#132F45]">
                                              {standing.playerName}
                                              {isUser && (
                                                <span className="ml-2 text-xs bg-[#BA995D] text-white px-2 py-1 rounded-full">
                                                  You
                                                </span>
                                              )}
                                            </p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                        <span className="font-semibold text-[#132F45]">
                                          {standing.matchesPlayed || 0}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                        <span className="font-semibold text-green-600">
                                          {standing.wins || 0}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                        <span className="font-semibold text-red-600">
                                          {standing.losses || 0}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                        <span className="text-2xl font-black text-[#132F45]">
                                          {standing.points || 0}
                                        </span>
                                      </td>
                                    </motion.tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  );
};

export default PlayerRankingsPage;
