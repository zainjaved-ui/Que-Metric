const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

/**
 * TournamentGroup Model
 * Tracks group assignments for group-based tournaments (group stage, groups_knockout format)
 * Associates players with their assigned groups
 */
const TournamentGroup = sequelize.define(
  "TournamentGroup",
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
    groupNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Group number (1, 2, 3, 4...)",
    },
    groupName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Display name for group (e.g., 'Group A', 'Pool 1')",
    },
    // Group Composition
    playerIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: "Array of player IDs in this group",
    },
    totalPlayers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Number of players in group",
    },
    currentRound: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: "Active group-stage round for this group (independent progression)",
    },
    // Group Status
    status: {
      type: DataTypes.ENUM("not_started", "in_progress", "completed"),
      defaultValue: "not_started",
      comment: "Group stage status",
    },
    // Qualification Tracking
    qualifiedPlayerIds: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Array of player IDs that qualified from this group to next stage",
    },
    totalQualified: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number of players qualified from this group",
    },
  },
  {
    tableName: "tournament_groups",
    timestamps: true,
    indexes: [
      { fields: ["tournamentId", "groupNumber"], unique: true },
      { fields: ["tournamentId"] },
    ],
  }
);

module.exports = TournamentGroup;
