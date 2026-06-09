import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import Loader from '../../components/ui/Loader';
import LiveTournamentProgressionView from '../../components/Dashboard/Organizationdashboard/Tournaments/LiveTournamentProgressionView';
import Button from '../../components/ui/Button';

export default function TournamentBracket() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [matches, setMatches] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [tResp, mResp, pResp] = await Promise.all([
          apiClient.get(`/tournaments/${tournamentId}`),
          apiClient.get(`/tournaments/${tournamentId}/matches`),
          apiClient.get(`/tournaments/${tournamentId}/participants`)
        ]);
        if (cancelled) return;

        const tournamentData = tResp.data.data || null;
        const matchesData = mResp.data.data || [];
        const participantsData = pResp.data.data || [];

        // Attach participants to tournament for SwissStandingsTable
        if (tournamentData) {
          tournamentData.participants = participantsData;
        }

        setTournament(tournamentData);
        setMatches(matchesData);
        setParticipants(participantsData);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || err.message || 'Failed to load bracket');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tournamentId]);

  if (loading) return <div className="p-6"><Loader /></div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!tournament) return <div className="p-6">Tournament not found.</div>;

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">{tournament.name}</h1>
            <p className="text-sm text-gray-600">{tournament.sport} • {tournament.format?.type || '—'}</p>
          </div>
          <div>
            <Button onClick={() => navigate(-1)} variant="secondary">Back</Button>
          </div>
        </div>

        <LiveTournamentProgressionView
          matches={matches}
          tournament={tournament}
          onRecordResult={() => {}}
          onDisputeMatch={() => {}}
        />
      </div>
    </div>
  );
}
