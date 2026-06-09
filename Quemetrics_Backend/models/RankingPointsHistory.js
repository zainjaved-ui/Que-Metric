// models/RankingPointsHistory.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const RankingPointsHistory = sequelize.define(
  "RankingPointsHistory",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    playerId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Player who earned points",
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Tournament where points were earned",
    },
    seasonId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Season this ranking event belongs to",
    },
    sport: {
      type: DataTypes.ENUM("snooker", "pool", "pooker"),
      allowNull: true,
      comment: "Sport-specific independent ranking stream",
    },
    tier: {
      type: DataTypes.ENUM("local", "county", "regional", "national", "international"),
      allowNull: false,
      comment: "Which tier this tournament is",
    },
    eventType: {
      type: DataTypes.ENUM("award", "override"),
      allowNull: false,
      defaultValue: "award",
      comment: "Log event type: tournament award or admin override",
    },
    dedupeKey: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      comment: "Idempotency key to prevent duplicate ranking log writes",
    },
    pointsAwarded: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Original points awarded",
    },
    pointsAdjustment: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: "Admin adjustments",
    },
    currentPoints: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Current active points (accounts for decay)",
    },
    // Decay Tracking
    decayPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: "Percentage of points decayed (0-100)",
    },
    decayAppliedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When decay was applied",
    },
    decaySchedule: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Decay timeline: {"months_1_6": 100, "months_7_9": 75, "months_10_11": 50}',
    },
    // Validity Tracking
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Is this point grant still active (not voided)",
    },
    voidDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "If voided, when was it",
    },
    voidReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Why points were voided",
    },
    voidedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Admin who voided points",
    },
    // Expiry
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When points expire from rolling 12-month window",
    },
    // Finishing Position
    finishingPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Final placement (1st, 2nd, etc.)",
    },
    finishingRound: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Final round reached",
    },
    roundReached: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Round reached in tournament for this ranking event",
    },
    stageReached: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Stage reached (Winner, Runner-Up, Semi-Final, Quarter-Final, Last16, Last32)",
    },
    thresholdWeightPercentage: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
      comment: "Points weight percentage if below minimum threshold (100 = full, 50 = half)",
    },
    overrideBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Super admin who created override",
    },
    overrideReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Reason for override",
    },
    isOfficialTournament: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Snapshot of tournament official state at award time",
    },
  },
  {
    tableName: "ranking_points_history",
    timestamps: true,
    indexes: [
      { fields: ["playerId"] },
      { fields: ["tournamentId"] },
      { fields: ["seasonId"] },
      { fields: ["sport"] },
      { fields: ["tier"] },
      { fields: ["eventType"] },
      { fields: ["isActive"] },
      { fields: ["expiresAt"] },
      { unique: true, fields: ["dedupeKey"] },
    ],
  }
);

module.exports = RankingPointsHistory;
