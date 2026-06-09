import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import EmailVerifiedRoute from '../components/EmailVerifiedRoute';

// Layouts
import Layout from '../components/Layout/Layout';
import DashboardLayout from '../components/Dashboard/Playerdashboard/DashboardLayout';
import OrgDashboardLayout from '../components/Dashboard/Organizationdashboard/OrganizationLayout';
import VenueOwnerLayout from '../components/Dashboard/VenueOwnerDashboard/VenueOwnerLayout';

// Landing & Auth
import LandingPage from '../components/Homepage/index';
import Login from '../pages/auth/Login';
import RegisterPlayer from '../pages/auth/RegisterPlayer';
import RegisterOrganization from '../pages/auth/RegisterOrganization';
import ForgotPassword from '../pages/auth/ForgotPassword';
import ResetPassword from '../pages/auth/ResetPassword';
import VerifyEmail from '../pages/auth/VerifyEmail';
import VerifyClubEmail from '../pages/auth/VerifyClubEmail';
import JoinLeaguePage from '../pages/JoinLeague';

// Shared
import Settings from '../components/Dashboard/Organizationdashboard/Setting/Setting';

// Player pages
import PlayerDashboard from '../components/Dashboard/Playerdashboard/Dashboard/Dashboard';
import PlayerProfile from '../components/Dashboard/Playerdashboard/Profile/Profile';
import BookingTable from '../components/Dashboard/Playerdashboard/BookingTable/index';
import MatchListing from '../components/Dashboard/Playerdashboard/MatchListingpage/index';
import MyBookings from '../components/Dashboard/Playerdashboard/MyBookings/index';
import PlayerResults from '../components/Dashboard/Playerdashboard/Results/index';
import UploadScore from '../components/Dashboard/Playerdashboard/Uploadscore';
import Leagues from '../components/Dashboard/Playerdashboard/League/League';
import JoinClub from '../pages/player/JoinClub';
import PlayerClubs from '../pages/player/Clubs';
import BrowseTournaments from '../pages/player/BrowseTournaments';
import AllTournaments from '../pages/player/AllTournaments';
import MyTournaments from '../pages/player/MyTournaments';
import TournamentRegister from '../pages/player/TournamentRegister';
import TournamentBracket from '../pages/player/TournamentBracket';
import TournamentResults from '../pages/player/TournamentResults';
import TournamentMatchHistory from '../pages/player/TournamentMatchHistory';
import PlayerRankings from '../pages/player/Rankings';

function DetailsRedirect() {
  const { tournamentId } = useParams();
  return <Navigate to={`/player/my-tournaments?details=${tournamentId}`} replace />;
}

// Organization pages
import OrganizationDashboard from '../components/Dashboard/Organizationdashboard/Dashboard/Dashboard';
import Tournaments from '../components/Dashboard/Organizationdashboard/Tournaments/Tournaments';
import VenueOwners from '../components/Dashboard/Organizationdashboard/VenueOwners/VenueOwners';
import Profile from '../components/Dashboard/Organizationdashboard/Profile/Profile';
import SeasonManagement from '../components/Dashboard/Organizationdashboard/Seasonsmanagementpage/index';
import LeagueManagement from '../components/Dashboard/Organizationdashboard/LeagueManagement/index';
import DisputedMatches from '../components/Dashboard/Organizationdashboard/DisputeMatches/index';
import PlayerManagement from '../components/Dashboard/Organizationdashboard/player/index';
import LeagueMatchManagement from '../components/Dashboard/Organizationdashboard/LeagueMatches/index';
import TournamentMatchManagement from '../components/Dashboard/Organizationdashboard/Tournaments/TournamentMatchManagement';
import TournamentSettings from '../components/Dashboard/Organizationdashboard/Tournaments/TournamentSettings';
import TournamentDetailsPage from '../components/Dashboard/Organizationdashboard/Tournaments/TournamentDetailsPage';
import LeagueStats from '../components/Dashboard/Organizationdashboard/LeagueStats/index';
import ClubManagement from '../components/Dashboard/Organizationdashboard/ClubManagemnt/index';
import ClubDetailView from '../components/Dashboard/Organizationdashboard/ClubManagemnt/ClubDetailView';

// Venue Owner pages
import VenueOwnerDashboard from '../components/Dashboard/VenueOwnerDashboard/Dashboard';
import VenueOwnerProfile from '../components/Dashboard/VenueOwnerDashboard/Profile';
import AcceptInvitation from '../components/Dashboard/VenueOwnerDashboard/AcceptInvitation';
import TournamentJoin from '../pages/TournamentJoin';
import LeagueRequests from '../components/Dashboard/VenueOwnerDashboard/LeagueRequests';
import TournamentVenueRequests from '../components/Dashboard/VenueOwnerDashboard/TournamentVenueRequests';
import Rankings from '../pages/Rankings';
import MyTables from '../components/Dashboard/VenueOwnerDashboard/MyTables';
import SlotAvailability from '../components/Dashboard/VenueOwnerDashboard/SlotAvailability';
import AllBookings from '../components/Dashboard/VenueOwnerDashboard/AllBookings';
import VenueOwnerMyBookings from '../components/Dashboard/VenueOwnerDashboard/MyBookings';
import NewBooking from '../components/Dashboard/VenueOwnerDashboard/NewBooking';

// Admin pages
import AdminDashboard from '../pages/admin/Dashboard';
import AdminOrganizations from '../pages/admin/Organizations';
import AdminPlayers from '../pages/admin/Players';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Layout><LandingPage /></Layout>} />
      <Route path="/login" element={<Login />} />
      <Route path="/register/player" element={<RegisterPlayer />} />
      <Route path="/register/organization" element={<RegisterOrganization />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/verify-club-email" element={<VerifyClubEmail />} />
      <Route path="/venue-owner/accept-invitation" element={<AcceptInvitation />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/club/join/:token" element={<JoinClub />} />
      <Route path="/tournament/join/:tournamentId" element={<TournamentJoin />} />
      <Route path="/join" element={<JoinLeaguePage />} />
      <Route path="/league/join/:token" element={<JoinLeaguePage />} />
      <Route path="/rankings" element={<Rankings />} />

      {/* Player routes */}
      <Route
        path="/player"
        element={
          <ProtectedRoute allowedRoles={['player']}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<PlayerDashboard />} />
        <Route
          path="profile"
          element={
            <EmailVerifiedRoute>
              <PlayerProfile />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <EmailVerifiedRoute>
              <Settings />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="uploadscore"
          element={
            <EmailVerifiedRoute>
              <UploadScore />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="matchlisting"
          element={
            <EmailVerifiedRoute>
              <MatchListing />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="bookingtable"
          element={
            <EmailVerifiedRoute>
              <BookingTable />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="mybookings"
          element={
            <EmailVerifiedRoute>
              <MyBookings />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="results"
          element={
            <EmailVerifiedRoute>
              <PlayerResults />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="rankings"
          element={
            <EmailVerifiedRoute>
              <PlayerRankings />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="clubs"
          element={
            <EmailVerifiedRoute>
              <PlayerClubs />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="leagues"
          element={
            <EmailVerifiedRoute>
              <Leagues />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="tournaments"
          element={
            <EmailVerifiedRoute>
              <AllTournaments />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="browse-tournaments"
          element={
            <EmailVerifiedRoute>
              <BrowseTournaments />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="my-tournaments"
          element={
            <EmailVerifiedRoute>
              <MyTournaments />
            </EmailVerifiedRoute>
          }
        />
        {/* COMMENTED OUT: Tournament Matches Page
        <Route
          path="tournament-matches"
          element={
            <EmailVerifiedRoute>
              <PlayerTournamentMatches />
            </EmailVerifiedRoute>
          }
        />
        */}
        <Route
          path="tournament/:tournamentId/register"
          element={
            <EmailVerifiedRoute>
              <TournamentRegister />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="tournament/:tournamentId/bracket"
          element={
            <EmailVerifiedRoute>
              <TournamentBracket />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="tournament/:tournamentId/results"
          element={
            <EmailVerifiedRoute>
              <TournamentResults />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="tournament/:tournamentId/history"
          element={
            <EmailVerifiedRoute>
              <TournamentMatchHistory />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="tournament/:tournamentId/details"
          element={
            <EmailVerifiedRoute>
              <DetailsRedirect />
            </EmailVerifiedRoute>
          }
        />
      </Route>

      {/* Organization routes */}
      <Route
        path="/organization"
        element={
          <ProtectedRoute allowedRoles={['organization']}>
            <OrgDashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<OrganizationDashboard />} />
        <Route
          path="tournaments/:tournamentId/settings"
          element={
            <EmailVerifiedRoute>
              <TournamentSettings />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="tournaments/:tournamentId"
          element={
            <EmailVerifiedRoute>
              <TournamentDetailsPage />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="tournaments"
          element={
            <EmailVerifiedRoute>
              <Tournaments />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="venue-owners"
          element={
            <EmailVerifiedRoute>
              <VenueOwners />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <EmailVerifiedRoute>
              <Profile />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="seasons"
          element={
            <EmailVerifiedRoute>
              <SeasonManagement />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="leaguemanagement"
          element={
            <EmailVerifiedRoute>
              <LeagueManagement />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <EmailVerifiedRoute>
              <Settings />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="disputedmatches"
          element={
            <EmailVerifiedRoute>
              <DisputedMatches />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="playermanagement"
          element={
            <EmailVerifiedRoute>
              <PlayerManagement />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="leaguematchmanagement"
          element={
            <EmailVerifiedRoute>
              <LeagueMatchManagement />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="tournamentmatchmanagement"
          element={
            <EmailVerifiedRoute>
              <TournamentMatchManagement />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="leaguestats"
          element={
            <EmailVerifiedRoute>
              <LeagueStats />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="clubmanagement"
          element={
            <EmailVerifiedRoute>
              <ClubManagement />
            </EmailVerifiedRoute>
          }
        />
        <Route
          path="clubmanagement/:clubId"
          element={
            <EmailVerifiedRoute>
              <ClubDetailView />
            </EmailVerifiedRoute>
          }
        />
      </Route>

      {/* Venue Owner routes (protected) */}
      <Route
        path="/venue-owner"
        element={
          <ProtectedRoute allowedRoles={['venue_owner']}>
            <VenueOwnerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/venue-owner/dashboard" replace />} />
        <Route path="dashboard" element={<VenueOwnerDashboard />} />
        <Route path="my-tables" element={<MyTables />} />
        <Route path="slot-availability" element={<SlotAvailability />} />
        <Route path="all-bookings" element={<AllBookings />} />
        <Route path="my-bookings" element={<VenueOwnerMyBookings />} />
        <Route path="new-booking" element={<NewBooking />} />
        <Route path="profile" element={<VenueOwnerProfile />} />
        <Route path="league-requests" element={<LeagueRequests />} />
        <Route path="tournamant-request" element={<TournamentVenueRequests />} />
        <Route path="tournament-request" element={<TournamentVenueRequests />} />
        <Route path="accept-invitation" element={<AcceptInvitation />} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRoles={['super_admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/organizations"
        element={
          <ProtectedRoute allowedRoles={['super_admin']}>
            <EmailVerifiedRoute>
              <AdminOrganizations />
            </EmailVerifiedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/players"
        element={
          <ProtectedRoute allowedRoles={['super_admin']}>
            <EmailVerifiedRoute>
              <AdminPlayers />
            </EmailVerifiedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRoles={['super_admin']}>
            <EmailVerifiedRoute>
              <Settings />
            </EmailVerifiedRoute>
          </ProtectedRoute>
        }
      />

      {/* Unauthorized page */}
      <Route
        path="/unauthorized"
        element={
          <Layout>
            <div className="min-h-[80vh] flex items-center justify-center bg-[#FFFBF4]">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-[#132F45] mb-4">403</h1>
                <p className="text-[#132F45]">You don't have permission to access this page.</p>
              </div>
            </div>
          </Layout>
        }
      />

      {/* Fallback route */}
      <Route
        path="*"
        element={
          <Layout>
            <div className="min-h-[80vh] flex items-center justify-center bg-[#FFFBF4]">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-[#132F45] mb-4">404</h1>
                <p className="text-[#132F45]">Page not found</p>
              </div>
            </div>
          </Layout>
        }
      />
    </Routes>
  );
}