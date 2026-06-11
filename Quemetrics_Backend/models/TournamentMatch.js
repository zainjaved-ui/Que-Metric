// models/TournamentMatch.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TournamentMatch = sequelize.define(
  "TournamentMatch",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Foreign key to Tournament",
    },
    roundId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Foreign key to TournamentRound",
    },
    // Round Information
    roundNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Round number (1, 2, 3...)",
    },
    roundType: {
      type: DataTypes.ENUM("preliminary", "group_stage", "knockout_16", "knockout_8", "knockout_4", "semi_final", "final", "playoff", "swiss", "ladder_challenge"),
      allowNull: false,
      comment: "Type of round",
    },
    isPreliminaryRound: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'isPreliminaryRound',
      comment: "True if this match is part of a preliminary/qualification round (round 0)",
    },
    // Match Details
    matchNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Match sequence number within round",
    },
    scheduledDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When match is scheduled",
    },
    scheduledTime: {
      type: DataTypes.TIME,
      allowNull: true,
      comment: "Time of day match is scheduled",
    },
    scheduledDeadline: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Deadline by which match must be played",
    },
    bookingTime: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Player-selected match time when flexible scheduling is enabled",
    },
    bookingConfirmedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Player who confirmed the booking time",
    },
    bookingConfirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the booking was confirmed",
    },
    venueId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Venue where match will be played",
    },
    isScheduled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Whether match scheduling details are complete",
    },
    playedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When match actually played",
    },
    // Players/Bracketing
    player1Id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "First player",
    },
    player2Id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Second player (NULL = bye match)",
    },
    // Bracket Position
    bracketPosition: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "e.g., 'A1', 'B2' for bracket visualization",
    },
    parentMatchId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "For knockout: which matches feed into this one",
    },
    // Match Status
    status: {
      type: DataTypes.ENUM("scheduled", "in_progress", "completed", "disputed", "voided", "walkover", "default", "postponed", "pending_confirmation", "bye"),
      allowNull: false,
      defaultValue: "scheduled",
      comment: "Current status of the match",
    },
    // Match Result
    winner: {
      type: DataTypes.ENUM("player1", "player2", "draw", "none"),
      allowNull: true,
      comment: "Who won the match",
    },
    player1FramesWon: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Frames won by player 1",
    },
    player2FramesWon: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Frames won by player 2",
    },
    player1FrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Frame-by-frame breakdown for player 1",
    },
    player2FrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Frame-by-frame breakdown for player 2",
    },
    // Scoring Modifiers
    bestOfFrames: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Per-match bestOfFrames override (null = use tournament default)",
    },
    handicap: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "e.g., 'Player1 +1 frame'",
    },
    handicapPlayer1: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Frame advantage for player 1",
    },
    handicapPlayer2: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Frame advantage for player 2",
    },
    handicapApplied: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Whether handicap was applied to this match result",
    },
    player1PointsAwarded: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Unique points awarded to player 1",
    },
    player2PointsAwarded: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Unique points awarded to player 2",
    },
    // Special Cases
    isWalkover: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "If true, opponent didn't show",
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "If true, opponent defaulted",
    },
    // Reporting & Approval
    // TODO: Uncomment field mapping after migration adds reported_by and reported_date columns
    reportedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Player/Admin who reported result",
      // field: 'reported_by',  // Column doesn't exist yet in database
    },
    reportedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When result was reported",
      // field: 'reported_date',  // Column doesn't exist yet in database
    },
    // Dual-Confirmation Tracking
    player1Confirmed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Has player1 confirmed the result",
      field: 'player1_confirmed',
    },
    player2Confirmed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Has player2 confirmed the result",
      field: 'player2_confirmed',
    },
    player1ConfirmedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When player1 confirmed",
      field: 'player1_confirmed_date',
    },
    player2ConfirmedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When player2 confirmed",
      field: 'player2_confirmed_date',
    },
    adminSubmitted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Was result submitted by admin",
      field: 'admin_submitted',
    },
    submittedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Admin who submitted result",
      field: 'submitted_by',
    },
    reportingApprovals: {
      type: DataTypes.JSON,
      defaultValue: { player1: false, player2: false },
      comment: '{"player1": true/false, "player2": true/false}',
    },
    // Dispute
    isDisputed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Is result being disputed",
    },
    disputeDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Why match is disputed",
    },
    // Admin Override
    adminOverride: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Was result overridden by admin",
    },
    overriddenBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Admin who overrode result",
    },
    overrideReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Reason for admin override",
    },
    overrideDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When override occurred",
    },
    // Group Stage
    groupNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Group number this match belongs to (for groups_knockout format)",
    },
  },
  {
    tableName: "tournament_matches",
    timestamps: true,
    indexes: [
      { fields: ["tournamentId"] },
      { fields: ["roundId"] },
      { fields: ["player1Id"] },
      { fields: ["player2Id"] },
      { fields: ["status"] },
      { fields: ["roundType"] },
    ],
  }
);

module.exports = TournamentMatch;
