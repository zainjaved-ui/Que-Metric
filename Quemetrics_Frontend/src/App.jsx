import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { LeagueProvider } from './contexts/LeagueContext';
import { MatchResultProvider } from './contexts/MatchResultContext';
import { TournamentProvider } from './contexts/TournamentContext';
import { AdminProvider } from './contexts/AdminContext';
import { VenueOwnerProvider } from './contexts/VenueOwnerContext';
import { NotificationProvider } from './contexts/NotificationContext'; // Add this
import ErrorBoundary from './components/ErrorBoundary';
import AppRoutes from './routes/AppRoutes';
import ToastProvider from './components/ui/ToastProvider'; // Add this

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <NotificationProvider>
          <ToastProvider />
          <AuthProvider>
            <OrganizationProvider>
              <PlayerProvider>
                <LeagueProvider>
                  <MatchResultProvider>
                    <TournamentProvider>
                      <AdminProvider>
                        <VenueOwnerProvider>
                          <AppRoutes />
                        </VenueOwnerProvider>
                      </AdminProvider>
                    </TournamentProvider>
                  </MatchResultProvider>
                </LeagueProvider>
              </PlayerProvider>
            </OrganizationProvider>
          </AuthProvider>
        </NotificationProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;