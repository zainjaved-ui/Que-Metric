/**
 * Player Standings Tab
 * Shows current tournament standings (supports groups, Swiss, knockout, etc.)
 * Enhanced to use shared TournamentStandingsTable component with rich features
 */
import React from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import TournamentStandingsTable from '../../Organizationdashboard/Tournaments/TournamentStandingsTable';

export default function PlayerStandingsTab({ tournament }) {
  const { user } = useAuth();

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <TournamentStandingsTable
        tournamentId={tournament?.id}
        tournament={tournament}
        currentUserId={user?.id}
        onPlayerClick={(player) => {
          console.log('Player clicked:', player);
          // Can add player profile navigation here if needed
        }}
      />
    </div>
  );
}
