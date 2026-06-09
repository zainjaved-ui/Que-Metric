// models/index.js
const User = require("./User");
const SuperAdmin = require("./SuperAdmin");
const VenueOwner = require("./VenueOwner");
const Organization = require("./Organization");
const Player = require("./Player");
const Club = require("./Club");
const ClubMember = require("./ClubMember");
const ClubAnnouncement = require("./ClubAnnouncement");
const ClubVenue = require("./ClubVenue");
const League = require("./League");
const Division = require("./Division");
const LeaguePlayer = require("./LeaguePlayer");
const Fixture = require("./Fixture");
const PokerTournamentStructure = require("./PokerTournamentStructure");
const Season = require("./Season");
const Tournament = require("./Tournament");
const AuditLog = require("./AuditLog");
const Game = require("./Game");
const Booking = require("./Booking");
const MatchResult = require("./MatchResult");
const Notification = require("./Notification");
const DisputedMatch = require("./DisputedMatch");
const EmailVerification = require("./EmailVerification");
const ClubEmailVerification = require("./ClubEmailVerification");
const NameChangeHistory = require("./NameChangeHistory");
const VenueApprovalRequest = require("./VenueApprovalRequest");
const LeagueVenueRequest = require("./LeagueVenueRequest");
const VenueRequest = require("./VenueRequest");

// Tournament System Models
const TournamentFormat = require("./TournamentFormat");
const TournamentScoringRules = require("./TournamentScoringRules");
const TournamentParticipant = require("./TournamentParticipant");
const TournamentMatch = require("./TournamentMatch");
const TournamentRound = require("./TournamentRound");
const TournamentGroup = require("./TournamentGroup");
const TournamentInvitation = require("./TournamentInvitation");
const TournamentFixtureRegeneration = require("./TournamentFixtureRegeneration");
const PlayerRankingProfile = require("./PlayerRankingProfile");
const RankingPointsHistory = require("./RankingPointsHistory");
const SeasonRankingSnapshot = require("./SeasonRankingSnapshot");
const CompetitionTeam = require("./CompetitionTeam");

// User → Profiles (One-to-One)
User.hasOne(SuperAdmin, { foreignKey: "userId", onDelete: "CASCADE", indexes: false });
SuperAdmin.belongsTo(User, { foreignKey: "userId" });

User.hasOne(VenueOwner, { foreignKey: "userId", onDelete: "CASCADE", indexes: false });
VenueOwner.belongsTo(User, { foreignKey: "userId" });

User.hasOne(Organization, { foreignKey: "userId", onDelete: "CASCADE", indexes: false });
Organization.belongsTo(User, { foreignKey: "userId" });

User.hasOne(Player, { foreignKey: "userId", as: "playerProfile", onDelete: "CASCADE", indexes: false });
Player.belongsTo(User, { foreignKey: "userId", as: "user" });

// User → EmailVerification (One-to-Many)
User.hasMany(EmailVerification, { foreignKey: "userId", as: "emailVerifications", indexes: false });
EmailVerification.belongsTo(User, { foreignKey: "userId", as: "user" });

// Player → NameChangeHistory (One-to-Many)
Player.hasMany(NameChangeHistory, { foreignKey: "playerId", as: "nameChanges" });
NameChangeHistory.belongsTo(Player, { foreignKey: "playerId", as: "player" });

// Organization → VenueOwners (One-to-Many)
Organization.hasMany(VenueOwner, { foreignKey: "organizationId", as: "venueOwners" });
VenueOwner.belongsTo(Organization, { foreignKey: "organizationId", as: "organization" });

// Organization → VenueApprovalRequests (One-to-Many)
Organization.hasMany(VenueApprovalRequest, { foreignKey: "organizationId", as: "venueApprovalRequests" });
VenueApprovalRequest.belongsTo(Organization, { foreignKey: "organizationId", as: "requestingOrganization" });

// VenueOwner → VenueApprovalRequests (One-to-Many)
VenueOwner.hasMany(VenueApprovalRequest, { foreignKey: "venueOwnerId", as: "approvalRequests" });
VenueApprovalRequest.belongsTo(VenueOwner, { foreignKey: "venueOwnerId", as: "venue" });

// LeagueVenueRequests
Organization.hasMany(LeagueVenueRequest, { foreignKey: "organizationId", as: "leagueVenueRequests" });
LeagueVenueRequest.belongsTo(Organization, { foreignKey: "organizationId", as: "organization" });

VenueOwner.hasMany(LeagueVenueRequest, { foreignKey: "venueOwnerId", as: "leagueVenueRequests" });
LeagueVenueRequest.belongsTo(VenueOwner, { foreignKey: "venueOwnerId", as: "venueOwner" });

League.hasMany(LeagueVenueRequest, { foreignKey: "leagueId", as: "venueRequests", onDelete: "CASCADE" });
LeagueVenueRequest.belongsTo(League, { foreignKey: "leagueId", as: "league" });

// Organization → Players (One-to-Many)
// NOTE: organizationId is kept as a UUID field but no foreign key constraint
// Player can reference an organization, but constraint not enforced at DB level
Organization.hasMany(Player, { foreignKey: "organizationId", as: "players", constraints: false });
Player.belongsTo(Organization, { foreignKey: "organizationId", as: "organization", constraints: false });

// Organization → Clubs (One-to-Many)
Organization.hasMany(Club, { foreignKey: "organizationId", as: "clubs" });
Club.belongsTo(Organization, { foreignKey: "organizationId", as: "organization", constraints: false });

// Club → ClubMembers (One-to-Many)
Club.hasMany(ClubMember, { foreignKey: "clubId", as: "members" });
ClubMember.belongsTo(Club, { foreignKey: "clubId", as: "club" });

// User → ClubMembers (One-to-Many) - A user can be member of multiple clubs
User.hasMany(ClubMember, { foreignKey: "userId", as: "clubMemberships", indexes: false });
ClubMember.belongsTo(User, { foreignKey: "userId", as: "user" });

// Player → ClubMembers (One-to-Many)
Player.hasMany(ClubMember, { foreignKey: "playerId", as: "clubMemberships" });
ClubMember.belongsTo(Player, { foreignKey: "playerId", as: "player" });

// Club → ClubAnnouncements (One-to-Many)
Club.hasMany(ClubAnnouncement, { foreignKey: "clubId", as: "announcements" });
ClubAnnouncement.belongsTo(Club, { foreignKey: "clubId", as: "club" });

// User → ClubAnnouncements (One-to-Many) - Author
User.hasMany(ClubAnnouncement, { foreignKey: "authorId", as: "clubAnnouncements", indexes: false });
ClubAnnouncement.belongsTo(User, { foreignKey: "authorId", as: "author" });

// Club → ClubVenues (One-to-Many)
Club.hasMany(ClubVenue, { foreignKey: "clubId", as: "linkedVenues" });
ClubVenue.belongsTo(Club, { foreignKey: "clubId", as: "club" });

// VenueOwner → ClubVenues (One-to-Many)
VenueOwner.hasMany(ClubVenue, { foreignKey: "venueOwnerId", as: "clubLinks" });
ClubVenue.belongsTo(VenueOwner, { foreignKey: "venueOwnerId", as: "venue" });

// User → Club (created by)
User.hasMany(Club, { foreignKey: "createdBy", as: "createdClubs", indexes: false });
Club.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

// Club → Players (One-to-Many) - Players can belong to a club
// Note: Club membership is now managed through ClubMember join table
// This relationship is disabled (constraints: false) as clubId column is deprecated
Club.hasMany(Player, { foreignKey: "clubId", as: "players", constraints: false });
Player.belongsTo(Club, { foreignKey: "clubId", as: "club", constraints: false });

// Club → ClubEmailVerification (One-to-Many) - Email verification tokens
Club.hasMany(ClubEmailVerification, { foreignKey: "clubId", as: "emailVerifications" });
ClubEmailVerification.belongsTo(Club, { foreignKey: "clubId", as: "club" });

// Organization → Leagues (One-to-Many)
Organization.hasMany(League, { foreignKey: "organizationId", as: "leagues" });
League.belongsTo(Organization, { foreignKey: "organizationId", as: "organization" });

// Organization → Seasons (One-to-Many)
Organization.hasMany(Season, { foreignKey: "organizationId", as: "seasons" });
Season.belongsTo(Organization, { foreignKey: "organizationId", as: "organization" });

// Game → Seasons (One-to-Many)
Game.hasMany(Season, { foreignKey: "gameId", as: "seasons" });
Season.belongsTo(Game, { foreignKey: "gameId", as: "game" });

// Season → Leagues (One-to-Many)
Season.hasMany(League, { foreignKey: "seasonId", as: "leagues" });
League.belongsTo(Season, { foreignKey: "seasonId", as: "season" });

// VenueOwner → Leagues (One-to-Many)
VenueOwner.hasMany(League, { foreignKey: "venueOwnerId", as: "leagues" });
League.belongsTo(VenueOwner, { foreignKey: "venueOwnerId", as: "venueOwner" });

// VenueRequest (tournament-specific venue approval)
Organization.hasMany(VenueRequest, { foreignKey: "requesterOrganizerId", as: "venueRequests" });
VenueRequest.belongsTo(Organization, { foreignKey: "requesterOrganizerId", as: "requestingOrganization" });

VenueOwner.hasMany(VenueRequest, { foreignKey: "venueOwnerId", as: "incomingTournamentVenueRequests" });
VenueRequest.belongsTo(VenueOwner, { foreignKey: "venueOwnerId", as: "venueOwner" });

Tournament.hasMany(VenueRequest, { foreignKey: "tournamentId", as: "venueRequests", onDelete: "CASCADE" });
VenueRequest.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });

// LeagueVenueRequest → Leagues (One-to-Many)
LeagueVenueRequest.hasMany(League, { foreignKey: "venueApprovalRequestId", as: "leagues" });
League.belongsTo(LeagueVenueRequest, { foreignKey: "venueApprovalRequestId", as: "venueApproval" });

// League → Divisions (One-to-Many)
League.hasMany(Division, { foreignKey: "leagueId", as: "divisions", onDelete: "CASCADE" });
Division.belongsTo(League, { foreignKey: "leagueId", as: "league" });

// League → LeaguePlayers (One-to-Many)
League.hasMany(LeaguePlayer, { foreignKey: "leagueId", as: "leaguePlayers", onDelete: "CASCADE" });
LeaguePlayer.belongsTo(League, { foreignKey: "leagueId", as: "league" });

// Division → LeaguePlayers (One-to-Many)
Division.hasMany(LeaguePlayer, { foreignKey: "divisionId", as: "players" });
LeaguePlayer.belongsTo(Division, { foreignKey: "divisionId", as: "division" });

// Player → LeaguePlayers (One-to-Many)
Player.hasMany(LeaguePlayer, { foreignKey: "playerId", as: "leaguePlayers" });
LeaguePlayer.belongsTo(Player, { foreignKey: "playerId", as: "player" });

// Tournament → Participants (LeaguePlayer used for tournament too)
// Tournament.hasMany(LeaguePlayer, { foreignKey: "tournamentId", as: "participants" });
// LeaguePlayer.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });
// Change this one (around line 351) - using LeaguePlayer
Tournament.hasMany(LeaguePlayer, { foreignKey: "tournamentId", as: "leagueParticipants" }); // Changed alias
LeaguePlayer.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });

// CompetitionTeam associations
CompetitionTeam.belongsTo(Player, { foreignKey: "player1Id", as: "player1" });
CompetitionTeam.belongsTo(Player, { foreignKey: "player2Id", as: "player2" });
Player.hasMany(CompetitionTeam, { foreignKey: "player1Id", as: "teamsAsPlayer1" });
Player.hasMany(CompetitionTeam, { foreignKey: "player2Id", as: "teamsAsPlayer2" });

League.hasMany(CompetitionTeam, { foreignKey: "competitionId", as: "doublesTeams", constraints: false, scope: { competitionType: 'league' } });
Tournament.hasMany(CompetitionTeam, { foreignKey: "competitionId", as: "doublesTeams", constraints: false, scope: { competitionType: 'tournament' } });
CompetitionTeam.belongsTo(League, { foreignKey: "competitionId", as: "league", constraints: false });
CompetitionTeam.belongsTo(Tournament, { foreignKey: "competitionId", as: "tournament", constraints: false });

// League → Fixtures (One-to-Many)
League.hasMany(Fixture, { foreignKey: "leagueId", as: "fixtures", onDelete: "CASCADE" });
Fixture.belongsTo(League, { foreignKey: "leagueId", as: "league" });

// Division → Fixtures (One-to-Many)
Division.hasMany(Fixture, { foreignKey: "divisionId", as: "fixtures" });
Fixture.belongsTo(Division, { foreignKey: "divisionId", as: "division" });

// Tournament → Fixtures (One-to-Many)
Tournament.hasMany(Fixture, { foreignKey: "tournamentId", as: "fixtures", onDelete: "CASCADE" });
Fixture.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });

// Player → Fixtures (One-to-Many)
Player.hasMany(Fixture, { foreignKey: "player1Id", as: "homeFixtures" });
Player.hasMany(Fixture, { foreignKey: "player2Id", as: "awayFixtures" });
Player.hasMany(Fixture, { foreignKey: "winnerId", as: "wonFixtures" });
Player.hasMany(Fixture, { foreignKey: "loserId", as: "lostFixtures" });
Fixture.belongsTo(Player, { foreignKey: "player1Id", as: "player1" });
Fixture.belongsTo(Player, { foreignKey: "player2Id", as: "player2" });
Fixture.belongsTo(Player, { foreignKey: "winnerId", as: "winner" });
Fixture.belongsTo(Player, { foreignKey: "loserId", as: "loser" });

// League → PokerTournamentStructure (Deprecated - card poker removed)
// League.hasOne(PokerTournamentStructure, { foreignKey: "leagueId", as: "pokerStructure" });
// PokerTournamentStructure.belongsTo(League, { foreignKey: "leagueId", as: "league" });

// Organization → Tournaments (One-to-Many)
Organization.hasMany(Tournament, { foreignKey: "organizationId", as: "tournaments" });
Tournament.belongsTo(Organization, { foreignKey: "organizationId", as: "organization" });

// User → AuditLogs (One-to-Many)
User.hasMany(AuditLog, { foreignKey: "userId", as: "auditLogs", indexes: false });
AuditLog.belongsTo(User, { foreignKey: "userId", as: "user" });

// Booking Relationships
// Fixture → Bookings (One-to-Many)
Fixture.hasMany(Booking, { foreignKey: "fixtureId", as: "bookings" });
Booking.belongsTo(Fixture, { foreignKey: "fixtureId", as: "fixture" });

// League → Bookings (One-to-Many)
League.hasMany(Booking, { foreignKey: "leagueId", as: "bookings", onDelete: "CASCADE" });
Booking.belongsTo(League, { foreignKey: "leagueId", as: "league" });

// Tournament → Bookings (One-to-Many)
Tournament.hasMany(Booking, { foreignKey: "tournamentId", as: "tournamentBookings", onDelete: "CASCADE" });
Booking.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });

// TournamentMatch → Bookings
TournamentMatch.hasMany(Booking, { foreignKey: "tournamentMatchId", as: "matchBookings" });
Booking.belongsTo(TournamentMatch, { foreignKey: "tournamentMatchId", as: "tournamentMatch" });

// Player → Bookings (One-to-Many)
Player.hasMany(Booking, { foreignKey: "playerId", as: "createdBookings" });
Player.hasMany(Booking, { foreignKey: "opponentId", as: "receivedBookings" });
Booking.belongsTo(Player, { foreignKey: "playerId", as: "player" });
Booking.belongsTo(Player, { foreignKey: "opponentId", as: "opponent" });

// VenueOwner → Bookings (One-to-Many)
VenueOwner.hasMany(Booking, { foreignKey: "venueOwnerId", as: "bookings" });
Booking.belongsTo(VenueOwner, { foreignKey: "venueOwnerId", as: "venue" });

// MatchResult Relationships
// Booking → MatchResult (One-to-One)
Booking.hasOne(MatchResult, { foreignKey: "bookingId", as: "matchResult" });
MatchResult.belongsTo(Booking, { foreignKey: "bookingId", as: "booking" });

// Fixture → MatchResult (One-to-One)
Fixture.hasOne(MatchResult, { foreignKey: "fixtureId", as: "matchResult" });
MatchResult.belongsTo(Fixture, { foreignKey: "fixtureId", as: "fixture" });

// League → MatchResults (One-to-Many)
League.hasMany(MatchResult, { foreignKey: "leagueId", as: "matchResults", onDelete: "CASCADE" });
MatchResult.belongsTo(League, { foreignKey: "leagueId", as: "league" });

// Tournament → MatchResults (One-to-Many)
Tournament.hasMany(MatchResult, { foreignKey: "tournamentId", as: "matchResults", onDelete: "CASCADE" });
MatchResult.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });

// Player → MatchResults (multiple associations)
Player.hasMany(MatchResult, { foreignKey: "submittedBy", as: "submittedResults" });
Player.hasMany(MatchResult, { foreignKey: "player1Id", as: "player1Results" });
Player.hasMany(MatchResult, { foreignKey: "player2Id", as: "player2Results" });
Player.hasMany(MatchResult, { foreignKey: "winnerId", as: "wonResults" });

MatchResult.belongsTo(Player, { foreignKey: "submittedBy", as: "submitter" });
MatchResult.belongsTo(Player, { foreignKey: "player1Id", as: "player1" });
MatchResult.belongsTo(Player, { foreignKey: "player2Id", as: "player2" });
MatchResult.belongsTo(Player, { foreignKey: "winnerId", as: "winner" });
MatchResult.belongsTo(Player, { foreignKey: "confirmedBy", as: "confirmer" });

// Notification Relationships
// Player → Notifications (One-to-Many)
Player.hasMany(Notification, { foreignKey: "recipientId", as: "receivedNotifications" });
Player.hasMany(Notification, { foreignKey: "senderId", as: "sentNotifications" });
Notification.belongsTo(Player, { foreignKey: "recipientId", as: "recipient" });
Notification.belongsTo(Player, { foreignKey: "senderId", as: "sender" });

// DisputedMatch Relationships
// MatchResult → DisputedMatch (One-to-One)
MatchResult.hasOne(DisputedMatch, { foreignKey: "matchResultId", as: "dispute" });
DisputedMatch.belongsTo(MatchResult, { foreignKey: "matchResultId", as: "matchResult" });

// Booking → DisputedMatches (One-to-Many)
Booking.hasMany(DisputedMatch, { foreignKey: "bookingId", as: "disputes" });
DisputedMatch.belongsTo(Booking, { foreignKey: "bookingId", as: "booking" });

// Fixture → DisputedMatches (One-to-Many)
Fixture.hasMany(DisputedMatch, { foreignKey: "fixtureId", as: "disputes" });
DisputedMatch.belongsTo(Fixture, { foreignKey: "fixtureId", as: "fixture" });

// League → DisputedMatches (One-to-Many)
League.hasMany(DisputedMatch, { foreignKey: "leagueId", as: "disputes", onDelete: "CASCADE" });
DisputedMatch.belongsTo(League, { foreignKey: "leagueId", as: "league" });

// Tournament → DisputedMatches (One-to-Many)
Tournament.hasMany(DisputedMatch, { foreignKey: "tournamentId", as: "disputes", onDelete: "CASCADE" });
DisputedMatch.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });

// Player → DisputedMatches (multiple associations)
Player.hasMany(DisputedMatch, { foreignKey: "submitterId", as: "submittedDisputes" });
Player.hasMany(DisputedMatch, { foreignKey: "opponentId", as: "opponentDisputes" });
DisputedMatch.belongsTo(Player, { foreignKey: "submitterId", as: "submitter" });
DisputedMatch.belongsTo(Player, { foreignKey: "opponentId", as: "opponent" });
DisputedMatch.belongsTo(Player, { foreignKey: "originalWinnerId", as: "originalWinner" });
DisputedMatch.belongsTo(Player, { foreignKey: "finalWinnerId", as: "finalWinner" });

// Organization → DisputedMatches (through resolved by)
Organization.hasMany(DisputedMatch, { foreignKey: "resolvedBy", as: "resolvedDisputes" });
DisputedMatch.belongsTo(Organization, { foreignKey: "resolvedBy", as: "resolver" });

// ============================================================================
// TOURNAMENT SYSTEM RELATIONSHIPS
// ============================================================================

// Tournament → TournamentFormat (One-to-One)
Tournament.hasOne(TournamentFormat, { foreignKey: "tournamentId", as: "format", onDelete: "CASCADE" });
TournamentFormat.belongsTo(Tournament, { foreignKey: "tournamentId" });

// Tournament → TournamentScoringRules (One-to-One)
Tournament.hasOne(TournamentScoringRules, { foreignKey: "tournamentId", as: "scoringRules", onDelete: "CASCADE" });
TournamentScoringRules.belongsTo(Tournament, { foreignKey: "tournamentId" });

// Tournament → TournamentGroups (One-to-Many)
Tournament.hasMany(TournamentGroup, { foreignKey: "tournamentId", as: "groups", onDelete: "CASCADE" });
TournamentGroup.belongsTo(Tournament, { foreignKey: "tournamentId" });

// Tournament → TournamentParticipants (One-to-Many)
// Alias must stay "participants" — API/controllers include this association by name.
Tournament.hasMany(TournamentParticipant, { foreignKey: "tournamentId", as: "participants", onDelete: "CASCADE" });
TournamentParticipant.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });

// Player → TournamentParticipants (One-to-Many)
Player.hasMany(TournamentParticipant, { foreignKey: "playerId", as: "tournamentParticipations" });
TournamentParticipant.belongsTo(Player, { foreignKey: "playerId", as: "player" });

// Tournament → TournamentMatches (One-to-Many)
Tournament.hasMany(TournamentMatch, { foreignKey: "tournamentId", as: "matches", onDelete: "CASCADE" });
TournamentMatch.belongsTo(Tournament, { foreignKey: "tournamentId" });

// Tournament → TournamentRounds (One-to-Many)
Tournament.hasMany(TournamentRound, { foreignKey: "tournamentId", as: "rounds", onDelete: "CASCADE" });
TournamentRound.belongsTo(Tournament, { foreignKey: "tournamentId" });

// TournamentRound → TournamentMatches (One-to-Many)
TournamentRound.hasMany(TournamentMatch, { foreignKey: "roundId", as: "matches", onDelete: "CASCADE" });
TournamentMatch.belongsTo(TournamentRound, { foreignKey: "roundId" });

// TournamentMatch → Player relationships (for both players in match)
Player.hasMany(TournamentMatch, { foreignKey: "player1Id", as: "tournamentMatches1" });
Player.hasMany(TournamentMatch, { foreignKey: "player2Id", as: "tournamentMatches2" });
TournamentMatch.belongsTo(Player, { foreignKey: "player1Id", as: "player1" });
TournamentMatch.belongsTo(Player, { foreignKey: "player2Id", as: "player2" });

// Tournament → TournamentInvitations (One-to-Many)
Tournament.hasMany(TournamentInvitation, { foreignKey: "tournamentId", as: "invitations", onDelete: "CASCADE" });
TournamentInvitation.belongsTo(Tournament, { foreignKey: "tournamentId" });

// Player → TournamentInvitations (One-to-Many)
Player.hasMany(TournamentInvitation, { foreignKey: "invitedPlayerId", as: "receivedInvitations" });
TournamentInvitation.belongsTo(Player, { foreignKey: "invitedPlayerId" });

// User → TournamentInvitations (for who sent/created the invite)
User.hasMany(TournamentInvitation, { foreignKey: "invitedByUserId", as: "sentInvitations", indexes: false });
TournamentInvitation.belongsTo(User, { foreignKey: "invitedByUserId", as: "invitedByUser" });

// Player → PlayerRankingProfile (One-to-One)
Player.hasOne(PlayerRankingProfile, { foreignKey: "playerId", as: "rankingProfile" });
PlayerRankingProfile.belongsTo(Player, { foreignKey: "playerId", as: "player" });

// Player → RankingPointsHistory (One-to-Many)
Player.hasMany(RankingPointsHistory, { foreignKey: "playerId", as: "rankingPointsHistory" });
RankingPointsHistory.belongsTo(Player, { foreignKey: "playerId" });

// Tournament → RankingPointsHistory (One-to-Many)
Tournament.hasMany(RankingPointsHistory, { foreignKey: "tournamentId", as: "rankingPointsGranted", onDelete: "CASCADE" });
RankingPointsHistory.belongsTo(Tournament, { foreignKey: "tournamentId", as: "tournament" });

// Season/Sport ranking snapshots (append-only ranking table snapshots)
Season.hasMany(SeasonRankingSnapshot, { foreignKey: "seasonId", as: "rankingSnapshots", onDelete: "CASCADE" });
SeasonRankingSnapshot.belongsTo(Season, { foreignKey: "seasonId", as: "season" });
Player.hasMany(SeasonRankingSnapshot, { foreignKey: "playerId", as: "seasonRankingSnapshots" });
SeasonRankingSnapshot.belongsTo(Player, { foreignKey: "playerId", as: "player" });

// Organization → Tournaments (One-to-Many)
Organization.hasMany(Tournament, { foreignKey: "organizationId", as: "organizerTournaments" });
Tournament.belongsTo(Organization, { foreignKey: "organizationId", as: "organizer" });

// Club → Tournaments (One-to-Many)
Club.hasMany(Tournament, { foreignKey: "clubId", as: "clubTournaments" });
Tournament.belongsTo(Club, { foreignKey: "clubId", as: "club" });

const models = {
  User,
  SuperAdmin,
  VenueOwner,
  Organization,
  Player,
  Club,
  ClubMember,
  ClubAnnouncement,
  ClubVenue,
  League,
  Division,
  LeaguePlayer,
  Fixture,
  PokerTournamentStructure,
  EmailVerification,
  ClubEmailVerification,
  NameChangeHistory,
  Season,
  Tournament,
  TournamentFormat,
  TournamentScoringRules,
  TournamentParticipant,
  TournamentMatch,
  TournamentRound,
  TournamentGroup,
  TournamentInvitation,
  TournamentFixtureRegeneration,
  PlayerRankingProfile,
  RankingPointsHistory,
  SeasonRankingSnapshot,
  AuditLog,
  Game,
  Booking,
  MatchResult,
  Notification,
  DisputedMatch,
  VenueApprovalRequest,
  LeagueVenueRequest,
  VenueRequest,
  CompetitionTeam,
};

module.exports = models;