import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeftIcon,
  TrophyIcon,
  CalendarIcon,
  MapPinIcon,
  UsersIcon,
  SparklesIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useTournament } from './useTournament';
import TournamentDashboard from './TournamentDashboard';
import TournamentCreationWizard from './TournamentCreationWizard';
import Loader from '../../../ui/Loader';
import apiClient from '../../../../contexts/apiClient';

const statusColors = {
  draft: { bg: 'bg-gradient-to-br from-yellow-50 to-yellow-100/50', border: 'border-yellow-200/50', badge: 'bg-yellow-500/20 text-yellow-900 border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]', iconBg: 'bg-yellow-100 text-yellow-600', shadow: 'shadow-yellow-100' },
  registration: { bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50', border: 'border-blue-200/50', badge: 'bg-blue-500/20 text-blue-900 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]', iconBg: 'bg-blue-100 text-blue-600', shadow: 'shadow-blue-100' },
  registration_closed: { bg: 'bg-gradient-to-br from-orange-50 to-orange-100/50', border: 'border-orange-200/50', badge: 'bg-orange-500/20 text-orange-900 border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]', iconBg: 'bg-orange-100 text-orange-600', shadow: 'shadow-orange-100' },
  fixtures_generated: { bg: 'bg-gradient-to-br from-purple-50 to-purple-100/50', border: 'border-purple-200/50', badge: 'bg-purple-500/20 text-purple-900 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]', iconBg: 'bg-purple-100 text-purple-600', shadow: 'shadow-purple-100' },
  in_progress: { bg: 'bg-gradient-to-br from-green-50 to-green-100/50', border: 'border-green-200/50', badge: 'bg-green-500/20 text-green-900 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]', iconBg: 'bg-green-100 text-green-600', shadow: 'shadow-green-100' },
  completed: { bg: 'bg-gradient-to-br from-slate-50 to-slate-100/50', border: 'border-slate-200/50', badge: 'bg-slate-500/20 text-slate-900 border border-slate-500/30 shadow-[0_0_15px_rgba(100,116,139,0.2)]', iconBg: 'bg-slate-200 text-slate-600', shadow: 'shadow-slate-100' },
  archived: { bg: 'bg-gradient-to-br from-gray-50 to-gray-100/50', border: 'border-gray-200/50', badge: 'bg-gray-500/20 text-gray-900 border border-gray-500/30 shadow-[0_0_15px_rgba(107,114,128,0.2)]', iconBg: 'bg-gray-200 text-gray-600', shadow: 'shadow-gray-100' },
};

const statusLabels = {
  draft: 'Draft',
  registration: 'Registration Open',
  registration_closed: 'Registration Closed',
  fixtures_generated: 'Fixtures Generated',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

const statusIcons = {
  draft: '📋',
  registration: '🚪',
  registration_closed: '🔒',
  fixtures_generated: '📅',
  in_progress: '⚡',
  completed: '✅',
  archived: '📦',
};

/**
 * TournamentDetailsPage - Enhanced dedicated page for tournament details and actions
 */
export default function TournamentDetailsPage() {
  const navigate = useNavigate();
  const { tournamentId } = useParams();
  const { tournaments, getTournaments, loading } = useTournament();
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [venue, setVenue] = useState(null);
  const [venueLoading, setVenueLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    if (tournamentId && (!selectedTournament || String(selectedTournament.id) !== String(tournamentId))) {
      getTournaments();
    }
  }, [tournamentId, selectedTournament, getTournaments]);

  useEffect(() => {
    if (tournaments.length > 0 && tournamentId) {
      const tournament = tournaments.find(t => String(t.id) === String(tournamentId));
      if (tournament && String(tournament.id) === String(tournamentId)) {
        setSelectedTournament(tournament);
      }
    }
  }, [tournaments, tournamentId]);

  // Fetch venue details when tournament is selected
  useEffect(() => {
    if (selectedTournament?.venueId) {
      const fetchVenue = async () => {
        setVenueLoading(true);
        try {
          const response = await apiClient.get(`/venues/${selectedTournament.venueId}`);
          if (response.data?.success && response.data?.data) {
            setVenue(response.data.data);
          }
        } catch (error) {
          console.error('Failed to fetch venue:', error);
          setVenue(null);
        } finally {
          setVenueLoading(false);
        }
      };
      fetchVenue();
    }
  }, [selectedTournament?.venueId]);

  const handleBack = () => {
    navigate('/organization/tournaments');
  };

  if (loading && !selectedTournament) {
    return <Loader text="Loading tournament details..." />;
  }

  if (!selectedTournament && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="mb-6">
            <TrophyIcon className="h-16 w-16 text-gray-400 mx-auto" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tournament Not Found</h1>
          <p className="text-gray-600 mb-8 max-w-md">The tournament you're looking for doesn't exist or has been removed.</p>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all duration-300 shadow-md hover:shadow-lg active:scale-95"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            Back to Tournaments
          </button>
        </div>
      </div>
    );
  }

  const tournament = selectedTournament;
  const statusConfig = statusColors[tournament.status] || statusColors.draft;
  const statusLabel = statusLabels[tournament.status] || 'Unknown';
  const statusIcon = statusIcons[tournament.status] || '📋';

  // Format dates
  const startDate = tournament.startDate ? new Date(tournament.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
  const endDate = tournament.endDate ? new Date(tournament.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
  const regDeadline = tournament.registrationDeadline ? new Date(tournament.registrationDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD';

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Enhanced Header Section */}
      <div className={`relative overflow-hidden ${statusConfig.bg} border-b border-white/40 shadow-sm`}>
        {/* Abstract Background Elements */}
        <div className="absolute top-0 right-0 -mr-32 -mt-32 w-96 h-96 rounded-full bg-white/40 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-32 -mb-32 w-80 h-80 rounded-full bg-white/40 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
          {/* Back Button */}
          <button
            onClick={handleBack}
            className="group inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-white/50 border border-white/60 hover:bg-white text-gray-600 hover:text-blue-600 hover:shadow-sm transition-all duration-300 backdrop-blur-sm"
          >
            <ChevronLeftIcon className="h-4 w-4 group-hover:-translate-x-1 transition-transform duration-300" />
            <span className="text-sm font-bold tracking-wide uppercase">Back to Tournaments</span>
          </button>

          {/* Tournament Header */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-start gap-5 mb-2">
                <div className={`flex items-center justify-center h-16 w-16 rounded-2xl ${statusConfig.iconBg} text-3xl shadow-sm border border-white/50 backdrop-blur-sm`}>
                  {statusIcon}
                </div>
                <div className="flex-1">
                  <h1 className="text-4xl lg:text-5xl font-black text-gray-900 tracking-tight drop-shadow-sm mb-2">{tournament.name}</h1>
                  <div className="flex flex-wrap items-center gap-3 text-gray-600">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/60 text-xs font-bold uppercase tracking-widest border border-white">{tournament.sport}</span>
                    {tournament.description && (
                      <span className="text-base font-medium">{tournament.description?.substring(0, 80)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Status Badge - Large */}
            <div className="flex flex-col gap-3">
              <div className={`px-6 py-2.5 rounded-full font-black text-sm uppercase tracking-widest text-center backdrop-blur-md ${statusConfig.badge}`}>
                {statusLabel}
              </div>
              {tournament.status === 'draft' && !tournament.setupCompleted && (
                <button
                  onClick={() => setShowWizard(true)}
                  className="px-6 py-2.5 rounded-full font-black text-sm uppercase tracking-widest text-center bg-blue-600 hover:bg-blue-700 text-white transition-all duration-300 shadow-md hover:shadow-lg active:scale-95"
                >
                  Resume Setup
                </button>
              )}
            </div>
          </div>

          {/* Quick Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="group bg-white/60 backdrop-blur-md rounded-2xl p-5 border border-white hover:bg-white transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300`}>
                  <CalendarIcon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Duration</span>
              </div>
              <p className="text-lg font-black text-gray-900 group-hover:text-blue-700 transition-colors">{startDate}</p>
              <p className="text-xs font-semibold text-gray-500">to {endDate}</p>
            </div>

            <div className="group bg-white/60 backdrop-blur-md rounded-2xl p-5 border border-white hover:bg-white transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl bg-purple-50 text-purple-600 group-hover:scale-110 group-hover:bg-purple-100 transition-all duration-300`}>
                  <UsersIcon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Players</span>
              </div>
              <p className="text-lg font-black text-gray-900 group-hover:text-purple-700 transition-colors">{tournament.currentParticipantCount || 0}</p>
              <p className="text-xs font-semibold text-gray-500">of {tournament.maxParticipants || '∞'}</p>
            </div>

            <div className="group bg-white/60 backdrop-blur-md rounded-2xl p-5 border border-white hover:bg-white transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl bg-red-50 text-red-600 group-hover:scale-110 group-hover:bg-red-100 transition-all duration-300`}>
                  <MapPinIcon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Venue</span>
              </div>
              <p className="text-lg font-black text-gray-900 group-hover:text-red-700 transition-colors truncate">
                {venueLoading ? (
                  <span className="text-gray-400">Loading...</span>
                ) : (
                  venue?.name || '—'
                )}
              </p>
              <p className="text-xs font-semibold text-gray-500">Reg ends {regDeadline}</p>
            </div>

            <div className="group bg-white/60 backdrop-blur-md rounded-2xl p-5 border border-white hover:bg-white transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 group-hover:bg-emerald-100 transition-all duration-300`}>
                  <SparklesIcon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Format</span>
              </div>
              <p className="text-lg font-black text-gray-900 group-hover:text-emerald-700 transition-colors">{tournament.format?.type?.replace(/_/g, ' ').toUpperCase() || 'N/A'}</p>
              <p className="text-xs font-semibold text-gray-500">Best of {tournament.format?.bestOfFrames || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Tournament Dashboard */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TournamentDashboard
          tournament={selectedTournament}
          onClose={handleBack}
          onTournamentUpdated={(t) => {
            if (t) {
              setSelectedTournament(t);
              getTournaments();
            }
          }}
          initialTab="overview"
          hideCloseButton={true}
        />
      </div>

      {/* Tournament Creation Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto w-full max-w-4xl mx-4">
            <TournamentCreationWizard
              tournamentToResume={selectedTournament}
              onComplete={() => {
                setShowWizard(false);
                getTournaments();
              }}
              onClose={() => {
                setShowWizard(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
