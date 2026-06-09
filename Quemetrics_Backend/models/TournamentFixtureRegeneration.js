// models/TournamentFixtureRegeneration.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TournamentFixtureRegeneration = sequelize.define(
  "TournamentFixtureRegeneration",
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
    generationRound: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Which regeneration this was (1st, 2nd, 3rd...)",
    },
    strategy: {
      type: DataTypes.ENUM("regenerate", "fill_bye", "qualifier", "waitlist"),
      allowNull: false,
      comment: "Which strategy was used for late entry",
    },
    oldMatchCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "How many matches existed before regeneration",
    },
    newMatchCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "How many matches created after regeneration",
    },
    oldParticipantCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "How many players before adding late entries",
    },
    newParticipantCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "How many players after adding late entries",
    },
    newPlayerIds: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of participant IDs added in this regeneration",
    },
    deletedMatchIds: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of old match IDs that were deleted",
    },
    deletedRoundIds: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of old round IDs that were deleted",
    },
    createdMatches: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of newly created match IDs",
    },
    createdRounds: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Array of newly created round IDs",
    },
    triggeredBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "User ID who triggered the regeneration",
    },
    triggeredByRole: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Role of user who triggered (admin, organizer, etc.)",
    },
    reseedStrategy: {
      type: DataTypes.ENUM("random", "ranked", "prioritize_existing"),
      allowNull: true,
      comment: "How players were re-seeded during regeneration",
    },
    affectedPlayerCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "How many existing players got new opponents (bracket changed)",
    },
    status: {
      type: DataTypes.ENUM("success", "failed", "rolled_back"),
      defaultValue: "success",
      comment: "Outcome of regeneration",
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "If failed, what was the error",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Additional context about the regeneration",
    },
  },
  {
    tableName: "tournament_fixture_regenerations",
    timestamps: true,
    indexes: [
      { fields: ["tournamentId"] },
      { fields: ["tournamentId", "generationRound"] },
      { fields: ["createdAt"] },
    ],
  }
);

module.exports = TournamentFixtureRegeneration;
