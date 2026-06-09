import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import { AuthContext } from '../../contexts/AuthContext';
import TournamentCard from '../../components/Tournament/TournamentCard';
import JoinCodeModal from '../../components/Tournament/JoinCodeModal';
import Loader from '../../components/ui/Loader';
import Button from '../../components/ui/Button';
import { FaSearch, FaFilter, FaTimes } from 'react-icons/fa';

export default function BrowseTournaments() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [joinedTournamentIds, setJoinedTournamentIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);

  // Filter state
  const [filters, setFilters] = useState({
    sport: '',
    searchTerm: '',
    allowsOpenRegistration: false,
  });

  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
  });

  // Load tournaments
  useEffect(() => {
    loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagination.offset]);

  // Load player's joined tournaments to disable re-registering
  useEffect(() => {
    const loadPlayerTournaments = async () => {
      if (!user) {
        setJoinedTournamentIds(new Set());
        return;
      }

      try {
        // Add cache-busting timestamp to ensure fresh data
        const timestamp = Date.now();
        const resp = await apiClient.get(`/player/tournaments?_t=${timestamp}`);
        const ids = new Set((resp.data.data || []).map((p) => p.tournament?.id).filter(Boolean));
        setJoinedTournamentIds(ids);
      } catch (err) {
        console.debug('Could not load player tournaments', err?.message || err);
        setJoinedTournamentIds(new Set());
      }
    };

    loadPlayerTournaments();
  }, [user]);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit,
        offset: pagination.offset,
        status: 'registration',
        _t: Date.now(), // Cache-busting timestamp
      });

      if (filters.sport) params.append('sport', filters.sport);
      if (filters.searchTerm) params.append('searchTerm', filters.searchTerm);
      if (filters.allowsOpenRegistration) params.append('allowsOpenRegistration', 'true');

      const response = await apiClient.get(`/tournaments/discover?${params}`);
      const discoverRows = response.data.data || [];
      // Defensive client-side guard: never render private tournaments in browse list.
      const publicRows = discoverRows.filter(
        (t) => !t?.visibility || String(t.visibility).toLowerCase() === 'public'
      );
      setTournaments(publicRows);
      setPagination({
        ...pagination,
        total: response.data.pagination?.total || 0,
      });
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tournaments');
      setTournaments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
    setPagination({ ...pagination, offset: 0 }); // Reset pagination
  };

  const handleSearch = (e) => {
    const value = e.target.value;
    setFilters({ ...filters, searchTerm: value });
    setPagination({ ...pagination, offset: 0 });
  };

  const clearFilters = () => {
    setFilters({
      sport: '',
      searchTerm: '',
      allowsOpenRegistration: false,
    });
    setPagination({ ...pagination, offset: 0 });
  };

  const handleRegister = (tournament) => {
    navigate(`/player/tournament/${tournament.id}/register`, { state: { tournament } });
  };

  const handleJoinWithCode = () => {
    setShowJoinCodeModal(true);
  };

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const hasActiveFilters = filters.sport || filters.searchTerm || filters.allowsOpenRegistration;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Browse Tournaments</h1>
            <p className="text-gray-600">Discover and join tournaments in your area</p>
          </div>

          {/* Search & Filters */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              {/* Search */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <div className="relative">
                  <FaSearch className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tournament name..."
                    value={filters.searchTerm}
                    onChange={handleSearch}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Sport Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sport</label>
                <select
                  value={filters.sport}
                  onChange={(e) => handleFilterChange('sport', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Sports</option>
                  <option value="snooker">Snooker</option>
                  <option value="pool">Pool</option>
                  <option value="poker">Poker</option>
                </select>
              </div>

              {/* Open Registration Toggle */}
              <div className="flex items-end">
                <label className="flex items-center space-x-2 cursor-pointer h-10">
                  <input
                    type="checkbox"
                    checked={filters.allowsOpenRegistration}
                    onChange={(e) => handleFilterChange('allowsOpenRegistration', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700">Open Registration</span>
                </label>
              </div>
            </div>

            {/* Filter Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleJoinWithCode}
                variant="secondary"
                className="flex items-center gap-2"
              >
                <FaFilter /> Join with Code
              </Button>
              {hasActiveFilters && (
                <Button
                  onClick={clearFilters}
                  variant="secondary"
                  className="flex items-center gap-2"
                >
                  <FaTimes /> Clear Filters
                </Button>
              )}
            </div>
          </div>

          {/* Loading State */}
          {loading && <Loader />}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* No Results */}
          {!loading && tournaments.length === 0 && (
            <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <FaFilter className="mx-auto text-4xl text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No tournaments found</h3>
              <p className="text-gray-600 mb-4">Try adjusting your filters or search criteria</p>
              {hasActiveFilters && (
                <Button onClick={clearFilters} variant="primary">
                  Clear Filters
                </Button>
              )}
            </div>
          )}

          {/* Tournaments Grid */}
          {!loading && tournaments.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {tournaments.map((tournament) => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    onRegister={handleRegister}
                    onJoinWithCode={handleJoinWithCode}
                    isJoined={joinedTournamentIds.has(tournament.id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between bg-white rounded-lg shadow-md p-4">
                <div className="text-sm text-gray-600">
                  Showing {Math.min(pagination.offset + 1, pagination.total)} to{' '}
                  {Math.min(pagination.offset + pagination.limit, pagination.total)} of{' '}
                  {pagination.total} tournaments
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setPagination({ ...pagination, offset: Math.max(0, pagination.offset - pagination.limit) })}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-2">
                    {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                      const pageNum = currentPage - 2 + idx;
                      if (pageNum <= 0 || pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPagination({ ...pagination, offset: (pageNum - 1) * pagination.limit })}
                          className={`px-3 py-2 rounded-lg ${
                            pageNum === currentPage
                              ? 'bg-blue-600 text-white'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setPagination({ ...pagination, offset: pagination.offset + pagination.limit })}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Join Code Modal */}
        <JoinCodeModal
          isOpen={showJoinCodeModal}
          onClose={() => setShowJoinCodeModal(false)}
          onSuccess={() => {
            setShowJoinCodeModal(false);
            navigate('/player/my-tournaments');
          }}
        />
      </div>
  );
}
