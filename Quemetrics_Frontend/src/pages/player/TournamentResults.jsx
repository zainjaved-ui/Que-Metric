import React, { useEffect, useState, useMemo, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import { AuthContext } from '../../contexts/AuthContext';
import Loader from '../../components/ui/Loader';
import BaseStandingsTable from '../../components/shared/StandingsTable/BaseStandingsTable';
import { FaArrowLeft, FaTrophy } from 'react-icons/fa';

export default function TournamentResults() {
  const navigate = useNavigate();
  const { tournamentId } = useParams();
  const { user } = useContext(AuthContext);

  const [tournament, setTournament] = useState(null);
  const [standings, setStandings] = useState([]);
  const [standingsDisplay, setStandingsDisplay] = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(user?.playerId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchResults = async () => {
    if (!tournamentId) return;

    setLoading(true);
    setError(null);
    try {
      const [tournamentRes, standingsRes] = await Promise.all([
        apiClient.get(`/tournaments/${tournamentId}`),
        apiClient.get(`/tournaments/${tournamentId}/standings`),
      ]);

      if (!tournamentRes.data?.success) {
        throw new Error(tournamentRes.data?.error || 'Failed to load tournament');
      }

      if (!standingsRes.data?.success) {
        throw new Error(standingsRes.data?.error || 'Failed to load standings');
      }

      setTournament(tournamentRes.data?.data || null);
      setStandings(Array.isArray(standingsRes.data?.data) ? standingsRes.data.data : []);
      setStandingsDisplay(standingsRes.data?.standingsDisplay || null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load results');
      setTournament(null);
      setStandings([]);
      setStandingsDisplay(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  useEffect(() => {
    let mounted = true;

    const resolveCurrentPlayerId = async () => {
      if (user?.playerId) {
        setCurrentPlayerId(user.playerId);
        return;
      }

      try {
        const response = await apiClient.get('/player/me');
        if (mounted && response.data?.success && response.data?.data?.id) {
          setCurrentPlayerId(response.data.data.id);
        }
      } catch {
        if (mounted) setCurrentPlayerId(null);
      }
    };

    resolveCurrentPlayerId();
    return () => {
      mounted = false;
    };
  }, [user?.playerId]);

  const subtitle = useMemo(() => {
    if (!tournament) return '';
    const sport = String(tournament.sport || 'sport').toUpperCase();
    const status = String(tournament.status || 'status').replace(/_/g, ' ').toUpperCase();
    return `${sport} · ${status}`;
  }, [tournament]);

  if (loading) return <Loader text="Loading tournament results..." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-4 sm:px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <button
          onClick={() => navigate('/player/tournaments')}
          className="inline-flex items-center gap-2 text-[#132F45] hover:text-[#1c4566] font-black text-[10px] uppercase tracking-widest"
        >
          <FaArrowLeft className="text-[10px]" /> Back to Tournaments
        </button>

        <div className="bg-[#132F45] rounded-3xl p-6 sm:p-8 text-white shadow-2xl shadow-[#132F45]/20">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#BA995D]">Tournament Results</span>
          <h1 className="mt-2 text-2xl md:text-3xl font-black uppercase tracking-tight">
            {tournament?.name || 'Tournament'}
          </h1>
          <p className="mt-2 text-[9px] font-black text-white/60 uppercase tracking-widest">{subtitle}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-[#132F45]/5 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4 text-[#132F45]">
            <FaTrophy className="text-[#BA995D]" />
            <h2 className="text-sm font-black uppercase tracking-widest">Standings</h2>
          </div>

          <BaseStandingsTable
            standings={standings}
            standingsDisplay={standingsDisplay}
            loading={false}
            error={error}
            currentUserId={currentPlayerId}
            emptyMessage="No standings available yet for this tournament."
            onRetry={fetchResults}
          />
        </div>
      </div>
    </div>
  );
}
