import React, { useState, useEffect } from 'react';
import { FaPlus, FaWrench, FaUsers, FaTrophy, FaCalendar } from 'react-icons/fa';
import { useTournament } from './useTournament';
import TournamentCreationWizard from './TournamentCreationWizard';
import TournamentDashboard from './TournamentDashboard';

/**
 * Main Tournament Management Component
 */
export default function TournamentManagement() {
  const { tournaments, loading, error, getTournaments } = useTournament();
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    getTournaments();
  }, [getTournaments]);

  const filteredTournaments = filterStatus === 'all'
    ? tournaments
    : tournaments.filter((t) => t.status === filterStatus);

  const handleTournamentCreated = async (newTournament) => {
    await getTournaments();
    setShowCreateWizard(false);
  };

  const handleSelectTournament = (tournament) => {
    setSelectedTournament(tournament);
    setShowDashboard(true);
  };

  const handleCloseDashboard = () => {
    setShowDashboard(false);
    setSelectedTournament(null);
    getTournaments(); // Refresh list
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Tournament Management</h1>
          <p className="text-gray-600">Create and manage competitive tournaments</p>
        </div>
        <button
          onClick={() => setShowCreateWizard(true)}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          <FaPlus /> Create Tournament
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading tournaments...</div>
      ) : (
        <>
          {/* Filter Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-200">
            {['all', 'draft', 'registration', 'in_progress', 'completed', 'archived'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 font-medium transition border-b-2 ${
                  filterStatus === status
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Tournament Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTournaments.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <FaTrophy className="mx-auto text-4xl text-gray-400 mb-4" />
                <p className="text-gray-500 text-lg">
                  {filterStatus === 'all'
                    ? 'No tournaments yet. Create one to get started!'
                    : `No ${filterStatus} tournaments.`}
                </p>
              </div>
            ) : (
              filteredTournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  onSelect={handleSelectTournament}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {showCreateWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <TournamentCreationWizard
              onComplete={handleTournamentCreated}
              onClose={() => setShowCreateWizard(false)}
            />
          </div>
        </div>
      )}

      {showDashboard && selectedTournament && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={handleCloseDashboard}
        >
          <div
            className="relative bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Absolute Close (always visible) */}
            <button
              onClick={handleCloseDashboard}
              className="absolute top-4 right-4 p-2 bg-white text-gray-700 rounded-full shadow-md hover:bg-gray-100 transition flex items-center justify-center w-10 h-10 z-50 border border-gray-200"
              title="Close Modal"
              aria-label="Close Modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Header */}
            <div className="sticky top-0 flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 z-10">
              <h2 className="text-2xl font-bold text-white">{selectedTournament.name}</h2>
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={handleCloseDashboard}
                  className="p-2 hover:bg-blue-800 hover:bg-opacity-80 rounded-full transition text-white flex items-center justify-center w-10 h-10 flex-shrink-0"
                  title="Close Modal"
                  aria-label="Close Modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <TournamentDashboard
                tournament={selectedTournament}
                onClose={handleCloseDashboard}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tournament Card Component
 */
function TournamentCard({ tournament, onSelect }) {
  const statusBgColors = {
    draft: 'bg-yellow-50 border-yellow-200',
    registration: 'bg-blue-50 border-blue-200',
    in_progress: 'bg-green-50 border-green-200',
    completed: 'bg-gray-50 border-gray-200',
    archived: 'bg-slate-50 border-slate-200',
    cancelled: 'bg-red-50 border-red-200',
  };

  const statusBadgeColors = {
    draft: 'bg-yellow-100 text-yellow-800',
    registration: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    archived: 'bg-slate-100 text-slate-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const tierColors = {
    national: 'bg-yellow-100 text-yellow-900',
    regional: 'bg-purple-100 text-purple-900',
    county:   'bg-blue-100 text-blue-900',
    local:    'bg-orange-100 text-orange-900',
  };

  return (
    <div
      onClick={() => onSelect(tournament)}
      className={`border rounded-lg p-6 cursor-pointer hover:shadow-lg transition ${statusBgColors[tournament.status] || statusBgColors.draft}`}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-bold text-gray-900">{tournament.name}</h3>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeColors[tournament.status]}`}>
            {tournament.status.replace(/_/g, ' ').toUpperCase()}
          </span>
          {tournament.ranked && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tierColors[tournament.tier] || 'bg-gray-100 text-gray-800'}`}>
              {tournament.tier.charAt(0).toUpperCase() + tournament.tier.slice(1)}
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4">{tournament.sport}</p>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase">Start Date</p>
          <p className="text-gray-900 font-medium">{new Date(tournament.startDate).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase">Players</p>
          <p className="text-gray-900 font-medium">
            {tournament.currentParticipantCount} / {tournament.maxParticipants || '∞'}
          </p>
        </div>
      </div>

      {tournament.entryFee && (
        <div className="mb-4 p-3 bg-green-50 rounded border border-green-200">
          <p className="text-sm font-semibold text-green-900">£{tournament.entryFee}</p>
        </div>
      )}

      <button className="w-full py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 transition">
        Manage
      </button>
    </div>
  );
}
