// models/DisputedMatch.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const DisputedMatch = sequelize.define(
  "DisputedMatch",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    matchResultId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: "Reference to the disputed match result",
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Reference to booking (null for tournament matches)",
    },
    fixtureId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    leagueId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    matchType: {
      type: DataTypes.ENUM("league", "tournament"),
      allowNull: false,
    },
    sport: {
      type: DataTypes.ENUM("snooker", "pool", "pooker"),
      allowNull: false,
    },
    // Players involved
    submitterId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Player who submitted the original result",
    },
    opponentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Player who disputed the result",
    },
    // Original submitted data
    originalWinnerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    player1Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    player2Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    snookerFrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    player1RackWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    player2RackWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    poolRackDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    pokerResults: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    highestBreak: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
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
    pookerFrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "Evidence image URL",
    },
    // Opponent's claimed data (during dispute)
    claimedWinnerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    claimedPlayer1Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    claimedPlayer2Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    claimedSnookerFrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    claimedPlayer1RackWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    claimedPlayer2RackWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    claimedPoolRackDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    claimedPookerFrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    claimedHighestBreak: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    claimedPlayer1BallsPotted: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    claimedPlayer2BallsPotted: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    claimedPlayer1SevenBallWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    claimedPlayer2SevenBallWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    claimedPlayer1BlackFinishes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    claimedPlayer2BlackFinishes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    claimedPlayer1WhitewashWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    claimedPlayer2WhitewashWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    // Dispute information
    disputeReason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    disputeStatus: {
      type: DataTypes.ENUM("under_review", "resolved", "rejected"),
      allowNull: false,
      defaultValue: "under_review",
    },
    disputedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    // Resolution information
    resolvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Organization admin who resolved the dispute",
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Final resolved data (after admin review)
    finalWinnerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    finalPlayer1Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    finalPlayer2Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    finalSnookerFrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    finalPlayer1RackWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    finalPlayer2RackWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    finalPoolRackDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    finalPokerResults: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    finalPookerFrameDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    finalHighestBreak: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    finalPlayer1BallsPotted: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    finalPlayer2BallsPotted: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    finalPlayer1SevenBallWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    finalPlayer2SevenBallWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    finalPlayer1BlackFinishes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    finalPlayer2BlackFinishes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    finalPlayer1WhitewashWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    finalPlayer2WhitewashWins: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
  },
  {
    tableName: "disputed_matches",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["matchResultId"],
      },
      {
        fields: ["leagueId"],
      },
      {
        fields: ["tournamentId"],
      },
      {
        fields: ["disputeStatus"],
      },
      {
        fields: ["sport"],
      },
      {
        fields: ["matchType"],
      },
    ],
  }
);

module.exports = DisputedMatch;
