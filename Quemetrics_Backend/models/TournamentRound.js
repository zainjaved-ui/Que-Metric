// models/TournamentRound.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TournamentRound = sequelize.define(
  "TournamentRound",
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
    roundNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Sequential round number",
    },
    roundType: {
      type: DataTypes.ENUM("group_stage", "knockout_round", "swiss_round", "playoff", "preliminary"),
      allowNull: false,
      comment: "Type of round",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "e.g., 'Round of 16', 'Semi-Finals', 'Group Stage'",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Additional details about the round",
    },
    // Timing
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When round starts",
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When round ends",
    },
    deadline: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Deadline for all matches in this round",
    },
    // Round Status
    status: {
      type: DataTypes.ENUM("not_started", "in_progress", "completed", "postponed", "cancelled"),
      allowNull: false,
      defaultValue: "not_started",
      comment: "Current status",
    },
    // Participation
    totalMatches: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total matches scheduled for this round",
    },
    completedMatches: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of completed matches",
    },
    playersInRound: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of participant IDs in this round",
    },
    // For Swiss: pairing algorithm details
    swissPairingAlgorithm: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "e.g., 'dutch_system', 'accelerated_pairings'",
    },
  },
  {
    tableName: "tournament_rounds",
    timestamps: true,
    indexes: [
      { fields: ["tournamentId"] },
      { fields: ["roundNumber"] },
      { fields: ["status"] },
    ],
  }
);

module.exports = TournamentRound;
