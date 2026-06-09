import { AuthContext } from '../../../../contexts/AuthContext';
import { OrganizationContext } from '../../../../contexts/OrganizationContext';
import { LeagueContext } from '../../../../contexts/LeagueContext';
import { TournamentContext } from '../../../../contexts/TournamentContext';
// import React, { useState, useEffect , useContext } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import axios from "axios";
// import { FaTrophy, FaUsers, FaSpinner } from "react-icons/fa";

// // Game icons
// import Snooker from "../../../../assets/snooker.png";
// import Poker from "../../../../assets/pooker.png";
// import Pool from "../../../../assets/pool.png";

// // API base URL
// const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// // Game configuration
// const GAMES_CONFIG = {
//   snooker: { id: "snooker", name: "Snooker", slug: "snooker", sport: "snooker" },
//   poker: { id: "poker", name: "Poker", slug: "poker", sport: "poker" },
//   pool: { id: "pool", name: "Pool", slug: "pool", sport: "pool" },
// };

// // Get auth headers
// const getAuthHeaders = () => ({
//   headers: {
//     Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
//     "Content-Type": "application/json",
//   },
// });

// export default function LeagueStats() {
//   // ---------- State ----------
//   const [activeGameTab, setActiveGameTab] = useState("snooker");

//   const [leagues, setLeagues] = useState([]);
//   const [selectedLeague, setSelectedLeague] = useState(null);
//   const [divisions, setDivisions] = useState([]);
//   const [selectedDivision, setSelectedDivision] = useState(null);
//   const [standings, setStandings] = useState([]);

//   const [leaguesLoading, setLeaguesLoading] = useState(false);
//   const [divisionsLoading, setDivisionsLoading] = useState(false);
//   const [standingsLoading, setStandingsLoading] = useState(false);
//   const [error, setError] = useState(null);

//   // Fetch leagues when game changes
//   useEffect(() => {
//     setSelectedLeague(null);
//     setSelectedDivision(null);
//     setDivisions([]);
//     setStandings([]);
//     setError(null);
//     fetchLeagues(activeGameTab);
//   }, [activeGameTab]);

//   // Fetch divisions when league changes
//   useEffect(() => {
//     setSelectedDivision(null);
//     setStandings([]);
//     setError(null);
//     if (selectedLeague) {
//       fetchDivisions(selectedLeague);
//     } else {
//       setDivisions([]);
//     }
//   }, [selectedLeague]);

//   // Fetch standings when division changes
//   useEffect(() => {
//     setError(null);
//     if (selectedDivision && selectedLeague) {
//       fetchStandings(selectedLeague, selectedDivision);
//     } else {
//       setStandings([]);
//     }
//   }, [selectedDivision]);

//   const fetchLeagues = async (sport) => {
//     try {
//       setLeaguesLoading(true);
//       setError(null);

//       const response = await axios.get(
//         `${API_BASE_URL}/leagues?sport=${sport}`,
//         getAuthHeaders()
//       );

//       if (response.data.success) {
//         setLeagues(response.data.data || []);
//       } else {
//         setLeagues([]);
//         setError("Failed to load leagues");
//       }
//     } catch (err) {
//       console.error("Error fetching leagues:", err);
//       setLeagues([]);
//       setError(err.response?.data?.error || "Error fetching leagues");
//     } finally {
//       setLeaguesLoading(false);
//     }
//   };

//   const fetchDivisions = async (leagueId) => {
//     try {
//       setDivisionsLoading(true);
//       setError(null);

//       const response = await axios.get(
//         `${API_BASE_URL}/leagues/${leagueId}/divisions`,
//         getAuthHeaders()
//       );

//       if (response.data.success) {
//         setDivisions(response.data.data || []);
//       } else {
//         setDivisions([]);
//         setError("Failed to load divisions");
//       }
//     } catch (err) {
//       console.error("Error fetching divisions:", err);
//       setDivisions([]);
//       setError(err.response?.data?.error || "Error fetching divisions");
//     } finally {
//       setDivisionsLoading(false);
//     }
//   };

//   const fetchStandings = async (leagueId, divisionId) => {
//     try {
//       setStandingsLoading(true);
//       setError(null);

//       const response = await axios.get(
//         `${API_BASE_URL}/leagues/${leagueId}/standings?divisionId=${divisionId}`,
//         getAuthHeaders()
//       );

//       if (response.data.success) {
//         setStandings(response.data.data || []);
//       } else {
//         setStandings([]);
//         setError("Failed to load standings");
//       }
//     } catch (err) {
//       console.error("Error fetching standings:", err);
//       setStandings([]);
//       setError(err.response?.data?.error || "Error fetching standings");
//     } finally {
//       setStandingsLoading(false);
//     }
//   }

//   // Tab styling (copied from PlayerManagement)
//   const tabStyle = (tab) =>
//     `flex-1 px-4 py-2.5 md:py-2 rounded-md font-medium transition text-center text-sm md:text-base flex items-center justify-center gap-1.5 ${
//       activeGameTab === tab
//         ? "bg-[#0F172A] text-white"
//         : "bg-gray-100 text-gray-600 hover:bg-gray-200"
//     }`;

//   return (
//     <div className="min-h-screen bg-[#FFFBF4] p-4 md:p-6">
//       <div className="max-w-7xl mx-auto">
//         {/* Header */}
//         <div className="mb-8">
//           <h1 className="text-2xl md:text-3xl font-bold text-[#132F45]">
//             League Statistics
//           </h1>
//           <p className="text-[#132F45] opacity-70 mt-1 text-sm">
//             View standings and player stats by league and division
//           </p>
//         </div>

//         {/* Game Tabs – exactly like PlayerManagement */}
//         <div className="flex flex-col sm:flex-row gap-2 mb-6">
//           <button
//             onClick={() => setActiveGameTab("snooker")}
//             className={tabStyle("snooker")}
//           >
//             <img src={Snooker} alt="Snooker" className="w-5 h-5 object-contain" />
//             Snooker
//           </button>
//           <button
//             onClick={() => setActiveGameTab("poker")}
//             className={tabStyle("poker")}
//           >
//             <img src={Poker} alt="Poker" className="w-5 h-5 object-contain" />
//             Poker
//           </button>
//           <button
//             onClick={() => setActiveGameTab("pool")}
//             className={tabStyle("pool")}
//           >
//             <img src={Pool} alt="Pool" className="w-5 h-5 object-contain" />
//             Pool
//           </button>
//         </div>

//         {/* Filter Section */}
//         <div className="bg-white rounded-xl border border-[#D1D5DB] p-6 shadow-sm mb-6">
//           {error && (
//             <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
//               {error}
//             </div>
//           )}
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//             {/* League Dropdown */}
//             <div>
//               <label className="block text-sm font-semibold text-[#132F45] mb-2">
//                 Select League
//               </label>
//               <div className="relative">
//                 <select
//                   value={selectedLeague || ""}
//                   onChange={(e) => setSelectedLeague(e.target.value)}
//                   disabled={leaguesLoading || leagues.length === 0}
//                   className="w-full px-4 py-3 bg-white border border-[#D1D5DB] rounded-lg text-sm text-[#132F45] focus:outline-none focus:ring-2 focus:ring-[#132F45] disabled:bg-gray-100 disabled:opacity-50"
//                 >
//                   <option value="">
//                     {leaguesLoading ? "Loading leagues..." : "-- Choose League --"}
//                   </option>
//                   {leagues.map((league) => (
//                     <option key={league.id} value={league.id}>
//                       {league.name}
//                     </option>
//                   ))}
//                 </select>
//                 {leaguesLoading && (
//                   <FaSpinner className="absolute right-4 top-1/2 transform -translate-y-1/2 animate-spin text-[#132F45] h-4 w-4" />
//                 )}
//               </div>
//             </div>

//             {/* Division Dropdown */}
//             <div>
//               <label className="block text-sm font-semibold text-[#132F45] mb-2">
//                 Select Division
//               </label>
//               <div className="relative">
//                 <select
//                   value={selectedDivision || ""}
//                   onChange={(e) => setSelectedDivision(e.target.value)}
//                   disabled={!selectedLeague || divisionsLoading || divisions.length === 0}
//                   className="w-full px-4 py-3 bg-white border border-[#D1D5DB] rounded-lg text-sm text-[#132F45] focus:outline-none focus:ring-2 focus:ring-[#132F45] disabled:bg-gray-100 disabled:opacity-50"
//                 >
//                   <option value="">
//                     {divisionsLoading
//                       ? "Loading divisions..."
//                       : divisions.length === 0 && selectedLeague
//                       ? "No divisions available"
//                       : "-- Choose Division --"}
//                   </option>
//                   {divisions.map((div) => (
//                     <option key={div.id} value={div.id}>
//                       {div.name}
//                     </option>
//                   ))}
//                 </select>
//                 {divisionsLoading && (
//                   <FaSpinner className="absolute right-4 top-1/2 transform -translate-y-1/2 animate-spin text-[#132F45] h-4 w-4" />
//                 )}
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Standings Table */}
//         <AnimatePresence mode="wait">
//           {selectedDivision && (
//             <motion.div
//               key={selectedDivision}
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               exit={{ opacity: 0, y: -20 }}
//               transition={{ duration: 0.3 }}
//               className="bg-white rounded-xl border border-[#D1D5DB] p-6 shadow-sm"
//             >
//               <div className="flex items-center justify-between mb-4">
//                 <h2 className="text-lg font-semibold text-[#132F45] flex items-center gap-2">
//                   <FaTrophy className="text-[#132F45]" />
//                   Standings -{" "}
//                   {divisions.find((d) => d.id === selectedDivision)?.name || ""}
//                 </h2>
//                 <span className="text-sm text-[#132F45] bg-[#FFFBF4] px-3 py-1 rounded-full border border-[#D1D5DB]">
//                   {standings.length} player{standings.length !== 1 ? "s" : ""}
//                 </span>
//               </div>

//               {standingsLoading && (
//                 <div className="flex justify-center py-8">
//                   <FaSpinner className="animate-spin text-[#132F45] h-8 w-8" />
//                 </div>
//               )}

//               {!standingsLoading && standings.length > 0 ? (
//                 <div className="overflow-x-auto">
//                   <table className="min-w-full divide-y divide-[#D1D5DB]">
//                     <thead className="bg-gray-50">
//                       <tr>
//                         <th className="px-4 py-3 text-left text-xs font-medium text-[#132F45] uppercase tracking-wider">
//                           Pos
//                         </th>
//                         <th className="px-4 py-3 text-left text-xs font-medium text-[#132F45] uppercase tracking-wider">
//                           Player
//                         </th>
//                         <th className="px-4 py-3 text-left text-xs font-medium text-[#132F45] uppercase tracking-wider">
//                           Played
//                         </th>
//                         <th className="px-4 py-3 text-left text-xs font-medium text-[#132F45] uppercase tracking-wider">
//                           Wins
//                         </th>
//                         <th className="px-4 py-3 text-left text-xs font-medium text-[#132F45] uppercase tracking-wider">
//                           Losses
//                         </th>
//                         <th className="px-4 py-3 text-left text-xs font-medium text-[#132F45] uppercase tracking-wider">
//                           Points
//                         </th>
//                         <th className="px-4 py-3 text-left text-xs font-medium text-[#132F45] uppercase tracking-wider">
//                           Win %
//                         </th>
//                       </tr>
//                     </thead>
//                     <tbody className="bg-white divide-y divide-[#D1D5DB]">
//                       {standings.map((row, index) => {
//                         // Extract match statistics directly from API response
//                         const played = row.matchesPlayed || 0;
//                         const wins = row.matchesWon || 0;
//                         const losses = row.matchesLost || 0;
//                         const points = row.points || 0;

//                         // Calculate win percentage based on matches played
//                         const winPercent = played > 0 ? ((wins / played) * 100).toFixed(2) : 0;

//                         return (
//                           <tr key={row.id || index} className="hover:bg-[#FFFBF4]">
//                             <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-[#132F45]">
//                               {row.rank || index + 1}
//                             </td>
//                             <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-[#132F45]">
//                               {row.player?.name || row.playerName || "Unknown Player"}
//                             </td>
//                             <td className="px-4 py-4 whitespace-nowrap text-sm text-[#132F45]">
//                               {played}
//                             </td>
//                             <td className="px-4 py-4 whitespace-nowrap text-sm text-[#132F45]">
//                               {wins}
//                             </td>
//                             <td className="px-4 py-4 whitespace-nowrap text-sm text-[#132F45]">
//                               {losses}
//                             </td>
//                             <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-[#132F45]">
//                               {points}
//                             </td>
//                             <td className="px-4 py-4 whitespace-nowrap text-sm text-[#132F45]">
//                               {winPercent}%
//                             </td>
//                           </tr>
//                         );
//                       })}
//                     </tbody>
//                   </table>
//                 </div>
//               ) : (
//                 !standingsLoading && (
//                   <div className="text-center py-8">
//                     <p className="text-[#132F45] opacity-70">
//                       {error ? error : "No standings available for this division."}
//                     </p>
//                   </div>
//                 )
//               )}
//             </motion.div>
//           )}
//         </AnimatePresence>

//         {/* Placeholder when no division selected */}
//         {!selectedDivision && (
//           <div className="text-center py-12 bg-white rounded-xl border border-[#D1D5DB]">
//             <FaUsers className="mx-auto h-12 w-12 text-[#132F45] opacity-30" />
//             <p className="mt-4 text-[#132F45] opacity-70">
//               Select a league and division to view standings.
//             </p>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }



import React from 'react';
import { FaWrench } from 'react-icons/fa';
// import { useEffect } from 'react';
// import { Link } from 'react-router-dom';
// 
// 
// 
// 
// import Button from '../../../ui/Button';
// import Card from '../../../ui/Card';
// import Loader from '../../../ui/Loader';
// import EmailVerificationBanner from '../../../EmailVerificationBanner';
// import {
//   FaTrophy,
//   FaCalendarAlt,
//   FaBuilding,
//   FaCheckCircle,
//   FaExclamationCircle,
//   FaCog,
//   FaEdit,
//   FaUsers,
//   FaChartBar,
//   FaHome,
//   FaBell,
//   FaSearch,
//   FaEye,
//   FaPlus,
//   FaArrowRight,
//   FaUserCircle
// } from 'react-icons/fa';

export default function Leaguestats() {
  // const { user } = useContext(AuthContext);
  // const { organization, loading, getProfile } = useContext(OrganizationContext);
  // const { leagues, getLeagues } = useContext(LeagueContext);
  // const { tournaments, getTournaments } = useContext(TournamentContext);

  // useEffect(() => {
  //   getProfile();
  //   getLeagues();
  //   getTournaments();
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // if (loading) return <Loader />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white shadow-lg rounded-xl p-10 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4 flex items-center justify-center">
          <FaWrench className="inline-block mr-2 text-gray-700" />
          Under Working
          <FaWrench className="inline-block ml-2 text-gray-700" />
        </h1>
        <p className="text-gray-600 text-lg">
          The League Stats section is currently under development. Please check back soon!
        </p>
      </div>

      {/*
      // Original dashboard code temporarily commented
      <div className="min-h-screen bg-gray-50 w-full">
        ...
        (entire JSX of your original OrganizationDashboard)
        ...
      </div>
      */}
    </div>
  );
}