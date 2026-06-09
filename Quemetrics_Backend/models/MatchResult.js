// models/MatchResult.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const MatchResult = sequelize.define(
  "MatchResult",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      comment: "Reference to the booking this result belongs to",
    },
    fixtureId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Reference to the fixture if this match is part of a league/tournament structure",
    },
    leagueId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "League reference if match type is league",
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Tournament reference if match type is tournament",
    },
    matchType: {
      type: DataTypes.ENUM("league", "tournament"),
      allowNull: false,
      comment: "Type of match - league or tournament",
    },
    sport: {
      type: DataTypes.ENUM("snooker", "pool", "pooker"),
      allowNull: false,
      comment: "Sport type",
    },
    submittedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Player ID who submitted the result",
    },
    player1Id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "First player/participant ID",
    },
    player2Id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Second player/participant ID",
    },
    // Snooker Results
    player1Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Snooker: Total frames won by player 1",
    },
    player2Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Snooker: Total frames won by player 2",
    },
    snookerFrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Snooker: Frame-by-frame scores with breaks",
    },
    highestBreak: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: "Snooker/Pooker: Highest break achieved in the match",
    },
    breaks50Plus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: "Snooker: Count of breaks 50 or more",
    },
    breaks100Plus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: "Snooker: Count of century breaks",
    },
    // Pool Results
    player1RackWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Pool: Racks won by player 1",
    },
    player2RackWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Pool: Racks won by player 2",
    },
    poolRackDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Pool: Rack-by-rack details",
    },
    player1BallsPotted: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    player2BallsPotted: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    player1SevenBallWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    player2SevenBallWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    player1BlackFinishes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    player2BlackFinishes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    player1WhitewashWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    player2WhitewashWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    // Poker Results (Card Game)
    pokerResults: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Poker: Tournament position, chips, eliminations, etc.",
    },
    // Pooker Results (Cue Sport)
    pookerFrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Pooker: Frame-by-frame scores with black finishes",
    },
    // General result fields
    winnerId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Winner of the match",
    },
    resultStatus: {
      type: DataTypes.ENUM("Pending", "Awaiting Admin Approval", "Confirmed", "Disputed", "Rejected"),
      allowNull: false,
      defaultValue: "Pending",
      comment: "Status of the result - Pending until opponent confirms, then Awaiting Admin Approval if required, then Confirmed or Rejected",
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      comment: "When the result was submitted",
    },
    confirmedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Player ID who confirmed the result (should be the opponent)",
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the result was confirmed by opponent",
    },
    adminApprovedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Organization/Admin ID who approved the result",
    },
    adminApprovedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the result was approved by admin",
    },
    disputeReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Reason if result is disputed",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Additional notes about the match",
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "CloudinaryURL of the match result image/proof",
    },
    isWalkover: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: "Whether this match result is a walkover (no score played)",
    },
    walkoverReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Reason for the walkover (e.g., 'opponent absent', 'injury')",
    },
    rejectedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Organization/Admin ID who rejected the walkover",
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the walkover was rejected",
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Reason admin gave for rejecting the walkover",
    },
    tieBreakWinnerId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Player ID who won the tie-break (if scores were equal)",
    },
    tieBreakMethod: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Method used for tie-break (e.g., 'respotted_black', 'most_points')",
    },
  },
  {
    tableName: "match_results",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["bookingId"],
      },
      {
        fields: ["resultStatus"],
      },
      {
        fields: ["leagueId"],
      },
      {
        fields: ["tournamentId"],
      },
      {
        fields: ["leagueId", "isWalkover", "resultStatus"],
      },
    ],
  }
);

module.exports = MatchResult;
