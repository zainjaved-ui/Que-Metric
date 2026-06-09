import React, { useState, useEffect, useMemo, useContext } from 'react';
import {
  FaTrophy,
  FaSortAmountDown,
  FaUser,
  FaStar,
  FaSpinner
} from 'react-icons/fa';
import { TournamentContext } from '../../contexts/TournamentContext';

const SCOPES = [
  { key: 'county',   label: 'County' },
  { key: 'regional', label: 'Regional' },
  { key: 'national', label: 'National' },
];

const Rankings = () => {
  const { getRankings } = useContext(TournamentContext);
  const [scope, setScope]       = useState('county');
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [sortOrder, setSortOrder] = useState('');

  useEffect(() => {
    setLoading(true);
    getRankings({ scope, limit: 10 })
      .then((res) => {
        const data = res?.success ? (res?.data?.rankings || []) : [];
        setRows(data.map((p, idx) => ({
          rank: idx + 1,
          name: p.playerName,
          points: p.totalPoints || 0,
        })));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [scope, getRankings]);

  const displayRows = useMemo(() => {
    let data = [...rows];
    if (sortOrder === 'high') data.sort((a, b) => b.points - a.points);
    if (sortOrder === 'low')  data.sort((a, b) => a.points - b.points);
    return data;
  }, [rows, sortOrder]);

  return (
    <section className="bg-gradient-to-br from-[#FFFBF4] to-[#F5F0E8] py-16">

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <FaTrophy className="text-4xl text-[#132F45]" />
            <h1 className="text-4xl md:text-5xl font-bold text-[#132F45]">
              Rankings
            </h1>
          </div>
          <p className="text-xl text-[#132F45] opacity-80 max-w-3xl mx-auto">
            12-month rolling rankings – only verified tournaments count.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8 flex flex-wrap gap-4 justify-center">

          {/* Scope selector */}
          <div className="flex gap-1 bg-white border border-[#D1D5DB] rounded-lg p-1">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  scope === s.key
                    ? 'bg-[#132F45] text-white shadow-sm'
                    : 'text-[#132F45] hover:bg-gray-100'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <FaSortAmountDown className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#132F45] opacity-60" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-[#D1D5DB] rounded-lg text-[#132F45] focus:outline-none focus:ring-2 focus:ring-[#132F45] appearance-none cursor-pointer"
            >
              <option value="">Sort by Points</option>
              <option value="high">Highest first</option>
              <option value="low">Lowest first</option>
            </select>
          </div>

        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-xl border border-[#D1D5DB] overflow-hidden">
          <table className="min-w-full divide-y divide-[#D1D5DB]">
            <thead className="bg-[#132F45] bg-opacity-5">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">Rank</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">Player</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">Points</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-[#D1D5DB]">
              {loading && (
                <tr>
                  <td colSpan="3" className="px-6 py-8 text-center text-[#132F45] opacity-60">
                    <FaSpinner className="animate-spin inline mr-2" /> Loading rankings…
                  </td>
                </tr>
              )}
              {!loading && displayRows.length === 0 && (
                <tr>
                  <td colSpan="3" className="px-6 py-8 text-center text-gray-500 text-sm">
                    No rankings available yet. Complete ranked tournaments to appear here.
                  </td>
                </tr>
              )}
              {!loading && displayRows.map((player, index) => (
                <tr key={index} className="hover:bg-gray-100 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {index === 0 && <FaStar className="text-yellow-500" />}
                      <span className="text-sm font-medium text-[#132F45]">{player.rank}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <FaUser className="text-[#132F45] opacity-60" />
                      <span className="text-sm text-[#132F45]">{player.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-bold text-[#132F45]">{player.points}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </section>
  );
};

export default Rankings;
