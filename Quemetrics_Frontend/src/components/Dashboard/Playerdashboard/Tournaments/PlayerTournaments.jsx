/**
 * Player Tournaments Dashboard
 * Displays player's tournament participation, fixtures, and match results
 */
import React, { useContext, useState, useEffect } from 'react';
import { FaCalendar, FaUsers, FaTrophy, FaCheckCircle, FaClock, FaTimes, FaSignOutAlt } from 'react-icons/fa';
import { TournamentContext } from '../../../../contexts/TournamentContext';
import PlayerMatchesTab from './PlayerMatchesTab';
import PlayerFixturesTab from './PlayerFixturesTab';
import PlayerStandingsTab from './PlayerStandingsTab';
import TournamentWithdrawalModal from './TournamentWithdrawalModal';

export default function PlayerTournaments() {
  const context = useContext(TournamentContext);

  if (!context) {
    return <div className="text-center py-12 text-red-600">Tournament context not available</div>;
  }

  const { tournaments, currentTournament, loading, error, getTournaments, getTournamentById, withdrawPlayer, getWithdrawalInfo } = context;
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [activeTab, setActiveTab] = useState('matches');
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawalInfo, setWithdrawalInfo] = useState(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);

  // Load player's tournaments
  useEffect(() => {
    getTournaments();
  }, [getTournaments]);

  const handleTournamentSelect = (tournament) => {
    setSelectedTournament(tournament);
    getTournamentById(tournament.id || tournament.tournament?.id);
    setActiveTab('matches');
  };

  const handleCloseTournamentDetails = () => {
    setSelectedTournament(null);
    setWithdrawalInfo(null);
  };

  const handleWithdrawClick = async (tournamentItem = null) => {
    const tournamentData = tournamentItem || selectedTournament;
    const tournamentId = tournamentData?.tournament?.id || tournamentData?.id;
    if (!tournamentId) return;

    // Ensure selectedTournament is set
    if (!selectedTournament && tournamentItem) {
      setSelectedTournament(tournamentItem);
    }

    setFetchingInfo(true);
    const result = await getWithdrawalInfo(tournamentId);
    setFetchingInfo(false);

    if (result.success) {
      setWithdrawalInfo(result.data);
      setShowWithdrawModal(true);
    } else {
      alert('Could not load withdrawal information: ' + (result.error || 'Unknown error'));
    }
  };

  const handleWithdrawConfirm = async (reason) => {
    const tournamentId = selectedTournament?.tournament?.id || selectedTournament?.id;
    if (!tournamentId) return;

    setWithdrawing(true);
    const result = await withdrawPlayer(tournamentId, { reason });
    setWithdrawing(false);

    if (result.success) {
      setShowWithdrawModal(false);
      setWithdrawalInfo(null);
      handleCloseTournamentDetails();
      getTournaments();
    } else {
      alert('Failed to withdraw: ' + (result.error || 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading your tournaments...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-semibold">Unable to load tournaments</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!selectedTournament ? (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <FaTrophy className="text-blue-600 text-2xl mb-2" />
              <p className="text-sm text-blue-600 font-medium">Total Tournaments</p>
              <p className="text-3xl font-bold text-blue-900">{tournaments.length}</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <FaCheckCircle className="text-green-600 text-2xl mb-2" />
              <p className="text-sm text-green-600 font-medium">Completed</p>
              <p className="text-3xl font-bold text-green-900">
                {tournaments.filter(t => t.tournament?.status === 'completed').length}
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <FaClock className="text-purple-600 text-2xl mb-2" />
              <p className="text-sm text-purple-600 font-medium">In Progress</p>
              <p className="text-3xl font-bold text-purple-900">
                {tournaments.filter(t => t.tournament?.status === 'in_progress').length}
              </p>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <FaCalendar className="text-orange-600 text-2xl mb-2" />
              <p className="text-sm text-orange-600 font-medium">Upcoming</p>
              <p className="text-3xl font-bold text-orange-900">
                {tournaments.filter(t => t.tournament?.status === 'registration' || t.tournament?.status === 'pending').length}
              </p>
            </div>
          </div>

          {/* Tournaments List */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Your Tournaments</h2>
            </div>

            {tournaments.length === 0 ? (
              <div className="p-8 text-center text-gray-600">
                <p>No tournaments yet. Browse available tournaments to register.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {tournaments.map((tourItem) => {
                  const tournament = tourItem.tournament || tourItem;
                  const status = tournament.status || 'pending';
                  const statusColors = {
                    'registration': 'bg-blue-50 text-blue-900',
                    'pending': 'bg-blue-50 text-blue-900',
                    'in_progress': 'bg-yellow-50 text-yellow-900',
                    'completed': 'bg-green-50 text-green-900',
                    'cancelled': 'bg-red-50 text-red-900',
                  };

                  return (
                    <div key={tournament.id} className="p-6 hover:bg-gray-50 transition cursor-pointer">
                      <div className="flex justify-between items-start mb-3">
                        <div
                          onClick={() => handleTournamentSelect(tourItem)}
                          className="flex-1"
                        >
                          <h3 className="text-lg font-semibold text-gray-900">{tournament.name}</h3>
                          <p className="text-sm text-gray-600">{tournament.description}</p>
                        </div>
                        <span className={`px-3 py-1 rounded text-xs font-semibold ${statusColors[status] || statusColors.pending}`}>
                          {status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                        {tournament.startDate && (
                          <span className="flex items-center gap-2">
                            <FaCalendar className="text-gray-400" />
                            {new Date(tournament.startDate).toLocaleDateString()}
                          </span>
                        )}
                        {tournament.maxParticipants && (
                          <span className="flex items-center gap-2">
                            <FaUsers className="text-gray-400" />
                            {tournament.currentParticipantCount || 0}/{tournament.maxParticipants}
                          </span>
                        )}
                        {tournament.tier && (
                          <span className="flex items-center gap-2">
                            <FaTrophy className="text-gray-400" />
                            {tournament.tier}
                          </span>
                        )}
                        {tourItem.status && (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            tourItem.status === 'approved' ? 'bg-green-100 text-green-800' :
                            tourItem.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            tourItem.status === 'withdrawn' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {tourItem.status.toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => handleTournamentSelect(tourItem)}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium"
                        >
                          View Details
                        </button>

                        {/* Withdrawal Button - WITH DEBUG LOGGING */}
                        {(() => {
                          const participationStatus = tourItem.status;
                          const tournamentStatus = tournament.status;
                          const isApproved = participationStatus === 'approved';
                          const isActiveStatus = ['registration', 'registration_closed', 'in_progress', 'fixtures_generated'].includes(tournamentStatus);
                          const shouldShow = isApproved && isActiveStatus;

                          // Debug logging
                          console.log(`🔍 Withdrawal Button Debug for "${tournament.name}":`, {
                            participationStatus,
                            tournamentStatus,
                            isApproved,
                            isActiveStatus,
                            shouldShow,
                            tourItemKeys: Object.keys(tourItem),
                            tournamentKeys: Object.keys(tournament),
                          });

                          return shouldShow ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleWithdrawClick(tourItem);
                              }}
                              disabled={fetchingInfo || withdrawing}
                              className={`px-4 py-2 rounded transition text-sm font-semibold flex items-center gap-2 ${
                                fetchingInfo || withdrawing
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-red-600 text-white hover:bg-red-700'
                              }`}
                            >
                              <FaSignOutAlt size={14} />
                              {fetchingInfo || withdrawing ? 'Processing...' : 'Withdraw'}
                            </button>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Tournament Details */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedTournament.tournament?.name}</h2>
                <p className="text-sm text-gray-600 mt-1">{selectedTournament.tournament?.description}</p>
              </div>
              <button
                onClick={handleCloseTournamentDetails}
                className="p-2 hover:bg-gray-100 rounded transition"
              >
                <FaTimes className="text-gray-400 text-xl" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {[
                { id: 'matches', label: 'Matches', icon: FaCheckCircle },
                { id: 'standings', label: 'Standings', icon: FaTrophy },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-6 py-4 font-medium transition ${
                      activeTab === tab.id
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'matches' && <PlayerMatchesTab tournament={selectedTournament.tournament} onRefresh={() => getTournaments()} />}
              {activeTab === 'standings' && <PlayerStandingsTab tournament={selectedTournament.tournament} />}
            </div>

            {/* Withdrawal Section - ALWAYS VISIBLE FOR DEBUGGING */}
            {(() => {
              const tournamentStatus = selectedTournament?.tournament?.status;
              const participationStatus = selectedTournament?.status;
              const withdrawalAllowed = participationStatus === 'approved' &&
                ['registration', 'registration_closed', 'in_progress', 'fixtures_generated'].includes(tournamentStatus);

              // Debug logging
              console.log('🔍 Withdrawal Debug:', {
                tournamentStatus,
                participationStatus,
                withdrawalAllowed,
                tournamentData: selectedTournament?.tournament,
              });

              return withdrawalAllowed ? (
                <div className={`px-6 py-4 border-t-4 ${tournamentStatus === 'registration' ? 'bg-orange-50 border-orange-500' : 'bg-red-50 border-red-500'}`}>
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <p className="font-bold text-lg text-gray-900 flex items-center gap-2">
                        <FaSignOutAlt className="text-red-600 text-xl" />
                        Withdraw from Tournament
                      </p>
                      {tournamentStatus === 'registration' ? (
                        <p className="text-sm text-orange-700 mt-2">
                          You can withdraw before the tournament starts. No penalties will be applied.
                        </p>
                      ) : (
                        <p className="text-sm text-red-700 mt-2 font-medium">
                          ⚠️ Withdrawal during an active tournament will apply configured withdrawal rules (results may be recorded).
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleWithdrawClick}
                      disabled={fetchingInfo || withdrawing}
                      className={`px-8 py-4 text-white rounded-lg font-bold transition flex items-center gap-2 ml-4 shrink-0 text-base ${
                        fetchingInfo || withdrawing
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 active:bg-red-800 shadow-lg'
                      }`}
                    >
                      {fetchingInfo || withdrawing ? (
                        <>
                          <span className="inline-block animate-spin">⟳</span>
                          {fetchingInfo ? 'Loading...' : 'Processing...'}
                        </>
                      ) : (
                        <>
                          <FaSignOutAlt size={18} />
                          Withdraw Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-300">
                  <p className="text-sm text-gray-600">
                    ℹ️ Withdrawal not available (Status: {participationStatus}, Tournament: {tournamentStatus})
                  </p>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Withdrawal confirmation modal */}
      <TournamentWithdrawalModal
        isOpen={showWithdrawModal}
        onClose={() => { setShowWithdrawModal(false); setWithdrawalInfo(null); }}
        withdrawalInfo={withdrawalInfo}
        onConfirm={handleWithdrawConfirm}
        loading={withdrawing}
      />
    </div>
  );
}
