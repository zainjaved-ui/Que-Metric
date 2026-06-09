// models/Fixture.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Fixture = sequelize.define(
  "Fixture",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    leagueId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Which league this fixture belongs to",
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Which tournament this fixture belongs to",
    },
    divisionId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Division (null for Poker)",
    },
    player1Id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "First player/participant",
    },
    player2Id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Second player (null for bye or Poker)",
    },
    round: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Round number (for knockout/round-robin)",
    },
    matchNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Match sequence number",
    },
    scheduledDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Actual date/time the match was played"
    },
    // Snooker Results
    player1Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Snooker: Frames won by player 1",
    },
    player2Frames: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Snooker: Frames won by player 2",
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
    // General result
    winnerId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Winner of the match",
    },
    loserId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Loser of the match",
    },
    status: {
      type: DataTypes.ENUM("scheduled", "in_progress", "completed", "cancelled", "bye"),
      allowNull: false,
      defaultValue: "scheduled",
    },
    stage: {
      type: DataTypes.ENUM("group", "knockout", "swiss"),
      allowNull: true,
      comment: "Tournament stage (for leagues with multiple formats)",
    },
    matchIndex: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Match index within a round (for organizing fixtures in rounds)",
    },
    resultData: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Additional result details (frame-by-frame, rack-by-rack, etc.)",
    },
  },
  {
    tableName: "fixtures",
    timestamps: true,
    indexes: [
      { fields: ["leagueId"] },
      { fields: ["tournamentId"] },
      { fields: ["divisionId"] },
      { fields: ["player1Id"] },
      { fields: ["player2Id"] },
      { fields: ["round"] },
      { fields: ["status"] },
    ],
  }
);

module.exports = Fixture;
